// VYBE STUDIO – cloud save / share for campaigns (Netlify Database)
import type { Config, Context } from "@netlify/functions";
import { eq } from "drizzle-orm";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { db } from "../../db/index.js";
import { campaigns } from "../../db/schema.js";

const MAX_BYTES = 4_000_000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const sameKey = (a: string, b: string) => {
  const x = Buffer.from(a || ""), y = Buffer.from(b || "");
  return x.length === y.length && timingSafeEqual(x, y);
};

async function readBody(req: Request) {
  const raw = await req.text();
  if (raw.length > MAX_BYTES) throw new Error("Campaign is too large to save (remove the product photo and try again).");
  const body = JSON.parse(raw || "{}");
  if (!body.data || typeof body.data !== "object") throw new Error("Missing campaign data.");
  // never persist secrets or private chat inside the shared document
  const { cloud, chat, ...data } = body.data;
  return { data, editKey: String(body.editKey || "") };
}

const meta = (data: any) => ({
  name: String(data?.inputs?.campaignName || "").slice(0, 200),
  brand: String(data?.inputs?.brandName || "").slice(0, 200),
});

export default async (req: Request, context: Context) => {
  const id = context.params.id;
  try {
    if (!id && req.method === "POST") {
      const { data } = await readBody(req);
      const editKey = randomBytes(24).toString("base64url");
      const [row] = await db
        .insert(campaigns)
        .values({ editKey, data, ...meta(data) })
        .returning({ id: campaigns.id, updatedAt: campaigns.updatedAt });
      return Response.json({ id: row.id, editKey, updatedAt: row.updatedAt }, { status: 201 });
    }

    if (!id || !UUID.test(id)) return Response.json({ error: "Campaign not found." }, { status: 404 });

    if (req.method === "GET") {
      const [row] = await db
        .select({ id: campaigns.id, data: campaigns.data, updatedAt: campaigns.updatedAt })
        .from(campaigns)
        .where(eq(campaigns.id, id));
      if (!row) return Response.json({ error: "Campaign not found." }, { status: 404 });
      return Response.json(row);
    }

    if (req.method === "PUT") {
      const { data, editKey } = await readBody(req);
      const [row] = await db.select({ editKey: campaigns.editKey }).from(campaigns).where(eq(campaigns.id, id));
      if (!row) return Response.json({ error: "Campaign not found." }, { status: 404 });
      if (!sameKey(row.editKey, editKey)) return Response.json({ error: "You can't overwrite this shared campaign." }, { status: 403 });
      const updatedAt = new Date();
      await db.update(campaigns).set({ data, ...meta(data), updatedAt }).where(eq(campaigns.id, id));
      return Response.json({ id, updatedAt });
    }

    return new Response("Method not allowed", { status: 405 });
  } catch (e: any) {
    const status = e instanceof SyntaxError ? 400 : /too large|Missing/.test(e.message) ? 400 : 500;
    return Response.json({ error: status === 500 ? "Could not reach cloud storage. Try again." : e.message }, { status });
  }
};

export const config: Config = {
  path: ["/api/campaigns", "/api/campaigns/:id"],
};
