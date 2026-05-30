# Economy

> Gold, food, army, and workers. How your fortress grows.

---

## Resources

| Resource | Produced By | Used For |
|----------|------------|----------|
| **Gold** | Miners, attacks, trade, abilities | Upgrades, abilities, trade, grudge upgrades |
| **Food** | Farmers, owned tiles | Feeds army. Starvation (0 food) = 2% army lost per tick |
| **Army** | Recruiters, race bonuses | Attacks, defense, standing orders, battlefields |
| **Points** | Everything | Leaderboard ranking. Most points = win. |

Resources never go below zero.

---

## Workers

Assign workers across four roles. Total workers scale with fortress level. Reassignment is instant but once per tick.

| Role | Produces |
|------|----------|
| **Miners** | Gold per tick |
| **Farmers** | Food per tick |
| **Recruiters** | Process the recruitment queue — army per tick |
| **Pressure Workers** | Pressure on neighboring tiles (Season 4) |

### Production Formula

```
Gold  = miners × baseRate × tileBonus × raceBonus
Food  = farmers × baseRate × tileBonus
Army  = recruiters process recruitment queue
```

Race bonuses:
- Dwarfs: bonus gold from miners on owned tiles
- Orks: bonus army production during Waaagh
- Space Murines: bonus trade value
- Unicorns: Reality Flux random bonuses

---

## Upgrades

Castle upgrades improve your fortress. Four paths:

| Path | What It Improves |
|------|-----------------|
| **Points** | Score multiplier per tick |
| **Food** | Food production rate |
| **Military** | Army production + attack damage |
| **Defense** | Fortress HP + damage reduction |

Upgrades cost gold and time. One upgrade project active at a time. Costs and durations scale with level.

---

## Recruitment

Recruiters process the **recruitment queue** — a running total of pending army orders. Each tick:

1. Recruiters consume gold and food from the queue
2. Army is added to your fortress
3. Orks produce bonus army during Waaagh tiers
4. Space Murines can trade for efficient army delivery

---

## Tiles & Territory

### Owned Tiles

Tiles you control produce bonus resources each tick. More tiles = stronger economy, but harder to defend.

### Claiming Tiles (Season 4)

1. Assign **pressure workers** to a neighboring tile
2. Pressure builds at 1 per worker per tick
3. At **600 pressure**, if uncontested, the tile flips to you
4. Competing pressure from other fortresses delays claims
5. Pressure decays 10% per hour on unsupported tiles

### Tile Priorities

Mark tiles with `TilePressurePriority` to focus your workers' pressure. Unmarked tiles receive pressure only after priorities are satisfied.

---

## Starvation

If your food hits zero:
- Army loses **2% per tick** to starvation
- Production continues but army drains fast
- Keep food positive — trade for it if you must
