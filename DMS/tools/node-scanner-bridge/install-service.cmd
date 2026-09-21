@echo off
setlocal
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0install-service.ps1" -InstallDependencies
if errorlevel 1 (
  echo.
  echo Installation failed.
  exit /b 1
)
echo.
echo Installation completed.
exit /b 0
