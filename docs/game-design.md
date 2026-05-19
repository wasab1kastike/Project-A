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
- Points determine season victory and are earned from map objectives, Home of A boss kills, and score events
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
- Top 3 leaderboard visible for points, units killed, tiles owned, goblins killed, and resources stolen from player castles
- Category leaders hold live titles: Crown Accountant, Butcher, Landlord, Goblin Bonker, and Loot Lord
- Title buffs are active only during the live season and update as rankings change
- Cycle timer: registration 24h, testing 24h, active 2 weeks
- Player action persists while offline
- Castle upgrades are available during gameplay and use gold
- Castle levels cost 500 / 1500 / 3000 / 5000 / 7500 / 10500 / 14000 / 18000 / 22500 gold
- Each castle level adds +1 growth per grow tick and +2 attack damage
- Home of A is a center-tile daily boss, not a normal neutral claim
- Players attack Home of A through the center tile; it does not create tile ownership, holder drain, or fortification garrisons
- Boss HP scales by kill count: 10k, 20k, 50k, 100k, then +50k per later kill
- The top damage dealer when Home of A dies receives points, food, and army equal to boss max HP / 4, plus a 12-hour +25% combat and economy buff
- Home of A stays dead for 24 hours after each kill, then respawns at the next HP tier
- Battle-log badges count unread/new reports only, not total historical entries

## Leaderboard titles

- Crown Accountant is the points leader and receives +10% points from tile income.
- Butcher is the units-killed leader and receives +10% attack power only.
- Landlord is the current normal-tile leader and receives +10% tile resource income.
- Goblin Bonker is the loot-camp destruction leader and receives +25% loot-camp rewards.
- Loot Lord is the player-castle resources-stolen leader and receives +10% stolen castle gold, food, and score points.
- Units killed come from direct attacks and battlefield losses; Home of A HP damage does not count.
- Goblins killed count final blows on loot camps, not every defending unit killed there.
- Resources stolen count only gold, food, and score points taken from real player castles. Loot camps, Home of A, tile income, and generated kill rewards do not count.

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
- Home of A cannot be neutral-claimed or fortified; players attack the center boss directly through the tile action.
- Owned tiles are contested through battlefield attacks and can transfer ownership when the battlefield resolves.
- Players can fortify owned normal tiles by sending idle army that travels to the tile and becomes a persistent non-decaying garrison until recalled or killed.
- Temporary map objectives rotate onto normal tiles and add extra point income while active.
- Players can join an active battlefield as attacker or defender if they have idle army and are not violating same-side/conflicting-side restrictions.
- Reinforcements are represented by `AttackUnit` rows and now obey the same outbound attack cap as direct attacks.
- Player castle and owned-tile battlefields are visible immediately, but casualty resolution starts one hour after the first attacking army arrives.
- Battlefield casualties apply every tick and ramp from 100 total units per tick to 1000 after one hour.
- Battlefields resolve only when one side runs out of army; high progress no longer triggers a separate instant combat roll.
- Reinforcements that arrive after a battlefield has resolved return home intact.
- Players can partially recall their own remaining active battlefield army or won-tile garrisons; recalled forces travel home and already-suffered losses stay lost.
- Dwarf defenders receive an extra 25% defensive multiplier when defending owned normal tiles.
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
- Post-boss checks:
  - once Home of A falls for the first time, `upgradesUnlockedAt` is set on the current cycle;
  - `megaFortressDestroyCount` tracks how many times the boss has already fallen this cycle;
  - all player fortresses may then buy levels if they can afford the next cost;
  - later boss kills advance the HP ladder and 24-hour respawn timer.
