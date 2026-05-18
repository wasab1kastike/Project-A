# Agent Notes

These notes are for coding agents working in this repository. Keep changes pragmatic, scoped, and verified.

## Project Shape

- Project-A is a browser-based multiplayer strategy game.
- The app lives in `apps/web` and uses Next.js App Router, React, TypeScript, Prisma, PostgreSQL, Auth.js, and Socket.IO.
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

If a local database is unavailable, DB-backed tests may skip. Say that clearly in the final result.

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

## Final Response Expectations

- Say what changed, what was verified, and what could not be verified.
- Include the commit hash after pushing.
- Keep responses concise and practical.
