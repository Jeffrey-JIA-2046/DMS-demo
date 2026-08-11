$ErrorActionPreference = 'Stop'

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$serverPath = Join-Path $scriptDir 'server.js'
$logPath = Join-Path $scriptDir 'service.log'
$nodeCommand = Get-Command node -ErrorAction SilentlyContinue
$nodePath = if ($nodeCommand) { $nodeCommand.Source } else { $null }

try {
  if (-not $nodePath) {
    throw 'Node.js executable not found on PATH.'
  }
  if (-not (Test-Path $nodePath)) {
    throw "Node executable not found: $nodePath"
  }
  if (-not (Test-Path $serverPath)) {
    throw "Server script not found: $serverPath"
  }

  New-Item -ItemType Directory -Path (Split-Path -Parent $logPath) -Force | Out-Null
  Set-Location $scriptDir

  "[$(Get-Date -Format o)] Starting node scanner bridge using $nodePath" | Out-File -FilePath $logPath -Encoding UTF8 -Append

  # Keep this process attached to the service; Node stdout/stderr are redirected to log.
  & $nodePath $serverPath 1>> $logPath 2>&1
  $exitCode = $LASTEXITCODE
  "[$(Get-Date -Format o)] Bridge process exited with code $exitCode" | Out-File -FilePath $logPath -Encoding UTF8 -Append
  exit $exitCode
}
catch {
  "[$(Get-Date -Format o)] Service launcher failed: $($_.Exception.Message)" | Out-File -FilePath $logPath -Encoding UTF8 -Append
  throw
}
