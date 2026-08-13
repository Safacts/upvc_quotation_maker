import { NextRequest } from "next/server";
import { requireConsoleSession, consoleJson } from "@/lib/console-auth";
import { supaGetAllPaged } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/console/shopfloor/board -- production board data
 *
 * Returns production orders grouped by stage with counts, suitable for a
 * Kanban-style production board. Only includes non-completed orders.
 *
 * Response shape:
 * {
 *   cutting: [...],
 *   assembly: [...],
 *   qc: [...],
 *   packing: [...],
 *   ready: [...],
 *   counts: { cutting: N, assembly: N, ... }
 * }
 */

const STAGES = ["cutting", "assembly", "qc", "packing", "ready"];
const MAX_ROWS = 2000;
const PAGE_SIZE = 500;

export async function GET(request: NextRequest) {
  try {
    const gate = await requireConsoleSession(request);
    if (!gate.ok) return gate.error;

    // Fetch all non-completed production orders with order context
    const { rows } = await supaGetAllPaged(
      "production_orders",
      {
        client_id: "eq." + gate.clientId,
        status: "neq.completed",
        select:
          "id,order_id,stage,assigned_to,batch_id,priority,status,started_at,notes,created_at," +
          "orders(order_number,customer_id,status,expected_delivery,customers(name,phone))",
        order: "priority.desc,created_at.asc",
      },
      PAGE_SIZE,
      MAX_ROWS,
    );

    const list = Array.isArray(rows) ? rows : [];

    // Group by stage
    const board: Record<string, any[]> = {};
    const counts: Record<string, number> = {};

    for (const stage of STAGES) {
      board[stage] = [];
      counts[stage] = 0;
    }

    for (const po of list) {
      const stage = (po.stage || "cutting").toLowerCase();
      const entry = {
        id: po.id,
        order_id: po.order_id,
        assigned_to: po.assigned_to,
        batch_id: po.batch_id,
        priority: po.priority,
        status: po.status,
        started_at: po.started_at,
        notes: po.notes,
        created_at: po.created_at,
        order_number: po.orders?.order_number || "",
        customer_name: po.orders?.customers?.name || "",
        customer_phone: po.orders?.customers?.phone || "",
        order_status: po.orders?.status || "",
        expected_delivery: po.orders?.expected_delivery || null,
      };

      if (board[stage]) {
        board[stage].push(entry);
        counts[stage] += 1;
      } else {
        // Unknown stage -- group under cutting as fallback
        board.cutting.push(entry);
        counts.cutting += 1;
      }
    }

    return consoleJson({
      ...board,
      counts,
      total: list.length,
    });
  } catch (e: any) {
    return consoleJson({ error: String(e?.message ?? e) }, 500);
  }
}
