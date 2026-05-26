# Season 4 Plan

> The canonical "what Season 4 is" overview. For detailed current rules, see [`docs/game-design.md`](game-design.md). For the launch checklist, see [`docs/season-4-pretesting-release-checklist.md`](season-4-pretesting-release-checklist.md).

Season 4 is a redesign currently shipped on `origin/main` for pretesting, with real activation still intentionally blocked until verification passes. Activation is gated behind `SEASON_4_ACTIVATION_ENABLED=true`.

---

## Core Loop

- Expand through worker-driven **border pressure** instead of manually buying/claiming tiles.
- Neutral tiles are claimed at **600 pressure**; neglected pressure decays **10% per hour**.
- The center Home of A tile becomes an **inaccessible monument**.
- Home of A, loot camps, and legacy active race abilities are **removed** from live Season 4 gameplay.

---

## Politics & Trade

A dedicated Politics & Trade system adds alliances, peace, war, trust tiers, and betrayal.

| Feature | Detail |
|---------|--------|
| **Alliance trust tiers** | Trust I: 2,000 gold/food escrow each. Trust II: 10,000. Trust III: 30,000 |
| **Convoys** | Allies and neutrals can send gold, food, and army. Minimum 6h + travel time. Score from delivered base cargo |
| **Allied trade bonuses** | 10% / 15% / 25% delivered gold and food for Trust I / II / III |
| **Betrayal** | Starts war immediately, forfeits escrow to the harmed player |
| **Peace/war** | Declare war with 24h warning. Propose peace with mutual consent |

---

## Conflict

| Mechanic | Detail |
|----------|--------|
| **CAMPAIGN orders** | Territorial conquest against connected enemy border tiles during active war |
| **Siege threshold** | 14,400 progress opens a visible 12-hour warning before casualties begin |
| **GUARD orders** | Defend owned tiles, can detect covert convoy raids |
| **ESCORT orders** | Protect outbound convoy cargo |
| **RAID orders** | Intercept eligible convoys. Steal half the cargo on success |
| **Casus belli** | Detected raiders exposed as enemies, granting 24h window for immediate war |

---

## Races

Each race selects one **passive doctrine**, changeable every 12 hours. Effects scale at 3, 6, and 9 favored-biome tiles (10%/20%/30%):

| Race | Doctrine A | Doctrine B |
|------|-----------|-----------|
| **Dwarfs** | Holdfast — guard/garrison defense | Watchkeepers — guard detection |
| **ORKS** | Marauders — convoy raids and intercepted cargo | Siegebreakers — campaign army buildup |
| **Space Murines** | Convoy Command — escorts | Rapid Response — guard defense and campaigns |
| **Unstable Unicorns** | Glitter Frontier — favored-terrain neutral pressure | Veiled Network — covert raid evasion |

---

## Scoring

Season 4 rankings are **prestige-only**, with no gameplay buffs:

1. **Points**
2. **Territory**
3. **PvP Kills**
4. **Courier** — delivered convoy cargo
5. **Privateer** — intercepted cargo

---

## Launch Status

- **Registration and pretesting** are open in the latest `main` build.
- Pretesting progress is intended to reset before the real season.
- Activation remains gated behind `SEASON_4_ACTIVATION_ENABLED=true` and acceptance testing of:
  - Migrations
  - Politics (alliance, trust, betrayal, war, peace)
  - Convoys (trade offers, travel, scoring, escort/raid interception)
  - Campaigns (buildup, siege warning, battlefield resolution)
  - Doctrines (all 8 variants, 12h cooldown, tier scaling)
  - Scoring (Points, Territory, PvP Kills, Courier, Privateer)
  - Desktop and mobile UI

---

## Key References

| File | Purpose |
|------|---------|
| `docs/game-design.md` | Full current rules — economy, combat, politics, trade, doctrines |
| `docs/season-4-pretesting-release-checklist.md` | Launch checklist — what remains before activation |
| `docs/data-model.md` | Entity relationship reference — all Prisma models and enums |
| `apps/web/src/app/wiki/page.tsx` | Player-facing wiki — rule reference rendered in-app |
