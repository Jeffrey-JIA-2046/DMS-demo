# DMS Mobile App (React Native / Expo)

Mobile client for Android and iOS that mirrors the DMS web solution capabilities:

- Authentication (Basic auth)
- Document management (search, upload, update, versioning, archive, download)
- Folder management and permissions
- AI chatbot (search, summary, document Q&A)
- Knowledge collaboration (topics, contributions, links, sharing, attachments)
- User dashboard tasks and workflow actions
- Admin modules (users/groups, retention/reminders, jobs, code tables)
- System auditing and AI report generation

## Prerequisites

- Node.js 20+
- Expo CLI (optional, via `npx expo`)
- Android Studio emulator and/or Xcode simulator (macOS for iOS simulator)
- Backend API running (default: `http://localhost:8080`)

## Install

```bash
cd DMS/mobile-app
npm install
```

## Run

```bash
npm start
```

Then choose:

- `a` for Android
- `i` for iOS (macOS)
- scan QR with Expo Go

## Role-Based Access

The mobile app mirrors web role access resolved by /api/me:

- System administrator: all modules
- User administrator: document, knowledge, dashboard, auditing, reports
- Document administrator: document, knowledge, dashboard
- Document viewer: read-focused document, knowledge, dashboard

Tabs are shown/hidden by role, and write/delete actions are disabled when not permitted.

## API URL notes

- Physical device: use your machine LAN IP (example: `http://192.168.1.10:8080`)
- Android emulator: `http://10.0.2.2:8080`
- iOS simulator: `http://localhost:8080`

You can change API base URL from the app Settings screen.

## API Smoke Tests

Run endpoint smoke checks against your backend:

Windows PowerShell:

```powershell
$env:DMS_SMOKE_BASE_URL = "http://localhost:8080"
$env:DMS_SMOKE_USER = "your-username"
$env:DMS_SMOKE_PASS = "your-password"
npm run smoke:api
```

Optional admin-only checks:

```powershell
$env:DMS_SMOKE_ADMIN = "true"
npm run smoke:api
```
