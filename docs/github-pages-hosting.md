# Known Hosting Constraints (GitHub Pages)

GitHub Pages is a static hosting target. This repository currently uses **Next.js App Router** with server features, so a full feature deployment is **not** compatible with Pages without fallback work.

## Why this matters
App Router commonly relies on server runtime capabilities that GitHub Pages cannot execute.

## Constraints to account for

- **No Node.js server runtime on GitHub Pages**
  - Server Components and dynamic server rendering cannot run at request time.
- **No Route Handlers / API endpoints**
  - `/api/*` endpoints (including auth flows) are unavailable.
- **No server-side auth callbacks**
  - Auth.js OAuth callback/session routes require server execution and are not supported directly on Pages.
- **No server-side database access**
  - Prisma + PostgreSQL reads/writes from server contexts are unavailable.
- **No server cron/background tick process**
  - Minute tick/game cycle background processing needs a separate runtime.
- **WebSocket server dependencies are unsupported**
  - Socket.IO server features require a host with persistent server processes.

## Recommended publishing models

1. **Primary production:** deploy full app to a Node-capable host (for example Render).
2. **Optional GitHub Pages companion:** publish static docs/marketing pages only.
3. If static export is required for a subset, isolate that subset and avoid App Router features that require runtime server execution.

## Pre-release checklist for Pages

- Confirm page is static-only (no API/auth/database/websocket dependency).
- Confirm links from static pages do not imply unavailable gameplay features.
- Document all known limitations in release notes/changelog before publishing.
