import { NextRequest } from "next/server";
import { requireConsoleSession, consoleJson } from "@/lib/console-auth";
import { supaGet, supaCount, supaPost, supaGetSafe } from "@/lib/supabase";
import { formatZodError } from "@/lib/console-schemas";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STATUSES = ["available", "used", "discarded"] as const;

const querySchema = z.object({
  status: z.string().optional(),
  profile_type: z.string().optional(),
  cutting_list_id: z.string().optional(),
  min_length: z.coerce.number().int().optional(),
  page: z.coerce.number().int().min(1).default(1),
  page_size: z.coerce.number().int().min(1).max(200).default(50),
  sort: z.enum(["created_at", "length_mm", "profile_type", "status"]).default("created_at"),
  dir: z.enum(["asc", "desc"]).default("desc"),
});

const writeSchema = z.object({
  cutting_list_id: z.union([z.string(), z.null(), z.undefined()]).transform(v => {
    const s = (v ?? "").toString().trim();
    return s === "" ? null : s;
  }),
  profile_type: z.union([z.string(), z.null(), z.undefined()])
    .transform(v => (v ?? "").toString().trim())
    .refine(v => v.length > 0, { message: "Profile type is required" })
    .refine(v => v.length <= 200, { message: "Profile type must be 200 characters or fewer" }),
  length_mm: z.union([z.number(), z.string(), z.null(), z.undefined()])
    .transform(v => {
      if (v === null || v === undefined || (typeof v === "string" && v.trim() === "")) return 0;
      const n = typeof v === "number" ? v : Number(v);
      return Number.isFinite(n) ? Math.round(n) : 0;
    })
    .refine(n => n > 0, { message: "Length must be positive" }),
  location: z.union([z.string(), z.null(), z.undefined()])
    .transform(v => (v ?? "").toString().trim())
    .refine(v => v.length <= 200, { message: "Location must be 200 characters or fewer" }),
});

const LIST_SELECT =
  "id,cutting_list_id,profile_type,length_mm,status,location,created_at";

export async function GET(request: NextRequest) {
  try {
    const gate = await requireConsoleSession(request);
    if (!gate.ok) return gate.error;
    const clientId = gate.clientId;

    const url = new URL(request.url);
    const parsed = querySchema.safeParse({
      status: url.searchParams.get("status"),
      profile_type: url.searchParams.get("profile_type"),
      cutting_list_id: url.searchParams.get("cutting_list_id"),
      min_length: url.searchParams.get("min_length"),
      page: url.searchParams.get("page"),
      page_size: url.searchParams.get("page_size"),
      sort: url.searchParams.get("sort"),
      dir: url.searchParams.get("dir"),
    });
    if (!parsed.success) {
      return consoleJson({ error: "Invalid query" }, 400);
    }
    const { status, profile_type, cutting_list_id, min_length, page, page_size, sort, dir } = parsed.data;

    const filters: Record<string, string> = {};
    if (status) {
      const statuses = status.split(",").map(s => s.trim()).filter(Boolean);
      if (statuses.length === 1) {
        filters.status = "eq." + statuses[0];
      } else if (statuses.length > 1) {
        filters.status = "in.(" + statuses.join(",") + ")";
      }
    }
    if (profile_type) {
      const safe = profile_type.replace(/[(),*]/g, " ").trim();
      if (safe) filters.profile_type = "ilike.*" + safe + "*";
    }
    if (cutting_list_id) filters.cutting_list_id = "eq." + cutting_list_id;
    if (min_length !== undefined) filters.length_mm = "gte." + min_length;

    const totalCount = await supaCount("offcuts", {
      client_id: "eq." + clientId,
      ...filters,
    });

    const offset = (page - 1) * page_size;
    const rows = await supaGetSafe("offcuts", {
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

    if (data.cutting_list_id) {
      const owner = await supaGet("cutting_lists", {
        id: "eq." + data.cutting_list_id,
        client_id: "eq." + gate.clientId,
        select: "id",
        limit: 1,
      });
      if (!Array.isArray(owner) || owner.length === 0) {
        return consoleJson({ error: "Unknown cutting list" }, 404);
      }
    }

    const inserted = await supaPost("offcuts", {
      client_id: gate.clientId,
      cutting_list_id: data.cutting_list_id,
      profile_type: data.profile_type,
      length_mm: data.length_mm,
      status: "available",
      location: data.location,
    });
    const row = Array.isArray(inserted) ? inserted[0] : inserted;
    if (!row?.id) return consoleJson({ error: "Insert failed" }, 500);

    return consoleJson({ offcut: row }, 201);
  } catch (e: any) {
    return consoleJson({ error: String(e?.message ?? e) }, 500);
  }
}
