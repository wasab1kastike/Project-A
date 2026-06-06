import { prisma } from "@/lib/prisma";
import {
  CycleRuleset,
  CycleStatus,
  SeasonFiveActionKind,
  SeasonFiveCharacterClass,
  SeasonFiveGearRarity,
  SeasonFiveGearSlot,
  SeasonFiveLocationKind,
  SeasonFiveMapRole,
  type PrismaClient,
} from "@/lib/prisma-client";
import { GameError } from "./errors";
import {
  createSeasonFiveHomeState,
  createSeasonFiveTravelState,
  getSeasonFiveActionSummary,
  resolveSeasonFiveCompletedTravel,
} from "./season-five-actions";
import {
  getSeasonFiveInventoryPressure,
  planSeasonFivePassiveCatches,
} from "./season-five-fishing";
import {
  rankSeasonFiveBiggestFish,
  rankSeasonFiveMostFish,
} from "./season-five-leaderboards";
import {
  createSeasonFiveMapTiles,
  getSeasonFiveDailyRotationKey,
  getSeasonFiveLocationTileKey,
  planSeasonFiveDailySpecialTiles,
  rollSeasonFiveGlobalDiscovery,
} from "./season-five-map";
import { buildSeasonFiveLocationActivity } from "./season-five-presence";
import {
  calculateSeasonFiveCatchIntervalMinutes,
  calculateSeasonFiveInventoryCapacity,
  createSeasonFiveCatch as createSeasonFiveCatchFromBalance,
  deriveSeasonFiveBuildEffectValues,
} from "./season-five-balance";
import { addHours, floorToMinute } from "./time";

type DatabaseClient = PrismaClient;

export const SEASON_FIVE_PREVIEW_FLAG = "SEASON_5_PREVIEW_ENABLED";
export const SEASON_FIVE_DURATION_HOURS = 24 * 14;

export const SEASON_FIVE_STAT_KEYS = [
  "stronk",
  "luk",
  "smell",
  "magik",
  "quietness",
] as const;

export type SeasonFiveStatKey = (typeof SEASON_FIVE_STAT_KEYS)[number];
export type SeasonFiveStats = Record<SeasonFiveStatKey, number>;

export type SeasonFiveEffectBonuses = Partial<{
  catchBonus: number;
  rarityBonus: number;
  sizeBonusPercent: number;
  inventoryBonus: number;
  inventoryPressureReduction: number;
  travelPercent: number;
}>;

export const SEASON_FIVE_STAT_LABELS = {
  stronk: "Stronk",
  luk: "Luk",
  smell: "Smell",
  magik: "Magik",
  quietness: "Quietness",
} satisfies Record<SeasonFiveStatKey, string>;

export const SEASON_FIVE_STAT_DESCRIPTIONS = {
  stronk: "Handles trophy fish, heavy hauls, and pack pressure.",
  luk: "Bends rarity rolls and surprise catches.",
  smell: "Finds fish faster, especially in difficult waters.",
  magik: "Invites weird fish and class-specific nonsense.",
  quietness: "Travels cleanly and spooks fewer fish.",
} satisfies Record<SeasonFiveStatKey, string>;

const EMPTY_STATS = {
  stronk: 0,
  luk: 0,
  smell: 0,
  magik: 0,
  quietness: 0,
} satisfies SeasonFiveStats;

const EMPTY_EFFECT_BONUSES = {
  catchBonus: 0,
  rarityBonus: 0,
  sizeBonusPercent: 0,
  inventoryBonus: 0,
  inventoryPressureReduction: 0,
  travelPercent: 0,
} satisfies Required<SeasonFiveEffectBonuses>;

export const SEASON_FIVE_STARTER_SKILL_POINTS = 2;
export const SEASON_FIVE_LEVEL_XP = 50;
export const SEASON_FIVE_MAX_LEVEL = 11;
export const SEASON_FIVE_MAX_SKILL_POINTS =
  SEASON_FIVE_STARTER_SKILL_POINTS + SEASON_FIVE_MAX_LEVEL - 1;

export const SEASON_FIVE_CLASSES = {
  [SeasonFiveCharacterClass.DRUNKEN_MONK]: {
    label: "Drunken Monk",
    summary:
      "Finds rhythm in bad balance. Faster travel and reliable common catches.",
    stats: {
      stronk: 4,
      luk: 5,
      smell: 7,
      magik: 3,
      quietness: 8,
    },
  },
  [SeasonFiveCharacterClass.RETIRED_WARRIOR]: {
    label: "Retired Warrior",
    summary:
      "Treats fishing like one last campaign. Better trophy size and steady packs.",
    stats: {
      stronk: 9,
      luk: 4,
      smell: 4,
      magik: 2,
      quietness: 5,
    },
  },
  [SeasonFiveCharacterClass.DEMENTED_WIZARD]: {
    label: "Demented Wizard",
    summary: "Argues with the water until rare fish answer back.",
    stats: {
      stronk: 2,
      luk: 6,
      smell: 5,
      magik: 10,
      quietness: 3,
    },
  },
  [SeasonFiveCharacterClass.BURNT_OUT_ROGUE]: {
    label: "Burnt-Out Rogue",
    summary:
      "Knows where the quiet docks are. Efficient inventory and strong rare-fish odds.",
    stats: {
      stronk: 4,
      luk: 8,
      smell: 7,
      magik: 4,
      quietness: 9,
    },
  },
} as const;

type SeasonFiveSkillNode = {
  key: string;
  name: string;
  description: string;
  pathKey: string;
  pathName: string;
  tier: number;
  cost: number;
  requires?: string[];
  statBonuses?: Partial<SeasonFiveStats>;
  effectBonuses?: SeasonFiveEffectBonuses;
};

function createSeasonFiveSkillPath(
  pathKey: string,
  pathName: string,
  nodes: Array<
    Omit<SeasonFiveSkillNode, "pathKey" | "pathName" | "tier" | "requires"> & {
      requires?: string[];
    }
  >
) {
  return nodes.map((node, index) => ({
    ...node,
    pathKey,
    pathName,
    tier: index + 1,
    requires:
      node.requires ?? (index > 0 ? [nodes[index - 1]!.key] : undefined),
  }));
}

export const SEASON_FIVE_SKILL_TREES = {
  [SeasonFiveCharacterClass.DRUNKEN_MONK]: [
    ...createSeasonFiveSkillPath("monk_flow", "Flow", [
      {
        key: "monk_wobble_cast",
        name: "Wobble Cast",
        description: "Faster passive catches from the wrong-looking cast.",
        cost: 1,
        effectBonuses: { catchBonus: 1 },
      },
      {
        key: "monk_river_breath",
        name: "River Breath",
        description: "Better rhythm when the water gets stubborn.",
        cost: 1,
        statBonuses: { smell: 1 },
        effectBonuses: { catchBonus: 1 },
      },
      {
        key: "monk_foam_timing",
        name: "Foam Timing",
        description: "Small rarity lift without losing catch tempo.",
        cost: 1,
        effectBonuses: { rarityBonus: 4 },
      },
      {
        key: "monk_perfect_stumble",
        name: "Perfect Stumble",
        description: "A capstone burst of catch rhythm and route confidence.",
        cost: 2,
        effectBonuses: { catchBonus: 1, travelPercent: -5 },
      },
    ]),
    ...createSeasonFiveSkillPath("monk_stillness", "Stillness", [
      {
        key: "monk_breath_in_mug",
        name: "Breath in Mug",
        description: "Move quicker by refusing to hurry.",
        cost: 1,
        effectBonuses: { travelPercent: -5 },
      },
      {
        key: "monk_dock_nap",
        name: "Dock Nap",
        description: "Quiet travel and lighter pack pressure.",
        cost: 1,
        statBonuses: { quietness: 1 },
        effectBonuses: { inventoryPressureReduction: 1 },
      },
      {
        key: "monk_sober_second",
        name: "Sober Second",
        description: "A rare clear moment shaves more travel time.",
        cost: 1,
        effectBonuses: { travelPercent: -10 },
      },
      {
        key: "monk_empty_cup",
        name: "Empty Cup",
        description: "Arrive light, quiet, and ready to keep fishing.",
        cost: 2,
        effectBonuses: { travelPercent: -5, inventoryBonus: 2 },
      },
    ]),
    ...createSeasonFiveSkillPath("monk_lucky_mess", "Lucky Mess", [
      {
        key: "monk_lucky_spill",
        name: "Lucky Spill",
        description: "A little luck leaks into every cast.",
        cost: 1,
        effectBonuses: { rarityBonus: 3 },
      },
      {
        key: "monk_barrel_stance",
        name: "Barrel Stance",
        description: "The pack handles rough hauls better.",
        cost: 1,
        statBonuses: { stronk: 1 },
        effectBonuses: { inventoryBonus: 2 },
      },
      {
        key: "monk_accidental_bait",
        name: "Accidental Bait",
        description: "Odd bait improves rarity and pack pressure.",
        cost: 1,
        effectBonuses: { rarityBonus: 3, inventoryPressureReduction: 1 },
      },
      {
        key: "monk_happy_blackout",
        name: "Happy Blackout",
        description: "Wake up with better fish and suspiciously tidy gear.",
        cost: 2,
        effectBonuses: { rarityBonus: 5, inventoryBonus: 2 },
      },
    ]),
  ],
  [SeasonFiveCharacterClass.RETIRED_WARRIOR]: [
    ...createSeasonFiveSkillPath("warrior_trophy_hunter", "Trophy Hunter", [
      {
        key: "warrior_campaign_grip",
        name: "Campaign Grip",
        description: "Big fish meet military posture.",
        cost: 1,
        statBonuses: { stronk: 1 },
        effectBonuses: { sizeBonusPercent: 5 },
      },
      {
        key: "warrior_trophy_drag",
        name: "Trophy Drag",
        description: "Trophy catches scale harder.",
        cost: 1,
        effectBonuses: { sizeBonusPercent: 8 },
      },
      {
        key: "warrior_old_hooks",
        name: "Old Hooks",
        description: "Better odds of noteworthy fish.",
        cost: 1,
        effectBonuses: { rarityBonus: 4 },
      },
      {
        key: "warrior_final_campaign",
        name: "Final Campaign",
        description: "One last glorious overreaction for trophy waters.",
        cost: 2,
        effectBonuses: { sizeBonusPercent: 12, rarityBonus: 3 },
      },
    ]),
    ...createSeasonFiveSkillPath("warrior_campaign_pack", "Campaign Pack", [
      {
        key: "warrior_field_creel",
        name: "Field Creel",
        description: "Carry more before returning home.",
        cost: 1,
        effectBonuses: { inventoryBonus: 2 },
      },
      {
        key: "warrior_supply_lines",
        name: "Supply Lines",
        description: "Pack pressure drops under campaign discipline.",
        cost: 1,
        effectBonuses: { inventoryPressureReduction: 1 },
      },
      {
        key: "warrior_ration_space",
        name: "Ration Space",
        description: "More room, fewer excuses.",
        cost: 1,
        statBonuses: { stronk: 1 },
        effectBonuses: { inventoryBonus: 2 },
      },
      {
        key: "warrior_baggage_train",
        name: "Baggage Train",
        description: "A heavy pack built for long hauls.",
        cost: 2,
        effectBonuses: { inventoryBonus: 4, inventoryPressureReduction: 1 },
      },
    ]),
    ...createSeasonFiveSkillPath("warrior_siege_patience", "Siege Patience", [
      {
        key: "warrior_old_maps",
        name: "Old Maps",
        description: "Know which waters are worth the march.",
        cost: 1,
        effectBonuses: { travelPercent: -5 },
      },
      {
        key: "warrior_siege_patience",
        name: "Siege Patience",
        description: "Wait them out and catch cleaner.",
        cost: 1,
        effectBonuses: { catchBonus: 1 },
      },
      {
        key: "warrior_deep_campaign",
        name: "Deep Campaign",
        description: "A patient push into harder waters.",
        cost: 1,
        effectBonuses: { catchBonus: 1, sizeBonusPercent: 5 },
      },
      {
        key: "warrior_no_retreat",
        name: "No Retreat",
        description: "Slow resolve turns deep water into trophy water.",
        cost: 2,
        effectBonuses: { catchBonus: 1, sizeBonusPercent: 8 },
      },
    ]),
  ],
  [SeasonFiveCharacterClass.DEMENTED_WIZARD]: [
    ...createSeasonFiveSkillPath("wizard_moon_logic", "Moon Logic", [
      {
        key: "wizard_moon_ledger",
        name: "Moon Ledger",
        description: "Rarity improves when the tide signs the receipt.",
        cost: 1,
        effectBonuses: { rarityBonus: 5 },
      },
      {
        key: "wizard_star_bait",
        name: "Star Bait",
        description: "Magik and luck nudge stranger fish closer.",
        cost: 1,
        statBonuses: { magik: 1 },
        effectBonuses: { rarityBonus: 4 },
      },
      {
        key: "wizard_probability_hook",
        name: "Probability Hook",
        description: "Hook the version of the fish that is rarer.",
        cost: 1,
        effectBonuses: { rarityBonus: 6 },
      },
      {
        key: "wizard_argument_with_sea",
        name: "Argument with Sea",
        description: "Lose the debate. Win the impossible fish.",
        cost: 2,
        effectBonuses: { rarityBonus: 8, sizeBonusPercent: 5 },
      },
    ]),
    ...createSeasonFiveSkillPath("wizard_bent_distance", "Bent Distance", [
      {
        key: "wizard_pocket_portal",
        name: "Pocket Portal",
        description: "Fold the road until it stops complaining.",
        cost: 1,
        effectBonuses: { travelPercent: -10 },
      },
      {
        key: "wizard_wet_shortcut",
        name: "Wet Shortcut",
        description: "Arrive through an argument with geography.",
        cost: 1,
        effectBonuses: { travelPercent: -5, catchBonus: 1 },
      },
      {
        key: "wizard_unhelpful_map",
        name: "Unhelpful Map",
        description: "A wrong map finds right fish faster.",
        cost: 1,
        effectBonuses: { travelPercent: -5, rarityBonus: 3 },
      },
      {
        key: "wizard_elsewhere_now",
        name: "Elsewhere Now",
        description: "Travel less, fish sooner.",
        cost: 2,
        effectBonuses: { travelPercent: -10, catchBonus: 1 },
      },
    ]),
    ...createSeasonFiveSkillPath("wizard_deep_muttering", "Deep Muttering", [
      {
        key: "wizard_muttered_bait",
        name: "Muttered Bait",
        description: "The bait learns an unsettling phrase.",
        cost: 1,
        statBonuses: { magik: 1 },
        effectBonuses: { catchBonus: 1 },
      },
      {
        key: "wizard_glass_gills",
        name: "Glass Gills",
        description: "Hear fish gossip through water.",
        cost: 1,
        effectBonuses: { catchBonus: 1 },
      },
      {
        key: "wizard_salt_runes",
        name: "Salt Runes",
        description: "Deep catches become larger and weirder.",
        cost: 1,
        effectBonuses: { sizeBonusPercent: 6, rarityBonus: 3 },
      },
      {
        key: "wizard_abyssal_chorus",
        name: "Abyssal Chorus",
        description: "The deep starts singing back.",
        cost: 2,
        effectBonuses: { catchBonus: 1, rarityBonus: 5, sizeBonusPercent: 5 },
      },
    ]),
  ],
  [SeasonFiveCharacterClass.BURNT_OUT_ROGUE]: [
    ...createSeasonFiveSkillPath("rogue_soft_steps", "Soft Steps", [
      {
        key: "rogue_soft_boots",
        name: "Soft Boots",
        description: "The dock never hears you quit.",
        cost: 1,
        effectBonuses: { travelPercent: -10 },
      },
      {
        key: "rogue_muddy_shortcuts",
        name: "Muddy Shortcuts",
        description: "Bad roads become good routes.",
        cost: 1,
        statBonuses: { quietness: 1 },
        effectBonuses: { travelPercent: -5 },
      },
      {
        key: "rogue_no_splash",
        name: "No Splash",
        description: "Quiet movement keeps pressure down.",
        cost: 1,
        effectBonuses: { inventoryPressureReduction: 1 },
      },
      {
        key: "rogue_disappear_twice",
        name: "Disappear Twice",
        description: "Even the splash looks away.",
        cost: 2,
        effectBonuses: { travelPercent: -10, inventoryPressureReduction: 1 },
      },
    ]),
    ...createSeasonFiveSkillPath("rogue_dirty_luck", "Dirty Luck", [
      {
        key: "rogue_stolen_lure",
        name: "Stolen Lure",
        description: "Probably yours now. Rare fish disagree.",
        cost: 1,
        effectBonuses: { rarityBonus: 5 },
      },
      {
        key: "rogue_backwater_gossip",
        name: "Backwater Gossip",
        description: "Know which puddle is lying.",
        cost: 1,
        effectBonuses: { catchBonus: 1 },
      },
      {
        key: "rogue_shady_barter",
        name: "Shady Barter",
        description: "Better bait from worse conversations.",
        cost: 1,
        effectBonuses: { rarityBonus: 4, catchBonus: 1 },
      },
      {
        key: "rogue_luck_was_work",
        name: "Luck Was Work",
        description: "All that luck was scouting after all.",
        cost: 2,
        effectBonuses: { rarityBonus: 6, catchBonus: 1 },
      },
    ]),
    ...createSeasonFiveSkillPath("rogue_false_bottoms", "False Bottoms", [
      {
        key: "rogue_false_bottom",
        name: "False Bottom",
        description: "The pack has opinions about physics.",
        cost: 1,
        effectBonuses: { inventoryBonus: 2 },
      },
      {
        key: "rogue_second_pocket",
        name: "Second Pocket",
        description: "An extra pocket appears when nobody checks.",
        cost: 1,
        effectBonuses: { inventoryBonus: 2 },
      },
      {
        key: "rogue_quiet_pack",
        name: "Quiet Pack",
        description: "A full pack complains less.",
        cost: 1,
        effectBonuses: { inventoryPressureReduction: 1 },
      },
      {
        key: "rogue_smuggler_creel",
        name: "Smuggler Creel",
        description: "Carry more, look innocent.",
        cost: 2,
        effectBonuses: { inventoryBonus: 4, inventoryPressureReduction: 1 },
      },
    ]),
  ],
} as const satisfies Record<
  SeasonFiveCharacterClass,
  readonly SeasonFiveSkillNode[]
>;

export const SEASON_FIVE_SKILLS = Object.values(SEASON_FIVE_SKILL_TREES).flat();

const LEGACY_SKILL_ALIASES = [
  {
    key: "steady_hands",
    target: "monk_wobble_cast",
  },
  {
    key: "deep_pockets",
    target: "rogue_false_bottom",
  },
  {
    key: "trophy_lies",
    target: "warrior_trophy_drag",
  },
  {
    key: "muddy_shortcuts",
    target: "rogue_soft_boots",
  },
] as const;

export const SEASON_FIVE_LOCATIONS = [
  {
    key: "home",
    name: "Home Base",
    kind: SeasonFiveLocationKind.HOME,
    xPercent: 50,
    yPercent: 50,
    travelMinutes: 0,
    catchDifficulty: 0,
    minFishCm: 0,
    maxFishCm: 0,
    inventoryPressure: 0,
  },
  {
    key: "mossglass-lake",
    name: "Mossglass Lake",
    kind: SeasonFiveLocationKind.LAKE,
    xPercent: 31,
    yPercent: 35,
    travelMinutes: 8,
    catchDifficulty: 1,
    minFishCm: 12,
    maxFishCm: 85,
    inventoryPressure: 1,
  },
  {
    key: "old-pier",
    name: "Old Pier",
    kind: SeasonFiveLocationKind.LAKE,
    xPercent: 66,
    yPercent: 41,
    travelMinutes: 12,
    catchDifficulty: 2,
    minFishCm: 18,
    maxFishCm: 120,
    inventoryPressure: 1,
  },
  {
    key: "blackwake-sea",
    name: "Blackwake Sea",
    kind: SeasonFiveLocationKind.SEA,
    xPercent: 73,
    yPercent: 69,
    travelMinutes: 22,
    catchDifficulty: 3,
    minFishCm: 35,
    maxFishCm: 220,
    inventoryPressure: 2,
  },
  {
    key: "moon-depths",
    name: "Moon Depths",
    kind: SeasonFiveLocationKind.SEA,
    xPercent: 24,
    yPercent: 73,
    travelMinutes: 30,
    catchDifficulty: 4,
    minFishCm: 50,
    maxFishCm: 320,
    inventoryPressure: 2,
  },
] as const;

const STARTER_GEAR = [
  {
    slot: SeasonFiveGearSlot.ROD,
    key: "splintered-rod",
    name: "Splintered Rod",
    rarity: SeasonFiveGearRarity.COMMON,
    power: 0,
    equipped: true,
    statBonuses: { smell: 1 },
  },
  {
    slot: SeasonFiveGearSlot.ROD,
    key: "war-veteran-cane",
    name: "War Veteran Cane",
    rarity: SeasonFiveGearRarity.UNCOMMON,
    power: 1,
    equipped: false,
    statBonuses: { stronk: 1, smell: 1 },
  },
  {
    slot: SeasonFiveGearSlot.BAIT,
    key: "pocket-breadcrumbs",
    name: "Pocket Breadcrumbs",
    rarity: SeasonFiveGearRarity.COMMON,
    power: 0,
    equipped: true,
    statBonuses: { smell: 1 },
  },
  {
    slot: SeasonFiveGearSlot.BAIT,
    key: "glowing-worms",
    name: "Glowing Worms",
    rarity: SeasonFiveGearRarity.UNCOMMON,
    power: 1,
    equipped: false,
    statBonuses: { luk: 1, magik: 1 },
  },
  {
    slot: SeasonFiveGearSlot.PACK,
    key: "canvas-creel",
    name: "Canvas Creel",
    rarity: SeasonFiveGearRarity.COMMON,
    power: 0,
    equipped: true,
    statBonuses: { stronk: 1 },
  },
  {
    slot: SeasonFiveGearSlot.PACK,
    key: "bottomless-ish-bucket",
    name: "Bottomless-ish Bucket",
    rarity: SeasonFiveGearRarity.RARE,
    power: 2,
    equipped: false,
    statBonuses: { stronk: 2, quietness: -1 },
  },
  {
    slot: SeasonFiveGearSlot.TRINKET,
    key: "lucky-bottlecap",
    name: "Lucky Bottlecap",
    rarity: SeasonFiveGearRarity.COMMON,
    power: 0,
    equipped: true,
    statBonuses: { luk: 1 },
  },
] as const;

const STARTER_GEAR_BY_KEY: Map<string, (typeof STARTER_GEAR)[number]> = new Map(
  STARTER_GEAR.map((gear) => [gear.key, gear])
);

export function isSeasonFivePreviewEnabled() {
  return process.env[SEASON_FIVE_PREVIEW_FLAG] === "true";
}

export function isSeasonFiveRuleset(ruleset: CycleRuleset | null | undefined) {
  return ruleset === CycleRuleset.SEASON_5;
}

function hashString(input: string) {
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function getSeasonFiveClassLabel(
  characterClass: SeasonFiveCharacterClass
) {
  return SEASON_FIVE_CLASSES[characterClass].label;
}

export function normalizeSeasonFiveClass(input: string) {
  const value = input.trim().toUpperCase();
  if (
    value === SeasonFiveCharacterClass.DRUNKEN_MONK ||
    value === SeasonFiveCharacterClass.RETIRED_WARRIOR ||
    value === SeasonFiveCharacterClass.DEMENTED_WIZARD ||
    value === SeasonFiveCharacterClass.BURNT_OUT_ROGUE
  ) {
    return value;
  }

  throw new GameError("Choose a valid Season 5 class.");
}

function addStats(base: SeasonFiveStats, bonuses?: Partial<SeasonFiveStats>) {
  if (!bonuses) return { ...base };
  return SEASON_FIVE_STAT_KEYS.reduce(
    (stats, key) => ({
      ...stats,
      [key]: stats[key] + (bonuses[key] ?? 0),
    }),
    { ...base }
  );
}

function addEffectBonuses(
  base: Required<SeasonFiveEffectBonuses>,
  bonuses?: SeasonFiveEffectBonuses
) {
  if (!bonuses) return { ...base };
  return {
    catchBonus: base.catchBonus + (bonuses.catchBonus ?? 0),
    rarityBonus: base.rarityBonus + (bonuses.rarityBonus ?? 0),
    sizeBonusPercent:
      base.sizeBonusPercent + (bonuses.sizeBonusPercent ?? 0),
    inventoryBonus: base.inventoryBonus + (bonuses.inventoryBonus ?? 0),
    inventoryPressureReduction:
      base.inventoryPressureReduction +
      (bonuses.inventoryPressureReduction ?? 0),
    travelPercent: base.travelPercent + (bonuses.travelPercent ?? 0),
  };
}

function clampStats(stats: SeasonFiveStats) {
  return SEASON_FIVE_STAT_KEYS.reduce(
    (clamped, key) => ({
      ...clamped,
      [key]: clamp(stats[key], 1, 10),
    }),
    { ...EMPTY_STATS }
  );
}

export function getSeasonFiveLevelForExperience(experience: number) {
  return clamp(
    1 + Math.floor(Math.max(0, experience) / SEASON_FIVE_LEVEL_XP),
    1,
    SEASON_FIVE_MAX_LEVEL
  );
}

export function getSeasonFiveEarnedSkillPointsForLevel(level: number) {
  return clamp(
    SEASON_FIVE_STARTER_SKILL_POINTS + Math.max(0, level - 1),
    SEASON_FIVE_STARTER_SKILL_POINTS,
    SEASON_FIVE_MAX_SKILL_POINTS
  );
}

export function getSeasonFiveProgressionAfterExperience(input: {
  level: number;
  skillPoints: number;
  experience: number;
}) {
  const level = getSeasonFiveLevelForExperience(input.experience);
  const previousEarnedPoints = getSeasonFiveEarnedSkillPointsForLevel(
    input.level
  );
  const nextEarnedPoints = getSeasonFiveEarnedSkillPointsForLevel(level);
  const pointDelta = Math.max(0, nextEarnedPoints - previousEarnedPoints);

  return {
    level,
    skillPoints: Math.min(
      SEASON_FIVE_MAX_SKILL_POINTS,
      input.skillPoints + pointDelta
    ),
    pointDelta,
  };
}

function resolveSkillKey(nodeKey: string) {
  return (
    LEGACY_SKILL_ALIASES.find((alias) => alias.key === nodeKey)?.target ??
    nodeKey
  );
}

function findSeasonFiveSkillNode(nodeKey: string) {
  const resolved = resolveSkillKey(nodeKey);
  return SEASON_FIVE_SKILLS.find((skill) => skill.key === resolved) ?? null;
}

function getSkillStatBonuses(purchasedNodeKeys: Iterable<string>) {
  return Array.from(purchasedNodeKeys).reduce(
    (stats, nodeKey) => {
      const skill = findSeasonFiveSkillNode(nodeKey);
      return addStats(stats, skill?.statBonuses);
    },
    { ...EMPTY_STATS }
  );
}

function getSkillEffectBonuses(purchasedNodeKeys: Iterable<string>) {
  return Array.from(purchasedNodeKeys).reduce(
    (effects, nodeKey) => {
      const skill = findSeasonFiveSkillNode(nodeKey);
      return addEffectBonuses(effects, skill?.effectBonuses);
    },
    { ...EMPTY_EFFECT_BONUSES }
  );
}

function getGearStatBonuses(
  gear: Array<{
    key?: string;
    slot: SeasonFiveGearSlot;
    power: number;
    equipped: boolean;
  }>
) {
  return gear
    .filter((item) => item.equipped)
    .reduce(
      (stats, item) => {
        const catalogBonuses = item.key
          ? STARTER_GEAR_BY_KEY.get(item.key)?.statBonuses
          : null;
        if (catalogBonuses) {
          return addStats(stats, catalogBonuses);
        }

        if (item.slot === SeasonFiveGearSlot.ROD) {
          return addStats(stats, { stronk: item.power, smell: item.power });
        }
        if (item.slot === SeasonFiveGearSlot.BAIT) {
          return addStats(stats, { luk: item.power, smell: item.power });
        }
        if (item.slot === SeasonFiveGearSlot.PACK) {
          return addStats(stats, { stronk: item.power * 2 });
        }
        if (item.slot === SeasonFiveGearSlot.TRINKET) {
          return addStats(stats, { luk: item.power, magik: item.power });
        }
        return stats;
      },
      { ...EMPTY_STATS }
    );
}

export function getSeasonFiveCharacterStats(input: {
  characterClass: SeasonFiveCharacterClass;
  gear?: Array<{
    key?: string;
    slot: SeasonFiveGearSlot;
    power: number;
    equipped: boolean;
  }>;
  purchasedNodeKeys?: Iterable<string>;
}) {
  const classStats = SEASON_FIVE_CLASSES[input.characterClass].stats;
  const gearStats = getGearStatBonuses(input.gear ?? []);
  const skillStats = getSkillStatBonuses(input.purchasedNodeKeys ?? []);
  const combined = SEASON_FIVE_STAT_KEYS.reduce(
    (stats, key) => ({
      ...stats,
      [key]: classStats[key] + gearStats[key] + skillStats[key],
    }),
    { ...EMPTY_STATS }
  );

  return clampStats(combined);
}

export function getSeasonFiveBuildEffects(input: {
  characterClass: SeasonFiveCharacterClass;
  gear?: Array<{
    key?: string;
    slot: SeasonFiveGearSlot;
    power: number;
    equipped: boolean;
  }>;
  purchasedNodeKeys?: Iterable<string>;
}) {
  const stats = getSeasonFiveCharacterStats(input);
  const formulaEffects = deriveSeasonFiveBuildEffectValues(stats);
  const skillEffects = getSkillEffectBonuses(input.purchasedNodeKeys ?? []);

  return {
    stats,
    catchBonus: formulaEffects.catchBonus + skillEffects.catchBonus,
    inventoryBonus:
      formulaEffects.inventoryBonus + skillEffects.inventoryBonus,
    inventoryPressureReduction:
      formulaEffects.inventoryPressureReduction +
      skillEffects.inventoryPressureReduction,
    rarityBonus: formulaEffects.rarityBonus + skillEffects.rarityBonus,
    sizeBonusPercent:
      formulaEffects.sizeBonusPercent + skillEffects.sizeBonusPercent,
    travelPercent: formulaEffects.travelPercent + skillEffects.travelPercent,
  };
}

export { calculateSeasonFiveTravelMinutes } from "./season-five-actions";
export {
  calculateSeasonFiveCatchIntervalMinutes,
  calculateSeasonFiveInventoryCapacity,
} from "./season-five-balance";

export function createSeasonFiveCatch(input: {
  seed: string;
  minFishCm: number;
  maxFishCm: number;
  difficulty: number;
  sizeBonusPercent: number;
  rarityBonus?: number;
  inventoryPressure: number;
}) {
  return createSeasonFiveCatchFromBalance({
    ...input,
    hash: hashString(input.seed),
  });
}

async function ensureSeasonFiveMapTiles(cycleId: string, db: DatabaseClient) {
  for (const tile of createSeasonFiveMapTiles()) {
    await db.seasonFiveMapTile.upsert({
      where: {
        cycleId_key: {
          cycleId,
          key: tile.key,
        },
      },
      create: {
        cycleId,
        ...tile,
      },
      update: {
        row: tile.row,
        col: tile.col,
        xPercent: tile.xPercent,
        yPercent: tile.yPercent,
        terrain: tile.terrain,
        visualVariant: tile.visualVariant,
        role:
          tile.role === SeasonFiveMapRole.HOME ||
          tile.role === SeasonFiveMapRole.FISHING_SPOT
            ? tile.role
            : undefined,
        roleLabel:
          tile.role === SeasonFiveMapRole.HOME ||
          tile.role === SeasonFiveMapRole.FISHING_SPOT
            ? tile.roleLabel
            : undefined,
      },
    });
  }
}

async function ensureSeasonFiveLocations(cycleId: string, db: DatabaseClient) {
  const tiles = await db.seasonFiveMapTile.findMany({
    where: {
      cycleId,
    },
  });
  const tileByKey = new Map(tiles.map((tile) => [tile.key, tile]));

  for (const location of SEASON_FIVE_LOCATIONS) {
    const tile =
      tileByKey.get(getSeasonFiveLocationTileKey(location.key) ?? "") ?? null;

    await db.seasonFiveFishingLocation.upsert({
      where: {
        cycleId_key: {
          cycleId,
          key: location.key,
        },
      },
      create: {
        cycleId,
        ...location,
        xPercent: tile?.xPercent ?? location.xPercent,
        yPercent: tile?.yPercent ?? location.yPercent,
        tileId: tile?.id ?? null,
      },
      update: {
        name: location.name,
        kind: location.kind,
        xPercent: tile?.xPercent ?? location.xPercent,
        yPercent: tile?.yPercent ?? location.yPercent,
        travelMinutes: location.travelMinutes,
        catchDifficulty: location.catchDifficulty,
        minFishCm: location.minFishCm,
        maxFishCm: location.maxFishCm,
        inventoryPressure: location.inventoryPressure,
        tileId: tile?.id ?? null,
      },
    });
  }
}

export async function ensureSeasonFivePreviewCycle({
  now = new Date(),
  db = prisma,
}: {
  now?: Date;
  db?: DatabaseClient;
} = {}) {
  const existing = await db.cycle.findFirst({
    where: {
      ruleset: CycleRuleset.SEASON_5,
      resolvedAt: null,
    },
    orderBy: {
      createdAt: "desc",
    },
  });

  const cycle =
    existing ??
    (await db.cycle.create({
      data: {
        status: CycleStatus.ACTIVE,
        ruleset: CycleRuleset.SEASON_5,
        registrationStartedAt: now,
        registrationEndsAt: now,
        testingStartedAt: now,
        testingEndsAt: now,
        activeStartedAt: now,
        activeEndsAt: addHours(now, SEASON_FIVE_DURATION_HOURS),
      },
    }));

  await ensureSeasonFiveMapTiles(cycle.id, db);
  await ensureSeasonFiveLocations(cycle.id, db);
  return cycle;
}

async function rotateSeasonFiveMapSpecials({
  cycleId,
  db,
  now,
}: {
  cycleId: string;
  db: DatabaseClient;
  now: Date;
}) {
  const specialRoles = [
    SeasonFiveMapRole.SHOP,
    SeasonFiveMapRole.EVENT,
    SeasonFiveMapRole.SECRET_LAKE,
  ];

  await db.seasonFiveMapTile.updateMany({
    where: {
      cycleId,
      role: {
        in: specialRoles,
      },
      expiresAt: {
        lte: now,
      },
    },
    data: {
      role: SeasonFiveMapRole.NONE,
      roleLabel: null,
      hidden: false,
      discoveredAt: null,
      expiresAt: null,
      requiredKey: null,
      roleSeedKey: null,
    },
  });

  const rotationKey = getSeasonFiveDailyRotationKey(now);
  const existing = await db.seasonFiveMapTile.findFirst({
    where: {
      cycleId,
      roleSeedKey: rotationKey,
      role: {
        in: specialRoles,
      },
    },
    select: {
      id: true,
    },
  });

  if (existing) {
    return;
  }

  await db.seasonFiveMapTile.updateMany({
    where: {
      cycleId,
      role: {
        in: specialRoles,
      },
    },
    data: {
      role: SeasonFiveMapRole.NONE,
      roleLabel: null,
      hidden: false,
      discoveredAt: null,
      expiresAt: null,
      requiredKey: null,
      roleSeedKey: null,
    },
  });

  const tiles = await db.seasonFiveMapTile.findMany({
    where: {
      cycleId,
    },
  });
  const specials = planSeasonFiveDailySpecialTiles({
    tiles,
    now,
    rotationKey,
  });

  for (const special of specials) {
    await db.seasonFiveMapTile.update({
      where: {
        cycleId_key: {
          cycleId,
          key: special.tileKey,
        },
      },
      data: {
        role: special.role,
        roleLabel: special.roleLabel,
        hidden: special.hidden,
        discoveredAt: special.hidden ? null : now,
        expiresAt: special.expiresAt,
        requiredKey: special.requiredKey,
        roleSeedKey: special.roleSeedKey,
      },
    });
  }
}

async function getSeasonFiveCharacterForUser(args: {
  userId: string;
  cycleId: string;
  db: DatabaseClient;
}) {
  return args.db.seasonFiveCharacter.findUnique({
    where: {
      cycleId_userId: {
        cycleId: args.cycleId,
        userId: args.userId,
      },
    },
    include: {
      gear: {
        orderBy: [{ slot: "asc" }, { createdAt: "asc" }],
      },
      skillPurchases: true,
      keyItems: true,
      currentLocation: {
        include: {
          tile: true,
        },
      },
      destinationLocation: {
        include: {
          tile: true,
        },
      },
      inventoryItems: {
        where: {
          unloadedAt: null,
        },
        include: {
          fishCatch: true,
        },
        orderBy: {
          createdAt: "asc",
        },
      },
    },
  });
}

export async function createSeasonFiveCharacter({
  userId,
  characterClass,
  characterName,
  db = prisma,
  now = new Date(),
}: {
  userId: string;
  characterClass: string;
  characterName: string;
  db?: DatabaseClient;
  now?: Date;
}) {
  const selectedClass = normalizeSeasonFiveClass(characterClass);
  const normalizedCharacterName = characterName.trim();
  if (!normalizedCharacterName) {
    throw new GameError("Name your Season 5 character first.");
  }
  if (normalizedCharacterName.length > 40) {
    throw new GameError("Character name must be 40 characters or fewer.");
  }

  const cycle = await ensureSeasonFivePreviewCycle({ db, now });
  const home = await db.seasonFiveFishingLocation.findUniqueOrThrow({
    where: {
      cycleId_key: {
        cycleId: cycle.id,
        key: "home",
      },
    },
  });
  const existing = await db.seasonFiveCharacter.findUnique({
    where: {
      cycleId_userId: {
        cycleId: cycle.id,
        userId,
      },
    },
  });

  if (existing) {
    throw new GameError("You already have a Season 5 character.");
  }

  return db.seasonFiveCharacter.create({
    data: {
      userId,
      cycleId: cycle.id,
      name: normalizedCharacterName,
      class: selectedClass,
      skillPoints: SEASON_FIVE_STARTER_SKILL_POINTS,
      currentLocationId: home.id,
      lastResolvedAt: now,
      inventoryCapacity: 12,
      gear: {
        createMany: {
          data: STARTER_GEAR.map(({ statBonuses: _statBonuses, ...gear }) => ({
            ...gear,
          })),
        },
      },
    },
  });
}

export async function equipSeasonFiveGear({
  userId,
  gearId,
  db = prisma,
}: {
  userId: string;
  gearId: string;
  db?: DatabaseClient;
}) {
  const cycle = await ensureSeasonFivePreviewCycle({ db });
  const character = await db.seasonFiveCharacter.findUnique({
    where: { cycleId_userId: { cycleId: cycle.id, userId } },
  });

  if (!character) {
    throw new GameError("Create a Season 5 character before changing gear.");
  }

  const gear = await db.seasonFiveGear.findFirst({
    where: {
      id: gearId,
      characterId: character.id,
    },
  });

  if (!gear) {
    throw new GameError("That gear is not in your tackle pile.");
  }

  await db.$transaction([
    db.seasonFiveGear.updateMany({
      where: {
        characterId: character.id,
        slot: gear.slot,
      },
      data: {
        equipped: false,
      },
    }),
    db.seasonFiveGear.update({
      where: {
        id: gear.id,
      },
      data: {
        equipped: true,
      },
    }),
  ]);
}

export async function purchaseSeasonFiveSkill({
  userId,
  nodeKey,
  db = prisma,
}: {
  userId: string;
  nodeKey: string;
  db?: DatabaseClient;
}) {
  const cycle = await ensureSeasonFivePreviewCycle({ db });

  await db.$transaction(async (tx) => {
    const character = await tx.seasonFiveCharacter.findUnique({
      where: { cycleId_userId: { cycleId: cycle.id, userId } },
      include: { skillPurchases: true },
    });

    if (!character) {
      throw new GameError("Create a Season 5 character before buying skills.");
    }

    const classTree: readonly SeasonFiveSkillNode[] =
      SEASON_FIVE_SKILL_TREES[character.class];
    const skill = classTree.find((candidate) => candidate.key === nodeKey);
    if (!skill) {
      throw new GameError("That skill does not belong to your class tree.");
    }

    const purchasedKeys = new Set(
      character.skillPurchases.map((purchase) =>
        resolveSkillKey(purchase.nodeKey)
      )
    );

    if (
      character.skillPurchases.some(
        (purchase) => resolveSkillKey(purchase.nodeKey) === nodeKey
      )
    ) {
      throw new GameError("That skill is already unlocked.");
    }

    const missingRequirement = skill.requires?.find(
      (requiredKey) => !purchasedKeys.has(requiredKey)
    );
    if (missingRequirement) {
      throw new GameError("Unlock the previous skill first.");
    }

    if (character.skillPoints < skill.cost) {
      throw new GameError("You need a skill point first.");
    }

    await tx.seasonFiveSkillPurchase.create({
      data: {
        characterId: character.id,
        nodeKey,
      },
    });
    await tx.seasonFiveCharacter.update({
      where: { id: character.id },
      data: {
        skillPoints: { decrement: skill.cost },
      },
    });
  });
}

export async function startSeasonFiveFishingTrip({
  userId,
  locationKey,
  db = prisma,
  now = new Date(),
}: {
  userId: string;
  locationKey: string;
  db?: DatabaseClient;
  now?: Date;
}) {
  const cycle = await ensureSeasonFivePreviewCycle({ db, now });
  const destination = await db.seasonFiveFishingLocation.findUnique({
    where: {
      cycleId_key: {
        cycleId: cycle.id,
        key: locationKey,
      },
    },
  });

  if (!destination || destination.kind === SeasonFiveLocationKind.HOME) {
    throw new GameError("Choose a lake or sea fishing spot.");
  }

  const character = await getSeasonFiveCharacterForUser({
    userId,
    cycleId: cycle.id,
    db,
  });

  if (!character) {
    throw new GameError("Create a Season 5 character before travelling.");
  }

  const effects = getSeasonFiveBuildEffects({
    characterClass: character.class,
    gear: character.gear,
    purchasedNodeKeys: character.skillPurchases.map(
      (purchase) => purchase.nodeKey
    ),
  });
  await db.seasonFiveCharacter.update({
    where: { id: character.id },
    data: createSeasonFiveTravelState({
      destination,
      now,
      travelPercent: effects.travelPercent,
    }),
  });
}

export async function returnSeasonFiveHome({
  userId,
  db = prisma,
  now = new Date(),
}: {
  userId: string;
  db?: DatabaseClient;
  now?: Date;
}) {
  const cycle = await ensureSeasonFivePreviewCycle({ db, now });
  const home = await db.seasonFiveFishingLocation.findUniqueOrThrow({
    where: {
      cycleId_key: {
        cycleId: cycle.id,
        key: "home",
      },
    },
  });
  const character = await getSeasonFiveCharacterForUser({
    userId,
    cycleId: cycle.id,
    db,
  });

  if (!character) {
    throw new GameError("Create a Season 5 character before returning home.");
  }

  if (character.currentLocationId === home.id) {
    await unloadSeasonFiveInventory({ characterId: character.id, db, now });
    await db.seasonFiveCharacter.update({
      where: { id: character.id },
      data: createSeasonFiveHomeState({ homeId: home.id, now }),
    });
    return;
  }

  const effects = getSeasonFiveBuildEffects({
    characterClass: character.class,
    gear: character.gear,
    purchasedNodeKeys: character.skillPurchases.map(
      (purchase) => purchase.nodeKey
    ),
  });
  await db.seasonFiveCharacter.update({
    where: { id: character.id },
    data: createSeasonFiveTravelState({
      destination: home,
      now,
      travelPercent: effects.travelPercent,
      baseMinutes: 10,
    }),
  });
}

async function unloadSeasonFiveInventory({
  characterId,
  db,
  now,
}: {
  characterId: string;
  db: DatabaseClient;
  now: Date;
}) {
  const items = await db.seasonFiveInventoryItem.findMany({
    where: {
      characterId,
      unloadedAt: null,
    },
    select: {
      fishCatchId: true,
    },
  });

  if (items.length === 0) return;

  const fishCatchIds = items.map((item) => item.fishCatchId);
  await db.$transaction([
    db.seasonFiveInventoryItem.updateMany({
      where: {
        characterId,
        unloadedAt: null,
      },
      data: {
        unloadedAt: now,
      },
    }),
    db.seasonFiveFishCatch.updateMany({
      where: {
        id: {
          in: fishCatchIds,
        },
      },
      data: {
        unloadedAt: now,
      },
    }),
  ]);
}

export async function getSeasonFiveHomeState({
  userId,
  db = prisma,
  now = new Date(),
}: {
  userId?: string;
  db?: DatabaseClient;
  now?: Date;
}) {
  const cycle = await ensureSeasonFivePreviewCycle({ db, now });
  await rotateSeasonFiveMapSpecials({ cycleId: cycle.id, db, now });
  const locations = await db.seasonFiveFishingLocation.findMany({
    where: {
      cycleId: cycle.id,
    },
    orderBy: [{ kind: "asc" }, { travelMinutes: "asc" }, { name: "asc" }],
  });
  const mapTiles = await db.seasonFiveMapTile.findMany({
    where: {
      cycleId: cycle.id,
    },
    orderBy: [{ row: "asc" }, { col: "asc" }],
  });
  const character = userId
    ? await getSeasonFiveCharacterForUser({ userId, cycleId: cycle.id, db })
    : null;
  const mapCharacters = await db.seasonFiveCharacter.findMany({
    where: {
      cycleId: cycle.id,
    },
    orderBy: [{ totalFishCaught: "desc" }, { createdAt: "asc" }],
    take: 80,
    select: {
      id: true,
      name: true,
      class: true,
      actionKind: true,
      currentLocationId: true,
      destinationLocationId: true,
      inventoryCapacity: true,
      inventoryItems: {
        select: {
          slots: true,
        },
      },
      gear: {
        select: {
          key: true,
          slot: true,
          power: true,
          equipped: true,
        },
      },
      skillPurchases: {
        select: {
          nodeKey: true,
        },
      },
    },
  });
  const mostFishCandidates = await db.seasonFiveCharacter.findMany({
    where: {
      cycleId: cycle.id,
      totalFishCaught: {
        gt: 0,
      },
    },
    select: {
      id: true,
      name: true,
      class: true,
      totalFishCaught: true,
      biggestFishCm: true,
      createdAt: true,
    },
  });
  const biggestFishCandidates = await db.seasonFiveFishCatch.findMany({
    where: {
      cycleId: cycle.id,
    },
    orderBy: [{ sizeCm: "desc" }, { caughtAt: "asc" }, { id: "asc" }],
    take: 100,
    select: {
      id: true,
      speciesName: true,
      rarity: true,
      sizeCm: true,
      caughtAt: true,
      location: {
        select: {
          name: true,
        },
      },
      character: {
        select: {
          id: true,
          name: true,
          class: true,
          totalFishCaught: true,
          biggestFishCm: true,
          createdAt: true,
        },
      },
    },
  });
  const topByCount = rankSeasonFiveMostFish(mostFishCandidates);
  const topBySize = rankSeasonFiveBiggestFish(biggestFishCandidates);

  const effects = character
    ? getSeasonFiveBuildEffects({
        characterClass: character.class,
        gear: character.gear,
        purchasedNodeKeys: character.skillPurchases.map(
          (purchase) => purchase.nodeKey
        ),
      })
    : null;
  const inventoryUsed =
    character?.inventoryItems.reduce((sum, item) => sum + item.slots, 0) ?? 0;
  const inventoryCapacity =
    character && effects
      ? calculateSeasonFiveInventoryCapacity({
          baseCapacity: character.inventoryCapacity,
          inventoryBonus: effects.inventoryBonus,
        })
      : 0;
  const inventoryPressure = getSeasonFiveInventoryPressure({
    inventoryUsed,
    inventoryCapacity,
  });
  const purchasedSkillKeys = new Set(
    character?.skillPurchases.map((purchase) =>
      resolveSkillKey(purchase.nodeKey)
    ) ?? []
  );
  const skillTree = character
    ? (
        SEASON_FIVE_SKILL_TREES[
          character.class
        ] as readonly SeasonFiveSkillNode[]
      ).map((skill) => {
        const purchased = purchasedSkillKeys.has(skill.key);
        const available =
          !purchased &&
          character.skillPoints >= skill.cost &&
          (skill.requires ?? []).every((requiredKey) =>
            purchasedSkillKeys.has(requiredKey)
          );
        return {
          ...skill,
          purchased,
          available,
          locked: !purchased && !available,
          missingRequirements: (skill.requires ?? []).filter(
            (requiredKey) => !purchasedSkillKeys.has(requiredKey)
          ),
        };
      })
    : [];
  const locationActivity = buildSeasonFiveLocationActivity({
    locations,
    characters: mapCharacters.map((entry) => {
      const entryEffects = getSeasonFiveBuildEffects({
        characterClass: entry.class,
        gear: entry.gear,
        purchasedNodeKeys: entry.skillPurchases.map(
          (purchase) => purchase.nodeKey
        ),
      });
      const entryInventoryUsed = entry.inventoryItems.reduce(
        (sum, item) => sum + item.slots,
        0
      );
      const entryInventoryCapacity = calculateSeasonFiveInventoryCapacity({
        baseCapacity: entry.inventoryCapacity,
        inventoryBonus: entryEffects.inventoryBonus,
      });

      return {
        id: entry.id,
        name: entry.name,
        class: entry.class,
        classLabel: getSeasonFiveClassLabel(entry.class),
        actionKind: entry.actionKind,
        currentLocationId: entry.currentLocationId,
        destinationLocationId: entry.destinationLocationId,
        inventoryUsed: entryInventoryUsed,
        inventoryCapacity: entryInventoryCapacity,
      };
    }),
  });
  const characterEffects =
    character && effects
      ? effects
      : character
        ? getSeasonFiveBuildEffects({
            characterClass: character.class,
            gear: character.gear,
            purchasedNodeKeys: character.skillPurchases.map(
              (purchase) => purchase.nodeKey
            ),
          })
        : null;

  return {
    cycle: {
      id: cycle.id,
      activeEndsAt: cycle.activeEndsAt,
    },
    statLabels: SEASON_FIVE_STAT_LABELS,
    statDescriptions: SEASON_FIVE_STAT_DESCRIPTIONS,
    classes: Object.entries(SEASON_FIVE_CLASSES).map(([key, definition]) => ({
      key,
      ...definition,
    })),
    skills: skillTree,
    skillTrees: SEASON_FIVE_SKILL_TREES,
    map: {
      columns: 16,
      rows: 10,
      tiles: mapTiles.map((tile) => {
        const hasRequiredKey =
          !tile.requiredKey ||
          Boolean(
            character?.keyItems.some((item) => item.key === tile.requiredKey)
          );
        const visibleRole = tile.hidden ? SeasonFiveMapRole.NONE : tile.role;

        return {
          id: tile.id,
          key: tile.key,
          row: tile.row,
          col: tile.col,
          xPercent: tile.xPercent,
          yPercent: tile.yPercent,
          terrain: tile.terrain,
          visualVariant: tile.visualVariant,
          role: visibleRole,
          roleLabel: tile.hidden ? null : tile.roleLabel,
          hidden: tile.hidden,
          locked: Boolean(tile.requiredKey && !hasRequiredKey),
          requiredKey: tile.hidden ? null : tile.requiredKey,
          expiresAt: tile.hidden ? null : tile.expiresAt,
        };
      }),
    },
    locations: locations.map((location) => ({
      id: location.id,
      key: location.key,
      name: location.name,
      kind: location.kind,
      tileKey:
        mapTiles.find((tile) => tile.id === location.tileId)?.key ??
        getSeasonFiveLocationTileKey(location.key),
      xPercent: location.xPercent,
      yPercent: location.yPercent,
      travelMinutes: location.travelMinutes,
      minFishCm: location.minFishCm,
      maxFishCm: location.maxFishCm,
      catchDifficulty: location.catchDifficulty,
    })),
    locationActivity,
    character: character
      ? {
          id: character.id,
          name: character.name,
          class: character.class,
          classLabel: getSeasonFiveClassLabel(character.class),
          level: character.level,
          experience: character.experience,
          skillPoints: character.skillPoints,
          totalFishCaught: character.totalFishCaught,
          biggestFishCm: character.biggestFishCm,
          action: getSeasonFiveActionSummary({
            actionKind: character.actionKind,
            currentLocation: character.currentLocation,
            destinationLocation: character.destinationLocation,
            actionStartedAt: character.actionStartedAt,
            actionCompletesAt: character.actionCompletesAt,
            now,
          }),
          actionKind: character.actionKind,
          actionStartedAt: character.actionStartedAt,
          actionCompletesAt: character.actionCompletesAt,
          currentLocationKey: character.currentLocation?.key ?? null,
          currentTileKey: character.currentLocation?.tile?.key ?? null,
          currentLocationName: character.currentLocation?.name ?? "Unknown",
          destinationLocationKey: character.destinationLocation?.key ?? null,
          destinationTileKey: character.destinationLocation?.tile?.key ?? null,
          destinationLocationName: character.destinationLocation?.name ?? null,
          inventoryUsed,
          inventoryCapacity,
          inventoryRemaining: inventoryPressure.remaining,
          inventoryPercent: inventoryPressure.percent,
          inventoryPressureLabel: inventoryPressure.label,
          inventoryCloseToFull: inventoryPressure.closeToFull,
          inventoryFull: inventoryPressure.full,
          stats: characterEffects!.stats,
          effects: characterEffects!,
          gear: character.gear.map((gear) => ({
            id: gear.id,
            slot: gear.slot,
            key: gear.key,
            name: gear.name,
            rarity: gear.rarity,
            power: gear.power,
            equipped: gear.equipped,
            statBonuses:
              STARTER_GEAR_BY_KEY.get(gear.key)?.statBonuses ?? EMPTY_STATS,
          })),
          skillPurchases: character.skillPurchases.map((purchase) =>
            resolveSkillKey(purchase.nodeKey)
          ),
          inventory: character.inventoryItems.map((item) => ({
            id: item.id,
            slots: item.slots,
            speciesName: item.fishCatch.speciesName,
            rarity: item.fishCatch.rarity,
            sizeCm: item.fishCatch.sizeCm,
            caughtAt: item.fishCatch.caughtAt,
          })),
        }
      : null,
    leaderboards: {
      mostFish: topByCount.map((entry) => ({
        ...entry,
        classLabel: getSeasonFiveClassLabel(entry.class),
      })),
      biggestFish: topBySize.map((entry) => ({
        ...entry,
        classLabel: getSeasonFiveClassLabel(entry.class),
      })),
    },
  };
}

export type SeasonFiveHomeState = Awaited<
  ReturnType<typeof getSeasonFiveHomeState>
>;

export function getDegradedSeasonFiveHomeState(): SeasonFiveHomeState {
  return {
    cycle: {
      id: "",
      activeEndsAt: null,
    },
    statLabels: SEASON_FIVE_STAT_LABELS,
    statDescriptions: SEASON_FIVE_STAT_DESCRIPTIONS,
    classes: Object.entries(SEASON_FIVE_CLASSES).map(([key, definition]) => ({
      key,
      ...definition,
    })),
    skills: [],
    skillTrees: SEASON_FIVE_SKILL_TREES,
    map: {
      columns: 16,
      rows: 10,
      tiles: createSeasonFiveMapTiles().map((tile) => ({
        id: tile.key,
        key: tile.key,
        row: tile.row,
        col: tile.col,
        xPercent: tile.xPercent,
        yPercent: tile.yPercent,
        terrain: tile.terrain,
        visualVariant: tile.visualVariant,
        role: tile.role,
        roleLabel: tile.roleLabel,
        hidden: tile.hidden,
        locked: false,
        requiredKey: tile.requiredKey,
        expiresAt: tile.expiresAt,
      })),
    },
    locations: SEASON_FIVE_LOCATIONS.map((location) => ({
      id: location.key,
      key: location.key,
      name: location.name,
      kind: location.kind,
      tileKey: getSeasonFiveLocationTileKey(location.key),
      xPercent: location.xPercent,
      yPercent: location.yPercent,
      travelMinutes: location.travelMinutes,
      minFishCm: location.minFishCm,
      maxFishCm: location.maxFishCm,
      catchDifficulty: location.catchDifficulty,
    })),
    locationActivity: SEASON_FIVE_LOCATIONS.map((location) => ({
      locationKey: location.key,
      totalCount: 0,
      overflowCount: 0,
      characters: [],
    })),
    character: null,
    leaderboards: {
      mostFish: [],
      biggestFish: [],
    },
  };
}

export async function processSeasonFiveTick({
  cycleId,
  now = new Date(),
  db = prisma,
}: {
  cycleId: string;
  now?: Date;
  db?: DatabaseClient;
}) {
  const resolvedAt = floorToMinute(now);
  await rotateSeasonFiveMapSpecials({ cycleId, db, now: resolvedAt });
  const dueTravellers = await db.seasonFiveCharacter.findMany({
    where: {
      cycleId,
      actionKind: SeasonFiveActionKind.TRAVELING,
      actionCompletesAt: {
        lte: resolvedAt,
      },
    },
    include: {
      destinationLocation: true,
    },
  });
  let travelCompleted = 0;
  let catchesCreated = 0;
  let mapDiscoveries = 0;

  for (const character of dueTravellers) {
    const destination = character.destinationLocation;
    if (!destination) continue;

    if (destination.kind === SeasonFiveLocationKind.HOME) {
      await unloadSeasonFiveInventory({
        characterId: character.id,
        db,
        now: resolvedAt,
      });
      await db.seasonFiveCharacter.update({
        where: { id: character.id },
        data: resolveSeasonFiveCompletedTravel({
          destination,
          resolvedAt,
        }),
      });
    } else {
      await db.seasonFiveCharacter.update({
        where: { id: character.id },
        data: resolveSeasonFiveCompletedTravel({
          destination,
          resolvedAt,
        }),
      });
    }
    travelCompleted += 1;
  }

  const fishers = await db.seasonFiveCharacter.findMany({
    where: {
      cycleId,
      actionKind: SeasonFiveActionKind.FISHING,
      currentLocationId: {
        not: null,
      },
    },
    include: {
      currentLocation: true,
      gear: true,
      skillPurchases: true,
      inventoryItems: {
        where: {
          unloadedAt: null,
        },
      },
    },
  });
  let hiddenSecretTiles = await db.seasonFiveMapTile.findMany({
    where: {
      cycleId,
      role: SeasonFiveMapRole.SECRET_LAKE,
      hidden: true,
    },
    select: {
      key: true,
    },
  });

  for (const character of fishers) {
    const location = character.currentLocation;
    if (!location || location.kind === SeasonFiveLocationKind.HOME) {
      continue;
    }

    const effects = getSeasonFiveBuildEffects({
      characterClass: character.class,
      gear: character.gear,
      purchasedNodeKeys: character.skillPurchases.map(
        (purchase) => purchase.nodeKey
      ),
    });
    const discoveredTileKey = rollSeasonFiveGlobalDiscovery({
      seed: `${character.id}:${resolvedAt.toISOString()}:secret-lake`,
      luk: effects.stats.luk,
      hiddenTiles: hiddenSecretTiles,
    });
    if (discoveredTileKey) {
      await db.seasonFiveMapTile.update({
        where: {
          cycleId_key: {
            cycleId,
            key: discoveredTileKey,
          },
        },
        data: {
          hidden: false,
          discoveredAt: resolvedAt,
        },
      });
      hiddenSecretTiles = hiddenSecretTiles.filter(
        (tile) => tile.key !== discoveredTileKey
      );
      mapDiscoveries += 1;
    }
    const capacity = calculateSeasonFiveInventoryCapacity({
      baseCapacity: character.inventoryCapacity,
      inventoryBonus: effects.inventoryBonus,
    });
    const usedSlots = character.inventoryItems.reduce(
      (sum, item) => sum + item.slots,
      0
    );
    const interval = calculateSeasonFiveCatchIntervalMinutes({
      catchDifficulty: location.catchDifficulty,
      catchBonus: effects.catchBonus,
    });
    const plan = planSeasonFivePassiveCatches({
      lastResolvedAt: character.lastResolvedAt,
      resolvedAt,
      catchIntervalMinutes: interval,
      inventoryUsed: usedSlots,
      inventoryCapacity: capacity,
      createCatch: (tickAt) =>
        createSeasonFiveCatch({
          seed: `${character.id}:${location.key}:${tickAt.toISOString()}`,
          minFishCm: location.minFishCm,
          maxFishCm: location.maxFishCm,
          difficulty: location.catchDifficulty,
          sizeBonusPercent: effects.sizeBonusPercent,
          rarityBonus: effects.rarityBonus,
          inventoryPressure: Math.max(
            1,
            location.inventoryPressure - effects.inventoryPressureReduction
          ),
        }),
    });

    if (plan.catches.length === 0) {
      await db.seasonFiveCharacter.update({
        where: { id: character.id },
        data: {
          lastResolvedAt: plan.nextResolvedAt,
        },
      });
      continue;
    }

    await db.$transaction(async (tx) => {
      let biggest = character.biggestFishCm;
      for (const plannedCatch of plan.catches) {
        const fish = plannedCatch.fish;
        const created = await tx.seasonFiveFishCatch.create({
          data: {
            cycleId,
            characterId: character.id,
            locationId: location.id,
            caughtAt: plannedCatch.tickAt,
            ...fish,
          },
        });
        await tx.seasonFiveInventoryItem.create({
          data: {
            characterId: character.id,
            fishCatchId: created.id,
            slots: fish.inventorySlots,
          },
        });
        biggest = Math.max(biggest, fish.sizeCm);
      }

      const experienceGain = plan.catches.length * 5;
      const progression = getSeasonFiveProgressionAfterExperience({
        level: character.level,
        skillPoints: character.skillPoints,
        experience: character.experience + experienceGain,
      });

      await tx.seasonFiveCharacter.update({
        where: { id: character.id },
        data: {
          totalFishCaught: {
            increment: plan.catches.length,
          },
          experience: {
            increment: experienceGain,
          },
          level: progression.level,
          skillPoints: progression.skillPoints,
          biggestFishCm: biggest,
          lastResolvedAt: plan.nextResolvedAt,
        },
      });
    });
    catchesCreated += plan.catches.length;
  }

  return {
    travelCompleted,
    catchesCreated,
    mapDiscoveries,
  };
}
