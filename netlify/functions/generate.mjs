// VYBE STUDIO – AI backend (Netlify Function)
// Keeps the Groq API key secret and returns structured JSON to the browser.

const MODEL = process.env.GROQ_MODEL || "llama-3.3-70b-versatile";

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
Rules: 8-12 tasks, all dates between ${c.startDate} and ${c.endDate}; 4 image prompts that are detailed and ready to paste into an image generator; 3 captions; budgetSplit amounts must add up to ${c.budget}.
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
${JSON.stringify(c, null, 2)}`,
};

export default async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });
  if (!process.env.GROQ_API_KEY) {
    return Response.json({ error: "GROQ_API_KEY is not set in Netlify environment variables." }, { status: 500 });
  }
  try {
    const { module, data } = await req.json();
    if (!prompts[module]) return Response.json({ error: "Unknown module" }, { status: 400 });

    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: MODEL,
        temperature: 0.7,
        max_tokens: 4000,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: "You are an expert marketing strategist. You always reply with valid JSON only." },
          { role: "user", content: prompts[module](data) },
        ],
      }),
    });

    if (!res.ok) {
      const msg = res.status === 429 ? "AI is busy (rate limit). Wait one minute and try again." : await res.text();
      return Response.json({ error: msg }, { status: res.status });
    }
    const out = await res.json();
    return new Response(out.choices[0].message.content, { headers: { "Content-Type": "application/json" } });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
};
