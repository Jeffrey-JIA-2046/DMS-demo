# Node Scanner Bridge

This local service exposes scanner operations over HTTP so the frontend can use Node `usb` instead of browser WebUSB.

The bridge now enumerates both:

- SANE devices (existing implementation)
- Windows WIA scanner devices (fallback for TWAIN/WIA-style scanners)

## Prerequisites

- Node.js 18+
- A locally installed scanner driver
- Scanner connected via USB

## Install

```bash
cd DMS/tools/node-scanner-bridge
npm install
```

## Run

```bash
npm start
```

Service URL: `http://localhost:8787`

## Install as Windows Service (Auto-start)

Run PowerShell as Administrator, then:

```powershell
cd DMS/tools/node-scanner-bridge
.\install-service.ps1 -InstallDependencies
```

This installs service `DMSNodeScannerBridge`, sets startup type to automatic (delayed), enables restart-on-failure, and starts it immediately.

Implementation note: service registration uses `node-windows` (WinSW wrapper), which is required because `node.exe` itself is not a native Windows service host.

Quick validation:

```powershell
Invoke-WebRequest http://localhost:8787/health -UseBasicParsing
Invoke-WebRequest http://localhost:8787/scanners -UseBasicParsing

# Service name can appear as dmsnodescannerbridge.exe (wrapper-managed)
Get-Service | Where-Object { $_.DisplayName -eq 'DMS Node Scanner Bridge' } | Format-Table Name,DisplayName,Status,StartType
```

Convenience wrappers:

- `install-service.cmd`
- `uninstall-service.cmd`

Uninstall service:

```powershell
cd DMS/tools/node-scanner-bridge
.\uninstall-service.ps1
```

## Endpoints

- `GET /health`
- `GET /scanners`
- `POST /scan`

`GET /scanners` returns a merged list. WIA device names are prefixed with `wia:`.

`POST /scan` body:

```json
{
  "deviceName": "...",
  "resolution": 300,
  "colorMode": "Color"
}
```
