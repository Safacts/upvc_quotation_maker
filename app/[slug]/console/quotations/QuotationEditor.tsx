"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Plus, Trash2, Save, ArrowLeft, Printer, UserPlus, Download, Mail, FileText,
  ChevronLeft, ChevronRight, Cuboid, Compass, Share2,
} from "lucide-react";
import { useConsole, useConsoleStatus, useConsoleAction } from "../ConsoleShell";

function WhatsAppIcon({ size = 12 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      style={{ flexShrink: 0 }}
    >
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
    </svg>
  );
}
import { useUnsavedChangesWarning } from "@/lib/hooks/useHotkeys";
import {
  WindowElevationSvg,
  detectWindowElevationType,
  getWindowElevationTitle,
} from "@/lib/window-elevation";
import { loadCursor, locate, type RecordCursor } from "@/lib/record-nav";
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
  const { slug, clientId, toast, openQuickCreate } = useConsole();

  const [header, setHeader] = useState<QuotationHeader>(initial.header);
  const [measured, setMeasured] = useState<MeasuredRow[]>(
    initial.measured.length ? initial.measured : [emptyMeasured()],
  );
  const [unmeasured, setUnmeasured] = useState<UnmeasuredRow[]>(initial.unmeasured);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [focusedMeasured, setFocusedMeasured] = useState(0);
  const [showElevationPreview, setShowElevationPreview] = useState(true);
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

    // Comprehensive client-side validation check
    const errors: Record<string, string> = {};
    if (!header.customer_name.trim()) {
      errors.customer_name = "Customer name is required";
    }
    if (header.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(header.email.trim())) {
      errors.email = "Please enter a valid email address";
    }
    const gst = Number(header.gst_percentage);
    if (header.include_gst && (isNaN(gst) || gst < 0 || gst > 100)) {
      errors.gst_percentage = "GST must be between 0% and 100%";
    }
    const transport = Number(header.transport_cost);
    if (header.transport_cost && (isNaN(transport) || transport < 0)) {
      errors.transport_cost = "Transport cost cannot be negative";
    }

    // Check measured items for negative numbers or invalid values
    for (let i = 0; i < measured.length; i++) {
      const m = measured[i];
      if (m.code || m.description || m.width || m.height || m.rate) {
        const w = Number(m.width);
        const h = Number(m.height);
        const r = Number(m.rate);
        const u = Number(m.units);
        if (m.width && (isNaN(w) || w < 0)) {
          errors.measured = `Row ${i + 1}: Width cannot be negative`;
          break;
        }
        if (m.height && (isNaN(h) || h < 0)) {
          errors.measured = `Row ${i + 1}: Height cannot be negative`;
          break;
        }
        if (m.rate && (isNaN(r) || r < 0)) {
          errors.measured = `Row ${i + 1}: Rate cannot be negative`;
          break;
        }
        if (m.units && (isNaN(u) || u < 0)) {
          errors.measured = `Row ${i + 1}: Units cannot be negative`;
          break;
        }
      }
    }

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      const firstError = Object.values(errors)[0];
      toast(firstError, "err");
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
      setLastAutoSavedAt(new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }));
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

  const [lastAutoSavedAt, setLastAutoSavedAt] = useState<string | null>(null);

  // ---- Auto-save (draft only, debounced) ----------------------------------
  // 2s after last edit, if dirty + already saved once (has savedId), silently
  // PATCH. No toast — status bar shows state. Never for brand-new unsaved.
  useEffect(() => {
    if (!dirty || !savedId || saving) return;
    // Don't auto-save invalid header — would spam validation errors.
    if (!header.customer_name.trim()) return;
    const t = setTimeout(async () => {
      // Re-check guard inside timeout (dirty may have been cleared manually).
      if (saving) return;
      try {
        setSaving(true);
        const payload = {
          ...header,
          measured_items: measured
            .filter((m) => m.code || m.description || m.width || m.height || m.rate)
            .map((m) => ({ code: m.code, description: m.description, glass: m.glass, width: m.width, height: m.height, units: m.units, rate: m.rate })),
          unmeasured_items: unmeasured.filter((u) => u.description || u.rate).map((u) => ({ description: u.description, units: u.units, rate: u.rate })),
        };
        const res = await fetch(`/api/console/quotations/${savedId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, credentials: "same-origin", body: JSON.stringify(payload) });
        if (res.ok) {
          setDirty(false);
          setLastAutoSavedAt(new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }));
        }
      } catch {}
      finally { setSaving(false); }
    }, 1500);
    return () => clearTimeout(t);
  }, [dirty, savedId, saving, header, measured, unmeasured]);

  const goBack = useCallback(() => {
    // Esc is Tally's Ctrl+Q (quit without saving) — but silently discarding a
    // half-typed 20-line quotation would be unforgivable, so it always asks.
    if (dirty && !window.confirm("Discard unsaved changes?")) return;
    router.push(`/${slug}/console/quotations`);
  }, [dirty, router, slug]);

  // ---- PgUp / PgDn: walk the list without returning to it -----------------
  //
  // THE point of this feature: in Tally you open a voucher, press PgDn, and you
  // are in the next one. Reviewing thirty quotations is thirty keystrokes, not
  // ninety navigations. The grid published the ordered id list it was showing
  // (see record-nav.ts); we read it once on mount and resolve neighbours
  // locally, so moving between records costs ONE request — the next record's.
  //
  // Read in an effect, not in a `useState` initialiser: sessionStorage does not
  // exist during SSR, and touching it there is an immediate crash.
  const [cursor, setCursor] = useState<RecordCursor | null>(null);
  useEffect(() => {
    setCursor(loadCursor(clientId, "quotations"));
  }, [clientId]);

  const nav = useMemo(
    // Page size is only used to caption "record 74 of 210"; navigation itself
    // does not depend on it. The cursor stores the page it came from.
    () => locate(cursor, savedId || "", 50),
    [cursor, savedId],
  );

  const goToRecord = useCallback(
    (id: string | null) => {
      if (!id) return;
      // The unsaved-changes prompt applies here exactly as it does to Esc —
      // paging to the next quotation is still leaving this one.
      if (dirty && !window.confirm("Discard unsaved changes?")) return;
      router.push(`/${slug}/console/quotations/${id}`);
    },
    [dirty, router, slug],
  );

  // ---- Alt+C: create a master from inside the form ------------------------
  //
  // The editor is the screen where this shortcut earns its keep, and it is also
  // the only screen with enough context to choose WHICH master: if the caret is
  // in the item grid the user means a product, otherwise a customer. Getting
  // that right is the difference between one keystroke and backing out of the
  // wrong dialog.
  const quickCreateFromContext = useCallback(() => {
    const active = document.activeElement as HTMLElement | null;
    const inItemGrid = !!active && !!gridRef.current?.contains(active);

    if (inItemGrid) {
      // Seed from the description cell the user is filling in.
      const rowEl = active?.closest("tr");
      const desc = rowEl?.querySelector<HTMLTextAreaElement>('[data-c="description"]');
      openQuickCreate("product", (desc?.value || "").trim(), (row) => {
        // Write the new product straight into the focused row so the user does
        // not have to retype what they just typed into the dialog.
        const idx = Number(rowEl?.getAttribute("data-r"));
        if (!Number.isFinite(idx)) return;
        setMeasured((rows) =>
          rows.map((r, i) =>
            i === idx
              ? {
                  ...r,
                  description: row.description || row.name || r.description,
                  code: r.code || row.name || "",
                  rate: r.rate || (row.price != null ? String(row.price) : ""),
                }
              : r,
          ),
        );
        markDirty();
      });
      return;
    }

    openQuickCreate("customer", header.customer_name.trim(), (row) => {
      // Fill the header from the new master. Blank fields only — never
      // overwrite something the user has already typed with master data.
      setHeader((h) => ({
        ...h,
        customer_name: row.name || h.customer_name,
        contact_no: h.contact_no || row.phone || "",
        email: h.email || row.email || "",
        address: h.address || row.address || "",
        // The FK link. `customer_name` still stays as the historical snapshot
        // printed on the PDF — see console-schemas.ts.
        customer_id: row.id || h.customer_id,
      }));
      markDirty();
    });
  }, [openQuickCreate, header.customer_name, markDirty]);

  // ---- PDF download --------------------------------------------------------
  // Opens the PDF route in a new tab. The route re-reads the stored row, so the
  // download always reflects the last saved state — never the unsaved draft.
  const downloadPdf = useCallback(() => {
    if (!savedId) {
      toast("Save the quotation first to generate a PDF", "info");
      return;
    }
    const cParam = clientId ? `?client_id=${encodeURIComponent(clientId)}` : "";
    window.open(`/api/console/quotations/${savedId}/pdf${cParam}`, "_blank", "noopener,noreferrer");
  }, [savedId, slug, clientId, toast]);

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
      const cParam = clientId ? `?client_id=${encodeURIComponent(clientId)}` : "";
      const pdfRes = await fetch(`/api/console/quotations/${savedId}/pdf${cParam}`, {
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

  // ---- Share link & WhatsApp ----------------------------------------------
  const [sharing, setSharing] = useState(false);
  const shareQuote = useCallback(async (openWhatsApp = false) => {
    if (!savedId) {
      toast("Save the quotation first to generate a share link", "info");
      return;
    }
    setSharing(true);
    try {
      const res = await fetch(`/api/quotation/${savedId}/token`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-client-id": clientId },
        body: JSON.stringify({ client_id: clientId }),
      });
      const data = await res.json();
      if (!res.ok || !data.token) {
        toast(data.error || "Failed to generate share link", "err");
        return;
      }
      const shareUrl = `${window.location.origin}/quote/${savedId}?token=${data.token}`;
      if (typeof navigator !== "undefined" && navigator.clipboard) {
        await navigator.clipboard.writeText(shareUrl);
      }
      toast("Share link copied to clipboard!", "ok");

      if (openWhatsApp) {
        const text = `*QUOTATION — ${header.quote_no || "UPVC Quote"}*\n\nDear ${header.customer_name || "Customer"},\nPlease review your quotation and 2D CAD window elevation diagrams here:\n🔗 ${shareUrl}\n\nThank you,\n${companyName || clientId}`;
        const phone = (header.contact_no || "").replace(/[^0-9]/g, "");
        const waUrl = phone
          ? `https://wa.me/${phone.length === 10 ? "91" + phone : phone}?text=${encodeURIComponent(text)}`
          : `https://wa.me/?text=${encodeURIComponent(text)}`;
        window.open(waUrl, "_blank", "noopener,noreferrer");
      }
    } catch (e: any) {
      toast(String(e?.message ?? e), "err");
    } finally {
      setSharing(false);
    }
  }, [savedId, clientId, header.quote_no, header.customer_name, header.contact_no, companyName, toast]);

  // ---- Wire into the shell's global key map -------------------------------
  useConsoleAction("save", save);
  useConsoleAction("back", goBack);
  useConsoleAction("insertRow", addMeasured);
  useConsoleAction("deleteRow", () => removeMeasured(focusedMeasured));
  useConsoleAction("export", downloadPdf);
  useConsoleAction("duplicate", () => void duplicate());
  useConsoleAction("quickCreate", quickCreateFromContext);
  // PgUp/PgDn = previous/next QUOTATION. Registered as null when there is no
  // rail (a deep link, or a brand-new unsaved quotation) so the shell does
  // nothing rather than pretending — see the "declared but unused" lesson.
  useConsoleAction("prevRecord", nav.prevId ? () => goToRecord(nav.prevId) : null);
  useConsoleAction("nextRecord", nav.nextId ? () => goToRecord(nav.nextId) : null);

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
    count:
      `${measured.length} measured · ${unmeasured.length} other` +
      (nav.index >= 0 ? ` · record ${nav.position} of ${nav.total}` : "") +
      (lastAutoSavedAt ? ` · auto-saved ${lastAutoSavedAt}` : dirty ? " · unsaved" : ""),
    total: formatMoney(totals.grandTotal),
    hints: [
      { keys: "Ctrl+S", label: "Save" },
      { keys: "Alt+I", label: "Add row" },
      { keys: "Alt+X", label: "Delete row" },
      { keys: "Alt+C", label: "New master" },
      { keys: "Ctrl+/", label: "Calculator" },
      ...(nav.index >= 0
        ? [{ keys: "PgUp/PgDn", label: "Prev/next quote" }]
        : []),
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
      // In the description textarea, let Enter insert a newline naturally — do
      // NOT preventDefault or we break multiline descriptions. Arrow keys still
      // navigate between rows, and Shift+Enter also works for newlines.
      if (e.key === "Enter" && colName === "description") {
        return;
      }
      if (e.key === "Enter") {
        e.preventDefault();
        if (rowIndex === measured.length - 1) {
          addMeasured();
          return;
        }
        // The description column is a textarea, not an input — broaden the
        // selector so arrow/Enter navigation from description lands on the
        // next row's description textarea (or any other cell) correctly.
        const el = gridRef.current?.querySelector<HTMLElement>(
          `tr[data-r="${rowIndex + 1}"] [data-c="${colName}"]`,
        );
        el?.focus();
        if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
          el.select();
        }
        setFocusedMeasured(rowIndex + 1);
      } else if (e.key === "ArrowDown" && rowIndex < measured.length - 1) {
        e.preventDefault();
        const el = gridRef.current?.querySelector<HTMLElement>(
          `tr[data-r="${rowIndex + 1}"] [data-c="${colName}"]`,
        );
        el?.focus();
        setFocusedMeasured(rowIndex + 1);
      } else if (e.key === "ArrowUp" && rowIndex > 0) {
        e.preventDefault();
        const el = gridRef.current?.querySelector<HTMLElement>(
          `tr[data-r="${rowIndex - 1}"] [data-c="${colName}"]`,
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
          <div className="vc-card-head vc-card-head-editor">
            <div className="vc-card-head-left">
              <button type="button" className="vc-btn vc-btn-sm" onClick={goBack}>
                <ArrowLeft size={12} /> Back
              </button>
              <span className="vc-card-title">
                {savedId ? "Edit Quotation" : "New Quotation"}
              </span>

              {/* The PgUp/PgDn rail, made visible. The keyboard is the fast path,
                  but a user who does not yet know the shortcut needs to see that
                  stepping through records is possible at all — and the caption is
                  where they learn the key. */}
              {nav.index >= 0 && (
                <div className="vc-recnav">
                  <button
                    type="button"
                    className="vc-icon-btn"
                    onClick={() => goToRecord(nav.prevId)}
                    disabled={!nav.prevId}
                    title={
                      nav.prevId
                        ? "Previous quotation (PgUp)"
                        : nav.atPageStart
                          ? "Start of this page — go back to the list for earlier records"
                          : "First record"
                    }
                  >
                    <ChevronLeft size={12} />
                  </button>
                  <span className="vc-recnav-label">
                    {nav.position} / {nav.total}
                  </span>
                  <button
                    type="button"
                    className="vc-icon-btn"
                    onClick={() => goToRecord(nav.nextId)}
                    disabled={!nav.nextId}
                    title={
                      nav.nextId
                        ? "Next quotation (PgDn)"
                        : nav.atPageEnd
                          ? "End of this page — go back to the list for more"
                          : "Last record"
                    }
                  >
                    <ChevronRight size={12} />
                  </button>
                </div>
              )}
            </div>

            <div className="vc-card-actions">
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
              {savedId && (
                <button
                  type="button"
                  className="vc-btn vc-btn-sm"
                  onClick={() =>
                    window.open(
                      `/upvc/3d-viewer?fromQuotation=${savedId}`,
                      "_blank",
                      "noopener,noreferrer",
                    )
                  }
                  title="Open the measured opening as a 3D model"
                >
                  <Cuboid size={12} /> 3D
                </button>
              )}
              <button
                type="button"
                className="vc-btn vc-btn-sm"
                onClick={() => window.print()}
                title="Print preview (Ctrl+P)"
              >
                <Printer size={12} /> Print <span className="vc-kbd">Ctrl P</span>
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
                onClick={() => void shareQuote(false)}
                disabled={sharing}
                title="Copy customer confirmation & CAD link"
              >
                <Share2 size={12} /> {sharing ? "Sharing..." : "Share Link"}
              </button>
              <button
                type="button"
                className="vc-btn vc-btn-sm"
                onClick={() => void shareQuote(true)}
                disabled={sharing}
                title="Share quotation & CAD elevation diagrams on WhatsApp"
                style={{ color: "#16a34a" }}
              >
                <WhatsAppIcon size={13} /> WhatsApp
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
                title="Save quotation (Ctrl+S)"
              >
                {saving ? <span className="vc-spinner" /> : <Save size={12} />} Save{" "}
                <span className="vc-kbd">Ctrl S</span>
              </button>
            </div>
          </div>

          {/* Header: 3 columns, everything visible. No wizard, no accordion. */}
          <div className="vc-hdr-grid">
            <div className="vc-field vc-span-2">
              <label className="vc-label">
                Customer <span className="vc-req">*</span>
                {/* Alt+C is the whole point of this affordance: the user is
                    already typing a name that is not on file, and this saves
                    them abandoning the quotation to go and create it. */}
                <button
                  type="button"
                  className="vc-inline-add"
                  onClick={quickCreateFromContext}
                  title="Add this customer to the master (Alt+C)"
                >
                  <UserPlus size={11} /> Add <span className="vc-kbd">Alt C</span>
                </button>
              </label>
              <input
                className={"vc-input" + (fieldErrors.customer_name ? " vc-invalid" : "")}
                value={header.customer_name}
                onChange={(e) => setHeaderField("customer_name", e.target.value)}
                placeholder="Customer name"
                // Not arithmetic — keep Ctrl+/ out of a name field.
                data-calc="off"
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
                className={"vc-input" + (fieldErrors.contact_no ? " vc-invalid" : "")}
                value={header.contact_no}
                onChange={(e) => setHeaderField("contact_no", e.target.value)}
                inputMode="tel"
              />
              {fieldErrors.contact_no && (
                <span className="vc-err">{fieldErrors.contact_no}</span>
              )}
            </div>

            <div className="vc-field">
              <label className="vc-label">Email</label>
              <input
                className={"vc-input" + (fieldErrors.email ? " vc-invalid" : "")}
                value={header.email}
                onChange={(e) => setHeaderField("email", e.target.value)}
                inputMode="email"
              />
              {fieldErrors.email && (
                <span className="vc-err">{fieldErrors.email}</span>
              )}
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
                className={"vc-input" + (fieldErrors.address ? " vc-invalid" : "")}
                value={header.address}
                onChange={(e) => setHeaderField("address", e.target.value)}
              />
              {fieldErrors.address && (
                <span className="vc-err">{fieldErrors.address}</span>
              )}
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
                className={"vc-input vc-num" + (fieldErrors.transport_cost ? " vc-invalid" : "")}
                value={header.transport_cost}
                onChange={(e) => setHeaderField("transport_cost", e.target.value)}
                inputMode="decimal"
                // Names the field in the calculator's header so the popover
                // says what it will write into.
                data-calc-label="Transport"
              />
              {fieldErrors.transport_cost && (
                <span className="vc-err">{fieldErrors.transport_cost}</span>
              )}
            </div>
          </div>
        </div>

        {/* ---- Measured items ---- */}
        <div className="vc-card">
          <div className="vc-card-head">
            <span className="vc-card-title">Measured Items</span>
            <div style={{ flex: 1 }} />
            <button
              type="button"
              className={`vc-btn vc-btn-sm ${showElevationPreview ? "vc-btn-primary" : ""}`}
              style={{ fontSize: 11, display: "inline-flex", alignItems: "center", gap: 4, marginRight: 6 }}
              onClick={() => setShowElevationPreview((prev) => !prev)}
              title="Toggle live 2D CAD window elevation preview for active row"
            >
              <Compass size={12} /> {showElevationPreview ? "Hide 2D CAD" : "Show 2D CAD"}
            </button>
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
                        <textarea
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
                          data-calc-label={`Rate, row ${i + 1}`}
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

          {/* Live 2D CAD Elevation Preview for Focused/Active Row */}
          {showElevationPreview && measured[focusedMeasured] && (
            <div
              style={{
                marginTop: 10,
                padding: "10px 14px",
                background: "#f8fafc",
                border: "1px solid #e2e8f0",
                borderRadius: 6,
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 16,
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                  <span
                    style={{
                      fontSize: 10,
                      fontWeight: 700,
                      textTransform: "uppercase",
                      letterSpacing: "0.05em",
                      color: "#C44A10",
                      background: "#FFF3E6",
                      padding: "2px 6px",
                      borderRadius: 4,
                    }}
                  >
                    Row {focusedMeasured + 1} CAD Elevation
                  </span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: "#1a202c" }}>
                    {getWindowElevationTitle(
                      detectWindowElevationType(
                        measured[focusedMeasured].description || measured[focusedMeasured].code,
                      ),
                      focusedMeasured + 1,
                    )}
                  </span>
                </div>
                <div style={{ fontSize: 11, color: "#4a5568", marginBottom: 2 }}>
                  Dimensions: <b>{measured[focusedMeasured].width || 0} × {measured[focusedMeasured].height || 0} mm</b> · Area:{" "}
                  <b>
                    {formatSqft(
                      measuredLineSqft({
                        width: measured[focusedMeasured].width,
                        height: measured[focusedMeasured].height,
                        units: measured[focusedMeasured].units,
                      }),
                    )}{" "}
                    sqft
                  </b>{" "}
                  · Qty: <b>{measured[focusedMeasured].units || 1}</b>
                </div>
                <div style={{ fontSize: 10, color: "#718096" }}>
                  Live architectural elevation with CAD dimension witness lines. Updates as you type width, height & description.
                </div>
              </div>
              <div
                style={{
                  background: "#ffffff",
                  border: "1px solid #e2e8f0",
                  borderRadius: 6,
                  padding: 4,
                  display: "flex",
                  justifyContent: "center",
                  boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
                }}
              >
                <WindowElevationSvg
                  widthMm={Number(measured[focusedMeasured].width) || 1000}
                  heightMm={Number(measured[focusedMeasured].height) || 1000}
                  description={measured[focusedMeasured].description || measured[focusedMeasured].code}
                  itemIndex={focusedMeasured + 1}
                  targetWidth={200}
                  targetHeight={210}
                />
              </div>
            </div>
          )}
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
                  // Calculator OFF here deliberately: in a GST-percent box
                  // "18" already means 18%, so the calculator's contextual `+
                  // 18%` semantics would mean something different from what
                  // the field says. Ambiguity in a tax field is not worth the
                  // convenience.
                  data-calc="off"
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
          focusedIndex={focusedMeasured}
        />
      </div>
    </div>
  );
}
