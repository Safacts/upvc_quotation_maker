[CmdletBinding()]
param(
  [Parameter(Mandatory=$true)][string]$BaseUrl,
  [switch]$DeployPreview,
  [switch]$SkipBuild,
  [int]$TimeoutSec = 30
)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

# This is deliberately non-destructive: it never copies production secrets or
# changes Supabase data. Vercel environment values must be repaired in the
# Vercel dashboard/CLI by an authorized operator.
$required = @('SUPABASE_URL','SUPABASE_ANON_KEY','SUPABASE_SERVICE_ROLE_KEY','QUOTE_TOKEN_SECRET','JWT_SECRET','SMTP_HOST','SMTP_USER','SMTP_PASS','SMTP_FROM')
Write-Host "Staging preflight for $BaseUrl"
foreach ($name in $required) {
  if (-not [Environment]::GetEnvironmentVariable($name)) { Write-Warning "Local process variable missing: $name (verify Preview env in Vercel)" }
}

if (-not $SkipBuild) {
  npm run build
  if ($LASTEXITCODE -ne 0) { throw 'Next.js build failed; refusing staging deployment.' }
}
if ($DeployPreview) {
  npx vercel --yes
  if ($LASTEXITCODE -ne 0) { throw 'Vercel preview deployment failed.' }
}

$env:UPTIME_BASE_URL = $BaseUrl.TrimEnd('/')
node scripts/uptime-check.mjs
if ($LASTEXITCODE -ne 0) { throw "Staging smoke failed for $BaseUrl" }
Write-Host 'Staging preflight and read-only smoke checks passed.' -ForegroundColor Green
