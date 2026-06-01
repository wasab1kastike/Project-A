# Game Design

> Core rules for Project-A Season 4. Everything a player needs to understand the game.

---

## Seasons & Phases

Each season runs through four phases:

| Phase | Duration | What Happens |
|-------|----------|-------------|
| **Registration** | ~48h | Players join, pick names, choose race |
| **Testing** | ~24h | Verify mechanics, finalize strategy |
| **Active** | ~2 weeks | Full gameplay — economy, combat, diplomacy |
| **Resolution** | ~24h | Winner crowned, history archived |

Mid-season joining locks after `joiningLockedAt`. Race can be changed during Registration; locked after Testing starts.

---

## Fortresses

Every player controls one fortress per season. Your fortress is your identity — name, race, location, and all resources.

### Resources

| Resource | How It's Earned | What It's For |
|----------|-----------------|---------------|
| **Gold** | Miners, attacks, trade | Upgrades, abilities, trade |
| **Food** | Farmers, map tiles | Feeds army, trade |
| **Army** | Recruiters, race bonuses | Attacks, defense, standing orders |
| **Points** | Everything above | Leaderboard ranking — win condition |

All resources floor at zero. Starvation (food=0) costs 2% army per tick.

### Workers

You assign workers across four roles:

| Role | Produces | Notes |
|------|----------|-------|
| Miners | Gold | Dwarfs produce more on owned tiles |
| Farmers | Food | — |
| Recruiters | Army | Recruitment queue processes per tick |
| Pressure Workers | Tile pressure | Claims neutral tiles at 600 pressure |

Worker count scales with fortress level. Reassignment is instant but only once per tick.

---

## Map & Tiles

The world is a hex grid. Each tile can be:

- **Neutral** — unclaimed, can be pressured
- **Owned** — claimed by a fortress, generates resources
- **Fortress** — a player's castle occupies this tile
- **Special** — loot camps, Home of A, Dwarf runes

### Tile Pressure (Season 4)

Instead of direct tile attacks, Season 4 uses a pressure system:

1. Assign pressure workers to a neighboring tile
2. Pressure builds each tick (1 per worker)
3. At 600 pressure, if uncontested, the tile flips to your control
4. Pressure decays 10% per hour on unsupported tiles
5. Priorities (`TilePressurePriority`) target specific tiles first

---

## Economy

### Production (per tick)

```
Gold  = miners × baseRate × tileBonus × raceBonus
Food  = farmers × baseRate × tileBonus
Army  = recruiters process the recruitment queue
```

### Upgrades

Castle upgrades improve production, defense, or military strength. Four specialization paths:

| Path | Focus |
|------|-------|
| Points | Score multiplier |
| Food | Food production |
| Military | Army production + attack strength |
| Defense | Fortress HP + defense |

Upgrades cost gold and take time. One upgrade project active at a time.

### Recruitment

Recruiters pull from a recruitment queue (single integer). The queue processes per tick based on recruiter count and race bonuses. Orks produce army faster during Waaagh; Space Murines trade for army efficiently.

---

## Combat

### Direct Attacks

1. Select a target fortress or tile
2. Commit army — sent units travel across the map
3. Travel time depends on distance and race/speed bonuses
4. On arrival, damage is calculated: `army × attackMultiplier × raceBonus`
5. Defender's army and fort HP absorb damage
6. Simultaneous outbound attack cap: `2 + level` (Space Murines: `2 + 2×level`)

### Battlefields (Season 4)

When multiple attackers target the same fortress, a **Battlefield** forms:

- Visible immediately for castle/owned-tile battles
- Casualties start **1 hour** after first army arrives (`startedAt`)
- Casualties ramp from 100→1000 units/tick after 1h
- Resolves when one side runs out of army
- Reinforcements can join mid-battle
- Home of A and Dwarf rune battlefields skip the 1h delay

### Territory Campaigns

Siege a tile to force a battlefield:

1. Start a **CAMPAIGN** order on a target tile
2. Building phase — progress accumulates each tick
3. **Siege Warning** — 12h warning to defender
4. **Engaged** — battlefield opens on the tile
5. Winner claims the tile

---

## Diplomacy

### Relations

```
NEUTRAL ──propose──→ ALLIANCE_PENDING ──accept──→ ALLIED
                            │                        │
                            └──reject/cancel──→ NEUTRAL
                                                     ├──betray──→ WAR (instant)
                                                     ├──trust_upgrade→ higher tiers
                                                     └──propose_peace──→ PEACE_PENDING

NEUTRAL ──declare_war──→ WAR_PENDING (24h) ──→ WAR
                                                │
                                                └──propose_peace──→ PEACE_PENDING ──accept──→ NEUTRAL
```

### Alliance Trust Tiers

Allies can upgrade trust (0→3). Higher tiers grant:
- Bonus cargo value on trade convoys
- Escrow gold/food pools for mutual defense
- Shared battlefield participation through visible incoming reinforcement marches
- Optional break collateral in gold, food, and army. It is not paid up front; whoever betrays the alliance pays what they can immediately and any shortfall remains visible treaty debt.

### War

- 24-hour warning after declaration (`WAR_PENDING`)
- Casus belli system — justified wars bypass the 24h delay
- Peace proposals require mutual acceptance and may include instant gold, food, army, or tile demands paid by either side on acceptance
- War fronts are automated from the Castle War Room: only ATTACK-mode battalions with troops can be assigned, and active wars evaluate both directions for automatic dispatch.
- Existing tile pressure priorities double as preferred wartime targets when the prioritized tile is enemy-owned and reachable from your territory.
- New troops assigned to battalions stationed away from the castle travel as visible reinforcement marches first; they count as pending capacity but do not become usable battalion size until arrival.
- ALLIANCE-mode battalions automatically support eligible allied defensive battlefields by launching normal incoming reinforcement marches.
- Roads reduce movement ETA for manual attacks, remote battalion reinforcement, guard fortification marches, War Front launches, and allied battlefield support. Roads do not shorten the one-hour PvP preparation delay.

---

## Trade

1. Create a trade offer - select goods (gold, food, army, score points, or one allied tile deed) and recipient
2. Recipient accepts → **Convoy Legs** spawn
3. Convoys travel between fortresses with a fixed six-hour minimum plus road-adjusted map travel
4. On arrival, cargo is delivered and points awarded
5. Convoy legs can be **intercepted** by enemy RAID orders managed from the War Room
6. **ESCORT** orders protect outbound convoys; alliance trust tiers add cargo bonuses

---

## Roads

- Armies and delivered convoys build roads across the hex route they actually used.
- Dirt paths, stone roads, and highways reduce future movement time by 1.15x, 1.3x, and 1.5x on those route tiles.
- Road level is locked into a march when the unit launches; later road growth does not retime units already on the map.
- Road lines on the map show level and crossings, while moving unit popovers show ETA saved when roads helped.

---

## Standing Orders

| Order | Purpose |
|-------|---------|
| **GUARD** | Station army on a tile — defends against pressure and attacks |
| **ESCORT** | Protect a specific convoy leg from raids |
| **RAID** | Intercept enemy convoys on a tile — steal cargo |
| **CAMPAIGN** | Siege a tile to trigger a territory battlefield |

---

## Races

| Race | Style | Unique Mechanic |
|------|-------|----------------|
| **Dwarfs** | Defensive, grudge-driven | Grudge economy + Deep Mining expeditions |
| **Orks** | Aggressive, snowball | Scrap economy + Boss Orders + Waaagh tiers |
| **Space Murines** | Trade, logistics | Rapid Response + Convoy Network bonuses |
| **Unstable Unicorns** | Chaos, unpredictability | Reality Flux passive + Shattered Reality choice |

See [Season 4](season-4.md) for full race ability details.

---

## Winning

Points determine the leaderboard. The fortress with the most points at season end wins. Points come from:

- Economy production (every tick)
- Successful attacks
- Tile claims
- Battlefield victories
- Trade deliveries
- Race ability bonuses
- Loot camps and Home of A kills
