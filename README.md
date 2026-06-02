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
- [Season 4 pretesting release checklist](docs/season-4-pretesting-release-checklist.md)
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
- Season 4 registration and `TESTING`/pretesting accept new fortresses and race selection while the redesign is verified
- The completed community wish vote is archived; it no longer blocks joining or appears in the live lobby
- Season 4 activation remains held until redesign verification passes
- Each cycle stores an explicit ruleset: prior resolved cycles remain `LEGACY`, while the unresolved Season 4 pretesting cycle uses `SEASON_4`
- Joining is open during `REGISTRATION` and `TESTING`, and remains open in `ACTIVE` while player slots remain before the active deadline
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
- Legacy race abilities remain readable in prior-season history, but are unavailable in the Season 4 ruleset; each race instead selects one passive standing doctrine with a 12-hour change cooldown
- Season 4 race skills are role-focused Economy, Territory, and Military paths with 8 nodes per path, 12 total points, and major specialization unlocks at nodes 4 and 8; points arrive at castle level 3, then every 2 castle levels, and every 5 owned normal tiles
- one skill point can be respecced from the end of an unlocked branch for 25,000 gold
- the skill-tree role revamp resets existing race skill purchases so players can rebuild around the new economy, pressure, trade logistics, and battalion bonuses
- miners produce gold, farmers produce food, and recruiters process queued army orders instead of passively creating army
- recruiting army costs 1 gold per unit up front; queued units complete over ticks based on assigned recruiters and race bonuses
- active army, not queued army, consumes food upkeep at 0.01 food per unit per tick; if upkeep cannot be paid, food falls to zero and active army loses 2% that tick
- neutral tiles are acquired automatically through an ordered pressure-priority queue until the fortress reaches its tile capacity; the first 8 normal tiles are free to maintain after claiming, each pressure worker supports 2 more before skill and race bonuses, and excess owned tiles decay back toward neutral when capacity drops
- the Castle Diplomacy tab supports bilateral alliances with fixed trust escrow tiers plus optional break collateral; betrayal immediately begins war, pays what it can, and records unpaid collateral as debt
- the Castle Diplomacy tab supports peace offers with visible demands from either side, while trade offers move accepted gold, food, army, score points, and allied tile deeds as six-hour-minimum convoy legs; Trade Wagon building upgrades raise each wagon run's gold+food capacity from 100 up to 20,000, and larger trades queue multiple runs
- fortresses can run 3 active outbound trade wagons by default; skill nodes can raise active wagon count, wagon capacity, and trade profit
- Delivered convoy cargo awards points from base cargo value; all non-hostile deliveries add a small gold/food bonus, allied Trust and trade skills raise that bonus, and hostile relations seize in-transit cargo without trade points or delivered score points
- scored trade convoys can receive an outbound escort; convoy raid patrols are temporarily disabled while War Room focuses on battlefronts, battalions, and recruitment
- daily nuke bidding runs 14:00-12:00 Europe/Helsinki for Fuel, Rocket, and Wrath of A; bids are private, losing bids are spent, components stockpile without a one-per-kind cap, components are tradable by convoy, and launches cost 250,000 gold plus one of each component
- War Room battalions use one of four jobs: RESERVE, GUARD, ATTACK, or ALLIANCE. Stances are no longer player-facing controls.
- Battalions do not heal passively; refill commissioned battalions by assigning recruiters and training new members. Full battalions and the max army ceiling stop new recruits until more room is created.
- Idle battalions roam owned tiles on the map until their job triggers: guards patrol borders, attackers launch from war fronts, allies reinforce battlefields, and reserves stay near the castle core.
- new troops assigned to a remote battalion travel from the castle as visible reinforcement marches before they become usable
- ALLIANCE-mode battalions reinforce allied defensive and attacking battlefields through visible incoming reinforcement marches, controlled from the Castle War Room
- marching armies, remote battalion reinforcements, War Front launches, allied support, and convoy map legs now use existing roads to reduce movement ETA; the convoy six-hour minimum and PvP preparation delay still stay fixed
- roads grow from the actual route units travel, including remote battalion reinforcement, battlefield support, returning recalls, and delivered convoys
- Season 4 territorial war uses standing campaign orders: pressure workers and committed army build a border siege, then a 12-hour warning opens before automatic combat
- manual Season 4 tile guard orders are disabled; use GUARD-mode battalions for owned border patrols
- direct attacks and battlefield reinforcements both count against the player's simultaneous outbound attack cap
- player castle and owned-tile battlefields become visible immediately, but combat casualties start one hour after the first attacking army arrives so defenders have time to respond
- active battlefield casualties are applied every tick, ramping from 100 total units per tick to 1000 after one hour; fights resolve only when one side runs out
- stored legacy active-ability and Home of A buffs do not affect Season 4 combat or production
- reinforcements that arrive after their battlefield has already resolved return home intact
- Season 4 rankings are prestige-only: Points, Territory, PvP Kills, Courier delivered cargo, and Privateer intercepted cargo; rankings grant no gameplay buffs
- in Season 4, the former Home of A center tile is an inaccessible monument and loot camps are not spawned or targetable; prior-season reports remain readable
- battle results are resolved after economy updates so loot, casualties, rewards, and tile ownership are persisted coherently
- battle-log badges show unread/new reports rather than the total number of historical entries
- Render Cron runs `npm run game:tick` once per minute in production
- `npm run game:tick` transitions expired registration windows and applies due minute ticks transactionally, and can be run manually for local/debug catch-up

The main player surfaces are:

- home battlefield: season status, map, attacks, active battlefields, battle log, chat, and spectator state
- Castle page: worker assignments, recruitment, upgrades, owned tiles, expansion momentum, and active standing-order visibility
- Wiki page: player-facing rule reference for Season 4 pressure, politics, economy, and combat

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
