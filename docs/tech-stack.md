# Tech Stack

This document locks the initial foundation choices for `Project-A`.

## Selected technologies

- Framework: Next.js 16 App Router
- Language: TypeScript 5
- Package management: npm workspaces
- Linting: ESLint 9 with `eslint-config-next`
- Formatting: Prettier 3
- Authentication: Auth.js with Google OAuth
- Database: PostgreSQL
- ORM: Prisma
- Realtime: Socket.IO
- Background jobs: server-side cron/background worker
- Deployment target: Node.js server

## Notes

- We are intentionally starting with one app in `apps/web` and leaving room for a future worker package instead of splitting the repo too early.
- The app is not configured for static export because auth, database access, and realtime all require a server runtime.
- Auth, database schema, and worker implementation are still separate milestones; this file only locks the chosen technologies.
- M0 uses Auth.js database sessions plus a Prisma-backed `User.role` field for admin protection.
- Local PostgreSQL is documented with Docker Compose, and Prisma local dev DB is available as a no-Docker fallback for development verification.
- Render is the baseline deployment target for M0, using one Node web service plus one managed PostgreSQL instance.
- Node version is pinned with `.node-version` to avoid drifting Render runtime defaults.
