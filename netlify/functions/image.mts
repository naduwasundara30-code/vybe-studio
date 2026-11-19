// VYBE STUDIO – real AI image generation (Netlify AI Gateway + Netlify Blobs)
import type { Config } from "@netlify/functions";
import { GoogleGenAI } from "@google/genai";
import { getStore } from "@netlify/blobs";
import { randomUUID } from "node:crypto";

const MODEL = "gemini-3.1-flash-image";
const RATIOS = ["1:1", "2:3", "3:2", "3:4", "4:3", "4:5", "5:4", "9:16", "16:9", "21:9"];
const EXT: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" };

export default async (req: Request) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });
  try {
    const { prompt, aspectRatio, referenceImage, brand } = await req.json();
    const text = String(prompt || "").trim();
    if (!text) return Response.json({ error: "Write a prompt first." }, { status: 400 });
    if (text.length > 4000) return Response.json({ error: "Prompt is too long (max 4000 characters)." }, { status: 400 });

    const parts: any[] = [];
    const ref = typeof referenceImage === "string" && referenceImage.match(/^data:(image\/(?:png|jpeg|webp));base64,(.+)$/);
    if (ref) {
      parts.push({ inlineData: { mimeType: ref[1], data: ref[2] } });
      parts.push({ text: `Use the attached photo as the exact product to feature (keep its shape, colours, packaging and branding accurate).\n\n${text}` });
    } else {
      parts.push({ text });
    }
    if (brand) parts.push({ text: `Brand: ${String(brand).slice(0, 120)}. Marketing-quality, professional, no misspelled text.` });

    const ai = new GoogleGenAI({
      apiKey: process.env.NETLIFY_AI_GATEWAY_KEY,
      httpOptions: { baseUrl: process.env.NETLIFY_AI_GATEWAY_URL?.replace(/\/$/, "") },
    });
    const response = await ai.models.generateContent({
      model: MODEL,
      contents: [{ role: "user", parts }],
      config: {
        responseModalities: ["TEXT", "IMAGE"],
        imageConfig: { aspectRatio: RATIOS.includes(aspectRatio) ? aspectRatio : "1:1" },
      },
    });

    const img = response.candidates?.[0]?.content?.parts?.find((p: any) => p.inlineData?.data)?.inlineData;
    if (!img?.data) {
      return Response.json({ error: "The AI didn't return an image for this prompt. Try rewording it." }, { status: 502 });
    }
    const mime = img.mimeType && EXT[img.mimeType] ? img.mimeType : "image/png";
    const key = `${randomUUID()}.${EXT[mime]}`;
    await getStore("campaign-images").set(key, Buffer.from(img.data, "base64"));
    return Response.json({ url: `/api/images/${key}` });
  } catch (e: any) {
    const msg = String(e?.message || e);
    const status = /429|rate/i.test(msg) ? 429 : 500;
    return Response.json(
      { error: status === 429 ? "Image AI is busy right now. Wait a minute and try again." : "Image generation failed: " + msg.slice(0, 300) },
      { status },
    );
  }
};

export const config: Config = { path: "/api/image" };
