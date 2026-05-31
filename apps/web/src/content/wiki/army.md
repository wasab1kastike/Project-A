# Army & War

> Battalions, auto-war, guards, stances, and combat in Season 4.

---

## Battalions

Battalions are your named, persistent army groups. Each has a size, tier, XP, mode, and stance.

### Battalion Slots

| Fortress Level | Slots |
|---------------|-------|
| 1 | 3 |
| 3 | 4 |
| 5 | 5 |
| 7 | 6 |
| 9+ | 7 |

### Battalion Modes

Each battalion has a **mode** that determines its automated behavior:

| Mode | Behavior |
|------|----------|
| 🛡 **GUARD** | Defends your tiles, auto-garrisons, patrols adjacent territory |
| ⚔ **ATTACK** | Auto-dispatches to war fronts, attacks connected enemy tiles |
| 📦 **RESERVE** | Passively heals 2% of max size per tick, excluded from combat losses |
| 🤝 **ALLIANCE** | Auto-reinforces allied battlefields, commits up to 50% of size |

### Battalion Stances

Stances affect combat bonuses and can be changed freely (except FORTIFY and AMBUSH which lock for 1 hour):

| Stance | Effect | Lock |
|--------|--------|------|
| 🏰 FORTIFY | +30% defense, -50% casualties taken | 1h |
| 🚶 PATROL | +25% raid detection, +10% speed, requires garrisoned tile | None |
| 🎯 TRAINING | +1 XP/tick for lowest-tier battalion | None |
| 🗡 AMBUSH | +40% first-round damage, enemies can't retreat | 1h |
| 💤 REST | +5 morale/tick, +2% heal/tick, auto-retreats if attacked | None |
| 🏃 MOBILE | Flat bonuses, freely switchable | None |

### Tiers

| Tier | Max Size | Promotion Cost | Damage/Defense Bonus |
|------|----------|---------------|---------------------|
| Recruit (0) | 500 | — | 1.0× / 1.0× |
| Regular (1) | 5,000 | 1,500 gold | 1.15× / 1.10× |
| Veteran (2) | 15,000 | 5,000 gold | 1.35× / 1.25× |
| Elite (3) | 50,000 | 15,000 gold | 1.60× / 1.45× |

## Auto-War

When at war, ATTACK-mode battalions automatically attack adjacent enemy-owned tiles. No manual attack orders needed.

- **Aggression** controls commit rate: CAUTIOUS (30%), BALANCED (60%), AGGRESSIVE (100%)
- Attack army is capped at defender's army × 2
- Tiles are prioritized by priority markers (if set), then by distance
- Falls back to any connected enemy tile if no priorities set

## Guards

Guard % (set in War Room) determines how much army stays on defense. Guards:
- Auto-garrison your owned tiles
- Slow ownership pressure decay by 50%
- Auto-join defensive battlefields when tiles are attacked

## Casualty Reconciliation

When your fortress loses army in combat, losses are distributed proportionally across active battalions (GUARD, ATTACK, ALLIANCE). RESERVE battalions are excluded from combat losses.

## Recruitment

Recruiters generate new troops each tick. Troops flow into battalions automatically. Set battalion max sizes to control where recruits go. Unassigned troops appear as "Reserves" in your army count.
