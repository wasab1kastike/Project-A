# Agent Notes

These notes are for coding agents working in this repository. Keep changes pragmatic, scoped, and verified.

## Project Shape

- Project-A is a browser-based multiplayer strategy game.
- The app lives in `apps/web` and uses Next.js App Router, React 19, TypeScript 5, Prisma 7, PostgreSQL, Auth.js (v5 beta), and Socket.IO.
- Root scripts proxy to the `web` workspace, so prefer root commands unless a workspace command is clearer.
- Main gameplay code is concentrated around:
  - `apps/web/src/lib/game/`
  - `apps/web/src/app/game-actions.ts`
  - `apps/web/src/app/page.tsx`
  - `apps/web/src/app/home-client.tsx`
  - `apps/web/src/components/`
  - `apps/web/prisma/schema.prisma`

## Common Commands

- Typecheck: `npm run typecheck --workspace web`
- Game tests: `npm run test:game --workspace web`
- Production build: `npm run build --workspace web`
- Dev server: `npm run dev --workspace web`
- Manual tick: `npm run game:tick --workspace web`
- Prisma generate: `npm run db:generate --workspace web`
- Apply production migrations: `npm run db:deploy --workspace web`

For gameplay changes, normally run:

```bash
npm run test:game --workspace web
npm run typecheck --workspace web
npm run build --workspace web
```

If a local database is unavailable, DB-backed tests may skip. Say that clearly in the final result. Battlefield timing regression tests are DB-backed, so skipped DB tests do not provide full coverage for combat-start timing.

## Refactor And Cleanup Workflow

- Refactor one feature or workflow slice at a time; avoid broad cleanup sweeps.
- Start by preserving current behavior with focused tests or existing regression coverage before moving code.
- Prefer extracting pure gameplay rules from persistence-heavy modules such as `service.ts`, `tick.ts`, and read models into feature-owned helpers.
- Keep public server actions, API routes, Prisma schema, and UI behavior stable unless the requested slice explicitly changes them.
- Avoid unrelated formatting churn and cosmetic rewrites.
- Useful first slices include battlefield combat, castle economy, recruitment, Home of A, loot camps, leaderboard titles, realtime state, shop/cosmetics, and admin tools.
- For meaningful cleanup passes, normally run `npm run test:game --workspace web`, `npm run typecheck --workspace web`, and `npm run build --workspace web`.

## Git And Deployment

- The active deployment branch is `main`.
- When the user says "push to main", commit the current scoped work and push directly to `origin main`.
- Do not create a feature branch or PR unless the user asks for one.
- Inspect `git status --short` and the staged diff before committing.
- Stage only files that belong to the requested change.
- Never revert user changes unless explicitly asked.

## File-to-Purpose Mapping

### Core Game Engine (`apps/web/src/lib/game/`)

| File | What It Does |
|------|-------------|
| `service.ts` | **Main service layer** — all game operations (join, attack, trade, diplomacy, upgrades, race abilities, worker assignment, etc.). This is the largest file. |
| `tick.ts` | **Minute tick processor** — economy, pressure, combat, rewards. Idempotent (skips processed tick numbers). |
| `balance.ts` | Pure formulas: economy production, defense, raid math. No DB calls. |
| `upgrades.ts` | Upgrade cost/duration tables and attack scaling. |
| `castle-production.ts` | Production-related type definitions and documentation. |
| `army-recruitment.ts` | Order-based recruitment logic (cost, recruiter capacity, queue processing). |
| `army-recruitment.test.ts` | Unit tests for recruitment math. |
| `fortress-validation.ts` | Validation helpers for upgrades, workers, attacks, diagnostics. Returns structured errors. |
| `chat.ts` | Chat system: send message, mark read, GIF support. |
| `arcade.ts` | Arcade games, loot boxes, cosmetic unlocks. |
| `community-wishes.ts` | Community wish proposals and voting. |
| `build-arcade.ts` | Build-arcade mini-game scoring. |
| `errors.ts` | `GameError` class — user-facing error messages with no stack leaks. |
| `patch-notes.ts` | Patch notes data structure. |
| `game.test.ts` | DB-backed integration tests for the game loop. |

### Server Actions (`apps/web/src/app/game-actions.ts`)

This is a single ~52KB file exporting every "use server" action. Action categories:

| Category | Key Actions |
|----------|------------|
| **Registration** | `joinFortressAction`, `editRegistrationFortressName`, `registerCommanderName` |
| **Race/Doctrine** | `selectFortressRaceAction`, `selectFortressDoctrineAction` |
| **Economy** | `updateWorkerAssignmentAction`, `recruitArmyAction` |
| **Combat** | `attackFromMapAction`, `attackMapHexAction`, `joinBattlefieldAction`, `recallAttackUnitAction`, `recallAllUnitsAction` |
| **Tile/Map** | `setTilePressurePriorityAction`, `fortifyMapHexAction`, `torchOccupiedMapHexAction`, `relocateCastleToTileAction` |
| **Diplomacy** | `proposeAllianceAction`, `acceptAllianceAction`, `betrayAllianceAction`, `declareWarAction`, `proposePeaceAction` |
| **Trade** | `createTradeOfferAction`, `acceptTradeOfferAction`, `rejectTradeOfferAction` |
| **Standing Orders** | `stationGuardOrderAction`, `createEscortOrderAction`, `createRaidOrderAction`, `startTerritoryCampaignAction` |
| **Race Abilities** | `activateDwarfDeepMining`, `activateDwarfRuneOfGrudges`, `activateOrkBossOrder`, `activateUnicornShatteredReality` |
| **Admin** | Admin actions for cycle control, tick replay, score adjustments |

**Pattern every action follows:**
1. `const session = await auth()` — authenticate
2. Validate user → return `{ ok: false, error: "..." }` if not authenticated
3. `try { await serviceFunction(...); notifyAndRevalidate(reason); return { ok: true }; }`
4. `catch (error) { return { ok: false, error: getActionErrorMessage(error) }; }`

### Frontend Components (`apps/web/src/components/`)

| Component | Size | Purpose |
|-----------|------|---------|
| `battlefield-experience.tsx` | ~99KB | Main game map: hex grid, zoom/pan, tile selection, attack UI, battle log, reinforcements. **Largest component.** |
| `fortress-map.tsx` | ~47KB | Hex tile grid rendering: ownership colors, fortress sprites, attack animations, decor (lakes, forests, roads). |
| `active-command-center.tsx` | ~5KB | Manage attacks and standing orders from the map. |
| `realtime-bridge.tsx` | — | Socket.IO connection: listens for `project-a:refresh`, triggers state fetch. |
| `live-game-state.tsx` | — | React context: manages game state fetching, caching, and refresh orchestration. |
| `chat-panel.tsx` | ~6KB | Global chat with GIF picker integration. |
| `leaderboard-panel.tsx` | — | Rankings display. |
| `session-actions.tsx` | — | Sign-in/sign-out buttons. |
| `season-timer.tsx` | — | Phase countdown. |
| `giphy-gif-picker.tsx` | ~6KB | Giphy integration for chat. |
| `build-arcade-game.tsx` | ~5KB | Arcade mini-game UI. |

### API Routes

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/auth/[...nextauth]` | * | Auth.js handler |
| `/api/game/state` | GET | Full game state JSON for client refresh |
| `/api/openclaw/god-snapshot` | GET | Public-safe game snapshot for AI |
| `/api/openclaw/god-chat` | POST | AI posts God Emperor A in global chat |
| `/api/health` | GET | Server health (handled in server.mjs, not Next.js) |

### Infrastructure

| File | Purpose |
|------|---------|
| `apps/web/server.mjs` | Custom HTTP server: Next.js handler + Socket.IO + health endpoint + DB realtime watcher |
| `apps/web/prisma/schema.prisma` | **Full data model**: 50+ models, 20+ enums (54KB) |
| `apps/web/prisma/seed.ts` | Admin bootstrap + initial REGISTRATION cycle |
| `render.yaml` | Render Blueprint: web + cron + DB services |
| `docker-compose.yml` | Local PostgreSQL setup |
| `scripts/render-build.mjs` | Build optimization for Render deploys |

### Documentation

| File | What It Covers |
|------|---------------|
| `docs/architecture.md` | Foundation decisions, planned runtime split, data/auth decisions |
| `docs/game-design.md` | **Full game rules reference**: economy, combat, politics, trade, tick ops |
| `docs/next-season-redesign.md` | Pressure, Politics & Trade target design — the big planned change |
| `docs/data-model.md` | Entity relationship guide for the Prisma schema |
| `docs/development-workflow.md` | How to add features, common patterns, verification loops |
| `docs/tech-stack.md` | Technology selection rationale |
| `PHASE_1_SUMMARY.md` | Phase 1 castle/recruitment redesign summary |
| `CHANGELOG.md` | Release history by date |

## Gameplay Rules To Preserve

- Home of A is not a normal conquerable fortress.
- Home of A is the center-tile daily boss at tile `20:15`.
- Players attack Home of A through the center tile action, not by direct fortress targeting.
- Home of A has no owner, holder drain, garrison defense, fortify action, or control-income behavior.
- Home of A kills use cumulative damage attribution for the current boss generation.
- On Home of A death, the top damage dealer receives points, food, army, and the 12-hour Home of A boss buff.
- Home of A respawns after 24 hours with HP scaled by `megaFortressDestroyCount`.
- Home of A attackers should not lose their sent army just because they defeated the boss.
- Race-specific behavior should be intentional and documented. If a core system such as upgrades changes, verify it works consistently for all races unless the design explicitly says otherwise.
- PvP castle wins should provide visible rewards when rewards exist: a small points transfer if the defender has points, plus loot based on army size.
- PvP castle and owned-tile battlefields are visible immediately, but combat resolution starts one hour after the first attacking army arrives. Reusing an active battlefield must not reset `startedAt`.
- Home of A and Dwarf rune battlefields are excluded from the one-hour PvP/tile preparation delay unless explicitly redesigned.
- Leaderboard title holders are derived from active-season rankings, not stored as permanent ownership. Points, units killed, current normal tiles owned, goblins killed, and resources stolen from player castles each have a live title and buff.
- Home of A HP damage should not count as units killed or goblins killed. Goblins killed means final blows on loot camps. Resources stolen means gold, food, and score points taken from real player castles only.

## Live State

- Main game state should update without a full route refresh for normal gameplay changes.
- `RealtimeBridge` should treat Socket.IO events as hints to fetch `/api/game/state`.
- Prefer `LiveGameStateProvider` and `refreshGameState(reason)` over `router.refresh()` in main gameplay components.
- Keep `router.refresh()` only for last-resort fallback, auth/session boundary changes, or flows that intentionally redirect.
- If a live state fetch fails, preserve the last good state and show stale/sync status instead of replacing the game with a fatal error card.

## Docs And Player Communication

Gameplay-facing changes usually need docs updates in the same commit:

- README gameplay section: `README.md`
- Design reference: `docs/game-design.md`
- Wiki page: `apps/web/src/app/wiki/page.tsx`
- Patch notes data: `apps/web/src/lib/game/patch-notes.ts`

If the user asks for a global notification, make it player-facing, short, and a little humorous. Still keep the actual rule text clear.

One-time game announcements should use a versioned localStorage key so players see them once and can reopen them from the HUD when practical.

## Database And Production Safety

- Treat Prisma schema changes as production-impacting.
- Add migrations for schema changes and run/generate Prisma client as needed.
- Do not reset production data.
- Compensation scripts should be idempotent or guarded where possible, and should clearly identify the recipient fortress/player and reason.
- Avoid ad hoc production data changes unless the user explicitly requests them.

## Frontend Expectations

- Preserve the map as the main experience; avoid adding bulky explanatory UI over the playfield.
- Keep HUD and panels dense, readable, and responsive.
- Do not add visible instructions for obvious controls unless the user asks.
- For UI changes, check desktop and mobile behavior when practical.

## Cross-Cutting Patterns Worth Knowing

### Season-Gated Code
- `Cycle.ruleset` distinguishes `LEGACY` (old rules) from `SEASON_4` (redesign)
- Check the ruleset before enabling SEASON_4-only features
- Legacy abilities are disabled but history records remain readable
- Never use string literals — use the `CycleRuleset` enum

### Server Action Pattern (every action in game-actions.ts)
```typescript
const session = await auth();
const userId = session?.user?.id;
if (!userId) return { ok: false, error: "..." };
try {
  await serviceFunction({ userId, ...input });
  notifyAndRevalidate("reason", ["/", "/other-paths"]);
  return { ok: true };
} catch (error) {
  return { ok: false, error: getActionErrorMessage(error) };
}
```

### Game State Freshness Flow
```
Server Action → Prisma write → revalidatePath() + emitProjectARefresh(reason)
                                    ↓
                              Socket.IO "project-a:refresh"
                                    ↓
                              Client → GET /api/game/state → context update
```

### Pure Rule Extraction
When refactoring, extract deterministic math from `service.ts`/`tick.ts` into pure function modules in `lib/game/`. This makes the logic testable without a database and keeps PRs focused.

## Final Response Expectations

- Say what changed, what was verified, and what could not be verified.
- Include the commit hash after pushing.
- Keep responses concise and practical.
- Daily 7-Tile A-Bomb Plan

## Summary
Implement A-Bombs as a daily contested superweapon with a **7-tile blast**: one target tile plus its six adjacent hexes. The center becomes a crater; surrounding tiles enter fallout. Player castles cannot be directly targeted, but if a castle is caught in the blast ring, it suffers real damage: **-1 castle level** and temporary population suppression during fallout.

## Key Changes
- Add a daily **Divine Silo Authorization** event that awards one **A-Bomb Authorization** to the first player who completes the objective.
- Launching an A-Bomb targets one legal normal tile and creates a public countdown.
- Target restrictions:
  - cannot target Home of A,
  - cannot target a player castle tile,
  - cannot target a tile already in fallout,
  - cannot target an active unresolved battlefield tile.
- Blast footprint:
  - center tile: direct impact / crater,
  - adjacent six tiles: fallout ring using existing hex adjacency logic.
- Impact effects:
  - center tile becomes neutral, loses income, cancels local claim/campaign/guard state, and enters crater fallout for 12 hours.
  - adjacent owned tiles keep ownership but produce no income and cannot be claimed, conquered, fortified, deed-transferred, or used for new objectives during fallout.
  - guard/garrison army on center tile is mostly destroyed; adjacent guards take lighter losses.
  - castles in adjacent fallout lose 1 castle level, minimum displayed level 1, and have population suppressed until fallout ends.
- A-Bombs never directly remove stored gold, food, score points, or idle home army.

## Interfaces / Data
- Add persisted state for:
  - daily Divine Silo objective,
  - A-Bomb Authorization charge,
  - pending/resolved A-Bomb strike,
  - tile fallout/crater records with `endsAt`,
  - optional castle fallout penalty state for temporary population suppression.
- Add server actions:
  - contribute to Divine Silo objective,
  - launch A-Bomb at selected tile.
- Add read-model fields for:
  - current daily silo,
  - player-owned A-Bomb charge,
  - incoming A-Bomb countdowns,
  - fallout/crater tiles,
  - castle fallout penalty status.
- Resolve objective expiry, strike impact, fallout expiry, and castle population restoration in the normal tick flow.

## UI And Flavor
- Player-facing names:
  - **A-Bomb Authorization**
  - **Divine Silo Authorization**
  - **Authorize A-Bomb**
  - **Fallout**
  - **Crater**
- Map shows:
  - target tile,
  - six-tile blast preview before launch,
  - incoming countdown,
  - crater/fallout styling after impact.
- Announcement tone:
  - “The Department of Loud Solutions has approved one tactical miracle.”
  - “A-Bomb launched at Tile 12:9. Please admire the glow from a sensible distance.”
  - “Tile 12:9 has been promoted to crater.”

## Test Plan
- Daily event creates only one A-Bomb opportunity per day.
- A-Bomb target validation rejects Home of A, castle tiles, fallout tiles, and active battle tiles.
- Blast footprint includes exactly center tile plus adjacent tiles.
- Center impact neutralizes tile, cancels local state, and starts 12-hour crater fallout.
- Adjacent fallout blocks income/actions without removing ownership.
- Castle caught in adjacent fallout loses one castle level, never below displayed level 1.
- Castle population suppression lasts only until fallout expiry.
- A-Bomb charge is consumed on successful launch only.
- Run:
  - `npm run test:game --workspace web`
  - `npm run typecheck --workspace web`
  - `npm run build --workspace web`

## Assumptions
- Fallout lasts 12 hours everywhere in v1.
- Blast size is fixed at 7 tiles.
- Castle tiles cannot be directly targeted, but can be hit by adjacent fallout.
- Castle damage is real level damage, while population loss is temporary during fallout.
- Divine Quests can later reuse this event framework, but this plan only implements the daily A-Bomb objective.
