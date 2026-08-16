// Shared, framework-agnostic types and pure helpers for the quotation editor.
//
// IMPORTANT: this module intentionally has NO "use client" directive. It is
// imported by BOTH:
//   - the server component `app/[slug]/console/quotations/new/page.tsx`, which
//     calls `blankHeader()` to build the initial (empty) document on the server, and
//   - the client editor component `QuotationEditor.tsx`.
//
// Putting `blankHeader` (or the editor types/helpers) inside a "use client"
// module would turn it into a client reference that CANNOT be invoked from a
// Server Component — Next.js 16 throws "Cannot call a Client Function from a
// Server Component" at render time. Keeping the pure pieces here lets the
// server build the initial document directly while the client still owns the
// interactive state.

export interface MeasuredRow {
  key: string;
  code: string;
  description: string;
  glass: string;
  width: string;
  height: string;
  units: string;
  rate: string;
  bom: WindowBom;
}

export interface WindowBom {
  profile: { system: string; color: string };
  glass: { type: string; thickness: string };
  hardware: { name: string; quantity: string }[];
}

export function emptyBom(): WindowBom {
  return {
    profile: { system: "", color: "white" },
    glass: { type: "", thickness: "" },
    hardware: [],
  };
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
  return { key: nextKey(), code: "", description: "", glass: "", width: "", height: "", units: "1", rate: "", bom: emptyBom() };
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
