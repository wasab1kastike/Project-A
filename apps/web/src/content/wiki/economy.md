# Economy

> Production, upgrades, scoring, and shops.

---

## Production (Per Tick)

| Resource | Per Worker | Race Bonuses |
|----------|-----------|-------------|
| Gold | 3 / miner | Dwarf +25% from deep mining |
| Food | 2 / farmer | — |
| Army | 3 / recruiter | — |

## Tile Bonuses

Each owned tile generates resources per tick based on its biome:

| Biome | Gold | Food | Army | Points |
|-------|------|------|------|--------|
| Mountains | 4 | 1 | 0 | 3 |
| Coast | 2 | 1 | 0 | 3 |
| Hills | 3 | 0 | 0 | 2 |
| Forest | 1 | 2 | 0 | 2 |
| Plains | 1 | 2 | 0 | 1 |
| Water | 3 | 6 | 0 | 1 |
| Lake | 2 | 2 | 0 | 1 |
| Marsh | 1 | 3 | 1 | 1 |

**Road network bonus:** Each owned tile with a road (level ≥ 1) grants +1 point/tick.

**Tile claim reward:** Capturing a neutral tile awards 5 bonus points.

## Scoring

Points are the win condition. Sources:

| Source | Points |
|--------|--------|
| Tile income | 1-3 per tile/tick (biome-dependent) |
| Road network | +1 per road-connected tile/tick |
| Claiming tiles | +5 per neutral tile captured |
| Combat winner bonus | floor(defenderLosses / 50) |
| Battlefield kills | floor(killReward / 2) per participant |
| Trade delivery | cargoValue / 500 (1.25× for established routes) |
| Convoy interception | stolen cargo / 1000 |
| Loot camps / mega forts | Fixed rewards |
| Buying points | 10 gold → 1 point |

## Upgrades

Fortress upgrades increase level. Each level unlocks battalion slots, increases production, and unlocks specializations.

## Skills

Race-specific skill trees. Earn skill points from castle levels and territory. Skills provide production bonuses, combat buffs, and unique abilities.
