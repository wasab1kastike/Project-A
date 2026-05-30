# Season 4 — Doctrines, Pressure & Race Abilities

> What changed from the Legacy ruleset. Season 4 is active when `Cycle.ruleset = SEASON_4`.

---

## Fortress Doctrines

Each race has two doctrines. Chosen after race selection. Doctrines are **permanent for the season** — no respec.

| Race | Doctrine | Playstyle |
|------|----------|-----------|
| Dwarfs | **Holdfast** | Defensive — stronger fort HP, slower pressure decay on owned tiles |
| Dwarfs | **Watchkeepers** | Grudge-focused — extra grudge slot, faster bounty accrual |
| Orks | **Marauders** | Raiding — bonus loot from attacks, faster scrap generation |
| Orks | **Siegebreakers** | Siege — faster campaign progress, bonus battlefield damage |
| Space Murines | **Convoy Command** | Trade — extra convoy leg capacity, stronger escort strength |
| Space Murines | **Rapid Response** | Reactive — extra Rapid Response charge, shorter cooldown |
| Unicorns | **Glitter Frontier** | Expansion — bonus pressure, cheaper tile claims |
| Unicorns | **Veiled Network** | Chaos — boosted flux boons, reduced curse weight |

---

## Tile Pressure System

Replaces the legacy direct-tile-attack model:

| Mechanic | Detail |
|----------|--------|
| **Pressure Workers** | Assign workers to pressure a neighboring tile |
| **Build Rate** | 1 pressure per worker per tick |
| **Claim Threshold** | 600 pressure flips a neutral tile |
| **Contested Tiles** | If 2+ fortresses pressure the same tile, highest wins |
| **Decay** | 10% per hour on unsupported legal targets |
| **Priorities** | `TilePressurePriority` — mark tiles for focused pressure |

### Ownership Benefits

Owned tiles produce bonus resources for the owner. The more tiles you hold, the stronger your economy — but the harder to defend.

---

## Race Abilities

Every race has a unique active ability and an idle passive mechanic. Abilities have cooldowns (10 min to 2 hours). They're **strategic commitments**, not spam-buttons.

### Dwarfs — Grudge Economy + Deep Mining

**Idle: Grudge Economy**
- Declare grudges against enemy fortresses (max 3 active)
- Grudges generate bounty points per tick (tier 1: 2/tick, tier 2: 5/tick, tier 3: 12/tick)
- Upgrade grudge tiers with gold (500 → 1,000 → 2,500)
- Collect bounty as score when the target is attacked

**Active: Deep Mining**
- Invest gold (2,000 base + up to 8,000 extra) → 30-minute expedition
- 8 possible outcomes (weighted by investment):
  - *Good:* Rich Vein, Ore Surge, Battle Runes, Faction Seal, Buried Warband
  - *Bad:* Cave In, Unstable Tunnels, Shaft Collapse
- Higher investment shifts weights toward positive outcomes
- Cooldown: 1 hour

### Orks — Scrap Economy + Boss Orders

**Idle: Scrap Economy**
- Earn scrap from combat events (attacks, kills, tile claims)
- Scrap decays 1% per tick if unused (max 10,000)
- Waaagh tier (0-3) grants passive bonuses to gold, army, and scrap generation
- Waaagh decays if not reinforced (2-hour decay window)

**Active: Boss Orders**
- Spend scrap to activate a 30-minute buff:
  - **More Dakka** — bonus attack damage (20-75% based on Waaagh tier)
  - **Loot Wagons** — bonus loot gold from attacks (30-100%)
  - **Patch Da Fort** — bonus defense + army production (15-60% / 10-50 units)
- Only one Boss Order active at a time
- Cooldown: 30 minutes

**Active: Waaagh Investment**
- Spend scrap to advance Waaagh tier (500 → 1,500 → 4,000)
- Reinforce current tier to reset decay (50 × tier scrap)

### Space Murines — Rapid Response + Convoy Network

**Idle: Convoy Network**
- Passive bonuses scale with active convoy leg count (1-10 legs)
- Tiers: speed (+10-40%), cargo value (+5-30%), escort strength (+0-20%)
- Base 15% faster convoys for all Murines
- Trade offers last 1 hour longer before expiring

**Active: Rapid Response**
- Emergency recall or battlefield reinforce
- 3 charges, 10-minute cooldown, charges regenerate every 2 hours
- Three actions:
  - **Recall Attack** — abort an outbound attack (5% army loss)
  - **Reinforce Battlefield** — join an active battlefield instantly
  - **Recall All** — abort all outbound attacks (10% army loss)

### Unstable Unicorns — Reality Flux + Shattered Reality

**Idle: Reality Flux**
- Every tick rolls on a 10-outcome table
- ~70% minor boons (gold, food, army, points)
- ~15% neutral (nothing or odd whinny)
- ~15% small curses (lose gold/food/army)
- Keeps the Unicorn experience constantly unpredictable

**Active: Shattered Reality**
- **Choose** from 3 outcomes (not random):
  - **Mirror Host** — bonus army, gold, food
  - **Prismatic Surge** — large gold windfall + points
  - **Lucky Gallop** — army + temporary teleport tile
- Cost escalates with each use: 1,000 × (1 + count × 0.5)
  - Use 1: 1,000g, Use 2: 1,500g, Use 3: 2,000g…
- Cooldown: 2 hours
- Temporary teleport lets you jump to any unoccupied tile for 10 minutes

---

## Trade Redesign

Trade in Season 4 uses convoy legs instead of instant transfers:

1. **Trade Offer** — sender proposes gold/food/army to recipient
2. **Accept** → multiple Convoy Legs spawn (one per line item)
3. **Convoy Legs** travel across the map (duration based on distance)
4. **Arrival** → cargo delivered, points awarded to sender
5. **Interception** — enemy RAID orders can seize cargo mid-transit
6. **Escort** — ESCORT orders protect convoys; alliance trust adds bonuses

### Alliance Trust & Trade

| Trust Tier | Cargo Bonus | Escrow Pool |
|------------|-------------|-------------|
| 1 | +10% | 500g / 500f |
| 2 | +20% | 1,500g / 1,500f |
| 3 | +35% | 3,000g / 3,000f |

---

## Territory Campaigns

New standing order type (`CAMPAIGN`) for sieging tiles:

1. **Building** — progress accumulates each tick from committed army
2. **Siege Warning** — 12-hour warning to defender when progress hits threshold
3. **Engaged** — battlefield opens on the tile
4. **Resolved** — winner claims the tile

---

## Season-Gating

All Season 4 features check `Cycle.ruleset === "SEASON_4"` before enabling. Legacy cycles use the old mechanics. Use the enum value, never string literals.
