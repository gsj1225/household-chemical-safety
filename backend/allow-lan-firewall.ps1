#Requires -RunAsAdministrator

param(
    [string]$RemoteAddress = "LocalSubnet"
)

$ruleName = "Mine Challenge API 8000 - Private LAN"
$existing = Get-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue

if ($null -eq $existing) {
    New-NetFirewallRule `
        -DisplayName $ruleName `
        -Direction Inbound `
        -Action Allow `
        -Protocol TCP `
        -LocalPort 8000 `
        -Profile Private `
        -RemoteAddress $RemoteAddress | Out-Null
} else {
    Set-NetFirewallRule `
        -DisplayName $ruleName `
        -Enabled True `
        -Profile Private `
        -Direction Inbound `
        -Action Allow
    Set-NetFirewallAddressFilter `
        -AssociatedNetFirewallRule $existing `
        -RemoteAddress $RemoteAddress
    Set-NetFirewallPortFilter `
        -AssociatedNetFirewallRule $existing `
        -Protocol TCP `
        -LocalPort 8000
}

Write-Host "Firewall rule is ready: $ruleName ($RemoteAddress)"
