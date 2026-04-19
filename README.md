# Project-A

Project-A is a browser-based multiplayer strategy game where each season evolves through player feedback. The winner of a cycle earns the right to propose one bounded change for the next version of the game.

## Current foundation

- Monorepo with `npm` workspaces
- `apps/web`: Next.js 16 App Router application
- TypeScript 5
- ESLint 9 + `eslint-config-next`
- Prettier 3 at the repo root
- Prisma schema for the core game + Auth.js models
- Auth.js + Google login foundation with database-backed sessions
- Role-based admin route shell
- Render baseline blueprint in `render.yaml`

## Chosen stack

- Frontend and server rendering: Next.js 16 with the App Router
- UI runtime: React 19 as managed by Next.js
- Language: TypeScript
- Authentication: Auth.js with Google provider
- Database: PostgreSQL
- ORM: Prisma
- Realtime: Socket.IO
- Background processing: server-side cron/background worker for minute ticks
- Deployment target: Node.js server runtime

## Repository layout

```text
.
|-- apps/
|   `-- web/
|-- docs/
|-- docker-compose.yml
|-- package.json
`-- README.md
```

## Getting started

1. Install dependencies:

```bash
npm install
```

2. Copy the environment template for the web app:

```bash
cp apps/web/.env.example apps/web/.env.local
```

On Windows PowerShell:

```powershell
Copy-Item apps/web/.env.example apps/web/.env.local
```

3. Start the development server:

```bash
npm run dev
```

4. Open [http://localhost:3000](http://localhost:3000).

## Useful scripts

- `npm run dev`
- `npm run build`
- `npm run lint`
- `npm run typecheck`
- `npm run db:generate`
- `npm run db:deploy`
- `npm run db:migrate`
- `npm run db:seed`
- `npm run format`

## Local database workflow

Primary local setup uses Docker Compose:

```bash
npm run db:compose:up
npm run db:migrate -- --name init
npm run db:seed
```

If Docker is unavailable on the machine, Prisma's local development database can be used for migrations and verification:

```bash
npm run db:dev
```

Then copy the printed Prisma ORM URL into `DATABASE_URL` in `apps/web/.env.local`. You can also keep the printed TCP URL in `DIRECT_URL` for direct tooling access.

In constrained environments where `prisma migrate dev` is not available, you can still verify the checked-in initial migration locally by applying the generated SQL and then running the seed flow:

```bash
cd apps/web
npx prisma db execute --schema prisma/schema.prisma --file prisma/migrations/20260419172000_init/migration.sql
npx prisma db seed
```

## Auth and admin bootstrap

- Google login is configured with `AUTH_GOOGLE_ID` and `AUTH_GOOGLE_SECRET`
- Session signing uses `AUTH_SECRET`
- The first admin is bootstrapped via `ADMIN_EMAIL`
- Admin access is enforced from the `User.role` field in the database
- `trustHost` is enabled for proxy-based deployments such as Render

### OAuth setup checklist

1. Create a Google OAuth client for the app.
2. Set the values in `apps/web/.env.local` for local development or in Render for deployed environments.
3. Add these callback URLs to the Google OAuth app:
   - `http://localhost:3000/api/auth/callback/google`
   - `https://project-a-web.onrender.com/api/auth/callback/google`
4. Start the app and verify sign-in, sign-out, and admin access with the seeded `ADMIN_EMAIL` account.

## Product loop

- Players sign in with Google
- Each season begins with `REGISTRATION (24h)`
- Active play runs for `ACTIVE (72h)`
- Winner is resolved in `RESOLUTION`
- The next season begins with a fresh registration phase

## Render baseline

The repo now includes a minimal Render Blueprint at `render.yaml` for:

- `project-a-web`
- `project-a-db`

Suggested first deploy flow:

```bash
npm ci
npm run db:generate
npm run build
```

Render pre-deploy command:

```bash
npm run db:deploy
```

What still requires manual setup before a fully usable M0 deployment:

- Add real Google OAuth credentials
- Set `ADMIN_EMAIL`
- Run the one-time seed flow with `npm run db:seed`
- Add the deployed Render callback URL to the Google OAuth app

## M0 status

- `#1` closed
- `#2` closed
- `#4` closed
- `#3` code-complete; final environment verification only requires real Google OAuth credentials
