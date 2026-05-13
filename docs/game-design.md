# Game Design

## Rules v1

- Max 30 active players
- Unlimited spectators
- One fortress per player
- Fortress has:
  - name
  - owner
  - gold, food, active army, and recruitment queue
  - worker assignments for miners, farmers, and recruiters
  - race and castle specializations
  - owned tiles and active battle participation
  - map position
  - unit sprite variant
- Gold is the main spend currency for recruitment, upgrades, renames, and neutral tile claims
- Points determine season victory and are earned from map objectives, Home of A control, and score events
- Recruitment is order-based: players pay 1 gold per unit up front, and recruiters process the queue over future ticks
- Recruiters do not passively create army without a queued order
- Active army consumes 0.01 food per unit per tick, rounded down when persisted by the live tick
- If food cannot cover active-army upkeep, food falls to zero and active army loses 2% that tick
- Queued army does not consume food upkeep until it completes and joins active army
- Attack travel time is distance-based, using the default unit speed
- Direct attacks and battlefield reinforcements count against simultaneous outbound attack limits
- Rename costs 10 gold during active play
- Gold, food, points, and army never go below zero
- Global chat with timestamps
- Chat rate limit: 6 messages per minute per user
- Top 3 leaderboard visible
- Cycle timer: registration 24h, testing 24h, active 2 weeks
- Player action persists while offline
- Castle upgrades are available during gameplay and use gold
- Castle levels cost 500 / 1500 / 3000 / 5000 / 7500 / 10500 / 14000 / 18000 / 22500 gold
- Each castle level adds +1 growth per grow tick and +2 attack damage
- Home of A is a center-tile control battle, not a normal neutral claim
- First Home of A capture fights 10,000 neutral defense through the center tile
- The controlling Home of A banner alliance earns 17 points per tick while it holds the center, about 1,020 points per hour
- Each active Home of A holder loses 10 army on the first held tick, then 1 more army per tick for each tick held
- Home of A tile battles share battlefield resolution rules with other tile battles where possible
- Battle-log badges count unread/new reports only, not total historical entries

## Economy & recruitment

- Miners produce gold each tick, affected by race and Mine specialization bonuses.
- Farmers produce food each tick, affected by race and Food specialization bonuses.
- Recruiters process the fortress `recruitmentQueue` each tick; capacity starts at 1 unit per recruiter per tick and receives race/specialization modifiers.
- A recruitment order is rejected unless the player has selected a race, the cycle is playable, the unit count is a positive integer, and the fortress can afford the full gold cost.
- Completed recruited units are added to active army at the tick boundary.
- Food upkeep is charged only against active army after production for that tick; newly completed recruited units start counting for upkeep on later ticks.
- If food cannot cover the full active-army upkeep, food bottoms out at zero and active army loses 2% that tick.

## Tiles & battlefields

- Desktop and mobile controls both support inspecting tiles directly from the battlefield map.
- Neutral spawnable tiles can be claimed only if they connect to the player's castle tile or existing owned territory.
- Neutral claims are timed projects: they reserve the gold cost immediately and complete after 10 minutes.
- Each fortress may run only one active neutral tile claim at a time.
- Home of A cannot be neutral-claimed; players must fight for the center objective through a battlefield.
- Owned tiles are contested through battlefield attacks and can transfer ownership when the battlefield resolves.
- Players can fortify owned tiles, including Home of A after capture, by sending idle army that travels to the tile and becomes a persistent non-decaying garrison until recalled or killed.
- Temporary map objectives rotate onto normal tiles and add extra point income while active.
- Players can join an active battlefield as attacker or defender if they have idle army and are not violating same-side/conflicting-side restrictions.
- Reinforcements are represented by `AttackUnit` rows and now obey the same outbound attack cap as direct attacks.
- Players can partially recall their own remaining active battlefield army or won-tile garrisons; recalled forces travel home and already-suffered losses stay lost.
- Dwarf defenders receive an extra 25% defensive multiplier when defending owned tiles or Home of A.
- Battlefield resolution is applied after fortress economy persistence in the tick, preventing stale economy writes from overwriting loot, casualty, reward, or ownership results.

## Spawn & map fairness

- Spawn selection only uses valid spawn hexes (`HEX_SPAWN_TILES` plus runtime `isPointNearSpawnHex` checks).
- Spawn placement is deterministic for a given explicit seed (for replay and server reconciliation).
- Candidate spawn pools are shuffled with a seeded PRNG, then selected with distance-aware acceptance to reduce clustering.
- Spawn assignments enforce uniqueness by persisted `mapX:mapY` coordinates.
- Spawn math keeps tile precision during selection and rounds only when positions are persisted to storage.

## Tick Ops Runbook

- Render production expects the `project-a-game-tick` cron job to run every minute from [`render.yaml`](C:/Users/arto.askala/Documents/project-a/Project-A/render.yaml).
- Check tick freshness from the home HUD or admin dashboard:
  - `ok` means the latest processed minute is current enough for normal play.
  - `lagging` means the game is behind and player-visible updates may feel slow.
  - `stalled` means point growth, attack impacts, and new launches can stop progressing until recovery runs.
- Recovery stays admin-controlled:
  - open the admin dashboard;
  - use `Replay missed ticks now`;
  - this replays every due minute and refreshes battlefield, battle log, leaderboard, and history state.
- Post-boss upgrade checks:
  - once Home of A falls for the first time, `upgradesUnlockedAt` is set on the current cycle;
  - `megaFortressDestroyCount` tracks how many times the boss has already fallen this cycle;
  - all player fortresses may then buy levels if they can afford the next cost;
  - the first slayer gets one free level immediately, up to the normal level cap;
  - later boss kills escalate HP and reward, but do not grant more free levels or move the crown.
