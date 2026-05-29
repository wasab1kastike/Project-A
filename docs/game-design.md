# Game Design

## Rules v1

- Max 30 active players
- Unlimited spectators
- One fortress per player
- Fortress has:
  - name
  - owner
  - gold, food, active army, and recruitment queue
  - worker assignments for miners, farmers, recruiters, and pressure
  - race and castle specializations
  - owned tiles and active battle participation
  - map position
  - unit sprite variant
- Gold is the main spend currency for recruitment, upgrades, and renames
- Points determine season victory and are earned from live point sources for the cycle ruleset
- Recruitment is order-based: players pay 1 gold per unit up front, and recruiters process the queue over future ticks
- Recruiters do not passively create army without a queued order
- Active army consumes 0.01 food per unit per tick, rounded down when persisted by the live tick
- If food cannot cover active-army upkeep, food falls to zero and active army loses 2% that tick
- Queued army does not consume food upkeep until it completes and joins active army
- Attack travel time is distance-based, using the default unit speed
- Direct attacks and battlefield reinforcements count against simultaneous outbound attack limits
- Rename costs 10 gold during active play
- Gold, food, points, and army never go below zero
- Global chat with timestamps
- Chat rate limit: 6 messages per minute per user
- Legacy cycles retain their prior title categories and buffs for historical compatibility.
- In `SEASON_4`, the Top 3 leaderboard categories are Points, Territory, PvP Kills, Courier, and Privateer.
- Season 4 titles are prestige-only and provide no gameplay multipliers.
- Season 4 timer: registration and pretesting accept new players and race selection while the redesign is verified; the completed community wish vote is archived and no longer part of the live lobby
- Player action persists while offline
- Castle upgrades are available during gameplay and use gold
- Castle levels cost 500 / 1500 / 3000 / 5000 / 7500 / 10500 / 14000 / 18000 / 22500 gold
- Each castle level adds +1 growth per grow tick and +2 attack damage
- `Cycle.ruleset` distinguishes `LEGACY` historical gameplay from the `SEASON_4` redesign; new cycles use `SEASON_4` once released.
- In `SEASON_4`, the former Home of A center tile is an inaccessible monument with no spawn, attack, fortification, buff, or reward behavior.
- In `SEASON_4`, loot camps and active race abilities are not live gameplay; their prior-season records remain available for historical reports.
- Battle-log badges count unread/new reports only, not total historical entries
- Legacy history may display Dwarf Deep Mining or Unicorn Shattered Reality outcomes; these mechanics cannot be activated in `SEASON_4`.

## Leaderboard titles

- In `SEASON_4`, Crown Accountant, Landlord, Butcher, Courier, and Privateer rank points, normal territory, PvP kills, delivered base convoy cargo value, and intercepted stolen cargo value respectively. They grant no buffs.
- The legacy title behavior below remains readable for prior rulesets only:
- Crown Accountant is the points leader and receives +10% points from tile income.
- Butcher is the units-killed leader and receives +10% attack power only.
- Landlord is the current normal-tile leader and receives +10% tile resource income.
- Goblin Bonker is the loot-camp destruction leader and receives +25% loot-camp rewards.
- Loot Lord is the player-castle resources-stolen leader and receives +10% stolen castle gold, food, and score points.
- Units killed come from direct attacks and battlefield losses; Home of A HP damage does not count.
- Historical Goblins Killed values count final blows on legacy loot camps, not every defending unit killed there.
- Resources stolen count only gold, food, and score points taken from real player castles. Loot camps, Home of A, tile income, and generated kill rewards do not count.

## Economy & recruitment

- Miners produce gold each tick, affected by race and Mine specialization bonuses.
- Farmers produce food each tick, affected by race and Food specialization bonuses.
- Recruiters process the fortress `recruitmentQueue` each tick; capacity starts at 1 unit per recruiter per tick and receives race/specialization modifiers.
- A recruitment order is rejected unless the player has selected a race, the cycle is playable, the unit count is a positive integer, and the fortress can afford the full gold cost.
- Completed recruited units are added to active army at the tick boundary.
- Food upkeep is charged only against active army after production for that tick; newly completed recruited units start counting for upkeep on later ticks.
- If food cannot cover the full active-army upkeep, food bottoms out at zero and active army loses 2% that tick.

## Tiles & battlefields

- Desktop and mobile controls both support inspecting tiles directly from the battlefield map.
- Neutral spawnable tiles can be prioritized for pressure only if they connect to the player's castle tile or existing owned territory.
- Pressure workers add pressure to prioritized legal border tiles each tick.
- A neutral tile is automatically claimed at 600 pressure when one fortress leads without a tie; unsupported pressure loses 10% per completed hour.
- The center monument cannot receive expansion pressure, be fortified, or be attacked in `SEASON_4`.
- Owned tiles are contested through battlefield attacks and can transfer ownership when the battlefield resolves.
- Players can fortify owned normal tiles by sending idle army that travels to the tile and becomes a persistent non-decaying garrison until recalled or killed.
- Players can join an active battlefield as attacker or defender if they have idle army and are not violating same-side/conflicting-side restrictions.
- Reinforcements are represented by `AttackUnit` rows and now obey the same outbound attack cap as direct attacks.
- Player castle and owned-tile battlefields are visible immediately, but casualty resolution starts one hour after the first attacking army arrives.
- Battlefield casualties apply every tick and ramp from 100 total units per tick to 1000 after one hour.
- Battlefields resolve only when one side runs out of army; high progress no longer triggers a separate instant combat roll.
- Reinforcements that arrive after a battlefield has resolved return home intact.
- Players can partially recall their own remaining active battlefield army or won-tile garrisons; recalled forces travel home and already-suffered losses stay lost.
- Dwarf defenders receive an extra 25% defensive multiplier when defending owned normal tiles.
- Battlefield resolution is applied after fortress economy persistence in the tick, preventing stale economy writes from overwriting loot, casualty, reward, or ownership results.

## Season 4 politics pretesting

- The `/politics` page supports war warnings, peace proposals, and bilateral alliances during Season 4 pretesting.
- Neutral fortresses may propose an alliance. Acceptance creates Trust I and escrows `2,000 gold + 2,000 food` from each party.
- Trust upgrades require acceptance from both parties: Trust II holds `10,000 gold + 10,000 food` from each fortress, and Trust III holds `30,000 gold + 30,000 food`.
- Pending alliance and trust proposals can be withdrawn by the proposer or rejected by the recipient.
- Neutral and allied fortresses may exchange bilateral offers containing gold, food, and army from `/politics`; hostile and pending political states block new or accepted offers.
- Accepting an offer commits cargo into one independent convoy leg per non-empty direction. A leg takes at least six hours plus base map travel time and cannot be accepted if it would arrive after gameplay closes.
- Delivered convoy points use base value only: `gold + food + (2 * army)`, awarding `floor(value / 1000)` points split between both parties with odd points going to the sender.
- Trust I, II, and III add `10%`, `15%`, and `25%` delivered gold and food on allied convoys; bonus cargo and army do not increase score.
- If a convoy pair becomes enemy or enters war before arrival, resource cargo is seized by its intended receiver without score or alliance bonus.
- Scored convoy legs, with base cargo value of at least `1,000`, can be escorted by their sender and intercepted once by a standing raid order watching either contracting fortress.
- An interception uses committed raid army against assigned escort army; survivors from an escort return after the encounter while surviving raid army remains deployed for later eligible convoys.
- A successful interception awards the raider half of the convoy cargo, destroys the rest, and replaces normal delivery points and alliance bonuses with points from stolen base cargo.
- Guard orders supply covert detection power. A detected raid exposes the raider, changes the pair to enemy, and grants the detecting fortress 24 hours of casus belli.

## Season 4 tile deeds

- Allied fortresses may include one tile deed per trade offer alongside gold, food, and army cargo.
- An offer may contain at most one tile deed sent in either direction.
- Only allied fortresses may offer or accept tile deeds. Neutral cargo trading continues unchanged.
- A deed may target one owned normal tile only. The Home of A monument, fortress home tiles, tiles in active battlefield/campaign conflict, and active rotating objective tiles cannot be transferred.
- Both territory networks must remain connected after transfer: the receiver must gain a tile connected to its territory, and removing the tile must not disconnect any of the sender's remaining owned tiles from its castle.
- Acceptance creates a convoy leg for the deed sender. Existing convoy travel time, escort allocation, raid detection, and route visibility apply.
- A deed-only convoy is eligible for escort and raid interception even when movable cargo value is below the normal scored-convoy threshold.
- On successful delivery, tile ownership transfers atomically with the leg's surviving movable cargo.
- On successful interception, the deed is destroyed and tile ownership stays with the seller.
- If the allied parties become hostile before arrival, the deed is cancelled and the tile stays with the seller.
- Tile deeds carry no direct score value and do not increase Courier or Privateer cargo scoring.
- Revalidation of ownership, reservation, alliance status, conflict state, and both connectivity constraints occurs at delivery.
- Betraying an ally starts war immediately. The harmed fortress receives its own escrow back plus the betrayer's escrow.
- A detected covert raid records the attacker as an enemy and grants the victim 24 hours to invoke casus belli for immediate war.
- Pressure pacing, the Politics & Trade page, and alliance actions are gated to `SEASON_4` cycles; legacy history remains unaffected.

## Season 4 campaigns and guards

- Season 4 owned-tile conquest starts only through a `CAMPAIGN` standing order on an active-war connected enemy border tile; manual PvP tile attacks and ordinary reinforcements are not available.
- Castle `Overview` summarizes pressure momentum and Castle `Operations` summarizes standing army commitments; Battlefield and Politics remain the order-creation surfaces.
- A campaign commits army immediately and generates progress each tick from `pressure workers + min(floor(committed army / 100), pressure workers)`.
- At `14,400` progress, the campaign opens a visible siege with a 12-hour response window before automated battlefield casualties begin.
- `GUARD` orders commit army to owned normal tiles and join an incoming siege as defenders; guards can be recalled before they enter combat.
- Peace or a lost war/target condition cancels an unengaged campaign and returns its committed army.

## Season 4 racial skill trees

- Each race has 3 unique paths, each path has 5 tiers.
- Skill points earned from castle levels (+1 per level) and owned territory (+1 per 3 tiles). Max 12 points.
- All 15 tiers remain visible, but only 12 total points can be spent across the tree.
- Investing in a tier unlocks all rewards at that tier, which may replace previous tier values.
- Tiers alternate small buffs (+population, +pressure%) with major capstones (Runic Wards, Orbital Drop, Mirror Host, etc.).
- See `apps/web/src/lib/game/race-skill-tree.ts` for complete path definitions.

## Season 4 standing doctrines (retired)

> Skill trees now replace doctrines as the primary race progression system. The doctrine tab has been removed from the Castle page.

- Player fortresses choose one doctrine from their race on the Castle page. Changes have a 12-hour cooldown.
- Doctrine effectiveness is `10% / 20% / 30%` at favored-biome territory tiers `3 / 6 / 9`.
- Dwarfs choose `Holdfast` for guard/garrison defense or `Watchkeepers` for guard detection.
- ORKS choose `Marauders` for raids and intercepted cargo or `Siegebreakers` for campaign army buildup.
- Space Murines choose `Convoy Command` for escorts or `Rapid Response` for guard defense and campaign army buildup.
- Unstable Unicorns choose `Glitter Frontier` for favored-terrain neutral pressure or `Veiled Network` for covert raid evasion.
- Doctrines do not change alliance bonuses, the 600 neutral pressure threshold, the 14,400 siege threshold, or the campaign army cap.

## Spawn & map fairness

- Spawn selection only uses valid spawn hexes (`HEX_SPAWN_TILES` plus runtime `isPointNearSpawnHex` checks).
- Spawn placement is deterministic for a given explicit seed (for replay and server reconciliation).
- Candidate spawn pools are shuffled with a seeded PRNG, then selected with distance-aware acceptance to reduce clustering.
- Spawn assignments enforce uniqueness by persisted `mapX:mapY` coordinates.
- Spawn math keeps tile precision during selection and rounds only when positions are persisted to storage.

## Tick Ops Runbook

- Render production expects the `project-a-game-tick` cron job to run every minute from [`render.yaml`](C:/Users/arto.askala/Documents/project-a/Project-A/render.yaml).
- Season 4 activation is held during pretesting unless `SEASON_4_ACTIVATION_ENABLED=true`; once acceptance passes, enable it and use the existing admin cycle transition to activate deliberately.
- Check tick freshness from the home HUD or admin dashboard:
  - `ok` means the latest processed minute is current enough for normal play.
  - `lagging` means the game is behind and player-visible updates may feel slow.
  - `stalled` means point growth, attack impacts, and new launches can stop progressing until recovery runs.
- Recovery stays admin-controlled:
  - open the admin dashboard;
  - use `Replay missed ticks now`;
  - this replays every due minute and refreshes battlefield, battle log, leaderboard, and history state.
- Legacy boss records and reporting remain preserved for resolved prior seasons; no Season 4 runtime should create new boss or loot-camp activity.
