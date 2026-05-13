export type PatchNotesRelease = {
  date: string;
  title?: string;
  newFeatures: string[];
  bugFixes: string[];
};

export const PATCH_NOTES_RELEASES: PatchNotesRelease[] = [
  {
    date: "2026-05-13",
    title: "Home of A status and escalating drain",
    newFeatures: [
      "Selecting the Home of A center tile now shows clearer control, holder, income, and drain status in one place.",
      "Home of A holder drain now starts at 10 army per tick and rises by 1 each tick held.",
    ],
    bugFixes: [
      "Recalling Home of A holding army now updates the holder list and removes that fortress from holder drain when no army remains at the center.",
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
