# INChat React App

A local two-account messaging and social app built with React, TypeScript, Express, SQLite, Socket.IO, and WebRTC.

## Run two local apps

```bash
npm install
npm run dev:all
```

The command starts two Vite apps and one shared local API:

- App 1: `http://localhost:3001`
- App 2: `http://localhost:3002`
- Local API and realtime connection: `http://localhost:3005`

Sign in on each app with a different email to create the two local accounts. The same email returns to its existing account. Open **Find people** to send a connection request; the recipient must accept before a chat or call is available. Requests and accepted connections are shared between both apps and persist separately from messages and call history.

Messages, call logs, profiles, connection requests, accepted connections, posts/Reels, updates, notes, chat preferences, and uploaded files persist locally in `data/inchat.sqlite` and `data/uploads/`. **Settings → Clear messages and call history** deletes conversations and calls but intentionally keeps profiles and accepted connections. To start over completely, stop the server and remove the local database and uploads yourself; this deletes local app data.

Voice and video calls use WebRTC peer-to-peer media over the local connection. Both accounts must be online, and each user must allow microphone access (and camera access for video). Calls need a modern browser that supports WebRTC and media devices; audio/video is not relayed through an external service.

The app also supports chat attachments, contacts, polls, events, one-time and consent-based expiring live location, read markers, per-chat themes, post/reel interactions and comments, 24-hour updates/notes, notifications, and dark mode. Uploads are limited to 25 MB per file. Maps and AI-provider features are not configured; location is shown as coordinates and AI controls remain gated.

To start only one part, use `npm run dev`, `npm run dev:secondary`, or `npm run dev:server`. The SQLite database is created empty on the first run. Desktop notifications require browser permission. The local demo login does not use passwords and is not production authentication. Public deployment requires production-grade authentication, hosting, and provider configuration. Node.js 22.5 or newer is required for the built-in SQLite module.

## Build

```bash
npm run build
```
