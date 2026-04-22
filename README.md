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
- Background processing: Render Cron runs server-side minute ticks
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

## Documentation

- [Changelog policy](docs/changelog-policy.md#required-entry-format)
- [Map overhaul changelog entry](docs/changelog-policy.md#map-overhaul-log)
- [Known hosting constraints for GitHub Pages](docs/github-pages-hosting.md#constraints-to-account-for)

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
- `npm run game:tick`
- `npm run test:game`
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
- Set `AUTH_URL` for any deployment where the public URL should be explicit
- Production boot now fails fast if `AUTH_SECRET`, Google OAuth credentials, or a server-side auth origin are missing
- The first admin is bootstrapped via `ADMIN_EMAIL`
- Admin access is enforced from the `User.role` field in the database
- `trustHost` is enabled for proxy-based deployments such as Render

### OAuth setup checklist

1. Create a Google OAuth client for the app.
2. Set the values in `apps/web/.env.local` for local development or in Render for deployed environments.
   - For Render, set `AUTH_SECRET`, `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`, and `ADMIN_EMAIL` explicitly.
   - For Render, the app falls back to Render's runtime `RENDER_EXTERNAL_URL` if `AUTH_URL` is unset.
   - If you later add a custom domain, set `AUTH_URL` to that public HTTPS origin explicitly.
   - `ALLOWED_ORIGINS` is optional and only needed if you want websocket access from additional trusted origins beyond the auth/render URL set.
3. Add these callback URLs to the Google OAuth app:
   - `http://localhost:3000/api/auth/callback/google`
   - `https://project-a-web.onrender.com/api/auth/callback/google`
4. Start the app and verify sign-in, sign-out, and admin access with the seeded `ADMIN_EMAIL` account.

## Product loop

- Players sign in with Google
- Each season begins with `REGISTRATION (24h)`
- Joining is open during `REGISTRATION`, and remains open in `ACTIVE` while player slots remain before the active deadline
- Active play runs for `ACTIVE (72h)`
- Winner is resolved in `RESOLUTION`
- The next season begins with a fresh registration phase

## M1 season bootstrap

Milestone 2 is implemented as a backend-first playable core:

- `seedProjectA` bootstraps the first unresolved `REGISTRATION` cycle if one does not exist
- joining during `REGISTRATION` or during an open `ACTIVE` window immediately creates a fortress and assigns one of 30 fixed map slots
- each fortress receives a randomly assigned retro pixel-art unit sprite for attacks
- fortresses can rename for free during `REGISTRATION`
- fortresses can switch between `GROW` and `ATTACK` during `ACTIVE`
- attacks launch visible units across the battlefield; the attacker pays up to 1 point at launch and the target loses up to 2 points on impact
- active renames cost 10 points
- Render Cron runs `npm run game:tick` once per minute in production
- `npm run game:tick` transitions expired registration windows and applies due minute ticks transactionally, and can be run manually for local/debug catch-up

The home page is intentionally minimal in M1:

- signed out: read-only spectator status
- signed in during `REGISTRATION`: join or rename your fortress
- signed in during `ACTIVE`: choose `GROW` or `ATTACK`, pick a target, and spend points on renames

## Battlefield map controls

- **Zoom:** mouse wheel, trackpad pinch, or on-screen zoom buttons
- **Panning:** mouse drag on desktop, touch drag on mobile/tablet
- **Reset view:** use the reset control to return to the default battlefield framing

## Testing the game loop

Game-domain integration coverage lives in `apps/web/src/lib/game/game.test.ts`.

- `npm run test:game` expects a reachable PostgreSQL database
- it uses `TEST_DATABASE_URL` when provided, otherwise falls back to `DATABASE_URL`
- each run creates an isolated schema, applies checked-in migrations, and drops the schema after the suite

If PostgreSQL is not running locally, the game test suite is skipped instead of failing the rest of the repo validation.

## Render baseline

The repo now includes a Render Blueprint at `render.yaml` for:

- `project-a-web`
- `project-a-game-tick`
- `project-a-db`

Suggested first deploy flow:

```bash
node scripts/render-build.mjs web
```

Render pre-deploy command:

```bash
npm run db:deploy
```

Production minute ticks are handled by the `project-a-game-tick` Render Cron Job. It runs `npm run game:tick` every minute, uses the same `project-a-db` connection, and relies on the tick processor's idempotency to safely catch up delayed runs.

Render build optimization is handled by `scripts/render-build.mjs`. The web build restores and saves the Next.js `.next/cache` directory through Render's build cache and uses Render's cache directory for npm downloads. The cron build installs dependencies and generates the Prisma client without running a full Next.js production build.

Use Render's `Clear build cache & deploy` option only when build artifacts appear stale or after changing the build-cache flow itself.

For local debugging or manual catch-up, run:

```bash
npm run game:tick
```

### GitHub secret management

If you want production maintenance flows to run from GitHub instead of a local shell, the repo now includes two manual GitHub Actions workflows:

- `.github/workflows/seed-production.yml`
- `.github/workflows/redeploy-render.yml`

Recommended repository secrets:

- `PRODUCTION_DATABASE_URL`
  Use the full production PostgreSQL connection string, including `sslmode=require` when needed for external connections.
- `PRODUCTION_ADMIN_EMAIL`
  Optional. When set, the seed flow also bootstraps the admin account.
- `RENDER_DEPLOY_HOOK_URL`
  The Render deploy hook for `project-a-web`, used to trigger a safe manual redeploy from GitHub Actions.

Suggested usage:

1. Store the secrets in GitHub repository settings.
2. Run `Seed Production Database` from the Actions tab when you need to bootstrap or re-run the seed flow.
3. Run `Redeploy Render Web` after rotating credentials or updating Render-managed environment variables.

Important: GitHub Secrets are excellent for workflows, but the running Render app still needs its own runtime environment variables in Render. Do not commit real secrets into `render.yaml`, `.env.example`, or source files.

What still requires manual setup before a fully usable M0 deployment:

- Add real Google OAuth credentials
- Set `AUTH_SECRET`
- Set `ADMIN_EMAIL`
- Run the one-time seed flow with `npm run db:seed`
- Add the deployed Render callback URL to the Google OAuth app

## Milestone status

- M0 foundation: complete
- M1 season bootstrap: implemented locally with Prisma-backed registration, action persistence, tick processing, and minimal gameplay UI
