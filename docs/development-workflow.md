# Development Workflow

> How to add features, run tests, and avoid common pitfalls in Project-A.

---

## Quick Commands

```bash
npm run dev              # Dev server (localhost:3000)
npm run build            # Production build
npm run typecheck        # TypeScript check
npm run test:game        # Game logic tests (needs PostgreSQL for DB-backed tests)
npm run game:tick        # Manual tick catch-up
npm run db:generate      # Regenerate Prisma client
npm run db:migrate       # Create migration (needs local DB)
npm run db:seed          # Seed admin + initial cycle
```

---

## Adding a Feature

### 1. Pure Rules First

Add a module in `apps/web/src/lib/game/`:

```
apps/web/src/lib/game/
├── balance.ts                 # Economy formulas
├── army-recruitment.ts        # Recruitment math
├── race-abilities.ts          # Shared ability types + enums
├── dwarf-abilities.ts         # Dwarf race mechanics
├── ork-abilities.ts           # Ork race mechanics
├── your-new-module.ts         # Pure rules — no DB imports
└── your-new-module.test.ts    # Unit tests
```

**Rule:** Export pure functions that take plain data and return results. No Prisma calls. This makes them testable without a database.

### 2. Add Tests

```bash
npm run test:game    # Runs all vitest tests in src/**/*.test.ts
```

For DB-backed integration tests, use `game.test.ts`.

### 3. Schema Changes

1. Edit `apps/web/prisma/schema.prisma`
2. `npm run db:migrate -- --name your_feature`
3. `npm run db:generate`

**Rules:**
- Use `cuid()` for IDs, never `uuid()`
- Add `@@index(...)` for query patterns
- Use `@@unique([cycleId, ...])` for cycle-scoped uniqueness

### 4. Service Layer

Add a function in `apps/web/src/lib/game/service.ts`:

```typescript
export async function doThing(input: {...}): Promise<Result> {
  // 1. Validate cycle is playable
  // 2. Load fortress
  // 3. Validate business rules → throw GameError on failure
  // 4. Persist with $transaction([...])
  // 5. Return result
}
```

### 5. Server Action

Add to `apps/web/src/app/game-actions.ts`:

```typescript
"use server";
export async function doThingAction(input: {...}): Promise<InlineActionResult> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: "Sign in required." };
  try {
    await doThing({ userId: session.user.id, ...input });
    notifyAndRevalidate("reason");
    return { ok: true };
  } catch (error) {
    return { ok: false, error: getActionErrorMessage(error) };
  }
}
```

### 6. Verification

```bash
npm run typecheck
npm run test:game     # If DB available
npm run build
```

---

## State Freshness Flow

```
Server Action → Prisma write → revalidatePath() + emitProjectARefresh()
                                       │
                                 Socket.IO broadcast "project-a:refresh"
                                       │
                                 Client RealtimeBridge → refreshGameState()
                                       │
                                 GET /api/game/state → LiveGameStateProvider
                                       │
                                 Components re-render
```

---

## Common Gotchas

### Tick Idempotency
The tick processor skips already-processed tick numbers. Safe to run manually or via cron — overlapping ticks won't double-process.

### Season-Gating
Check `Cycle.ruleset === "SEASON_4"` before enabling Season 4 features. Use the enum, not string literals.

### Battlefield Timing
- Player castle and owned-tile battlefields visible immediately
- Combat starts **1 hour** after first army arrives (`startedAt`)
- Reusing an active battlefield must NOT reset `startedAt`
- Home of A and Dwarf rune battlefields excluded from 1h delay

### Resource Floor
Gold, food, army, and points never go below zero. Starvation (food=0) costs 2% army per tick.

### Socket.IO Auth
`server.mjs` reads session cookie directly. Falls back to chunked cookie parsing for large Auth.js sessions. Rate-limited: 20/min production, 60/min dev.

### Server Action Size
`game-actions.ts` is large — if it grows further, split into domain files (`game-actions-combat.ts`, etc.).

---

## Directory Map

| Path | What's There |
|------|-------------|
| `apps/web/src/lib/game/` | Pure game logic modules |
| `apps/web/src/app/game-actions.ts` | All server actions |
| `apps/web/src/app/page.tsx` | Home server component |
| `apps/web/src/app/home-client.tsx` | Main game UI |
| `apps/web/src/components/battlefield-experience.tsx` | Map component |
| `apps/web/src/components/fortress-map.tsx` | Hex grid renderer |
| `apps/web/src/components/realtime-bridge.tsx` | Socket.IO client |
| `apps/web/src/components/live-game-state.tsx` | Game state context |
| `apps/web/prisma/schema.prisma` | Database schema |
| `apps/web/server.mjs` | Custom server (Next.js + Socket.IO) |
