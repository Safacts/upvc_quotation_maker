# Vitharn Desktop Dashboard — Architecture Plan

**Author:** Nexy (Backend Architect, Vitharn ERP Services)
**Date:** 07-08-2026
**Status:** PROPOSED — awaiting Aadi's approval before any code is written
**Driver:** KPR wants a desktop dashboard "as robust as Tally"

---

## 0. Executive summary

We are **not** rebuilding the app. We are adding a **third surface**:

| Surface | Audience | Device | Status |
|---|---|---|---|
| Flutter app (`/upvc/<slug>`, APK) | Site staff, on-the-move measuring | Phone | EXISTS — keep as-is |
| Client portal (`/<slug>/home`) | Owner glancing at stats | Phone/tablet | EXISTS — becomes the "lite" view |
| **Desktop Ops Console (`/<slug>/console`)** | Back-office data entry, owner, accountant | **Laptop/desktop ≥1280px** | **NEW — this document** |

Key architectural decision: **the desktop console is a separate route tree, not a
responsive rework of `CustomerPortal.tsx`.** Reasons in §5.1.

**The critical prerequisite (§3) is a data-layer fix, not a UI task.** Three blockers
must be cleared before Phase 1 UI work, or the console will be slow and wrong from day one.

---

## 1. Research — what actually makes Tally robust

Sourced from TallyPrime official docs (help.tallysolutions.com, updated 20-07-2026) and
Tally Solutions' own keyboard-first design writeup (24-07-2026).

### 1.1 The five real pillars

1. **Keyboard-first, mouse-optional.** Tally's own benchmark is **200+ vouchers/hour**.
   Every action has a fixed shortcut that means the same thing on *every* screen. This
   consistency is the product — not the shortcut count.
2. **Command palette navigation.** `Alt+G` (Go To) replaced menu trees. You type "sales
   register" and land there. No hunting.
3. **Drill-down everywhere.** `Enter` on any report row opens the underlying detail; `Esc`
   goes back. Reports are navigable trees, not dead-end exports.
4. **Create-on-the-fly.** `Alt+C` creates a master (a customer, an item) *from inside* the
   voucher you are typing, without losing your place. This is the single biggest
   time-saver and the thing our current app most lacks.
5. **Screen-level config, not global settings.** `F12` configures the screen you are on
   (which columns show, what detail level). Users tune their own view.

### 1.2 Shortcuts we will mirror (semantics preserved, keys adapted for browser)

| Tally | Meaning | Our binding | Note |
|---|---|---|---|
| `Alt+G` | Go To / command palette | `Ctrl+K` **and** `Alt+G` | `Ctrl+K` is the web-native convention; `Alt+G` for Tally muscle memory |
| `Ctrl+A` | Accept & save | `Ctrl+S` **and** `Ctrl+Enter` | `Ctrl+A` is browser select-all — **cannot** be taken. Non-negotiable. |
| `Ctrl+Q` | Quit without saving | `Esc` (with dirty-check) | `Ctrl+Q` closes the browser on some platforms — **must not** be bound |
| `Esc` | Back / close | `Esc` | direct |
| `Enter` | Drill down | `Enter` | direct |
| `Alt+C` | Create master on the fly | `Alt+C` | direct — inline customer/item creation |
| `Alt+2` | Duplicate voucher | `Alt+D` | duplicate quotation as new draft |
| `Alt+I` | Insert row | `Alt+I` | new line item |
| `Alt+X` | Cancel/delete row | `Alt+X` | soft-delete line, confirm required |
| `F2` | Change date / period | `F2` | opens the period selector |
| `F12` | Screen config | `F12` | **cannot** be captured in Chrome (DevTools). Use `Ctrl+,` + an on-screen gear |
| `Ctrl+P` | Print | `Ctrl+P` | let the browser handle it, but render a print stylesheet |
| `Ctrl+E` | Export | `Ctrl+E` | CSV/XLSX of the current grid |
| `Ctrl+N` | Calculator | `Ctrl+/` | inline calc in amount fields |
| `PgUp`/`PgDn` | Prev/next voucher | `PgUp`/`PgDn` | move between quotations without going back to the list |

> **Browser-reserved keys we must never bind:** `Ctrl+A`, `Ctrl+Q`, `Ctrl+W`, `Ctrl+T`,
> `Ctrl+N`, `F12`, `Ctrl+Shift+*`. Any plan that binds these will silently fail in
> production and look broken to KPR. This table is the contract.

### 1.3 What we deliberately will NOT copy

- **Double-entry ledgers / Chart of Accounts / Balance Sheet.** KPR is a uPVC fabricator,
  not an accounting firm. Building double-entry is a 6-month project and a compliance
  liability. We integrate with Tally instead (§4.6) — we do not replace it.
- **Tally's DOS-era visual language.** We keep the shortcut *semantics* and the
  information density, not the blue screen.

---

## 2. Current state — verified findings

Everything below was read from the repo on 07-08-2026, not assumed.

| Finding | Evidence | Impact |
|---|---|---|
| **Tailwind is installed but NOT wired up** | `tailwindcss@4.2.1` + `@tailwindcss/postcss` in `devDependencies`, but there is **no `postcss.config.*` file** and `app/globals.css` (50 lines) has no `@import "tailwindcss"` | The task brief assumed "Tailwind". It does **not** currently work. Decision in §4.2 |
| Styling is hand-rolled CSS | `admin.css` 1226 L, `landing.css` 735 L, `dashboard.css` 529 L, `portal.css`, `login.css`, `signup.css` | ~3,100 lines of CSS conventions to respect or consciously break from |
| God components | `PlatformAdmin.tsx` **1560 L**, `CustomerPortal.tsx` **1284 L**, `DashboardPage.tsx` **542 L** | Do not extend these. New console must be composed of small files |
| **Pricing formula duplicated 4×** | `(w/304.8)*(h/304.8)` in `portal_stats/route.ts:92`, `DashboardPage.tsx:38`, `DashboardPage.tsx:483`, `lib/models.dart:150` | **P0 correctness risk.** A 5th copy in the console guarantees drift |
| **`portal_stats` fetches the entire table** | `supaGet("quotations", {...select: "...measured_items(...),unmeasured_items(...)"})` with **no limit**, then loops in JS | Works at 23 quotes. Dies at 5,000. Must be fixed before a grid sits on top of it |
| **No `customers` table** | Only `quotations, measured_items, unmeasured_items, sent_emails, quotation_counters, clients, admins, signup_requests, service_reviews, gst_invoice*, vitharn_invoice*` | "Customer management" has **no backing store**. Customer name/phone are free-text columns on `quotations` |
| No inventory/product master | same | "Inventory" has no backing store either |
| Session model is solid | `src/lib/session.ts` — HttpOnly JWT (jose, HS256, 7d), `role` + `client_id` in the token | Reusable as-is. `client_id` from the cookie, never from the client |
| RLS tenant isolation exists | `client_isolation` policy keyed on `request.headers ->> 'x-client-id'` | Good, but service-role API routes bypass it — API must keep enforcing scope |
| GST invoice module exists | `/api/gst_invoices/*`, migration 004 applied | Console gets invoicing largely for free |

### 2.1 The field-visibility problem, diagnosed

KPR's complaint — *"users can't see what they entered till the end"* — is not a screen-size
problem. It is a **single-column, one-field-at-a-time mobile form** problem. On desktop the
fix is a **split view**: the entry grid on the left, a **live running total + document
preview on the right**, both visible at all times. See §5.3.

---

## 3. P0 prerequisites (must land before Phase 1 UI)

These are backend tasks. They are mine. They are not optional.

### 3.1 Single source of pricing truth — `src/lib/pricing.ts`

```ts
// src/lib/pricing.ts — THE ONLY place this maths may exist in TypeScript.
export const MM_PER_FOOT = 304.8;

export function sqft(widthMm: number, heightMm: number): number {
  return (widthMm / MM_PER_FOOT) * (heightMm / MM_PER_FOOT);
}

export function measuredLineTotal(i: MeasuredItem): number {
  return sqft(i.width, i.height) * i.rate * i.units;
}

export function unmeasuredLineTotal(i: UnmeasuredItem): number {
  return i.rate * i.units;
}

export function quotationTotals(q: QuotationWithItems): QuotationTotals {
  // returns { subtotal, gstAmount, transport, grandTotal } — ONE definition
}
```

Then delete the three TS copies and make them import this. The Dart copy in
`lib/models.dart:150` stays (different language) but gets a comment pointing here, and a
parity test asserts both produce the same number for a fixed fixture.

### 3.2 Push aggregation into Postgres

`portal_stats` must stop being an O(all rows) JS loop. Add to migration `007`:

- A generated/`STORED` total column or a `quotation_totals` view computing line totals in SQL.
- RPC `get_quote_stats(cid text, from_date date, to_date date)` returning the KPI block.
- RPC `search_quotations(cid, q, status[], from, to, sort, dir, page, page_size)` returning
  `{ rows, total_count }` — **server-side pagination, sorting, filtering**. The grid must
  never hold more than one page in memory.

**Index requirements** (the grid is unusable without these):
```sql
CREATE INDEX IF NOT EXISTS quotations_client_created_idx  ON quotations (client_id, created_at DESC);
CREATE INDEX IF NOT EXISTS quotations_client_status_idx   ON quotations (client_id, status);
CREATE INDEX IF NOT EXISTS quotations_client_customer_trgm ON quotations USING gin (customer_name gin_trgm_ops);
-- requires: CREATE EXTENSION IF NOT EXISTS pg_trgm;
```

### 3.3 The missing masters — migration `007_masters.sql`

"Customer management" and "inventory" cannot be built on free-text columns.

```
customers          (id uuid pk, client_id text NOT NULL, name, phone, email, address,
                    gstin, notes, created_at, updated_at)
                    UNIQUE (client_id, phone) WHERE phone IS NOT NULL
products           (id uuid pk, client_id text NOT NULL, code, description, category,
                    unit, default_rate numeric, glass_type, is_active,
                    created_at, updated_at)
                    UNIQUE (client_id, code)
quotations.customer_id uuid NULL REFERENCES customers(id)   -- nullable = backfillable
```

- RLS: `client_isolation` policy on both, identical to the existing four tables.
- **Backfill is non-destructive:** `customer_name`/`contact_no` stay on `quotations` as a
  historical snapshot (the customer may later change their phone; the old quote must not
  mutate). `customer_id` is an *additional* link. A one-off script dedupes existing
  `(client_id, customer_name, contact_no)` pairs into `customers` and populates the FK.
- **This is Supa's territory.** I will hand the DDL to the Database Administrator for RLS
  review and application via the pooler + `NOTIFY pgrst, 'reload schema'`.

---

## 4. Technical decisions

### 4.1 Table library — **TanStack Table v8**, not AG Grid

| | TanStack Table v8 | AG Grid |
|---|---|---|
| Licence | MIT | Enterprise features (grouping, pivot, Excel export, master-detail) need a **paid per-dev licence** |
| Bundle | ~14 kB, headless | ~300 kB+ community build |
| Styling | Bring your own — matches our hand-rolled CSS | Ships its own theme; would fight our CSS |
| Editing/keyboard | We implement — full control over the Tally key map | Built in, but its key map is **not** Tally's and is awkward to override |

**Decision: TanStack Table v8** (`@tanstack/react-table`) + `@tanstack/react-virtual` for
row virtualisation. Rationale: we are bootstrapped (₹0 external funding — a per-seat grid
licence is not defensible at ₹25k/client), and the *entire competitive premise* is a
bespoke Tally key map, which is exactly what a headless library is for. AG Grid's value is
its built-in UX; we specifically need to override that UX.

### 4.2 Styling — **hand-rolled CSS Modules**, do NOT enable Tailwind now

The brief proposed Tailwind. I recommend against it **for this phase**:

- Tailwind is currently **non-functional** (no PostCSS config, no CSS import). Enabling
  Tailwind v4 mid-project means a build-pipeline change that risks the 6 existing
  stylesheets and the KPR static-shell hydration workaround.
- Memory records a real incident: the review page was written with Tailwind classes and
  **rendered completely unstyled** in production because Tailwind isn't wired.

**Decision:** `console.module.css` + CSS custom properties for the design tokens, scoped to
`app/[slug]/console/`. If Aadi wants Tailwind, it is a **separate, isolated ticket** done
before Phase 1 — never in parallel with it.

> Either way, **remove the misleading unused Tailwind devDependencies** or wire them up
> properly. Leaving a half-installed framework in `package.json` is what caused the review
> page bug and will cause it again.

### 4.3 Data fetching — **TanStack Query**, Supabase Realtime deferred

- **Reads:** `@tanstack/react-query` against our own `/api/console/*` routes. Caching,
  background refetch, optimistic updates for inline edits.
- **Why not the Supabase JS client directly from the browser?** Because tenant scope would
  then depend on a client-set `x-client-id` header. Our trust boundary is the **HttpOnly
  JWT cookie**. All console reads/writes go through Next.js API routes that derive
  `client_id` from `getSession()`. This is non-negotiable.
- **Realtime: Phase 2, opt-in.** A back-office with 1–3 concurrent users does not need
  websockets. A 20-second `refetchInterval` on the grid is simpler and cheaper. Revisit
  when a client actually has concurrent editors.

### 4.4 Forms — `react-hook-form` (already a dependency)

Already in `package.json` at `^7.62.0`. Use it with a `zod` resolver so **one schema
validates both the client form and the API route** — no drift between UI validation and
server validation.

### 4.5 New dependencies (deliberately small)

```
@tanstack/react-table    ^8    MIT   grid
@tanstack/react-virtual  ^3    MIT   row virtualisation
@tanstack/react-query    ^5    MIT   server-state cache
zod                      ^3    MIT   shared client+server validation
```
Everything else (`framer-motion`, `lucide-react`, `react-hook-form`, `pdf-lib`) is present.

### 4.6 Tally integration — export, don't replace

KPR's accountant already uses Tally. The winning move is to **feed** it:
- **Phase 2:** Export Sales Vouchers as **Tally XML** (`<ENVELOPE><TALLYMESSAGE>` voucher
  format) and CSV. The accountant imports; nobody re-types.
- This is a genuine differentiator and ~2 days of work, versus ~6 months to build ledgers.

---

## 5. Architecture

### 5.1 Why a separate route, not a responsive `CustomerPortal.tsx`

`CustomerPortal.tsx` is a **1284-line single client component** with an `activeTab` string
union where every tab is a branch in one file (documented gotcha: change a tab and you must
edit the union, `tabTitles`, the nav button, *and* the pane). Adding six dense desktop
modules to it produces a ~4,000-line unmaintainable file and puts the mobile portal — which
works and is in production — at risk on every console deploy.

**Decision:** new route `app/[slug]/console/`. The mobile portal stays untouched and
becomes the explicit "lite" surface. A desktop visitor to `/<slug>/home` gets a banner
linking to the console; a mobile visitor to `/console` gets redirected to `/home`.

### 5.2 Layout shell

```
┌─────────────────────────────────────────────────────────────────────────┐
│ TOPBAR  [logo] KPR uPVC   [FY 2026-27 ▾] [F2 period]   [Ctrl+K Go To…]  │
├──────────┬──────────────────────────────────────────────────────────────┤
│ SIDEBAR  │  BREADCRUMB  Quotations › KPRUPVC-07082026-0042               │
│ 240px    │ ┌──────────────────────────────────────────────────────────┐ │
│ collaps- │ │                                                          │ │
│ ible to  │ │                    MAIN CONTENT                          │ │
│ 64px     │ │              (grid | split form+preview)                 │ │
│          │ │                                                          │ │
│ Overview │ └──────────────────────────────────────────────────────────┘ │
│ Quotes   ├──────────────────────────────────────────────────────────────┤
│ Customers│ STATUS BAR  12 rows · Rs. 8,42,300 · [Ctrl+S Save] [Esc Back] │
│ Products │              ← Tally's bottom button bar. Always shows the    │
│ Invoices │                valid shortcuts for THIS screen.               │
│ Reports  │                                                              │
│ Settings │                                                              │
└──────────┴──────────────────────────────────────────────────────────────┘
```

- **Breakpoint:** desktop-first from `1280px`. `1024–1279px` = compressed (sidebar
  auto-collapses, preview pane hides). `<1024px` = redirect to `/home`.
- **The status bar is load-bearing**, not decoration. Tally's bottom bar is how users learn
  shortcuts. It must be context-aware.

### 5.3 The field-visibility fix — split-view quotation editor

```
┌────────────────────────────────────────┬──────────────────────────┐
│ HEADER (3-column grid, all visible)    │   LIVE PREVIEW           │
│ Customer* [Alt+C new]  Ref    Date     │   ┌────────────────────┐ │
│ Phone                  Email  Status   │   │  Quotation         │ │
│ Address (span 3)                       │   │  KPRUPVC-…-0042    │ │
├────────────────────────────────────────┤   │  ─────────────     │ │
│ MEASURED ITEMS (editable grid)         │   │  1. Sliding Window │ │
│ # │Code│Desc│ W  │ H  │Qty│Sft │Rate│ Amt │  │     1200×1500  … │ │
│ 1 │SW01│Slid│1200│1500│ 2 │12.9│450 │11,625│  │  2. Fixed Panel  │ │
│ 2 │FP02│Fixe│ 900│1200│ 1 │11.6│380 │ 4,408│  │  ─────────────   │ │
│ + Alt+I add row                        │   │  Subtotal 16,033  │ │
├────────────────────────────────────────┤   │  GST 18%   2,886  │ │
│ UNMEASURED ITEMS  ▸ 2 items  Rs.3,500  │   │  TOTAL    18,919  │ │
├────────────────────────────────────────┤   └────────────────────┘ │
│ Subtotal 16,033 · GST 2,886 · Transport│   [Ctrl+P] [Ctrl+E] [Mail]│
│ 500 · GRAND TOTAL  Rs. 19,419          │                          │
└────────────────────────────────────────┴──────────────────────────┘
```

This directly answers KPR's complaint. Four things are visible **simultaneously and at all
times**: the header fields, every line item, the running totals, and the rendered document.
Nothing is revealed "at the end".

- `Sft` and `Amt` are **computed, read-only** columns — from `src/lib/pricing.ts`.
- Grid keyboard model: `Tab`/`Shift+Tab` between cells, `Enter` commits and moves down,
  `Alt+I` inserts a row, `Alt+X` deletes with confirm, arrow keys navigate, typing
  overwrites. This is spreadsheet behaviour, which is what fabricators already know.
- Preview is a **debounced (300 ms) client-side render** of the same layout the PDF uses —
  not a PDF round-trip.

### 5.4 Modules

| Module | Route | Backing store | Notes |
|---|---|---|---|
| Overview | `/console` | `get_quote_stats` RPC | KPIs, 8-week bars, pending follow-ups, expiring quotes |
| Quotations | `/console/quotations` | `quotations` + items | Grid: sort, filter, saved views, bulk status, bulk export, duplicate |
| Quotation editor | `/console/quotations/[id]` | ↑ | Split view (§5.3) |
| Customers | `/console/customers` | **`customers` (NEW §3.3)** | Ledger-style: quote history, total value, win rate, last contact |
| Products | `/console/products` | **`products` (NEW §3.3)** | Rate card. Feeds line-item autocomplete + bulk rate revision |
| Invoices | `/console/invoices` | `gst_invoices` (exists) | Quote → Invoice conversion |
| Reports | `/console/reports` | RPCs | Sales register, customer ledger, product movement, win/loss, GST summary |
| Settings | `/console/settings` | `clients.config` | Reuses `/api/portal_settings` |

**Reports must be drill-downs, not dead ends** (Tally pillar #3): `Enter` on any report row
opens the underlying quotation; `Esc` returns with scroll position and filters intact.

### 5.5 Bulk operations (Phase 2)

Status change, delete, export (CSV/XLSX/Tally XML), bulk email, bulk rate revision.
**Backend rule:** every bulk endpoint is (a) capped at 500 ids/request, (b) re-validates
`client_id` on **every** id server-side — never trusting the submitted list — and (c) returns
a per-id result array so partial failures are visible, not silent.

---

## 6. File structure

```
app/
  [slug]/console/
    layout.tsx                    # RSC: auth gate, client config, shell
    page.tsx                      # Overview
    ConsoleShell.tsx              # "use client": sidebar+topbar+statusbar+hotkeys
    console.module.css
    _components/
      DataGrid/                   # TanStack wrapper — used by EVERY module
        DataGrid.tsx  useGridKeyboard.ts  ColumnPicker.tsx
        FilterBar.tsx  SavedViews.tsx     BulkActionBar.tsx
      CommandPalette.tsx          # Ctrl+K / Alt+G
      StatusBar.tsx               # context-aware shortcut hints
      PeriodSelector.tsx          # F2
      EntityCombobox.tsx          # Alt+C create-on-the-fly
      LivePreview.tsx
      InlineCalculator.tsx        # Ctrl+/
    quotations/    page.tsx  [id]/page.tsx  QuotationEditor.tsx  ItemGrid.tsx
    customers/     page.tsx  [id]/page.tsx  CustomerLedger.tsx
    products/      page.tsx  ProductGrid.tsx
    invoices/      page.tsx
    reports/       page.tsx  [report]/page.tsx
    settings/      page.tsx

app/api/console/
  quotations/route.ts             # GET list (paged/sorted/filtered), POST create
  quotations/[id]/route.ts        # GET, PATCH, DELETE
  quotations/bulk/route.ts        # POST bulk ops
  customers/route.ts              # GET, POST        + [id]/route.ts
  products/route.ts               # GET, POST        + [id]/route.ts + bulk-rate
  reports/[report]/route.ts       # GET report data
  export/route.ts                 # CSV / XLSX / Tally XML
  stats/route.ts                  # replaces portal_stats for the console

src/lib/
  pricing.ts                      # NEW — §3.1 single source of truth
  console-auth.ts                 # NEW — requireConsoleSession() guard
  console-schemas.ts              # NEW — zod, shared client+server
  export/  csv.ts  xlsx.ts  tally-xml.ts
  hooks/   useHotkeys.ts  useSavedViews.ts

supabase/migrations/
  007_masters.sql                 # customers, products, FK, RLS, indexes
  008_console_rpcs.sql            # search_quotations, get_quote_stats, report RPCs
```

### 6.1 The API guard — every console route starts with this

```ts
// src/lib/console-auth.ts
export async function requireConsoleSession() {
  const session = await getSession();
  if (!session) return { error: json({ error: "Unauthorized" }, 401) };

  // admin may act on any client (via ?client_id=); customer is locked to their own
  if (session.role === "customer") {
    if (!session.client_id) return { error: json({ error: "No tenant" }, 403) };
    return { clientId: session.client_id, role: "customer" as const };
  }
  if (session.role === "admin") return { clientId: null, role: "admin" as const };
  return { error: json({ error: "Forbidden" }, 403) };
}
```

**Rules, enforced in review:**
- `client_id` comes from the **cookie**, never from the body or query (except an admin
  override, which is itself validated against the `clients` table).
- **No `Access-Control-Allow-Origin: *` on console routes.** The Flutter endpoints need
  wildcard CORS; the console is same-origin only. Business data must not be world-readable.
  (Same rule already applied to `/api/invoice/*`.)
- Service role is used only after the scope check, and every query still carries an
  explicit `.eq("client_id", clientId)` — defence in depth, since service role bypasses RLS.

---

## 7. Implementation phases

### Phase 0 — Data foundation (backend only, ~3–4 days) ← **START HERE**
1. `src/lib/pricing.ts`; delete the 3 duplicate TS formulas; Dart parity test.
2. Migration `007_masters.sql` — `customers`, `products`, FK, RLS, indexes (**Supa reviews**).
3. Backfill script: dedupe existing quotation customers into `customers`.
4. Migration `008_console_rpcs.sql` — `search_quotations`, `get_quote_stats` + trgm indexes.
5. `console-auth.ts`, `console-schemas.ts`.
6. `/api/console/quotations` + `/customers` + `/products` CRUD.

**Exit criteria:** `npx tsc --noEmit` clean, `npm run build` clean, every endpoint verified
with a real cURL against a real session cookie, cross-tenant access returns 403/0 rows.

### Phase 1 — Desktop shell + grids (~1 week)
Shell (sidebar/topbar/statusbar), `DataGrid` component, Quotations grid (server-side
paging/sort/filter/column picker), Customers grid, Products grid, split-view quotation
editor with live preview, `<1024px` redirect.
**Exit:** KPR can find any quotation in <5 s and see every field while editing.

### Phase 2 — Reports, bulk ops, exports (~1 week)
Sales register, customer ledger, product movement, win/loss, GST summary — all with
drill-down. Bulk status/export/email. CSV + XLSX + **Tally XML**. Quote→Invoice conversion.
Saved views.
**Exit:** KPR's accountant imports a month of sales into Tally without re-typing.

### Phase 3 — Power user layer (~4–5 days)
Full Tally key map (§1.2), `Ctrl+K`/`Alt+G` command palette, `Alt+C` create-on-the-fly,
`Ctrl+/` inline calculator, `PgUp`/`PgDn` between records, `F2` period selector, `Ctrl+,`
screen config, `?` shortcut cheatsheet overlay, optional Realtime.
**Exit:** a full quotation can be created and saved without touching the mouse.

---

## 8. Risks

| Risk | Severity | Mitigation |
|---|---|---|
| Browser reserves `Ctrl+A`/`Ctrl+Q`/`F12` | **High** — breaks the core promise | Key map in §1.2 is the contract; QA (Bugsy) tests every binding in Chrome + Edge before demo |
| `customers` backfill mangles historical quotes | **High** — data integrity | `customer_id` is additive and nullable; `customer_name`/`contact_no` snapshots are never overwritten; dry-run + full backup first (`scripts\run_backup.bat`) |
| Scope creep into real accounting | **High** — schedule death | Explicitly out of scope (§1.3). We export to Tally, we do not become Tally |
| Enabling Tailwind mid-build breaks 3,100 lines of CSS | Medium | Deferred entirely (§4.2) |
| `portal_stats` pattern copied into the console | Medium — dies at scale | Phase 0 replaces it with RPCs before any grid is built |
| Two dashboards to maintain | Medium | Shared API layer + shared `pricing.ts`; portal is frozen as "lite" |
| Migration 005 still unapplied; **all email is down (bad `SMTP_PASS`)** | Medium — blocks Phase 2 bulk email | Pre-existing P0 in my memory. Must be cleared before Phase 2 |

---

## 9. Open questions for Aadi / KPR

1. **Is this KPR-only or a platform feature?** Build multi-tenant from day one (my
   recommendation — same effort), or KPR-specific?
2. **Real volume?** How many quotations/month? Under ~200/mo, some Phase 0 optimisation can
   be deferred; over ~1000/mo it is mandatory.
3. **Does KPR actually run Tally today?** If yes, Tally XML export jumps to Phase 1 — it is
   the single highest-value feature and the strongest sales argument.
4. **Concurrent users?** Drives the Realtime decision.
5. **Inventory: rate card or real stock?** A product/rate master is ~1 day. Actual stock
   tracking with GRN/issue/valuation is 2+ weeks and a different product.
6. **Tailwind — enable properly, or remove the unused deps?** Must not stay half-installed.
7. **Timeline/budget.** Phases 0–3 total ~3.5–4 weeks of focused work. KPR is currently on
   an unpaid trial (`isPaid: false`) with ₹25k promised but not received. **My strong
   recommendation: do not start Phase 1 before payment lands.** Phase 0 is worth doing
   regardless — it fixes real correctness bugs in the existing product.

---

## 10. Recommendation

**Approve Phase 0 immediately, gate Phases 1–3 on KPR's payment.**

Phase 0 is pure backend hygiene that benefits every client today: it removes a duplicated
pricing formula that *will* eventually produce two different totals for the same quotation,
and it removes an unbounded query that will fall over as data grows. That work is not
speculative.

Phases 1–3 build a genuinely competitive product — but they are ~4 weeks of a 2-person
company's capacity for a client who has not yet paid the first ₹25k. Let's get Phase 0 in,
demo the split-view editor concept, and convert KPR to paid on the strength of the plan.
