// VYBE STUDIO – authenticated Gemini API proxy (Netlify Function).
// Gemini credentials stay server-side. A valid Supabase access token is required.
const MODEL = process.env.GEMINI_MODEL || "gemini-3.8-flash";

const prompts = {
  campaign: (c) => `You are a senior marketing consultant for small businesses.
Create a complete marketing campaign for the business below.
Return ONLY valid JSON with exactly this structure:
{
  "summary": "2-3 sentence campaign overview",
  "analysis": {
    "fourPs": {"product": "", "price": "", "place": "", "promotion": ""},
    "targetMarket": "",
    "segmentation": {"demographic": "", "geographic": "", "psychographic": "", "behavioural": ""},
    "valueProposition": "",
    "swot": {"strengths": [""], "weaknesses": [""], "opportunities": [""], "threats": [""]},
    "salesFunnel": {"awareness": "", "interest": "", "desire": "", "action": ""},
    "leadGeneration": [""],
    "positioning": "",
    "ansoff": {"quadrant": "Market Penetration | Market Development | Product Development | Diversification", "reason": ""}
  },
  "strategy": {
    "overview": "",
    "tasks": [{"title": "", "phase": "Pre-launch | Launch | Growth | Review", "channel": "", "start": "YYYY-MM-DD", "end": "YYYY-MM-DD", "description": ""}]
  },
  "content": {
    "imagePrompts": [{"title": "", "featureShown": "", "platform": "", "size": "", "prompt": ""}],
    "captions": [""],
    "hashtags": [""]
  },
  "kpis": [{"name": "", "target": ""}],
  "budgetSplit": [{"channel": "", "amount": 0}]
}
Rules: 8-12 tasks, all dates between ${c.startDate} and ${c.endDate}; 4 detailed image prompts ready to paste into an image generator; 3 captions; budgetSplit amounts must add up to ${c.budget}.
Business and campaign details:
${JSON.stringify(c, null, 2)}`,
  insights: (c) => `You are a digital marketing analyst. Here are campaign details and performance metrics.
Return ONLY valid JSON: {"summary": "", "wins": [""], "problems": [""], "recommendations": [""]}
Give 3-5 items per list, specific and actionable for a small business.
Data:
${JSON.stringify(c, null, 2)}`,
  history: (c) => `You are a marketing advisor. Here are a small business's previous campaigns (inputs and results).
Return ONLY valid JSON: {"patterns": [""], "recommendations": [""], "nextCampaignIdea": ""}
Data:
${JSON.stringify(c, null, 2)}`
};

export default async (req) => {
  if (req.method !== "POST") return Response.json({ error: "Method not allowed" }, { status: 405 });

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY;
  const geminiKey = process.env.GEMINI_API_KEY;
  if (!supabaseUrl || !supabaseKey) {
    return Response.json({ error: "Set SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY in Netlify environment variables." }, { status: 500 });
  }
  if (!geminiKey) return Response.json({ error: "GEMINI_API_KEY is not set in Netlify environment variables." }, { status: 500 });

  const authHeader = req.headers.get("authorization") || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!token) return Response.json({ error: "Sign in is required to use AI generation." }, { status: 401 });

  try {
    const userResponse = await fetch(`${supabaseUrl.replace(/\/$/, "")}/auth/v1/user`, {
      headers: { apikey: supabaseKey, Authorization: `Bearer ${token}` }
    });
    if (!userResponse.ok) return Response.json({ error: "Your session is invalid or expired. Please sign in again." }, { status: 401 });

    const rawBody = await req.text();
    if (new TextEncoder().encode(rawBody).length > 200_000) {
      return Response.json({ error: "Request is too large. Please reduce the uploaded data and try again." }, { status: 413 });
    }
    let body;
    try { body = JSON.parse(rawBody); }
    catch { return Response.json({ error: "Request body must be valid JSON." }, { status: 400 }); }
    const { module, data } = body || {};
    if (!prompts[module]) return Response.json({ error: "Unknown module" }, { status: 400 });
    if (!data || typeof data !== "object") return Response.json({ error: "Missing campaign data" }, { status: 400 });

    const geminiResponse = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": geminiKey },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: "You are an expert marketing strategist. Return valid JSON only. Do not wrap JSON in markdown fences." }] },
        contents: [{ role: "user", parts: [{ text: prompts[module](data) }] }],
        generationConfig: {
          maxOutputTokens: 8192,
          responseMimeType: "application/json",
          thinkingConfig: { thinkingLevel: "LOW" }
        }
      })
    });

    const result = await geminiResponse.json().catch(() => ({}));
    if (!geminiResponse.ok) {
      const message = result.error?.message || "Gemini request failed.";
      const status = geminiResponse.status === 429 ? 429 : geminiResponse.status >= 500 ? 502 : geminiResponse.status;
      return Response.json({ error: message }, { status });
    }
    const text = result.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("").trim();
    if (!text) {
      const reason = result.candidates?.[0]?.finishReason;
      return Response.json({ error: reason === "MAX_TOKENS" ? "Gemini reached its output limit. Please shorten the campaign details and try again." : "Gemini returned an empty response. Please try again." }, { status: 502 });
    }
    let parsed;
    try { parsed = JSON.parse(text); }
    catch {
      const cleaned = text.replace(/^\x60\x60\x60(?:json)?\s*/i, "").replace(/\s*\x60\x60\x60$/, "");
      try { parsed = JSON.parse(cleaned); }
      catch { return Response.json({ error: "Gemini returned invalid JSON. Please try again." }, { status: 502 }); }
    }
    return Response.json(parsed);
  } catch (error) {
    return Response.json({ error: error.message || "Unexpected server error." }, { status: 500 });
  }
};
