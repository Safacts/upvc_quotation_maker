import { NextRequest } from "next/server";
import { requireConsoleSession, consoleJson } from "@/lib/console-auth";
import { supaGet, supaCount, supaPost, supaGetSafe } from "@/lib/supabase";
import { formatZodError } from "@/lib/console-schemas";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STATUSES = ["pending", "approved", "cutting", "completed"] as const;

const querySchema = z.object({
  status: z.string().optional(),
  order_id: z.string().optional(),
  profile_type: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  page_size: z.coerce.number().int().min(1).max(200).default(50),
  sort: z.enum(["created_at", "profile_type", "status", "wastage_percent"]).default("created_at"),
  dir: z.enum(["asc", "desc"]).default("desc"),
});

const cutItemSchema = z.object({
  piece_length_mm: z.number().int().positive(),
  quantity: z.number().int().positive(),
  label: z.string().optional().default(""),
});

const writeSchema = z.object({
  order_id: z.union([z.string(), z.null(), z.undefined()]).transform(v => {
    const s = (v ?? "").toString().trim();
    return s === "" ? null : s;
  }),
  production_order_id: z.union([z.string(), z.null(), z.undefined()]).transform(v => {
    const s = (v ?? "").toString().trim();
    return s === "" ? null : s;
  }),
  profile_type: z.union([z.string(), z.null(), z.undefined()])
    .transform(v => (v ?? "").toString().trim())
    .refine(v => v.length > 0, { message: "Profile type is required" })
    .refine(v => v.length <= 200, { message: "Profile type must be 200 characters or fewer" }),
  stock_length_mm: z.union([z.number(), z.string(), z.null(), z.undefined()])
    .transform(v => {
      if (v === null || v === undefined || (typeof v === "string" && v.trim() === "")) return 0;
      const n = typeof v === "number" ? v : Number(v);
      return Number.isFinite(n) ? Math.round(n) : 0;
    })
    .refine(n => n > 0, { message: "Stock length must be positive" }),
  cuts: z.array(cutItemSchema).min(1, { message: "At least one cut is required" }),
});

function optimizeCuts(stockLengthMm: number, cuts: Array<{ piece_length_mm: number; quantity: number }>): {
  optimized_cuts: Array<{ piece_length_mm: number; quantity: number; offcut_mm: number }>;
  wastage_percent: number;
} {
  const pieces: number[] = [];
  for (const cut of cuts) {
    for (let i = 0; i < cut.quantity; i++) {
      pieces.push(cut.piece_length_mm);
    }
  }

  pieces.sort((a, b) => b - a);

  const bins: number[] = [];
  const binOffcuts: number[] = [];

  for (const piece of pieces) {
    let placed = false;
    for (let i = 0; i < bins.length; i++) {
      if (binOffcuts[i] >= piece) {
        binOffcuts[i] -= piece;
        placed = true;
        break;
      }
    }
    if (!placed) {
      bins.push(stockLengthMm);
      binOffcuts.push(stockLengthMm - piece);
    }
  }

  const totalStockUsed = bins.length * stockLengthMm;
  const totalOffcut = binOffcuts.reduce((sum, o) => sum + o, 0);
  const wastagePercent = totalStockUsed > 0 ? (totalOffcut / totalStockUsed) * 100 : 0;

  const binPieces: Array<number[]> = bins.map(() => []);
  const tempRemaining = [...binOffcuts];

  for (const piece of pieces) {
    for (let i = 0; i < bins.length; i++) {
      if (tempRemaining[i] >= piece) {
        tempRemaining[i] -= piece;
        binPieces[i].push(piece);
        break;
      }
    }
  }

  const optimizedCutsMap = new Map<number, { quantity: number; offcut_mm: number }>();
  for (let i = 0; i < binPieces.length; i++) {
    for (const piece of binPieces[i]) {
      const existing = optimizedCutsMap.get(piece);
      if (existing) {
        existing.quantity++;
      } else {
        optimizedCutsMap.set(piece, { quantity: 1, offcut_mm: tempRemaining[i] });
      }
    }
  }

  const optimized_cuts: Array<{ piece_length_mm: number; quantity: number; offcut_mm: number }> = [];
  for (const [pieceLen, data] of optimizedCutsMap) {
    optimized_cuts.push({
      piece_length_mm: pieceLen,
      quantity: data.quantity,
      offcut_mm: data.offcut_mm,
    });
  }

  optimized_cuts.sort((a, b) => b.piece_length_mm - a.piece_length_mm);

  return {
    optimized_cuts,
    wastage_percent: Math.round(wastagePercent * 100) / 100,
  };
}

const LIST_SELECT =
  "id,order_id,production_order_id,profile_type,stock_length_mm,cuts,optimized_cuts,wastage_percent,status,created_at";

export async function GET(request: NextRequest) {
  try {
    const gate = await requireConsoleSession(request);
    if (!gate.ok) return gate.error;
    const clientId = gate.clientId;

    const url = new URL(request.url);
    const parsed = querySchema.safeParse({
      status: url.searchParams.get("status") ?? undefined,
      order_id: url.searchParams.get("order_id") ?? undefined,
      profile_type: url.searchParams.get("profile_type") ?? undefined,
      page: url.searchParams.get("page") ?? undefined,
      page_size: url.searchParams.get("page_size") ?? undefined,
      sort: url.searchParams.get("sort") ?? undefined,
      dir: url.searchParams.get("dir") ?? undefined,
    });
    if (!parsed.success) {
      return consoleJson({ error: "Invalid query" }, 400);
    }
    const { status, order_id, profile_type, page, page_size, sort, dir } = parsed.data;

    const filters: Record<string, string> = {};
    if (status) {
      const statuses = status.split(",").map(s => s.trim()).filter(Boolean);
      if (statuses.length === 1) {
        filters.status = "eq." + statuses[0];
      } else if (statuses.length > 1) {
        filters.status = "in.(" + statuses.join(",") + ")";
      }
    }
    if (order_id) filters.order_id = "eq." + order_id;
    if (profile_type) {
      const safe = profile_type.replace(/[(),*]/g, " ").trim();
      if (safe) filters.profile_type = "ilike.*" + safe + "*";
    }

    const totalCount = await supaCount("cutting_lists", {
      client_id: "eq." + clientId,
      ...filters,
    });

    const offset = (page - 1) * page_size;
    const rows = await supaGetSafe("cutting_lists", {
      client_id: "eq." + clientId,
      ...filters,
      select: LIST_SELECT,
      order: `${sort}.${dir},id.desc`,
      limit: page_size,
      offset,
    });

    const list = Array.isArray(rows) ? rows : [];

    return consoleJson({
      rows: list,
      page,
      page_size,
      total_count: totalCount >= 0 ? totalCount : list.length,
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

    const parsed = writeSchema.safeParse(body);
    if (!parsed.success) {
      return consoleJson(
        { error: "Validation failed", fields: formatZodError(parsed.error) },
        400,
      );
    }
    const data = parsed.data;

    if (data.order_id) {
      const owner = await supaGet("orders", {
        id: "eq." + data.order_id,
        client_id: "eq." + gate.clientId,
        select: "id",
        limit: 1,
      });
      if (!Array.isArray(owner) || owner.length === 0) {
        return consoleJson({ error: "Unknown order" }, 404);
      }
    }

    const cutsForOptimization = data.cuts.map(c => ({
      piece_length_mm: c.piece_length_mm,
      quantity: c.quantity,
    }));
    const { optimized_cuts, wastage_percent } = optimizeCuts(data.stock_length_mm, cutsForOptimization);

    const inserted = await supaPost("cutting_lists", {
      client_id: gate.clientId,
      order_id: data.order_id,
      production_order_id: data.production_order_id,
      profile_type: data.profile_type,
      stock_length_mm: data.stock_length_mm,
      cuts: data.cuts,
      optimized_cuts,
      wastage_percent,
      status: "pending",
    });
    const row = Array.isArray(inserted) ? inserted[0] : inserted;
    if (!row?.id) return consoleJson({ error: "Insert failed" }, 500);

    return consoleJson({ cutting_list: row }, 201);
  } catch (e: any) {
    return consoleJson({ error: String(e?.message ?? e) }, 500);
  }
}
