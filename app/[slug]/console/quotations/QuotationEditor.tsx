"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, Save, ArrowLeft, Printer, UserPlus, Download, Mail, FileText } from "lucide-react";
import { useConsole, useConsoleStatus, useConsoleAction } from "../ConsoleShell";
import { useUnsavedChangesWarning } from "@/lib/hooks/useHotkeys";
import {
  measuredLineSqft,
  measuredLineTotal,
  unmeasuredLineTotal,
  quotationTotals,
} from "@/lib/pricing";
import {
  formatAmount,
  formatMoney,
  formatSqft,
  toDateInputValue,
} from "@/lib/console-format";
import { QUOTATION_STATUSES } from "@/lib/console-schemas";
import { LivePreview } from "../_components/LivePreview";

/**
 * QuotationEditor — THE SPLIT-VIEW. This screen is the product.
 *
 * ============================================================================
 *  THE PROBLEM THIS SOLVES
 * ============================================================================
 * KPR's complaint was not "we need more features". It was:
 *
 *     "users can't see what they entered till the end"
 *
 * That is not a screen-size problem, it is a SINGLE-COLUMN, ONE-FIELD-AT-A-TIME
 * MOBILE FORM problem. The mobile app is flawless at what it does — measuring on
 * site — but on a laptop it wastes the one thing a laptop has: room to show
 * everything simultaneously.
 *
 * So four things are visible AT ALL TIMES, and nothing is revealed at the end:
 *   1. every header field (3-column grid, no wizard, no accordion)
 *   2. every line item (editable spreadsheet-style grid)
 *   3. the running totals (subtotal / GST / transport / grand total)
 *   4. a live render of the document the customer will receive
 *
 * ============================================================================
 *  WHY THE TOTALS ARE COMPUTED IN THE BROWSER
 * ============================================================================
 * The preview updates as the user types, so the numbers must be local — a
 * server round trip per keystroke is neither fast enough nor free. The critical
 * detail is that this file computes NOTHING itself: it imports the exact
 * functions (`measuredLineSqft`, `measuredLineTotal`, `quotationTotals`) that
 * the API route and the parity fixtures use. There is no second implementation
 * to drift, which is the entire point of `src/lib/pricing.ts`.
 *
 * The server RECOMPUTES on save and ignores any client-supplied total — a
 * client-supplied amount is a client-supplied price.
 */

export interface MeasuredRow {
  key: string;
  code: string;
  description: string;
  glass: string;
  width: string;
  height: string;
  units: string;
  rate: string;
}

export interface UnmeasuredRow {
  key: string;
  description: string;
  units: string;
  rate: string;
}

export interface QuotationHeader {
  quote_no: string;
  date: string;
  customer_name: string;
  contact_no: string;
  email: string;
  address: string;
  reference: string;
  supplier_company: string;
  status: string;
  transport_cost: string;
  include_gst: boolean;
  gst_percentage: string;
  customer_id: string | null;
}

export interface EditorInitial {
  header: QuotationHeader;
  measured: MeasuredRow[];
  unmeasured: UnmeasuredRow[];
}

/**
 * Row keys are generated CLIENT-SIDE and are not database ids.
 *
 * React needs a stable key across inserts, deletes and reorders within one
 * editing session. Using the array index instead makes React reuse the wrong DOM
 * node when a row is deleted from the middle — the user watches the value they
 * just typed jump to a different line. A counter is used rather than
 * `crypto.randomUUID()` so that server and client render identically and
 * hydration does not mismatch.
 */
let keySeq = 0;
function nextKey(): string {
  keySeq += 1;
  return "r" + keySeq;
}

export function emptyMeasured(): MeasuredRow {
  return { key: nextKey(), code: "", description: "", glass: "", width: "", height: "", units: "1", rate: "" };
}
export function emptyUnmeasured(): UnmeasuredRow {
  return { key: nextKey(), description: "", units: "1", rate: "" };
}

export function blankHeader(gstPercentage = 18): QuotationHeader {
  return {
    quote_no: "",
    date: new Date().toISOString().slice(0, 10),
    customer_name: "",
    contact_no: "",
    email: "",
    address: "",
    reference: "",
    supplier_company: "",
    status: "draft",
    transport_cost: "0",
    include_gst: false,
    gst_percentage: String(gstPercentage),
    customer_id: null,
  };
}

export default function QuotationEditor({
  quotationId,
  initial,
  companyName,
  companyAddress,
  companyContact,
  gstNumber,
}: {
  /** null for a new quotation. */
  quotationId: string | null;
  initial: EditorInitial;
  companyName: string;
  companyAddress?: string;
  companyContact?: string;
  gstNumber?: string;
}) {
  const router = useRouter();
  const { slug, toast } = useConsole();

  const [header, setHeader] = useState<QuotationHeader>(initial.header);
  const [measured, setMeasured] = useState<MeasuredRow[]>(
    initial.measured.length ? initial.measured : [emptyMeasured()],
  );
  const [unmeasured, setUnmeasured] = useState<UnmeasuredRow[]>(initial.unmeasured);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [focusedMeasured, setFocusedMeasured] = useState(0);
  const [savedId, setSavedId] = useState<string | null>(quotationId);

  const gridRef = useRef<HTMLTableSectionElement>(null);

  // The browser-level net under the in-app Esc dirty-check. It only covers tab
  // close / reload / back, where we get a generic dialog and no chance to offer
  // "Save" — the in-app prompt is the good path.
  useUnsavedChangesWarning(dirty);

  // ---- Auto-fill a draft quote number for new quotations -----------------
  // Only fires when the field is blank AND this is a new (unsaved) quotation.
  // The number is a DRAFT — it is not reserved, and the user can edit or clear
  // it before saving. Skipped entirely when editing an existing quotation.
  useEffect(() => {
    if (quotationId !== null) return;
    if (header.quote_no.trim()) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/console/quotations/number", {
          credentials: "same-origin",
        });
        if (!res.ok) return;
        const data = await res.json();
        if (cancelled) return;
        if (data?.quote_no) {
          setHeader((h) => (h.quote_no ? h : { ...h, quote_no: data.quote_no }));
        }
      } catch {
        // Non-fatal: blank field means the user types one.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [quotationId, header.quote_no]);

  const markDirty = useCallback(() => setDirty(true), []);

  const setHeaderField = useCallback(
    <K extends keyof QuotationHeader>(field: K, value: QuotationHeader[K]) => {
      setHeader((h) => ({ ...h, [field]: value }));
      markDirty();
    },
    [markDirty],
  );

  // ---- Totals -------------------------------------------------------------
  // Recomputed on every render from pricing.ts. Intentionally NOT stored in
  // state: a derived value held in state is a value that can go stale, and a
  // stale grand total on the screen the customer is looking at over your
  // shoulder is the worst possible bug for this product.
  const totals = useMemo(
    () =>
      quotationTotals(
        {
          transport_cost: header.transport_cost,
          include_gst: header.include_gst,
          gst_percentage: header.gst_percentage,
        },
        measured.map((m) => ({ width: m.width, height: m.height, units: m.units, rate: m.rate })),
        unmeasured.map((u) => ({ units: u.units, rate: u.rate })),
      ),
    [header.transport_cost, header.include_gst, header.gst_percentage, measured, unmeasured],
  );

  // ---- Row operations -----------------------------------------------------
  const addMeasured = useCallback(() => {
    setMeasured((rows) => {
      const next = [...rows, emptyMeasured()];
      // Focus the first cell of the new row on the next frame — the DOM node
      // does not exist yet at this point in the update.
      window.requestAnimationFrame(() => {
        const el = gridRef.current?.querySelector<HTMLInputElement>(
          `tr[data-r="${next.length - 1}"] input`,
        );
        el?.focus();
      });
      setFocusedMeasured(next.length - 1);
      return next;
    });
    markDirty();
  }, [markDirty]);

  const removeMeasured = useCallback(
    (index: number) => {
      setMeasured((rows) => {
        // Never leave the grid with zero rows: an empty table gives the user
        // nothing to click and no obvious way back in.
        if (rows.length <= 1) return [emptyMeasured()];
        return rows.filter((_, i) => i !== index);
      });
      setFocusedMeasured((i) => Math.max(0, Math.min(i, measured.length - 2)));
      markDirty();
    },
    [markDirty, measured.length],
  );

  const updateMeasured = useCallback(
    (index: number, field: keyof MeasuredRow, value: string) => {
      setMeasured((rows) => rows.map((r, i) => (i === index ? { ...r, [field]: value } : r)));
      markDirty();
    },
    [markDirty],
  );

  const addUnmeasured = useCallback(() => {
    setUnmeasured((rows) => [...rows, emptyUnmeasured()]);
    markDirty();
  }, [markDirty]);

  const removeUnmeasured = useCallback(
    (index: number) => {
      setUnmeasured((rows) => rows.filter((_, i) => i !== index));
      markDirty();
    },
    [markDirty],
  );

  const updateUnmeasured = useCallback(
    (index: number, field: keyof UnmeasuredRow, value: string) => {
      setUnmeasured((rows) => rows.map((r, i) => (i === index ? { ...r, [field]: value } : r)));
      markDirty();
    },
    [markDirty],
  );

  // ---- Save ---------------------------------------------------------------
  const save = useCallback(async () => {
    if (saving) return;
    setFieldErrors({});

    // A cheap client-side check so the obvious mistake does not cost a round
    // trip. The SAME zod schema still runs on the server — this is a courtesy,
    // never the enforcement.
    if (!header.customer_name.trim()) {
      setFieldErrors({ customer_name: "Customer name is required" });
      toast("Customer name is required", "err");
      return;
    }

    setSaving(true);
    try {
      const payload = {
        ...header,
        // Empty rows are dropped rather than rejected. A user who tabs past a
        // blank line should not get a validation error for a row they never
        // intended to fill in.
        measured_items: measured
          .filter((m) => m.code || m.description || m.width || m.height || m.rate)
          .map((m) => ({
            code: m.code,
            description: m.description,
            glass: m.glass,
            width: m.width,
            height: m.height,
            units: m.units,
            rate: m.rate,
          })),
        unmeasured_items: unmeasured
          .filter((u) => u.description || u.rate)
          .map((u) => ({ description: u.description, units: u.units, rate: u.rate })),
      };

      const isNew = !savedId;
      const res = await fetch(
        isNew ? "/api/console/quotations" : `/api/console/quotations/${savedId}`,
        {
          method: isNew ? "POST" : "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify(payload),
        },
      );
      const data = await res.json();

      if (!res.ok) {
        if (data?.fields) setFieldErrors(data.fields);
        toast(data?.error || "Save failed", "err");
        return;
      }

      setDirty(false);
      toast("Saved", "ok");

      if (isNew && data.id) {
        setSavedId(data.id);
        // `replace`, not `push`: the user should not be able to press Back into
        // a "new quotation" URL that would create a SECOND copy on next save.
        router.replace(`/${slug}/console/quotations/${data.id}`);
      }
    } catch (e: any) {
      toast(String(e?.message ?? e), "err");
    } finally {
      setSaving(false);
    }
  }, [saving, header, measured, unmeasured, savedId, router, slug, toast]);

  const goBack = useCallback(() => {
    // Esc is Tally's Ctrl+Q (quit without saving) — but silently discarding a
    // half-typed 20-line quotation would be unforgivable, so it always asks.
    if (dirty && !window.confirm("Discard unsaved changes?")) return;
    router.push(`/${slug}/console/quotations`);
  }, [dirty, router, slug]);

  // ---- PDF download --------------------------------------------------------
  // Opens the PDF route in a new tab. The route re-reads the stored row, so the
  // download always reflects the last saved state — never the unsaved draft.
  const downloadPdf = useCallback(() => {
    if (!savedId) {
      toast("Save the quotation first to generate a PDF", "info");
      return;
    }
    window.open(`/${slug}/console/quotations/${savedId}/pdf`, "_blank", "noopener,noreferrer");
  }, [savedId, slug, toast]);

  // ---- Email the quotation -------------------------------------------------
  // Sends the customer-facing PDF as an attachment via /api/send_email. The
  // quotation's own `email` field is used as the default recipient.
  const emailQuote = useCallback(async () => {
    if (!savedId) {
      toast("Save the quotation before emailing", "info");
      return;
    }
    const to = header.email.trim();
    if (!to) {
      toast("Add a customer email first", "info");
      return;
    }
    try {
      const pdfRes = await fetch(`/${slug}/console/quotations/${savedId}/pdf`, {
        credentials: "same-origin",
      });
      if (!pdfRes.ok) {
        toast("Could not generate PDF — save first?", "err");
        return;
      }
      const pdfBlob = await pdfRes.arrayBuffer();
      // Chunked base64: String.fromCharCode(...bytes) throws
      // "Maximum call stack size exceeded" past ~65k elements in V8. A
      // quotation with 30+ measured lines can easily exceed that, silently
      // breaking the Email button on exactly the big jobs.
      const bytes = new Uint8Array(pdfBlob);
      let binary = "";
      const chunk = 0x8000; // 32k chars per call, safely under every engine limit
      for (let i = 0; i < bytes.length; i += chunk) {
        binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
      }
      const b64 = btoa(binary);
      const res = await fetch("/api/send_email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          to,
          subject: `Quotation ${header.quote_no || ""} from ${companyName}`,
          html: `<p>Dear ${header.customer_name || "Sir/Madam"},</p>` +
            `<p>Please find the quotation attached.</p>` +
            `<p>Regards,<br/>${companyName}</p>`,
          attachments: [
            {
              filename: `quotation_${header.quote_no || savedId}.pdf`,
              content: b64,
            },
          ],
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast(data?.error || "Email failed", "err");
        return;
      }
      toast(`Quotation emailed to ${to}`, "ok");
    } catch (e: any) {
      toast(String(e?.message ?? e), "err");
    }
  }, [savedId, slug, header.email, header.quote_no, header.customer_name, companyName, toast]);

  // ---- Wire into the shell's global key map -------------------------------
  useConsoleAction("save", save);
  useConsoleAction("back", goBack);
  useConsoleAction("insertRow", addMeasured);
  useConsoleAction("deleteRow", () => removeMeasured(focusedMeasured));
  useConsoleAction("export", downloadPdf);
  useConsoleAction("duplicate", () => void duplicate());

  // ---- Duplicate (Tally's Alt+2) ------------------------------------------
  // Clones this quotation as a fresh draft, then navigates to the new row so
  // the edit never lands on the original.
  const duplicate = useCallback(async () => {
    const sourceId = savedId;
    if (!sourceId) {
      toast("Save the quotation first, then duplicate", "info");
      return;
    }
    try {
      const res = await fetch(`/${slug}/console/quotations/${sourceId}/duplicate`, {
        method: "POST",
        credentials: "same-origin",
      });
      const data = await res.json();
      if (!res.ok) {
        toast(data?.error || "Could not duplicate", "err");
        return;
      }
      toast("Duplicated as new draft — edit the number, then save", "ok");
      router.push(`/${slug}/console/quotations/${data.id}`);
    } catch (e: any) {
      toast(String(e?.message ?? e), "err");
    }
  }, [savedId, slug, router, toast]);

  useConsoleStatus({
    busy: saving,
    dirty,
    count: `${measured.length} measured · ${unmeasured.length} other`,
    total: formatMoney(totals.grandTotal),
    hints: [
      { keys: "Ctrl+S", label: "Save" },
      { keys: "Alt+I", label: "Add row" },
      { keys: "Alt+X", label: "Delete row" },
      { keys: "Esc", label: "Back" },
    ],
  });

  /**
   * Spreadsheet keyboard model inside the item grid.
   *
   * Enter moves DOWN the same column rather than submitting, because entering a
   * quotation means filling one column at a time (all the widths, then all the
   * heights). On the last row Enter appends a new one — so a whole quotation is
   * typed without ever reaching for the mouse.
   */
  const onGridKeyDown = useCallback(
    (e: React.KeyboardEvent, rowIndex: number, colName: string) => {
      if (e.key === "Enter") {
        e.preventDefault();
        if (rowIndex === measured.length - 1) {
          addMeasured();
          return;
        }
        const el = gridRef.current?.querySelector<HTMLInputElement>(
          `tr[data-r="${rowIndex + 1}"] input[data-c="${colName}"]`,
        );
        el?.focus();
        el?.select();
        setFocusedMeasured(rowIndex + 1);
      } else if (e.key === "ArrowDown" && rowIndex < measured.length - 1) {
        e.preventDefault();
        const el = gridRef.current?.querySelector<HTMLInputElement>(
          `tr[data-r="${rowIndex + 1}"] input[data-c="${colName}"]`,
        );
        el?.focus();
        setFocusedMeasured(rowIndex + 1);
      } else if (e.key === "ArrowUp" && rowIndex > 0) {
        e.preventDefault();
        const el = gridRef.current?.querySelector<HTMLInputElement>(
          `tr[data-r="${rowIndex - 1}"] input[data-c="${colName}"]`,
        );
        el?.focus();
        setFocusedMeasured(rowIndex - 1);
      }
    },
    [measured.length, addMeasured],
  );

  return (
    <div className="vc-split">
      {/* ================= LEFT: entry ================= */}
      <div className="vc-split-left">
        <div className="vc-card">
          <div className="vc-card-head">
            <button type="button" className="vc-btn vc-btn-sm" onClick={goBack}>
              <ArrowLeft size={12} /> Back
            </button>
            <span className="vc-card-title">
              {savedId ? "Edit Quotation" : "New Quotation"}
            </span>
            <div style={{ flex: 1 }} />
            {savedId && (
              <button
                type="button"
                className="vc-btn vc-btn-sm"
                onClick={() => void duplicate()}
                title="Duplicate as new draft (Alt+D)"
              >
                <FileText size={12} /> Duplicate <span className="vc-kbd">Alt D</span>
              </button>
            )}
            <button
              type="button"
              className="vc-btn vc-btn-sm"
              onClick={() => window.print()}
              title="Print preview"
            >
              <Printer size={12} /> <span className="vc-kbd">Ctrl P</span>
            </button>
            <button
              type="button"
              className="vc-btn vc-btn-sm"
              onClick={() => void emailQuote()}
              title="Email the saved quotation as a PDF"
            >
              <Mail size={12} /> Email
            </button>
            <button
              type="button"
              className="vc-btn vc-btn-sm"
              onClick={() => void downloadPdf()}
              title="Download as PDF (Ctrl+E)"
            >
              <Download size={12} /> PDF <span className="vc-kbd">Ctrl E</span>
            </button>
            <button
              type="button"
              className="vc-btn vc-btn-sm vc-btn-primary"
              onClick={() => void save()}
              disabled={saving}
            >
              {saving ? <span className="vc-spinner" /> : <Save size={12} />} Save{" "}
              <span className="vc-kbd">Ctrl S</span>
            </button>
          </div>

          {/* Header: 3 columns, everything visible. No wizard, no accordion. */}
          <div className="vc-hdr-grid">
            <div className="vc-field vc-span-2">
              <label className="vc-label">
                Customer <span className="vc-req">*</span>
              </label>
              <input
                className={"vc-input" + (fieldErrors.customer_name ? " vc-invalid" : "")}
                value={header.customer_name}
                onChange={(e) => setHeaderField("customer_name", e.target.value)}
                placeholder="Customer name"
                autoFocus
              />
              {fieldErrors.customer_name && (
                <span className="vc-err">{fieldErrors.customer_name}</span>
              )}
            </div>

            <div className="vc-field">
              <label className="vc-label">Quote No</label>
              <input
                className="vc-input"
                value={header.quote_no}
                onChange={(e) => setHeaderField("quote_no", e.target.value)}
                placeholder="Auto / manual"
              />
            </div>

            <div className="vc-field">
              <label className="vc-label">Phone</label>
              <input
                className="vc-input"
                value={header.contact_no}
                onChange={(e) => setHeaderField("contact_no", e.target.value)}
                inputMode="tel"
              />
            </div>

            <div className="vc-field">
              <label className="vc-label">Email</label>
              <input
                className="vc-input"
                value={header.email}
                onChange={(e) => setHeaderField("email", e.target.value)}
                inputMode="email"
              />
            </div>

            <div className="vc-field">
              <label className="vc-label">Date</label>
              <input
                type="date"
                className="vc-input"
                value={toDateInputValue(header.date)}
                onChange={(e) => setHeaderField("date", e.target.value)}
              />
            </div>

            <div className="vc-field vc-span-2">
              <label className="vc-label">Address</label>
              <input
                className="vc-input"
                value={header.address}
                onChange={(e) => setHeaderField("address", e.target.value)}
              />
            </div>

            <div className="vc-field">
              <label className="vc-label">Status</label>
              <select
                className="vc-select"
                value={header.status}
                onChange={(e) => setHeaderField("status", e.target.value)}
              >
                {QUOTATION_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s.charAt(0).toUpperCase() + s.slice(1)}
                  </option>
                ))}
              </select>
            </div>

            <div className="vc-field">
              <label className="vc-label">Reference</label>
              <input
                className="vc-input"
                value={header.reference}
                onChange={(e) => setHeaderField("reference", e.target.value)}
              />
            </div>

            <div className="vc-field">
              <label className="vc-label">Supplier</label>
              <input
                className="vc-input"
                value={header.supplier_company}
                onChange={(e) => setHeaderField("supplier_company", e.target.value)}
              />
            </div>

            <div className="vc-field">
              <label className="vc-label">Transport (Rs.)</label>
              <input
                className="vc-input vc-num"
                value={header.transport_cost}
                onChange={(e) => setHeaderField("transport_cost", e.target.value)}
                inputMode="decimal"
              />
            </div>
          </div>
        </div>

        {/* ---- Measured items ---- */}
        <div className="vc-card">
          <div className="vc-card-head">
            <span className="vc-card-title">Measured Items</span>
            <div style={{ flex: 1 }} />
            <button type="button" className="vc-btn vc-btn-sm" onClick={addMeasured}>
              <Plus size={12} /> Add row <span className="vc-kbd">Alt I</span>
            </button>
          </div>
          <div style={{ overflowX: "auto" }}>
            <table className="vc-item-grid">
              <thead>
                <tr>
                  <th className="vc-row-num">#</th>
                  <th style={{ width: 70 }}>Code</th>
                  <th style={{ minWidth: 130 }}>Description</th>
                  <th style={{ width: 76 }}>W (mm)</th>
                  <th style={{ width: 76 }}>H (mm)</th>
                  <th style={{ width: 52 }}>Qty</th>
                  <th style={{ width: 66 }}>Sqft</th>
                  <th style={{ width: 78 }}>Rate</th>
                  <th style={{ width: 92 }}>Amount</th>
                  <th className="vc-row-del" />
                </tr>
              </thead>
              <tbody ref={gridRef}>
                {measured.map((row, i) => {
                  // Same functions the server and the PDF use. No local formula.
                  const lineSqft = measuredLineSqft({
                    width: row.width,
                    height: row.height,
                    units: row.units,
                  });
                  const lineTotal = measuredLineTotal({
                    width: row.width,
                    height: row.height,
                    units: row.units,
                    rate: row.rate,
                  });
                  return (
                    <tr
                      key={row.key}
                      data-r={i}
                      className={i === focusedMeasured ? "vc-row-focus" : ""}
                    >
                      <td className="vc-row-num">{i + 1}</td>
                      <td>
                        <input
                          className="vc-cell-input"
                          data-c="code"
                          value={row.code}
                          onFocus={() => setFocusedMeasured(i)}
                          onChange={(e) => updateMeasured(i, "code", e.target.value)}
                          onKeyDown={(e) => onGridKeyDown(e, i, "code")}
                        />
                      </td>
                      <td>
                        <input
                          className="vc-cell-input"
                          data-c="description"
                          value={row.description}
                          onFocus={() => setFocusedMeasured(i)}
                          onChange={(e) => updateMeasured(i, "description", e.target.value)}
                          onKeyDown={(e) => onGridKeyDown(e, i, "description")}
                        />
                      </td>
                      <td>
                        <input
                          className="vc-cell-input vc-num"
                          data-c="width"
                          inputMode="decimal"
                          value={row.width}
                          onFocus={() => setFocusedMeasured(i)}
                          onChange={(e) => updateMeasured(i, "width", e.target.value)}
                          onKeyDown={(e) => onGridKeyDown(e, i, "width")}
                        />
                      </td>
                      <td>
                        <input
                          className="vc-cell-input vc-num"
                          data-c="height"
                          inputMode="decimal"
                          value={row.height}
                          onFocus={() => setFocusedMeasured(i)}
                          onChange={(e) => updateMeasured(i, "height", e.target.value)}
                          onKeyDown={(e) => onGridKeyDown(e, i, "height")}
                        />
                      </td>
                      <td>
                        <input
                          className="vc-cell-input vc-num"
                          data-c="units"
                          inputMode="numeric"
                          value={row.units}
                          onFocus={() => setFocusedMeasured(i)}
                          onChange={(e) => updateMeasured(i, "units", e.target.value)}
                          onKeyDown={(e) => onGridKeyDown(e, i, "units")}
                        />
                      </td>
                      {/* Computed, read-only. Rendering these as inputs would
                          imply the user can set an amount — they cannot, and the
                          server would ignore it anyway. */}
                      <td className="vc-cell-calc">{formatSqft(lineSqft)}</td>
                      <td>
                        <input
                          className="vc-cell-input vc-num"
                          data-c="rate"
                          inputMode="decimal"
                          value={row.rate}
                          onFocus={() => setFocusedMeasured(i)}
                          onChange={(e) => updateMeasured(i, "rate", e.target.value)}
                          onKeyDown={(e) => onGridKeyDown(e, i, "rate")}
                        />
                      </td>
                      <td className="vc-cell-calc vc-amt">{formatAmount(lineTotal)}</td>
                      <td className="vc-row-del">
                        <button
                          type="button"
                          className="vc-icon-btn"
                          onClick={() => removeMeasured(i)}
                          title="Delete row (Alt+X)"
                        >
                          <Trash2 size={12} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* ---- Unmeasured items ---- */}
        <div className="vc-card">
          <div className="vc-card-head">
            <span className="vc-card-title">Other Items (per unit)</span>
            <div style={{ flex: 1 }} />
            <button type="button" className="vc-btn vc-btn-sm" onClick={addUnmeasured}>
              <Plus size={12} /> Add
            </button>
          </div>
          {unmeasured.length === 0 ? (
            <div style={{ padding: 12, fontSize: 12, color: "#8a94a1" }}>
              Hardware, mesh, labour and anything not priced by area.
            </div>
          ) : (
            <table className="vc-item-grid">
              <thead>
                <tr>
                  <th className="vc-row-num">#</th>
                  <th>Description</th>
                  <th style={{ width: 60 }}>Qty</th>
                  <th style={{ width: 88 }}>Rate</th>
                  <th style={{ width: 100 }}>Amount</th>
                  <th className="vc-row-del" />
                </tr>
              </thead>
              <tbody>
                {unmeasured.map((row, i) => (
                  <tr key={row.key}>
                    <td className="vc-row-num">{i + 1}</td>
                    <td>
                      <input
                        className="vc-cell-input"
                        value={row.description}
                        onChange={(e) => updateUnmeasured(i, "description", e.target.value)}
                      />
                    </td>
                    <td>
                      <input
                        className="vc-cell-input vc-num"
                        inputMode="numeric"
                        value={row.units}
                        onChange={(e) => updateUnmeasured(i, "units", e.target.value)}
                      />
                    </td>
                    <td>
                      <input
                        className="vc-cell-input vc-num"
                        inputMode="decimal"
                        value={row.rate}
                        onChange={(e) => updateUnmeasured(i, "rate", e.target.value)}
                      />
                    </td>
                    <td className="vc-cell-calc vc-amt">
                      {formatAmount(unmeasuredLineTotal({ units: row.units, rate: row.rate }))}
                    </td>
                    <td className="vc-row-del">
                      <button
                        type="button"
                        className="vc-icon-btn"
                        onClick={() => removeUnmeasured(i)}
                      >
                        <Trash2 size={12} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {/* Running totals — always visible, never "at the end". */}
          <div className="vc-totals">
            <div className="vc-total-item">
              <span className="vc-total-label">Subtotal</span>
              <span className="vc-total-value">{formatAmount(totals.subtotal)}</span>
            </div>
            <div className="vc-total-item">
              <span className="vc-total-label">Transport</span>
              <span className="vc-total-value">{formatAmount(totals.transport)}</span>
            </div>
            <div className="vc-total-item">
              <span className="vc-total-label">
                <label style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                  <input
                    type="checkbox"
                    checked={header.include_gst}
                    onChange={(e) => setHeaderField("include_gst", e.target.checked)}
                  />
                  GST
                </label>
              </span>
              <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <input
                  className="vc-input vc-num"
                  style={{ width: 52, height: 22, fontSize: 12 }}
                  value={header.gst_percentage}
                  onChange={(e) => setHeaderField("gst_percentage", e.target.value)}
                  disabled={!header.include_gst}
                  inputMode="decimal"
                />
                <span className="vc-total-value">{formatAmount(totals.gstAmount)}</span>
              </span>
            </div>
            <div style={{ flex: 1 }} />
            <div className="vc-total-item vc-total-grand">
              <span className="vc-total-label">Grand Total</span>
              <span className="vc-total-value">{formatMoney(totals.grandTotal)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* ================= RIGHT: live preview ================= */}
      <div className="vc-split-right">
        <LivePreview
          header={header}
          measured={measured}
          unmeasured={unmeasured}
          totals={totals}
          companyName={companyName}
          companyAddress={companyAddress}
          companyContact={companyContact}
          gstNumber={gstNumber}
        />
      </div>
    </div>
  );
}
