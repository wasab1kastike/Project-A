# Race Abilities

> Season 4 active and passive abilities for every race.

Every race has a unique **idle passive** that ticks automatically and an **active ability** you trigger manually. Abilities have cooldowns — they're strategic commitments, not spam-buttons.

---

## Dwarfs

### Passive: Grudge Economy

Declare grudges against enemy fortresses. Grudges generate **bounty points** every tick. Collect bounty as score when the target takes damage.

| Mechanic | Detail |
|----------|--------|
| Max active grudges | 3 (4 with Watchkeepers doctrine) |
| Bounty rate | Tier 1: 2/tick · Tier 2: 5/tick · Tier 3: 12/tick |
| New grudge cost | 500 gold (Tier 1) |
| Upgrade to Tier 2 | 1,000 gold |
| Upgrade to Tier 3 | 2,500 gold |
| Bounty payout | `bountyPoints × (1 + (tier-1) × 0.5)` score |

### Active: Deep Mining

Send a mining expedition into the depths. Returns after 30 minutes with an RNG outcome.

| Mechanic | Detail |
|----------|--------|
| Base cost | 2,000 gold |
| Extra investment | Up to 8,000 more (shifts weights toward better outcomes) |
| Duration | 30 minutes |
| Cooldown | 1 hour |

**Outcomes** (8 total, weighted by investment):

| Outcome | Effect | Weight |
|---------|--------|--------|
| **Rich Vein** | 3,000+ gold | Good, scales with investment |
| **Ore Surge** | 1,500g + 500 food | Good |
| **Battle Runes** | 300g + 3 runes (bonus attack damage) | Good |
| **Faction Seal** | 1 rune (minor) | Neutral |
| **Buried Warband** | Army joins you, costs some gold | Mixed |
| **Cave In** | Lose ~1,500 gold | Bad |
| **Unstable Tunnels** | Lose ~400 gold | Minor bad |
| **Shaft Collapse** | Lose ~2,500 gold | Bad, rare |

---

## Orks

### Passive: Scrap Economy

Combat generates **scrap**. Scrap fuels Boss Orders and Waaagh. Scrap decays 1% per tick if unused.

| Event | Scrap Earned |
|-------|-------------|
| Attack launched | 15 |
| Attack received | 20 |
| Battlefield participation | 25 |
| Per unit killed | 3 |
| Per unit lost | 1 |
| Tile claimed | 50 |

Max scrap: 10,000. Scrap bonus from Waaagh tier: +25% per tier.

### Passive: Waaagh

Waaagh tiers (0-3) grant permanent bonuses. Advance by investing scrap.

| Tier | Invest Cost | Gold Bonus | Army Bonus | Scrap Bonus |
|------|------------|------------|------------|-------------|
| 1 | 500 scrap | +50/tick | +5/tick | +10% |
| 2 | 1,500 scrap | +150/tick | +15/tick | +25% |
| 3 | 4,000 scrap | +300/tick | +30/tick | +50% |

Waaagh decays one tier every 2 hours if not reinforced (cost: 50 × tier scrap).

### Active: Boss Orders

Spend scrap on a 30-minute buff. Only one active at a time.

| Order | Cost | Effect (at Waaagh 0 → 3) |
|-------|------|--------------------------|
| **More Dakka** | 200 scrap | +20% → +75% attack damage |
| **Loot Wagons** | 250 scrap | +30% → +100% loot gold |
| **Patch Da Fort** | 150 scrap | +15% → +60% defense, +10→50 army/tick |

Cooldown: 30 minutes.

---

## Space Murines

### Passive: Convoy Network

Bonuses scale with your active convoy legs (counts legs you own or escort).

| Active Legs | Speed Bonus | Cargo Bonus | Escort Strength |
|-------------|-------------|-------------|-----------------|
| 1-2 | +10% | +5% | — |
| 3-5 | +20% | +12% | +5% |
| 6-8 | +30% | +20% | +12% |
| 9-10 | +40% | +30% | +20% |

Plus: **+15% baseline convoy speed** and **+1 hour trade offer expiry** for all Murines.

### Active: Rapid Response

Emergency recall or reinforce. **3 charges** (4 with Rapid Response doctrine), regenerate 1 charge every 2 hours.

| Action | Army Cost | Effect |
|--------|-----------|--------|
| **Recall Attack** | 5% of recalled units | Abort a single outbound attack — army returns instantly |
| **Reinforce Battlefield** | Free | Join an active battlefield on either side, no travel time |
| **Recall All** | 10% of all outbound units | Abort all outbound attacks — armies return instantly |

Cooldown: 10 minutes (7 min with Rapid Response doctrine).

---

## Unstable Unicorns

### Passive: Reality Flux

Every tick rolls a random event. ~70% boons, 15% neutral, 15% curses.

| Outcome | Chance | Effect |
|---------|--------|--------|
| Glimmer of Gold | 25% | +15 gold |
| Spark of Life | 18% | +8 food, +2 army |
| Whimsy Wind | 12% | +5 gold, +5 food |
| Starfall | 8% | +50 gold, +2 points |
| Reality Echo | 7% | +5 army, +3 points |
| Nothing Unusual | 10% | Nothing |
| Odd Whinny | 5% | +1 gold, +1 food (weird) |
| Sugar Crash | 6% | -5 food, -1 army |
| Glitter Spill | 5% | -10 gold |
| Brief Mortality | 4% | -3 army, -1 point |

### Active: Shattered Reality

**Choose** from 3 outcomes — not random! But each use costs more.

| Use # | Gold Cost |
|-------|-----------|
| 1 | 1,000 |
| 2 | 1,500 |
| 3 | 2,000 |
| 4 | 2,500 |
| n | 1,000 × (1 + (n-1) × 0.5) |

**Outcomes (you pick one):**

| Outcome | Effect |
|---------|--------|
| **Mirror Host** | +500 gold, +300 food, +15 army, +5 points |
| **Prismatic Surge** | +1,200 gold, +10 points |
| **Lucky Gallop** | +100 gold, +100 food, +25 army, +8 points, **grants temporary teleport** |

Cooldown: 2 hours.

### Temporary Teleport

Granted by Lucky Gallop. Jump to **any unoccupied tile** for 10 minutes. Use it or lose it within 1 hour.

---

## Cooldown Reference

| Ability | Cooldown |
|---------|----------|
| Deep Mining (Dwarf) | 1 hour |
| Rune of Grudges (Dwarf) | 5 minutes |
| Boss Order (Ork) | 30 minutes |
| Waaagh Investment (Ork) | Instant (limited by scrap) |
| Rapid Response (Murine) | 10 minutes |
| Shattered Reality (Unicorn) | 2 hours |
