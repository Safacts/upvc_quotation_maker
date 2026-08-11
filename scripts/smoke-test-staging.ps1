$ErrorActionPreference = "Stop"
$baseUrl = "https://upvcquotationmaker-i6ezk4ond-safacts-projects.vercel.app"
$routes = @(
    "/",
    "/upvc",
    "/upvc/pricing",
    "/upvc/pricing/show",
    "/upvc/login",
    "/privacy",
    "/terms",
    "/login",
    "/signup"
)
$failed = 0
foreach ($route in $routes) {
    $url = "$baseUrl$route"
    try {
        $resp = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 15
        if ($resp.StatusCode -eq 200 -or $resp.StatusCode -eq 308) {
            Write-Host "✅ $route -> $($resp.StatusCode)" -ForegroundColor Green
        } else {
            Write-Host "⚠️ $route -> $($resp.StatusCode)" -ForegroundColor Yellow
        }
    } catch {
        Write-Host "❌ $route -> $($_.Exception.Message)" -ForegroundColor Red
        $failed++
    }
}
if ($failed -gt 0) {
    Write-Host "`n$failed route(s) failed!" -ForegroundColor Red
    exit 1
} else {
    Write-Host "`nAll routes OK!" -ForegroundColor Green
}
