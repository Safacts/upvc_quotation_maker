# Dash — Desktop Dashboard Support Handoff (Phase 1)

**From:** Dash (Flutter Engineer)
**To:** Nexy (Backend Architect)
**Date:** 08-08-2026
**Branch:** `feature/desktop-dashboard` (production untouched)

---

## 1. Flutter mobile app — VERIFIED INTACT

```
flutter analyze: 0 errors, 62 issues (all pre-existing warnings/infos)
```

- No Flutter code was modified for this phase. Mobile app = production state.
- Google Sign-In (web + native Android) working. APK builds clean.
- `lib/models.dart` pricing getters unchanged — parity contract with `src/lib/pricing.ts` still holds.

---

## 2. API routes reusable for desktop console

All routes below are in `app/api/`. They already enforce tenant scope via the
HttpOnly session cookie (`session.client_id`) and CORS headers. Console can call
them directly. **No backend changes needed for read operations.**

| Route | Methods | Purpose | Console use |
|---|---|---|---|
| `/api/portal_auth` | POST, OPTIONS | Google sign-in, session creation | Auth (reuse) |
| `/api/quotation/[id]` | GET | Fetch full quote + items (token-gated) | Open/edit quote |
| `/api/quotation/[id]/token` | — | Token generation for share links | Share link |
| `/api/portal_stats` | GET | Aggregated stats (paged, capped 5000) | Dashboard KPIs |
| `/api/gst_invoices` | GET, POST | List/create GST invoices | Invoicing |
| `/api/gst_invoices/[id]` | GET, PUT, DELETE | CRUD one GST invoice | Invoicing |
| `/api/gst_invoices/items` | POST | Add line items to GST invoice | Invoicing |
| `/api/gst_invoices/number` | GET | Next GST invoice number | Invoicing |
| `/api/send_email` | POST | Send HTML email with attachments | Email quote |
| `/api/save_client` | POST | Sync client config (branding, bank, terms) | Settings sync |
| `/api/config/[clientId]` | GET | Fetch client config | Settings load |
| `/api/reviews` | — | Public reviews | Display |
| `/api/reviews/[clientId]` | — | Client's reviews | Manage |
| `/api/reviews/[clientId]/manage` | — | Review moderation | Manage |

### Routes that ALREADY build PDFs server-side (console can reuse directly)

| Route | What it generates | PDF lib |
|---|---|---|
| `/api/invoice` (POST) | Vitharn-branded TAX INVOICE PDF (orange monochrome) | `src/lib/invoice-pdf.ts` (466 lines, pdf-lib) |
| `/api/invoice/[id]` (GET) | Same invoice PDF from stored row | same |

> Note: this is the **Vitharn invoice** PDF (different product surface). The
> **uPVC quotation** PDF is a separate thing — see §3.

---

## 3. PDF generation port — what's done vs what needs porting

### ✅ Already ported (Vitharn invoice — reuse as reference)

`src/lib/invoice-pdf.ts` — 466 lines, pdf-lib, Vitharn orange brand. Produces the
tax invoice PDF. Uses `src/lib/brand.ts` tokens and `src/lib/invoice-pdf.ts`'s
`inr()` / `amountInWords()`. This is a DIFFERENT PDF from the uPVC quotation but
is the **exact template** to follow for the TS port of the quotation PDF.

### ❌ NOT yet ported (uPVC quotation — Nexy needs this for console)

| Dart file | Size | What it does | Risk |
|---|---|---|---|
| `lib/pdf_generator.dart` | 304 lines | uPVC QUOTATION PDF (measured + unmeasured items table, GST, watermark logo, bank details, terms, signatures) | MEDIUM — layout math |
| `lib/gst_pdf_generator.dart` | 283 lines | uGST INVOICE PDF (supplier/buyer blocks, tax summary, HSN) | MEDIUM — layout math |

### Port guidance (read this before writing TS)

**Library choice:** `pdf-lib` (already in Next.js deps, see `invoice-pdf.ts`).
Do NOT use `puppeteer` — adds 300MB+ Chromium to Vercel. `pdf-lib` is pure JS,
serverless-friendly, already proven.

**Key gotchas (from invoice-pdf.ts learnings):**

1. **WinAnsi encoding:** StandardFonts (Helvetica) cannot encode ₹ (U+20B9).
   Always print `Rs.` (the Flutter PDFs already do this). The `safe()` helper
   in `invoice-pdf.ts` strips non-ASCII — reuse it.

2. **Indian number formatting:** `inr()` in `invoice-pdf.ts` handles `12,34,567.50`
   grouping and `Rs.` prefix — port it.

3. **Amount in words:** `amountInWords()` in `invoice-pdf.ts` handles Crore/Lakh/
   Thousand. Flutter uses hyphenated tens (`Twenty-One`) while TS uses spaced
   (`Twenty One`) — both acceptable, but pick one and make the console PDF match
   its own mobile PDF for consistency. The exact Flutter algorithm is at
   `lib/models.dart:77-99`.

4. **Watermark:** Flutter PDF uses `networkImage(url)` with `Opacity(0.06)`.
   In pdf-lib: `pdfDoc.pngEmbed()` + `page.drawImage()` with `opacity: 0.06`.
   Download the logo bytes at request time (cache in memory 5 min).

5. **Font loading:** Flutter uses `PdfGoogleFonts.robotoRegular()`. pdf-lib uses
   `StandardFonts.Helvetica` — different metrics, so port the LAYOUT MATH, not
   the pixel values. Re-measure column widths.

6. **Color:** Flutter uses `PdfColor.fromHex('#1e3a5f')` for the header band.
   In pdf-lib: `rgb(...hexToRgb('#1e3a5f'))` — but `hexToRgb` is currently only
   in `brand.ts` for the orange ramp. Add a generic `hexToRgb` or hardcode.

**Recommended port order:**
1. `amountInWords` + `inr` (reuse from invoice-pdf.ts — already done)
2. Header + top bar + section title (trivial)
3. Customer details table
4. Measured items table (the wide one — 11 columns)
5. Unmeasured items table (5 columns)
6. Totals table (GST logic — matches `pricing.ts`)
7. Terms + bank details + signatures
8. Watermark + multiPage footer (page X of Y)

**Do NOT port:** `Printing.layoutPdf` (Flutter's native print preview). Console
should return a `Uint8Array` from a route and let the browser handle download/print.

---

## 4. What the console needs that doesn't exist yet

| Gap | Impact | Suggested owner |
|---|---|---|
| **Quotation PDF in TS** | Console cannot generate the customer-facing PDF | Nexy (port `pdf_generator.dart`) |
| **GST invoice PDF in TS** | Console cannot generate GST invoice PDF | Nexy (port `gst_pdf_generator.dart`) |
| **Save quotation route** | Flutter writes to Supabase directly from the client (no API route). Console needs a server-side write route for security (service-role key bypasses RLS). | Nexy |
| **Customers master table** | No `customers` table exists. Customer name/phone are free-text on `quotations`. | Supa |
| **Product/inventory master** | No product master. Line item descriptions are free-text. | Supa |

> Critical: Flutter saves quotations via **direct Supabase client writes** (anon key
> + RLS). The desktop console MUST NOT use the anon key — it needs a server route
> with the service-role key that enforces `client_id` from the session. This is a
> new API route, not a port.

---

## 5. Files Nexy should read before starting

| File | Why |
|---|---|
| `src/lib/invoice-pdf.ts` | Reference TS PDF implementation (follow this style) |
| `src/lib/pricing.ts` | Pricing parity contract — the math the PDF must match |
| `src/lib/brand.ts` | Color tokens + hexToRgb helper |
| `lib/pdf_generator.dart` | Source of truth for quotation PDF layout |
| `lib/gst_pdf_generator.dart` | Source of truth for GST invoice PDF layout |
| `lib/models.dart:153-224` | MeasuredItem/UnmeasuredItem pricing getters |
| `app/api/invoice/route.ts` | How an existing PDF route is wired (Node runtime, pdf-lib, returns Uint8Array) |

---

## 6. Position summary (unchanged from THREAD-005/006)

- **Flutter = mobile only.** Zero desktop code in Flutter. Not a line.
- **Next.js = desktop console.** New `/console` route tree, shared API layer.
- **Pricing truth** lives in `src/lib/pricing.ts` (TS) mirroring `lib/models.dart` (Dart).
- **PDFs move server-side** for the console. Flutter keeps its client-side PDF.
