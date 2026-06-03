# Game Design

> Core rules for Project-A Season 4. Everything a player needs to understand the game.

---

## Seasons & Phases

Each season runs through four phases:

| Phase | Duration | What Happens |
|-------|----------|-------------|
| **Registration** | ~48h | Players join, pick names, choose race |
| **Testing** | ~24h | Verify mechanics, finalize strategy |
| **Active** | ~2 weeks | Full gameplay — economy, combat, diplomacy |
| **Resolution** | ~24h | Winner crowned, history archived |

Mid-season joining locks after `joiningLockedAt`. Race can be changed during Registration; locked after Testing starts.

---

## Fortresses

Every player controls one fortress per season. Your fortress is your identity — name, race, location, and all resources.

### Resources

| Resource | How It's Earned | What It's For |
|----------|-----------------|---------------|
| **Gold** | Miners, attacks, trade | Upgrades, abilities, trade |
| **Food** | Farmers, map tiles | Feeds army, trade |
| **Army** | Recruiters, race bonuses | Attacks, defense, standing orders |
| **Points** | Everything above | Leaderboard ranking — win condition |

All resources floor at zero. Starvation (food=0) costs 2% army per tick.

### Workers

You assign workers across four roles:

| Role | Produces | Notes |
|------|----------|-------|
| Miners | Gold | Dwarfs produce more on owned tiles |
| Farmers | Food | — |
| Recruiters | Army | Recruitment queue processes per tick |
| Pressure Workers | Tile pressure | Claims and holds nearby neutral tiles; 8 normal tiles are free, then each assigned worker supports two more before skill and race bonuses |

Worker count scales with fortress level. Reassignment is instant but only once per tick.

---

## Map & Tiles

The world is a hex grid. Each tile can be:

- **Neutral** — unclaimed, can be pressured
- **Owned** — claimed by a fortress, generates resources
- **Fortress** — a player's castle occupies this tile
- **Special** — loot camps, Home of A, Dwarf runes

### Tile Pressure (Season 4)

Instead of direct tile attacks, Season 4 uses a pressure system:

1. Assign pressure workers to expansion
2. Pressure builds each tick (1 per worker)
3. At 600 pressure, if uncontested, a castle-adjacent tile flips to your control
4. Each ring beyond castle-adjacent adds 10% required pressure, capped at double the base threshold
5. Pressure decays 10% per hour on unsupported castle-adjacent tiles, plus 2% per farther ring, capped at 30% per hour
6. A fortress can maintain 8 claimed normal tiles without pressure workers, then two more normal tiles per assigned pressure worker before skill and race bonuses. Pressure skill bonuses increase the worker-supported capacity, and Dwarfs receive a racial holding bonus.
7. Free capacity means free to maintain after claiming; neutral tiles still need pressure to flip.
8. If a fortress owns more normal tiles than its tile capacity allows, those owned tiles lose ownership pressure and eventually become neutral at 0.
9. The priority queue automatically stays filled while the fortress is below its tile capacity, starting at three queue slots and expanding through skills. Pressure goes to the first legal neutral tile in queue order, then the next if the earlier tile is claimed or invalid.
10. When multiple fortresses pressure the same tile, the winner is chosen by effective pressure: raw pressure adjusted by each castle's distance-based threshold. Closer castles need less raw pressure to win a contest, but farther castles can still win by investing more.
11. Queued priorities can include reachable non-allied owned tiles. During war, those same enemy-owned priorities also guide automated War Front target selection. Hostile pressure on owned tiles is distance-adjusted, so closer attackers disrupt ownership faster and farther attackers disrupt it slower. Automatic refill only chooses neutral expansion targets.

---

## Economy

### Production (per tick)

```
Gold  = miners × baseRate × tileBonus × raceBonus
Food  = farmers × baseRate × tileBonus
Army  = recruiters process the recruitment queue
```

### Upgrades

Castle upgrades improve production, defense, or military strength. Four specialization paths:

| Path | Focus |
|------|-------|
| Points | Score multiplier |
| Food | Food production |
| Military | Army production + attack strength |
| Defense | Fortress HP + defense |

Upgrades cost gold and take time. One upgrade project active at a time.

### Recruitment

Recruiters refill commissioned battalions each tick based on recruiter count and race bonuses. Full battalions and the max army ceiling stop new recruits until the player expands or commissions more battalion room. Existing oversized battalions are not trimmed by the ceiling. Orks produce army faster during Waaagh; Space Murines trade for army efficiently.

---

## Combat

### Direct Attacks

1. Select a target fortress or tile
2. Commit army — sent units travel across the map
3. Travel time depends on distance and race/speed bonuses
4. On arrival, damage is calculated: `army × attackMultiplier × raceBonus`
5. Defender's army and fort HP absorb damage
6. Simultaneous outbound attack cap: `2 + level` (Space Murines: `2 + 2×level`)

### Battlefields (Season 4)

When multiple attackers target the same fortress, a **Battlefield** forms:

- Visible immediately for castle/owned-tile battles
- Casualties start **1 hour** after first army arrives (`startedAt`)
- Casualties ramp from 100→1000 units/tick after 1h
- Resolves when one side runs out of army
- Reinforcements can join mid-battle
- Home of A and Dwarf rune battlefields skip the 1h delay

### Territory Campaigns

Siege a tile to force a battlefield:

1. Start a **CAMPAIGN** order on a target tile
2. Building phase — progress accumulates each tick
3. **Siege Warning** — 12h warning to defender
4. **Engaged** — battlefield opens on the tile
5. Winner claims the tile

---

## Diplomacy

### Relations

```
NEUTRAL ──propose──→ ALLIANCE_PENDING ──accept──→ ALLIED
                            │                        │
                            └──reject/cancel──→ NEUTRAL
                                                     ├──betray──→ WAR (instant)
                                                     ├──trust_upgrade→ higher tiers
                                                     └──propose_peace──→ PEACE_PENDING

NEUTRAL ──declare_war──→ WAR_PENDING (24h) ──→ WAR
                                                │
                                                └──propose_peace──→ PEACE_PENDING ──accept──→ NEUTRAL
```

### Alliance Trust Tiers

Allies can upgrade trust (0→3). Higher tiers grant:
- Bonus cargo value on trade convoys
- Escrow gold/food pools for mutual defense
- Shared battlefield participation through visible incoming reinforcement marches
- Optional break collateral in gold, food, and army. It is not paid up front; whoever betrays the alliance pays what they can immediately and any shortfall remains visible treaty debt.

### War

- 24-hour warning after declaration (`WAR_PENDING`)
- Casus belli system — justified wars bypass the 24h delay
- Peace proposals require mutual acceptance and may include instant gold, food, army, or tile demands paid by either side on acceptance
- War Room battalions use four player-facing jobs: RESERVE, GUARD, ATTACK, and ALLIANCE. The older stance layer is hidden and normalized by the server.
- Battalion slot capacity is based on the Military building level, plus skill and extra-slot bonuses. The Castle roster displays used slots as `active/limit` battalions.
- Idle battalions roam owned tiles on the map until their job triggers: RESERVE stays near the castle core, GUARD patrols owned borders, ATTACK launches through war fronts, and ALLIANCE supports allied battlefields.
- Battalions do not heal passively. Damaged battalions are refilled by assigning recruiters and training new members; new battalions are commissioned manually.
- War fronts are automated from the Castle War Room: only ATTACK-mode battalions with troops can be assigned, and active wars evaluate both directions for automatic dispatch.
- Existing tile pressure priorities double as preferred wartime targets when the prioritized tile is enemy-owned and reachable from your territory.
- New troops assigned to battalions stationed away from the castle travel as visible reinforcement marches first; they count as pending capacity but do not become usable battalion size until arrival.
- ALLIANCE-mode battalions automatically support eligible allied defensive and attacking battlefields by launching normal incoming reinforcement marches. War Room policy toggles choose whether those battalions join allied attacks, defend allies, or both; the battalions assigned to ALLIANCE mode determine the available army.
- War Room shows allied battlefield troop breakdowns by side, including each fortress' committed/remaining army and incoming reinforcement army.
- If two allies become hostile to each other, alliance support for that conflict pauses until the player chooses which alliance to keep. The abandoned alliance becomes NEUTRAL with no betrayal marker, collateral payment, collateral debt, or escrow payout.
- Roads reduce movement ETA for manual attacks, remote battalion reinforcement, War Front launches, and allied battlefield support. Roads do not shorten the one-hour PvP preparation delay.

---

## Trade

1. Create a trade offer - select goods (gold, food, army, score points, or one allied tile deed) and recipient
2. Recipient accepts → **Convoy Legs** spawn
3. Convoys travel between fortresses with a fixed six-hour minimum plus road-adjusted map travel
4. On arrival, cargo is delivered and points awarded
5. **ESCORT** orders protect outbound convoys; alliance trust tiers add cargo bonuses
6. Convoy raid orders are temporarily disabled while War Room focuses on battlefronts, battalions, and recruitment

Each convoy leg is one trade wagon run. A fortress can run **3 active outbound wagons** by default, with skill nodes able to raise that limit. A wagon run's total **gold plus food** capacity comes from the sender's Trade Wagon building: **100 / 500 / 1,000 / 2,000 / 3,500 / 5,000 / 7,500 / 10,000 / 15,000 / 20,000** from levels 0-9, before skill capacity bonuses. Larger accepted trades queue sequential runs and use free outbound wagon slots as they become available. Army, score points, nuke components, and one eligible allied tile deed ride with the first run for that direction and do not count against that resource cap.

Successful non-hostile deliveries add a **5% gold and food delivery bonus**. Allied trust increases that total bonus to **15% / 20% / 30%** for Trust I / II / III, and skill nodes can improve trade profit further. Delivery bonuses do not add army, score points, nuke components, or extra trade score.

---

## Nukes

Season 4 includes a daily nuke-component race:

- A global bidding round opens every day at **14:00 Europe/Helsinki** and closes the next day at **12:00 Europe/Helsinki**.
- Fuel is won with the highest gold bid, Rocket with the highest food bid, and Wrath of A with the highest idle-army bid.
- Bids are private while the round is live. Only your own committed bids are shown.
- All bids are spent immediately, including losing bids. Ties go to the earliest bid.
- Components can be stockpiled without a one-per-kind cap and traded through normal convoy offers.
- Launching consumes one Fuel, one Rocket, one Wrath of A, and **250,000 gold**.
- A nuke can target another real player fortress only.
- The target loses 2 castle/building levels, floored at 0, and half of active persisted army up to a maximum of 100,000 army removed.

---

## Roads

- Armies and delivered convoys build roads across the hex route they actually used.
- Dirt paths, stone roads, and highways reduce future movement time by 1.15x, 1.3x, and 1.5x on those route tiles.
- Road level is locked into a march when the unit launches; later road growth does not retime units already on the map.
- Road lines on the map show level and crossings, while moving unit popovers show ETA saved when roads helped.

---

## Standing Orders

| Order | Purpose |
|-------|---------|
| **ESCORT** | Protect a specific outbound convoy leg |
| **CAMPAIGN** | Siege a tile to trigger a territory battlefield |

Manual GUARD orders and RAID orders remain in historical data but are disabled for new play. Battalion GUARD mode is active for owned border patrols. Active legacy GUARD and RAID orders are returned by the tick runner.

---

## Races

| Race | Style | Unique Mechanic |
|------|-------|----------------|
| **Dwarfs** | Defensive, grudge-driven | Grudge economy + Deep Mining expeditions |
| **Orks** | Aggressive, snowball | Scrap economy + Boss Orders + Waaagh tiers |
| **Space Murines** | Trade, logistics | Rapid Response + Convoy Network bonuses |
| **Unstable Unicorns** | Chaos, unpredictability | Reality Flux passive + Shattered Reality choice |

See [Season 4](season-4.md) for full race ability details.

### Skill Specializations

Each race has three 8-node skill paths: Economy, Territory, and Military. Players can earn up to 12 skill points, so one full path still leaves 4 points for a secondary path. Skill points arrive at castle level 3, then every 2 castle levels, plus 1 point per 5 owned normal tiles.

- Economy paths improve food/gold output, reduce army upkeep, add expansion priority slots, and improve trade wagon capacity, active wagon count, and trade profit.
- Territory paths improve pressure, tile defense, and neutral claim thresholds.
- Military paths improve recruitment, Military-building battalion slot capacity, battalion size, and promotion costs. Battalion promotions use flat per-tier gold costs, and battalion max-size capacity changes are free within tier caps.
- Nodes 4 and 8 are the main build-changing unlocks; the nodes between them are smaller ramp bonuses.
- Players can respec one point from the highest unlocked node in a branch for 25,000 gold.

---

## Winning

Points determine the leaderboard. The fortress with the most points at season end wins. Points come from:

- Economy production (every tick)
- Successful attacks
- Tile claims
- Battlefield victories
- Trade deliveries
- Race ability bonuses
- Loot camps and Home of A kills
