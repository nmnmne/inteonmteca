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
$libraryPreparer = Join-Path $root "tools\prepare_dj_library.py"
$versionedStylesName = "styles.$version.css"
$versionedScriptName = "script.$version.js"
$deployIndexPath = Join-Path $env:TEMP "inteonmteca-index-$version.html"
$deployYardIndexPath = Join-Path $env:TEMP "inteonmteca-yard-index-$version.html"
$yardIndexPath = Join-Path $root "yard\index.html"
$roomIndexPath = Join-Path $root "listening-room.html"
$python = Get-Command python -ErrorAction SilentlyContinue
if (-not $python -or -not (Test-Path -LiteralPath $libraryPreparer)) {
  throw "Python and tools\prepare_dj_library.py are required to prepare the music library."
}
& $python.Source $libraryPreparer --root $root
if ($LASTEXITCODE -ne 0) { throw "Music library preparation failed." }

$syncArgs = @(
  "--exclude", "*",
  "--include", "index.html",
  "--include", "styles.css",
  "--include", "home-player.css",
  "--include", "sound-controls.css",
  "--include", "sound-filter.js",
  "--include", "sound-controls.js",
  "--include", "script.js",
  "--include", "home-effects.js",
  "--include", "alternate-logo.css",
  "--include", "alternate-logo.js",
  "--include", "responsive-ui.css",
  "--include", "graphics-quality.js",

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
  "--include", "room-console.css",
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
  "--include", "studio-holograms.js",
  "--include", "theme-morph.js",
  "--include", "track-play.js",
  "--include", "street-return.js",
  "--include", "playback-link.js",
  "--include", "media-session.js",

  "--include", "popup-coordinator.js",

  "--include", "mobile-stage.css",
  "--include", "desktop-edition.css",
  "--include", "graphics-quality.css",
  "--include", "pointer-life.css",
  "--include", "pointer-life.js",
  "--include", "dj-studio.css",
  "--include", "dj-decks.css",
  "--include", "dj-studio.js",
  "--include", "dj-decks.js",
  "--include", "dj-engine.js",
  "--include", "dj-scratch.js",
  "--include", "dj-analysis.js",
  "--include", "dj-import.js",
  "--include", "dj-midi.js",
  "--include", "dj-storage.js",
  "--include", "dj-loudness.js",
  "--include", "dj-spatial.js",
  "--include", "dj-spatial-tracks.js",
  "--include", "dj-import-loudness.js",
  "--include", "yard-backdrop.css",
  "--include", "yard-backdrop.js",
  "--include", "site.bundle.css",
  "--include", "site.bundle.js",
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

  "--exclude", "development-debug.js",
  "--exclude", "yard/debug-pose.js",
  "--exclude", "*.html"
)
$staleKeys = @(
  "development-debug.js",
  "yard/debug-pose.js",
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
function Read-PublicEntry([string]$path) {
  $html = [System.IO.File]::ReadAllText($path, [System.Text.Encoding]::UTF8)
  $html = $html -replace '<meta name="inteonmteca-api" content="[^"]*">', '<meta name="inteonmteca-api" content="https://api.inteonmteca.online">'
  $html = $html -replace '<script data-development-only[^>]*></script>', ''
  return $html -replace '\?v=[0-9A-Za-z._-]+', "?v=$version"
}
$indexHtml = Read-PublicEntry $indexPath
$roomHtml = if (Test-Path -LiteralPath $roomIndexPath -PathType Leaf) { Read-PublicEntry $roomIndexPath }

# Optional production bundle: one minified stylesheet and one minified script
# instead of ~16 CSS and ~26 JS requests. It needs Node plus a one-time
# `npm install`; without them the release publishes the individual files as before.
$nodeCommand = Get-Command node -ErrorAction SilentlyContinue
$bundleTool = Join-Path $root "tools\build-bundle.mjs"
if ($nodeCommand -and (Test-Path $bundleTool) -and (Test-Path (Join-Path $root "node_modules\esbuild"))) {
  $bundleInput = Join-Path $env:TEMP "inteonmteca-bundle-in-$version.html"
  $bundleOutput = Join-Path $env:TEMP "inteonmteca-bundle-out-$version.html"
  [System.IO.File]::WriteAllText($bundleInput, $indexHtml, [System.Text.UTF8Encoding]::new($false))
  & $nodeCommand.Source $bundleTool --root $root --html $bundleInput --out-html $bundleOutput | Out-Host
  if ($LASTEXITCODE -eq 0 -and (Test-Path $bundleOutput)) {
    $indexHtml = [System.IO.File]::ReadAllText($bundleOutput, [System.Text.Encoding]::UTF8)
    Write-Host "Homepage CSS/JS bundled and minified." -ForegroundColor Yellow
  } else {
    Write-Host "Bundling failed; publishing the individual files instead." -ForegroundColor DarkYellow
  }
  Remove-Item -LiteralPath $bundleInput, $bundleOutput -Force -ErrorAction SilentlyContinue
} else {
  Write-Host "Bundling skipped (run 'npm install' once to enable it); publishing the individual files." -ForegroundColor DarkYellow
}
$deployIndexHtml = $indexHtml -replace 'href="styles(?:\.[0-9]{8}-[0-9]{6})?\.css(?:\?v=[^"]*)?"', "href=`"$versionedStylesName`""
$deployIndexHtml = $deployIndexHtml -replace 'src="script(?:\.[0-9]{8}-[0-9]{6})?\.js(?:\?v=[^"]*)?"', "src=`"$versionedScriptName`""
[System.IO.File]::WriteAllText($deployIndexPath, $deployIndexHtml, [System.Text.UTF8Encoding]::new($false))
if (Test-Path $yardIndexPath) {
  $yardHtml = Read-PublicEntry $yardIndexPath
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

foreach ($scriptName in @("track-play.js", "street-return.js", "playback-link.js", "playlist-data.js", "room-resident.js")) {
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
$publicRootAssets = for ($i = 0; $i -lt $syncArgs.Count - 1; $i += 2) {
  if ($syncArgs[$i] -eq "--include") { $syncArgs[$i + 1] }
}
$assetFiles = Get-ChildItem -LiteralPath $root -File | Where-Object {
  $_.Extension -in @(".css", ".js") -and $publicRootAssets -contains $_.Name
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
    if ($null -ne $roomHtml) {
      $roomHtml = [regex]::Replace($roomHtml, $pattern, ('${1}' + $assetName + '"'))
    }
  }
}
[System.IO.File]::WriteAllText($deployIndexPath, $deployIndexHtml, [System.Text.UTF8Encoding]::new($false))

Write-Host ""
# Publish entry points only after every dependency upload has succeeded.
if ($null -ne $roomHtml) {
  $deployRoomPath = Join-Path $env:TEMP "inteonmteca-room-$version-$PID.html"
  try {
    [System.IO.File]::WriteAllText($deployRoomPath, $roomHtml, [System.Text.UTF8Encoding]::new($false))
    Invoke-Aws --endpoint-url $endpoint s3 cp $deployRoomPath "$bucketUrl/listening-room.html" `
      --content-type "text/html; charset=utf-8" `
      --cache-control $noCache `
      --metadata-directive REPLACE | Out-Host
  } finally { Remove-Item -LiteralPath $deployRoomPath -Force -ErrorAction SilentlyContinue }
}
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

# Retire only track artwork after the text-only entry points are published.
Invoke-Aws --endpoint-url $endpoint s3 rm "$bucketUrl/" --recursive --exclude "*" `
  --include "development-debug.*.js" | Out-Host
Invoke-Aws --endpoint-url $endpoint s3 rm "$bucketUrl/assets/track-covers/" --recursive | Out-Host
Invoke-Aws --endpoint-url $endpoint s3 rm "$bucketUrl/" --recursive --exclude "*" `
  --include "track-covers.js" --include "track-covers.css" `
  --include "track-covers.*.js" --include "track-covers.*.css" | Out-Host

Write-Host "Done." -ForegroundColor Green
Write-Host "Static site: https://inteonmteca.online/" -ForegroundColor Green
Write-Host "Shared chat API: https://api.inteonmteca.online" -ForegroundColor Green
