# Game Systems Plan

> Product and architecture contract for making Project-A easier to understand, easier to play, and safer to extend.

## Target Experience

Project-A should feel like a slow-burn multiplayer strategy game where the map is the main stage. Players should understand what they can do in the first few minutes, then make plans that continue resolving while they are away.

The intended loop is:

1. Read the map.
2. Improve the fortress.
3. Set expansion, trade, diplomacy, and war intent.
4. Watch units, convoys, roads, and battlefields make that intent visible.
5. Spend new resources and skill points to specialize.

The game should reward planning and readable consequences more than repeated manual clicking.

## Player Verbs

These are the main things the UI and rules should support clearly:

| Verb | System | Player-facing meaning |
|------|--------|-----------------------|
| Read | Map, wiki, HUD | Understand territory, threats, roads, convoys, armies, and current season state. |
| Build | Castle | Upgrade economy, recruitment, defense, wagons, and specialization capacity. |
| Claim | Map pressure | Choose the next border priorities and watch pressure claim land. |
| Recruit | Castle, battalions | Train army into commissioned battalions instead of treating army as an abstract pile. |
| Assign | War Room | Set battalion jobs: RESERVE, GUARD, ATTACK, or ALLIANCE. |
| Trade | Politics, convoys | Move cargo visibly with capacity, time, road, alliance, and risk rules. |
| Negotiate | Politics | Propose alliances, trust, collateral, peace, reparations, and betrayal with visible costs. |
| Escalate | War, campaigns | Turn hostility into border campaigns, warnings, and battlefields. |
| Specialize | Race skills | Spend scarce skill points on economy, territory, or military identity. |
| Personalize | Sprites, HUD, audio | Make the game feel alive without hiding required gameplay information in cosmetics or sound. |

## System Connections

Every major system should feed at least one other system:

- Map ownership creates points, resources, road value, war borders, and skill-point progress.
- Castle economy creates the workers, recruitment, battalion capacity, wagon capacity, and upgrade choices that make map plans possible.
- Race skills modify existing systems; they should not become isolated minigames.
- Politics changes risk and reward for trade, alliance support, peace, betrayal, and war.
- Trade uses map travel, road speed, wagon limits, skill bonuses, alliance trust, and hostile seizure rules.
- War uses map borders, diplomacy state, pressure priorities, battalion jobs, travel time, roads, and delayed battlefield resolution.
- Audio and cosmetics are flavor only; all required feedback must remain visual or textual.

If a new feature cannot name the systems it affects and the player verb it improves, it should stay in planning.

## Map And Controls Contract

The map is the primary play surface.

- Visible controls stay compact and avoid covering the playfield.
- Zoom uses mouse wheel, trackpad pinch, mobile pinch, and focused-map keyboard `+` / `-`.
- Dedicated visible zoom buttons are intentionally avoided.
- Visible map controls are reserved for reset and fortress focus.
- Drag and touch pan should work without requiring a mode switch.
- Tile, fortress, unit, convoy, road, and battlefield selection should use stable visual highlights.
- Important map symbols need real art or clear repeated visual language, not temporary text markers.
- Mobile and desktop should share the same conceptual controls, even when layout changes.

The code contract for map inputs lives in `apps/web/src/lib/game/map-controls.ts`.

## UI Surfaces

The main route should protect the map first. Supporting surfaces should answer specific jobs:

- Home battlefield: map, live state, active movement, immediate season status, compact navigation.
- Castle: economy, recruitment, battalion jobs, upgrades, owned-tile status, character/cosmetic management.
- Politics: relations, alliance trust, collateral, peace, trade, war decisions.
- Wiki: player-facing explanation of current rules.
- Patch notes: short player-facing change log.
- Admin: operational control and diagnostics only.

Avoid duplicating full workflows across surfaces. Link or summarize when another surface owns the decision.

## Architecture Boundaries

Rules should be testable without rendering.

- `apps/web/src/lib/game/` owns pure rules, service functions, read models, and helpers.
- Server actions validate session, call game services, emit refresh hints, and return user-safe errors.
- Read models shape data for UI; React components should not rediscover rules from raw database state.
- Map rendering owns view state, camera controls, hit targets, and visual layers, not game authority.
- Asset and cosmetic keys should be stable manifest-style identifiers, not filenames scattered through UI code.
- Generated or optional audio should be started only from user interaction and cleaned up on unmount.

When a component grows because it is mixing rules and rendering, extract a pure helper first and cover it with a focused test.

## Fun And Clarity Gates

Before calling a feature ready, check:

- Can a new player name the next useful action from the map or current page?
- Does the feature connect to points, territory, resources, diplomacy, war, trade, skills, or customization?
- Does the map show the consequence when something moves, claims, fights, or delivers?
- Are mobile controls equivalent to desktop controls?
- Is the player-facing copy short enough to scan?
- Is the rule documented in `docs/game-design.md`, the wiki, README, or patch notes as appropriate?
- Is the core rule covered by a pure test or an integration test?
- Do `npm run typecheck --workspace web` and `npm run build --workspace web` pass?
- For DB-backed behavior, does `npm run test:game --workspace web` run against a reachable PostgreSQL instance or clearly report skipped DB coverage?

## Refactor Priority

Work in slices that reduce confusion or coupling:

1. Map input, selection, and visual language.
2. Castle economy, recruitment, and battalion management.
3. Politics, trade, and war intent.
4. Race skills and specialization effects.
5. Character art, cosmetics, and optional audio.
6. Documentation, wiki, patch notes, and onboarding copy.

Each slice should leave the game more understandable to players and easier to change for future seasons.
