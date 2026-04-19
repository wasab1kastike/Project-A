# Architecture

## Foundation decisions

- Web app: Next.js 16 App Router
- UI layer: React 19 through Next.js
- Language: TypeScript 5
- Repo shape: `npm` workspaces monorepo
- Lint and formatting: ESLint 9 + Prettier 3
- Auth: Auth.js with Google provider
- Data store: PostgreSQL
- ORM and migrations: Prisma
- Realtime transport: Socket.IO
- Tick processing: server-side cron/background worker
- Deployment model: Node.js server runtime

## Why this shape

- Next.js gives us one framework for app pages, route handlers, server rendering, and future admin tooling.
- App Router fits the game UI plus authenticated server logic without adding another backend framework too early.
- A monorepo keeps the door open for a dedicated tick worker or shared packages later, while staying lightweight today.
- PostgreSQL + Prisma is a stable fit for cycles, fortresses, score events, chat, and winner-request history.
- Socket.IO stays as the realtime choice for live score, timer, chat, and fortress updates once `M2` work begins.

## Planned runtime split

- `apps/web` handles the browser UI, auth flows, admin pages, and initial API surface.
- A future worker process will run the minute tick and season transition jobs against the same database.
- Realtime updates will be introduced after the core game loop is persisted correctly.

## Foundation data and auth decisions

- Auth uses Google OAuth through Auth.js with database-backed sessions.
- Authorization is role-based via `User.role`, not only environment allowlists.
- Prisma owns both the game models and the Auth.js adapter tables so session, user, and gameplay state stay in one relational source of truth.
- Local database setup is standardized with `docker-compose.yml`, while Prisma local dev DB can be used as a fallback when Docker is unavailable.
- Deploy baseline is captured in `render.yaml`, with one web service and one managed PostgreSQL instance.
- Production-style deploys should run checked-in Prisma migrations before boot via `npm run db:deploy`.
