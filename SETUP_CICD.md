# CI/CD Pipeline Setup for Vitharn UPVC Quotation Maker

## Branch Strategy

| Branch | Purpose | Triggers |
|--------|---------|----------|
| `development-v1` | All development work happens here | CI: Test & Build |
| `deployment-v1` | Ready for staging | Deploy to Staging (vitarn.dev) |
| `main` | Production-ready | Deploy to Production (safacts001@gmail.com) |

## Workflow

```
development-v1  →  (merge when ready)  →  deployment-v1  →  (approve)  →  main
     │                                        │                           │
     ▼                                        ▼                           ▼
  Test & Build                          Deploy to Staging           Deploy to Production
  (GitHub Actions)                      (vitarn.dev Vercel)         (safacts001 Vercel)
```

## GitHub Secrets Required

Go to GitHub Repository → Settings → Secrets and variables → Actions → New repository secret:

| Secret Name | Value | Description |
|-------------|-------|-------------|
| `VERCEL_TOKEN_STAGING` | `<STAGING_VERCEL_TOKEN>` | Staging (vitarn.dev) Vercel token |
| `VERCEL_TOKEN_PRODUCTION` | `<PRODUCTION_VERCEL_TOKEN>` | Production (safacts001) Vercel token |

## Vercel Environment Variables

### Production (safacts001@gmail.com) - Already Set ✅
| Variable | Environment | Value |
|----------|-------------|-------|
| JWT_SECRET | Production | `vitharn-jwt-secret-2026-production` |
| SUPABASE_URL | Production | `https://gumpmnbjdtzajhysnnaz.supabase.co` |
| SUPABASE_ANON_KEY | Production | From `.env` |
| SUPABASE_SERVICE_ROLE_KEY | Production | From `.env` |
| SUPABASE_KEY | Production | From `.env` |

### Staging (vitarn.dev) - **NEEDS MANUAL SETUP** ⚠️
The Vercel project is not connected to GitHub, so Preview env vars must be set manually:

1. Go to Vercel Dashboard → vitarn.dev account → upvc_quotation_maker project
2. Settings → Environment Variables
3. Add for **Preview** environment:

| Variable | Value |
|----------|-------|
| JWT_SECRET | `vitharn-jwt-secret-2026-staging` |
| SUPABASE_URL | `https://gumpmnbjdtzajhysnnaz.supabase.co` |
| SUPABASE_ANON_KEY | `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...` |
| SUPABASE_SERVICE_ROLE_KEY | `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...` |
| SUPABASE_KEY | `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...` |

## Token Storage (Local Only - Gitignored)

| File | Purpose |
|------|---------|
| `.env.vercel.production` | Production Vercel token & config |
| `.env.vercel.staging` | Staging Vercel token & config |

## Usage

### Development Workflow
```bash
# Work on development-v1
git checkout development-v1
# Make changes, commit, push
git push origin development-v1

# When ready for staging
git checkout deployment-v1
git merge development-v1
git push origin deployment-v1  # Triggers staging deployment

# When staging approved
git checkout main
git merge deployment-v1
git push origin main  # Triggers production deployment
```

### Manual Deploy Commands

**Deploy to Staging (vitarn.dev):**
```bash
npx vercel --token=<STAGING_VERCEL_TOKEN> \
  --scope=vitarn-dev-8132s-projects \
  --prod=false --yes
```

**Deploy to Production (safacts001):**
```bash
npx vercel --token=<PRODUCTION_VERCEL_TOKEN> \
  --scope=vitarndev-8132s-projects \
  --prod=true --yes
```

## Current Status

| Component | Status |
|-----------|--------|
| Branch structure | ✅ Created (development-v1, deployment-v1, main) |
| GitHub Actions workflow | ✅ Created (`.github/workflows/ci-cd-pipeline.yml`) |
| Token storage files | ✅ Created (`.env.vercel.production`, `.env.vercel.staging`) |
| Vercel production env vars | ✅ Set |
| Vercel staging Preview env vars | ⚠️ **Manual setup required** |
| GitHub Secrets | ⚠️ **Need to add in GitHub settings** |

## Next Steps

1. Add GitHub Secrets (`VERCEL_TOKEN_STAGING`, `VERCEL_TOKEN_PRODUCTION`)
2. Set Vercel Preview environment variables for staging (manual in dashboard)
3. Connect Vercel staging project to GitHub repository
4. Test the pipeline: push to `deployment-v1` → verify staging deploy
5. Approve and merge to `main` → verify production deploy