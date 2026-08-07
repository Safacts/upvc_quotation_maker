<div align="center">

# 🟧 VITHARN ERP SERVICES
### INVOICE PDF GENERATOR — TECHNICAL SPECIFICATION

*Quotation & ERP software for UPVC fabricators*

</div>

---

## 1. PURPOSE & SCOPE

This document specifies the exact visual layout, data contract, and brand rules for the **server-side Vitharn Invoice PDF**. The implementation lives at `src/lib/invoice-pdf.ts` and uses `pdf-lib` (NOT Flutter `pdf/widgets`) so the Flutter app requires zero changes.

The generator produces an **A4, orange-monochrome, NIL-GST service invoice** for Vitharn ERP Services — matching the styling language of the in-app Flutter quotation PDFs (`lib/pdf_generator.dart`) while serving as a standalone billing document.

---

## 2. BRAND TOKENS

Sourced from `src/lib/brand.ts` — the single source of truth.

| Token | Hex | Role |
| :--- | :--- | :--- |
| `mainHex` | `#EA580C` | Primary brand orange — header band, totals block, accent rules |
| `darkHex` | `#7C2D12` | Deep burnt orange — headings on light backgrounds |
| `midHex` | `#FB923C` | Mid tone — secondary accents, S.No. text |
| `lightHex` | `#FFEDD5` | Table header / soft fill / page tint |
| `paperHex` | `#FFF7ED` | Page background tint, alternate row fill |
| `inkHex` | `#1F2937` | Near-black body text |
| `mutedHex` | `#6B7280` | Muted labels, secondary text |
| `lineHex` | `#E5E7EB` | Hairline rules, borders |

**Fonts:** StandardFonts.Helvetica (regular, bold, oblique) — chosen because WinAnsi-encoded fonts cannot render the Unicode rupee glyph (U+20B9). We print `Rs.` instead.

**Currency:** Indian digit grouping (`12,34,567.50`) with `Rs.` prefix.

---

## 3. PAGE LAYOUT

| Property | Value |
| :--- | :--- |
| Format | A4 (`595.28 × 841.89` pt) |
| Margin | `46` pt all sides |
| Content width | `503.28` pt (`W - M * 2`) |
| Orientation | Portrait |
| Max pages | Multi-page with auto page-break (keeps footer band clear) |

---

## 4. SECTION-BY-SECTION LAYOUT

### 4.1 Header Band (96 pt tall, full width)

- **Background:** Filled rectangle in `mainHex` (`#EA580C`)
- **Left side:**
  - `VITHARN ERP SERVICES` — 21 pt Helvetica Bold, white
  - Tagline — 8.5 pt, `lightHex` (`#FFEDD5`)
  - Email + Phone (pipe-separated) — 8.5 pt, `lightHex`
  - Site URL (`app.vitharn.com`) — 8.5 pt, `lightHex`
- **Right side:**
  - `INVOICE` — 26 pt Helvetica Bold, white, right-aligned
  - `PAYMENT DUE` or `PAID` — 9 pt Helvetica Bold, `lightHex`, right-aligned

### 4.2 Meta Strip (64 pt tall, full content width)

- **Background:** `paperHex` (`#FFF7ED`) with `lightHex` border
- **Left column (BILL TO):**
  - `BILL TO` label — 7.5 pt Helvetica Bold, `mainHex`
  - Company name (or client name if no company) — 10 pt Bold, `darkHex`
  - `Attn: {name}` — 8 pt, `inkHex` (only if company AND name both present)
  - Address (max 2 lines, wrapped) — 8 pt, `mutedHex`
  - Contact row: `email  |  phone` — 8 pt, `mutedHex`
- **Right column (INVOICE DETAILS):**
  - `INVOICE DETAILS` label — 7.5 pt Helvetica Bold, `mainHex`
  - Rows: Invoice No, Invoice Date, Due Date, Payment Terms
  - Labels — 8 pt, `mutedHex`; Values — 8 pt Bold, `darkHex`, right-aligned

### 4.3 Line Items Table

- **Header row:** 20 pt tall, `mainHex` background
  - `#` — 8 pt Bold, white
  - `DESCRIPTION` — 8 pt Bold, white
  - `QTY` — 8 pt Bold, white, right-aligned
  - `AMOUNT` — 8 pt Bold, white, right-aligned
- **Data rows:** Alternating fill (odd rows: `paperHex`)
  - S.No — 8.5 pt Bold, `midHex`
  - Description — 9 pt Bold, `darkHex` (supports word-wrap)
  - Details/subtitle — 7.8 pt, `mutedHex` (optional second line)
  - Qty — 8.5 pt, `inkHex`, right-aligned (defaults to 1)
  - Amount — 9 pt Bold, `darkHex`, right-aligned (formatted via `inr()`)
  - Hairline separator after each row — 0.5 pt, `lineHex`
- **Empty state:** `No line items.` — 9 pt, `mutedHex`

### 4.4 Totals Block (right-aligned, 250 pt wide)

| Row | Label style | Value style |
| :--- | :--- | :--- |
| Amount | 9 pt, `mutedHex` | 9 pt Bold, `inkHex` |
| GST | 9 pt, `mutedHex` | `NIL` — 9 pt, `inkHex` |
| **TOTAL DUE** | 10.5 pt Bold, white (in `mainHex` band) | 11.5 pt Bold, white |

- TOTAL DUE row has a `mainHex` background rectangle (26 pt tall, full totals width).
- Below totals: GST statutory note in 7.8 pt oblique, `mutedHex`:
  > *GST not applicable - turnover below the Rs.20,00,000 threshold (Section 22, CGST Act, 2017).*
- **Amount in words:** Label — 8.5 pt Bold, `darkHex`; Value — 8.5 pt, `inkHex` (word-wrapped, Indian place-value: Crore/Lakh/Thousand).

### 4.5 Payment Instructions Block (84 pt tall, full content width)

- **Background:** `paperHex` with `midHex` border
- **Left accent bar:** 3.5 pt wide, `mainHex` (full height of block)
- **Header:** `PAYMENT INSTRUCTIONS` — 8 pt Bold, `mainHex`
- **UPI fields:**
  - `UPI ID` — 8 pt, `mutedHex` label; value — 10 pt Bold, `darkHex`
  - `Payee Name` — 8 pt, `mutedHex` label; value — 8.5 pt, `inkHex`
  - `Reference` — 8 pt, `mutedHex` label; value — 8.5 pt Bold, `inkHex`
  - Helper text — 7.6 pt oblique, `mutedHex`:
    > *Please quote the invoice number in the UPI remarks so we can match your payment.*

### 4.6 Footer (every page, positioned at y=62 baseline)

- Top rule — 1 pt, `mainHex` (full content width)
- `Vitharn ERP Services  |  vitarn.dev@gmail.com` — 8.5 pt Bold, `darkHex`
- `This is a computer-generated invoice and is valid without a signature.` — 7.2 pt oblique, `mutedHex`
- Page number (`Page X of Y`) — 8 pt, right-aligned

---

## 5. DATA CONTRACT (`InvoiceData`)

```typescript
type InvoiceLine = {
  description: string;     // Line item title (required)
  details?: string;        // Subtitle / secondary text
  qty?: number;            // Defaults to 1
  amount: number;          // Line total in rupees (required)
};

type InvoiceData = {
  invoiceNumber: string;        // e.g. "INV-0001"
  invoiceDate: Date | string;   // e.g. "2026-08-07" or Date
  dueDate?: Date | string | null;
  paymentTerms?: string;        // Defaults to "Due on receipt"
  clientName: string;
  clientCompany?: string;
  clientAddress?: string;
  clientEmail?: string;
  clientPhone?: string;
  items: InvoiceLine[];
  notes?: string;
  upiId?: string;               // Overrides env VITHARN_UPI_ID
  upiName?: string;             // Overrides env VITHARN_UPI_NAME
  paid?: boolean;               // If true, header shows "PAID" instead of "PAYMENT DUE"
};
```

### Environment Variables

| Variable | Fallback | Purpose |
| :--- | :--- | :--- |
| `VITHARN_UPI_ID` | `""` (shows "not configured") | Primary UPI payment address |
| `VITHARN_UPI_NAME` | `"Vitharn ERP Services"` | Payee name on UPI |
| `VITHARN_BILLING_EMAIL` | `"vitarn.dev@gmail.com"` | From email in header |
| `VITHARN_BILLING_PHONE` | `""` | Contact phone in header |

---

## 6. PAGE-BREAK RULES

- Line items: break when remaining vertical space < 190 pt (keeps totals + payment + footer together when possible).
- Payment block: break when remaining vertical space < 170 pt.
- Table header re-draws at the top of every new page.

---

## 7. EXPORTED API

```typescript
/** Build the full invoice PDF. Returns a Uint8Array ready to write/attach. */
buildInvoicePdf(data: InvoiceData): Promise<Uint8List>;

/** Format a date as "07-Aug-2026" — matches Flutter PDFs. */
fmtDate(v: Date | string | null | undefined): string;

/** Indian-digit-grouped rupee string: 1234567.5 -> "Rs. 12,34,567.50". */
inr(n: number): string;

/** Rupees in words: 150000 -> "One Lakh Fifty Thousand Rupees Only". */
amountInWords(n: number): string;
```

---

## 8. EMAIL ATTACHMENT INTEGRATION

The invoice PDF attaches to `sendInvoiceEmail()` in `src/lib/mail.ts`:

```typescript
import { buildInvoicePdf } from "@/lib/invoice-pdf";

const pdfBytes = await buildInvoicePdf(invoiceData);

await sendInvoiceEmail({
  to: client.email,
  clientName: client.name,
  invoiceNumber: "INV-0042",
  invoiceDate: "07-Aug-2026",
  items: [{ description: "Vitharn ERP Setup", amount: 15000 }],
  subtotal: 15000,
  totalDue: 15000,
  upiId: process.env.VITHARN_UPI_ID,
  pdfBytes,                              // <-- attached automatically
  pdfFilename: "Vitharn-Invoice-INV-0042.pdf",
});
```

The email body shows a summary table + UPI inline, and the full detailed PDF is attached. The `pdfFilename` defaults to `Vitharn-Invoice-{invoiceNumber}.pdf`.

---

## 9. DESIGN RATIONALE

1. **Orange monochrome** — chosen by Vitharn for brand distinctiveness in a market flooded with blue/grey ERP tools. Every PDF and email shares this palette via the shared `ORANGE` ramp in `src/lib/brand.ts`.
2. **Rs. instead of ₹** — pdf-lib's standard fonts are WinAnsi-encoded and throw on U+20B9. `Rs.` is the standard Indian business convention and renders everywhere.
3. **NIL GST with statutory note** — Vitharn's turnover is under the 20L threshold (Section 22, CGST Act, 2017). Stating this explicitly prevents client queries and satisfies compliance.
4. **UPI as primary payment** — instant, zero-cost, universally adopted in India. Bank transfer is available but not emphasised.
5. **Amount in words** — Indian invoicing convention, expected by accountant-aware clients.
6. **Server-side generation** — the Flutter app needs no billing logic changes; it calls the API route which delegates to `buildInvoicePdf()`.

---

<br>
<div align="center">
  <strong>Vitharn ERP Services | vitarn.dev@gmail.com | app.vitharn.com</strong>
</div>
