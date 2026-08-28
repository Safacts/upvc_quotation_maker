"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { Plus, Search, Download, CreditCard, Banknote, Landmark, Smartphone, MessageSquare } from "lucide-react";
import { DataGrid } from "../_components/DataGrid";
import { useConsole, useConsoleStatus, useConsoleAction } from "../ConsoleShell";
import { formatDate, formatMoney, toCsv, downloadFile } from "@/lib/console-format";

interface PaymentRow {
  id: string;
  quotation_id: string | null;
  customer_id: string | null;
  customer_name: string;
  amount: number;
  method: "upi" | "cash" | "bank_transfer" | "card" | "cheque" | "other";
  reference: string;
  note: string;
  paid_at: string;
  created_at: string;
}

const METHOD_LABELS: Record<string, { label: string; icon: any; color: string }> = {
  upi: { label: "UPI", icon: Smartphone, color: "#10b981" },
  cash: { label: "Cash", icon: Banknote, color: "#f59e0b" },
  bank_transfer: { label: "Bank Transfer", icon: Landmark, color: "#3b82f6" },
  card: { label: "Card", icon: CreditCard, color: "#8b5cf6" },
  cheque: { label: "Cheque", icon: Landmark, color: "#64748b" },
  other: { label: "Other", icon: CreditCard, color: "#94a3b8" },
};

export default function PaymentsClient() {
  const { toast } = useConsole();

  const [rows, setRows] = useState<PaymentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [methodFilter, setMethodFilter] = useState<string>("all");
  const [page] = useState(1);
  const [pageSize] = useState(50);
  const [totalCount, setTotalCount] = useState(0);

  // New Payment Modal State
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [customerName, setCustomerName] = useState("");
  const [quotationId, setQuotationId] = useState("");
  const [amount, setAmount] = useState<string>("");
  const [method, setMethod] = useState<string>("upi");
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const [paidAt, setPaidAt] = useState(() => new Date().toISOString().slice(0, 10));

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/console/payments?page=${page}&page_size=${pageSize}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load payments");
      const data = await res.json();
      setRows(data.rows || []);
      setTotalCount(data.total_count || 0);
    } catch (err: any) {
      toast(err?.message || "Failed to load payments", "err");
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, toast]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  // Totals
  const totalAmount = useMemo(() => {
    return rows.reduce((sum, r) => sum + (Number(r.amount) || 0), 0);
  }, [rows]);

  const methodSummary = useMemo(() => {
    const summary = { upi: 0, cash: 0, bank: 0 };
    for (const r of rows) {
      if (r.method === "upi") summary.upi += Number(r.amount) || 0;
      else if (r.method === "cash") summary.cash += Number(r.amount) || 0;
      else summary.bank += Number(r.amount) || 0;
    }
    return summary;
  }, [rows]);

  useConsoleStatus({
    count: `${totalCount} payments`,
    total: formatMoney(totalAmount),
    hints: [
      { keys: "F1 / Alt+N", label: "Record Payment" },
      { keys: "Ctrl+E", label: "Export CSV" },
    ],
  });

  const handleRecordPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    const numAmount = parseFloat(amount);
    if (!numAmount || numAmount <= 0) {
      toast("Please enter a valid payment amount", "err");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/console/payments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          customer_name: customerName,
          quotation_id: quotationId || null,
          amount: numAmount,
          method,
          reference,
          note,
          paid_at: paidAt,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData?.error || "Failed to record payment");
      }

      toast("Payment recorded successfully", "ok");
      setModalOpen(false);
      setCustomerName("");
      setQuotationId("");
      setAmount("");
      setReference("");
      setNote("");
      void loadData();
    } catch (err: any) {
      toast(err?.message || "Failed to record payment", "err");
    } finally {
      setSaving(false);
    }
  };

  const exportCsv = useCallback(() => {
    if (!rows.length) {
      toast("Nothing to export", "info");
      return;
    }
    const csv = toCsv(
      ["Date", "Customer", "Amount", "Method", "Reference", "Notes"],
      rows.map((r) => [
        formatDate(r.paid_at || r.created_at),
        r.customer_name,
        r.amount,
        r.method,
        r.reference,
        r.note,
      ]),
    );
    downloadFile(`payments-${new Date().toISOString().slice(0, 10)}.csv`, csv);
    toast(`Exported ${rows.length} payments`, "ok");
  }, [rows, toast]);

  const onNewAction = useCallback(() => setModalOpen(true), []);

  useConsoleAction("new", onNewAction);
  useConsoleAction("export", exportCsv);

  const openWhatsAppReceipt = (p: PaymentRow) => {
    const text = `*PAYMENT RECEIPT*\n\nDear ${p.customer_name || "Customer"},\nWe have received your payment of *${formatMoney(p.amount)}* via *${p.method.toUpperCase()}* on ${formatDate(p.paid_at || p.created_at)}.\n${p.reference ? `Ref: ${p.reference}\n` : ""}Thank you for your business!`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank");
  };

  const filteredRows = useMemo(() => {
    let result = rows;
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (r) =>
          (r.customer_name || "").toLowerCase().includes(q) ||
          (r.reference || "").toLowerCase().includes(q) ||
          (r.note || "").toLowerCase().includes(q)
      );
    }
    if (methodFilter !== "all") {
      result = result.filter((r) => r.method === methodFilter);
    }
    return result;
  }, [rows, search, methodFilter]);

  const columns = useMemo<ColumnDef<PaymentRow>[]>(
    () => [
      {
        accessorKey: "paid_at",
        header: "Date",
        size: 110,
        cell: (c) => <span style={{ fontWeight: 500 }}>{formatDate(String(c.getValue() || ""))}</span>,
      },
      {
        accessorKey: "customer_name",
        header: "Customer",
        size: 220,
        cell: (c) => (
          <div>
            <div style={{ fontWeight: 600, color: "var(--vc-text-hi)" }}>{String(c.getValue() || "Walk-in Customer")}</div>
            {c.row.original.quotation_id && (
              <div style={{ fontSize: "11px", color: "var(--vc-text-sub)" }}>Quote #{c.row.original.quotation_id.slice(0, 8)}</div>
            )}
          </div>
        ),
      },
      {
        accessorKey: "amount",
        header: "Amount",
        size: 130,
        cell: (c) => (
          <span style={{ fontWeight: 700, color: "var(--vc-accent)" }}>
            {formatMoney(Number(c.getValue()) || 0)}
          </span>
        ),
      },
      {
        accessorKey: "method",
        header: "Mode",
        size: 130,
        cell: (c) => {
          const m = String(c.getValue() || "other");
          const conf = METHOD_LABELS[m] || METHOD_LABELS.other;
          const Icon = conf.icon;
          return (
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "5px",
                padding: "3px 8px",
                borderRadius: "6px",
                fontSize: "12px",
                fontWeight: 600,
                background: "rgba(255,255,255,0.06)",
                color: conf.color,
              }}
            >
              <Icon size={13} /> {conf.label}
            </span>
          );
        },
      },
      {
        accessorKey: "reference",
        header: "Ref / UTR No.",
        size: 160,
        cell: (c) => <span style={{ fontFamily: "monospace", fontSize: "12px" }}>{String(c.getValue() || "—")}</span>,
      },
      {
        accessorKey: "note",
        header: "Notes",
        cell: (c) => <span style={{ color: "var(--vc-text-sub)", fontSize: "12px" }}>{String(c.getValue() || "—")}</span>,
      },
      {
        id: "actions",
        header: "",
        size: 70,
        cell: (c) => (
          <button
            onClick={() => openWhatsAppReceipt(c.row.original)}
            title="Share Receipt on WhatsApp"
            style={{
              background: "rgba(16, 185, 129, 0.15)",
              color: "#10b981",
              border: "none",
              borderRadius: "6px",
              padding: "4px 8px",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: "4px",
              fontSize: "11px",
              fontWeight: 600,
            }}
          >
            <MessageSquare size={13} /> Share
          </button>
        ),
      },
    ],
    []
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      {/* Top Stat Summary Strip */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gap: "12px",
          padding: "16px 20px 0 20px",
        }}
      >
        <div style={{ background: "var(--vc-surface)", border: "1px solid var(--vc-border)", borderRadius: "10px", padding: "12px 16px" }}>
          <div style={{ fontSize: "12px", color: "var(--vc-text-sub)" }}>Total Collections</div>
          <div style={{ fontSize: "18px", fontWeight: 700, color: "var(--vc-text-hi)", marginTop: "4px" }}>
            {formatMoney(totalAmount)}
          </div>
        </div>
        <div style={{ background: "var(--vc-surface)", border: "1px solid var(--vc-border)", borderRadius: "10px", padding: "12px 16px" }}>
          <div style={{ fontSize: "12px", color: "#10b981" }}>UPI Collections</div>
          <div style={{ fontSize: "18px", fontWeight: 700, color: "var(--vc-text-hi)", marginTop: "4px" }}>
            {formatMoney(methodSummary.upi)}
          </div>
        </div>
        <div style={{ background: "var(--vc-surface)", border: "1px solid var(--vc-border)", borderRadius: "10px", padding: "12px 16px" }}>
          <div style={{ fontSize: "12px", color: "#f59e0b" }}>Cash in Hand</div>
          <div style={{ fontSize: "18px", fontWeight: 700, color: "var(--vc-text-hi)", marginTop: "4px" }}>
            {formatMoney(methodSummary.cash)}
          </div>
        </div>
        <div style={{ background: "var(--vc-surface)", border: "1px solid var(--vc-border)", borderRadius: "10px", padding: "12px 16px" }}>
          <div style={{ fontSize: "12px", color: "#3b82f6" }}>Bank / NEFT / IMPS</div>
          <div style={{ fontSize: "18px", fontWeight: 700, color: "var(--vc-text-hi)", marginTop: "4px" }}>
            {formatMoney(methodSummary.bank)}
          </div>
        </div>
      </div>

      {/* Action Strip */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "16px 20px",
          gap: "12px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "10px", flex: 1 }}>
          <div
            style={{
              position: "relative",
              maxWidth: "320px",
              width: "100%",
            }}
          >
            <Search
              size={15}
              style={{ position: "absolute", left: "10px", top: "50%", transform: "translateY(-50%)", color: "var(--vc-text-sub)" }}
            />
            <input
              type="text"
              placeholder="Search customer, UTR, note..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{
                width: "100%",
                padding: "7px 10px 7px 32px",
                background: "var(--vc-surface)",
                border: "1px solid var(--vc-border)",
                borderRadius: "8px",
                color: "var(--vc-text-hi)",
                fontSize: "13px",
              }}
            />
          </div>

          {/* Mode filter pills */}
          <div style={{ display: "flex", gap: "6px" }}>
            {["all", "upi", "cash", "bank_transfer", "cheque"].map((m) => (
              <button
                key={m}
                onClick={() => setMethodFilter(m)}
                style={{
                  background: methodFilter === m ? "var(--vc-accent)" : "var(--vc-surface)",
                  color: methodFilter === m ? "#fff" : "var(--vc-text-sub)",
                  border: "1px solid var(--vc-border)",
                  borderRadius: "6px",
                  padding: "5px 10px",
                  fontSize: "12px",
                  fontWeight: 600,
                  cursor: "pointer",
                  textTransform: "capitalize",
                }}
              >
                {m.replace("_", " ")}
              </button>
            ))}
          </div>
        </div>

        <div style={{ display: "flex", gap: "8px" }}>
          <button
            onClick={exportCsv}
            style={{
              background: "var(--vc-surface)",
              color: "var(--vc-text-hi)",
              border: "1px solid var(--vc-border)",
              borderRadius: "8px",
              padding: "7px 12px",
              fontSize: "13px",
              fontWeight: 600,
              display: "flex",
              alignItems: "center",
              gap: "6px",
              cursor: "pointer",
            }}
          >
            <Download size={14} /> Export CSV
          </button>
          <button
            onClick={() => setModalOpen(true)}
            style={{
              background: "var(--vc-accent)",
              color: "#fff",
              border: "none",
              borderRadius: "8px",
              padding: "7px 14px",
              fontSize: "13px",
              fontWeight: 600,
              display: "flex",
              alignItems: "center",
              gap: "6px",
              cursor: "pointer",
            }}
          >
            <Plus size={15} /> Record Payment (F1)
          </button>
        </div>
      </div>

      {/* Data Table */}
      <div style={{ flex: 1, padding: "0 20px 16px 20px", overflow: "hidden" }}>
        <DataGrid<PaymentRow>
          columns={columns}
          data={filteredRows}
          getRowId={(r) => r.id}
          loading={loading}
          emptyTitle="No payments recorded yet"
          emptyHint="Record incoming advances and settlements using the Record Payment button or Alt+N."
        />
      </div>

      {/* Record Payment Modal */}
      {modalOpen && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.6)",
            backdropFilter: "blur(4px)",
            zIndex: 1000,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "20px",
          }}
        >
          <form
            onSubmit={handleRecordPayment}
            style={{
              maxWidth: "460px",
              width: "100%",
              background: "var(--vc-bg)",
              border: "1px solid var(--vc-border)",
              borderRadius: "16px",
              padding: "24px",
              boxShadow: "0 25px 50px -12px rgba(0,0,0,0.5)",
              color: "var(--vc-text-hi)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
              <div style={{ fontSize: "16px", fontWeight: 700 }}>Record Customer Payment</div>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                style={{ background: "transparent", border: "none", color: "var(--vc-text-sub)", cursor: "pointer", fontSize: "18px" }}
              >
                ✕
              </button>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              <div>
                <label style={{ fontSize: "12px", color: "var(--vc-text-sub)", fontWeight: 600, display: "block", marginBottom: "4px" }}>
                  Customer Name *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Ramesh Kumar"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "8px 12px",
                    background: "var(--vc-surface)",
                    border: "1px solid var(--vc-border)",
                    borderRadius: "8px",
                    color: "var(--vc-text-hi)",
                    fontSize: "13px",
                  }}
                />
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                <div>
                  <label style={{ fontSize: "12px", color: "var(--vc-text-sub)", fontWeight: 600, display: "block", marginBottom: "4px" }}>
                    Amount (₹) *
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    placeholder="25000"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "8px 12px",
                      background: "var(--vc-surface)",
                      border: "1px solid var(--vc-border)",
                      borderRadius: "8px",
                      color: "var(--vc-text-hi)",
                      fontSize: "14px",
                      fontWeight: 700,
                    }}
                  />
                </div>

                <div>
                  <label style={{ fontSize: "12px", color: "var(--vc-text-sub)", fontWeight: 600, display: "block", marginBottom: "4px" }}>
                    Payment Mode
                  </label>
                  <select
                    value={method}
                    onChange={(e) => setMethod(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "8px 12px",
                      background: "var(--vc-surface)",
                      border: "1px solid var(--vc-border)",
                      borderRadius: "8px",
                      color: "var(--vc-text-hi)",
                      fontSize: "13px",
                    }}
                  >
                    <option value="upi">UPI (GPay / PhonePe / Paytm)</option>
                    <option value="cash">Cash in Hand</option>
                    <option value="bank_transfer">Bank Transfer (NEFT / IMPS)</option>
                    <option value="cheque">Cheque</option>
                    <option value="card">Card / POS</option>
                  </select>
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                <div>
                  <label style={{ fontSize: "12px", color: "var(--vc-text-sub)", fontWeight: 600, display: "block", marginBottom: "4px" }}>
                    Payment Date
                  </label>
                  <input
                    type="date"
                    value={paidAt}
                    onChange={(e) => setPaidAt(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "8px 12px",
                      background: "var(--vc-surface)",
                      border: "1px solid var(--vc-border)",
                      borderRadius: "8px",
                      color: "var(--vc-text-hi)",
                      fontSize: "13px",
                    }}
                  />
                </div>

                <div>
                  <label style={{ fontSize: "12px", color: "var(--vc-text-sub)", fontWeight: 600, display: "block", marginBottom: "4px" }}>
                    UTR / Ref No.
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. 423589129031"
                    value={reference}
                    onChange={(e) => setReference(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "8px 12px",
                      background: "var(--vc-surface)",
                      border: "1px solid var(--vc-border)",
                      borderRadius: "8px",
                      color: "var(--vc-text-hi)",
                      fontSize: "13px",
                    }}
                  />
                </div>
              </div>

              <div>
                <label style={{ fontSize: "12px", color: "var(--vc-text-sub)", fontWeight: 600, display: "block", marginBottom: "4px" }}>
                  Notes (Milestone / Remarks)
                </label>
                <input
                  type="text"
                  placeholder="e.g. 50% Advance on site measurement"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "8px 12px",
                    background: "var(--vc-surface)",
                    border: "1px solid var(--vc-border)",
                    borderRadius: "8px",
                    color: "var(--vc-text-hi)",
                    fontSize: "13px",
                  }}
                />
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "12px" }}>
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  style={{
                    background: "transparent",
                    color: "var(--vc-text-sub)",
                    border: "1px solid var(--vc-border)",
                    borderRadius: "8px",
                    padding: "8px 16px",
                    fontSize: "13px",
                    cursor: "pointer",
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  style={{
                    background: "var(--vc-accent)",
                    color: "#fff",
                    border: "none",
                    borderRadius: "8px",
                    padding: "8px 20px",
                    fontSize: "13px",
                    fontWeight: 600,
                    cursor: "pointer",
                    opacity: saving ? 0.7 : 1,
                  }}
                >
                  {saving ? "Saving..." : "Save Payment"}
                </button>
              </div>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
