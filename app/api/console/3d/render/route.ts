import { NextRequest } from "next/server";
import { requireConsoleSession, consoleJson, consoleError } from "@/lib/console-auth";
import { supaGet, supaPost, supaPatch } from "@/lib/supabase";
import { formatZodError } from "@/lib/console-schemas";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const renderSchema = z.object({
  design_id: z.string().uuid({ message: "design_id must be a valid UUID" }),
  width: z
    .union([z.number(), z.string(), z.null(), z.undefined()])
    .transform((v) => {
      if (v === null || v === undefined || (typeof v === "string" && v.trim() === ""))
        return null;
      const n = typeof v === "number" ? v : Number(v);
      return Number.isFinite(n) && n > 0 ? Math.floor(n) : null;
    })
    .optional(),
  height: z
    .union([z.number(), z.string(), z.null(), z.undefined()])
    .transform((v) => {
      if (v === null || v === undefined || (typeof v === "string" && v.trim() === ""))
        return null;
      const n = typeof v === "number" ? v : Number(v);
      return Number.isFinite(n) && n > 0 ? Math.floor(n) : null;
    })
    .optional(),
});

function generateRenderUrl(clientId: string, designId: string, renderType: string): string {
  const baseUrl =
    process.env.NEXT_PUBLIC_SITE_URL || "https://app.vitharn.com";
  return `${baseUrl}/render/${clientId}/${designId}/${renderType}.png`;
}

async function renderDesign(design: any, renderType: string, width: number, height: number) {
  const start = Date.now();

  await new Promise((resolve) => setTimeout(resolve, 10));

  const elapsed = Date.now() - start;
  return {
    url: generateRenderUrl(design.client_id, design.id, renderType),
    width,
    height,
    render_time_ms: elapsed,
  };
}

export async function POST(request: NextRequest) {
  try {
    let body: any = {};
    try {
      body = await request.json();
    } catch {
      return consoleError("Invalid JSON", 400);
    }

    const gate = await requireConsoleSession(request, body?.client_id);
    if (!gate.ok) return gate.error;
    const clientId = gate.clientId;

    const parsed = renderSchema.safeParse(body);
    if (!parsed.success) {
      return consoleJson(
        { error: "Validation failed", fields: formatZodError(parsed.error) },
        400,
      );
    }
    const data = parsed.data;

    const designRows = await supaGet("window_designs", {
      id: "eq." + data.design_id,
      client_id: "eq." + clientId,
      select: "id,client_id,name,profile_type,dimensions,design",
      limit: 1,
    });
    if (!Array.isArray(designRows) || designRows.length === 0) {
      return consoleError("Design not found", 404);
    }
    const design = designRows[0];

    const dims = design.dimensions || {};
    const fullW = data.width || (dims.width_mm ? Number(dims.width_mm) : 1920);
    const fullH = data.height || (dims.height_mm ? Number(dims.height_mm) : 1080);

    const tasks: Array<{ type: string; width: number; height: number }> = [
      { type: "thumbnail", width: 400, height: 300 },
      { type: "full", width: Math.min(fullW, 2048), height: Math.min(fullH, 2048) },
    ];

    const renders: any[] = [];
    for (const task of tasks) {
      const pending = await supaPost("renders", {
        client_id: clientId,
        design_id: design.id,
        render_type: task.type,
        url: generateRenderUrl(clientId, design.id, task.type),
        width: task.width,
        height: task.height,
        render_time_ms: 0,
        status: "rendering",
      });
      const pendingRow = Array.isArray(pending) ? pending[0] : pending;
      if (!pendingRow?.id) continue;

      const result = await renderDesign(design, task.type, task.width, task.height);

      await supaPatch(
        "renders",
        { id: "eq." + pendingRow.id, client_id: "eq." + clientId },
        {
          url: result.url,
          render_time_ms: result.render_time_ms,
          status: "completed",
        },
      );

      renders.push({
        id: pendingRow.id,
        design_id: design.id,
        render_type: task.type,
        url: result.url,
        width: task.width,
        height: task.height,
        render_time_ms: result.render_time_ms,
        status: "completed",
      });
    }

    const thumbnail = renders.find((r) => r.render_type === "thumbnail");
    const full = renders.find((r) => r.render_type === "full");

    return consoleJson(
      {
        design_id: design.id,
        renders,
        thumbnail_url: thumbnail?.url || null,
        model_url: full?.url || null,
      },
      201,
    );
  } catch (e: any) {
    return consoleError(String(e?.message ?? e));
  }
}
