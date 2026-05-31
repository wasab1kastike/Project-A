# Army & War

> Battalions, auto-war, guards, and combat in Season 4.

---

## Battalions

Battalions are your named, persistent army groups. Each has a size, tier, XP, and status.

### Battalion Slots

| Fortress Level | Slots |
|---------------|-------|
| 1 | 3 |
| 3 | 4 |
| 5 | 5 |
| 7 | 6 |
| 9+ | 7 |

Plus bonuses from skills and purchased slots.

### Battalion Tiers

| Tier | Damage | Defense | Max Size | Promotion Cost |
|------|--------|---------|----------|----------------|
| Recruit | 1.0× | 1.0× | 500 | — |
| Regular | 1.15× | 1.10× | 5,000 | 1,500g + 5g/unit |
| Veteran | 1.35× | 1.25× | 15,000 | 5,000g + 5g/unit |
| Elite | 1.60× | 1.45× | 50,000 | 15,000g + 5g/unit |

Battalions gain XP from combat. Surviving units earn XP based on enemy tier.

### Battalion Status

- **Guarding** (blue): Garrisoned on a tile
- **On front** (orange): Assigned to a war front
- **Resting** (red): Recovering from fatigue
- **Idle** (green): Available at fortress

---

## Auto-War

When you declare war on an enemy:

1. **Front auto-created**: A war front opens automatically
2. **Battalions dispatch**: Idle battalions are automatically committed
3. **Units march**: Visible attack units travel to the enemy
4. **Battlefield opens**: On arrival, combat begins

You can assign specific battalions to specific enemies for multi-front wars.

### Aggression Stance
- **Cautious**: 30% of battalion committed
- **Balanced**: 60% committed (default)
- **Aggressive**: 100% committed

---

## Guards

Guard % sets how much of your army defends your territory.

- **Auto-distributed**: Guards spread across owned tiles by priority
- **Battlefield defense**: Guards auto-join defender side when attacked
- **Tile preservation**: Guards slow ownership decay by 50%
- **Visible on map**: Guard units appear as markers on tiles

Set guard % in Castle → War Room.

---

## Recruitment

Army grows passively each tick:

| Worker | Production |
|--------|-----------|
| Recruiters | 3 army/tick each |
| Miners | 3 gold/tick each |
| Farmers | 2 food/tick each |

Set a **max army cap** to control growth. Reserves show unassigned army.

---

## Combat

Battles resolve automatically:

1. Attack units travel to target
2. On arrival, a **battlefield** forms
3. Both sides take casualties each tick
4. Battle ends when one side runs out of army
5. Winner claims rewards

Guards on the defender's tiles add to their army. Kills track on the leaderboard.

---

## War Room

All army management is in Castle → **War Room** tab:
- Battalion roster with promote/expand/disband
- Guard % slider
- Max army cap
- War front status
- Active campaigns
