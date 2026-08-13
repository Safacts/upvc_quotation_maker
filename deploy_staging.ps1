git checkout staging
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

git merge feat/inapp-update --no-edit
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

git push origin staging
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

npx vercel --yes
