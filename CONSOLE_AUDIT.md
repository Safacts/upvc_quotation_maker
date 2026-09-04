# Console API & Database Wiring Audit

**Generated:** 2026-09-04  
**Scope:** All console client pages under `app/[slug]/console` and their API routes under `app/api/console`

---

## Paywall Context (from `src/lib/tiers.ts`)

| Feature | Required Tier | Price (₹) | Notes |
|---------|--------------|-----------|-------|
| `desktop_console` (entire `/console` + `/api/console/*`) | **final** | 55,000 | Grandfathered: `venkateshwara`, `kprupvc` get full access |
| `payment_tracking` | **final** | 55,000 | Auto payment status on quotations |
| `cloud_sync`, `invoicing`, `portal_dashboard` | **base** | 25,000 | |
| `public_webpage`, `reviews`, `email_notifications` | **next** | 35,000 | |
| `whatsapp_share`, `business_optimization`, `data_export` | **nextplus** | 45,000 | |

**Launch Unlock:** First 25 clients (by `created_at`) get `final` tier access until Aadi disables it.

---

## Page-by-Page Wiring Status

| Console Page | API Route(s) | Supabase Table(s) / RPC | Status | Evidence |
|--------------|--------------|-------------------------|--------|----------|
| **Overview** | `GET /api/console/stats` | `quotations` (with `measured_items`, `unmeasured_items` embedded) | **LIVE** | `supaGetAllPaged` on `quotations` with full child select; computes KPIs via `pricing.ts` |
| **Quotations** | `GET/POST /api/console/quotations` | `quotations`, `measured_items`, `unmeasured_items`; tries `search_quotations` RPC (migration 010) then falls back to PostgREST | **LIVE** | RPC-first with identical fallback; `deleted=eq.false` filter; money via `pricing.ts` |
| **Quotation Detail** | `GET /api/console/quotations/[id]` | `quotations` + children; `quotation_money` view | **LIVE** | Used by FactoryReportsClient & editor |
| **Customers** | `GET/POST /api/console/customers` | `customers` | **LIVE** | Migration 007 applied (verified 08-08-2026); `soft_deleted=eq.false`; unique phone index |
| **Products (Rate Card)** | `GET/POST /api/console/products` | `products` | **LIVE** | `soft_deleted=eq.false`; free-text category; NOT inventory |
| **Leads** | `GET/POST /api/console/leads` | `leads`, `lead_activities` | **LIVE** | Joins `lead_activities` for `activity_count`; status pipeline |
| **Projects** | `GET/POST /api/console/projects` | `projects`, `leads`, `orders`, `customers` | **LIVE** | Joins lead/order/customer for display; budget vs actual tracking |
| **Inventory** | `GET/POST /api/console/inventory` | `products` (repurposed with `stock_quantity`, `low_stock_threshold`) | **LIVE** | Uses `products` table as inventory master; stock adjustment via PATCH |
| **Invoices** | `GET/POST /api/console/invoices` | `gst_invoices` | **LIVE** | Migration 004; computes CGST/SGST/IGST; generates `GST/DDMMYYYY/NNNN` numbers |
| **Payments** | `GET/POST /api/console/payments` | `payments`, `quotations` (via `quotation_money` view) | **LIVE** | Auto-recalculates `payment_status` (paid/partial/unpaid) + `amount_paid` on quotation |
| **Production** | `GET/PATCH /api/console/production` | `production_orders`, `orders`, `customers` | **LIVE** | Kanban stages; joins order+customer; stage advance via PATCH |
| **Batches** | `GET/POST /api/console/batches` | `batches`, `production_orders` | **LIVE** | Auto-assigns pending orders at stage; updates batch counts |
| **Reports** | `GET /api/console/reports` | `quotations` (via `search_quotations` RPC or PostgREST), `gst_invoices` | **LIVE** | 5 report types; RPC-first; `truncated` flag; money via `pricing.ts` |
| **Team** | `GET/POST /api/console/users` | `users` | **LIVE** | `business_id` = tenant; roles: owner/manager/accountant/salesperson |
| **Orders** | `GET/POST /api/console/orders` | `orders`, `customers`, `quotations`, `production_orders` | **LIVE** | Auto-generates order numbers; pulls total from `quotation_money` |
| **Factory Reports** | `GET /api/console/quotations/[id]` | `quotations` + `measured_items`/`unmeasured_items` (BOM config) | **LIVE** | Computes cutting schedule, glass BOQ, accessories BOQ client-side from BOM |
| **3D Designs** | `GET/POST /api/console/3d/designs` | `window_designs`, `orders` | **LIVE** | Stores full topology JSON; links to orders |
| **3D Renders** | `GET /api/console/3d/renders` | `renders`, `window_designs` | **LIVE** | Render queue with status; joins design metadata |
| **3D Configurator** | `POST /api/console/3d/designs` | `window_designs` | **LIVE** | Saves topology from live Three.js model |

---

## Pages Backed by Tables That May Not Exist Yet (Stubs / 0-Row Risk)

| Console Page | API Route(s) | Supabase Table | Risk Level | Evidence |
|--------------|--------------|----------------|------------|----------|
| **Cutting** | `GET/POST /api/console/cutting` | `cutting_lists` | **HIGH** | Full CRUD with FFD optimizer; no try/catch fallback — will 500 if table missing |
| **Challans (Delivery)** | `GET/POST /api/console/challans` | `delivery_challans` | **HIGH** | GET has `try/catch` returning empty array on error (line 59-61) — table likely not created |
| **Materials** | `GET/POST /api/console/materials` | `materials` | **HIGH** | Full schema defined; no fallback — will 500 if table missing |
| **Offcuts** | `GET/POST /api/console/offcuts` | `offcuts` | **HIGH** | Full schema; links to `cutting_lists`; no fallback |
| **Barcodes** | `GET/POST /api/console/barcode` | `barcodes` | **HIGH** | Generates `VTH-YYYYMMDD-NNNN`; joins `production_orders` + `orders`; no fallback |
| **3D Renders** | `GET /api/console/3d/renders` | `renders` | **MEDIUM** | No fallback; but only read path used in UI; may 500 if table missing |

---

## Tables Confirmed Live (Migrations Applied)

| Table | Migration | Verified |
|-------|-----------|----------|
| `clients` | 014 (tier column) | Yes |
| `quotations` | 001+ | Yes (49 rows on 08-08-2026) |
| `measured_items` | 001+ | Yes |
| `unmeasured_items` | 001+ | Yes |
| `customers` | 007 | Yes (08-08-2026) |
| `products` | 008 | Yes |
| `leads` | 009 | Yes |
| `lead_activities` | 009 | Yes |
| `projects` | 009+ | Yes |
| `orders` | 009+ | Yes |
| `production_orders` | 009+ | Yes |
| `batches` | 009+ | Yes |
| `gst_invoices` | 004 | Yes |
| `payments` | 009+ | Yes |
| `users` | 003+ | Yes |
| `window_designs` | 009+ | Yes |

---

## Tables NOT Confirmed (May Need Migration)

| Table | Referenced By | Migration Status |
|-------|---------------|------------------|
| `cutting_lists` | CuttingClient, OffcutsClient | Unknown — no migration ref in code |
| `delivery_challans` | ChallansClient | Unknown — fallback suggests missing |
| `materials` | MaterialsClient | Unknown |
| `offcuts` | OffcutsClient | Unknown |
| `barcodes` | BarcodeClient | Unknown |
| `renders` | 3D Renders API | Unknown |

---

## Summary

| Category | Count | Pages |
|----------|-------|-------|
| **Fully Live (wired to confirmed tables)** | 18 | Overview, Quotations, Quotation Detail, Customers, Products, Leads, Projects, Inventory, Invoices, Payments, Production, Batches, Reports, Team, Orders, Factory Reports, 3D Designs, 3D Configurator |
| **High Risk (table likely missing)** | 6 | Cutting, Challans, Materials, Offcuts, Barcodes, 3D Renders |
| **Total Console Pages Audited** | 24 | |

---

## Recommendations

1. **Priority 1:** Apply migrations for `cutting_lists`, `delivery_challans`, `materials`, `offcuts`, `barcodes`, `renders` tables
2. **Priority 2:** Remove the silent fallback in `challans/route.ts` (line 59-61) once table exists — masking 500s hides real issues
3. **Priority 3:** Add `search_quotations` RPC (migration 010) to eliminate PostgREST fallback path for Quotations/Reports
4. **Note:** The `products` table serves dual purpose (rate card + inventory). If real inventory (GRN/issue/valuation) is needed, a separate `inventory_items` table should be created per architecture doc §1.3