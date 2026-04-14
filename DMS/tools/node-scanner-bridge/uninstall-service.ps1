param(
  [string]$ServiceName = 'DMSNodeScannerBridge'
)

$ErrorActionPreference = 'Stop'

function Resolve-BridgeService {
  param(
    [Parameter(Mandatory = $true)]
    [string]$DesiredName
  )

  $candidates = @(
    $DesiredName,
    "$DesiredName.exe",
    $DesiredName.ToLowerInvariant(),
    "$($DesiredName.ToLowerInvariant()).exe"
  ) | Select-Object -Unique

  foreach ($candidate in $candidates) {
    $found = Get-Service -Name $candidate -ErrorAction SilentlyContinue
    if ($found) {
      return $found
    }
  }

  return Get-Service -ErrorAction SilentlyContinue | Where-Object {
    $_.DisplayName -eq 'DMS Node Scanner Bridge'
  } | Select-Object -First 1
}

function Test-IsAdministrator {
  $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
  $principal = New-Object Security.Principal.WindowsPrincipal($identity)
  return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

if (-not (Test-IsAdministrator)) {
  throw 'Administrator privileges are required. Re-run PowerShell as Administrator.'
}

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$nodePath = (Get-Command node -ErrorAction SilentlyContinue).Source
$uninstallHelperPath = Join-Path $scriptDir 'uninstall-service-node.cjs'

$service = Resolve-BridgeService -DesiredName $ServiceName
if (-not $service) {
  Write-Host "Service '$ServiceName' is not installed."
  exit 0
}

if ($service.Status -ne 'Stopped') {
  Write-Host "Stopping service '$($service.Name)'..."
  Stop-Service -Name $service.Name -Force -ErrorAction SilentlyContinue
}

if ($nodePath -and (Test-Path $uninstallHelperPath)) {
  Push-Location $scriptDir
  try {
    $env:DMS_BRIDGE_SERVICE_NAME = $service.Name
    & $nodePath $uninstallHelperPath
  }
  finally {
    Remove-Item Env:DMS_BRIDGE_SERVICE_NAME -ErrorAction SilentlyContinue
    Pop-Location
  }
}

$remaining = Resolve-BridgeService -DesiredName $ServiceName
if ($remaining) {
  Write-Host "Deleting service '$($remaining.Name)' via sc.exe fallback..."
  & sc.exe delete $remaining.Name | Out-Null
}

Write-Host "Service '$($service.Name)' removed."
