# UPVC Quotation Maker — Complete Scaling Plan

## The Strategy (End to End)

**Phase 1 — Sell first, over-engineer later.**
**Phase 2 — Collect real feedback from real users.**
**Phase 3 — Build the real SaaS product based on actual pain points.**

---

## Phase 1: Sell White-Labeled APK (₹10k One-Time)

### Single Codebase, Config-Driven

```
lib/config/
  clients/
    venkateshwara.json    # Existing client
    client_b.json         # Future clients
  client_loader.dart      # Picks config from --dart-define at build time
```

Everything branded per client without touching code:
- App name, logo, colors
- Company name, address, phone, email, proprietor, GST
- Bank details, terms & conditions
- Quote number prefix

### Sales Flow

1. Prospect sees Venkateshwara demo (show on your phone or video)
2. You build APK with their branding (5 min config change + 3 min build)
3. They pay ₹10k → you hand over the APK
4. Done. No recurring charges. No AMC.

### When They Call Back

- Bug fix or small tweak → ₹2-5k per request
- New feature → ₹5k+ depending on complexity
- They **only call when they actually need something** — no chasing for renewals

### What You're Actually Collecting

Every support call reveals a real problem:
- "Can it do X?"
- "I hate doing Y manually"
- "Z feature would save me hours"

**These are your future SaaS features — validated by paying customers.**

---

## Phase 2: Web Trial System (For Future Prospects)

Optional but recommended before selling more copies.

### Architecture

```
https://app.vitharn.com/client-id   ← Flutter web (same codebase)
https://app.vitharn.com/admin       ← Manage clients
```

### How It Works

1. You create client config in admin panel (branding, trial expiry)
2. Prospect gets a link — opens in browser, fully functional with their branding
3. 14-day trial — they use it, give feedback
4. If they pay → you give them the APK
5. If they don't → link expires

### Admin Panel (Supabase `clients` table)

```sql
CREATE TABLE clients (
  id TEXT PRIMARY KEY,
  config JSONB,             -- all branding fields
  trial_expires_at TIMESTAMPTZ,
  is_active BOOLEAN DEFAULT true
);
```

### Hosting on Vercel

- Domain: `app.vitharn.com` (point Hostinger DNS to Vercel)
- Flutter web deployed via `flutter build web`
- One deploy serves all clients (config loaded dynamically from URL param)
- Your existing `vercel.json` needs updating for Flutter web (single page app rewrites)

---

## Phase 3: Build the Real SaaS Product

### What You'll Know By Then

From 10+ sales and support calls, you'll know:
- What features they actually use
- What's broken or painful
- What they'd pay monthly for
- What competitors are missing

### Then Build

A proper web-based SaaS (Flutter web or a lightweight stack) with:
- Subscription billing (₹1k-2k/month)
- Multi-tenant from day one
- All the features customers actually asked for
- No APK distribution headache

**Your first 10 clients will switch because they already trust you.**

---

## Summary

| Step | What You Do | Revenue |
|---|---|---|
| 1 | Sell Venkateshwara-style APK for ₹10k each | ₹1L (10 clients) |
| 2 | Charge per fix/feature when they call | ₹2-5k per request |
| 3 | Collect real pain points from support | — |
| 4 | Build SaaS based on validated needs | ₹1-2k/mo per client |
| 5 | Convert existing clients to SaaS | Recurring revenue |

**No repos to duplicate. No subscriptions to chase. No over-engineering.**

---

## Implementation Status

| Feature | Status |
|---|---|
| Config system (model + loader + JSON files) | ✅ Done |
| AppState refactored for config-driven defaults | ✅ Done |
| All screens updated to use config values | ✅ Done |
| Quote prefix configurable (from config, via dart-define) | ✅ Done |
| Theme colors (primary/accent) configurable | ✅ Done |
| Login screen uses dynamic admin emails from config | ✅ Done |
| Email templates use dynamic company name from config | ✅ Done |
| `schema_clients.sql` — clients table for config management | ✅ Done |
| `api/config.py` — Vercel serverless config endpoint | ✅ Done |
| `vercel.json` — SPA rewrite for Flutter web + config API route | ✅ Done |
| `.github/workflows/release.yml` — CI matrix build | ✅ Done |
| `http` package added for config fetching | ✅ Done |
| Web trial URL param loading (`?client=client-a`) | ✅ Done |
| Admin panel (manage clients via Supabase `clients` table) | 📝 Next |
| In-app update checker (version check + download) | 📝 Next |
| Web trial expiry check (gating logic) | 📝 Next |
| Flutter web deployment to Vercel | 🚀 Ready to deploy |

## Notes for Client Setup

### For each new client you need to:
1. Add entry in `clients` Supabase table (or `api/config.py`)
2. Create their Supabase project (optional, for data isolation)
3. Run `flutter build apk --dart-define=CLIENT_ID=client_x` 
4. Update the `get_next_quote_number()` SQL function in their Supabase to use their prefix

### SQL function note:
The `get_next_quote_number()` function in `schema.sql` uses hardcoded 'JVUPVC-'. For each client's Supabase project, update it:
```sql
CREATE OR REPLACE FUNCTION public.get_next_quote_number()
RETURNS TEXT AS $$
DECLARE
    next_val INT;
    date_part TEXT;
BEGIN
    next_val := nextval('quotation_no_seq');
    date_part := to_char(CURRENT_DATE, 'DDMMYYYY');
    RETURN 'CLIENT_PREFIX-' || date_part || '-' || lpad(next_val::text, 4, '0');
END;
$$ LANGUAGE plpgsql;
```
