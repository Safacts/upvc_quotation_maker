import { NextRequest } from "next/server";
import { requireConsoleSession, consoleJson } from "@/lib/console-auth";
import { supaGet, supaPatch, supabaseRpc } from "@/lib/supabase";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VALID_TRANSITIONS: Record<string, string[]> = {
  confirmed: ["production", "cancelled"],
  production: ["dispatched", "cancelled"],
  dispatched: ["installed", "cancelled"],
  installed: ["completed", "cancelled"],
  completed: [],
  cancelled: [],
};

const statusSchema = z.object({
  status: z.string().min(1, "Status is required"),
});

async function loadOwner(id: string): Promise<{ id: string; client_id: string; status: string } | null> {
  const rows = await supaGet("orders", {
    id: "eq." + id,
    select: "id,client_id,status",
    limit: 1,
  });
  if (!Array.isArray(rows) || rows.length === 0) return null;
  return rows[0];
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    let body: any = {};
    try {
      body = await request.json();
    } catch {
      return consoleJson({ error: "Invalid JSON" }, 400);
    }

    const gate = await requireConsoleSession(request, body?.client_id);
    if (!gate.ok) return gate.error;
    const { id } = await params;

    const owner = await loadOwner(id);
    if (!owner) return consoleJson({ error: "Not found" }, 404);
    if (!gate.isAdmin && owner.client_id !== gate.clientId) {
      return consoleJson({ error: "Not found" }, 404);
    }
    const clientId = owner.client_id;

    const parsed = statusSchema.safeParse(body);
    if (!parsed.success) {
      return consoleJson({ error: "Status is required" }, 400);
    }
    const newStatus = parsed.data.status.toLowerCase().trim();

    if (!VALID_TRANSITIONS[owner.status]?.includes(newStatus)) {
      return consoleJson({
        error: `Cannot transition from '${owner.status}' to '${newStatus}'`,
        valid_transitions: VALID_TRANSITIONS[owner.status] || [],
      }, 400);
    }

    try {
      const result = await supabaseRpc("advance_order_status", {
        p_client_id: clientId,
        p_order_id: id,
        p_new_status: newStatus,
      });

      if (result && typeof result === "object" && result.success === false) {
        return consoleJson({ error: result.error || "Status update failed" }, 400);
      }

      return consoleJson({ ok: true, id, status: newStatus });
    } catch {
      const patchData: Record<string, any> = { status: newStatus };
      if (newStatus === "dispatched" || newStatus === "completed") {
        patchData.actual_delivery = new Date().toISOString().slice(0, 10);
      }

      await supaPatch(
        "orders",
        { id: "eq." + id, client_id: "eq." + clientId },
        patchData,
      );

      if (newStatus === "production") {
        const existing = await supaGet("production_orders", {
          order_id: "eq." + id,
          client_id: "eq." + clientId,
          select: "id",
          limit: 1,
        });
        if (!Array.isArray(existing) || existing.length === 0) {
          const { supaPost } = await import("@/lib/supabase");
          await supaPost("production_orders", {
            client_id: clientId,
            order_id: id,
            stage: "cutting",
            status: "pending",
          });
        }
      }

      return consoleJson({ ok: true, id, status: newStatus });
    }
  } catch (e: any) {
    return consoleJson({ error: String(e?.message ?? e) }, 500);
  }
}
