$ErrorActionPreference = "Stop"

$bucket = "inteonmteca.online"
$endpoint = "https://storage.yandexcloud.net"

Write-Host ""
Write-Host "Deploying to s3://$bucket (Yandex Object Storage)" -ForegroundColor Cyan
Write-Host ""

if (-not (Get-Command aws -ErrorAction SilentlyContinue)) {
  throw "AWS CLI (aws) not found in PATH."
}

$ignore = Join-Path $PSScriptRoot ".deployignore"
$excludeArgs = @()
if (Test-Path $ignore) {
  $patterns = Get-Content $ignore | Where-Object { $_ -and -not $_.Trim().StartsWith("#") }
  foreach ($p in $patterns) {
    $excludeArgs += @("--exclude", $p.Trim())
  }
}

$root = $PSScriptRoot

# 1) Sync everything (fast) + delete removed files
aws --endpoint-url $endpoint s3 sync $root ("s3://{0}/" -f $bucket) --delete @excludeArgs | Out-Host

# 2) Force index.html to never be cached (critical for updates)
aws --endpoint-url $endpoint s3 cp (Join-Path $root "index.html") ("s3://{0}/index.html" -f $bucket) `
  --content-type "text/html; charset=utf-8" `
  --cache-control "no-cache, max-age=0, must-revalidate" `
  --metadata-directive REPLACE | Out-Host

Write-Host ""
Write-Host "Done." -ForegroundColor Green
