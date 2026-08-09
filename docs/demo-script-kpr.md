# KPR Demo Script — Desktop Dashboard

**Author:** Growlithe (Growth Marketer, Vitharn ERP Services)
**Date:** 09-08-2026
**Status:** READY — pending security fixes + split-view editor build
**Estimated demo time:** 12-15 minutes
**Prerequisite checklist below MUST be completed before ANY demo.**

---

## 🔴 PREREQUISITE CHECKLIST (Non-Negotiable)

Do NOT demo until ALL of these are checked:

| # | Item | Owner | Status |
|---|------|-------|--------|
| 1 | **Google Sign-In fixed** — server-side JWT verification (ISO-AUTH-01) | Nexy | 🔴 OPEN |
| 2 | **JWT_SECRET set** — real env var, not fallback (ISO-10) | Nexy | 🔴 OPEN |
| 3 | **Email working** — fresh Brevo SMTP key from Aadi | Aadi | 🔴 OPEN |
| 4 | **Split-view editor built** — entry grid left + live preview right | Nexy | 🔴 Not started |
| 5 | **KPR account pre-loaded** — their logo, their products, their sample quotes | Aadi/Opsie | ⬜ Pending |
| 6 | **Pricing formula deduplicated** — `pricing.ts` single source of truth | Nexy | 🔴 Not started |
| 7 | **QA sign-off on split-view editor** — 2 days dedicated testing | Bugsy | ⬜ Pending |
| 8 | **Pilot Agreement signed** — digital signature via WhatsApp photo | Scribe/Aadi | ⬜ Pending |

**If items 1-4 are not complete, DO NOT DEMO. A broken demo = lost credibility in a tight-knit market.**

---

## THE DEMO — Step by Step

### STEP 0: Pre-Demo Setup (BEFORE they join the call) — 30 min

1. **Create KPR's desktop console account** with:
   - Their logo (`/api/favicon/kprupvc`)
   - Their business name: "KPR Fabricators"
   - 2-3 pre-loaded sample quotations with THEIR typical products (sliding windows, doors, etc.)
   - Their actual product catalog and rates if available
2. **Test the full flow yourself** — login, open console, create quote, generate PDF
3. **Have the Pilot Agreement open** in a separate tab — ready to send the moment they say yes
4. **UPI payment QR visible** — ₹25,000 ready to collect

**Result when they log in:** It feels like THEIR system, not a generic demo.

---

### STEP 1: The Hook (First 30 Seconds) — "See What You Create"

**Don't show the dashboard grid. Lead with the SPLIT-VIEW EDITOR.**

**Say:**
> "KPR — you told us the problem with mobile was you couldn't SEE what you were entering. Watch this. I'm going to create a quotation for a 1200×1500 sliding window."

**Do:**
1. Open the quotation editor
2. Type dimensions in the left panel (width: 1200, height: 1500)
3. **The quote formats itself LIVE on the right side** — they see the actual PDF as it builds
4. Add a line item — "Sliding Window, 4x6, clear glass"
5. Watch the totals update in real-time: subtotal → GST → grand total

**Say:**
> "See that? You're not typing blind. You see exactly what your customer will see — right now, as you build it. No surprises. No 'did I enter that wrong?'"

**This is the moment. Their eyes widen. They lean in. This is what sells.**

---

### STEP 2: The Pain-Point Walkthrough (Next 3 Minutes)

Now walk through their daily workflow — show how each pain is solved:

#### Pain 1: "We lose track of who owes us money"
**Click:** Customer Ledger → Show KPR's top customers
**Say:**
> "Right now, how do you know who owes you money? A notebook? Memory? This shows you every customer, every quote, every payment, every pending balance — one click. ₹85,000 overdue from 5 customers right there."

#### Pain 2: "We forget to follow up on quotes"
**Click:** Win/Loss Report or Follow-up Dashboard
**Say:**
> "You sent 12 quotes last month. 8 were accepted. 4 went silent. Which 4? Here they are — sitting there for 15 days with no follow-up. The system flags them for you. No more 'I forgot to call them back.'"

#### Pain 3: "Our accountant needs Tally"
**Click:** Reports → Sales Register → "Export → Tally XML"
**Say:**
> "Your accountant uses Tally. We're not asking them to stop. You export a month's sales as one Tally XML file — click here — and your accountant imports it in 30 seconds. No re-typing. No transcription errors."

**If Tally XML is not yet built, say:**
> "This is what Phase 2 delivers — coming in [X] weeks. The reports engine is the same. Tally XML is just another export format on top."

---

### STEP 3: The Personalization (Next 2 Minutes) — "This is YOURS"

**Say:**
> "This isn't a demo with fake data. This is YOUR business. YOUR logo. YOUR products. Wanna change the rate for a sliding window?"

**Let THEM type something.** Mouse over, let them change a rate or add a line item.
**They type → they see it update → ownership feeling kicks in → "this is mine now."**

**Say:**
> "See? If I change the rate here, it updates everywhere — every future quote, every report. One change, done."

---

### STEP 4: The Close (Last 30 Seconds) — Assumptive

**Don't ask "are you interested?" That invites "let me think about it."**

**Say instead:**
> "So — this is yours for ₹25,000 one-time. No monthly fees. No per-user charges. Your whole team uses it. Your accountant gets Tally exports. You get paid faster. When do you want to start?"

**If they say yes:**
> "Great. I'm sending you the Pilot Agreement right now — one page, plain terms. Sign it on WhatsApp, pay via UPI, and I'll have your full account ready by tomorrow morning."

**If they hesitate → deploy objection handling (see below).**

---

### STEP 5: The Pilot Agreement (Same Day)

1. Send `06_Desktop_Dashboard_Pilot_Agreement.md` via WhatsApp
2. Digital signature = WhatsApp photo of signed doc (legally valid in India)
3. UPI payment to `6304562779@nyes` — ₹25,000
4. Payment in 24-48 hours → activate full account
5. Invoice raised within 24 hours of payment

---

## OBJECTION HANDLING — What They'll Say, What You Say

| They Say | You Say |
|---|---|
| "We already use Tally" | "Perfect! Keep Tally for accounting. We handle quotes, customers, payments — everything BEFORE Tally. We feed Tally, not fight it." |
| "It's too expensive" | "₹25,000 one-time. How much did you lose last year from ONE quotation error? This pays for itself in the first week." |
| "We're not tech-savvy" | "You use WhatsApp, YouTube, and Paytm daily. This is simpler than those. We'll set everything up for you. You just type and click 'Send.'" |
| "What if you shut down?" | "Your data is yours. CSV, XLSX, PDF — one click and you have everything. Here's our data portability guarantee in writing." |
| "My accountant won't like it" | "Your accountant keeps using Tally. We export Tally XML. Their Tally gets cleaner, not replaced." |
| "We need to think" | "Of course — it's an investment. Let me ask: what specifically would you need to see to feel confident this is right for your business?" |
| "Can we get a discount?" | "This IS the early adopter price. Regular price will be ₹40-50k. You're getting the best we'll ever offer." |
| "What about mobile?" | "Your site guys keep using the app they already love. Same data, same account — phone for the field, laptop for the office." |

---

## TIMING SUMMARY

| Step | Duration | Cumulative |
|---|---|---|
| Pre-demo setup | 30 min (before call) | — |
| The Hook (split-view editor) | 30 sec | 0:30 |
| Pain-point walkthrough | 3 min | 3:30 |
| Personalization (let them type) | 2 min | 5:30 |
| The Close | 30 sec | 6:00 |
| Pilot Agreement walkthrough | 2 min | 8:00 |
| Q&A / objection handling | 3-5 min | 10-13 min |
| **Total** | **~12-15 min** | |

---

## POST-DEMO CHECKLIST

- [ ] Send Pilot Agreement within 1 hour (while excitement is fresh)
- [ ] Follow up in 24 hours if no response
- [ ] If paid → activate account + send onboarding doc
- [ ] If unpaid after 7 days → gentle reminder
- [ ] If unpaid after 14 days → pause access, offer data export
- [ ] 30 days after payment → ask for referral

---

## WHAT THIS DEMO NEEDS TO BE PERFECT

| Risk | Mitigation |
|---|---|
| Split-view editor stutters | Bugsy tests for 2 days before demo |
| Keyboard shortcut fails mid-demo | Bugsy tests Chrome + Edge on Windows |
| PDF doesn't match preview | Preview ↔ PDF parity test (Bugsy) |
| Mobile/Desktop show different totals | Pricing parity test (Dart ↔ TS) |
| Demo env goes down | Use production, not staging |
| "Can I see Tally XML import?" | Have a pre-recorded screen recording as backup |

---

*Great demos don't sell features. They sell the feeling of "I can't go back to how I worked before." Make them feel that in the first 30 seconds.*

— Growlithe 📣
