"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshCw, Plus } from "lucide-react";
import { useConsole, useConsoleStatus } from "../ConsoleShell";

/**
 * Production — a kanban board of production orders grouped by stage.
 *
 * Backed by `GET /api/console/production` (production_orders joined with their
 * order + customer) and `GET /api/console/batches` for the batch strip above
 * the columns. Stage changes PATCH `/api/console/production`; creating a batch
 * POSTs `/api/console/batches`, which auto-assigns unbatched pending orders at
 * the chosen stage.
 */

const STAGES = [
  { key: "cutting", label: "Cutting" },
  { key: "assembly", label: "Assembly" },
  { key: "qc", label: "QC" },
  { key: "packing", label: "Packing" },
  { key: "ready", label: "Ready" },
] as const;

const STATUS_COLORS: Record<string, string> = {
  pending: "#8a94a1",
  in_progress: "#EA580C",
  completed: "#16A34A",
  on_hold: "#CA8A04",
};

const BATCH_STATUS_COLORS: Record<string, string> = {
  planning: "#0891B2",
  in_progress: "#EA580C",
  completed: "#16A34A",
};

interface ProductionOrder {
  id: string;
  order_id: string;
  stage: string;
  status: string;
  assigned_to: string;
  batch_id: string;
  priority: number;
  started_at: string;
  completed_at: string;
  notes: string;
  created_at: string;
  order: { order_number: string; status: string; customer_name: string } | null;
}

interface Batch {
  id: string;
  batch_number: string;
  status: string;
  total_orders: number;
  completed_orders: number;
  created_at: string;
  completed_at: string;
}

export default function ProductionClient() {
  const { clientId, toast } = useConsole();
  const [orders, setOrders] = useState<ProductionOrder[]>([]);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [loading, setLoading] = useState(true);
  const [batchOpen, setBatchOpen] = useState(false);
  const [batchDraft, setBatchDraft] = useState({ stage: "cutting", limit: "25" });
  const [advancingId, setAdvancingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // 200 = the server cap (MAX_PAGE_SIZE). The board groups everything into
      // stage columns, so we want the full pending+active set in one request.
      const [prodRes, batchRes] = await Promise.all([
        fetch("/api/console/production?page_size=200", { credentials: "same-origin" }),
        fetch("/api/console/batches?page_size=200", { credentials: "same-origin" }),
      ]);
      const prodData = await prodRes.json();
      const batchData = await batchRes.json();
      if (!prodRes.ok) throw new Error(prodData?.error || "Failed to load production");
      setOrders(prodData.rows || []);
      setBatches(batchData.rows || []);
    } catch (e: any) {
      toast(String(e?.message ?? e), "err");
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const advance = useCallback(
    async (po: ProductionOrder) => {
      const idx = STAGES.findIndex((s) => s.key === po.stage);
      if (idx < 0 || idx >= STAGES.length - 1) {
        toast("Already at the final stage", "info");
        return;
      }
      const nextStage = STAGES[idx + 1].key;
      setAdvancingId(po.id);
      try {
        const res = await fetch("/api/console/production", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify({ id: po.id, stage: nextStage, status: po.status === "completed" ? "completed" : "in_progress" }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || "Could not advance stage");
        toast(`Moved to ${nextStage}`, "ok");
        void load();
      } catch (e: any) {
        toast(String(e?.message ?? e), "err");
      } finally {
        setAdvancingId(null);
      }
    },
    [toast, load],
  );

  const createBatch = useCallback(async () => {
    try {
      const res = await fetch("/api/console/batches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          stage: batchDraft.stage,
          limit: Number(batchDraft.limit) || 25,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Could not create batch");
      const assigned = data.assigned_orders || 0;
      toast(assigned > 0 ? `Batch created — ${assigned} orders assigned` : "Batch created (no pending orders to assign)", "ok");
      setBatchOpen(false);
      void load();
    } catch (e: any) {
      toast(String(e?.message ?? e), "err");
    }
  }, [batchDraft, toast, load]);

  const byStage = useMemo(() => {
    const map: Record<string, ProductionOrder[]> = {};
    for (const s of STAGES) map[s.key] = [];
    for (const o of orders) {
      const bucket = map[o.stage];
      if (bucket) bucket.push(o);
    }
    // Highest priority first within each column.
    for (const s of STAGES) map[s.key].sort((a, b) => (b.priority || 0) - (a.priority || 0));
    return map;
  }, [orders]);

  useConsoleStatus({
    busy: loading,
    count: `${orders.length} production orders · ${batches.length} batches`,
    hints: [
      { keys: "↻", label: "Refresh" },
      { keys: "→", label: "Advance stage" },
    ],
  });

  return (
    <div className="vc-pad">
      {/* ---- Batches strip ---- */}
      <div className="vc-card" style={{ marginBottom: 10, padding: "9px 11px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span style={{ fontSize: 12.5, fontWeight: 700, color: "#7C2D12" }}>Batches</span>
          {batches.length === 0 && (
            <span style={{ fontSize: 12, color: "#8a94a1" }}>
              No batches yet — group pending orders into production runs.
            </span>
          )}
          {batches.map((b) => (
            <span
              key={b.id}
              title={`${b.completed_orders}/${b.total_orders} orders done`}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "3px 9px",
                borderRadius: 20,
                fontSize: 11,
                fontWeight: 600,
                border: "1px solid var(--vc-border-strong)",
                background: "var(--vc-surface-2)",
              }}
            >
              {b.batch_number}
              <span
                style={{
                  padding: "1px 6px",
                  borderRadius: 10,
                  fontSize: 10,
                  fontWeight: 700,
                  textTransform: "uppercase",
                  background: BATCH_STATUS_COLORS[b.status] ? `${BATCH_STATUS_COLORS[b.status]}1a` : "#eef0f3",
                  color: BATCH_STATUS_COLORS[b.status] || "#5b6673",
                }}
              >
                {b.status.replace("_", " ")}
              </span>
              <span style={{ color: "#8a94a1" }}>
                {b.completed_orders}/{b.total_orders}
              </span>
            </span>
          ))}
          <div style={{ flex: 1 }} />
          <button type="button" className="vc-btn" onClick={() => void load()} title="Refresh">
            <RefreshCw size={13} />
          </button>
          <button type="button" className="vc-btn vc-btn-primary" onClick={() => setBatchOpen((v) => !v)}>
            <Plus size={13} /> New Batch
          </button>
        </div>

        {batchOpen && (
          <div style={{ display: "flex", gap: 8, alignItems: "end", marginTop: 9, flexWrap: "wrap" }}>
            <div className="vc-field">
              <label className="vc-label">Stage</label>
              <select
                className="vc-select"
                style={{ width: 130 }}
                value={batchDraft.stage}
                onChange={(e) => setBatchDraft({ ...batchDraft, stage: e.target.value })}
              >
                {STAGES.map((s) => (
                  <option key={s.key} value={s.key}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="vc-field">
              <label className="vc-label">Max orders</label>
              <input
                className="vc-input vc-num"
                style={{ width: 90 }}
                inputMode="numeric"
                value={batchDraft.limit}
                onChange={(e) => setBatchDraft({ ...batchDraft, limit: e.target.value })}
              />
            </div>
            <button type="button" className="vc-btn vc-btn-primary" onClick={() => void createBatch()}>
              Create
            </button>
            <button type="button" className="vc-btn" onClick={() => setBatchOpen(false)}>
              Cancel
            </button>
            <span style={{ fontSize: 11.5, color: "#8a94a1" }}>
              Picks up pending, unbatched orders at that stage, highest priority first.
            </span>
          </div>
        )}
      </div>

      {/* ---- Kanban board ---- */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: `repeat(${STAGES.length}, minmax(210px, 1fr))`,
          gap: 9,
          overflowX: "auto",
        }}
      >
        {STAGES.map((s) => {
          const cards = byStage[s.key] || [];
          return (
            <div
              key={s.key}
              style={{
                borderRadius: 6,
                border: "1px solid var(--vc-border)",
                background: "#FFEDD5",
                minHeight: 220,
                display: "flex",
                flexDirection: "column",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  padding: "7px 10px",
                  fontSize: 12,
                  fontWeight: 700,
                  color: "#fff",
                  background: s.key === "ready" ? "#16A34A" : "#EA580C",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <span>{s.label}</span>
                <span style={{ opacity: 0.85, fontSize: 11 }}>{cards.length}</span>
              </div>
              <div style={{ padding: 7, display: "flex", flexDirection: "column", gap: 7, flex: 1 }}>
                {cards.length === 0 && (
                  <div style={{ fontSize: 11.5, color: "#7C2D12", opacity: 0.55, textAlign: "center", paddingTop: 16 }}>
                    Empty
                  </div>
                )}
                {cards.map((po) => (
                  <div
                    key={po.id}
                    style={{
                      borderRadius: 5,
                      border: "1px solid var(--vc-border-strong)",
                      background: "#fff",
                      padding: "7px 9px",
                      display: "flex",
                      flexDirection: "column",
                      gap: 4,
                      boxShadow: "0 1px 2px rgba(0,0,0,0.06)",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 6 }}>
                      <span style={{ fontWeight: 700, fontSize: 12 }}>
                        {po.order?.order_number || "No order"}
                      </span>
                      <span
                        style={{
                          padding: "1px 6px",
                          borderRadius: 10,
                          fontSize: 9.5,
                          fontWeight: 700,
                          textTransform: "uppercase",
                          background: STATUS_COLORS[po.status] ? `${STATUS_COLORS[po.status]}1a` : "#eef0f3",
                          color: STATUS_COLORS[po.status] || "#5b6673",
                        }}
                      >
                        {po.status.replace("_", " ")}
                      </span>
                    </div>
                    {po.order?.customer_name && (
                      <div style={{ fontSize: 11, color: "#5b6673" }}>{po.order.customer_name}</div>
                    )}
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 6, fontSize: 10.5, color: "#8a94a1" }}>
                      <span>
                        {po.assigned_to ? `👷 ${po.assigned_to}` : "Unassigned"}
                        {po.priority > 0 ? ` · P${po.priority}` : ""}
                      </span>
                      {s.key !== "ready" && (
                        <button
                          type="button"
                          className="vc-btn vc-btn-sm"
                          disabled={advancingId === po.id}
                          onClick={() => void advance(po)}
                          title="Advance to next stage"
                          style={{ padding: "0 6px", fontSize: 10.5 }}
                        >
                          {advancingId === po.id ? "..." : "→"}
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ marginTop: 10, fontSize: 11.5, color: "#8a94a1" }}>
        Orders are re-authorised server-side on every load and stage change — the
        board never holds a tenant&apos;s data without a console session.
      </div>
    </div>
  );
}
