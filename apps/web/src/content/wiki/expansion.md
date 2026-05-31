# Expansion

> Claiming tiles, pressure, and territory control.

---

## Pressure System

Assign **pressure workers** on the Castle → Economy tab. Each worker generates 1 pressure per tick on priority targets.

**Claiming a tile:** When your pressure on a neutral tile reaches 600, the tile becomes yours and you earn 5 bonus points. If multiple fortresses are pressuring the same tile, the highest pressure wins. Ties result in no claim.

**Decay:** Unsupported pressure decays at 10% per hour. Maintain pressure workers to keep advancing.

## Ownership Pressure

Owned tiles have **ownership pressure** (0-600) that decays each tick (-2, halved by guards). Pressure workers maintain it (+4 per worker/tick). Low ownership pressure makes tiles vulnerable:

| Pressure | Status |
|----------|--------|
| 400-600 | Firmly held |
| 200-400 | Stable |
| Below 200 | ⚠️ Warning — at risk |
| 0 | Lost — tile becomes neutral |

## Pressure Heatmap

The map shows ownership pressure as a color gradient:
- **High pressure**: Strong race color dominance (blue/green/gold/purple)
- **Low pressure**: Subtle race tint, tile looks almost neutral
- **Neutral tiles under pressure**: Subtle wash of the pressuring race's color

This lets you see at a glance which tiles are vulnerable and where expansion is happening.

## Territory Campaigns

Campaigns are advanced expansion tools that commit army to claim enemy tiles. They require an active war border and progress through phases: BUILDING → SIEGE_WARNING → ENGAGED → RESOLVED.

## Tile Bonuses

See [Economy](economy) for per-biome resource and point income. Road-connected tiles grant +1 point/tick.
