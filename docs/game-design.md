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
- Attack launches one visible unit at a time
- Attack has no point cost at launch
- Attack deals up to 2 points of target damage on impact
- Attack travel time is distance-based, using the default unit speed
- Rename costs 10 points
- Points never go below zero
- Global chat with timestamps
- Chat rate limit: 6 messages per minute per user
- Top 3 leaderboard visible
- Cycle timer: 72h
- Player action persists while offline

## Spawn & map fairness

- Spawn selection only uses valid spawn hexes (`HEX_SPAWN_TILES` plus runtime `isPointNearSpawnHex` checks).
- Spawn placement is deterministic for a given explicit seed (for replay and server reconciliation).
- Candidate spawn pools are shuffled with a seeded PRNG, then selected with distance-aware acceptance to reduce clustering.
- Spawn assignments enforce uniqueness by persisted `mapX:mapY` coordinates.
- Spawn math keeps tile precision during selection and rounds only when positions are persisted to storage.
