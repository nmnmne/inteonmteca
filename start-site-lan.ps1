$ErrorActionPreference = 'Stop'
$lanInterface = Get-NetIPConfiguration | Where-Object {
  $_.IPv4DefaultGateway -and $_.NetAdapter.Status -eq 'Up' -and
  (Get-NetConnectionProfile -InterfaceIndex $_.InterfaceIndex -ErrorAction SilentlyContinue).NetworkCategory -eq 'Private'
} | Select-Object -First 1
if (-not $lanInterface) { throw 'No connected private LAN interface with a gateway was found.' }
$lanAddress = $lanInterface.IPv4Address.IPAddress | Select-Object -First 1
$lanPython = (Get-Command python -ErrorAction Stop).Source
$lanListening = Get-NetTCPConnection -State Listen -LocalAddress $lanAddress -LocalPort 8080 -ErrorAction SilentlyContinue
if (-not $lanListening) {
  $lanArguments = @('-u', ('"' + (Join-Path $PSScriptRoot 'server\lan_preview.py') + '"'), '--host', $lanAddress)
  Start-Process -FilePath $lanPython -ArgumentList $lanArguments -WorkingDirectory $PSScriptRoot -WindowStyle Hidden `
    -RedirectStandardOutput (Join-Path $PSScriptRoot 'server\lan-preview.log') `
    -RedirectStandardError (Join-Path $PSScriptRoot 'server\lan-preview-error.log') | Out-Null
}
$lanReady = $false
for ($lanAttempt = 0; $lanAttempt -lt 12; $lanAttempt++) {
  try {
    $lanResponse = Invoke-WebRequest -Uri "http://${lanAddress}:8080/api/runtime" -UseBasicParsing -TimeoutSec 2
    if ($lanResponse.StatusCode -eq 200) { $lanReady = $true; break }
  } catch { Start-Sleep -Milliseconds 250 }
}
if (-not $lanReady) { throw 'LAN server did not start. See server\lan-preview-error.log.' }
$lanRule = Get-NetFirewallRule -Name 'inteonmteca-development-lan-8080' -ErrorAction SilentlyContinue
$lanFirewallReady = $false
if ($lanRule) {
  $lanFilter = $lanRule | Get-NetFirewallAddressFilter
  $lanPort = $lanRule | Get-NetFirewallPortFilter
  $lanApp = $lanRule | Get-NetFirewallApplicationFilter
  $lanFirewallReady = $lanRule.Enabled -eq 'True' -and $lanRule.Action -eq 'Allow' -and
    $lanRule.Profile -eq 'Private' -and $lanRule.Direction -eq 'Inbound' -and
    $lanFilter.LocalAddress -eq $lanAddress -and $lanFilter.RemoteAddress -eq 'LocalSubnet' -and
    $lanPort.Protocol -eq 'TCP' -and $lanPort.LocalPort -eq '8080' -and $lanApp.Program -eq 'Any'
}
if (-not $lanFirewallReady) {
  $lanFirewallScript = Join-Path $PSScriptRoot 'server\allow-lan-preview.ps1'
  $lanFirewallArgs = '-NoProfile -ExecutionPolicy Bypass -File "' + $lanFirewallScript + '" -LocalAddress ' + $lanAddress
  $lanAdmin = Start-Process -FilePath powershell.exe -Verb RunAs -WindowStyle Hidden -ArgumentList $lanFirewallArgs -Wait -PassThru
  if ($lanAdmin.ExitCode -ne 0) { throw 'Windows could not allow the LAN server through the firewall.' }
}
Write-Output "Phone preview: http://${lanAddress}:8080/"
