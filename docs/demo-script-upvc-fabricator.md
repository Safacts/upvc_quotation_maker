# Apex uPVC Fabricators — five-minute demo

**Seed command:** `npm run seed:demo`
**Tenant:** `upvc-fabricator-demo`
**Purpose:** demonstrate the supported quotation workflow with realistic Hyderabad uPVC work. This is synthetic demo data, not a customer case study.

## Before the demo

1. Run `npm run seed:demo -- --dry-run`, then run `npm run seed:demo` with staging credentials loaded in `.env.local`.
2. Sign in to the demo tenant and confirm the brand reads **Apex uPVC Fabricators**.
3. Open the quotation list and confirm three records: `DEMO-25-26-0001` (draft), `0002` (sent), and `0003` (approved).
4. Do not present the synthetic customer names, GST numbers, or totals as real customer evidence.

## Five-minute run-through

### 0:00-1:00 — Start with a site measurement

Open `DEMO-25-26-0001` for Ramesh Kumar. Point out the 1,800 x 1,500 mm living-room sliding windows and the three 1,200 x 1,200 mm casement windows. Explain that each measured line preserves its own glass, profile, colour, and hardware configuration.

### 1:00-2:00 — Show the product catalogue

Open Products and show the six seeded products: 2-track and 3-track sliders, casement, French door, fixed window, and pleated mesh. Highlight that prices are per SFT and stock levels are visible. Change nothing during the demo unless the prospect asks; the seeded rates are the repeatable baseline.

### 2:00-3:00 — Generate a customer-ready quote

Return to `DEMO-25-26-0001`, show the installation line and ₹1,500 transport charge, then preview the branded PDF. Explain that the quote keeps the customer snapshot on the quotation even if the customer master changes later.

### 3:00-4:00 — Show the pipeline

Open the quotation list and filter by status. Explain the small, honest workflow: draft → sent → viewed → approved. Open `DEMO-25-26-0003` to show an approved premium villa quote with French door and fixed-window lines; do not claim that approval happened in production.

### 4:00-5:00 — Close on the next action

Share the PDF using the supported share action, then ask the fabricator which real product rates and dimensions should replace the demo catalogue. Capture that request as onboarding work; do not promise offline, payment, tax filing, or universal mobile support unless those capabilities have separately passed their release gates.

## Reset and safety

- The seeder is idempotent for the fixed demo IDs and is restricted to `upvc-fabricator-demo`-prefixed tenants.
- It never deletes rows and never writes outside the selected demo tenant.
- To refresh a demo, rerun the command. To remove demo data, use a separately reviewed tenant cleanup procedure; do not improvise a broad SQL delete during a customer session.
