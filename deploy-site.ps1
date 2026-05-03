$ErrorActionPreference = "Stop"

$bucket = "inteonmteca.online"
$endpoint = "https://storage.yandexcloud.net"

Write-Host ""
Write-Host "Deploying to s3://$bucket (Yandex Object Storage)" -ForegroundColor Cyan
Write-Host ""

$aws = Get-Command aws -ErrorAction SilentlyContinue
if (-not $aws) {
  $awsCandidates = @(
    "$env:ProgramFiles\Amazon\AWSCLIV2\aws.exe",
    "${env:ProgramFiles(x86)}\Amazon\AWSCLIV2\aws.exe",
    "$env:LocalAppData\Programs\Amazon\AWSCLIV2\aws.exe"
  )
  $aws = $awsCandidates | Where-Object { $_ -and (Test-Path $_) } | Select-Object -First 1
}

if (-not $aws) {
  throw "AWS CLI (aws) not found. Install AWS CLI v2 or add aws.exe to PATH, then run update-site.cmd again."
}

$root = $PSScriptRoot
$bucketUrl = "s3://$bucket"
$noCache = "no-store, no-cache, max-age=0, s-maxage=0, must-revalidate, proxy-revalidate"
$version = Get-Date -Format "yyyyMMdd-HHmmss"
$indexPath = Join-Path $root "index.html"
$stylesPath = Join-Path $root "styles.css"
$scriptPath = Join-Path $root "script.js"
$versionedStylesName = "styles.$version.css"
$versionedScriptName = "script.$version.js"
$deployIndexPath = Join-Path $env:TEMP "inteonmteca-index-$version.html"
$syncArgs = @(
  "--exclude", "*",
  "--include", "index.html",
  "--include", "styles.css",
  "--include", "script.js",
  "--include", "assets/*",
  "--include", "assets/*/*",
  "--include", "assets/*/*/*",
  "--include", "media/*",
  "--include", "media/*/*",
  "--include", "media/*/*/*"
)
$staleKeys = @(
  ".gitignore",
  "LICENSE",
  "README.md",
  "desktop.ini",
  ".deployignore",
  "deploy-site.ps1",
  "update-site.cmd"
)

Get-ChildItem -Path $root -File -Include "styles.*.css", "script.*.js" | Remove-Item -Force

Write-Host "Updating asset version to $version..." -ForegroundColor Yellow
$indexHtml = [System.IO.File]::ReadAllText($indexPath, [System.Text.Encoding]::UTF8)
$deployIndexHtml = $indexHtml -replace 'href="styles(?:\.[0-9]{8}-[0-9]{6})?\.css(?:\?v=[^"]*)?"', "href=`"$versionedStylesName`""
$deployIndexHtml = $deployIndexHtml -replace 'src="script(?:\.[0-9]{8}-[0-9]{6})?\.js(?:\?v=[^"]*)?"', "src=`"$versionedScriptName`""
$deployIndexHtml = $deployIndexHtml -replace '\?v=[0-9A-Za-z._-]+', "?v=$version"
[System.IO.File]::WriteAllText($deployIndexPath, $deployIndexHtml, [System.Text.UTF8Encoding]::new($false))

# 1) Remove known non-public root files that may have been uploaded before.
foreach ($key in $staleKeys) {
  & $aws --endpoint-url $endpoint s3 rm "$bucketUrl/$key" | Out-Host
}

& $aws --endpoint-url $endpoint s3 rm $bucketUrl --recursive --exclude "*" --include "styles.*.css" --include "script.*.js" | Out-Host

# 2) Sync only public site files. This cannot upload .git, scripts, or local project metadata.
# During active development everything is uploaded with no-cache so devices revalidate files.
& $aws --endpoint-url $endpoint s3 sync $root "$bucketUrl/" --delete @syncArgs --cache-control $noCache | Out-Host

# 3) Force the entry files to get the exact headers/content-types even if their contents did not change.
& $aws --endpoint-url $endpoint s3 cp $deployIndexPath "$bucketUrl/index.html" `
  --content-type "text/html; charset=utf-8" `
  --cache-control $noCache `
  --metadata-directive REPLACE | Out-Host

& $aws --endpoint-url $endpoint s3 cp $stylesPath "$bucketUrl/styles.css" `
  --content-type "text/css; charset=utf-8" `
  --cache-control $noCache `
  --metadata-directive REPLACE | Out-Host

& $aws --endpoint-url $endpoint s3 cp $stylesPath "$bucketUrl/$versionedStylesName" `
  --content-type "text/css; charset=utf-8" `
  --cache-control $noCache `
  --metadata-directive REPLACE | Out-Host

& $aws --endpoint-url $endpoint s3 cp $scriptPath "$bucketUrl/script.js" `
  --content-type "application/javascript; charset=utf-8" `
  --cache-control $noCache `
  --metadata-directive REPLACE | Out-Host

& $aws --endpoint-url $endpoint s3 cp $scriptPath "$bucketUrl/$versionedScriptName" `
  --content-type "application/javascript; charset=utf-8" `
  --cache-control $noCache `
  --metadata-directive REPLACE | Out-Host

Write-Host ""
Write-Host "Done." -ForegroundColor Green
