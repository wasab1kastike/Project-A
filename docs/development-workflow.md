# Development Workflow

> Patterns, gotchas, and step-by-step guidance for working on Project-A.

---

## 1. Project Shape Reminder

- **Monorepo** with npm workspaces — root scripts proxy to `apps/web`
- All commands should run from the repo root (unless a workspace flag is clearer)
- Main app: `apps/web/` — Next.js 16 App Router + React 19 + TypeScript 5
- ORM: Prisma 7 with PostgreSQL
- Auth: Auth.js v5 (beta) with Google OAuth + database sessions
- Realtime: Socket.IO — server actions emit refresh events, clients refetch `/api/game/state`

---

## 2. Common Commands

```bash
npm run dev             # Start dev server (localhost:3000)
npm run build           # Production build
npm run lint            # ESLint
npm run typecheck       # TypeScript type checking
npm run test:game       # Game integration tests (needs PostgreSQL)
npm run game:tick       # Manual tick catch-up
npm run db:generate     # Generate Prisma client
npm run db:deploy       # Apply production migrations
npm run db:migrate      # Create a new migration (needs local DB)
npm run db:seed         # Seed admin + initial cycle
npm run db:compose:up   # Start local PostgreSQL via Docker
npm run format          # Prettier format
```

All of the above proxy to `apps/web` — `npm run <script> --workspace web` for explicit workspace targeting.

---

## 3. Adding a New Game Feature

### 3.1 Pure Rules First (no DB changes)

Add a pure function module in `apps/web/src/lib/game/`:

```
apps/web/src/lib/game/
├── balance.ts                # Economy/production formulas
├── fortress-validation.ts    # Validation helpers
├── army-recruitment.ts       # Recruitment formulas
├── combat-targeting.ts       # (planned) Legal target rules
└── your-new-module.ts        # Pure rules, no DB imports
```

**Pattern:** Export pure functions that take plain data and return results. No Prisma calls. This makes them testable without a database.

```typescript
// Example: pure rule helper
export function calculatePressureOutput(
  pressureWorkers: number,
  race: FortressRace,
  tileModifier: number
): number {
  return pressureWorkers * 1; // baseline
}
```

### 3.2 Add Tests

Unit tests go alongside the module:

```
apps/web/src/lib/game/your-new-module.test.ts
```

For DB-backed integration tests, add to `apps/web/src/lib/game/game.test.ts`.

```bash
npm run test:game --workspace web   # Runs all game tests
```

### 3.3 Add Prisma Schema + Migration

If the feature needs new fields/models:

1. Edit `apps/web/prisma/schema.prisma`
2. Generate migration: `npm run db:migrate -- --name your_feature_name`
3. Generate client: `npm run db:generate --workspace web`

**Production safety rules:**
- Never add `@default(uuid())` for new ID fields — existing models use `cuid()`
- Add `@@index(...)` for new query patterns (see data-model.md for conventions)
- Use `@@unique([cycleId, ...])` for cycle-scoped uniqueness — never global uniqueness for gameplay data

### 3.4 Add Service Function

Edit `apps/web/src/lib/game/service.ts`:

```typescript
export async function doNewThing(input: {
  userId: string;
  someParam: number;
}): Promise<Result> {
  // 1. Validate cycle is playable
  // 2. Load fortress
  // 3. Validate business rules
  // 4. Persist
  // 5. Return result
}
```

**Patterns to follow:**
- Throw `GameError` for user-facing error messages
- Use Prisma transactions with `$transaction([...])` for multi-step operations
- Check cycle status before any gameplay mutation
- Use the canonical fortress lookup: `findFirst({ where: { cycleId, ownerId } })`

### 3.5 Add Server Action

Edit `apps/web/src/app/game-actions.ts`:

```typescript
export async function doNewThingAction(input: { param: number }): Promise<InlineActionResult> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, error: "Sign in required." };

  try {
    await doNewThing({ userId, ...input });
    notifyAndRevalidate("your-feature-reason");
    return { ok: true };
  } catch (error) {
    return { ok: false, error: getActionErrorMessage(error) };
  }
}
```

**Key patterns:**
- Always authenticate with `auth()` at the top
- Wrap in try/catch, return `InlineActionResult` (`{ ok: true } | { ok: false, error: string }`)
- Call `notifyAndRevalidate(reason, paths)` — sends Socket.IO refresh + revalidates Next.js cache
- Export the action as a `"use server"` function

### 3.6 Add or Update UI

UI lives in `apps/web/src/components/` or in route-specific `page.tsx`/`home-client.tsx`.

**State flow for game UI:**
```
LiveGameStateProvider (context) → refreshGameState(reason) → GET /api/game/state
                                                                      ↓
                                                            Component re-renders
```

- Do NOT use `router.refresh()` for normal game state updates — use `refreshGameState()`
- Use `useRefreshView()` for debounced refresh in interactive components
- `router.refresh()` only for auth/session boundaries or redirect flows

### 3.7 Update Docs

Always update in the same commit:

| Change Type | Doc to Update |
|-------------|--------------|
| Gameplay rules | `README.md` (gameplay section), `docs/game-design.md`, wiki page |
| New action/UI | `AGENTS.md` if it adds a new pattern |
| Balance change | `docs/game-design.md` formulas section |
| Schema change | `docs/data-model.md` |

### 3.8 Verification Loop

```bash
npm run typecheck --workspace web
npm run test:game --workspace web    # If DB available
npm run build --workspace web        # Full production build check
```

If no local DB, say: "DB-backed tests skipped — no PostgreSQL available."

---

## 4. Refactoring Workflow

From `AGENTS.md` (this is the canonical guide):

1. Refactor one feature or workflow slice at a time — no broad cleanup sweeps
2. Start by preserving current behavior with focused tests or existing regression coverage
3. Prefer extracting pure gameplay rules from persistence-heavy modules (`service.ts`, `tick.ts`) into feature-owned helpers
4. Keep public server actions, API routes, Prisma schema, and UI behavior stable unless the refactor explicitly changes them
5. Avoid unrelated formatting churn and cosmetic rewrites
6. Useful first slices: battlefield combat, castle economy, recruitment, Home of A, loot camps, leaderboard titles, realtime state, shop/cosmetics, admin tools
7. Verification: `npm run test:game`, `npm run typecheck`, `npm run build`

---

## 5. Game State Freshness — The Critical Pattern

```
Server Action
    │
    ├── Prisma write (data changes)
    ├── revalidatePath(path)    (Next.js cache bust)
    └── emitProjectARefresh(reason)  (Socket.IO broadcast)
                                          │
                                    Client receives "project-a:refresh"
                                          │
                                    RealtimeBridge → refreshGameState(reason)
                                          │
                                    GET /api/game/state
                                          │
                                    LiveGameStateProvider updates context
                                          │
                                    All subscribed components re-render
```

**Rules:**
- `emitProjectARefresh(reason)` is called from `notifyAndRevalidate()` in game-actions.ts
- `RealtimeBridge` connects Socket.IO on session mount with DB-backed auth
- On refresh failure: preserve last good state, show stale/sync indicator — do NOT show fatal error
- Periodic polling fallback: socket auth failure → `router.refresh()` every N seconds

---

## 6. Common Gotchas

### 6.1 Schema Changes Are Production-Impactful
- Always add migrations for schema changes
- Run `npm run db:generate` after schema changes
- Never reset production data — use compensation scripts (`prisma/grant-*.ts`) instead
- Compensation scripts should be idempotent and identify recipient by fortress/player

### 6.2 Tick Idempotency
- The tick processor skips already-processed tick numbers
- Safe to run manually for catch-up (`npm run game:tick`)
- Safe for Render Cron to run every minute even if the previous tick overlapped

### 6.3 Socket.IO Auth Uses DB Sessions
- `server.mjs` reads the session cookie directly from the HTTP request
- Falls back to chunked cookie parsing for large Auth.js sessions
- Rate-limits connections: 20/min production, 60/min dev per IP
- CORS: uses `ALLOWED_ORIGINS` env var + `AUTH_URL` + `RENDER_EXTERNAL_URL`

### 6.4 Server Action Size
- `game-actions.ts` is ~52KB — this is fine for Next.js server actions, but be careful not to make it bigger
- If it grows much further, split into domain-specific files (`game-actions-combat.ts`, `game-actions-diplomacy.ts`, etc.)

### 6.5 Season-Gated Code
- Check `Cycle.ruleset` before enabling SEASON_4-only features
- Legacy abilities are disabled but history records remain readable
- Use the `SEASON_4` enum value, not string literals

### 6.6 Battlefield Timing
- Player castle and owned-tile battlefields visible immediately
- Combat casualties start ONE HOUR after first attacking army arrives
- Reusing an active battlefield must NOT reset `startedAt`
- Home of A and Dwarf rune battlefields excluded from the 1h delay

### 6.7 Resource Floor
- Gold, food, points, and army never go below zero
- Starvation: food → 0, army loses 2% that tick

---

## 7. Directory Reference (Quick Jump)

| Path | What's There |
|------|-------------|
| `apps/web/src/app/page.tsx` | Home server component — loads session + state |
| `apps/web/src/app/home-client.tsx` | Main game UI (HUD, join, battlefield) |
| `apps/web/src/app/game-actions.ts` | **All server actions** (~52KB) |
| `apps/web/src/app/castle/` | Castle management route |
| `apps/web/src/app/politics/` | Diplomacy, trade, war page |
| `apps/web/src/app/admin/` | Admin dashboard + control room |
| `apps/web/src/app/wiki/` | Player-facing rule reference |
| `apps/web/src/app/history/` | Resolved seasons, winner history |
| `apps/web/src/app/shop/` | Arcade shop |
| `apps/web/src/app/arcade/` | Mini-games |
| `apps/web/src/components/battlefield-experience.tsx` | **Main map component** (99KB) |
| `apps/web/src/components/fortress-map.tsx` | Hex tile grid (47KB) |
| `apps/web/src/components/realtime-bridge.tsx` | Socket.IO client |
| `apps/web/src/components/live-game-state.tsx` | Game state context provider |
| `apps/web/src/lib/game/service.ts` | Core game service layer |
| `apps/web/src/lib/game/tick.ts` | Minute tick processor |
| `apps/web/src/lib/game/balance.ts` | Economy formulas |
| `apps/web/src/lib/game/army-recruitment.ts` | Recruitment system |
| `apps/web/src/lib/game/errors.ts` | GameError class |
| `apps/web/src/lib/game/game.test.ts` | Game integration tests |
| `apps/web/src/lib/auth.ts` | Auth.js config |
| `apps/web/src/lib/realtime.ts` | Server-side refresh emitter |
| `apps/web/prisma/schema.prisma` | **Full data model** (54KB) |
| `apps/web/prisma/seed.ts` | Seed flow |
| `apps/web/server.mjs` | Custom Node server (Next.js + Socket.IO) |
| `render.yaml` | Render Blueprint deployment |
| `docs/game-design.md` | Detailed game rules |
| `docs/next-season-redesign.md` | Pressure, Politics & Trade redesign plan |
