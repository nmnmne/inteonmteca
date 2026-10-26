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

function Invoke-Aws {
  & $aws @args | Out-Host
  $exitCode = $LASTEXITCODE
  if ($exitCode -ne 0) {
    throw "AWS CLI failed with exit code $exitCode. Release stopped; entry files may not have been published."
  }
}

$root = $PSScriptRoot
$bucketUrl = "s3://$bucket"
$noCache = "no-store, no-cache, max-age=0, s-maxage=0, must-revalidate, proxy-revalidate"
$version = Get-Date -Format "yyyyMMdd-HHmmss"
$indexPath = Join-Path $root "index.html"
$stylesPath = Join-Path $root "styles.css"
$scriptPath = Join-Path $root "script.js"
$playlistPath = Join-Path $root "playlist.json"
$playlistGeneratorPath = Join-Path $root "tools\generate_playlist.py"
$versionedStylesName = "styles.$version.css"
$versionedScriptName = "script.$version.js"
$deployIndexPath = Join-Path $env:TEMP "inteonmteca-index-$version.html"
$deployYardIndexPath = Join-Path $env:TEMP "inteonmteca-yard-index-$version.html"
$yardIndexPath = Join-Path $root "yard\index.html"
$python = Get-Command python -ErrorAction SilentlyContinue
if (-not $python -or -not (Test-Path $playlistGeneratorPath)) {
  throw "Python and tools\generate_playlist.py are required for the shared playlist."
}
& $python.Source $playlistGeneratorPath --root $root
if ($LASTEXITCODE -ne 0) { throw "Playlist generation failed." }

$syncArgs = @(
  "--exclude", "*",
  "--include", "index.html",
  "--include", "styles.css",
  "--include", "home-player.css",
  "--include", "script.js",
  "--include", "home-effects.js",
  "--include", "alternate-logo.css",
  "--include", "alternate-logo.js",
  "--include", "responsive-ui.css",
  "--include", "graphics-quality.js",
  "--include", "development-debug.js",
  "--include", "theme-picker.js",
  "--include", "mobile-sections.js",
  "--include", "room-resident.js",
  "--include", "atmosphere-events.css",
  "--include", "atmosphere-events.js",
  "--include", "charged-material.css",
  "--include", "energy-field.js",
  "--include", "logo-ripples.js",
  "--include", "logo-storm.js",
  "--include", "logo-acid.js",
  "--include", "logo-materials.js",
  "--include", "mobile-logo-effects.js",
  "--include", "room-composition.css",
  "--include", "room-editor.css",
  "--include", "room-finish.css",
  "--include", "room-finish.js",
  "--include", "playlist-curve.js",
  "--include", "room-grid.css",
  "--include", "room-portal.css",
  "--include", "room-portal.js",
  "--include", "room-recesses.css",
  "--include", "text-waves.css",
  "--include", "text-waves.js",
  "--include", "theme-morph.js",
  "--include", "track-play.js",
  "--include", "street-return.js",
  "--include", "playback-link.js",
  "--include", "media-session.js",
  "--include", "track-covers.js",
  "--include", "popup-coordinator.js",
  "--include", "track-covers.css",
  "--include", "mobile-stage.css",
  "--include", "desktop-edition.css",
  "--include", "graphics-quality.css",
  "--include", "playlist.json",
  "--include", "playlist-data.js",
  "--include", "robots.txt",
  "--include", "sitemap.xml",
  "--include", "assets/*",
  "--include", "assets/*/*",
  "--include", "assets/*/*/*",
  "--include", "media/*",
  "--include", "media/*/*",
  "--include", "media/*/*/*",
  "--include", "yard/*",
  "--include", "yard/*/*",
  "--include", "yard/*/*/*",
  "--exclude", "assets/track-covers/renditions/*",
  "--exclude", "*.html"
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

# Keep local versioned assets: deployment must not clean the working tree.

Write-Host "Updating asset version to $version..." -ForegroundColor Yellow
$indexHtml = [System.IO.File]::ReadAllText($indexPath, [System.Text.Encoding]::UTF8)
$indexHtml = $indexHtml -replace '<meta name="inteonmteca-api" content="[^"]*">', '<meta name="inteonmteca-api" content="https://api.inteonmteca.online">'
$indexHtml = $indexHtml -replace '<script data-development-only[^>]*></script>', ''
$deployIndexHtml = $indexHtml -replace 'href="styles(?:\.[0-9]{8}-[0-9]{6})?\.css(?:\?v=[^"]*)?"', "href=`"$versionedStylesName`""
$deployIndexHtml = $deployIndexHtml -replace 'src="script(?:\.[0-9]{8}-[0-9]{6})?\.js(?:\?v=[^"]*)?"', "src=`"$versionedScriptName`""
$deployIndexHtml = $deployIndexHtml -replace '\?v=[0-9A-Za-z._-]+', "?v=$version"
[System.IO.File]::WriteAllText($deployIndexPath, $deployIndexHtml, [System.Text.UTF8Encoding]::new($false))
if (Test-Path $yardIndexPath) {
  $yardHtml = [System.IO.File]::ReadAllText($yardIndexPath, [System.Text.Encoding]::UTF8)
  $yardHtml = $yardHtml -replace '<script data-development-only[^>]*></script>', ''
  $yardHtml = $yardHtml -replace '\?v=[0-9A-Za-z._-]+', "?v=$version"
  [System.IO.File]::WriteAllText($deployYardIndexPath, $yardHtml, [System.Text.UTF8Encoding]::new($false))
}

# 1) Remove known non-public root files that may have been uploaded before.
foreach ($key in $staleKeys) {
  Invoke-Aws --endpoint-url $endpoint s3 rm "$bucketUrl/$key" | Out-Host
}

# Retain old versioned objects for cached pages and in-flight users.

# 2) Sync only public site files. This cannot upload .git, scripts, or local project metadata.
# During active development everything is uploaded with no-cache so devices revalidate files.
Invoke-Aws --endpoint-url $endpoint s3 sync $root "$bucketUrl/" @syncArgs --cache-control $noCache | Out-Host

# Immutable content-addressed images are separate from mutable entry points.
# Copy also repairs old no-store metadata on previously uploaded renditions.
# Retain old hashes for cached manifests; never delete during deployment.
Invoke-Aws --endpoint-url $endpoint s3 cp (Join-Path $root "assets/track-covers/renditions") "$bucketUrl/assets/track-covers/renditions/" `
  --recursive --cache-control "public, max-age=31536000, immutable" | Out-Host

# 3) Force the entry files to get the exact headers/content-types even if their contents did not change.
Invoke-Aws --endpoint-url $endpoint s3 cp $playlistPath "$bucketUrl/playlist.json" `
  --content-type "application/json; charset=utf-8" `
  --cache-control $noCache `
  --metadata-directive REPLACE | Out-Host



Invoke-Aws --endpoint-url $endpoint s3 cp $stylesPath "$bucketUrl/styles.css" `
  --content-type "text/css; charset=utf-8" `
  --cache-control $noCache `
  --metadata-directive REPLACE | Out-Host

Invoke-Aws --endpoint-url $endpoint s3 cp $stylesPath "$bucketUrl/$versionedStylesName" `
  --content-type "text/css; charset=utf-8" `
  --cache-control $noCache `
  --metadata-directive REPLACE | Out-Host

Invoke-Aws --endpoint-url $endpoint s3 cp (Join-Path $root "home-player.css") "$bucketUrl/home-player.css" `
  --content-type "text/css; charset=utf-8" `
  --cache-control $noCache `
  --metadata-directive REPLACE | Out-Host

Invoke-Aws --endpoint-url $endpoint s3 cp $scriptPath "$bucketUrl/script.js" `
  --content-type "application/javascript; charset=utf-8" `
  --cache-control $noCache `
  --metadata-directive REPLACE | Out-Host

Invoke-Aws --endpoint-url $endpoint s3 cp $scriptPath "$bucketUrl/$versionedScriptName" `
  --content-type "application/javascript; charset=utf-8" `
  --cache-control $noCache `
  --metadata-directive REPLACE | Out-Host

foreach ($scriptName in @("track-play.js", "street-return.js", "playback-link.js", "playlist-data.js", "track-covers.js", "room-resident.js")) {
  $scriptFile = Join-Path $root $scriptName
  if (-not (Test-Path $scriptFile)) { continue }
  Invoke-Aws --endpoint-url $endpoint s3 cp $scriptFile "$bucketUrl/$scriptName" `
    --content-type "application/javascript; charset=utf-8" `
    --cache-control $noCache `
    --metadata-directive REPLACE | Out-Host
}


$yardCss = Join-Path $root "yard\yard.css"
if (Test-Path $yardCss) {
  Invoke-Aws --endpoint-url $endpoint s3 cp $yardCss "$bucketUrl/yard/yard.css" `
    --content-type "text/css; charset=utf-8" `
    --cache-control $noCache `
    --metadata-directive REPLACE | Out-Host
}

# Build immutable gzip representations of allowlisted homepage CSS/JS. Keep
# objects at the bucket root so relative CSS image/font URLs retain their base.
$assetFiles = Get-ChildItem -LiteralPath $root -File | Where-Object {
  $_.Extension -in @(".css", ".js") -and $syncArgs -contains $_.Name
}
foreach ($assetFile in $assetFiles) {
  $assetBytes = [System.IO.File]::ReadAllBytes($assetFile.FullName)
  $digest = [System.Security.Cryptography.SHA256]::Create()
  try { $assetHash = ([BitConverter]::ToString($digest.ComputeHash($assetBytes))).Replace("-", "").Substring(0, 16).ToLowerInvariant() }
  finally { $digest.Dispose() }
  $assetName = "$($assetFile.BaseName).$assetHash$($assetFile.Extension)"
  $gzipPath = Join-Path $env:TEMP "inteonmteca-$assetName.gz"
  $outputStream = [System.IO.File]::Create($gzipPath)
  try {
    $gzipStream = [System.IO.Compression.GZipStream]::new($outputStream, [System.IO.Compression.CompressionLevel]::Optimal, $true)
    try { $gzipStream.Write($assetBytes, 0, $assetBytes.Length) }
    finally { $gzipStream.Dispose() }
  } finally { $outputStream.Dispose() }
  $mime = if ($assetFile.Extension -eq ".css") { "text/css; charset=utf-8" } else { "application/javascript; charset=utf-8" }
  try {
    Invoke-Aws --endpoint-url $endpoint s3 cp $gzipPath "$bucketUrl/$assetName" `
      --content-type $mime --content-encoding gzip --cache-control "public, max-age=31536000, immutable" | Out-Host
  } finally { Remove-Item -LiteralPath $gzipPath -Force }
  $aliases = @($assetFile.Name)
  if ($assetFile.Name -eq "styles.css") { $aliases += $versionedStylesName }
  if ($assetFile.Name -eq "script.js") { $aliases += $versionedScriptName }
  foreach ($alias in $aliases) {
    $pattern = '((?:src|href)=")' + [regex]::Escape($alias) + '(?:\?[^" ]*)?"'
    $deployIndexHtml = [regex]::Replace($deployIndexHtml, $pattern, ('${1}' + $assetName + '"'))
  }
}
[System.IO.File]::WriteAllText($deployIndexPath, $deployIndexHtml, [System.Text.UTF8Encoding]::new($false))

Write-Host ""
# Publish entry points only after every dependency upload has succeeded.
if (Test-Path $deployYardIndexPath) {
  Invoke-Aws --endpoint-url $endpoint s3 cp $deployYardIndexPath "$bucketUrl/yard/index.html" `
    --content-type "text/html; charset=utf-8" `
    --cache-control $noCache `
    --metadata-directive REPLACE | Out-Host
}

Invoke-Aws --endpoint-url $endpoint s3 cp $deployIndexPath "$bucketUrl/index.html" `
  --content-type "text/html; charset=utf-8" `
  --cache-control $noCache `
  --metadata-directive REPLACE | Out-Host

Write-Host "Done." -ForegroundColor Green
Write-Host "Static site: https://inteonmteca.online/" -ForegroundColor Green
Write-Host "Shared chat API: https://api.inteonmteca.online" -ForegroundColor Green
