# Game Design

## Rules v1

- Max 30 active players
- Unlimited spectators
- One fortress per player
- Fortress has:
  - name
  - owner
  - current action
  - points
  - target
  - map position
  - unit sprite variant
- Attack launches one new visible unit each eligible tick while ATTACK stays active
- Attack has no point cost at launch
- Base attack deals up to 2 points of target damage on impact
- Attack travel time is distance-based, using the default unit speed
- Rename costs 10 points
- Points never go below zero
- Global chat with timestamps
- Chat rate limit: 6 messages per minute per user
- Top 3 leaderboard visible
- Cycle timer: 72h
- Player action persists while offline
- Castle upgrades unlock for every active player once Home of A falls for the first time in a cycle
- Castle levels cost 100 / 300 / 600 / 1000 points
- Each castle level adds +1 growth per grow tick and +2 attack damage
- The fortress that first destroys Home of A gets 500 points and 1 free castle level
- Home of A respawns after each destroy with +1000 max HP and +500 destroy reward each time
- Map positions reshuffle after every Home of A destroy, but the crown stays with the first slayer

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
  - this replays every due minute and refreshes battlefield, leaderboard, and history state.
- Post-boss upgrade checks:
  - once Home of A falls for the first time, `upgradesUnlockedAt` is set on the current cycle;
  - `megaFortressDestroyCount` tracks how many times the boss has already fallen this cycle;
  - all player fortresses may then buy levels if they can afford the next cost;
  - the first slayer gets one free level immediately, up to the normal level cap;
  - later boss kills escalate HP and reward, but do not grant more free levels or move the crown.
