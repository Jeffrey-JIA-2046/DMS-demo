param(
  [string]$ServiceName = 'DMSNodeScannerBridge',
  [string]$DisplayName = 'DMS Node Scanner Bridge',
  [switch]$InstallDependencies
)

$ErrorActionPreference = 'Stop'

function Invoke-ScExe {
  param(
    [Parameter(Mandatory = $true)]
    [string[]]$Arguments,
    [Parameter(Mandatory = $true)]
    [string]$ActionDescription
  )

  $output = & sc.exe @Arguments 2>&1
  if ($LASTEXITCODE -ne 0) {
    $details = if ($output) { ($output | Out-String).Trim() } else { 'No output from sc.exe.' }
    throw "$ActionDescription failed. sc.exe exit code: $LASTEXITCODE. Details: $details"
  }
  return $output
}

function Test-IsAdministrator {
  $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
  $principal = New-Object Security.Principal.WindowsPrincipal($identity)
  return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Resolve-BridgeService {
  param(
    [Parameter(Mandatory = $true)]
    [string]$DesiredName,
    [Parameter(Mandatory = $true)]
    [string]$DesiredDisplayName
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
    $_.DisplayName -eq $DesiredDisplayName -or $_.DisplayName -eq $DesiredName
  } | Select-Object -First 1
}

if (-not (Test-IsAdministrator)) {
  throw 'Administrator privileges are required. Re-run PowerShell as Administrator.'
}

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$serverPath = Join-Path $scriptDir 'server.js'
$packageJsonPath = Join-Path $scriptDir 'package.json'
$installHelperPath = Join-Path $scriptDir 'install-service-node.cjs'
$serviceLogPath = Join-Path $scriptDir 'service.log'

if (-not (Test-Path $serverPath)) {
  throw "server.js not found at: $serverPath"
}

if (-not (Test-Path $packageJsonPath)) {
  throw "package.json not found at: $packageJsonPath"
}

if (-not (Test-Path $installHelperPath)) {
  throw "install-service-node.cjs not found at: $installHelperPath"
}

$nodeCommand = Get-Command node -ErrorAction SilentlyContinue
if (-not $nodeCommand) {
  throw 'Node.js executable not found on PATH. Install Node.js 18+ first.'
}
$nodePath = $nodeCommand.Source

Push-Location $scriptDir
try {
  if ($InstallDependencies -or -not (Test-Path (Join-Path $scriptDir 'node_modules'))) {
    Write-Host 'Installing bridge dependencies with npm install...'
    npm install
    if ($LASTEXITCODE -ne 0) {
      throw 'npm install failed. Resolve npm errors and retry.'
    }
  }
}
finally {
  Pop-Location
}

$description = 'Local scanner bridge for DMS frontend (http://localhost:8787).'
$failureActions = 'restart/5000/restart/5000/restart/5000'

$resolvedExistingService = Resolve-BridgeService -DesiredName $ServiceName -DesiredDisplayName $DisplayName
$serviceRegistryPath = if ($resolvedExistingService) {
  "HKLM:\SYSTEM\CurrentControlSet\Services\$($resolvedExistingService.Name)"
} else {
  "HKLM:\SYSTEM\CurrentControlSet\Services\$ServiceName"
}

$existing = $resolvedExistingService
if ($existing) {
  Write-Host "Service '$($existing.Name)' already exists. Recreating service entry..."
  if ($existing.Status -ne 'Stopped') {
    Stop-Service -Name $existing.Name -Force -ErrorAction SilentlyContinue
  }
  Invoke-ScExe -Arguments @('delete', $existing.Name) -ActionDescription "Deleting existing service '$($existing.Name)'"
  for ($i = 0; $i -lt 20; $i += 1) {
    if (-not (Resolve-BridgeService -DesiredName $ServiceName -DesiredDisplayName $DisplayName)) {
      break
    }
    Start-Sleep -Milliseconds 300
  }
}

Write-Host "Creating service '$ServiceName'..."
Push-Location $scriptDir
try {
  $env:DMS_BRIDGE_SERVICE_NAME = $ServiceName
  $env:DMS_BRIDGE_DISPLAY_NAME = $DisplayName
  & $nodePath $installHelperPath
  if ($LASTEXITCODE -ne 0) {
    throw "Service wrapper installation failed with exit code $LASTEXITCODE."
  }
}
finally {
  Remove-Item Env:DMS_BRIDGE_SERVICE_NAME -ErrorAction SilentlyContinue
  Remove-Item Env:DMS_BRIDGE_DISPLAY_NAME -ErrorAction SilentlyContinue
  Pop-Location
}

for ($i = 0; $i -lt 30; $i += 1) {
  $service = Resolve-BridgeService -DesiredName $ServiceName -DesiredDisplayName $DisplayName
  if ($service) { break }
  Start-Sleep -Milliseconds 300
}

$service = Resolve-BridgeService -DesiredName $ServiceName -DesiredDisplayName $DisplayName
if (-not $service) {
  throw "Service '$ServiceName' was not found after creation. Verify administrative permission and retry."
}

$serviceRegistryPath = "HKLM:\SYSTEM\CurrentControlSet\Services\$($service.Name)"

Set-ItemProperty -Path $serviceRegistryPath -Name Description -Type String -Value $description
Invoke-ScExe -Arguments @('failure', $service.Name, 'reset= 86400', "actions= $failureActions") -ActionDescription "Configuring failure actions for '$($service.Name)'"
Set-Service -Name $service.Name -StartupType Automatic

Set-ItemProperty -Path $serviceRegistryPath -Name DelayedAutoStart -Type DWord -Value 1

try {
  Start-Service -Name $service.Name -ErrorAction Stop
}
catch {
  Write-Host "Service failed to start. Startup log (if available):" -ForegroundColor Yellow
  if (Test-Path $serviceLogPath) {
    Get-Content -Path $serviceLogPath -Tail 60 -ErrorAction SilentlyContinue | ForEach-Object { Write-Host $_ }
  }
  else {
    Write-Host "No service log found at: $serviceLogPath"
  }

  Write-Host "Recent Service Control Manager events:" -ForegroundColor Yellow
  try {
    $imagePath = (Get-ItemProperty -Path $serviceRegistryPath -Name ImagePath -ErrorAction SilentlyContinue).ImagePath
    if ($imagePath) {
      Write-Host "Configured service ImagePath: $imagePath"
    }
  } catch {}
  Get-WinEvent -LogName System -MaxEvents 80 -ErrorAction SilentlyContinue |
    Where-Object { $_.ProviderName -eq 'Service Control Manager' -and ($_.Message -like "*$ServiceName*" -or $_.Message -like "*$($service.Name)*") } |
    Select-Object -First 5 TimeCreated, Id, LevelDisplayName, Message |
    ForEach-Object {
      Write-Host "[$($_.TimeCreated)] Event $($_.Id) $($_.LevelDisplayName): $($_.Message)"
    }

  throw
}

$status = Get-Service -Name $service.Name
Write-Host "Service '$($status.Name)' status: $($status.Status)"
Write-Host 'Health check URL: http://localhost:8787/health'
