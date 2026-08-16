# Vitharn Incident Response Playbook

**Owner:** Opsie (DevOps) | **Go/no-go authority:** Aadi | **Version:** 1.0 (17-08-2026)

## Scope and severity

- **SEV-1:** suspected data exposure, cross-tenant access, destructive corruption, credential exposure, or complete outage of the supported quotation path.
- **SEV-2:** a material customer-facing failure in login, save, PDF, share, or approval/status that has a workaround or limited blast radius.
- **SEV-3:** degraded non-critical functionality, monitoring noise, or an internal-only failure.

Never trade away tenant isolation, data integrity, privacy, or recovery evidence to improve a KPI.

## First 15 minutes

1. Acknowledge the alert and open an incident record with UTC start time, responder, affected deployment URL/commit, symptoms, and evidence links.
2. Classify severity. For SEV-1/2, notify Aadi and pause recruitment, releases, and customer-facing claims.
3. Preserve evidence before changing state: Vercel deployment, logs, request IDs, Supabase logs, monitoring output, and current git SHA. Do not copy secrets into the record.
4. Run the read-only probe: `UPTIME_BASE_URL=<affected-url> node scripts/uptime-check.mjs`.
5. Check whether the issue is deployment, environment/configuration, database/migration, authorization, dependency, or external provider failure.

## Containment and rollback

- **Security/privacy:** disable the affected route or deployment, revoke/rotate the suspected credential, preserve logs, and treat as SEV-1 until tenant impact is ruled out.
- **Bad release:** stop promotion, identify the last known-good deployment, and roll back through Vercel. Record the target deployment and reason. Do not rewrite history.
- **Staging configuration:** use `scripts/repair-staging.ps1`; verify Preview environment variables in Vercel without printing values. Never use production secrets in staging.
- **Database/migration:** stop writes if integrity is uncertain. Do not run an unreviewed migration or restore over production. Supa owns schema/restore decisions.
- **Provider outage:** document provider status and activate the smallest safe workaround; do not claim availability until the supported path is verified.

## Recovery gate

Before closing or resuming pilots, Opsie records: affected routes/tenants, root cause, exact fix or rollback, deployment SHA, migration status, probe output, core smoke result, authorization/privacy result where relevant, and remaining untested areas. Bugsy independently verifies customer-facing behavior. Aadi approves resuming customer-impacting commitments.

## Communication

Use factual, time-stamped updates: **detected**, **impact**, **containment**, **next check**, **resolved/monitoring**. Do not disclose PII, credentials, speculative causes, or unverified uptime/availability claims. Customer communication is sent only after the impact and workaround are confirmed.

## Post-incident within 48 hours

- Write a blameless timeline and root cause.
- Separate detection, containment, recovery, and prevention actions; assign owners and due dates.
- Add a regression test or monitoring check for every preventable failure.
- Reconcile affected tenant/customer/quotation records and document whether notification or remediation is required.
- Update the release gate and this playbook if the control was missing or ambiguous.
