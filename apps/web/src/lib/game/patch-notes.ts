export type ExploitHallOfFameEntry = {
  season: number;
  exploitName: string;
  founder: string;
  firstExploiter: string;
};

export type PatchNotesRelease = {
  date: string;
  title?: string;
  newFeatures: string[];
  bugFixes: string[];
  exploitHallOfFame?: ExploitHallOfFameEntry[];
};

export const PATCH_NOTES_RELEASES: PatchNotesRelease[] = [
  {
    date: "2026-04-24",
    title: "Attack cadence cleanup",
    newFeatures: [
      "Added the Exploit Hall of Fame to record the sharpest discoveries from live seasons.",
    ],
    bugFixes: [
      "Fixed attack toggling so switching between Grow and Attack can no longer spawn extra same-minute attack units.",
    ],
    exploitHallOfFame: [
      {
        season: 1,
        exploitName: "Stutterfire",
        founder: "Giga Destroyer",
        firstExploiter: "Giga Destroyer",
      },
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
