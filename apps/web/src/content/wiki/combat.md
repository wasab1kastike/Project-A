# Combat

> Battlefields, raids, damage formulas, and scoring.

---

## Auto-War

In Season 4, war is automatic. When at war:
1. ATTACK-mode battalions auto-dispatch to adjacent enemy tiles
2. Units march across the map with visible path animations
3. Battlefields form on arrival
4. Combat resolves automatically each tick

**Aggression** on war fronts controls the commit rate:
- CAUTIOUS: 30% of battalion army
- BALANCED: 60%
- AGGRESSIVE: 100%

Attack army is capped at defender's army × 2.

## Battlefield Indicators

Active battlefields are shown on the map with:
- **Crossed swords** icon (pulsing glow)
- **Army count badges** — attacker (red, left) and defender (blue, right)
- **Progress bar** — colored by momentum (orange=attacker edge, blue=defender edge, gold=even)
- **Intensity glow** — fiercer battles glow brighter red
- **Reinforcement arrows** — ▲ indicators when troops are en route

## Direct Attacks (Raids)

Click an enemy fortress or tile to launch a direct attack. Raids:
- March to the target (visible on map)
- Form a battlefield on arrival (if defended)
- Can be recalled before arrival
- Reward points and loot on victory

## Combat Scoring

| Action | Points |
|--------|--------|
| Winning a raid | floor(defenderLosses / 50) bonus points |
| Battlefield kills | floor(killReward / 2) per winning participant |
| Loot transfer | Zero-sum gold transfer (attacker gains what defender loses) |
| Destroying loot camps | Fixed point rewards |
| Mega fortress damage | Points lost equal to damage dealt |
| Mega fortress kill | Large reward for top contributor |

**Winner bonuses are NOT zero-sum** — the attacker gets extra glory points beyond what the defender loses. This rewards aggression.

## Battlefield Mechanics

- **Casualties** scale with army sizes, buffs, and momentum
- **Reinforcements** can join from either side
- **Territory campaigns** add siege mechanics
- **Alliance reinforcements** auto-commit from ALLIANCE-mode battalions
- **Guards** auto-join defensive battlefields

## Damage Formula

Combat uses attack power vs defense power:
- Attack power = army × (1 + attack buffs) × tier multiplier
- Defense power = army × (1 + defense buffs + tile bonus) × tier multiplier
- If attack > defense: attacker wins, defender loses proportional army
- If defense ≥ attack: defender wins, attacker loses all sent army
- Tie goes to the defender
