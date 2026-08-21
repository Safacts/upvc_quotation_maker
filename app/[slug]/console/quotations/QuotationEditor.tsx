"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
// Pure, serializable editor types + helpers live in a plain (non-"use client")
// module so the server component `new/page.tsx` can call `blankHeader` without
// tripping Next.js's "Cannot call a Client Function from a Server Component".
import {
  blankHeader,
  emptyMeasured,
  emptyUnmeasured,
  type MeasuredRow,
  type UnmeasuredRow,
  type QuotationHeader,
  type EditorInitial,
  type WindowBom,
} from "@/lib/quotation-editor";
export { emptyBom } from "@/lib/quotation-editor";
import {
  Plus, Trash2, Save, ArrowLeft, Printer, UserPlus, Download, Mail, FileText,
<<<<<<< Updated upstream
  ChevronLeft, ChevronRight, ChevronDown, Copy, Box,
=======
  ChevronLeft, ChevronRight, Cuboid,
>>>>>>> Stashed changes
} from "lucide-react";
import { useConsole, useConsoleStatus, useConsoleAction } from "../ConsoleShell";
import { useUnsavedChangesWarning } from "@/lib/hooks/useHotkeys";
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
import PhotoAttachments from "./PhotoAttachments";

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

// Re-export the editor types so existing importers (e.g. EditQuotationClient.tsx,
// which does `import type { ... } from "../QuotationEditor"`) keep working.
export type {
  MeasuredRow,
  UnmeasuredRow,
  QuotationHeader,
  EditorInitial,
};

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
  const [bomOpen, setBomOpen] = useState<Record<string, boolean>>({});
  const [savedId, setSavedId] = useState<string | null>(quotationId);

  // ---- Customer picker (Feature A: autofill from masters) -----------------
  const [customerOpen, setCustomerOpen] = useState(false);
  const [customerQuery, setCustomerQuery] = useState("");
  const [customerResults, setCustomerResults] = useState<
    { id: string; name: string; phone?: string; company?: string }[]
  >([]);
  const [customerLoading, setCustomerLoading] = useState(false);
  const customerBoxRef = useRef<HTMLDivElement>(null);

  // ---- Item templates + measured quick actions (Feature B) ----------------
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [templates, setTemplates] = useState<{ id: string; name: string }[]>([]);
  const templateBoxRef = useRef<HTMLDivElement>(null);
  const [applyW, setApplyW] = useState("");
  const [applyH, setApplyH] = useState("");
  const [applyRate, setApplyRate] = useState("");
  const [applyGlass, setApplyGlass] = useState("");
  const [applyWithRate, setApplyWithRate] = useState(false);

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

  const updateBom = useCallback(
    (index: number, patch: { profile?: Partial<WindowBom["profile"]>; glass?: Partial<WindowBom["glass"]>; hardware?: WindowBom["hardware"] }) => {
      setMeasured((rows) => rows.map((r, i) => i === index ? {
        ...r,
        bom: {
          ...r.bom,
          ...patch,
          profile: { ...r.bom.profile, ...(patch.profile || {}) },
          glass: { ...r.bom.glass, ...(patch.glass || {}) },
        },
      } : r));
      markDirty();
    },
    [markDirty],
  );

  const updateHardware = useCallback(
    (index: number, value: string) => {
      updateBom(index, { hardware: value.trim() ? [{ name: value, quantity: "1" }] : [] });
    },
    [updateBom],
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

  // ---- Feature A: customer picker ----------------------------------------
  const fetchCustomers = useCallback(async (q: string) => {
    setCustomerLoading(true);
    try {
      const res = await fetch(
        `/api/console/customers?q=${encodeURIComponent(q)}&page_size=20`,
        { credentials: "same-origin" },
      );
      if (!res.ok) {
        setCustomerResults([]);
        return;
      }
      const data = await res.json();
      setCustomerResults(Array.isArray(data.rows) ? data.rows : []);
    } catch {
      setCustomerResults([]);
    } finally {
      setCustomerLoading(false);
    }
  }, []);

  const selectCustomer = useCallback(
    async (cid: string) => {
      try {
        const res = await fetch(`/api/console/customers/${cid}`, { credentials: "same-origin" });
        if (!res.ok) return;
        const data = await res.json();
        // Autofill header. Blank fields only — never overwrite what the user
        // already typed. `gstin` maps onto `reference` (the header has no gstin
        // column); the FK `customer_id` links the master for later lookups.
        setHeader((h) => ({
          ...h,
          customer_name: data.name || h.customer_name,
          contact_no: data.contact_no || h.contact_no,
          email: data.email || h.email,
          address: data.address || h.address,
          reference: h.reference || data.gstin || h.reference,
          customer_id: data.id || h.customer_id,
        }));
        // Bonus: seed a default glass on rows that have none yet.
        if (data.preferred_glass) {
          setMeasured((rows) =>
            rows.map((r) => (r.glass ? r : { ...r, glass: data.preferred_glass })),
          );
        }
        markDirty();
        setCustomerOpen(false);
      } catch {
        // Non-fatal: the user can still type manually.
      }
    },
    [markDirty],
  );

  useEffect(() => {
    if (customerOpen) void fetchCustomers(customerQuery);
  }, [customerOpen, customerQuery, fetchCustomers]);
  useEffect(() => {
    if (!customerOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (customerBoxRef.current && !customerBoxRef.current.contains(e.target as Node)) {
        setCustomerOpen(false);
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [customerOpen]);

  // ---- Feature B: item templates + measured quick actions -----------------
  const loadTemplates = useCallback(async () => {
    try {
      const res = await fetch("/api/console/item-templates", { credentials: "same-origin" });
      if (!res.ok) {
        setTemplates([]);
        return;
      }
      const data = await res.json();
      setTemplates(Array.isArray(data.templates) ? data.templates : []);
    } catch {
      setTemplates([]);
    }
  }, []);

  useEffect(() => {
    if (templatesOpen) void loadTemplates();
  }, [templatesOpen, loadTemplates]);
  useEffect(() => {
    if (!templatesOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (templateBoxRef.current && !templateBoxRef.current.contains(e.target as Node)) {
        setTemplatesOpen(false);
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [templatesOpen]);

  const insertTemplate = useCallback(
    (t: any) => {
      // name -> description, window_type -> code, width_mm/height_mm -> width/height,
      // quantity -> units, rate/glass straight through. Inserts a NEW measured row.
      const row: MeasuredRow = {
        ...emptyMeasured(),
        description: t.name || t.description || "",
        code: t.window_type || "",
        width: t.width_mm != null && t.width_mm !== "" ? String(t.width_mm) : "",
        height: t.height_mm != null && t.height_mm !== "" ? String(t.height_mm) : "",
        units: t.quantity != null && t.quantity !== "" ? String(t.quantity) : "1",
        rate: t.rate != null && t.rate !== "" ? String(t.rate) : "",
        glass: t.glass || "",
      };
      setMeasured((rows) => [...rows, row]);
      setTemplatesOpen(false);
      markDirty();
    },
    [markDirty],
  );

  const duplicateMeasured = useCallback(
    (index: number) => {
      setMeasured((rows) => {
        const src = rows[index];
        if (!src) return rows;
        // Copy description/glass/rate; W/H carried over so the user can tweak.
        const copy: MeasuredRow = {
          ...emptyMeasured(),
          description: src.description,
          glass: src.glass,
          width: src.width,
          height: src.height,
          units: src.units,
          rate: src.rate,
        };
        const next = [...rows];
        next.splice(index + 1, 0, copy);
        return next;
      });
      markDirty();
    },
    [markDirty],
  );

  const applyToAllRows = useCallback(() => {
    if (!applyW.trim() && !applyH.trim()) {
      toast("Enter at least a width or height to apply", "info");
      return;
    }
    setMeasured((rows) =>
      rows.map((r) => ({
        ...r,
        width: applyW.trim() ? applyW.trim() : r.width,
        height: applyH.trim() ? applyH.trim() : r.height,
        ...(applyWithRate ? { rate: applyRate.trim(), glass: applyGlass.trim() } : {}),
      })),
    );
    markDirty();
  }, [applyW, applyH, applyRate, applyGlass, applyWithRate, markDirty, toast]);

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
            bom: m.bom,
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
    window.open(`/api/console/quotations/${savedId}/pdf`, "_blank", "noopener,noreferrer");
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
      const pdfRes = await fetch(`/api/console/quotations/${savedId}/pdf`, {
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
      // "Record 74 of 210" is the Tally caption that tells a reviewer how far
      // through the batch they are. Only shown when a rail actually exists.
      (nav.index >= 0 ? ` · record ${nav.position} of ${nav.total}` : ""),
    total: formatMoney(totals.grandTotal),
    hints: [
      { keys: "Ctrl+S", label: "Save" },
      { keys: "Alt+I", label: "Add row" },
      { keys: "Alt+X", label: "Delete row" },
      { keys: "Alt+C", label: "Add customer/product" },
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
          <div className="vc-card-head">
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
            {savedId && (
              <button
                type="button"
                className="vc-btn vc-btn-sm"
                onClick={() =>
<<<<<<< Updated upstream
                  window.open(`/upvc/3d-viewer?fromQuotation=${savedId}`, "_blank", "noopener,noreferrer")
                }
                title="Open this quotation in the 3D window viewer"
              >
                <Box size={12} /> View in 3D
=======
                  window.open(
                    `/upvc/3d-viewer?fromQuotation=${savedId}`,
                    "_blank",
                    "noopener,noreferrer",
                  )
                }
                title="Open the measured opening as a 3D model"
              >
                <Cuboid size={12} /> 3D
>>>>>>> Stashed changes
              </button>
            )}
            <button
              type="button"
              className="vc-btn vc-btn-sm"
              onClick={() => {
                if (!savedId) {
                  toast("Save the quotation first to print", "info");
                  return;
                }
                window.open(`/api/console/quotations/${savedId}/pdf`, "_blank", "noopener,noreferrer");
              }}
              title="Open PDF for printing"
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

          {/* Header: 4-column grid — Row 1: who, Row 2: contact, Row 3: job context.
               Separator divs create a visual break between groups without headings. */}
          <div className="vc-hdr-grid">

            {/* ── Row 1: Core identity ── */}
            <div className="vc-field vc-span-2">
              <label className="vc-label">
                Customer <span className="vc-req">*</span>
                <button
                  type="button"
                  className="vc-inline-add"
                  onClick={quickCreateFromContext}
                  title="Add this customer to masters (Alt+C)"
                >
                  <UserPlus size={11} /> Add <span className="vc-kbd">Alt C</span>
                </button>
              </label>
              {/* Customer picker (Feature A): combobox over existing masters that
                  autofills the header on select. The free-text input + Alt+C
                  quick-create below stay fully functional. */}
              <div style={{ position: "relative" }} ref={customerBoxRef}>
                <div style={{ display: "flex", gap: 6 }}>
                  <input
                    className={"vc-input" + (fieldErrors.customer_name ? " vc-invalid" : "")}
                    style={{ flex: 1 }}
                    value={header.customer_name}
                    onChange={(e) => setHeaderField("customer_name", e.target.value)}
                    placeholder="Customer name"
                    data-calc="off"
                    autoFocus
                  />
                  <button
                    type="button"
                    className="vc-btn vc-btn-sm"
                    onClick={() => setCustomerOpen((o) => !o)}
                    title="Pick an existing customer to autofill details"
                  >
                    Pick <ChevronDown size={12} />
                  </button>
                </div>
                {customerOpen && (
                  <div
                    style={{
                      position: "absolute",
                      top: "100%",
                      left: 0,
                      right: 0,
                      zIndex: 50,
                      marginTop: 4,
                      background: "#fff",
                      border: "1px solid #FFEDD5",
                      borderRadius: 8,
                      boxShadow: "0 8px 24px rgba(124,45,18,0.15)",
                      maxHeight: 280,
                      overflowY: "auto",
                      fontSize: 12,
                    }}
                  >
                    <div style={{ padding: 8, borderBottom: "1px solid #FFEDD5" }}>
                      <input
                        className="vc-input"
                        style={{ width: "100%" }}
                        autoFocus
                        placeholder="Search customers…"
                        value={customerQuery}
                        onChange={(e) => setCustomerQuery(e.target.value)}
                      />
                    </div>
                    {customerLoading ? (
                      <div style={{ padding: 10, color: "#7C2D12" }}>Loading…</div>
                    ) : customerResults.length === 0 ? (
                      <div style={{ padding: 10, color: "#8a94a1" }}>No customers found</div>
                    ) : (
                      customerResults.map((c) => (
                        <div
                          key={c.id}
                          onMouseDown={(e) => {
                            e.preventDefault();
                            void selectCustomer(c.id);
                          }}
                          onMouseEnter={(e) => (e.currentTarget.style.background = "#FFEDD5")}
                          onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                          style={{
                            padding: "8px 10px",
                            cursor: "pointer",
                            borderBottom: "1px solid #FFF7ED",
                          }}
                        >
                          <div style={{ color: "#7C2D12", fontWeight: 600 }}>{c.name}</div>
                          {c.phone || c.company ? (
                            <div style={{ color: "#8a94a1", fontSize: 11 }}>
                              {[c.phone, c.company].filter(Boolean).join(" · ")}
                            </div>
                          ) : null}
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
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
                placeholder="Auto"
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

            {/* ── Separator ── */}
            <div className="vc-hdr-sep" />

            {/* ── Row 2: Contact details ── */}
            <div className="vc-field">
              <label className="vc-label">Phone</label>
              <input
                className="vc-input"
                value={header.contact_no}
                onChange={(e) => setHeaderField("contact_no", e.target.value)}
                inputMode="tel"
                placeholder="Mobile number"
              />
            </div>

            <div className="vc-field">
              <label className="vc-label">Email</label>
              <input
                className="vc-input"
                value={header.email}
                onChange={(e) => setHeaderField("email", e.target.value)}
                inputMode="email"
                placeholder="customer@email.com"
              />
            </div>

            <div className="vc-field vc-span-2">
              <label className="vc-label">Address / Site</label>
              <input
                className="vc-input"
                value={header.address}
                onChange={(e) => setHeaderField("address", e.target.value)}
                placeholder="Delivery or site address"
              />
            </div>

            {/* ── Separator ── */}
            <div className="vc-hdr-sep" />

            {/* ── Row 3: Job context (optional) ── */}
            <div className="vc-field">
              <label className="vc-label">Reference</label>
              <input
                className="vc-input"
                value={header.reference}
                onChange={(e) => setHeaderField("reference", e.target.value)}
                placeholder="Site name / PO no."
              />
            </div>

            <div className="vc-field">
              <label className="vc-label">Supplier</label>
              <input
                className="vc-input"
                value={header.supplier_company}
                onChange={(e) => setHeaderField("supplier_company", e.target.value)}
                placeholder="APARNA, FENESTA…"
              />
            </div>

            {/* Status only on saved quotations */}
            {savedId ? (
              <div className="vc-field vc-span-2">
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
            ) : null}

          </div>
        </div>

        <PhotoAttachments quotationId={savedId} />

        {/* ---- Measured items ---- */}
        <div className="vc-card">
          <div className="vc-card-head">
            <span className="vc-card-title">Measured Items</span>
            <div style={{ flex: 1 }} />

            {/* Item templates (Feature B): insert a prefilled row. */}
            <div ref={templateBoxRef} style={{ position: "relative" }}>
              <button
                type="button"
                className="vc-btn vc-btn-sm"
                onClick={() => setTemplatesOpen((o) => !o)}
                title="Insert a saved item template"
              >
                Templates <ChevronDown size={12} />
              </button>
              {templatesOpen && (
                <div
                  style={{
                    position: "absolute",
                    top: "100%",
                    right: 0,
                    zIndex: 50,
                    marginTop: 4,
                    background: "#fff",
                    border: "1px solid #FFEDD5",
                    borderRadius: 8,
                    boxShadow: "0 8px 24px rgba(124,45,18,0.15)",
                    maxHeight: 260,
                    overflowY: "auto",
                    fontSize: 12,
                    minWidth: 200,
                  }}
                >
                  {templates.length === 0 ? (
                    <div style={{ padding: 10, color: "#8a94a1" }}>No templates yet</div>
                  ) : (
                    templates.map((t) => (
                      <div
                        key={t.id}
                        onMouseDown={(e) => {
                          e.preventDefault();
                          insertTemplate(t);
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = "#FFEDD5")}
                        onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                        style={{
                          padding: "8px 10px",
                          cursor: "pointer",
                          borderBottom: "1px solid #FFF7ED",
                        }}
                      >
                        <div style={{ color: "#7C2D12", fontWeight: 600 }}>{t.name}</div>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>

            <button type="button" className="vc-btn vc-btn-sm" onClick={addMeasured}>
              <Plus size={12} /> Add row <span className="vc-kbd">Alt I</span>
            </button>
          </div>

          {/* Apply-to-all toolbar (Feature B): push one W/H (+ optional rate/glass)
              across every measured row — common when a frame repeats. */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              flexWrap: "wrap",
              padding: "8px 12px",
              background: "#FFEDD5",
              borderBottom: "1px solid #FED7AA",
              fontSize: 12,
              color: "#7C2D12",
            }}
          >
            <span style={{ fontWeight: 600 }}>Apply to all rows:</span>
            <label style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
              W
              <input
                className="vc-input vc-num"
                style={{ width: 70, height: 22 }}
                inputMode="decimal"
                value={applyW}
                onChange={(e) => setApplyW(e.target.value)}
                placeholder="mm"
              />
            </label>
            <label style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
              H
              <input
                className="vc-input vc-num"
                style={{ width: 70, height: 22 }}
                inputMode="decimal"
                value={applyH}
                onChange={(e) => setApplyH(e.target.value)}
                placeholder="mm"
              />
            </label>
            <label style={{ display: "inline-flex", alignItems: "center", gap: 4, cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={applyWithRate}
                onChange={(e) => setApplyWithRate(e.target.checked)}
              />
              + rate/glass
            </label>
            {applyWithRate && (
              <>
                <input
                  className="vc-input vc-num"
                  style={{ width: 80, height: 22 }}
                  inputMode="decimal"
                  value={applyRate}
                  onChange={(e) => setApplyRate(e.target.value)}
                  placeholder="rate"
                />
                <input
                  className="vc-input"
                  style={{ width: 120, height: 22 }}
                  value={applyGlass}
                  onChange={(e) => setApplyGlass(e.target.value)}
                  placeholder="glass"
                />
              </>
            )}
            <button
              type="button"
              className="vc-btn vc-btn-sm vc-btn-primary"
              onClick={applyToAllRows}
              style={{ background: "#EA580C", borderColor: "#EA580C", color: "#fff" }}
            >
              Apply
            </button>
          </div>

          <div style={{ overflowX: "auto" }}>
            <table className="vc-item-grid">
              <thead>
                <tr>
                  <th className="vc-row-num">#</th>
                  <th style={{ minWidth: 160 }}>Description</th>
                  <th style={{ width: 76 }}>W (mm)</th>
                  <th style={{ width: 76 }}>H (mm)</th>
                  <th style={{ width: 52 }}>Qty</th>
                  <th style={{ width: 66 }}>Sqft</th>
                  <th style={{ width: 78 }}>Rate</th>
                  <th style={{ width: 74 }}>BOM</th>
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
                      <td>
                        <button
                          type="button"
                          className="vc-btn vc-btn-sm"
                          onClick={() => setBomOpen((v) => ({ ...v, [row.key]: !v[row.key] }))}
                          title="Configure profile, glass and hardware for this window"
                        >
                          {bomOpen[row.key] ? "Close" : "Configure"}
                        </button>
                        {bomOpen[row.key] && (
                          <div style={{ minWidth: 250, padding: 8, background: "#FFF7ED", borderRadius: 6, marginTop: 4 }}>
                            <div style={{ fontSize: 10, fontWeight: 700, color: "#7C2D12", marginBottom: 4 }}>PROFILE</div>
                            <div style={{ display: "flex", gap: 4 }}>
                              <input className="vc-cell-input" placeholder="System / series" value={row.bom.profile.system} onChange={(e) => updateBom(i, { profile: { system: e.target.value } })} />
                              <select className="vc-select" value={row.bom.profile.color} onChange={(e) => updateBom(i, { profile: { color: e.target.value } })}>
                                {['white', 'brown', 'grey', 'black', 'woodgrain'].map((c) => <option key={c}>{c}</option>)}
                              </select>
                            </div>
                            <div style={{ fontSize: 10, fontWeight: 700, color: "#7C2D12", margin: "6px 0 4px" }}>GLASS</div>
                            <div style={{ display: "flex", gap: 4 }}>
                              <input className="vc-cell-input" placeholder="Type" value={row.bom.glass.type} onChange={(e) => updateBom(i, { glass: { type: e.target.value } })} />
                              <input className="vc-cell-input vc-num" placeholder="mm" inputMode="decimal" value={row.bom.glass.thickness} onChange={(e) => updateBom(i, { glass: { thickness: e.target.value } })} />
                            </div>
                            <div style={{ fontSize: 10, fontWeight: 700, color: "#7C2D12", margin: "6px 0 4px" }}>HARDWARE</div>
                            <input className="vc-cell-input" placeholder="Handle / lock / roller" value={row.bom.hardware[0]?.name || ""} onChange={(e) => updateHardware(i, e.target.value)} />
                          </div>
                        )}
                      </td>
                       <td className="vc-row-del">
                         <button
                           type="button"
                           className="vc-icon-btn"
                           onClick={() => duplicateMeasured(i)}
                           title="Duplicate this row"
                         >
                           <Copy size={12} />
                         </button>
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

        {/* ---- Unmeasured items (hardware, labour, fitting charges, etc.) ---- */}
        <div className="vc-card">
          <div className="vc-card-head">
            <span className="vc-card-title">Additional Charges</span>
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

          {/* Running totals — always visible, never "at the end".
               Transport is inline-editable here so the user can adjust the
               delivery cost without hunting for a header field. */}
          <div className="vc-totals">
            <div className="vc-total-item">
              <span className="vc-total-label">Subtotal</span>
              <span className="vc-total-value">{formatAmount(totals.subtotal)}</span>
            </div>
            <div className="vc-total-item">
              <label className="vc-total-label" style={{ display: "flex", alignItems: "center", gap: 4 }}>
                Transport (Rs.)
              </label>
              <input
                className="vc-input vc-num"
                style={{ width: 90, height: 22, fontSize: 12, textAlign: "right" }}
                value={header.transport_cost}
                onChange={(e) => setHeaderField("transport_cost", e.target.value)}
                inputMode="decimal"
                placeholder="0"
                data-calc-label="Transport"
              />
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
        />
      </div>
    </div>
  );
}
