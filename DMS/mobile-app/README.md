# DMS Mobile App (React Native / Expo)

This mobile application mirrors the DMS web frontend look and workflows, covering:

- Login and logout
- Folder and document browsing
- Document online viewing
- Document upload from mobile device
	- Pick a file from device storage
	- Take a photo with camera
	- Record a video with camera
- AI assistant for document search and selected-document processing
- Knowledge topic creation and searching

## 1. Install

```bash
cd DMS/mobile-app
npm install
```

## 2. Configure backend endpoints

Update `extra` in `app.json`:

- `apiBaseUrl`: DMS backend API base URL
- `chatbotApiUrl`: AI chatbot API base URL
- `embeddingApiUrl`: embedding API base URL

For real mobile devices, do not use `localhost`; use your machine IP, for example:

- `http://192.168.1.20:8080`
- `http://192.168.1.20:5100`
- `http://192.168.1.20:5101`

## 3. Run

```bash
npm run start
```

Then open with Expo Go, Android emulator, or iOS simulator.

## Notes

- Authentication uses the same Basic Auth style as the current web frontend (`/api/me`).
- Document online view uses an in-app WebView with auth headers.
- PDF documents are previewed directly in-app on mobile (including Android emulator).
- AI processing accepts up to 3 selected documents, same as web behavior.
- On Android emulator, `localhost` is automatically remapped to `10.0.2.2` by the app config layer.
- Login screen includes a `Settings` button to configure backend/chatbot/embedding URLs and app theme.
