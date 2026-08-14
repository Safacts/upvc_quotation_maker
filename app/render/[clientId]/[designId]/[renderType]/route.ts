import { NextRequest } from "next/server";
import { placeholderPng } from "@/lib/render-placeholder";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Serves the placeholder image referenced by render records.
 *
 * The POST route at `/api/console/3d/render` records URLs shaped like
 * `/render/{clientId}/{designId}/{type}.png` — but no route existed for them,
 * so every thumbnail/model image 404'd. This route makes that URL pattern real
 * by regenerating the deterministic placeholder on demand.
 *
 * Deliberately public: render URLs are persisted in the `renders` table, are
 * embedded in <img> tags in contexts that cannot attach session credentials,
 * and the payload is a generated placeholder that leaks no tenant data.
 */
export async function GET(
  _request: NextRequest,
  {
    params,
  }: {
    params: Promise<{ clientId: string; designId: string; renderType: string }>;
  },
) {
  const { clientId, designId, renderType } = await params;
  const type = renderType.replace(/\.png$/i, "").trim();
  const isFull = type === "full";
  const width = isFull ? 1920 : 400;
  const height = isFull ? 1080 : 300;

  const png = placeholderPng(width, height, `${clientId}/${designId}/${type}`);

  return new Response(new Uint8Array(png), {
    status: 200,
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "public, max-age=86400, immutable",
      "Content-Length": String(png.length),
    },
  });
}
