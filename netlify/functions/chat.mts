// VYBE STUDIO – AI marketing assistant chat (Netlify AI Gateway, streamed)
import type { Config } from "@netlify/functions";
import { GoogleGenAI, ThinkingLevel } from "@google/genai";

const MODEL = "gemini-3.5-flash";

const SYSTEM = `You are Vybe, the AI marketing assistant inside VYBE STUDIO, an app that helps small businesses plan and run marketing campaigns.
You are practical, encouraging and specific. Give answers a small business owner can act on today.
When writing content (captions, emails, ad copy, scripts), write the finished copy, ready to paste, matching the campaign's tone of voice.
Use short paragraphs, bullet lists and **bold** for key points. Use the campaign's currency for money.
If the question is unrelated to marketing or the business, answer briefly and steer back to helping with the campaign.`;

export default async (req: Request) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });
  let body: any;
  try { body = await req.json(); } catch { return Response.json({ error: "Invalid request" }, { status: 400 }); }

  const messages = (Array.isArray(body.messages) ? body.messages : [])
    .filter((m: any) => m && typeof m.content === "string" && m.content.trim())
    .slice(-20)
    .map((m: any) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content.slice(0, 8000) }] }));
  if (!messages.length || messages[messages.length - 1].role !== "user") {
    return Response.json({ error: "Send a message first." }, { status: 400 });
  }

  const ctx = body.campaign ? JSON.stringify(body.campaign).slice(0, 60000) : "";
  const systemInstruction = ctx
    ? `${SYSTEM}\n\nToday is ${new Date().toISOString().slice(0, 10)}. The user has this campaign open (JSON):\n${ctx}`
    : `${SYSTEM}\n\nToday is ${new Date().toISOString().slice(0, 10)}. The user has not generated a campaign yet; you can suggest they fill in the Builder tab.`;

  try {
    const ai = new GoogleGenAI({});
    const stream = await ai.models.generateContentStream({
      model: MODEL,
      contents: messages,
      config: { systemInstruction, temperature: 0.7, thinkingConfig: { thinkingLevel: ThinkingLevel.LOW } },
    });
    const enc = new TextEncoder();
    return new Response(
      new ReadableStream({
        async start(controller) {
          try {
            for await (const chunk of stream) if (chunk.text) controller.enqueue(enc.encode(chunk.text));
          } catch {
            controller.enqueue(enc.encode("\n\n_(The reply was cut off. Please try again.)_"));
          }
          controller.close();
        },
      }),
      { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-cache" } },
    );
  } catch (e: any) {
    const msg = String(e?.message || e);
    const rate = /429|rate/i.test(msg);
    return Response.json(
      { error: rate ? "The assistant is busy. Wait a minute and try again." : "The assistant is unavailable right now." },
      { status: rate ? 429 : 500 },
    );
  }
};

export const config: Config = { path: "/api/chat" };
