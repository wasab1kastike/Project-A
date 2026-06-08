export type PatchNotesRelease = {
  date: string;
  title?: string;
  newFeatures: string[];
  bugFixes: string[];
};

export const PATCH_NOTES_RELEASES: PatchNotesRelease[] = [
  {
    date: "2026-06-06",
    title: "Season 5 passive trees",
    newFeatures: [
      "Season 5 classes now have three passive skill paths each, with effects for catch speed, rarity, trophy weight, inventory, pack pressure, and travel.",
      "Season 5 class passives are now hard-specialized: Monk owns rhythm tempo, Warrior owns trophies and heavy packs, Wizard owns rarity, and Rogue owns travel speed plus quiet packs.",
      "Drunken Monk now has rhythm passives: staying at the same fishing spot can build extra catch tempo and pack-pressure relief.",
      "Retired Warrior now has trophy-focus passives: harder waters can turn Trophy Hunter unlocks into heavier fish and better rarity rolls.",
      "Season 5 fishing XP now raises character levels and grants skill points up to a twelve-point progression budget.",
      "Season 5 map fishing now works on water and coast tiles, with connected water-body pools that can run low, regenerate, and reveal temporary stock details.",
      "Season 5 map fishing now uses the visible hex water as the destination grid: lake, river, coast, and sea tiles are selectable without random F markers, while lava pools and void lakes appear as visible locked targets.",
      "Season 5 water tiles now have deterministic fishing traits like rotten reeds, old planks, deep pockets, warm vents, and void ripples, while connected body stock stays shared.",
      "Season 5 fish are now measured in kilograms instead of centimeters.",
      "Season 5 fishing pools now have fantasy comedy species with stranger coastal, lake, deep-water, and lava catches.",
      "Deep water, lava pools, and void lakes now support higher-risk fishing profiles with level and gear or passive gates.",
      "Season 5 characters now have visible Body, Outfit, Hat, and Rod equipment that changes their map and character-page avatar.",
      "Season 5 character art now uses hybrid fitted bases: each class has a regenerated no-coat body plus waders, raincoat, and mildew greatcoat outfit bases, while hats and rods layer on top.",
      "Fish unloads now pay fish coins, which can buy static shop equipment and one-hour bait sets.",
      "Bait is now a consumable system: Bare Hook is the free baseline, paid bait lasts one hour, and active paid bait cannot be replaced early.",
      "Very rare item hooks can replace a fish catch with an instant equipment unlock; duplicate item hooks convert straight into fish coins.",
      "The Season 5 character Skills tab now groups class passives by path and shows the actual passive math on each node.",
    ],
    bugFixes: [
      "Season 5 skill purchases now have focused regression coverage for wrong-class, locked, duplicate, and unaffordable nodes.",
    ],
  },
  {
    date: "2026-06-03",
    title: "Closer castles push harder",
    newFeatures: [
      "The battlefield map now has a Wishes drawer where active players can submit one anonymous next-season wish and read the other submitted wishes.",
      "Peace offers can now be rejected or answered with a counteroffer before either side accepts the treaty.",
      "Idle stationed battalions now slowly build roads on owned patrol tiles while they are not assigned to fronts or pending reinforcements.",
      "Season 4 pressure contests now use castle proximity: closer castles get stronger effective pressure on contested tiles, while farther castles can still win by investing more raw pressure.",
      "Non-allied pressure on player-owned tiles now persists and disrupts ownership, with closer attackers weakening control faster than distant attackers.",
      "The map pressure readout now shows effective pressure context so proximity advantages are visible during contests.",
      "Castle Economy now lets commanders buy more active outbound trade wagons. Each purchase adds one wagon slot, prices climb after every purchase, and the active wagon cap is 50.",
    ],
    bugFixes: [
      "Enemy-owned pressure priorities no longer require active war; only allied territory blocks pressure targeting.",
      "Expansion auto-pressure now refills with reachable non-allied owned tiles too, instead of only choosing neutral replacements.",
      "Battalion tier promotion costs are now flat per tier instead of scaling with battalion size.",
      "Battalion slot limits now use the Military building ladder consistently, and the Castle roster shows used/available battalion slots.",
    ],
  },
  {
    date: "2026-06-01",
    title: "Treaty desk cleanup",
    newFeatures: [
      "Nukes are now available as the latest season wish: daily private bidding awards Fuel, Rocket, and Wrath of A components from 14:00 to 12:00 Europe/Helsinki.",
      "Completed nukes cost 250,000 gold to launch, consume all three components, and can crater another real player fortress by lowering buildings and cutting active army.",
      "Nuke parts now clearly stockpile: you can hold multiple Fuel, Rocket, and Wrath of A components and launch one completed set at a time.",
      "Nuke components can move through existing trade offers and convoy legs, with small component sprites and a center-tile bidding marker on the map.",
      "Castle Diplomacy now supports peace offers with optional demands from either side.",
      "Alliance proposals can include break collateral; betrayal pays what is available and records unpaid collateral as treaty debt.",
      "Trade offers can now move score points through convoy legs alongside gold, food, army, and allied tile deeds.",
      "Castle War Room is now simplified around battlefronts, battalions, army recruitment, and optional alliance support.",
      "Battalion controls now use four jobs only: RESERVE, GUARD, ATTACK, and ALLIANCE. Stances are handled behind the curtain.",
      "Battalions no longer heal passively; recruiters are the way to refill battered units.",
      "Recruiters now refill commissioned battalions only; full battalions and max army size stop new recruits until commanders make more room.",
      "Battalion max-size changes are free within tier caps; the old gold charge no longer blocks saving capacity.",
      "Idle battalions now roam owned tiles on the map until their job has something to do.",
      "GUARD battalion mode is back for owned-border patrols; manual guard orders and convoy raid patrols stay disabled, and active legacy guard or raid orders return their committed army on the next tick.",
      "War Front battalions now dispatch from ATTACK mode in both war directions, using reachable tile priorities as target preference.",
      "Battalion reinforcements now march visibly from the castle to remote battalions before those new troops become usable.",
      "Alliance-mode battalions now send visible battlefield reinforcement marches instead of silently adding defenders.",
      "Castle War Room now has alliance support controls for joining allied attacks and defending allies; ALLIANCE-mode battalions decide how much army is available.",
      "War Room now shows committed and incoming army for allied battlefields, and ally-vs-ally wars pause support until commanders choose which alliance to keep.",
      "ALLIANCE-mode battalions can now auto-deploy to help allies on both attack and defense.",
      "Roads now shorten movement ETA for attacks, fortification marches, remote battalion reinforcements, War Front launches, allied support, and convoy map legs.",
      "The map now shows clearer road levels, route tooltips, and moving-unit ETA savings when roads helped the march.",
      "Trade offers can now exceed a single wagon's gold+food capacity; large accepted trades queue sequential wagon runs and dispatch more cargo as outbound wagon slots free up.",
      "Tile expansion priorities are now an ordered three-slot queue with numbered map badges, reorder controls, and shared War Front targeting.",
      "Expansion queues now auto-fill while the fortress is below its tile capacity, replacing claimed or invalid neutral targets with the nearest legal border tiles.",
      "Tile capacity now starts with 8 normal tiles that are free to maintain after claiming, then each pressure worker supports 2 more before skill and race bonuses; expansion pauses at capacity, and excess tiles decay back toward neutral.",
      "Farther neutral expansion now needs more pressure and unsupported distant pressure decays faster, so the frontier has to earn its dramatic little march.",
      "Race skill trees are now role-focused: Economy, Territory, and Military paths use smaller ramp nodes with major unlocks at nodes 4 and 8.",
      "Skill points now arrive later and slower: castle points start at level 3, then every 2 castle levels, and territory points require 5 owned normal tiles.",
      "Commanders can now respec one skill point from the end of a branch for 25,000 gold.",
      "Economy skills can add expansion priority slots, reduce army upkeep, increase wagon capacity, improve trade profit, and unlock more active wagons.",
      "Military skills can add battalion slots, larger battalions, faster recruitment, and cheaper promotions.",
      "Castle Economy now has Trade Wagons: wagon gold+food capacity starts at 100 and upgrades through the building ladder up to 20,000. Fortresses can run 3 active outbound wagons by default.",
      "Politics now shows alliance collateral, escrow, trust upgrade escrow, and peace reparations beside the relevant proposal and accept controls.",
    ],
    bugFixes: [
      "Overdue convoy wagons no longer keep animating on the map after their scheduled arrival; every successful delivery adds a small gold/food bonus with bigger allied Trust bonuses.",
      "The tutorial now points politics tasks at the Castle Diplomacy tab, matching the current navigation.",
      "Tile-only deed trades now create convoy legs correctly instead of tripping over cargo setup.",
      "Automatic wartime convoy raid dispatch is disabled during the War Room simplification pass.",
      "Battalion and War Front controls now validate live ownership, costs, mode, and promotion state on the server before applying changes.",
      "Pending battalion reinforcements now count against battalion capacity, preventing overfill while troops are still on the road.",
      "Battalions are no longer auto-commissioned by overflow recruitment.",
      "Road growth now follows the actual tile or battlefield destination instead of assuming every arrived unit marched castle-to-castle.",
      "Existing race skill purchases were reset so commanders can rebuild around the new specializations.",
    ],
  },
  {
    date: "2026-05-29",
    title: "Richer skill trees",
    newFeatures: [
      "Race skill trees now use 8 functional nodes per branch. A full branch costs 8 of your 12 skill points, leaving 4 points for another branch.",
      "Skill branches now use individual node purchases instead of old path-tier progress.",
    ],
    bugFixes: [
      "Skill point totals are now capped consistently at 12 across the Castle page and purchase validation.",
      "Existing race skill purchases were reset so commanders can rebuild under the richer node trees.",
    ],
  },
  {
    date: "2026-05-25",
    title: "Season 4 pretesting and pressure pacing",
    newFeatures: [
      "Season 4 pretesting now uses an explicit SEASON_4 cycle ruleset while prior-season records remain on the legacy ruleset.",
      "Neutral expansion now targets a slower idle rhythm: connected tiles require 600 pressure, and unsupported pushes lose 10% progress per hour.",
      "Unstable Unicorn pressure workers are now named Glitter Distribution.",
      "The Politics & Trade page now supports trust-backed alliance proposals, bilateral trust upgrades, and immediate betrayal with escrow forfeiture during pretesting.",
      "Alliance and trust proposals can now be canceled by their sender or rejected by their recipient.",
      "Detected covert incidents now grant the victim a 24-hour casus belli option for immediate war, ready for the upcoming raid-order slice.",
      "Season 4 war borders now use standing campaigns: committed army and pressure build toward a visible 12-hour siege warning before automatic combat begins.",
      "Owned tiles can station standing guard orders that commit army to defend against incoming Season 4 sieges.",
      "Castle Operations now summarizes committed guards, campaigns, logistics orders, and current expansion momentum between battlefield visits.",
      "Politics & Trade now handles bilateral gold, food, and army offers. Accepted cargo travels in independent convoy legs with a six-hour minimum journey.",
      "Delivered convoy cargo can award points from its base value, while allied trust tiers add bonus delivered gold and food without inflating score.",
      "Convoys caught between new enemies or wartime fortresses are seized on the next tick with no trade points or alliance bonus.",
      "Scored convoys can now be escorted, while standing raid orders attempt one automatic interception and steal half the cargo on success.",
      "Guards can detect convoy raiders, expose them as enemies, and grant the victim a 24-hour casus belli window for immediate war.",
      "Each race can now select a passive standing doctrine on the Castle page; doctrine effects scale with favored territory and can be changed every 12 hours.",
      "Season 4 live rankings are now prestige-only: Points, Territory, PvP Kills, Courier delivered cargo, and Privateer intercepted cargo.",
      "Season 4 registration now accepts new fortresses with immediate race choice during pretesting.",
      "A new Season 4 changes notice covers pressure expansion, Politics & Trade, convoy logistics, and campaign warfare.",
    ],
    bugFixes: [
      "Season 4 stays in pretesting until its redesigned rules are explicitly approved for activation, instead of starting from an unfinished schedule.",
      "Home of A, loot camps, and legacy active race abilities are no longer interactive or bonus-granting in Season 4 pretesting; the center tile is shown as a monument.",
      "Manual PvP tile raids, ordinary battlefield reinforcements, and legacy fortification controls are replaced by standing orders in Season 4 pretesting.",
      "The completed community wish ballot and old testing-delay notice have been removed from the live lobby; Season 4 results do not open a new ballot.",
      "The command dock now keeps the season countdown and live player-by-race totals visible for commanders on desktop and mobile.",
    ],
  },
  {
    date: "2026-05-19",
    title: "Deep Mining and Shattered Reality clarity",
    newFeatures: [
      "Unicorn Shattered Reality now records recent rolls on the Castle page, using the same compact history style as Deep Mining.",
      "Shattered Reality is now positive-only: Mirror Host adds idle and garrison army, Prismatic Surge grants one hour of +25% attack and defense power, and Lucky Gallop grants one hour of +50% gold, food, and recruitment processing.",
    ],
    bugFixes: [
      "Pending Deep Mining timed outcomes now show the future effect correctly instead of implying the buff expires when the expedition resolves.",
      "Deep Mining wording now says once every 60 minutes to match the rolling cooldown, and unresolved expeditions show Pending instead of Cooling down.",
    ],
  },
  {
    date: "2026-05-19",
    title: "Combat buff consistency",
    newFeatures: [],
    bugFixes: [
      "Attack and defense combat buffs now apply consistently across raids, battlefields, loot camps, Dwarf rune fights, and Home of A damage where relevant.",
      "Defense buffs now reduce defender losses on failed direct raids, and Butcher remains an attack-only title buff.",
      "Space Murine STIM now protects only that player's own committed troops in shared battlefields.",
    ],
  },
  {
    date: "2026-05-18",
    title: "Battlefield preparation window",
    newFeatures: [
      "Player castle and owned-tile battlefields now give defenders a one-hour preparation window after the first attacking army arrives before casualties begin.",
      "Pre-start battlefields now show when combat starts instead of showing live casualty pace early.",
    ],
    bugFixes: [
      "Battlefield resolution now skips future-start fights so visible setup time cannot cause early casualties or ownership changes.",
    ],
  },
  {
    date: "2026-05-15",
    title: "Home of A daily boss",
    newFeatures: [
      "The leaderboard now tracks points, units killed, current tiles owned, goblins killed, and resources stolen from player castles.",
      "Each live category leader gets a title and buff: Crown Accountant, Butcher, Landlord, Goblin Bonker, or Loot Lord.",
      "A one-time leaderboard announcement now shows live title holders, their scores, and your own scores for each category.",
      "Home of A is now a center-tile daily boss instead of a conquerable control tile.",
      "Killing Home of A now rewards the top damage dealer with points, food, army, and a 12-hour combat and economy buff.",
      "Global chat now announces the fortress that bonked Home of A hardest, including the reward and respawn timer.",
      "Castle PvP attacker wins now steal a small amount of defender score points when available, alongside gold and food loot based on surviving army carry capacity.",
    ],
    bugFixes: [
      "Home of A no longer uses ownership, holder drain, garrison defense, fortify, or control-income behavior.",
      "Center-tile attacks now create or reinforce a slower Home of A boss battlefield instead of instantly resolving damage.",
      "Battlefields now resolve through escalating tick casualties instead of a final instant combat roll at high progress.",
      "Reinforcements that arrive after their battlefield has resolved now return home intact on both attack and defense.",
      "Battle reports now show more lines so castle loot and stolen-score details are visible in the report card.",
    ],
  },
  {
    date: "2026-05-13",
    title: "Home of A status and escalating drain",
    newFeatures: [
      "Selecting the Home of A center tile now shows clearer control, holder, income, and drain status in one place.",
      "Home of A holder drain now starts at 10 army per tick and rises by 1 each tick held.",
    ],
    bugFixes: [
      "Recalling Home of A holding army now updates the holder list and removes that fortress from holder drain when no army remains at the center.",
      "Abandoned Home of A no longer resets to the original neutral defense after the NPC has already been defeated.",
      "Regular tile battles now count only army actually committed to that tile; idle castle army no longer appears as free tile defense.",
      "Home of A holder drain now removes army from the units holding Home of A instead of draining the player's idle castle army pool.",
    ],
  },
  {
    date: "2026-05-12",
    title: "Home of A battle reliability fixes",
    newFeatures: [
      "Battle resolution now handles Home of A defender state more consistently when players join either side during an active fight.",
    ],
    bugFixes: [
      "Fixed owned Home of A battles that could resolve unexpectedly instead of continuing normal tick-by-tick attrition.",
      "Fixed defender army accounting in Home of A fights so NPC/native defenders and joined player defenders no longer consume each other's army pools.",
      "Fixed late reinforcements so armies that arrive after a battlefield has already resolved now return safely instead of disappearing.",
    ],
  },
  {
    date: "2026-05-12",
    title: "Race tiers now depend on controlled biome tiles",
    newFeatures: [
      "Race tier progression now comes from map control: Tier 1/2/3 unlock at 3/6/9 owned tiles in each race's required biomes.",
      "Biome requirements are now race-specific: Dwarfs use mountains, ORKS use plains or lake, Space Murines use sea or coast, and Unstable Unicorns use marsh or forest.",
      "Castle and Wiki guidance now show the new tile-based race tier path so unlock timing is easier to understand in-game.",
    ],
    bugFixes: [
      "Race ability unlock checks now use owned biome tiles instead of noon-based timing, fixing mismatches between displayed tier info and actual ability availability.",
      "Combat and travel speed effects that depend on race tier now evaluate the attacker's current biome-tier state more consistently during tick resolution and attack routing.",
    ],
  },
  {
    date: "2026-05-12",
    title: "PvP defense, smoother refreshes, and recall stability",
    newFeatures: [
      "Players can now fortify owned tiles, including Home of A, by sending idle army that travels to the tile and defends it until recalled or killed.",
      "Castle battlefield wins now pay attackers from stolen gold and food in the defender's bank, plus a smaller gold reward based on killed enemy units.",
      "Gameplay actions now refresh more smoothly, so state updates feel more responsive during active play.",
    ],
    bugFixes: [
      "Owned tile battles now only use army that players explicitly send to the defense; idle castle army no longer defends nearby tiles for free.",
      "PvP battlefield rewards now go only to the winning side, so losers no longer receive reward events after a resolved fight.",
      "Fixed a tile-garrison recall failure that could show a generic service error instead of completing or returning a proper gameplay message.",
      "Reduced unnecessary broad page revalidation in gameplay actions to lower refresh load and avoid extra heavy rerenders.",
    ],
  },
  {
    date: "2026-05-11",
    title:
      "Sea tiles, mountain claims, Castle Yeet, and instant attack markers",
    newFeatures: [
      "Sea and mountain tiles can now be claimed — they cost more and take longer, but pay out higher rewards.",
      "Castle Yeet now uses the Battlefield map: arm the move, pick a destination tile, and relocate your castle there for gold.",
      "Attack markers now appear and start moving the moment you click send, with no waiting for the next game tick.",
    ],
    bugFixes: [
      "Fixed attack markers for all outbound map attacks, not only Home of A assaults.",
    ],
  },
  {
    date: "2026-05-07",
    title: "Army upkeep reduced",
    newFeatures: [
      "Army upkeep has been rebalanced so larger standing armies are easier to maintain.",
    ],
    bugFixes: [
      "Army upkeep reduced to 0.01 food per unit per tick — 1 food now sustains 100 active army units.",
    ],
  },
  {
    date: "2026-04-30",
    title: "Loot camp timers and counterattacks",
    newFeatures: [
      "Loot camps now stay on the battlefield for 30 minutes, giving players more time to plan raids.",
      "Loot camps now show clearer strength, reward, timer, and defending army info on the map and attack preview.",
    ],
    bugFixes: [
      "Loot camps now fight back with variant-scaled defending armies instead of behaving like passive structures.",
    ],
  },
  {
    date: "2026-04-29",
    title: "Teleport fixes and battlefield polish",
    newFeatures: [
      "Added richer wiki coverage from the top navigation for players who want to check rules, race flavor, and game systems while playing.",
      "Added a special God Emperor A gift notice for Tero.",
      "Improved relocation randomness so teleport outcomes are easier to understand and less predictable.",
    ],
    bugFixes: [
      "Fixed Unstable Unicorn teleport decoys so they are created reliably again after teleporting.",
      "Fixed relocation edge cases where a fortress could appear not to move on the rendered map.",
      "Fixed attack return handling so recalled and returning armies are reported more clearly.",
    ],
  },
  {
    date: "2026-04-28",
    title: "Races, raids, shop skins, and season flow",
    newFeatures: [
      "Added castle specializations and race buffs, including stronger Space Murines attack scaling and Unstable Unicorn hidden army sizes in transit.",
      "Added a pre-season testing phase, season race selection, and an updated season announcement dialog.",
      "Added attack recall, richer battle reports, higher raid loot caps, and visible limits on simultaneous outgoing attacks.",
      "Expanded the Shop with cosmetic skins, loot box reveals, default-skin controls, dedicated fortress sprites, and render support for equipped skins.",
      "Added community wish progress, all-season wish proposals, history voting improvements, and clearer wish progress displays.",
    ],
    bugFixes: [
      "Fixed several placement issues, including duplicate map positions, rendered-position mismatches, and reshuffle overlap.",
      "Fixed Home of A combat and destroy-credit handling so attacking armies and tiebreak credit resolve correctly.",
      "Improved mobile season update behavior so the modal stays within the visible viewport.",
      "Cleaned up active-season UI behavior with a smaller top HUD, auto-dismissing notices, and a hidden season control panel during active play.",
    ],
  },
  {
    date: "2026-04-24",
    title: "Attack cadence cleanup",
    newFeatures: [
      "Added the Exploit Hall of Fame to record the sharpest discoveries from live seasons.",
    ],
    bugFixes: [
      "Fixed attack toggling so switching between Grow and Attack can no longer spawn extra same-minute attack units.",
    ],
  },
  {
    date: "2026-04-23",
    title: "Battlefield visibility and control cleanup",
    newFeatures: [
      "Added a dedicated Patch notes page so players can review recent updates without opening the developer changelog.",
      "Added live ACTIVE tick health messaging to the battlefield HUD so players can see when the season is up to date, delayed, or stalled.",
      "Added a manual admin catch-up flow for stalled ticks, helping active seasons recover faster after processing delays.",
    ],
    bugFixes: [
      "Fixed immersive battlefield drawer stacking so Chat and Orders stay above HUD chrome and map controls.",
      "Improved fortress spawn shuffling so fresh cycles and reshuffles avoid overly clustered layouts while staying deterministic on the server.",
    ],
  },
  {
    date: "2026-04-22",
    title: "Spectator and join-flow improvements",
    newFeatures: [
      "Added automatic spectator refreshes during live cycles so signed-out viewers can watch score and health changes without manual reloads.",
      "Expanded cycle joining so new players can still enter an ACTIVE season while slots remain open.",
    ],
    bugFixes: [
      "Fixed join-state messaging so lockouts now explain whether joining is blocked by phase timing, admin lock, or full capacity.",
      "Removed the decorative action flag from fortress markers to reduce battlefield clutter.",
    ],
  },
  {
    date: "2026-04-21",
    title: "Visible attacks and clearer battlefield play",
    newFeatures: [
      "Added traveling attack units with distance-based arrival timing, launch costs, and impact damage.",
      "Added retro unit sprite variants for fortresses so active attacks are easier to track visually on the map.",
      "Refined homepage phase and battlefield copy so players get clearer guidance during REGISTRATION, ACTIVE, and downtime states.",
    ],
    bugFixes: [
      "Improved battlefield decoration layering and marker contrast so targets are easier to read, especially on smaller screens.",
    ],
  },
];

export function getPatchNotesPageState(
  releases: PatchNotesRelease[] = PATCH_NOTES_RELEASES
) {
  return {
    releases,
    isEmpty: releases.length === 0,
  };
}
