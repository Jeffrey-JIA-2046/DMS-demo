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
