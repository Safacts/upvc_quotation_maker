import { NextRequest } from "next/server";
import { requireConsoleSession, consoleJson } from "@/lib/console-auth";
import { supaGet, supaPatch, supaPost } from "@/lib/supabase";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/console/barcode/scan -- record a barcode scan
 *
 * Updates scanned_at, stage, location on the barcode row.
 * Auto-advances the production_order stage when scanned at a new stage.
 * Creates a shopfloor_update entry for the real-time feed.
 *
 * Request body:
 *   barcode_value: string (required)
 *   stage: string (optional -- override stage)
 *   scanned_by: string (optional -- worker name/ID)
 *   location: string (optional -- physical location on floor)
 */

// Stage order per 028_orders_production.sql
const STAGE_ORDER = ["cutting", "assembly", "qc", "packing", "ready"];

const scanSchema = z.object({
  barcode_value: z
    .string()
    .min(1, { message: "barcode_value is required" })
    .max(100),
  stage: z
    .union([z.string(), z.null(), z.undefined()])
    .transform((v) => (v ?? "").toString().trim().toLowerCase())
    .optional(),
  scanned_by: z
    .union([z.string(), z.null(), z.undefined()])
    .transform((v) => (v ?? "").toString().trim())
    .optional(),
  location: z
    .union([z.string(), z.null(), z.undefined()])
    .transform((v) => (v ?? "").toString().trim())
    .optional(),
});

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

    const parsed = scanSchema.safeParse(body);
    if (!parsed.success) {
      const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`);
      return consoleJson({ error: "Validation failed", fields: issues }, 400);
    }
    const data = parsed.data;

    // Find barcode belonging to this client
    const barcodes = await supaGet("barcodes", {
      barcode_value: "eq." + data.barcode_value,
      client_id: "eq." + gate.clientId,
      select:
        "id,order_id,production_order_id,barcode_value,stage,scanned_at,scanned_by,location",
      limit: 1,
    });

    if (!Array.isArray(barcodes) || barcodes.length === 0) {
      return consoleJson({ error: "Barcode not found" }, 404);
    }

    const barcode = barcodes[0];
    const newStage = data.stage || barcode.stage;
    const now = new Date().toISOString();

    // Update the barcode row
    const patchBody: Record<string, any> = {
      scanned_at: now,
      scanned_by: data.scanned_by || barcode.scanned_by || "",
      location: data.location || barcode.location || "",
      stage: newStage,
    };

    await supaPatch("barcodes", { id: "eq." + barcode.id }, patchBody);

    // Auto-advance production order stage if stage changed
    let stageAdvanced = false;
    if (barcode.production_order_id && newStage !== barcode.stage) {
      const prodOrders = await supaGet("production_orders", {
        id: "eq." + barcode.production_order_id,
        select: "id,stage",
        limit: 1,
      });

      if (Array.isArray(prodOrders) && prodOrders.length > 0) {
        const currentStage = (prodOrders[0].stage || "cutting").toLowerCase();
        const currentIdx = STAGE_ORDER.indexOf(currentStage);
        const newIdx = STAGE_ORDER.indexOf(newStage);

        // Only advance forward in the pipeline
        if (newIdx > currentIdx && newIdx >= 0) {
          await supaPatch(
            "production_orders",
            { id: "eq." + barcode.production_order_id },
            { stage: newStage, started_at: currentIdx === 0 ? now : undefined },
          );
          stageAdvanced = true;
        }
      }
    }

    // Create shopfloor update entry for the real-time feed
    if (barcode.production_order_id) {
      await supaPost("shopfloor_updates", {
        client_id: gate.clientId,
        production_order_id: barcode.production_order_id,
        stage: newStage,
        status: "in_progress",
        worker_id: data.scanned_by || "",
        notes: `Barcode ${data.barcode_value} scanned at ${data.location || newStage}`,
        timestamp: now,
      });
    }

    return consoleJson({
      success: true,
      barcode: {
        ...barcode,
        ...patchBody,
      },
      stage_advanced: stageAdvanced,
    });
  } catch (e: any) {
    return consoleJson({ error: String(e?.message ?? e) }, 500);
  }
}
