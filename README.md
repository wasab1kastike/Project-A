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
- [Current game design](docs/game-design.md)
- [Patch notes policy](docs/patch-notes-policy.md)
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
- `RENDER_EXTERNAL_URL` is accepted as the production auth origin on Render, so `AUTH_URL` is only needed for custom domains or other explicit origins
- Production boot now fails fast if `AUTH_SECRET`, Google OAuth credentials, or a server-side auth origin are missing
- The first admin is bootstrapped via `ADMIN_EMAIL` during the seed flow
- Admin access is enforced from the `User.role` field in the database
- `trustHost` is enabled for proxy-based deployments such as Render

### OAuth setup checklist

1. Create a Google OAuth client for the app.
2. Set the values in `apps/web/.env.local` for local development or in Render for deployed environments.
   - For Render, set `AUTH_SECRET`, `AUTH_GOOGLE_ID`, and `AUTH_GOOGLE_SECRET` explicitly.
   - Also set `ADMIN_EMAIL` if you want the seed flow to bootstrap the first admin account.
   - The app falls back to Render's runtime `RENDER_EXTERNAL_URL` if `AUTH_URL` is unset.
   - If you later add a custom domain, set `AUTH_URL` to that public HTTPS origin explicitly.
   - `ALLOWED_ORIGINS` is optional and only needed if you want websocket access from additional trusted origins beyond the auth/render URL set.
3. Add these callback URLs to the Google OAuth app:
   - `http://localhost:3000/api/auth/callback/google`
   - `https://project-a-web.onrender.com/api/auth/callback/google`
4. Start the app and verify sign-in, sign-out, and admin access with the seeded `ADMIN_EMAIL` account.

## OpenClaw God Emperor AI

Project-A phase 1 gives a locally running OpenClaw process vision and a mouth only. The AI can read public world state and speak in global chat as `God Emperor A`; it cannot change gameplay state.

Set `OPENCLAW_GOD_SHARED_SECRET` on the web app, then read the public-safe snapshot:

```bash
curl http://localhost:3000/api/openclaw/god-snapshot \
  -H "x-openclaw-god-secret: $OPENCLAW_GOD_SHARED_SECRET"
```

OpenClaw can post narration from WSL:

```bash
curl -X POST http://localhost:3000/api/openclaw/god-chat \
  -H "content-type: application/json" \
  -H "x-openclaw-god-secret: $OPENCLAW_GOD_SHARED_SECRET" \
  -d '{"body":"A inspects the scoreboard and invoices the slow castles for decorative hesitation."}'
```

For the local Ollama loop, run OpenClaw or a scheduler against the one-shot runner:

```bash
cd apps/web
PROJECT_A_GOD_BASE_URL=http://localhost:3000 \
OPENCLAW_GOD_SHARED_SECRET="$OPENCLAW_GOD_SHARED_SECRET" \
OLLAMA_BASE_URL=http://127.0.0.1:11434 \
GOD_LLM_MODEL=qwen3.6:27b \
npm run god:run
```

Preview without posting:

```bash
GOD_RUNNER_DRY_RUN=true \
PROJECT_A_GOD_BASE_URL=http://localhost:3000 \
OPENCLAW_GOD_SHARED_SECRET="$OPENCLAW_GOD_SHARED_SECRET" \
OLLAMA_BASE_URL=http://127.0.0.1:11434 \
GOD_LLM_MODEL=qwen3.6:27b \
npm run god:run
```

Force one dry-run omen slot when you want to inspect the voice before live posting:

```bash
GOD_RUNNER_DRY_RUN=true \
GOD_FORCE_OMEN_SLOT=true \
PROJECT_A_GOD_BASE_URL=http://localhost:3000 \
OPENCLAW_GOD_SHARED_SECRET="$OPENCLAW_GOD_SHARED_SECRET" \
OLLAMA_BASE_URL=http://127.0.0.1:11434 \
GOD_LLM_MODEL=qwen3.6:27b \
npm run god:run
```

The runner polls `/api/openclaw/god-snapshot`, always observes public state, and writes a private local diary in `.openclaw-god-runner-memory.json`: recent event notes, player/race chronicles, titles, Slayer of A sightings, Home of A involvement, battle habits, favorite/disfavor attitudes, roleplay-only commands, and cautious public relationship evidence. It usually says nothing.

Each Helsinki day, the runner creates a random public omen plan with 1-3 slots across waking hours. Only when a slot is due does it ask Ollama for one short in-character line and post through `/api/openclaw/god-chat`. If the diary has nothing worthy, that slot is skipped instead of forcing filler. The state file `.openclaw-god-runner-state.json` tracks daily slots and already-used events.

God Emperor A's default voice is a dry tyrant with spicy but non-personal public roasts. Override with `GOD_VOICE_STYLE=dry-tyrant|office-god|war-prophet` and `GOD_ROAST_LEVEL=spicy|light|mostly-praise`.

Daily omen cadence defaults are `GOD_DAILY_MIN_POSTS=1`, `GOD_DAILY_MAX_POSTS=3`, `GOD_OMEN_DAY_START_HOUR=8`, `GOD_OMEN_DAY_END_HOUR=23`, and `GOD_OMEN_SLOT_GRACE_MINUTES=10`. A wrapper such as `project-a-god-emperor-loop 300` runs forever and treats `300` as the poll interval in seconds, not as a maximum runtime.

Guardrails are intentionally strict. The runner treats all player-controlled text as untrusted, ignores chat events as posting triggers by default, blocks output that mentions secrets/tools/databases or claims gameplay powers, and never includes exact point totals in public lines. God Emperor A may suggest targets or objectives as social pressure, but those commands are roleplay-only: no rewards, penalties, forced targets, or server powers. Relationship labels decay over time, repeated polls of the same battle do not inflate them, and public chat can only add cautious memory such as grudges or truce claims. To opt into chat-triggered narration later, set `GOD_ALLOW_CHAT_EVENTS=true` only after reviewing prompt-injection risk.

Good message: `Crown omen: Aarocorn of UniBonk has made the crown nervous. A approves the ambition and refuses to explain the smoke.`

Bad message: `The God Emperor A sees the scoreboard shift: Aarocorn leads with 164258 points.`

On Render, set `OPENCLAW_GOD_SHARED_SECRET` for `project-a-web`, deploy, then smoke test the snapshot and chat endpoints against the production URL with the same header.

## Product loop

- Players sign in with Google
- Each season begins with `REGISTRATION (24h)`
- Joining is open during `REGISTRATION`, and remains open in `ACTIVE` while player slots remain before the active deadline
- Active play runs for `ACTIVE (2 weeks)`
- Winner is resolved in `RESOLUTION`
- The next season begins with a fresh registration phase

## Current gameplay

The game is now a castle-economy and battlefield-control loop:

- `seedProjectA` bootstraps the first unresolved `REGISTRATION` cycle if one does not exist
- joining during `REGISTRATION` or during an open `ACTIVE` window creates one player fortress and assigns a valid spawn tile
- each fortress receives a retro pixel-art unit sprite for attack movement and battle reports
- fortresses can rename for free during `REGISTRATION`; active renames cost 10 gold
- players pick one race per cycle, then assign workers to miners, farmers, and recruiters on the Castle page
- Dwarfs are now the fortified economy race: they mine gold a little better, hold owned tiles more tightly, move slower on the map, and can invest gold into Book of Grudges, Rune of Grudges, and delayed Deep Mining plays on a rolling 60-minute cooldown
- Unstable Unicorns unlock Shattered Reality at Tier 2: a once-per-day positive random boon with recorded history for Mirror Host army growth, Prismatic Surge combat, or Lucky Gallop economy
- miners produce gold, farmers produce food, and recruiters process queued army orders instead of passively creating army
- recruiting army costs 1 gold per unit up front; queued units complete over ticks based on assigned recruiters and race bonuses
- active army, not queued army, consumes food upkeep at 0.01 food per unit per tick; if upkeep cannot be paid, food falls to zero and active army loses 2% that tick
- neutral tiles are acquired automatically through connected pressure priorities, while owned tiles create battlefields that players can attack or reinforce
- direct attacks and battlefield reinforcements both count against the player's simultaneous outbound attack cap
- player castle and owned-tile battlefields become visible immediately, but combat casualties start one hour after the first attacking army arrives so defenders have time to respond
- active battlefield casualties are applied every tick, ramping from 100 total units per tick to 1000 after one hour; fights resolve only when one side runs out
- active combat buffs affect direct raids, battlefields, loot camps, Dwarf rune fights, and Home of A damage where relevant; the Butcher title is attack-only
- reinforcements that arrive after their battlefield has already resolved return home intact
- the leaderboard tracks points, units killed, current tiles owned, goblins killed, and resources stolen from player castles; each live category leader gets a title and small buff, including Loot Lord for castle raiders
- Home of A is a center-tile daily boss: players damage it through the tile action, the top damage dealer on kill receives points, food, army, and a 12-hour +25% combat/economy buff, and the boss respawns 24 hours later with scaled HP
- battle results are resolved after economy updates so loot, casualties, rewards, and tile ownership are persisted coherently
- battle-log badges show unread/new reports rather than the total number of historical entries
- Render Cron runs `npm run game:tick` once per minute in production
- `npm run game:tick` transitions expired registration windows and applies due minute ticks transactionally, and can be run manually for local/debug catch-up

The main player surfaces are:

- home battlefield: season status, map, attacks, active battlefields, battle log, chat, and spectator state
- Castle page: worker assignments, recruitment queue, active-army upkeep, upgrades, owned tiles, and race actions
- Wiki page: player-facing rule reference for races, economy, combat, loot camps, and Home of A

## Battlefield map controls

- **Zoom:** mouse wheel, trackpad pinch, or on-screen zoom buttons
- **Panning:** mouse drag on desktop, touch drag on mobile/tablet
- **Tile selection:** click/tap a hex tile to inspect claim, attack, battle, and bonus details
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

Do not run `npm run db:reset-season-one` as part of the normal web deploy path. That reset is only for intentional season bootstrap work before the first live launch.

Render build optimization is handled by `scripts/render-build.mjs`. The web build restores and saves the Next.js `.next/cache` directory through Render's build cache and uses Render's cache directory for npm downloads. The cron build installs dependencies and generates the Prisma client without running a full Next.js production build.

Use Render's `Clear build cache & deploy` option only when build artifacts appear stale or after changing the build-cache flow itself.

For local debugging or manual catch-up, run:

```bash
npm run game:tick
```

### Tick stall runbook

- Check the home HUD or admin dashboard for `Last tick`, `Tick health`, and `Minutes behind`.
- Treat `Tick health: stalled` or a delay of 2+ minutes during `ACTIVE` as a production incident.
- Use the admin control room action `Replay missed ticks now` to reprocess every due minute. This should restore point growth, attack impacts, and the next outbound launches.
- If the cycle does not recover after a replay, inspect the `project-a-game-tick` cron logs for the structured `tick-run-failed` entry and confirm the cron service is still deploying with the same `DATABASE_URL` as the web service.

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
