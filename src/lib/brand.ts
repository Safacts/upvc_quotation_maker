// Vitharn ERP Services brand tokens — orange monochrome.
//
// Single source of truth for invoice PDFs and transactional email templates.
// Vitharn is a STANDALONE identity: never reference a parent or partner company.

export const BRAND = {
  name: "VITHARN ERP SERVICES",
  tagline: "Quotation & ERP software for UPVC fabricators",
  // NOTE: mailbox is "vitarn.dev" with NO 'h' — the brand name has one, the
  // email address does not. Do not "correct" this to vitharn.dev.
  email: (process.env.VITHARN_BILLING_EMAIL || "vitarn.dev@gmail.com").trim(),
  phone: (process.env.VITHARN_BILLING_PHONE || "").trim(),
  site: "https://app.vitharn.com",
} as const;

// Orange monochrome ramp. Values are 0-1 RGB triples so pdf-lib can consume
// them directly via rgb(...), and hex strings for the HTML email templates.
export const ORANGE = {
  darkHex: "#7C2D12", // deep burnt orange — headings on light backgrounds
  mainHex: "#EA580C", // primary brand orange — header band, totals rule
  midHex: "#FB923C", // mid tone — secondary accents
  lightHex: "#FFEDD5", // table header / soft fill
  paperHex: "#FFF7ED", // page tint blocks
  inkHex: "#1F2937", // near-black body text
  mutedHex: "#6B7280", // muted labels
  lineHex: "#E5E7EB", // hairline rules
} as const;

// Rust/orange monochrome ramp (login-page palette: #C44A10 family).
// Used by web-side PDF generators (quotation, invoice, GST invoice) so
// documents feel like the same premium company as emails and login page.
export const RUST = {
  darkHex: "#9B3A0C", // deep rust — headings on light backgrounds
  mainHex: "#C44A10", // primary brand rust — header band, totals rule
  midHex: "#E06A1E", // mid tone — secondary accents
  lightHex: "#FFF3E6", // table header / soft fill
  paperHex: "#FFFBF6", // page tint blocks
  inkHex: "#1A0A00", // near-black body text
  mutedHex: "#7A5030", // muted labels
  lineHex: "#EADFD3", // hairline rules
} as const;

/** Convert "#RRGGBB" to a 0-1 [r,g,b] triple for pdf-lib's rgb(). */
export function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [
    parseInt(h.slice(0, 2), 16) / 255,
    parseInt(h.slice(2, 4), 16) / 255,
    parseInt(h.slice(4, 6), 16) / 255,
  ];
}

/**
 * GST stance. Vitharn has no GSTIN and turnover is under the 20L threshold, so
 * every invoice must state NIL GST with the statutory reason rather than
 * silently omitting tax.
 */
export const GST_NOTE =
  "GST not applicable - turnover below the Rs.20,00,000 threshold (Section 22, CGST Act, 2017).";
