# One-time: create Secret Manager secret `database-url` and IAM so Cloud Build can deploy with --set-secrets.
# Usage (PowerShell, from anywhere):
#   1. Create a ONE-line file with your Cloud SQL URL (no trailing newline issues — script trims).
#      Example (replace USER/PASSWORD; URL-encode special chars in password):
#      postgresql://postgres:YOUR_PASSWORD@/swerte3?host=/cloudsql/swerte3:asia-southeast1:swerte3-db
#   2. .\scripts\gcp-first-deploy.ps1 -ConnectionStringFile C:\path\db-url.txt
#   3. cd ..  # backend folder
#   4. gcloud builds submit --config=cloudbuild.yaml --substitutions=COMMIT_SHA=$(git rev-parse HEAD),_CLOUD_SQL_INSTANCE=swerte3:asia-southeast1:swerte3-db

param(
    [Parameter(Mandatory = $true)]
    [string]$ConnectionStringFile
)

$ErrorActionPreference = "Stop"
$Project = "swerte3"
$ProjectNumber = gcloud projects describe $Project --format="value(projectNumber)"
$ComputeSa = "$ProjectNumber-compute@developer.gserviceaccount.com"
$CloudBuildSa = "$ProjectNumber@cloudbuild.gserviceaccount.com"

# Normalize path: trim quotes, stray spaces, and resolve relative paths (fixes many "file not found" cases).
$raw = $ConnectionStringFile.Trim().Trim([char]0x201C).Trim([char]0x201D).Trim('"').Trim("'")
if (-not [System.IO.Path]::IsPathRooted($raw)) {
    $raw = [System.IO.Path]::GetFullPath((Join-Path (Get-Location) $raw))
}
else {
    $raw = [System.IO.Path]::GetFullPath($raw)
}

if (-not (Test-Path -LiteralPath $raw)) {
    Write-Host ""
    Write-Host "File not found at:" -ForegroundColor Yellow
    Write-Host "  $raw"
    Write-Host ""
    Write-Host "This script only reads a plain .txt file from disk (not a Cursor note)." -ForegroundColor Gray
    Write-Host "Fix: In File Explorer, open the folder that contains db-swerte-url.txt, click the address bar," -ForegroundColor Gray
    Write-Host "copy the full path, then run:" -ForegroundColor Gray
    Write-Host '  .\scripts\gcp-first-deploy.ps1 -ConnectionStringFile "PASTE_FULL_PATH\db-swerte-url.txt"'
    Write-Host ""
    $parent = Split-Path -Parent $raw
    if ($parent -and (Test-Path -LiteralPath $parent)) {
        Write-Host "Files in that folder:" -ForegroundColor Yellow
        Get-ChildItem -LiteralPath $parent -ErrorAction SilentlyContinue | ForEach-Object { Write-Host "  $($_.Name)" }
    }
    elseif ($parent) {
        Write-Host "Folder does not exist: $parent" -ForegroundColor Yellow
        Write-Host "(OneDrive: wait for sync, or save the file again in that folder.)" -ForegroundColor Gray
    }
    throw "File not found (see hints above)."
}
$ConnectionStringFile = $raw

$conn = (Get-Content -Raw -LiteralPath $ConnectionStringFile).Trim()
if ($conn -notmatch '^postgresql://') {
    throw "Connection string must start with postgresql://"
}

gcloud config set project $Project | Out-Null

$tmp = [System.IO.Path]::GetTempFileName()
try {
    [System.IO.File]::WriteAllText($tmp, $conn, [System.Text.UTF8Encoding]::new($false))
    # Do not use `gcloud secrets describe` when the secret may not exist — it returns NOT_FOUND and
    # PowerShell surfaces gcloud stderr as a noisy error before we can create the secret.
    $secretNames = @(gcloud secrets list --project=$Project --format="value(name)" 2>$null)
    $exists = $secretNames -contains 'database-url'
    if ($exists) {
        gcloud secrets versions add database-url --data-file=$tmp --project=$Project
    }
    else {
        gcloud secrets create database-url --data-file=$tmp --replication-policy=automatic --project=$Project
    }
}
finally {
    Remove-Item -LiteralPath $tmp -Force -ErrorAction SilentlyContinue
}

gcloud secrets add-iam-policy-binding database-url `
    --member="serviceAccount:$ComputeSa" `
    --role="roles/secretmanager.secretAccessor" `
    --project=$Project

gcloud secrets add-iam-policy-binding database-url `
    --member="serviceAccount:$CloudBuildSa" `
    --role="roles/secretmanager.secretAccessor" `
    --project=$Project

$backendDir = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
Write-Host ""
Write-Host "Secret database-url is ready. Deploy from backend folder:" -ForegroundColor Green
Write-Host ('  cd "' + $backendDir + '"')
$sha = "build-" + [Guid]::NewGuid().ToString("N").Substring(0, 12)
Write-Host ('  gcloud builds submit --config=cloudbuild.yaml --substitutions=COMMIT_SHA=' + $sha + ',_CLOUD_SQL_INSTANCE=swerte3:asia-southeast1:swerte3-db')
Write-Host ""
Write-Host "Or with git: COMMIT_SHA=`$(git rev-parse HEAD)"
Write-Host "After deploy: Cloud Run -> Edit -> add env SECRET_KEY, DEBUG=false, DB_POOL_SIZE=2, DB_MAX_OVERFLOW=3."
Write-Host "Then run: alembic upgrade head (via Cloud SQL Auth Proxy or Cloud Shell)."
