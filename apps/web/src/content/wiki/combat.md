# Combat

> How battles work in Season 4.

---

## Auto-War

Combat is automated. When you declare war:

1. **Front auto-created** — a war front opens against the enemy
2. **Battalions dispatch** — idle battalions are committed to attack
3. **Units march** — visible on the map, following roads
4. **Battlefield forms** — on arrival, combat begins
5. **Resolution** — casualties each tick until one side runs out

**Aggression stance** controls how much of each battalion is committed:
- **Cautious**: 30%
- **Balanced**: 60% (default)  
- **Aggressive**: 100%

## Battlefield Mechanics

| Phase | What Happens |
|-------|-------------|
| **March** | Units travel tile-by-tile (visible on map) |
| **Arrival** | Battlefield created at target fortress |
| **Combat** | Both sides lose units each tick |
| **Resolution** | One side reaches 0 army → winner determined |

**Guards** on the defender's tiles add to their army. **Kills** track on the leaderboard.

## Battlefield Priority

If you have multiple battlefields, you can prioritize which ones receive reinforcements:
- **Reinforce First** — all available army routes here
- **Normal** — standard priority
- **Low** — only if nothing else needs help

## Damage Formula

```
damage = attackingArmy × tierMultiplier × moraleMultiplier
defense = defendingArmy × defenseMultiplier × guardBonus
```

Higher tier battalions deal more damage and take less. Elite (tier 3) deals 1.6× and has 1.45× defense.

## Campaigns

Campaigns are the legacy siege system. Auto-war now uses direct attacks instead.

| Mechanic | Detail |
|----------|--------|
| Progress | Army + pressure workers build progress |
| Threshold | 3,600 to trigger siege warning |
| Warning | 12-hour response window |
| Siege | Battlefield opens after warning |

---

## Fatigue

After combat, battalions become fatigued. Fatigued battalions fight at -25% effectiveness. Recovery takes:
- **Skirmish**: 10 minutes
- **Full battle**: 30 minutes

Rotate battalions to keep fresh troops on the front.
