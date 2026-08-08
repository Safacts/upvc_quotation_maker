"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import QuotationEditor, {
  type EditorInitial,
  type MeasuredRow,
  type UnmeasuredRow,
} from "../QuotationEditor";
import { useConsole } from "../../ConsoleShell";
import { toDateInputValue } from "@/lib/console-format";

/**
 * Loads one quotation and hands it to the split-view editor.
 *
 * Kept separate from the editor so the editor never contains fetching logic: the
 * "new" route mounts the same component with a blank document and no request at
 * all. One editor, two entry points.
 */

/**
 * Every field is converted to a STRING for the form state.
 *
 * PostgREST returns `numeric` columns as JSON strings and `integer` columns as
 * numbers, so `rate` arrives as "450.00" while `units` arrives as 2. Feeding a
 * number into a controlled `<input value>` and then typing makes React swap
 * between controlled and uncontrolled — the field silently stops accepting
 * input. Normalising to string here means the editor only ever handles one type,
 * and `pricing.ts`'s `num()` coercion handles the conversion back.
 */
function toStr(v: unknown, fallback = ""): string {
  if (v === null || v === undefined) return fallback;
  return String(v);
}

let loadSeq = 0;
function rowKey(): string {
  loadSeq += 1;
  return "load" + loadSeq;
}

export default function EditQuotationClient({
  quotationId,
  companyName,
  companyAddress,
  companyContact,
  gstNumber,
}: {
  quotationId: string;
  companyName: string;
  companyAddress?: string;
  companyContact?: string;
  gstNumber?: string;
}) {
  const router = useRouter();
  const { slug, toast } = useConsole();
  const [initial, setInitial] = useState<EditorInitial | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/console/quotations/${quotationId}`, {
          credentials: "same-origin",
        });
        const data = await res.json();
        if (cancelled) return;

        if (!res.ok) {
          // The API returns 404 for both "does not exist" and "belongs to
          // another tenant" — deliberately indistinguishable, so this message
          // covers both without leaking which one it was.
          setError(res.status === 404 ? "Quotation not found" : data?.error || "Failed to load");
          return;
        }

        const q = data.quotation || {};
        const measured: MeasuredRow[] = (data.measured_items || []).map((m: any) => ({
          key: rowKey(),
          code: toStr(m.code),
          description: toStr(m.description),
          glass: toStr(m.glass),
          width: toStr(m.width),
          height: toStr(m.height),
          units: toStr(m.units, "1"),
          rate: toStr(m.rate),
        }));
        const unmeasured: UnmeasuredRow[] = (data.unmeasured_items || []).map((u: any) => ({
          key: rowKey(),
          description: toStr(u.description),
          units: toStr(u.units, "1"),
          rate: toStr(u.rate),
        }));

        setInitial({
          header: {
            quote_no: toStr(q.quote_no),
            date: toDateInputValue(q.date || q.created_at),
            customer_name: toStr(q.customer_name),
            contact_no: toStr(q.contact_no),
            email: toStr(q.email),
            address: toStr(q.address),
            reference: toStr(q.reference),
            supplier_company: toStr(q.supplier_company),
            // Lower-cased: the live table holds both 'Draft' and 'draft', and a
            // <select> whose value matches no <option> renders as blank —
            // saving would then silently rewrite the status.
            status: toStr(q.status, "draft").toLowerCase(),
            transport_cost: toStr(q.transport_cost, "0"),
            include_gst: q.include_gst === true,
            gst_percentage: toStr(q.gst_percentage, "0"),
            customer_id: q.customer_id || null,
          },
          measured,
          unmeasured,
        });
      } catch (e: any) {
        if (!cancelled) setError(String(e?.message ?? e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [quotationId]);

  if (error) {
    return (
      <div className="vc-pad">
        <div className="vc-card" style={{ padding: 18 }}>
          <div className="vc-empty-title">{error}</div>
          <button
            type="button"
            className="vc-btn"
            style={{ marginTop: 10 }}
            onClick={() => router.push(`/${slug}/console/quotations`)}
          >
            Back to quotations
          </button>
        </div>
      </div>
    );
  }

  if (!initial) {
    return (
      <div className="vc-pad">
        <div className="vc-empty">
          <span className="vc-spinner" />
        </div>
      </div>
    );
  }

  return (
    <QuotationEditor
      quotationId={quotationId}
      initial={initial}
      companyName={companyName}
      companyAddress={companyAddress}
      companyContact={companyContact}
      gstNumber={gstNumber}
    />
  );
}
