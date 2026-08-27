# Vitharn UPVC Release Runbook

This runbook applies only to the Vitharn UPVC Quotation Maker. Nova is not part of this process.

## Normal feature release

1. Start from the existing `development-v1` worktree and preserve unrelated dirty files.
2. Make one customer-facing change at a time.
3. Run the relevant local tests and build checks.
4. Commit only the intended files to `development-v1`.
5. Push `development-v1`; this runs CI only and must not deploy.
6. Review the CI result and identity-preflight output.
7. When staging verification is wanted, promote the exact verified commit to `deployment-v1`.
8. Confirm the staging workflow uses the staging Supabase project and Vercel team.
9. Confirm the fixed staging domain and real tenant route work.
10. Check Flutter startup, branding/configuration, login controls, protected redirects, and browser errors.
11. Record the commit, workflow run, deployment URL, and verification results.
12. Present the evidence to Aadi.
13. Say `Requesting permission to push to production.` and wait for written approval.
14. After approval only, promote the exact verified commit to `main`.
15. Allow the single configured production deployment mechanism to deploy once.
16. Verify `https://app.vitharn.com` and the affected authenticated tenant route.
17. Record the production deployment and live verification evidence.

## Environment checks

| Check | Staging | Production |
|---|---|---|
| Branch | `deployment-v1` | `main` |
| Supabase ref | `vvkopgfumlideeslgbmk` | `jqjxhhgfwdzckijnnede` |
| Vercel identity | `vitarn.dev@gmail.com` | `safacts001@gmail.com` |
| Vercel team | `vitarndev-8132s-projects` | `safacts-projects` |
| URL | `https://vitharn-upvc-staging.vercel.app` | `https://app.vitharn.com` |

The deployment preflight must pass before deployment. Never print or paste token values.

## Rollback

1. Identify the exact bad release commit and deployment.
2. Stop further promotion.
3. Revert only the affected release commit or restore the last verified commit through the approved branch path.
4. Do not apply an emergency database migration as a substitute for rollback.
5. Re-run the affected public and authenticated route checks.
6. Record the failure, rollback commit, deployment, and recovery evidence.

## Required evidence

- source commit hash and branch;
- GitHub Actions workflow and run ID;
- identity-preflight result;
- staging deployment URL and fixed alias;
- real tenant startup verification;
- Aadi's written production approval, if production was requested;
- production deployment identifier;
- live production route and runtime-error verification;
- unresolved limitations.

## Hard stops

- Missing or mismatched Supabase/Vercel identity.
- Required CI failure.
- Flutter remains on `Loading...`.
- Tenant route or branding is wrong.
- Unauthenticated protection behaves unexpectedly.
- More than one deployment mechanism attempts the same release.
- Aadi's explicit production approval is absent.
