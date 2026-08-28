import { NextRequest } from "next/server";
import { requireConsoleSession, consoleJson } from "@/lib/console-auth";
import { supaGet, supaCount, supaPost } from "@/lib/supabase";
import { formatZodError, MAX_PAGE_SIZE } from "@/lib/console-schemas";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET  /api/console/challans — list delivery challans / gate passes.
 * POST /api/console/challans — create new delivery challan.
 */

const challanWriteSchema = z.object({
  quotation_id: z.string().nullable().optional(),
  customer_name: z.string().min(1, "Customer name is required"),
  delivery_address: z.string().optional().default(""),
  vehicle_number: z.string().optional().default(""),
  driver_name: z.string().optional().default(""),
  driver_phone: z.string().optional().default(""),
  items_summary: z.string().optional().default(""),
  total_units: z.number().optional().default(1),
  status: z.enum(["dispatched", "delivered", "in_transit", "cancelled"]).default("dispatched"),
  dispatch_date: z.string().optional().default(() => new Date().toISOString().slice(0, 10)),
});

export async function GET(request: NextRequest) {
  try {
    const gate = await requireConsoleSession(request);
    if (!gate.ok) return gate.error;

    const url = new URL(request.url);
    const page = Math.max(1, Math.floor(Number(url.searchParams.get("page")) || 1));
    const pageSize = Math.min(
      MAX_PAGE_SIZE,
      Math.max(1, Math.floor(Number(url.searchParams.get("page_size")) || 50)),
    );

    const totalCount = await supaCount("delivery_challans", {
      client_id: "eq." + gate.clientId,
    });

    const rows = await supaGet("delivery_challans", {
      client_id: "eq." + gate.clientId,
      select: "id,challan_number,quotation_id,customer_name,delivery_address,vehicle_number,driver_name,driver_phone,items_summary,total_units,status,dispatch_date,created_at",
      order: "created_at.desc",
      limit: pageSize,
      offset: (page - 1) * pageSize,
    });

    return consoleJson({
      rows: Array.isArray(rows) ? rows : [],
      page,
      page_size: pageSize,
      total_count: totalCount >= 0 ? totalCount : (rows?.length ?? 0),
      total_pages: totalCount > 0 ? Math.ceil(totalCount / pageSize) : 1,
    });
  } catch (e: any) {
    // If delivery_challans table isn't created yet in DB, return empty list gracefully
    return consoleJson({ rows: [], page: 1, page_size: 50, total_count: 0, total_pages: 1 }, 200);
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

    const parsed = challanWriteSchema.safeParse(body);
    if (!parsed.success) {
      return consoleJson({ error: "Validation failed", fields: formatZodError(parsed.error) }, 400);
    }
    const data = parsed.data;

    const d = new Date();
    const dateStr = `${d.getDate().toString().padStart(2, '0')}${(d.getMonth()+1).toString().padStart(2, '0')}${d.getFullYear()}`;
    const rand = Math.floor(1000 + Math.random() * 9000);
    const challanNumber = `DC-${dateStr}-${rand}`;

    const inserted = await supaPost("delivery_challans", {
      client_id: gate.clientId,
      challan_number: challanNumber,
      ...data,
    });

    const challan = Array.isArray(inserted) ? inserted[0] : inserted;
    return consoleJson({ challan: challan || { challan_number: challanNumber, ...data } }, 201);
  } catch (e: any) {
    return consoleJson({ error: String(e?.message ?? e) }, 500);
  }
}
