"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { Plus, Search, Download, MessageSquare } from "lucide-react";
import { DataGrid } from "../_components/DataGrid";
import { useConsole, useConsoleStatus, useConsoleAction } from "../ConsoleShell";
import { formatDate, formatMoney, toCsv, downloadFile } from "@/lib/console-format";
import { validateGSTIN } from "@/lib/console-validators";

interface InvoiceRow {
  id: string;
  invoice_number: string;
  invoice_date: string;
  buyer_name: string;
  buyer_gstin: string;
  taxable_value: number;
  cgst_amount: number;
  sgst_amount: number;
  igst_amount: number;
  grand_total: number;
  status: string;
  source_quotation_id: string | null;
  created_at: string;
}

export default function InvoicesClient() {
  const { companyName, toast } = useConsole();

  const [rows, setRows] = useState<InvoiceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [page] = useState(1);
  const [pageSize] = useState(50);
  const [totalCount, setTotalCount] = useState(0);

  // New Invoice Modal
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [buyerName, setBuyerName] = useState("");
  const [buyerAddress, setBuyerAddress] = useState("");
  const [buyerGstin, setBuyerGstin] = useState("");
  const [taxableValue, setTaxableValue] = useState<string>("");
  const [isInterstate, setIsInterstate] = useState(false);
  const [gstRate, setGstRate] = useState<string>("18");
  const [invoiceDate, setInvoiceDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/console/invoices?page=${page}&page_size=${pageSize}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load invoices");
      const data = await res.json();
      setRows(data.rows || []);
      setTotalCount(data.total_count || 0);
    } catch (err: any) {
      toast(err?.message || "Failed to load invoices", "err");
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, toast]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  // Totals
  const totalBilled = useMemo(() => {
    return rows.reduce((sum, r) => sum + (Number(r.grand_total) || 0), 0);
  }, [rows]);

  const totalGst = useMemo(() => {
    return rows.reduce((sum, r) => sum + (Number(r.cgst_amount || 0) + Number(r.sgst_amount || 0) + Number(r.igst_amount || 0)), 0);
  }, [rows]);

  useConsoleStatus({
    count: `${totalCount} invoices`,
    total: formatMoney(totalBilled),
    hints: [
      { keys: "F1 / Alt+N", label: "Create Invoice" },
      { keys: "Ctrl+E", label: "Export CSV" },
    ],
  });

  const handleCreateInvoice = async (e: React.FormEvent) => {
    e.preventDefault();
    setFieldErrors({});
    if (!buyerName.trim()) {
      setFieldErrors((f) => ({ ...f, buyerName: "Buyer name is required" }));
      toast("Buyer name is required", "err");
      return;
    }
    const val = parseFloat(taxableValue);
    if (!val || val <= 0 || isNaN(val)) {
      setFieldErrors((f) => ({ ...f, taxableValue: "Please enter valid positive taxable amount" }));
      toast("Please enter valid positive taxable amount", "err");
      return;
    }
    const gstinErr = validateGSTIN(buyerGstin);
    if (gstinErr) {
      setFieldErrors((f) => ({ ...f, buyerGstin: gstinErr }));
      toast(gstinErr, "err");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/console/invoices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          buyer_name: buyerName.trim(),
          buyer_address: buyerAddress.trim(),
          buyer_gstin: buyerGstin.trim().toUpperCase(),
          taxable_value: val,
          is_interstate: isInterstate,
          gst_rate: parseFloat(gstRate) || 18,
          invoice_date: invoiceDate,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData?.error || "Failed to create invoice");
      }

      toast("GST Tax Invoice generated", "ok");
      setModalOpen(false);
      setBuyerName("");
      setBuyerAddress("");
      setBuyerGstin("");
      setTaxableValue("");
      setFieldErrors({});
      void loadData();
    } catch (err: any) {
      toast(err?.message || "Failed to create invoice", "err");
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
      ["Invoice No", "Date", "Buyer", "GSTIN", "Taxable Value", "CGST", "SGST", "IGST", "Grand Total", "Status"],
      rows.map((r) => [
        r.invoice_number,
        formatDate(r.invoice_date || r.created_at),
        r.buyer_name,
        r.buyer_gstin,
        r.taxable_value,
        r.cgst_amount,
        r.sgst_amount,
        r.igst_amount,
        r.grand_total,
        r.status,
      ]),
    );
    downloadFile(`invoices-${new Date().toISOString().slice(0, 10)}.csv`, csv);
    toast(`Exported ${rows.length} invoices`, "ok");
  }, [rows, toast]);

  const onNewAction = useCallback(() => setModalOpen(true), []);

  useConsoleAction("new", onNewAction);
  useConsoleAction("export", exportCsv);

  const openWhatsAppInvoice = (r: InvoiceRow) => {
    const text = `*GST TAX INVOICE — ${r.invoice_number}*\n\nDear ${r.buyer_name},\nPlease find the tax invoice from *${companyName || "Vitharn uPVC"}*:\n\n• Taxable Value: ${formatMoney(r.taxable_value)}\n• Total GST: ${formatMoney((Number(r.cgst_amount) || 0) + (Number(r.sgst_amount) || 0) + (Number(r.igst_amount) || 0))}\n• *Grand Total: ${formatMoney(r.grand_total)}*\n\nThank you for choosing us!`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank");
  };

  const filteredRows = useMemo(() => {
    if (!search.trim()) return rows;
    const q = search.toLowerCase();
    return rows.filter(
      (r) =>
        (r.invoice_number || "").toLowerCase().includes(q) ||
        (r.buyer_name || "").toLowerCase().includes(q) ||
        (r.buyer_gstin || "").toLowerCase().includes(q)
    );
  }, [rows, search]);

  const columns = useMemo<ColumnDef<InvoiceRow>[]>(
    () => [
      {
        accessorKey: "invoice_number",
        header: "Invoice No",
        size: 160,
        cell: (c) => (
          <span style={{ fontWeight: 700, color: "var(--vc-accent)", fontFamily: "monospace" }}>
            {String(c.getValue() || "")}
          </span>
        ),
      },
      {
        accessorKey: "invoice_date",
        header: "Date",
        size: 110,
        cell: (c) => <span style={{ fontWeight: 500 }}>{formatDate(String(c.getValue() || ""))}</span>,
      },
      {
        accessorKey: "buyer_name",
        header: "Buyer / Customer",
        size: 220,
        cell: (c) => (
          <div>
            <div style={{ fontWeight: 600, color: "var(--vc-text-hi)" }}>{String(c.getValue() || "")}</div>
            {c.row.original.buyer_gstin && (
              <div style={{ fontSize: "11px", color: "var(--vc-text-sub)", fontFamily: "monospace" }}>
                GSTIN: {c.row.original.buyer_gstin}
              </div>
            )}
          </div>
        ),
      },
      {
        accessorKey: "taxable_value",
        header: "Taxable Value",
        size: 130,
        cell: (c) => <span style={{ fontWeight: 600 }}>{formatMoney(Number(c.getValue()) || 0)}</span>,
      },
      {
        id: "tax_breakdown",
        header: "GST (CGST/SGST/IGST)",
        size: 150,
        cell: (c) => {
          const r = c.row.original;
          if (r.igst_amount > 0) {
            return <span style={{ fontSize: "12px", color: "#3b82f6" }}>IGST: {formatMoney(r.igst_amount)}</span>;
          }
          return (
            <span style={{ fontSize: "12px", color: "var(--vc-text-sub)" }}>
              CGST: {formatMoney(r.cgst_amount || 0)} + SGST: {formatMoney(r.sgst_amount || 0)}
            </span>
          );
        },
      },
      {
        accessorKey: "grand_total",
        header: "Total (Incl. GST)",
        size: 140,
        cell: (c) => (
          <span style={{ fontWeight: 700, color: "var(--vc-accent)" }}>
            {formatMoney(Number(c.getValue()) || 0)}
          </span>
        ),
      },
      {
        accessorKey: "status",
        header: "Status",
        size: 100,
        cell: (c) => (
          <span
            style={{
              padding: "3px 8px",
              borderRadius: "6px",
              fontSize: "11px",
              fontWeight: 600,
              background: "rgba(16, 185, 129, 0.15)",
              color: "#10b981",
              textTransform: "capitalize",
            }}
          >
            {String(c.getValue() || "Sent")}
          </span>
        ),
      },
      {
        id: "actions",
        header: "",
        size: 80,
        cell: (c) => (
          <button
            onClick={() => openWhatsAppInvoice(c.row.original)}
            title="Share on WhatsApp"
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
            <MessageSquare size={12} /> Share
          </button>
        ),
      },
    ],
    [companyName]
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      {/* Top Stat Summary Strip */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: "12px",
          padding: "16px 20px 0 20px",
        }}
      >
        <div style={{ background: "var(--vc-surface)", border: "1px solid var(--vc-border)", borderRadius: "10px", padding: "12px 16px" }}>
          <div style={{ fontSize: "12px", color: "var(--vc-text-sub)" }}>Total Invoiced Value</div>
          <div style={{ fontSize: "18px", fontWeight: 700, color: "var(--vc-text-hi)", marginTop: "4px" }}>
            {formatMoney(totalBilled)}
          </div>
        </div>
        <div style={{ background: "var(--vc-surface)", border: "1px solid var(--vc-border)", borderRadius: "10px", padding: "12px 16px" }}>
          <div style={{ fontSize: "12px", color: "var(--vc-accent)" }}>Total Output GST Collected</div>
          <div style={{ fontSize: "18px", fontWeight: 700, color: "var(--vc-text-hi)", marginTop: "4px" }}>
            {formatMoney(totalGst)}
          </div>
        </div>
        <div style={{ background: "var(--vc-surface)", border: "1px solid var(--vc-border)", borderRadius: "10px", padding: "12px 16px" }}>
          <div style={{ fontSize: "12px", color: "#10b981" }}>Total Invoices Issued</div>
          <div style={{ fontSize: "18px", fontWeight: 700, color: "var(--vc-text-hi)", marginTop: "4px" }}>
            {totalCount} Invoices
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
        <div style={{ position: "relative", maxWidth: "320px", width: "100%" }}>
          <Search
            size={15}
            style={{ position: "absolute", left: "10px", top: "50%", transform: "translateY(-50%)", color: "var(--vc-text-sub)" }}
          />
          <input
            type="text"
            placeholder="Search invoice number, buyer, GSTIN..."
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
            <Plus size={15} /> Create Invoice (F1)
          </button>
        </div>
      </div>

      {/* Data Grid */}
      <div style={{ flex: 1, padding: "0 20px 16px 20px", overflow: "hidden" }}>
        <DataGrid<InvoiceRow>
          columns={columns}
          data={filteredRows}
          getRowId={(r) => r.id}
          loading={loading}
          emptyTitle="No GST tax invoices yet"
          emptyHint="Generate tax invoices from completed orders or directly using Create Invoice or Alt+N."
        />
      </div>

      {/* Create Tax Invoice Modal */}
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
            onSubmit={handleCreateInvoice}
            style={{
              maxWidth: "480px",
              width: "100%",
              background: "var(--vc-bg)",
              border: "1px solid var(--vc-border)",
              borderRadius: "16px",
              padding: "24px",
              color: "var(--vc-text-hi)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
              <div style={{ fontSize: "16px", fontWeight: 700 }}>Generate GST Tax Invoice</div>
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
                  Buyer / Customer Name *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Ramesh Kumar Builders"
                  value={buyerName}
                  onChange={(e) => {
                    setBuyerName(e.target.value);
                    if (fieldErrors.buyerName) setFieldErrors((f) => ({ ...f, buyerName: "" }));
                  }}
                  style={{
                    width: "100%",
                    padding: "8px 12px",
                    background: "var(--vc-surface)",
                    border: fieldErrors.buyerName ? "1px solid var(--vc-danger)" : "1px solid var(--vc-border)",
                    borderRadius: "8px",
                    color: "var(--vc-text-hi)",
                    fontSize: "13px",
                  }}
                />
                {fieldErrors.buyerName && (
                  <span style={{ color: "var(--vc-danger)", fontSize: "11px", marginTop: "3px", display: "block" }}>
                    {fieldErrors.buyerName}
                  </span>
                )}
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                <div>
                  <label style={{ fontSize: "12px", color: "var(--vc-text-sub)", fontWeight: 600, display: "block", marginBottom: "4px" }}>
                    Buyer GSTIN (Optional)
                  </label>
                  <input
                    type="text"
                    maxLength={15}
                    placeholder="36AAAAA0000A1Z5"
                    value={buyerGstin}
                    onChange={(e) => {
                      const val = e.target.value.toUpperCase();
                      setBuyerGstin(val);
                      if (fieldErrors.buyerGstin) {
                        const err = validateGSTIN(val);
                        setFieldErrors((f) => ({ ...f, buyerGstin: err || "" }));
                      }
                    }}
                    onBlur={(e) => {
                      const err = validateGSTIN(e.target.value.toUpperCase());
                      setFieldErrors((f) => ({ ...f, buyerGstin: err || "" }));
                    }}
                    style={{
                      width: "100%",
                      padding: "8px 12px",
                      background: "var(--vc-surface)",
                      border: fieldErrors.buyerGstin ? "1px solid var(--vc-danger)" : "1px solid var(--vc-border)",
                      borderRadius: "8px",
                      color: "var(--vc-text-hi)",
                      fontSize: "13px",
                      fontFamily: "monospace",
                    }}
                  />
                  {fieldErrors.buyerGstin && (
                    <span style={{ color: "var(--vc-danger)", fontSize: "11px", marginTop: "3px", display: "block" }}>
                      {fieldErrors.buyerGstin}
                    </span>
                  )}
                </div>

                <div>
                  <label style={{ fontSize: "12px", color: "var(--vc-text-sub)", fontWeight: 600, display: "block", marginBottom: "4px" }}>
                    Invoice Date
                  </label>
                  <input
                    type="date"
                    value={invoiceDate}
                    onChange={(e) => setInvoiceDate(e.target.value)}
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
                  Buyer Billing Address
                </label>
                <input
                  type="text"
                  placeholder="e.g. 12-3-45, Kukatpally, Hyderabad 500072"
                  value={buyerAddress}
                  onChange={(e) => setBuyerAddress(e.target.value)}
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
                    Taxable Base Amount (₹) *
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    required
                    placeholder="45000"
                    value={taxableValue}
                    onChange={(e) => {
                      setTaxableValue(e.target.value);
                      if (fieldErrors.taxableValue) setFieldErrors((f) => ({ ...f, taxableValue: "" }));
                    }}
                    style={{
                      width: "100%",
                      padding: "8px 12px",
                      background: "var(--vc-surface)",
                      border: fieldErrors.taxableValue ? "1px solid var(--vc-danger)" : "1px solid var(--vc-border)",
                      borderRadius: "8px",
                      color: "var(--vc-text-hi)",
                      fontSize: "14px",
                      fontWeight: 700,
                    }}
                  />
                  {fieldErrors.taxableValue && (
                    <span style={{ color: "var(--vc-danger)", fontSize: "11px", marginTop: "3px", display: "block" }}>
                      {fieldErrors.taxableValue}
                    </span>
                  )}
                </div>

                <div>
                  <label style={{ fontSize: "12px", color: "var(--vc-text-sub)", fontWeight: 600, display: "block", marginBottom: "4px" }}>
                    GST Rate
                  </label>
                  <select
                    value={gstRate}
                    onChange={(e) => setGstRate(e.target.value)}
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
                    <option value="18">18% (Standard uPVC & Glass)</option>
                    <option value="12">12% (Fittings & Hardware)</option>
                    <option value="28">28% (Luxury Glass)</option>
                    <option value="5">5% (Special Rate)</option>
                  </select>
                </div>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "4px" }}>
                <input
                  type="checkbox"
                  id="interstateCheck"
                  checked={isInterstate}
                  onChange={(e) => setIsInterstate(e.target.checked)}
                  style={{ width: "16px", height: "16px" }}
                />
                <label htmlFor="interstateCheck" style={{ fontSize: "13px", color: "var(--vc-text-hi)", cursor: "pointer" }}>
                  Inter-State Supply (Apply IGST instead of CGST + SGST)
                </label>
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
                  }}
                >
                  {saving ? "Generating..." : "Generate Invoice"}
                </button>
              </div>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
