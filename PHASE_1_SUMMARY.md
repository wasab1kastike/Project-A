## Phase 1: Castle System Cleanup & Army Recruitment Redesign - COMPLETE

### Summary

Phase 1 refactored and documented the castle production system, created validation utilities, and designed the order-based army recruitment system. That recruitment design is now live: players buy army orders with gold, recruiters process the queue over ticks, and active army pays food upkeep.

- 2026-05-13: Mega Fortress (Home of A) now drains defending units at an escalating rate: 1 + 1 per tick held. The longer a fortress holds the Mega Fortress, the more units are drained from all defenders each tick. The battlefield UI now shows persistent Mega Fortress control, defenders, and point rewards at the top of the screen. Defending the Mega Fortress becomes riskier over time, requiring active reinforcement and coordination. Players can always see who controls the Mega Fortress and how points and drain are applied.

### What Was Accomplished

#### 1. Castle Production System Documentation & Organization

- **balance.ts**: Documents deterministic economy, production, defense, and raid formulas.
- **upgrades.ts**: Documents fortress upgrade costs, durations, and attack damage scaling.
- **tick.ts**: Documents the live tick production phase and separates economy updates from battlefield resolution.
- **castle-production.ts**: Organizes production-related types and documentation.

#### 2. Fortress Validation Utilities

- **fortress-validation.ts**: Validation helpers for fortress upgrades, worker assignment, production health, attack limits, and diagnostics.
- Validation returns structured error messages for UI and admin use.

#### 3. Army Recruitment System

- **army-recruitment.ts** implements order-based recruitment:
- Recruitment orders charge 1 gold per unit up front.
- Recruiters process queued units at 1 unit per recruiter per tick before race and specialization modifiers.
- Completed units join active army at tick boundaries.
- Active army consumes 0.01 food per unit per tick.
- Queued army does not consume upkeep.
- Race modifier support flows through the shared race modifier model.

- **army-recruitment.test.ts** covers:
- Cost calculations.
- Recruiter capacity and progress.
- Queue processing.
- Upkeep sustainability.
- Realistic game scenarios.

### Live Production Overview

**Population Formula**

```text
Population = 25 + (level x 10) + race_bonus
```

**Gold Production**

```text
Gold Base = miners + floor(miners / 10) x race_bonus
Gold Produced = floor(Gold Base x (1 + specializations x 0.1))
```

**Food Production**

```text
Food Base = farmers + floor(farmers / 10) x race_bonus
Food Produced = floor(Food Base x (1 + specializations x 0.1))
```

**Army Recruitment**

```text
Player orders X units and pays X gold up front
Queue = X pending units
Each tick: units created = min(queue, recruiter capacity)
Active upkeep = active army x 0.01 food per tick
```

Recruiters no longer create passive army when the queue is empty.

### Phase 3 Implementation Status

The queued recruitment rollout is implemented in live gameplay.

#### 1. Database

- Added `Fortress.recruitmentQueue`.
- Added checked-in migration `20260506170000_army_recruitment_queue`.
- No separate `RecruitmentOrder` table exists yet; current state tracks pending unit count.

#### 2. Game Loop

- Production processes the recruitment queue instead of passive army generation.
- Completed units are added to `fortress.army`.
- Active-army food upkeep is charged after production; newly completed recruited units start counting for upkeep on later ticks.
- `recruitmentQueue` is persisted with fortress economy state.
- Battlefield resolution now runs after economy persistence so rewards, casualties, loot, and tile ownership are not overwritten by stale tick accumulators.

#### 3. Service Layer

- Added `recruitArmy(unitCount)` and `recruitArmyAction`.
- Validates playable cycle state, active player fortress, selected race, positive integer unit count, and available gold.
- Deducts gold and increments `recruitmentQueue`.

#### 4. UI

- Castle page includes a recruitment form with quantity input and total gold cost.
- Queue size, recruiter capacity, estimated ticks, and active-army upkeep are visible.
- Worker preview explains that recruiters process queued orders instead of passive army production.

#### 5. Combat Follow-Up

- Battlefield reinforcements now obey the same simultaneous outbound attack cap as direct attacks.
- Battle-log badges show unread/new report counts only.
- Desktop tile selection now supports direct click/tap inspection and tile purchase flow.

#### 6. Verification

- `npm run db:generate --workspace web`
- `npm run typecheck --workspace web`
- `npm run test:game --workspace web`
- Focused army recruitment unit tests
- Focused lint for touched TypeScript/TSX files

### Current Status

- **Phase 1: complete** - Castle system documented, validation utilities created, and recruitment helpers tested.
- **Phase 2: partially implemented** - Territory and combat cleanup has progressed through tile battle consistency, battlefield persistence ordering, and reinforcement cap enforcement.
- **Phase 3: implemented** - Order-based recruitment is live in schema, service, tick processing, read models, and Castle UI.

### Future Follow-Up

- Add per-order recruitment history if design wants audit trails or cancellable orders.
- Add more DB-backed integration coverage for recruitment order purchase, tick completion, and starvation behavior.
- Add regression coverage for battlefield resolution rewards, tile transfer, recalls, and simultaneous attack limits across direct attacks and reinforcements.
