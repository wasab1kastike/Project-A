import { prisma } from "@/lib/prisma";
import {
  CycleRuleset,
  CycleStatus,
  SeasonFiveActionKind,
  SeasonFiveCatchKind,
  SeasonFiveCharacterClass,
  SeasonFiveFishRarity,
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
  SEASON_FIVE_WATER_BODY_PROFILES,
  SEASON_FIVE_WATER_BODY_REVEAL_HOURS,
  createSeasonFiveMapTiles,
  getSeasonFiveDailyRotationKey,
  getSeasonFiveLocationTileKey,
  getSeasonFiveWaterBodyStockLabel,
  planSeasonFiveDailySpecialTiles,
  planSeasonFiveFishingLocations,
  planSeasonFiveWaterBodies,
  regenerateSeasonFiveWaterBodyStock,
  rollSeasonFiveWaterBodyDiscovery,
  type SeasonFiveWaterBodyProfileKey,
} from "./season-five-map";
import { buildSeasonFiveLocationActivity } from "./season-five-presence";
import {
  calculateSeasonFiveCatchIntervalMinutes,
  calculateSeasonFiveInventoryCapacity,
  createSeasonFiveCatch as createSeasonFiveCatchFromBalance,
  deriveSeasonFiveBuildEffectValues,
} from "./season-five-balance";
import { addHours, addMinutes, floorToMinute } from "./time";

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
  rhythmCatchBonus: number;
  rhythmPressureReduction: number;
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
  rhythmCatchBonus: 0,
  rhythmPressureReduction: 0,
} satisfies Required<SeasonFiveEffectBonuses>;

export const SEASON_FIVE_STARTER_SKILL_POINTS = 2;
export const SEASON_FIVE_LEVEL_XP = 50;
export const SEASON_FIVE_MAX_LEVEL = 11;
export const SEASON_FIVE_MAX_SKILL_POINTS =
  SEASON_FIVE_STARTER_SKILL_POINTS + SEASON_FIVE_MAX_LEVEL - 1;
export const SEASON_FIVE_RHYTHM_STEP_MINUTES = 30;
export const SEASON_FIVE_MAX_RHYTHM_STAGE = 3;

export const SEASON_FIVE_CLASSES = {
  [SeasonFiveCharacterClass.DRUNKEN_MONK]: {
    label: "Drunken Monk",
    summary: "Finds rhythm in bad balance. The best long-session tempo class.",
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
      "Treats fishing like one last campaign. The trophy and heavy-pack specialist.",
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
      "Knows where the quiet docks are. The fastest and quietest pack specialist.",
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
        description:
          "Unlock rhythm: +1 catch tempo and +1 rhythm tempo per stage.",
        cost: 1,
        effectBonuses: { catchBonus: 1, rhythmCatchBonus: 1 },
      },
      {
        key: "monk_river_breath",
        name: "River Breath",
        description: "+2 catch tempo, +1 Smell, and +1 rhythm tempo per stage.",
        cost: 1,
        statBonuses: { smell: 1 },
        effectBonuses: { catchBonus: 2, rhythmCatchBonus: 1 },
      },
      {
        key: "monk_foam_timing",
        name: "Foam Timing",
        description: "+2 catch tempo and +1 rhythm tempo per stage.",
        cost: 1,
        effectBonuses: { catchBonus: 2, rhythmCatchBonus: 1 },
      },
      {
        key: "monk_perfect_stumble",
        name: "Perfect Stumble",
        description:
          "Capstone rhythm: +3 catch tempo and +2 rhythm tempo per stage.",
        cost: 2,
        effectBonuses: {
          catchBonus: 3,
          rhythmCatchBonus: 2,
        },
      },
    ]),
    ...createSeasonFiveSkillPath("monk_stillness", "Stillness", [
      {
        key: "monk_breath_in_mug",
        name: "Breath in Mug",
        description: "-5% travel time and -1 rhythm pack pressure per stage.",
        cost: 1,
        effectBonuses: { travelPercent: -5, rhythmPressureReduction: 1 },
      },
      {
        key: "monk_dock_nap",
        name: "Dock Nap",
        description:
          "+1 Quietness, -1 pack pressure, and -1 rhythm pressure per stage.",
        cost: 1,
        statBonuses: { quietness: 1 },
        effectBonuses: {
          inventoryPressureReduction: 1,
          rhythmPressureReduction: 1,
        },
      },
      {
        key: "monk_sober_second",
        name: "Sober Second",
        description: "-5% travel time and -1 rhythm pack pressure per stage.",
        cost: 1,
        effectBonuses: { travelPercent: -5, rhythmPressureReduction: 1 },
      },
      {
        key: "monk_empty_cup",
        name: "Empty Cup",
        description:
          "Capstone stillness: +2 pack slots, -1 pressure, and -2 rhythm pressure per stage.",
        cost: 2,
        effectBonuses: {
          inventoryBonus: 2,
          inventoryPressureReduction: 1,
          rhythmPressureReduction: 2,
        },
      },
    ]),
    ...createSeasonFiveSkillPath("monk_lucky_mess", "Lucky Mess", [
      {
        key: "monk_lucky_spill",
        name: "Lucky Spill",
        description: "+2 rarity without leaving the rhythm plan.",
        cost: 1,
        effectBonuses: { rarityBonus: 2 },
      },
      {
        key: "monk_barrel_stance",
        name: "Barrel Stance",
        description: "+1 Stronk and +1 pack slot for messy hauls.",
        cost: 1,
        statBonuses: { stronk: 1 },
        effectBonuses: { inventoryBonus: 1 },
      },
      {
        key: "monk_accidental_bait",
        name: "Accidental Bait",
        description: "+2 rarity and -1 pack pressure.",
        cost: 1,
        effectBonuses: { rarityBonus: 2, inventoryPressureReduction: 1 },
      },
      {
        key: "monk_happy_blackout",
        name: "Happy Blackout",
        description: "+4 rarity and +2 pack slots as the secondary luck path.",
        cost: 2,
        effectBonuses: { rarityBonus: 4, inventoryBonus: 2 },
      },
    ]),
  ],
  [SeasonFiveCharacterClass.RETIRED_WARRIOR]: [
    ...createSeasonFiveSkillPath("warrior_trophy_hunter", "Trophy Hunter", [
      {
        key: "warrior_campaign_grip",
        name: "Campaign Grip",
        description: "+1 Stronk and +8% trophy weight.",
        cost: 1,
        statBonuses: { stronk: 1 },
        effectBonuses: { sizeBonusPercent: 8 },
      },
      {
        key: "warrior_trophy_drag",
        name: "Trophy Drag",
        description: "+12% trophy weight.",
        cost: 1,
        effectBonuses: { sizeBonusPercent: 12 },
      },
      {
        key: "warrior_old_hooks",
        name: "Old Hooks",
        description: "+8% trophy weight from trusted old hardware.",
        cost: 1,
        effectBonuses: { sizeBonusPercent: 8 },
      },
      {
        key: "warrior_final_campaign",
        name: "Final Campaign",
        description: "Capstone trophy plan: +18% trophy weight and +2 rarity.",
        cost: 2,
        effectBonuses: { sizeBonusPercent: 18, rarityBonus: 2 },
      },
    ]),
    ...createSeasonFiveSkillPath("warrior_campaign_pack", "Campaign Pack", [
      {
        key: "warrior_field_creel",
        name: "Field Creel",
        description: "+4 pack slots.",
        cost: 1,
        effectBonuses: { inventoryBonus: 4 },
      },
      {
        key: "warrior_supply_lines",
        name: "Supply Lines",
        description: "-1 pack pressure under campaign discipline.",
        cost: 1,
        effectBonuses: { inventoryPressureReduction: 1 },
      },
      {
        key: "warrior_ration_space",
        name: "Ration Space",
        description: "+1 Stronk and +4 pack slots.",
        cost: 1,
        statBonuses: { stronk: 1 },
        effectBonuses: { inventoryBonus: 4 },
      },
      {
        key: "warrior_baggage_train",
        name: "Baggage Train",
        description: "Capstone pack plan: +8 pack slots and -2 pack pressure.",
        cost: 2,
        effectBonuses: { inventoryBonus: 8, inventoryPressureReduction: 2 },
      },
    ]),
    ...createSeasonFiveSkillPath("warrior_siege_patience", "Siege Patience", [
      {
        key: "warrior_old_maps",
        name: "Old Maps",
        description:
          "+1 catch tempo from knowing which waters are worth the march.",
        cost: 1,
        effectBonuses: { catchBonus: 1 },
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
        description: "+1 catch tempo and +4% trophy weight.",
        cost: 1,
        effectBonuses: { catchBonus: 1, sizeBonusPercent: 4 },
      },
      {
        key: "warrior_no_retreat",
        name: "No Retreat",
        description: "Capstone patience: +1 catch tempo and +6% trophy weight.",
        cost: 2,
        effectBonuses: { catchBonus: 1, sizeBonusPercent: 6 },
      },
    ]),
  ],
  [SeasonFiveCharacterClass.DEMENTED_WIZARD]: [
    ...createSeasonFiveSkillPath("wizard_moon_logic", "Moon Logic", [
      {
        key: "wizard_moon_ledger",
        name: "Moon Ledger",
        description: "+8 rarity when the tide signs the receipt.",
        cost: 1,
        effectBonuses: { rarityBonus: 8 },
      },
      {
        key: "wizard_star_bait",
        name: "Star Bait",
        description: "+1 Magik and +8 rarity.",
        cost: 1,
        statBonuses: { magik: 1 },
        effectBonuses: { rarityBonus: 8 },
      },
      {
        key: "wizard_probability_hook",
        name: "Probability Hook",
        description: "+10 rarity by hooking the less likely fish.",
        cost: 1,
        effectBonuses: { rarityBonus: 10 },
      },
      {
        key: "wizard_argument_with_sea",
        name: "Argument with Sea",
        description: "Capstone rarity plan: +14 rarity and +4% trophy weight.",
        cost: 2,
        effectBonuses: { rarityBonus: 14, sizeBonusPercent: 4 },
      },
    ]),
    ...createSeasonFiveSkillPath("wizard_bent_distance", "Bent Distance", [
      {
        key: "wizard_pocket_portal",
        name: "Pocket Portal",
        description: "-5% travel time by folding the road badly.",
        cost: 1,
        effectBonuses: { travelPercent: -5 },
      },
      {
        key: "wizard_wet_shortcut",
        name: "Wet Shortcut",
        description: "-5% travel time and +1 catch tempo.",
        cost: 1,
        effectBonuses: { travelPercent: -5, catchBonus: 1 },
      },
      {
        key: "wizard_unhelpful_map",
        name: "Unhelpful Map",
        description:
          "-5% travel time and +2 rarity from being confidently wrong.",
        cost: 1,
        effectBonuses: { travelPercent: -5, rarityBonus: 2 },
      },
      {
        key: "wizard_elsewhere_now",
        name: "Elsewhere Now",
        description:
          "Capstone distance trick: -5% travel time and +1 catch tempo.",
        cost: 2,
        effectBonuses: { travelPercent: -5, catchBonus: 1 },
      },
    ]),
    ...createSeasonFiveSkillPath("wizard_deep_muttering", "Deep Muttering", [
      {
        key: "wizard_muttered_bait",
        name: "Muttered Bait",
        description: "+1 Magik and +1 catch tempo.",
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
        description: "+8% trophy weight and +5 rarity in deep water.",
        cost: 1,
        effectBonuses: { sizeBonusPercent: 8, rarityBonus: 5 },
      },
      {
        key: "wizard_abyssal_chorus",
        name: "Abyssal Chorus",
        description:
          "Capstone deep plan: +2 catch tempo, +8 rarity, and +6% size.",
        cost: 2,
        effectBonuses: { catchBonus: 2, rarityBonus: 8, sizeBonusPercent: 6 },
      },
    ]),
  ],
  [SeasonFiveCharacterClass.BURNT_OUT_ROGUE]: [
    ...createSeasonFiveSkillPath("rogue_soft_steps", "Soft Steps", [
      {
        key: "rogue_soft_boots",
        name: "Soft Boots",
        description: "-12% travel time. The dock never hears you quit.",
        cost: 1,
        effectBonuses: { travelPercent: -12 },
      },
      {
        key: "rogue_muddy_shortcuts",
        name: "Muddy Shortcuts",
        description: "+1 Quietness and -8% travel time.",
        cost: 1,
        statBonuses: { quietness: 1 },
        effectBonuses: { travelPercent: -8 },
      },
      {
        key: "rogue_no_splash",
        name: "No Splash",
        description: "-8% travel time and -1 pack pressure.",
        cost: 1,
        effectBonuses: { travelPercent: -8, inventoryPressureReduction: 1 },
      },
      {
        key: "rogue_disappear_twice",
        name: "Disappear Twice",
        description:
          "Capstone speed plan: -12% travel time and -1 pack pressure.",
        cost: 2,
        effectBonuses: { travelPercent: -12, inventoryPressureReduction: 1 },
      },
    ]),
    ...createSeasonFiveSkillPath("rogue_dirty_luck", "Dirty Luck", [
      {
        key: "rogue_stolen_lure",
        name: "Stolen Lure",
        description: "+4 rarity. Probably yours now.",
        cost: 1,
        effectBonuses: { rarityBonus: 4 },
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
        description: "+4 rarity and +1 catch tempo.",
        cost: 1,
        effectBonuses: { rarityBonus: 4, catchBonus: 1 },
      },
      {
        key: "rogue_luck_was_work",
        name: "Luck Was Work",
        description: "Capstone luck plan: +5 rarity and +1 catch tempo.",
        cost: 2,
        effectBonuses: { rarityBonus: 5, catchBonus: 1 },
      },
    ]),
    ...createSeasonFiveSkillPath("rogue_false_bottoms", "False Bottoms", [
      {
        key: "rogue_false_bottom",
        name: "False Bottom",
        description: "+2 pack slots and -1 pack pressure.",
        cost: 1,
        effectBonuses: { inventoryBonus: 2, inventoryPressureReduction: 1 },
      },
      {
        key: "rogue_second_pocket",
        name: "Second Pocket",
        description: "+2 pack slots and -1 pack pressure.",
        cost: 1,
        effectBonuses: { inventoryBonus: 2, inventoryPressureReduction: 1 },
      },
      {
        key: "rogue_quiet_pack",
        name: "Quiet Pack",
        description: "-2 pack pressure.",
        cost: 1,
        effectBonuses: { inventoryPressureReduction: 2 },
      },
      {
        key: "rogue_smuggler_creel",
        name: "Smuggler Creel",
        description:
          "Capstone pressure plan: +4 pack slots and -2 pack pressure.",
        cost: 2,
        effectBonuses: { inventoryBonus: 4, inventoryPressureReduction: 2 },
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
    minWeightGrams: 0,
    maxWeightGrams: 0,
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
    minWeightGrams: 300,
    maxWeightGrams: 9000,
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
    minWeightGrams: 500,
    maxWeightGrams: 12000,
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
    minWeightGrams: 2000,
    maxWeightGrams: 35000,
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
    minWeightGrams: 3500,
    maxWeightGrams: 55000,
    inventoryPressure: 2,
  },
] as const;

type SeasonFiveEquipmentCatalogItem = {
  slot: SeasonFiveGearSlot;
  key: string;
  name: string;
  description: string;
  rarity: SeasonFiveGearRarity;
  power: number;
  price: number;
  statBonuses: Partial<SeasonFiveStats>;
  classRestriction?: SeasonFiveCharacterClass;
  catchable?: boolean;
  visualKey: string;
};

type SeasonFiveBaitCatalogItem = {
  key: string;
  name: string;
  description: string;
  rarity: SeasonFiveGearRarity;
  price: number;
  quantity: number;
  durationMinutes: number;
  effects: SeasonFiveEffectBonuses;
};

export const SEASON_FIVE_GEAR_SLOT_LABELS = {
  [SeasonFiveGearSlot.BODY]: "Body",
  [SeasonFiveGearSlot.OUTFIT]: "Outfit",
  [SeasonFiveGearSlot.HAT]: "Hat",
  [SeasonFiveGearSlot.ROD]: "Rod",
} satisfies Record<SeasonFiveGearSlot, string>;

const SEASON_FIVE_EQUIPMENT_CATALOG: readonly SeasonFiveEquipmentCatalogItem[] =
  [
    {
      slot: SeasonFiveGearSlot.BODY,
      key: "body-drunken-monk",
      name: "Pickled Monk Frame",
      description: "Round shoulders, perfect balance, and questionable pores.",
      rarity: SeasonFiveGearRarity.COMMON,
      power: 0,
      price: 0,
      statBonuses: { smell: 1 },
      classRestriction: SeasonFiveCharacterClass.DRUNKEN_MONK,
      visualKey: "monk",
    },
    {
      slot: SeasonFiveGearSlot.BODY,
      key: "body-retired-warrior",
      name: "Retired Bruiser Frame",
      description: "Old campaign posture with knees that audibly negotiate.",
      rarity: SeasonFiveGearRarity.COMMON,
      power: 0,
      price: 0,
      statBonuses: { stronk: 1 },
      classRestriction: SeasonFiveCharacterClass.RETIRED_WARRIOR,
      visualKey: "warrior",
    },
    {
      slot: SeasonFiveGearSlot.BODY,
      key: "body-demented-wizard",
      name: "Scrawny Wizard Body",
      description: "Default twig wizard build. Pants included for diplomacy.",
      rarity: SeasonFiveGearRarity.COMMON,
      power: 0,
      price: 0,
      statBonuses: { magik: 1 },
      classRestriction: SeasonFiveCharacterClass.DEMENTED_WIZARD,
      visualKey: "wizard",
    },
    {
      slot: SeasonFiveGearSlot.BODY,
      key: "body-burnt-out-rogue",
      name: "Twitchy Rogue Frame",
      description: "Lean, evasive, and deeply familiar with unpaid tabs.",
      rarity: SeasonFiveGearRarity.COMMON,
      power: 0,
      price: 0,
      statBonuses: { quietness: 1 },
      classRestriction: SeasonFiveCharacterClass.BURNT_OUT_ROGUE,
      visualKey: "rogue",
    },
    {
      slot: SeasonFiveGearSlot.OUTFIT,
      key: "threadbare-pants",
      name: "Threadbare Pants",
      description: "The default lower-body policy. Barely enforceable.",
      rarity: SeasonFiveGearRarity.COMMON,
      power: 0,
      price: 0,
      statBonuses: { quietness: 1 },
      visualKey: "pants",
    },
    {
      slot: SeasonFiveGearSlot.ROD,
      key: "splintered-rod",
      name: "Splintered Rod",
      description: "Catches fish, skin, and sometimes both.",
      rarity: SeasonFiveGearRarity.COMMON,
      power: 0,
      price: 0,
      statBonuses: { smell: 1 },
      visualKey: "splintered",
    },
    {
      slot: SeasonFiveGearSlot.HAT,
      key: "bait-stained-cap",
      name: "Bait-Stained Cap",
      description: "No one asks what the stain is. This is its power.",
      rarity: SeasonFiveGearRarity.COMMON,
      power: 1,
      price: 25,
      statBonuses: { luk: 1 },
      catchable: true,
      visualKey: "cap",
    },
    {
      slot: SeasonFiveGearSlot.HAT,
      key: "bucket-hat-of-regret",
      name: "Bucket Hat of Regret",
      description: "A waterproof apology with chin straps.",
      rarity: SeasonFiveGearRarity.UNCOMMON,
      power: 1,
      price: 45,
      statBonuses: { stronk: 1, smell: 1 },
      catchable: true,
      visualKey: "bucket",
    },
    {
      slot: SeasonFiveGearSlot.HAT,
      key: "pointy-fishing-hat",
      name: "Pointy Fishing Hat",
      description: "Wizard-approved headwear for poking clouds into behaving.",
      rarity: SeasonFiveGearRarity.RARE,
      power: 2,
      price: 70,
      statBonuses: { magik: 1, luk: 1 },
      catchable: true,
      visualKey: "pointy",
    },
    {
      slot: SeasonFiveGearSlot.OUTFIT,
      key: "suspicious-waders",
      name: "Suspicious Waders",
      description: "They squelch before touching water.",
      rarity: SeasonFiveGearRarity.UNCOMMON,
      power: 1,
      price: 40,
      statBonuses: { smell: 1, quietness: 1 },
      catchable: true,
      visualKey: "waders",
    },
    {
      slot: SeasonFiveGearSlot.OUTFIT,
      key: "oilskin-raincoat",
      name: "Oilskin Raincoat",
      description: "Makes the rain slide off and the fish feel judged.",
      rarity: SeasonFiveGearRarity.RARE,
      power: 2,
      price: 75,
      statBonuses: { quietness: 2 },
      catchable: true,
      visualKey: "raincoat",
    },
    {
      slot: SeasonFiveGearSlot.ROD,
      key: "war-veteran-cane",
      name: "War Veteran Cane",
      description: "Deep-water capable and still angry about hills.",
      rarity: SeasonFiveGearRarity.UNCOMMON,
      power: 1,
      price: 50,
      statBonuses: { stronk: 1, smell: 1 },
      catchable: true,
      visualKey: "cane",
    },
    {
      slot: SeasonFiveGearSlot.ROD,
      key: "screaming-bamboo-pole",
      name: "Screaming Bamboo Pole",
      description: "Alerts the fish, then negotiates badly with them.",
      rarity: SeasonFiveGearRarity.RARE,
      power: 2,
      price: 90,
      statBonuses: { magik: 1, smell: 1 },
      catchable: true,
      visualKey: "bamboo",
    },
    {
      slot: SeasonFiveGearSlot.ROD,
      key: "obsidian-roaster-rod",
      name: "Obsidian Roaster Rod",
      description: "Lava-safe enough for legal purposes.",
      rarity: SeasonFiveGearRarity.EPIC,
      power: 3,
      price: 140,
      statBonuses: { stronk: 1, magik: 2 },
      catchable: true,
      visualKey: "obsidian",
    },
  ] as const;

export const SEASON_FIVE_BAIT_CATALOG: readonly SeasonFiveBaitCatalogItem[] = [
  {
    key: "bare-hook",
    name: "Bare Hook",
    description: "Free baseline bait. It has confidence and nothing else.",
    rarity: SeasonFiveGearRarity.COMMON,
    price: 0,
    quantity: 0,
    durationMinutes: 0,
    effects: {},
  },
  {
    key: "pocket-breadcrumb-hour",
    name: "Pocket Breadcrumbs",
    description: "One hour of questionable crumbs and slightly faster bites.",
    rarity: SeasonFiveGearRarity.COMMON,
    price: 15,
    quantity: 1,
    durationMinutes: 60,
    effects: { catchBonus: 1 },
  },
  {
    key: "glowing-worm-hour",
    name: "Glowing Worms",
    description: "One hour of luminous bait that attracts rarer mistakes.",
    rarity: SeasonFiveGearRarity.UNCOMMON,
    price: 35,
    quantity: 1,
    durationMinutes: 60,
    effects: { rarityBonus: 5 },
  },
  {
    key: "screaming-grub-hour",
    name: "Screaming Grub",
    description: "One loud hour. Bigger fish investigate the complaint.",
    rarity: SeasonFiveGearRarity.RARE,
    price: 55,
    quantity: 1,
    durationMinutes: 60,
    effects: { catchBonus: 1, sizeBonusPercent: 10 },
  },
] as const;

const EQUIPMENT_BY_KEY: Map<string, SeasonFiveEquipmentCatalogItem> = new Map(
  SEASON_FIVE_EQUIPMENT_CATALOG.map((gear) => [gear.key, gear])
);

const BAIT_BY_KEY: Map<string, SeasonFiveBaitCatalogItem> = new Map(
  SEASON_FIVE_BAIT_CATALOG.map((bait) => [bait.key, bait])
);

const STARTER_BODY_BY_CLASS = {
  [SeasonFiveCharacterClass.DRUNKEN_MONK]: "body-drunken-monk",
  [SeasonFiveCharacterClass.RETIRED_WARRIOR]: "body-retired-warrior",
  [SeasonFiveCharacterClass.DEMENTED_WIZARD]: "body-demented-wizard",
  [SeasonFiveCharacterClass.BURNT_OUT_ROGUE]: "body-burnt-out-rogue",
} satisfies Record<SeasonFiveCharacterClass, string>;

const STARTER_EQUIPMENT_KEYS = ["threadbare-pants", "splintered-rod"] as const;

function getStarterEquipmentKeys(characterClass: SeasonFiveCharacterClass) {
  return [STARTER_BODY_BY_CLASS[characterClass], ...STARTER_EQUIPMENT_KEYS];
}

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
    sizeBonusPercent: base.sizeBonusPercent + (bonuses.sizeBonusPercent ?? 0),
    inventoryBonus: base.inventoryBonus + (bonuses.inventoryBonus ?? 0),
    inventoryPressureReduction:
      base.inventoryPressureReduction +
      (bonuses.inventoryPressureReduction ?? 0),
    travelPercent: base.travelPercent + (bonuses.travelPercent ?? 0),
    rhythmCatchBonus: base.rhythmCatchBonus + (bonuses.rhythmCatchBonus ?? 0),
    rhythmPressureReduction:
      base.rhythmPressureReduction + (bonuses.rhythmPressureReduction ?? 0),
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

export function calculateSeasonFiveRhythm(input: {
  actionKind: SeasonFiveActionKind;
  actionStartedAt: Date | null;
  now: Date;
  rhythmCatchBonus: number;
  rhythmPressureReduction: number;
}) {
  if (
    input.actionKind !== SeasonFiveActionKind.FISHING ||
    !input.actionStartedAt
  ) {
    return {
      stage: 0,
      catchBonus: 0,
      inventoryPressureReduction: 0,
    };
  }

  const elapsedMinutes = Math.max(
    0,
    Math.floor((input.now.getTime() - input.actionStartedAt.getTime()) / 60_000)
  );
  const stage = clamp(
    Math.floor(elapsedMinutes / SEASON_FIVE_RHYTHM_STEP_MINUTES),
    0,
    SEASON_FIVE_MAX_RHYTHM_STAGE
  );

  return {
    stage,
    catchBonus: stage * Math.max(0, input.rhythmCatchBonus),
    inventoryPressureReduction:
      stage * Math.max(0, input.rhythmPressureReduction),
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
          ? EQUIPMENT_BY_KEY.get(item.key)?.statBonuses
          : null;
        if (catalogBonuses) {
          return addStats(stats, catalogBonuses);
        }

        if (item.slot === SeasonFiveGearSlot.BODY) {
          return stats;
        }
        if (item.slot === SeasonFiveGearSlot.OUTFIT) {
          return addStats(stats, { quietness: item.power });
        }
        if (item.slot === SeasonFiveGearSlot.HAT) {
          return addStats(stats, { luk: item.power, magik: item.power });
        }
        if (item.slot === SeasonFiveGearSlot.ROD) {
          return addStats(stats, { stronk: item.power, smell: item.power });
        }
        return stats;
      },
      { ...EMPTY_STATS }
    );
}

function getEquipmentForCharacterClass(
  characterClass: SeasonFiveCharacterClass
) {
  return SEASON_FIVE_EQUIPMENT_CATALOG.filter(
    (item) => !item.classRestriction || item.classRestriction === characterClass
  );
}

function getShopEquipmentForCharacterClass(
  characterClass: SeasonFiveCharacterClass
) {
  return getEquipmentForCharacterClass(characterClass).filter(
    (item) => item.price > 0
  );
}

function getVisibleEquipmentPayload(
  item: SeasonFiveEquipmentCatalogItem,
  ownedKeys: Set<string>
) {
  return {
    key: item.key,
    slot: item.slot,
    slotLabel: SEASON_FIVE_GEAR_SLOT_LABELS[item.slot],
    name: item.name,
    description: item.description,
    rarity: item.rarity,
    power: item.power,
    price: item.price,
    statBonuses: item.statBonuses,
    classRestriction: item.classRestriction ?? null,
    catchable: Boolean(item.catchable),
    owned: ownedKeys.has(item.key),
    visualKey: item.visualKey,
  };
}

function getBaitPayload(
  bait: SeasonFiveBaitCatalogItem,
  quantity: number,
  activeBaitKey: string | null,
  activeBaitExpiresAt: Date | null,
  now: Date
) {
  const active =
    activeBaitKey === bait.key &&
    Boolean(activeBaitExpiresAt && activeBaitExpiresAt > now);
  return {
    key: bait.key,
    name: bait.name,
    description: bait.description,
    rarity: bait.rarity,
    price: bait.price,
    quantity,
    purchaseQuantity: bait.quantity,
    durationMinutes: bait.durationMinutes,
    effects: bait.effects,
    active,
    activeUntil: active ? activeBaitExpiresAt : null,
  };
}

export function getSeasonFiveActiveBait(input: {
  baitKey?: string | null;
  expiresAt?: Date | null;
  now: Date;
}) {
  if (
    input.baitKey &&
    input.expiresAt &&
    input.expiresAt > input.now &&
    BAIT_BY_KEY.has(input.baitKey)
  ) {
    return BAIT_BY_KEY.get(input.baitKey)!;
  }

  return BAIT_BY_KEY.get("bare-hook")!;
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
    inventoryBonus: formulaEffects.inventoryBonus + skillEffects.inventoryBonus,
    inventoryPressureReduction:
      formulaEffects.inventoryPressureReduction +
      skillEffects.inventoryPressureReduction,
    rarityBonus: formulaEffects.rarityBonus + skillEffects.rarityBonus,
    sizeBonusPercent:
      formulaEffects.sizeBonusPercent + skillEffects.sizeBonusPercent,
    travelPercent: formulaEffects.travelPercent + skillEffects.travelPercent,
    rhythmCatchBonus: skillEffects.rhythmCatchBonus,
    rhythmPressureReduction: skillEffects.rhythmPressureReduction,
  };
}

export function getSeasonFiveEffectiveBuildEffects(input: {
  characterClass: SeasonFiveCharacterClass;
  gear?: Array<{
    key?: string;
    slot: SeasonFiveGearSlot;
    power: number;
    equipped: boolean;
  }>;
  purchasedNodeKeys?: Iterable<string>;
  activeBaitKey?: string | null;
  activeBaitExpiresAt?: Date | null;
  now: Date;
}) {
  const buildEffects = getSeasonFiveBuildEffects(input);
  const bait = getSeasonFiveActiveBait({
    baitKey: input.activeBaitKey,
    expiresAt: input.activeBaitExpiresAt,
    now: input.now,
  });
  const effects = addEffectBonuses(buildEffects, bait.effects);

  return {
    ...buildEffects,
    ...effects,
    stats: buildEffects.stats,
  };
}

export function getSeasonFiveAvatarLoadout(input: {
  characterClass: SeasonFiveCharacterClass;
  gear?: Array<{
    key: string;
    slot: SeasonFiveGearSlot;
    equipped: boolean;
  }>;
}) {
  const equippedBySlot = new Map(
    (input.gear ?? [])
      .filter((gear) => gear.equipped)
      .map((gear) => [gear.slot, gear.key])
  );
  const defaultBodyKey = STARTER_BODY_BY_CLASS[input.characterClass];
  const body = EQUIPMENT_BY_KEY.get(defaultBodyKey)!;
  const outfit =
    EQUIPMENT_BY_KEY.get(
      equippedBySlot.get(SeasonFiveGearSlot.OUTFIT) ?? "threadbare-pants"
    ) ?? EQUIPMENT_BY_KEY.get("threadbare-pants")!;
  const rod =
    EQUIPMENT_BY_KEY.get(
      equippedBySlot.get(SeasonFiveGearSlot.ROD) ?? "splintered-rod"
    ) ?? EQUIPMENT_BY_KEY.get("splintered-rod")!;
  const hatKey = equippedBySlot.get(SeasonFiveGearSlot.HAT);
  const hat = hatKey ? EQUIPMENT_BY_KEY.get(hatKey) : null;

  return {
    body: body.visualKey,
    outfit: outfit.visualKey,
    hat: hat?.visualKey ?? null,
    rod: rod.visualKey,
  };
}

export { calculateSeasonFiveTravelMinutes } from "./season-five-actions";
export {
  calculateSeasonFiveCatchIntervalMinutes,
  calculateSeasonFiveInventoryCapacity,
} from "./season-five-balance";

export function createSeasonFiveCatch(input: {
  seed: string;
  minWeightGrams: number;
  maxWeightGrams: number;
  difficulty: number;
  sizeBonusPercent: number;
  rarityBonus?: number;
  inventoryPressure: number;
  profileKey?: string | null;
}) {
  return createSeasonFiveCatchFromBalance({
    ...input,
    hash: hashString(input.seed),
  });
}

const FISH_COIN_VALUE_BY_RARITY = {
  [SeasonFiveFishRarity.COMMON]: { base: 1, perKg: 1 },
  [SeasonFiveFishRarity.UNCOMMON]: { base: 4, perKg: 1.4 },
  [SeasonFiveFishRarity.RARE]: { base: 14, perKg: 2.2 },
  [SeasonFiveFishRarity.LEGENDARY]: { base: 60, perKg: 4 },
} satisfies Record<SeasonFiveFishRarity, { base: number; perKg: number }>;

export function getSeasonFiveFishCoinValue(input: {
  rarity: SeasonFiveFishRarity;
  weightGrams: number;
}) {
  const value = FISH_COIN_VALUE_BY_RARITY[input.rarity];
  return Math.max(
    1,
    Math.floor(
      value.base + (Math.max(0, input.weightGrams) / 1000) * value.perKg
    )
  );
}

export function getSeasonFiveDuplicateItemCoinValue(itemKey: string) {
  const item = EQUIPMENT_BY_KEY.get(itemKey);
  return Math.max(5, Math.floor((item?.price ?? 20) * 0.35));
}

function getSeasonFiveFishRarityForEquipment(
  rarity: SeasonFiveGearRarity
): SeasonFiveFishRarity {
  if (rarity === SeasonFiveGearRarity.EPIC)
    return SeasonFiveFishRarity.LEGENDARY;
  if (rarity === SeasonFiveGearRarity.RARE) return SeasonFiveFishRarity.RARE;
  if (rarity === SeasonFiveGearRarity.UNCOMMON) {
    return SeasonFiveFishRarity.UNCOMMON;
  }
  return SeasonFiveFishRarity.COMMON;
}

export function rollSeasonFiveItemCatch(input: {
  seed: string;
  characterClass: SeasonFiveCharacterClass;
  luk: number;
  magik: number;
  gearKeys: string[];
  ownedItemKeys: string[];
}) {
  const gearBonus =
    (input.gearKeys.includes("pointy-fishing-hat") ? 0.005 : 0) +
    (input.gearKeys.includes("obsidian-roaster-rod") ? 0.005 : 0);
  const chance = clamp(
    0.02 +
      gearBonus +
      Math.max(0, input.luk - 5) * 0.003 +
      Math.max(0, input.magik - 5) * 0.002,
    0.02,
    0.07
  );
  const roll = hashString(`${input.seed}:item-roll`) / 0xffffffff;

  if (roll > chance) {
    return null;
  }

  const candidates = SEASON_FIVE_EQUIPMENT_CATALOG.filter(
    (item) =>
      item.catchable &&
      (!item.classRestriction || item.classRestriction === input.characterClass)
  );

  if (candidates.length === 0) return null;

  const ownedKeys = new Set(input.ownedItemKeys);
  const hash = hashString(`${input.seed}:item-pick`);
  const item = candidates[hash % candidates.length];
  const duplicate = ownedKeys.has(item.key);

  return {
    key: item.key,
    name: item.name,
    slot: item.slot,
    rarity: item.rarity,
    power: item.power,
    statBonuses: item.statBonuses,
    duplicate,
    coinValue: duplicate ? getSeasonFiveDuplicateItemCoinValue(item.key) : 0,
  };
}

type SeasonFiveAccessCharacter = {
  level: number;
  gear: Array<{ key: string; equipped: boolean }>;
  skillPurchases: Array<{ nodeKey: string }>;
  waterBodyDiscoveries?: Array<{ waterBodyId: string; expiresAt: Date }>;
};

type SeasonFiveAccessWaterBody = {
  id: string;
  name: string;
  profileKey: string;
  hidden: boolean;
  levelRequired: number;
  requiredGearKey: string | null;
};

function getResolvedPurchasedSkillSet(character: SeasonFiveAccessCharacter) {
  return new Set(
    character.skillPurchases.map((purchase) =>
      resolveSkillKey(purchase.nodeKey)
    )
  );
}

function hasSeasonFiveDeepAccessSkill(
  profileKey: string,
  purchasedSkillKeys: Set<string>
) {
  const wizardDeepKeys = [
    "wizard_muttered_bait",
    "wizard_glass_gills",
    "wizard_salt_runes",
    "wizard_abyssal_chorus",
  ];
  if (profileKey === "lava_lake") {
    return wizardDeepKeys.slice(1).some((key) => purchasedSkillKeys.has(key));
  }
  return (
    wizardDeepKeys.some((key) => purchasedSkillKeys.has(key)) ||
    purchasedSkillKeys.has("warrior_deep_campaign")
  );
}

function hasSeasonFiveWaterBodyDiscovery({
  character,
  waterBodyId,
  now,
}: {
  character: SeasonFiveAccessCharacter;
  waterBodyId: string;
  now: Date;
}) {
  return Boolean(
    character.waterBodyDiscoveries?.some(
      (discovery) =>
        discovery.waterBodyId === waterBodyId && discovery.expiresAt > now
    )
  );
}

function getSeasonFiveFishingAccess({
  character,
  waterBody,
  now,
}: {
  character: SeasonFiveAccessCharacter;
  waterBody: SeasonFiveAccessWaterBody | null;
  now: Date;
}) {
  if (!waterBody) {
    return {
      allowed: true,
      revealed: true,
      reason: null as string | null,
    };
  }

  const revealed =
    !waterBody.hidden ||
    hasSeasonFiveWaterBodyDiscovery({
      character,
      waterBodyId: waterBody.id,
      now,
    });
  if (!revealed) {
    return {
      allowed: false,
      revealed: false,
      reason: "Reveal this fishing spot before travelling.",
    };
  }

  if (character.level < waterBody.levelRequired) {
    return {
      allowed: false,
      revealed,
      reason: `Requires level ${waterBody.levelRequired}.`,
    };
  }

  if (waterBody.requiredGearKey) {
    const equippedGearKeys = new Set(
      character.gear.filter((gear) => gear.equipped).map((gear) => gear.key)
    );
    const purchasedSkillKeys = getResolvedPurchasedSkillSet(character);
    const hasGear =
      equippedGearKeys.has(waterBody.requiredGearKey) ||
      (waterBody.profileKey === "deep" &&
        equippedGearKeys.has("war-veteran-cane"));

    if (
      !hasGear &&
      !hasSeasonFiveDeepAccessSkill(waterBody.profileKey, purchasedSkillKeys)
    ) {
      return {
        allowed: false,
        revealed,
        reason:
          waterBody.profileKey === "lava_lake"
            ? "Requires a lava-safe rod or a deeper wizard skill."
            : "Requires deep-water gear or a deep-water skill.",
      };
    }
  }

  return {
    allowed: true,
    revealed,
    reason: null,
  };
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

async function ensureSeasonFiveLocations(
  cycleId: string,
  db: DatabaseClient,
  now = new Date()
) {
  const tiles = await db.seasonFiveMapTile.findMany({
    where: {
      cycleId,
    },
  });
  const tileByKey = new Map(tiles.map((tile) => [tile.key, tile]));
  const existingBodies = await db.seasonFiveFishingWaterBody.findMany({
    where: {
      cycleId,
    },
  });
  const existingBodyByKey = new Map(
    existingBodies.map((body) => [body.key, body])
  );
  const bodyPlans = planSeasonFiveWaterBodies(tiles);
  const waterBodyByKey = new Map<string, { id: string; key: string }>();

  for (const body of bodyPlans) {
    const existing = existingBodyByKey.get(body.key);
    const persisted = await db.seasonFiveFishingWaterBody.upsert({
      where: {
        cycleId_key: {
          cycleId,
          key: body.key,
        },
      },
      create: {
        cycleId,
        key: body.key,
        name: body.name,
        profileKey: body.profileKey,
        maxStock: body.profile.maxStock,
        currentStock: body.profile.maxStock,
        regenPerHour: body.profile.regenPerHour,
        lastRegeneratedAt: now,
        levelRequired: body.profile.levelRequired,
        requiredGearKey: body.profile.requiredGearKey,
        hidden: body.hidden,
        catchDifficulty: body.profile.catchDifficulty,
        minWeightGrams: body.profile.minWeightGrams,
        maxWeightGrams: body.profile.maxWeightGrams,
        inventoryPressure: body.profile.inventoryPressure,
      },
      update: {
        name: body.name,
        profileKey: body.profileKey,
        maxStock: body.profile.maxStock,
        regenPerHour: body.profile.regenPerHour,
        levelRequired: body.profile.levelRequired,
        requiredGearKey: body.profile.requiredGearKey,
        hidden: body.hidden,
        catchDifficulty: body.profile.catchDifficulty,
        minWeightGrams: body.profile.minWeightGrams,
        maxWeightGrams: body.profile.maxWeightGrams,
        inventoryPressure: body.profile.inventoryPressure,
        ...(existing && existing.currentStock > body.profile.maxStock
          ? { currentStock: body.profile.maxStock }
          : {}),
      },
    });
    waterBodyByKey.set(body.key, persisted);
  }

  const home = SEASON_FIVE_LOCATIONS[0];
  const homeTile =
    tileByKey.get(getSeasonFiveLocationTileKey(home.key) ?? "") ?? null;

  await db.seasonFiveFishingLocation.upsert({
    where: {
      cycleId_key: {
        cycleId,
        key: home.key,
      },
    },
    create: {
      cycleId,
      ...home,
      xPercent: homeTile?.xPercent ?? home.xPercent,
      yPercent: homeTile?.yPercent ?? home.yPercent,
      tileId: homeTile?.id ?? null,
      waterBodyId: null,
    },
    update: {
      name: home.name,
      kind: home.kind,
      xPercent: homeTile?.xPercent ?? home.xPercent,
      yPercent: homeTile?.yPercent ?? home.yPercent,
      travelMinutes: home.travelMinutes,
      catchDifficulty: home.catchDifficulty,
      minWeightGrams: home.minWeightGrams,
      maxWeightGrams: home.maxWeightGrams,
      inventoryPressure: home.inventoryPressure,
      tileId: homeTile?.id ?? null,
      waterBodyId: null,
    },
  });

  for (const location of planSeasonFiveFishingLocations({
    tiles,
    waterBodies: bodyPlans,
  })) {
    const { tileKey, waterBodyKey, ...locationData } = location;
    const tile = tileByKey.get(tileKey) ?? null;
    const waterBody = waterBodyByKey.get(waterBodyKey) ?? null;

    await db.seasonFiveFishingLocation.upsert({
      where: {
        cycleId_key: {
          cycleId,
          key: location.key,
        },
      },
      create: {
        cycleId,
        ...locationData,
        xPercent: tile?.xPercent ?? 0,
        yPercent: tile?.yPercent ?? 0,
        tileId: tile?.id ?? null,
        waterBodyId: waterBody?.id ?? null,
      },
      update: {
        name: location.name,
        kind: location.kind,
        xPercent: tile?.xPercent ?? 0,
        yPercent: tile?.yPercent ?? 0,
        travelMinutes: location.travelMinutes,
        catchDifficulty: location.catchDifficulty,
        minWeightGrams: location.minWeightGrams,
        maxWeightGrams: location.maxWeightGrams,
        inventoryPressure: location.inventoryPressure,
        tileId: tile?.id ?? null,
        waterBodyId: waterBody?.id ?? null,
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
  await ensureSeasonFiveLocations(cycle.id, db, now);
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
      baitStacks: {
        orderBy: [{ key: "asc" }],
      },
      skillPurchases: true,
      keyItems: true,
      currentLocation: {
        include: {
          tile: true,
          waterBody: true,
        },
      },
      destinationLocation: {
        include: {
          tile: true,
          waterBody: true,
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
      waterBodyDiscoveries: true,
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
          data: getStarterEquipmentKeys(selectedClass).map((gearKey) => {
            const gear = EQUIPMENT_BY_KEY.get(gearKey);
            if (!gear) {
              throw new GameError("Starter gear catalog is missing an item.");
            }
            return {
              slot: gear.slot,
              key: gear.key,
              name: gear.name,
              rarity: gear.rarity,
              power: gear.power,
              equipped: true,
            };
          }),
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

  const catalogItem = EQUIPMENT_BY_KEY.get(gear.key);
  if (!catalogItem) {
    throw new GameError("That gear is no longer supported.");
  }
  if (
    catalogItem.classRestriction &&
    catalogItem.classRestriction !== character.class
  ) {
    throw new GameError("That body does not fit your class.");
  }
  if (catalogItem.slot !== gear.slot) {
    throw new GameError("That gear needs refitted before equipping.");
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

export async function purchaseSeasonFiveShopItem({
  userId,
  itemKey,
  db = prisma,
}: {
  userId: string;
  itemKey: string;
  db?: DatabaseClient;
}) {
  const cycle = await ensureSeasonFivePreviewCycle({ db });
  const normalizedItemKey = itemKey.trim();

  await db.$transaction(async (tx) => {
    const character = await tx.seasonFiveCharacter.findUnique({
      where: { cycleId_userId: { cycleId: cycle.id, userId } },
      include: {
        gear: true,
        baitStacks: true,
      },
    });

    if (!character) {
      throw new GameError("Create a Season 5 character before shopping.");
    }

    const equipment = EQUIPMENT_BY_KEY.get(normalizedItemKey);
    if (equipment) {
      if (equipment.price <= 0) {
        throw new GameError("That item is already part of the starter pile.");
      }
      if (
        equipment.classRestriction &&
        equipment.classRestriction !== character.class
      ) {
        throw new GameError("That body does not fit your class.");
      }
      if (character.gear.some((gear) => gear.key === equipment.key)) {
        throw new GameError("You already own that item.");
      }
      if (character.fishCoins < equipment.price) {
        throw new GameError("You need more fish coins.");
      }

      await tx.seasonFiveCharacter.update({
        where: { id: character.id },
        data: {
          fishCoins: {
            decrement: equipment.price,
          },
        },
      });
      await tx.seasonFiveGear.create({
        data: {
          characterId: character.id,
          slot: equipment.slot,
          key: equipment.key,
          name: equipment.name,
          rarity: equipment.rarity,
          power: equipment.power,
          equipped: false,
        },
      });
      return;
    }

    const bait = BAIT_BY_KEY.get(normalizedItemKey);
    if (!bait || bait.key === "bare-hook") {
      throw new GameError("Choose a real shop item.");
    }
    if (character.fishCoins < bait.price) {
      throw new GameError("You need more fish coins.");
    }

    await tx.seasonFiveCharacter.update({
      where: { id: character.id },
      data: {
        fishCoins: {
          decrement: bait.price,
        },
      },
    });
    await tx.seasonFiveBaitStack.upsert({
      where: {
        characterId_key: {
          characterId: character.id,
          key: bait.key,
        },
      },
      create: {
        characterId: character.id,
        key: bait.key,
        quantity: bait.quantity,
      },
      update: {
        quantity: {
          increment: bait.quantity,
        },
      },
    });
  });
}

export async function activateSeasonFiveBait({
  userId,
  baitKey,
  db = prisma,
  now = new Date(),
}: {
  userId: string;
  baitKey: string;
  db?: DatabaseClient;
  now?: Date;
}) {
  const cycle = await ensureSeasonFivePreviewCycle({ db, now });
  const normalizedBaitKey = baitKey.trim();
  const bait = BAIT_BY_KEY.get(normalizedBaitKey);

  if (!bait) {
    throw new GameError("Choose a valid bait.");
  }

  await db.$transaction(async (tx) => {
    const character = await tx.seasonFiveCharacter.findUnique({
      where: { cycleId_userId: { cycleId: cycle.id, userId } },
      include: {
        baitStacks: true,
      },
    });

    if (!character) {
      throw new GameError("Create a Season 5 character before baiting hooks.");
    }

    const paidBaitActive =
      character.activeBaitKey &&
      character.activeBaitKey !== "bare-hook" &&
      character.activeBaitExpiresAt &&
      character.activeBaitExpiresAt > now;
    if (paidBaitActive) {
      throw new GameError("Finish the active bait hour before replacing it.");
    }

    if (bait.key === "bare-hook") {
      await tx.seasonFiveCharacter.update({
        where: { id: character.id },
        data: {
          activeBaitKey: null,
          activeBaitExpiresAt: null,
        },
      });
      return;
    }

    const stack = character.baitStacks.find((entry) => entry.key === bait.key);
    if (!stack || stack.quantity <= 0) {
      throw new GameError("Buy that bait before activating it.");
    }

    await tx.seasonFiveBaitStack.update({
      where: {
        characterId_key: {
          characterId: character.id,
          key: bait.key,
        },
      },
      data: {
        quantity: {
          decrement: 1,
        },
      },
    });
    await tx.seasonFiveCharacter.update({
      where: { id: character.id },
      data: {
        activeBaitKey: bait.key,
        activeBaitExpiresAt: addMinutes(now, bait.durationMinutes),
      },
    });
  });
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
    include: {
      waterBody: true,
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

  const access = getSeasonFiveFishingAccess({
    character,
    waterBody: destination.waterBody,
    now,
  });
  if (!access.allowed) {
    throw new GameError(access.reason ?? "That fishing spot is locked.");
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
      fishCatch: {
        select: {
          kind: true,
          rarity: true,
          weightGrams: true,
        },
      },
    },
  });

  if (items.length === 0) return;

  const fishCatchIds = items.map((item) => item.fishCatchId);
  const coinGain = items.reduce((sum, item) => {
    if (item.fishCatch.kind !== SeasonFiveCatchKind.FISH) return sum;
    return sum + getSeasonFiveFishCoinValue(item.fishCatch);
  }, 0);
  await db.$transaction(async (tx) => {
    await tx.seasonFiveInventoryItem.updateMany({
      where: {
        characterId,
        unloadedAt: null,
      },
      data: {
        unloadedAt: now,
      },
    });
    await tx.seasonFiveFishCatch.updateMany({
      where: {
        id: {
          in: fishCatchIds,
        },
      },
      data: {
        unloadedAt: now,
      },
    });
    if (coinGain > 0) {
      await tx.seasonFiveCharacter.update({
        where: { id: characterId },
        data: {
          fishCoins: {
            increment: coinGain,
          },
        },
      });
    }
  });
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
  await ensureSeasonFiveLocations(cycle.id, db, now);
  const locations = await db.seasonFiveFishingLocation.findMany({
    where: {
      cycleId: cycle.id,
    },
    orderBy: [{ kind: "asc" }, { travelMinutes: "asc" }, { name: "asc" }],
    include: {
      waterBody: true,
    },
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
      biggestFishGrams: true,
      createdAt: true,
    },
  });
  const biggestFishCandidates = await db.seasonFiveFishCatch.findMany({
    where: {
      cycleId: cycle.id,
      kind: SeasonFiveCatchKind.FISH,
    },
    orderBy: [{ weightGrams: "desc" }, { caughtAt: "asc" }, { id: "asc" }],
    take: 100,
    select: {
      id: true,
      speciesName: true,
      rarity: true,
      weightGrams: true,
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
          biggestFishGrams: true,
          createdAt: true,
        },
      },
    },
  });
  const topByCount = rankSeasonFiveMostFish(mostFishCandidates);
  const topBySize = rankSeasonFiveBiggestFish(biggestFishCandidates);

  const effects = character
    ? getSeasonFiveEffectiveBuildEffects({
        characterClass: character.class,
        gear: character.gear,
        purchasedNodeKeys: character.skillPurchases.map(
          (purchase) => purchase.nodeKey
        ),
        activeBaitKey: character.activeBaitKey,
        activeBaitExpiresAt: character.activeBaitExpiresAt,
        now,
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
  const visibleLocations = locations.filter((location) => {
    if (location.kind === SeasonFiveLocationKind.HOME) return true;
    if (!location.waterBody?.hidden) return true;
    return character
      ? hasSeasonFiveWaterBodyDiscovery({
          character,
          waterBodyId: location.waterBody.id,
          now,
        })
      : false;
  });
  const locationActivity = buildSeasonFiveLocationActivity({
    locations: visibleLocations,
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
        avatar: getSeasonFiveAvatarLoadout({
          characterClass: entry.class,
          gear: entry.gear,
        }),
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
        ? getSeasonFiveEffectiveBuildEffects({
            characterClass: character.class,
            gear: character.gear,
            purchasedNodeKeys: character.skillPurchases.map(
              (purchase) => purchase.nodeKey
            ),
            activeBaitKey: character.activeBaitKey,
            activeBaitExpiresAt: character.activeBaitExpiresAt,
            now,
          })
        : null;
  const ownedEquipmentKeys = new Set(
    character?.gear.map((gear) => gear.key) ?? []
  );
  const baitQuantityByKey = new Map(
    character?.baitStacks.map((stack) => [stack.key, stack.quantity]) ?? []
  );
  const activeBait = character
    ? getSeasonFiveActiveBait({
        baitKey: character.activeBaitKey,
        expiresAt: character.activeBaitExpiresAt,
        now,
      })
    : BAIT_BY_KEY.get("bare-hook")!;

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
    locations: visibleLocations.map((location) => {
      const access =
        character && location.waterBody
          ? getSeasonFiveFishingAccess({
              character,
              waterBody: location.waterBody,
              now,
            })
          : {
              allowed: true,
              revealed: !location.waterBody?.hidden,
              reason: null as string | null,
            };
      const waterBodyInfoRevealed =
        Boolean(character && location.waterBody) &&
        hasSeasonFiveWaterBodyDiscovery({
          character: character!,
          waterBodyId: location.waterBody!.id,
          now,
        });
      const profile = location.waterBody
        ? (SEASON_FIVE_WATER_BODY_PROFILES[
            location.waterBody.profileKey as SeasonFiveWaterBodyProfileKey
          ] ?? SEASON_FIVE_WATER_BODY_PROFILES.lake)
        : null;

      return {
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
        minWeightGrams: location.minWeightGrams,
        maxWeightGrams: location.maxWeightGrams,
        catchDifficulty: location.catchDifficulty,
        locked: character ? !access.allowed : false,
        lockReason: character ? access.reason : null,
        waterBodyKey: location.waterBody?.key ?? null,
        waterBodyName: waterBodyInfoRevealed
          ? (location.waterBody?.name ?? null)
          : location.waterBody
            ? "Unknown water"
            : null,
        waterBodyProfile: waterBodyInfoRevealed ? profile?.label : null,
        waterBodyStockLabel:
          waterBodyInfoRevealed && location.waterBody
            ? getSeasonFiveWaterBodyStockLabel({
                currentStock: location.waterBody.currentStock,
                maxStock: location.waterBody.maxStock,
                profileKey: location.waterBody.profileKey,
              })
            : null,
        waterBodyStockPercent:
          waterBodyInfoRevealed && location.waterBody
            ? Math.round(
                (Math.max(0, location.waterBody.currentStock) /
                  Math.max(1, location.waterBody.maxStock)) *
                  100
              )
            : null,
        waterBodyRegenLabel:
          waterBodyInfoRevealed && location.waterBody
            ? `${location.waterBody.regenPerHour}/h regen`
            : null,
        notableFish: waterBodyInfoRevealed ? profile?.notableFish : null,
        waterBodyRevealed: waterBodyInfoRevealed,
      };
    }),
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
          biggestFishGrams: character.biggestFishGrams,
          fishCoins: character.fishCoins,
          avatar: getSeasonFiveAvatarLoadout({
            characterClass: character.class,
            gear: character.gear,
          }),
          activeBait: {
            key: activeBait.key,
            name: activeBait.name,
            description: activeBait.description,
            rarity: activeBait.rarity,
            effects: activeBait.effects,
            expiresAt:
              character.activeBaitKey === activeBait.key &&
              activeBait.key !== "bare-hook" &&
              character.activeBaitExpiresAt &&
              character.activeBaitExpiresAt > now
                ? character.activeBaitExpiresAt
                : null,
          },
          bait: SEASON_FIVE_BAIT_CATALOG.map((bait) =>
            getBaitPayload(
              bait,
              baitQuantityByKey.get(bait.key) ?? 0,
              character.activeBaitKey,
              character.activeBaitExpiresAt,
              now
            )
          ),
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
            slotLabel: SEASON_FIVE_GEAR_SLOT_LABELS[gear.slot],
            key: gear.key,
            name: gear.name,
            rarity: gear.rarity,
            power: gear.power,
            equipped: gear.equipped,
            description: EQUIPMENT_BY_KEY.get(gear.key)?.description ?? "",
            visualKey: EQUIPMENT_BY_KEY.get(gear.key)?.visualKey ?? gear.key,
            statBonuses:
              EQUIPMENT_BY_KEY.get(gear.key)?.statBonuses ?? EMPTY_STATS,
          })),
          skillPurchases: character.skillPurchases.map((purchase) =>
            resolveSkillKey(purchase.nodeKey)
          ),
          inventory: character.inventoryItems.map((item) => ({
            id: item.id,
            slots: item.slots,
            speciesName: item.fishCatch.speciesName,
            rarity: item.fishCatch.rarity,
            weightGrams: item.fishCatch.weightGrams,
            caughtAt: item.fishCatch.caughtAt,
          })),
        }
      : null,
    shop: character
      ? {
          equipment: getShopEquipmentForCharacterClass(character.class).map(
            (item) => getVisibleEquipmentPayload(item, ownedEquipmentKeys)
          ),
          bait: SEASON_FIVE_BAIT_CATALOG.filter((bait) => bait.price > 0).map(
            (bait) =>
              getBaitPayload(
                bait,
                baitQuantityByKey.get(bait.key) ?? 0,
                character.activeBaitKey,
                character.activeBaitExpiresAt,
                now
              )
          ),
        }
      : {
          equipment: [],
          bait: [],
        },
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

async function regenerateSeasonFiveWaterBodies({
  cycleId,
  db,
  now,
}: {
  cycleId: string;
  db: DatabaseClient;
  now: Date;
}) {
  const bodies = await db.seasonFiveFishingWaterBody.findMany({
    where: {
      cycleId,
    },
  });

  for (const body of bodies) {
    const next = regenerateSeasonFiveWaterBodyStock({
      currentStock: body.currentStock,
      maxStock: body.maxStock,
      regenPerHour: body.regenPerHour,
      lastRegeneratedAt: body.lastRegeneratedAt,
      now,
    });

    if (
      next.currentStock === body.currentStock &&
      next.lastRegeneratedAt.getTime() === body.lastRegeneratedAt.getTime()
    ) {
      continue;
    }

    await db.seasonFiveFishingWaterBody.update({
      where: {
        id: body.id,
      },
      data: {
        currentStock: next.currentStock,
        lastRegeneratedAt: next.lastRegeneratedAt,
      },
    });
  }
}

export function getDegradedSeasonFiveHomeState(): SeasonFiveHomeState {
  const mapTiles = createSeasonFiveMapTiles();
  const waterBodies = planSeasonFiveWaterBodies(mapTiles);
  const waterBodyByKey = new Map(waterBodies.map((body) => [body.key, body]));
  const tileByKey = new Map(mapTiles.map((tile) => [tile.key, tile]));
  const home = SEASON_FIVE_LOCATIONS[0];
  const homeTileKey = getSeasonFiveLocationTileKey(home.key);
  const homeTile = homeTileKey ? tileByKey.get(homeTileKey) : null;
  const locations = [
    {
      id: home.key,
      key: home.key,
      name: home.name,
      kind: home.kind,
      tileKey: homeTileKey,
      xPercent: homeTile?.xPercent ?? home.xPercent,
      yPercent: homeTile?.yPercent ?? home.yPercent,
      travelMinutes: home.travelMinutes,
      minWeightGrams: home.minWeightGrams,
      maxWeightGrams: home.maxWeightGrams,
      catchDifficulty: home.catchDifficulty,
      locked: false,
      lockReason: null,
      waterBodyKey: null,
      waterBodyName: null,
      waterBodyProfile: null,
      waterBodyStockLabel: null,
      waterBodyStockPercent: null,
      waterBodyRegenLabel: null,
      notableFish: null,
      waterBodyRevealed: false,
    },
    ...planSeasonFiveFishingLocations({
      tiles: mapTiles,
      waterBodies,
    }).map((location) => {
      const tile = tileByKey.get(location.tileKey);
      const body = waterBodyByKey.get(location.waterBodyKey);
      const profile = body
        ? SEASON_FIVE_WATER_BODY_PROFILES[body.profileKey]
        : null;

      return {
        id: location.key,
        key: location.key,
        name: location.name,
        kind: location.kind,
        tileKey: location.tileKey,
        xPercent: tile?.xPercent ?? 0,
        yPercent: tile?.yPercent ?? 0,
        travelMinutes: location.travelMinutes,
        minWeightGrams: location.minWeightGrams,
        maxWeightGrams: location.maxWeightGrams,
        catchDifficulty: location.catchDifficulty,
        locked: false,
        lockReason: null,
        waterBodyKey: body?.key ?? location.waterBodyKey,
        waterBodyName: body?.name ?? null,
        waterBodyProfile: profile?.label ?? null,
        waterBodyStockLabel: null,
        waterBodyStockPercent: null,
        waterBodyRegenLabel: null,
        notableFish: profile?.notableFish ?? null,
        waterBodyRevealed: Boolean(body),
      };
    }),
  ];

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
      tiles: mapTiles.map((tile) => ({
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
    locations,
    locationActivity: locations.map((location) => ({
      locationKey: location.key,
      totalCount: 0,
      overflowCount: 0,
      characters: [],
    })),
    character: null,
    shop: {
      equipment: [],
      bait: [],
    },
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
  await ensureSeasonFiveLocations(cycleId, db, resolvedAt);
  await regenerateSeasonFiveWaterBodies({ cycleId, db, now: resolvedAt });
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
      currentLocation: {
        include: {
          waterBody: true,
        },
      },
      gear: true,
      skillPurchases: true,
      waterBodyDiscoveries: true,
      inventoryItems: {
        where: {
          unloadedAt: null,
        },
      },
    },
  });
  const discoverableWaterBodies = await db.seasonFiveFishingWaterBody.findMany({
    where: {
      cycleId,
    },
    select: {
      id: true,
      key: true,
    },
  });

  for (const character of fishers) {
    const location = character.currentLocation;
    if (!location || location.kind === SeasonFiveLocationKind.HOME) {
      continue;
    }

    const effects = getSeasonFiveEffectiveBuildEffects({
      characterClass: character.class,
      gear: character.gear,
      purchasedNodeKeys: character.skillPurchases.map(
        (purchase) => purchase.nodeKey
      ),
      activeBaitKey: character.activeBaitKey,
      activeBaitExpiresAt: character.activeBaitExpiresAt,
      now: resolvedAt,
    });
    const activeDiscoveryIds = new Set(
      character.waterBodyDiscoveries
        .filter((discovery) => discovery.expiresAt > resolvedAt)
        .map((discovery) => discovery.waterBodyId)
    );
    const discoveredWaterBody = rollSeasonFiveWaterBodyDiscovery({
      seed: `${character.id}:${resolvedAt.toISOString()}:water-body`,
      luk: effects.stats.luk,
      magik: effects.stats.magik,
      gearKeys: character.gear
        .filter((gear) => gear.equipped)
        .map((gear) => gear.key),
      purchasedNodeKeys: character.skillPurchases.map(
        (purchase) => purchase.nodeKey
      ),
      hiddenWaterBodies: discoverableWaterBodies.filter(
        (body) => !activeDiscoveryIds.has(body.id)
      ),
    });
    const discoveredWaterBodyExpiresAt = discoveredWaterBody
      ? addHours(resolvedAt, SEASON_FIVE_WATER_BODY_REVEAL_HOURS)
      : null;
    if (discoveredWaterBody) {
      await db.seasonFiveWaterBodyDiscovery.upsert({
        where: {
          characterId_waterBodyId: {
            characterId: character.id,
            waterBodyId: discoveredWaterBody.id,
          },
        },
        create: {
          characterId: character.id,
          waterBodyId: discoveredWaterBody.id,
          discoveredAt: resolvedAt,
          expiresAt: discoveredWaterBodyExpiresAt!,
        },
        update: {
          discoveredAt: resolvedAt,
          expiresAt: discoveredWaterBodyExpiresAt!,
        },
      });
      mapDiscoveries += 1;
    }
    const waterBody = location.waterBodyId
      ? await db.seasonFiveFishingWaterBody.findUnique({
          where: {
            id: location.waterBodyId,
          },
        })
      : null;
    const access = getSeasonFiveFishingAccess({
      character: {
        ...character,
        waterBodyDiscoveries:
          discoveredWaterBody && discoveredWaterBodyExpiresAt
            ? [
                ...character.waterBodyDiscoveries,
                {
                  waterBodyId: discoveredWaterBody.id,
                  expiresAt: discoveredWaterBodyExpiresAt,
                },
              ]
            : character.waterBodyDiscoveries,
      },
      waterBody,
      now: resolvedAt,
    });
    if (!access.allowed) {
      await db.seasonFiveCharacter.update({
        where: { id: character.id },
        data: {
          lastResolvedAt: resolvedAt,
        },
      });
      continue;
    }
    const capacity = calculateSeasonFiveInventoryCapacity({
      baseCapacity: character.inventoryCapacity,
      inventoryBonus: effects.inventoryBonus,
    });
    const usedSlots = character.inventoryItems.reduce(
      (sum, item) => sum + item.slots,
      0
    );
    const rhythm = calculateSeasonFiveRhythm({
      actionKind: character.actionKind,
      actionStartedAt: character.actionStartedAt,
      now: resolvedAt,
      rhythmCatchBonus: effects.rhythmCatchBonus,
      rhythmPressureReduction: effects.rhythmPressureReduction,
    });
    const interval = calculateSeasonFiveCatchIntervalMinutes({
      catchDifficulty: location.catchDifficulty,
      catchBonus: effects.catchBonus + rhythm.catchBonus,
    });
    const plan = planSeasonFivePassiveCatches({
      lastResolvedAt: character.lastResolvedAt,
      resolvedAt,
      catchIntervalMinutes: interval,
      inventoryUsed: usedSlots,
      inventoryCapacity: capacity,
      stockAvailable: waterBody?.currentStock,
      createCatch: (tickAt) =>
        createSeasonFiveCatch({
          seed: `${character.id}:${location.key}:${tickAt.toISOString()}`,
          minWeightGrams: location.minWeightGrams,
          maxWeightGrams: location.maxWeightGrams,
          difficulty: location.catchDifficulty,
          sizeBonusPercent: effects.sizeBonusPercent,
          rarityBonus: effects.rarityBonus,
          profileKey: waterBody?.profileKey ?? null,
          inventoryPressure: Math.max(
            1,
            location.inventoryPressure -
              effects.inventoryPressureReduction -
              rhythm.inventoryPressureReduction
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

    let fishCatchesCreated = 0;
    let itemCatchesCreated = 0;

    await db.$transaction(async (tx) => {
      let biggest = character.biggestFishGrams;
      let duplicateItemCoinGain = 0;
      let experienceGain = 0;
      const ownedGearKeys = new Set(character.gear.map((gear) => gear.key));
      const equippedGearKeys = character.gear
        .filter((gear) => gear.equipped)
        .map((gear) => gear.key);

      for (const plannedCatch of plan.catches) {
        const fish = plannedCatch.fish;
        const itemCatch = rollSeasonFiveItemCatch({
          seed: `${character.id}:${location.key}:${plannedCatch.tickAt.toISOString()}`,
          characterClass: character.class,
          luk: effects.stats.luk,
          magik: effects.stats.magik,
          gearKeys: equippedGearKeys,
          ownedItemKeys: Array.from(ownedGearKeys),
        });

        if (itemCatch) {
          await tx.seasonFiveFishCatch.create({
            data: {
              cycleId,
              characterId: character.id,
              locationId: location.id,
              caughtAt: plannedCatch.tickAt,
              kind: SeasonFiveCatchKind.ITEM,
              speciesKey: itemCatch.key,
              speciesName: itemCatch.name,
              rarity: getSeasonFiveFishRarityForEquipment(itemCatch.rarity),
              weightGrams: 0,
              inventorySlots: 0,
              itemKey: itemCatch.key,
              itemName: itemCatch.name,
            },
          });

          if (itemCatch.duplicate) {
            duplicateItemCoinGain += itemCatch.coinValue;
          } else {
            await tx.seasonFiveGear.create({
              data: {
                characterId: character.id,
                slot: itemCatch.slot,
                key: itemCatch.key,
                name: itemCatch.name,
                rarity: itemCatch.rarity,
                power: itemCatch.power,
                equipped: false,
              },
            });
            ownedGearKeys.add(itemCatch.key);
          }
          itemCatchesCreated += 1;
          experienceGain += 2;
          continue;
        }

        const created = await tx.seasonFiveFishCatch.create({
          data: {
            cycleId,
            characterId: character.id,
            locationId: location.id,
            kind: SeasonFiveCatchKind.FISH,
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
        biggest = Math.max(biggest, fish.weightGrams);
        fishCatchesCreated += 1;
        experienceGain += 5;
      }

      const progression = getSeasonFiveProgressionAfterExperience({
        level: character.level,
        skillPoints: character.skillPoints,
        experience: character.experience + experienceGain,
      });

      if (waterBody && plan.stockUsed > 0) {
        await tx.seasonFiveFishingWaterBody.update({
          where: {
            id: waterBody.id,
          },
          data: {
            currentStock: {
              decrement: plan.stockUsed,
            },
          },
        });
      }

      await tx.seasonFiveCharacter.update({
        where: { id: character.id },
        data: {
          totalFishCaught: {
            increment: fishCatchesCreated,
          },
          experience: {
            increment: experienceGain,
          },
          ...(duplicateItemCoinGain > 0
            ? {
                fishCoins: {
                  increment: duplicateItemCoinGain,
                },
              }
            : {}),
          level: progression.level,
          skillPoints: progression.skillPoints,
          biggestFishGrams: biggest,
          lastResolvedAt: plan.nextResolvedAt,
        },
      });
    });
    catchesCreated += fishCatchesCreated + itemCatchesCreated;
  }

  return {
    travelCompleted,
    catchesCreated,
    mapDiscoveries,
  };
}
