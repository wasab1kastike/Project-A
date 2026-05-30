# Combat

> Attacks, battlefields, territory campaigns, and standing orders.

---

## Direct Attacks

1. Select a target fortress or owned tile
2. Commit army — units travel across the map
3. Travel time = distance ÷ speed (modified by race bonuses)
4. On arrival: `damage = army × attackMultiplier × raceBonus`
5. Defender's army and fortress HP absorb the damage
6. Surviving attacker army returns home

### Attack Caps

You can have **2 + fortress level** simultaneous outbound attacks. Space Murines get **2 + 2×level**.

---

## Battlefields (Season 4)

When multiple attackers target the same fortress, a **Battlefield** forms instead of individual attacks:

| Phase | Timing | What Happens |
|-------|--------|-------------|
| **Visible** | Immediately | Battlefield appears on the map for player castle / owned tile battles |
| **Delay** | 1 hour | Combat casualties start after `startedAt` |
| **Active** | Until resolved | Casualties ramp from 100→1000 units/tick |
| **Resolution** | One side at 0 army | Winner takes loot, score, and bragging rights |

### Joining a Battlefield

Reinforce either side by sending army. You'll be added as an `ATTACKER` or `DEFENDER` participant. Reinforcements join immediately but casualties scale with total army committed.

### Battlefield Scoring

- Participants earn `BATTLEFIELD_REWARD` score events
- The side that initiated the battlefield gets bonus points
- Loot is distributed based on army contribution

### Exceptions

- **Home of A** battlefields skip the 1-hour delay
- **Dwarf Rune** battlefields skip the 1-hour delay
- Reusing an active battlefield does NOT reset `startedAt`

---

## Territory Campaigns

Siege a tile to force a battlefield on it:

| Phase | Duration | What Happens |
|-------|----------|-------------|
| **Building** | Variable | Progress builds per tick from committed army |
| **Siege Warning** | 12 hours | Defender gets advance notice |
| **Engaged** | Until resolved | Battlefield opens on the tile |
| **Resolved** | — | Winner claims the tile |

Start a campaign with the **CAMPAIGN** standing order. Campaigns can be canceled during the Building phase.

---

## Standing Orders

| Order | What It Does |
|-------|-------------|
| **GUARD** | Station army on a tile — defends against pressure and attacks |
| **ESCORT** | Protect a specific convoy leg from enemy raids |
| **RAID** | Intercept enemy convoys — steal cargo mid-transit |
| **CAMPAIGN** | Siege a tile to trigger a territory battlefield |

Orders consume army that stays committed until the order is completed, transferred, or canceled.

---

## Fortress Garrison

Station army on your fortress tiles for passive defense. Garrisoned army:
- Absorbs attack damage before fortress HP
- Doesn't produce or move while stationed
- Can be recalled instantly

---

## Damage Formula

```
baseDamage = attackingArmy × attackMultiplier
attackMultiplier = 1.0 + (upgradeBonus) + (raceBonus) + (bossOrderBuff)
finalDamage = baseDamage × (1 - defenderDefenseBonus)
```

Defender's army absorbs damage first. Remaining damage hits fortress HP. Fortress destroyed at 0 HP — attacker can claim the tile.
