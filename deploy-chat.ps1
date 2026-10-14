$ErrorActionPreference = "Stop"
$yc = Join-Path $env:USERPROFILE "yandex-cloud\bin\yc.exe"
if (-not (Test-Path $yc)) { $yc = (Get-Command yc -ErrorAction Stop).Source }
$package = Join-Path $env:TEMP ("inteonmteca-chat-" + [guid]::NewGuid().ToString("N") + ".zip")
try {
  Compress-Archive -LiteralPath (Join-Path $PSScriptRoot "server\cloud\index.py"), (Join-Path $PSScriptRoot "server\cloud\requirements.txt") -DestinationPath $package
  & $yc serverless function version create --function-name inteonmteca-chat `
    --runtime python312 --entrypoint index.handler --memory 256MB --execution-timeout 20s `
    --service-account-id ajedcbh55b9jnrgf8p8i --source-path $package --concurrency 4 `
    --environment "YDB_ENDPOINT=grpcs://ydb.serverless.yandexcloud.net:2135,YDB_DATABASE=/ru-central1/b1gh4h9cu77s2nuqbjnl/etngchmctl26chvspior,YDB_METADATA_CREDENTIALS=1,POSTBOX_FROM=noreply@inteonmteca.online"
  if ($LASTEXITCODE -ne 0) { throw "Chat function deployment failed." }
  $health = Invoke-RestMethod "https://api.inteonmteca.online/api/runtime" -TimeoutSec 30
  if (-not $health.shared_chat) { throw "Shared chat health check failed." }
  Write-Host "Shared chat backend published and reachable." -ForegroundColor Green
} finally {
  if (Test-Path -LiteralPath $package) { Remove-Item -LiteralPath $package }
}
