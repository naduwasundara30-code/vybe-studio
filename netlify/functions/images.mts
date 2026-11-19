// VYBE STUDIO – serves generated images stored in Netlify Blobs
import type { Config, Context } from "@netlify/functions";
import { getStore } from "@netlify/blobs";

const TYPES: Record<string, string> = { png: "image/png", jpg: "image/jpeg", webp: "image/webp" };

export default async (req: Request, context: Context) => {
  const key = context.params.key || "";
  const ext = key.match(/^[0-9a-f-]{36}\.(png|jpg|webp)$/)?.[1];
  if (!ext) return new Response("Not found", { status: 404 });
  const data = await getStore("campaign-images").get(key, { type: "arrayBuffer" });
  if (!data) return new Response("Not found", { status: 404 });
  return new Response(data, {
    headers: { "Content-Type": TYPES[ext], "Cache-Control": "public, max-age=31536000, immutable" },
  });
};

export const config: Config = { path: "/api/images/:key", method: "GET" };
