# Vitharn Window Builder: Eva Gap Analysis

Date: 04-09-2026
Status: IMPLEMENTATION PLAN READY - LIVE EVA SAMPLE INSPECTION COMPLETE; KEY PDF OUTPUTS PARSED

## Scope

This audit compares the current Vitharn Window Builder and its connected 3D configurator with the publicly documented EvA Cloud Standard and Professional workflows. It does not attempt to copy EvA's proprietary profile database, formulas, UI, or code.

Primary comparison sources retrieved on 04-09-2026:

- https://evawinoptimize.com/website/eva-cloud-standard
- https://evawinoptimize.com/website/eva-cloud-professional
- https://evawinoptimize.com/website/packages

## Executive Verdict

Vitharn currently has a useful **single-window estimator and prototype fabrication view**. It is not yet a production-grade fenestration configurator.

The central missing capability is not another dropdown or a more attractive 3D scene. It is a canonical parametric opening model that can safely drive:

`opening design -> validated dimensions -> profile BOM -> glass schedule -> reinforcement/hardware -> cut list -> optimization -> quotation -> production`

The current product has several parts of this chain, but they are split across separate models and contain fixed assumptions. The Builder uses `src/lib/bom-engine.ts`; the 3D configurator uses `src/lib/window-topology.ts`; the production screens consume stored `bom_config`. These need to converge.

## What Eva Publicly Promises

### Design and quotation

- On-site quotation generation
- Quotation revisions and comparison within the same project
- Multiple quotation formats
- Complex opening designs, not only simple rectangles
- uPVC and aluminium support
- Global editing across a project
- 3D model link in the quotation

### Fabrication data

- Raw-material BOQ for profiles, reinforcement, accessories, and glass
- Images and part codes for materials
- Profile and glass cutting reports
- Exact dimensions, quantities, angles, and positions
- Hardware, screws, installation hardware, gasket, woolpile, and glazing details
- Profile optimization and off-cut management

### Manufacturing workflow

- Project-level consolidation and merged BOQ
- Pre-production site survey
- Order management
- Batching and production scheduling
- Inventory
- Shop-floor tracking
- Pre-delivery inspection
- Dispatch and installation
- Post-installation quality checks

## Verified Live Eva Sample

The logged-in `Aadisheshu` quotation was inspected read-only. No Eva record has been created, edited, saved, deleted, duplicated, submitted, or revised. Other quotations remain outside the authorized test scope.

Quotation `KPR-QT-00000421` contains one design (`01`), quantity `2`, system `PROMINANCE INVENTA SLIDING SERIES`, overall size `1500 x 1500 mm`, 3 sliding sashes, 5 mm frosted glass, SS flymesh, two touch-lock handles, calculated area `24.219 Sqft`, total weight `78.13 kg`, and unit value `₹25,820.55`.

The live design API returned a structured model for `finishedGoodsId=9229626`, not only a bitmap. It includes:

- `fgLines` with endpoint references, parent-line relationships, contexts, and optional per-part rule overrides
- `fgPolygons` with ordered line membership, parent polygons, frame/sash/glass/flymesh contexts, and `fgSystemType`
- `fgPoints` with explicit millimetre coordinates and junction types
- `fgPlanes` with origin, dimensions, and quaternion
- Material links, generated image metadata, report summaries, and an empty `fgSectionViews` collection for this sample
- Formula-backed variables such as `SILLHEIGHT=900`, `MTC=6000`, `SC=7315`, `GLASSNO`, `GLT`, `TRACKN`, sash order, `SASHAPW=740`, and `IsPolygonValid=true`

Eva's report summaries also expose named profile components, reinforcement codes, sash dimensions, roller/handle details, and a cost split: `PROFILE:36.87;RI:18.23;HARDWARE:0.00;GLASS:23.02`. This confirms the Phase 1 canonical schema must preserve geometry, semantic parts, rule variables, validation state, material references, and derived report artifacts together.

The inspected edit surface has separate design metadata fields (`Design ref.`, quantity, design name, location, floor number, note, selected glass), surface-finish selection, and an elevation editor with `Inside`/`Outside` views and editable dimension inputs. The form was opened for inspection only and will be exited without applying or saving changes.

The live `Pricing` tab exposes an ordered project price structure with 20 cost heads, calculation types, rates, and visibility flags. It separates profile, reinforcement, hardware, glass, mesh, labour, profit, transport, GST, and grand-total stages. The live `Report` tab groups project details, quotation/costing, material purchase orders, production, and dispatch/installation reports, but the current favourite panel has no report. The `Documents` tab includes pre-production survey, quotation, margins, credit approval, sales order/contract, other documents, and typology history, but the sample has no uploaded document. All 18 visible report cards were generated read-only as PDF browser blobs; no report was uploaded or persisted as a project document.

## Current Vitharn State

| Area | Current state | Assessment |
|---|---|---|
| Basic window types | Fixed, casement, sliding, French, ventilator, tilt-turn fallback | Partial |
| Width and height | Two numeric dimensions with basic range checks | Present but insufficient |
| 2D elevation | Parametric SVG for a limited type vocabulary | Present, visualization only |
| 3D preview | Client-side Three.js topology preview | Present, not fabrication-authoritative |
| Drag/drop design | No free topology editing; toolbox controls only select a tool | Missing |
| Arbitrary panel layout | Fixed generated panel counts and positions | Missing |
| Bay, bow, pivot, awning, louver | Not represented in the Builder model | Missing |
| Profile system | UI field exists, calculations remain hard-coded to F60/S60/M60-style rules | Critical gap |
| Profile library | No system-specific section, chamber, rebate, reinforcement, or machining library | Missing |
| Glass | Rectangular calculated panes and free-text specification | Partial |
| Hardware | Generic priced kit by hardware tier | Partial, not fabrication-ready |
| Reinforcement | Approximate percentage of total profile length | Not production-safe |
| BOM | Useful line list for current fixed rules | Partial |
| Cut list | Lengths and quantities only | Partial |
| Cut angles | No angle, orientation, position, or end-treatment data | Missing |
| Cut optimization | Best-fit style packing with off-cut input | Partial and not traceable enough |
| Optimization trace | Bar detail returns placeholder empty cut arrays | Defect |
| Glass cutting | Size schedule only; no edge allowance, edge processing, or pane labels | Partial |
| Project merge | No Builder-level multi-opening/project BOQ consolidation | Missing |
| Revisioning | Quotation duplication exists, but no design revision comparison workflow | Partial |
| 3D link in quotation | Separate viewer entry points exist | Partial integration |
| Cross-sectional drawing | No profile cross-section/CAD output tied to a selected system | Missing |
| Save design | Advanced configurator saves `window_designs`; Builder mainly creates a quotation draft | Split workflow |
| Survey/geotag | Some project/installation surfaces exist, but not a Builder-to-survey chain | Partial outside Builder |
| Production | Kanban, cutting, batches, dispatch and installation routes exist | Present as workflow shells |
| Quality inspection | No complete pre-delivery/post-installation inspection tied to opening components | Missing |

## Important Technical Findings

### 0. Eva report generation contract verified

The authorized quote exposes 18 visible PDF report cards across five report groups: two project-detail reports, eight quotation/costing reports, four BOQ reports, three production reports, and one installation report. Each card calls the read-style endpoint `POST https://evagate.evaerp.cloud/fgreports/api/FgReports/DownloadFgReports` with `screenId=10`, `renderType=PDF`, `ReportSource=QUOTE`, `FinishedGoodType=QUOTE`, `OpportunityQuoteId=851833`, a report ID, and a report format ID. All 18 card actions returned HTTP 200 and opened a browser blob. Representative response sizes were Basic Dimensions `160600` bytes, Elevation `190778`, Quotation `824595`, Project Cost Summary `169030`, Typology Cost Breakup `213088`, and Project Cost Breakup `173044`; response `Content-Disposition` filenames were quote-scoped to `Aadisheshu-KPR-QT-00000421`. The report action did not create an Eva Documents record. Parsed PDFs add these fabrication facts: Basic Dimensions reports design `01` as `1500 x 1500 mm`, `2.25 sqm`, `24.22 sqft`, quantity `2`, total `4.50 sqm`/`48.44 sqft`; Quotation reports unit price `₹20,881.82`, value `₹41,763.64`, and the exact profile/accessory descriptions; Profile BOQ reports 6 profile codes, 18 standard bars, and `96.400 Mtr` billing quantity; Profile Cutting Optimization reports 68 cut pieces, 18 standard bars, 18.73% waste including reusable rests versus 1.91% excluding reusable rests, with `10 mm` cutting tolerance and per-bar rest lengths. The cutting report lists 16 bead pieces of `1316/644 mm`, 6 guide-rail pieces of `1394 mm`, 8 casement-bead pieces of `1316/644 mm`, 8 frame pieces of `1505 mm`, 6 interlock pieces of `1412 mm`, and 24 sash pieces of `1417/745 mm`; it also includes a `50MM CASEMENT SINGLE GLASS BEAD` in this sliding quote, which requires validation rather than being silently copied. Remaining report PDFs were transport-verified but not field-parsed.

The Quotation PDF exposes a material pricing discrepancy that must be preserved as an unresolved source-of-truth issue: the PDF says `Value per Sq.Ft. 862.21`, `Unit Price 20881.82`, `Value 41763.64`, and Grand Total `51641.10`, while the live quote page and `QuoteLineItem/GetQuoteLineItemList` expose unit price `25820.5476` and total `51641.0952`; the global finished-good value endpoint also reports `20881.8200`. The PDF additionally includes a 15-day price-validity term, +/-30 mm size variation language, installation prerequisites, and customer-signature acceptance text. The Profile BOQ includes cross-section images, profile codes, standard-bar lengths, billing quantities, and a total of `96.400 Mtr`; the cutting report provides real bar layouts and reusable-rest calculations, proving that Eva's fabrication output contains more traceability than the current Vitharn optimizer output. The remaining report PDFs are catalogued and transport-verified but require a fresh logged-in Eva browser session for field-level parsing; no result is inferred from their names or report IDs.

### 1. Two competing design models

`src/lib/bom-engine.ts` uses `WindowConfig` and switch-based formulas. `src/lib/window-topology.ts` uses a recursive node tree. The Builder does not use the topology model, while the 3D configurator does.

This creates a correctness risk: the screen shown to the user, the BOM, the 3D model, and the stored production data can describe different openings.

### 2. Profile system is currently cosmetic

The Builder exposes `system`, `frameProfile`, `sashProfile`, and `mullionProfile`, but `bom-engine.ts` still emits fixed profile IDs and deductions. Changing a profile system does not currently load a real profile rule set.

### 3. The current BOM contains estimates, not machine/shop-floor instructions

The reinforcement calculation uses an approximate percentage of profile length. Hardware is represented as a generic kit. The output does not contain enough information for a fabricator to cut, drill, route, assemble, or inspect each component without manual interpretation.

### 4. The current optimizer is not auditable

`optimizeCuts()` calculates bar counts and waste, but its returned bar details contain empty `cuts` arrays. A printed saw sheet therefore cannot prove which physical pieces belong to which bar. The optimizer also needs profile-specific stock, kerf, end allowances, angle rules, and off-cut identity.

### 5. 3D is currently visualization, not design authority

The 3D configurator creates a topology preview and stores a design, but it does not yet express complete fabrication semantics such as handing, exact profile sections, hardware placements, machining positions, or verified cutting rules.

### 6. Server load is not the current Builder's main problem

The heavy Three.js scene is already rendered in the browser. The main server/API concern is repeated cloud data access and future report volume, not GPU rendering. Correctness and local-first caching can be addressed later without delaying the Builder's fabrication model.

## Recommended Product Direction

Do not chase EvA's 100+ system database as the first milestone. That is a supplier-data moat and requires manufacturer-verified inputs.

Build the strongest small and mid-size fabricator workflow first:

- One verified uPVC system rule pack
- Client-owned rate cards and material codes
- Parametric designs with real component breakdown
- Traceable glass/profile/reinforcement/hardware schedules
- Reliable cut optimization and off-cut reuse
- Quotation-to-order-to-production continuity
- Client-side 2D/3D rendering

Add more systems only after each rule pack has been validated against the supplier's technical documentation and a fabricator's sample jobs.

## Implementation Plan

### Phase 0: Measurement and golden fixtures

Before changing formulas, collect 10-20 real sample openings from one pilot fabricator. For each opening record:

- Overall width and height
- Opening type and handing
- Panel count and panel widths
- Profile codes and system depth
- Glass specification and actual cut size
- Reinforcement pieces
- Hardware and accessory quantities
- Cut lengths and cut angles
- Waste and off-cut result

Acceptance gate: a fixture file exists for every supported opening and the fabricator signs off the expected outputs.

### Phase 1: Canonical opening schema

Replace the split models with a versioned `WindowAssembly` schema. It should represent:

- Opening and project IDs
- Material family and profile system
- Overall dimensions
- Panel tree and panel boundaries
- Fixed/openable/slider/door semantics
- Handing and swing direction
- Mullions and transoms with positions
- Frame, sash, reinforcement, bead, gasket, mesh, glass, and hardware references
- Design notes and validation warnings
- Schema version and calculation-rule version

The existing `WindowTopology` can be evolved rather than discarded, but fabrication fields must be explicit and typed.

Acceptance gate: the 2D elevation, 3D preview, BOM, and saved JSON all derive from the same fixture payload.

### Phase 2: Real rule-pack engine

Create a data-driven, pure calculation engine. No arbitrary JavaScript formulas and no hidden constants in UI components.

Rule-pack contents:

- Profile sections and codes
- System depth and material
- Frame/sash/mullion/transom deductions
- Glass clearances and rebates
- Reinforcement mapping
- Bead/gasket/woolpile rules
- Hardware sets by opening type and size
- Maximum sash dimensions and weight warnings
- Valid opening combinations
- Cut-angle and end-treatment rules
- Stock lengths, kerf, weld allowance, and trim allowance

Acceptance gate: changing the selected system changes all applicable outputs, and invalid combinations are blocked with a reason.

### Phase 3: Builder redesign

Turn the Builder into an opening editor rather than a form with a preview.

- Start from templates for common openings
- Add/remove panels
- Set panel widths and positions
- Add mullions and transoms at exact positions
- Set fixed/openable/sliding/door behavior
- Set handing and swing direction
- Support mesh, louver, ventilator, and door options
- Show dimension lines and validation markers
- Provide duplicate/mirror/reuse actions
- Keep a clear calculation summary beside the design

Drag-and-drop can be added after the deterministic editor works. Mouse gestures must never be the only way to set a manufacturing dimension.

Acceptance gate: a user can recreate each golden fixture without editing JSON or relying on a free-text description.

### Phase 4: Fabrication outputs

Generate auditable schedules from the canonical assembly:

- Profile BOQ grouped by system, code, material, and length
- Reinforcement schedule
- Glass schedule with pane ID, final size, specification, quantity, and allowances
- Hardware/accessory schedule with component codes and quantities
- Profile cut list with piece ID, bar ID, length, angle at each end, orientation, position, and source opening
- Barcode/QR labels tied to opening and piece IDs
- Purchase BOQ grouped across a project
- Production packet linked to an order

Acceptance gate: a shop-floor worker can identify every piece from the printed schedule without guessing.

### Phase 5: Auditable optimization and off-cuts

Replace the display-only optimizer with a traceable optimizer:

- Optimize independently per profile code
- Respect stock lengths, kerf, end allowances, and cut angles
- Track each input piece and its source opening
- Use named off-cut inventory records, not a comma-separated text field
- Return exact bar layouts and leftover IDs
- Show baseline versus optimized waste and cost
- Allow manual lock/pin of a bar or cut where the shop requires it

Acceptance gate: replaying the optimizer with the same input and rule version produces the same bar plan and waste result.

### Phase 6: Quotation, revision, and project integration

- Save Builder designs independently before creating a quotation
- Link one quotation to multiple opening designs
- Link a design revision to its predecessor
- Compare revisions dimension-by-dimension and price-by-price
- Embed 2D elevation and a 3D model link in the quotation
- Convert an accepted quote to an order without losing the design snapshot
- Merge multiple openings into one BOQ and production batch

Acceptance gate: changing a quote revision never silently changes an accepted order's fabrication snapshot.

### Phase 7: Survey and quality loop

After the core Builder is accurate:

- Site survey form with aperture, sill, drainage, scaffolding, and installation notes
- Geo-tag and site photos
- Quote-versus-survey comparison
- Pre-delivery inspection checklist
- Dispatch and installation scan events
- Post-installation quality checklist
- Customer project status link

Acceptance gate: one opening can be traced from lead to survey, quotation, accepted order, production, dispatch, installation, and handover.

## Priority Order

| Priority | Deliverable | Why |
|---|---|---|
| P0 | Golden fixtures and rule-pack contract | Prevents attractive but unsafe fabricated numbers |
| P0 | Canonical opening schema | Removes divergence between Builder, 3D, BOM, and production |
| P1 | One verified uPVC system | Makes outputs trustworthy for a pilot client |
| P1 | Deterministic panel/topology editor | Closes the biggest UX gap |
| P1 | Exact glass/profile/reinforcement/hardware schedules | Turns the Builder into a factory tool |
| P1 | Traceable profile optimizer | Makes waste savings believable and actionable |
| P2 | Revision/project merge and quote integration | Connects designs to commercial workflow |
| P2 | Cross-sections and CAD export | Strong professional differentiator |
| P2 | Survey and quality loop | Completes quote-to-install workflow |
| P3 | More system libraries and aluminium | Scale after verification, not before |
| P3 | Machine integration | Only after real customer demand and stable outputs |

## What We Should Not Claim Yet

- Do not claim Eva-level fabrication precision from the current Builder.
- Do not claim the current generic hardware kit is a complete manufacturing BOM.
- Do not claim the current cut sheet contains verified angles or machine positions.
- Do not add profile codes from public documents without supplier/fabricator validation.
- Do not make 3D appearance the acceptance test; the schedule and physical sample must agree.

## What We Can Implement Next In Our Console (Local 05-09-2026 — Eva Read-Only vs localhost:3000/3100)

Verified on 05-09-2026: local gateway `http://localhost:3000` (Next `3100` + Flutter `8080`) is ahead of staging — Next 16.3.3 Turbopack ready in 10.4s. Eva comparison uses read-only `Aadisheshu` quote `KPR-QT-00000421` (`opportunityMastersId=890619`, `opportunityQuotesId=851833`, `finishedGoodsId=9229626`) — no other quotation may be mutated. Eva report transport verified via `POST https://evagate.evaerp.cloud/fgreports/api/FgReports/DownloadFgReports` (`screenId=10`, `OpportunityQuoteId=851833`, `isDownload=false`) with 18 report IDs; four PDFs parsed in detail (Basic Dimensions, Quotation, Profile BOQ, Profile Cutting Optimization). Local Builder inspected at `app/[slug]/console/builder/BuilderClient.tsx:1` and `src/lib/bom-engine.ts:1` (stock `6000mm`, `WindowConfig`, `buildBom`, `optimizeCuts`).

High-value, safe next increments for our console — ordered by effort/risk:

1. **Eva-grade 20-step price structure (no hard-coded ₹520)** — Local currently does `ratePerSqft` + generic hardware tier (`bom-engine.ts:87,212`). Eva exposes 20 ordered `quotesPriceElements` (`eva-price-elements.json:21`) with `calculationTypesId`, `formula`, `showInQuoteReport`, `effectOnTotal`: Profile Cost (`#PROFILECOST` ×0.9), Profile Wastage (`@Profile Cost.value` 0.9%), RI Cost (`#RICOST`), RI Wastage 5%, Hardware (`#HWCOST`), Glass (`#GLASSCOST`), Glass Wastage 5%, `Total Raw Material Cost`, Fabrication Labour (`#AreaSqftFg` ₹70), Installation Labour (`#AreaSqftFg` ₹50), `Sub Total Including Labour`, Profit 60% (`@Sub Total Including Labour.value`), `Basic Value`, Discount, `Sub Total`, Transportation ₹1000, Loading ₹1000, `Total Project Cost`, GST 18% (`@Total Project Cost.value`), `Grand Total`. Implement as data-driven `priceStructureId=974 Retail Projects` table, not switch-case. Copying the rate values is allowed; copying Eva’s proprietary profile/RI/HW cost internals without supplier validation is not.

2. **Traceable cutting + reusable off-cuts** — Local `optimizeCuts` at `bom-engine.ts:220` returns empty `cuts: []` per bar (`bom-engine.ts:256`) and computes waste globally. Eva cutting PDF shows per-bar `Rest` lengths (`496mm`, `0mm`, `568mm`), `Standard Bar: 3 Pcs Rest No: 3 Pcs`, `Inventory Cut Pieces` vs `Standard Bar`, `Cutting tolerance: 10 mm`, `Optimization waste: 0.92%`, and a `Wastage Summary` table (code, cross-section, `Wt/Mtr`, `Ordered/Used/Total Cut Pcs`, `Reusable Incl/Excl`). Fix local optimizer to emit per-bar `cuts[]`, `stockLen`, `kerf`, `tolerance`, `restId`, and `waste%`; persist off-cuts as named inventory rows instead of comma text (`BuilderClient.tsx:76,162`). Validate the spurious `50MM CASEMENT SINGLE GLASS BEAD` appearing in a 3-track sliding job before mirroring.

3. **Profile/RI/Glass BOQs with codes** — Local `BomLine` at `bom-engine.ts:40` emits hard-coded `F60/S60/M60` + `R15` approximated at 38% (`bom-engine.ts:201`) + generic `HW` kits. Eva BOQs show 6 profile codes (`PA62-UB-03`, `PAM116`, `PC50-UB-01`, `PS62-UF-02`, `PS62-UO-05`, `PS62-US-03`), stock lengths (`5.8m`/`6m`/`3m`), `Billing Qty`, `Unit Mtr`, `96.400 Mtr` total, and cross-section images. Add a tenant-owned `profile_catalog` table and render codes in Builder tabs (`BuilderClient.tsx:523`) and in `quotation-pdf.ts` elevation cards.

4. **Quotation PDF that matches Eva’s fabricator packet** — Local `quotation-pdf.ts` and `BuilderClient.tsx:162` print a generic saw sheet with placeholder `cuts.join(" + ")` fallback. Eva Quotation PDF is 3 pages: cover letter, window card (`Code 01 1500×1500`, `Sq.Ft. 24.219`, `Value per Sq.Ft. 862.21`, `Unit Price 20881.82`, `PROFILE:36.87;RI:18.23;GLASS:23.02`, frame/track/RI/bead/roller/handle details), and T&C + prerequisites. Port the layout but keep our data authority; note the unresolved price discrepancy (`20881.82` vs live `25820.5476`) explicitly — do not silently pick one.

5. **Revision + project merge** — Eva quote shows `revisionNumber=1`, `parentQuoteId=null`, `isQuotePriceOptimized=false` (`eva-opportunity.json:71,87`), plus a `Report` tab with project-level aggregation (`Total Area 4.50 sqm/48.44 sqft`). Local Builder currently creates a single `measured_items` draft per click (`BuilderClient.tsx:118`). Add `quotation_revisions` and `project_openings` tables so one project aggregates multiple openings, preserves snapshots on accept, and diffs revisions.

6. **Modules we should scaffold later (read-only Eva navigation confirmed 05-09-2026)** — Eva top nav exposes `Sales Management: Portfolio, Quote, Survey, Order`, `Production Management: Plan, Shop floor, Manufacture, Inventory, Fg inventory`, `Installation & Delivery: Dispatch, Install, Quality, Bill, Complaints`. Quote Design tabs are `Documents, Design, Pricing, Report`. Local already has `customers, quotations, measured_items` — next shells are `survey` (aperture/sill/geo-tag), `orders` (quote→order conversion), `batches/production`, and `dispatch/install` status.

All of the above respect the two rail guards: no `production/main` push without explicit written approval, and no Eva data mutation outside `Aadisheshu`.

## Definition of Ready for Implementation

The Builder upgrade is ready to begin when:

1. One pilot system is selected.
2. Ten to twenty real sample openings or a smaller explicitly approved fixture set is available.
3. The profile, glass, reinforcement, and hardware source data is identified.
4. Expected output for each fixture is recorded and approved.
5. The schema and rule-pack versioning approach is accepted.
6. Work begins on `development-v1` only; the existing cloud console remains operational until staging verification.

## Final Recommendation

Proceed with the upgrade, but build it as a **verified parametric fabrication engine** rather than an Eva-themed visual redesign. The first meaningful milestone is not “more window types”; it is one system where every dimension, BOM line, glass size, cut, price, and production label agrees with the fabricator's real work.
