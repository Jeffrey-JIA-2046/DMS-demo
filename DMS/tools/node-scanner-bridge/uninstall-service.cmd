@echo off
setlocal
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0uninstall-service.ps1"
if errorlevel 1 (
  echo.
  echo Uninstall failed.
  exit /b 1
)
echo.
echo Uninstall completed.
exit /b 0
