param(
  [Parameter(Mandatory=$true)][string]$LocalAddress
)
$ErrorActionPreference = 'Stop'
$lanRuleName = 'inteonmteca-development-lan-8080'
$lanRule = Get-NetFirewallRule -Name $lanRuleName -ErrorAction SilentlyContinue
if ($lanRule) {
  $lanRule | Set-NetFirewallRule -Enabled True -Action Allow -Profile Private -Direction Inbound
  $lanRule | Get-NetFirewallPortFilter | Set-NetFirewallPortFilter -Protocol TCP -LocalPort 8080
  $lanRule | Get-NetFirewallAddressFilter | Set-NetFirewallAddressFilter -LocalAddress $LocalAddress -RemoteAddress LocalSubnet
  $lanRule | Get-NetFirewallApplicationFilter | Set-NetFirewallApplicationFilter -Program Any
} else {
  New-NetFirewallRule -Name $lanRuleName -DisplayName 'inteonmteca development LAN (8080)' `
    -Direction Inbound -Action Allow -Enabled True -Profile Private `
    -Protocol TCP -LocalPort 8080 -LocalAddress $LocalAddress -RemoteAddress LocalSubnet `
    -Program Any | Out-Null
}
