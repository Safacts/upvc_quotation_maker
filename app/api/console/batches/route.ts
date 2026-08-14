import { NextRequest } from "next/server";
import { requireConsoleSession, consoleJson } from "@/lib/console-auth";
import { supaGet, supaCount, supaPost, supaGetSafe, supaPostSafe } from "@/lib/supabase";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const querySchema = z.object({
  status: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  page_size: z.coerce.number().int().min(1).max(200).default(50),
  sort: z.enum(["created_at", "batch_number", "status"]).default("created_at"),
  dir: z.enum(["asc", "desc"]).default("desc"),
});

const batchWriteSchema = z.object({
  batch_number: z.union([z.string(), z.null(), z.undefined()]).transform(v => (v ?? "").toString().trim()),
  stage: z.union([z.string(), z.null(), z.undefined()]).transform(v => {
    const s = (v ?? "").toString().trim();
    return s === "" ? "cutting" : s;
  }),
  limit: z.union([z.number(), z.string(), z.null(), z.undefined()]).transform(v => {
    if (v === null || v === undefined || (typeof v === "string" && v.trim() === "")) return 50;
    const n = typeof v === "number" ? v : Number(v);
    return Number.isFinite(n) && n > 0 ? Math.min(Math.round(n), 200) : 50;
  }),
});

const LIST_SELECT =
  "id,batch_number,status,total_orders,completed_orders,created_at,completed_at";

export async function GET(request: NextRequest) {
  try {
    const gate = await requireConsoleSession(request);
    if (!gate.ok) return gate.error;
    const clientId = gate.clientId;

    const url = new URL(request.url);
    const parsed = querySchema.safeParse({
      status: url.searchParams.get("status") ?? undefined,
      page: url.searchParams.get("page") ?? undefined,
      page_size: url.searchParams.get("page_size") ?? undefined,
      sort: url.searchParams.get("sort") ?? undefined,
      dir: url.searchParams.get("dir") ?? undefined,
    });
    if (!parsed.success) {
      return consoleJson({ error: "Invalid query" }, 400);
    }
    const { status, page, page_size, sort, dir } = parsed.data;

    const filters: Record<string, string> = {};
    if (status) {
      const statuses = status.split(",").map(s => s.trim()).filter(Boolean);
      if (statuses.length === 1) filters.status = "eq." + statuses[0];
      else if (statuses.length > 1) filters.status = "in.(" + statuses.join(",") + ")";
    }

    const totalCount = await supaCount("batches", {
      client_id: "eq." + clientId,
      ...filters,
    });

    const offset = (page - 1) * page_size;
    const rows = await supaGetSafe("batches", {
      client_id: "eq." + clientId,
      ...filters,
      select: LIST_SELECT,
      order: `${sort}.${dir},id.desc`,
      limit: page_size,
      offset,
    });

    return consoleJson({
      rows: Array.isArray(rows) ? rows : [],
      page,
      page_size,
      total_count: totalCount >= 0 ? totalCount : (Array.isArray(rows) ? rows.length : 0),
      total_pages: totalCount > 0 ? Math.ceil(totalCount / page_size) : 1,
      sort,
      dir,
    });
  } catch (e: any) {
    return consoleJson({ error: String(e?.message ?? e) }, 500);
  }
}

export async function POST(request: NextRequest) {
  try {
    let body: any = {};
    try {
      body = await request.json();
    } catch {
      return consoleJson({ error: "Invalid JSON" }, 400);
    }

    const gate = await requireConsoleSession(request, body?.client_id);
    if (!gate.ok) return gate.error;
    const clientId = gate.clientId;

    const parsed = batchWriteSchema.safeParse(body);
    if (!parsed.success) {
      return consoleJson({ error: "Validation failed" }, 400);
    }
    const data = parsed.data;

    let batchNumber = data.batch_number;
    if (!batchNumber) {
      const prefix = String(clientId).toUpperCase();
      const d = new Date();
      const datePart = `${String(d.getDate()).padStart(2, "0")}${String(d.getMonth() + 1).padStart(2, "0")}${d.getFullYear()}`;
      const existing = await supaGet("batches", {
        client_id: "eq." + clientId,
        select: "batch_number",
        order: "created_at.desc",
        limit: 100,
      });
      let maxSeq = 0;
      if (Array.isArray(existing)) {
        for (const r of existing) {
          const m = String(r?.batch_number || "").match(/-(\d+)$/);
          if (m) {
            const n = Number(m[1]);
            if (Number.isFinite(n) && n > maxSeq) maxSeq = n;
          }
        }
      }
      batchNumber = `${prefix}-BAT-${datePart}-${String(maxSeq + 1).padStart(4, "0")}`;
    }

    try {
      const result = await supaPostSafe("batches", {
        client_id: clientId,
        batch_number: batchNumber,
        status: "planning",
        total_orders: 0,
        completed_orders: 0,
      });

      const batch = Array.isArray(result) ? result[0] : result;
      if (!batch?.id) return consoleJson({ error: "Insert failed" }, 500);

      const unbatched = await supaGet("production_orders", {
        client_id: "eq." + clientId,
        stage: "eq." + data.stage,
        status: "eq.pending",
        batch_id: "is.null",
        select: "id",
        limit: data.limit,
        order: "priority.desc,created_at.asc",
      });

      if (Array.isArray(unbatched) && unbatched.length > 0) {
        const { supaPatch } = await import("@/lib/supabase");
        for (const po of unbatched) {
          await supaPatch(
            "production_orders",
            { id: "eq." + po.id, client_id: "eq." + clientId },
            { batch_id: batch.id },
          );
        }

        const { supaPatch: patchBatch } = await import("@/lib/supabase");
        await patchBatch(
          "batches",
          { id: "eq." + batch.id, client_id: "eq." + clientId },
          {
            total_orders: unbatched.length,
            status: "in_progress",
          },
        );

        return consoleJson({
          batch: {
            ...batch,
            total_orders: unbatched.length,
            status: "in_progress",
          },
          assigned_orders: unbatched.length,
        }, 201);
      }

      return consoleJson({ batch, assigned_orders: 0 }, 201);
    } catch (rpcErr) {
      const prefix = String(clientId).toUpperCase();
      const d = new Date();
      const datePart = `${String(d.getDate()).padStart(2, "0")}${String(d.getMonth() + 1).padStart(2, "0")}${d.getFullYear()}`;
      const batchResult = await supaPostSafe("batches", {
        client_id: clientId,
        batch_number: batchNumber,
        status: "planning",
        total_orders: 0,
        completed_orders: 0,
      });
      const batch = Array.isArray(batchResult) ? batchResult[0] : batchResult;
      if (!batch?.id) return consoleJson({ error: "Insert failed" }, 500);
      return consoleJson({ batch, assigned_orders: 0 }, 201);
    }
  } catch (e: any) {
    return consoleJson({ error: String(e?.message ?? e) }, 500);
  }
}
