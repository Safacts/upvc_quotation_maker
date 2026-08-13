git stash push --include-untracked -m "stash before deploy"

git checkout staging
if ($LASTEXITCODE -ne 0) { Write-Host "Checkout staging failed"; exit $LASTEXITCODE }

git merge feature/desktop-dashboard --no-edit
if ($LASTEXITCODE -ne 0) { Write-Host "Merge to staging failed"; exit $LASTEXITCODE }

git push origin staging
if ($LASTEXITCODE -ne 0) { Write-Host "Push staging failed"; exit $LASTEXITCODE }

Write-Host "Deploying to Staging..."
npx vercel --yes
if ($LASTEXITCODE -ne 0) { Write-Host "Vercel staging deploy failed"; exit $LASTEXITCODE }

git checkout main
if ($LASTEXITCODE -ne 0) { Write-Host "Checkout main failed"; exit $LASTEXITCODE }

git merge staging --no-edit
if ($LASTEXITCODE -ne 0) { Write-Host "Merge to main failed"; exit $LASTEXITCODE }

git push origin main
if ($LASTEXITCODE -ne 0) { Write-Host "Push main failed"; exit $LASTEXITCODE }

Write-Host "Deploying to Production..."
npx vercel --prod --yes
if ($LASTEXITCODE -ne 0) { Write-Host "Vercel prod deploy failed"; exit $LASTEXITCODE }

git checkout feature/desktop-dashboard
git stash pop
Write-Host "Deployment Complete"
