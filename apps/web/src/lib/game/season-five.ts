import { prisma } from "@/lib/prisma";
import {
  CycleRuleset,
  CycleStatus,
  SeasonFiveActionKind,
  SeasonFiveCharacterClass,
  SeasonFiveFishRarity,
  SeasonFiveGearRarity,
  SeasonFiveGearSlot,
  SeasonFiveLocationKind,
  type PrismaClient,
} from "@/lib/prisma-client";
import { GameError } from "./errors";
import {
  createSeasonFiveHomeState,
  createSeasonFiveTravelState,
  getSeasonFiveActionSummary,
  resolveSeasonFiveCompletedTravel,
} from "./season-five-actions";
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
  cost: number;
  requires?: string[];
  statBonuses?: Partial<SeasonFiveStats>;
};

export const SEASON_FIVE_SKILL_TREES = {
  [SeasonFiveCharacterClass.DRUNKEN_MONK]: [
    {
      key: "monk_wobble_cast",
      name: "Wobble Cast",
      description: "+1 Smell. The cast looks wrong until fish agree.",
      cost: 1,
      statBonuses: { smell: 1 },
    },
    {
      key: "monk_breath_in_mug",
      name: "Breath in Mug",
      description: "+1 Quietness. Breathe through the tankard, not the panic.",
      cost: 1,
      statBonuses: { quietness: 1 },
    },
    {
      key: "monk_barrel_stance",
      name: "Barrel Stance",
      description: "+1 Stronk. Become harder to tip than the boat.",
      cost: 1,
      requires: ["monk_wobble_cast"],
      statBonuses: { stronk: 1 },
    },
    {
      key: "monk_lucky_spill",
      name: "Lucky Spill",
      description: "+1 Luk. Some bait is spilled by destiny.",
      cost: 1,
      requires: ["monk_breath_in_mug"],
      statBonuses: { luk: 1 },
    },
    {
      key: "monk_perfect_stumble",
      name: "Perfect Stumble",
      description: "+1 Smell, +1 Quietness. Arrive accidentally on purpose.",
      cost: 2,
      requires: ["monk_barrel_stance", "monk_lucky_spill"],
      statBonuses: { smell: 1, quietness: 1 },
    },
  ],
  [SeasonFiveCharacterClass.RETIRED_WARRIOR]: [
    {
      key: "warrior_campaign_grip",
      name: "Campaign Grip",
      description: "+1 Stronk. Hold the rod like a banner.",
      cost: 1,
      statBonuses: { stronk: 1 },
    },
    {
      key: "warrior_old_maps",
      name: "Old Maps",
      description: "+1 Smell. The campaign route had excellent trout.",
      cost: 1,
      statBonuses: { smell: 1 },
    },
    {
      key: "warrior_siege_patience",
      name: "Siege Patience",
      description: "+1 Quietness. Wait them out.",
      cost: 1,
      requires: ["warrior_old_maps"],
      statBonuses: { quietness: 1 },
    },
    {
      key: "warrior_trophy_drag",
      name: "Trophy Drag",
      description: "+1 Stronk. Big fish do not get a vote.",
      cost: 1,
      requires: ["warrior_campaign_grip"],
      statBonuses: { stronk: 1 },
    },
    {
      key: "warrior_final_campaign",
      name: "Final Campaign",
      description: "+1 Stronk, +1 Luk. One last glorious overreaction.",
      cost: 2,
      requires: ["warrior_siege_patience", "warrior_trophy_drag"],
      statBonuses: { stronk: 1, luk: 1 },
    },
  ],
  [SeasonFiveCharacterClass.DEMENTED_WIZARD]: [
    {
      key: "wizard_muttered_bait",
      name: "Muttered Bait",
      description: "+1 Magik. The worm learns an unsettling phrase.",
      cost: 1,
      statBonuses: { magik: 1 },
    },
    {
      key: "wizard_moon_ledger",
      name: "Moon Ledger",
      description: "+1 Luk. Keep accounts with the tide.",
      cost: 1,
      statBonuses: { luk: 1 },
    },
    {
      key: "wizard_glass_gills",
      name: "Glass Gills",
      description: "+1 Smell. Hear fish gossip through water.",
      cost: 1,
      requires: ["wizard_muttered_bait"],
      statBonuses: { smell: 1 },
    },
    {
      key: "wizard_pocket_portal",
      name: "Pocket Portal",
      description: "+1 Quietness. Fold the road until it stops complaining.",
      cost: 1,
      requires: ["wizard_moon_ledger"],
      statBonuses: { quietness: 1 },
    },
    {
      key: "wizard_argument_with_sea",
      name: "Argument with Sea",
      description: "+2 Magik. Lose the debate. Win the fish.",
      cost: 2,
      requires: ["wizard_glass_gills", "wizard_pocket_portal"],
      statBonuses: { magik: 2 },
    },
  ],
  [SeasonFiveCharacterClass.BURNT_OUT_ROGUE]: [
    {
      key: "rogue_soft_boots",
      name: "Soft Boots",
      description: "+1 Quietness. The dock never hears you quit.",
      cost: 1,
      statBonuses: { quietness: 1 },
    },
    {
      key: "rogue_stolen_lure",
      name: "Stolen Lure",
      description: "+1 Luk. Probably yours now.",
      cost: 1,
      statBonuses: { luk: 1 },
    },
    {
      key: "rogue_backwater_gossip",
      name: "Backwater Gossip",
      description: "+1 Smell. Know which puddle is lying.",
      cost: 1,
      requires: ["rogue_soft_boots"],
      statBonuses: { smell: 1 },
    },
    {
      key: "rogue_false_bottom",
      name: "False Bottom",
      description: "+1 Stronk. The pack has opinions about physics.",
      cost: 1,
      requires: ["rogue_stolen_lure"],
      statBonuses: { stronk: 1 },
    },
    {
      key: "rogue_disappear_twice",
      name: "Disappear Twice",
      description: "+1 Quietness, +1 Luk. Even the splash looks away.",
      cost: 2,
      requires: ["rogue_backwater_gossip", "rogue_false_bottom"],
      statBonuses: { quietness: 1, luk: 1 },
    },
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

const FISH_SPECIES = [
  { key: "mud-perch", name: "Mud Perch", rarity: SeasonFiveFishRarity.COMMON },
  { key: "tin-fin", name: "Tin-Fin", rarity: SeasonFiveFishRarity.COMMON },
  {
    key: "silver-grouch",
    name: "Silver Grouch",
    rarity: SeasonFiveFishRarity.UNCOMMON,
  },
  {
    key: "lantern-eel",
    name: "Lantern Eel",
    rarity: SeasonFiveFishRarity.RARE,
  },
  {
    key: "old-king-cod",
    name: "Old King Cod",
    rarity: SeasonFiveFishRarity.LEGENDARY,
  },
] as const;

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

function clampStats(stats: SeasonFiveStats) {
  return SEASON_FIVE_STAT_KEYS.reduce(
    (clamped, key) => ({
      ...clamped,
      [key]: clamp(stats[key], 1, 10),
    }),
    { ...EMPTY_STATS }
  );
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

  return {
    stats,
    catchBonus: Math.max(0, Math.floor((stats.smell - 5) / 2)),
    inventoryBonus: Math.max(0, (stats.stronk - 5) * 2),
    inventoryPressureReduction: Math.max(
      0,
      Math.floor((stats.stronk + stats.quietness - 12) / 4)
    ),
    rarityBonus: Math.max(
      0,
      (stats.luk - 5) * 3 + Math.max(0, stats.magik - 6) * 2
    ),
    sizeBonusPercent:
      Math.max(0, stats.stronk - 5) * 5 + Math.max(0, stats.magik - 5) * 2,
    travelPercent: -Math.max(0, stats.quietness - 5) * 5,
  };
}

export { calculateSeasonFiveTravelMinutes } from "./season-five-actions";

export function calculateSeasonFiveCatchIntervalMinutes(input: {
  catchDifficulty: number;
  catchBonus: number;
}) {
  return Math.max(1, 5 + input.catchDifficulty - input.catchBonus);
}

export function calculateSeasonFiveInventoryCapacity(input: {
  baseCapacity: number;
  inventoryBonus: number;
}) {
  return Math.max(1, input.baseCapacity + input.inventoryBonus);
}

export function createSeasonFiveCatch(input: {
  seed: string;
  minFishCm: number;
  maxFishCm: number;
  difficulty: number;
  sizeBonusPercent: number;
  rarityBonus?: number;
  inventoryPressure: number;
}) {
  const hash = hashString(input.seed);
  const speciesRoll = clamp((hash % 100) + (input.rarityBonus ?? 0), 0, 99);
  const species =
    speciesRoll >= 98 && input.difficulty >= 4
      ? FISH_SPECIES[4]
      : speciesRoll >= 88 && input.difficulty >= 3
        ? FISH_SPECIES[3]
        : speciesRoll >= 65
          ? FISH_SPECIES[2]
          : speciesRoll >= 35
            ? FISH_SPECIES[1]
            : FISH_SPECIES[0];
  const range = Math.max(1, input.maxFishCm - input.minFishCm);
  const sizeRoll = (hash >>> 8) % (range + 1);
  const sizeCm = Math.round(
    (input.minFishCm + sizeRoll) * (1 + input.sizeBonusPercent / 100)
  );

  return {
    speciesKey: species.key,
    speciesName: species.name,
    rarity: species.rarity,
    sizeCm: clamp(sizeCm, input.minFishCm, Math.ceil(input.maxFishCm * 1.5)),
    inventorySlots:
      species.rarity === SeasonFiveFishRarity.LEGENDARY
        ? input.inventoryPressure + 2
        : species.rarity === SeasonFiveFishRarity.RARE
          ? input.inventoryPressure + 1
          : Math.max(1, input.inventoryPressure),
  };
}

async function ensureSeasonFiveLocations(cycleId: string, db: DatabaseClient) {
  for (const location of SEASON_FIVE_LOCATIONS) {
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
      },
      update: {
        name: location.name,
        kind: location.kind,
        xPercent: location.xPercent,
        yPercent: location.yPercent,
        travelMinutes: location.travelMinutes,
        catchDifficulty: location.catchDifficulty,
        minFishCm: location.minFishCm,
        maxFishCm: location.maxFishCm,
        inventoryPressure: location.inventoryPressure,
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

  await ensureSeasonFiveLocations(cycle.id, db);
  return cycle;
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
      currentLocation: true,
      destinationLocation: true,
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
  db = prisma,
  now = new Date(),
}: {
  userId: string;
  characterClass: string;
  db?: DatabaseClient;
  now?: Date;
}) {
  const selectedClass = normalizeSeasonFiveClass(characterClass);
  const cycle = await ensureSeasonFivePreviewCycle({ db, now });
  const home = await db.seasonFiveFishingLocation.findUniqueOrThrow({
    where: {
      cycleId_key: {
        cycleId: cycle.id,
        key: "home",
      },
    },
  });
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { name: true, email: true },
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

  const characterName =
    user?.name?.trim() || user?.email?.split("@")[0]?.trim() || "Local Legend";

  return db.seasonFiveCharacter.create({
    data: {
      userId,
      cycleId: cycle.id,
      name: characterName.slice(0, 40),
      class: selectedClass,
      skillPoints: 2,
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
  const locations = await db.seasonFiveFishingLocation.findMany({
    where: {
      cycleId: cycle.id,
    },
    orderBy: [{ kind: "asc" }, { travelMinutes: "asc" }, { name: "asc" }],
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
      actionCompletesAt: true,
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
  const topByCount = await db.seasonFiveCharacter.findMany({
    where: {
      cycleId: cycle.id,
      totalFishCaught: {
        gt: 0,
      },
    },
    orderBy: [{ totalFishCaught: "desc" }, { biggestFishCm: "desc" }],
    take: 10,
    select: {
      id: true,
      name: true,
      class: true,
      totalFishCaught: true,
      biggestFishCm: true,
    },
  });
  const topBySize = await db.seasonFiveCharacter.findMany({
    where: {
      cycleId: cycle.id,
      biggestFishCm: {
        gt: 0,
      },
    },
    orderBy: [{ biggestFishCm: "desc" }, { totalFishCaught: "desc" }],
    take: 10,
    select: {
      id: true,
      name: true,
      class: true,
      totalFishCaught: true,
      biggestFishCm: true,
    },
  });

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
  const locationActivity = locations.map((location) => ({
    locationKey: location.key,
    characters: mapCharacters
      .filter((entry) =>
        entry.actionKind === SeasonFiveActionKind.TRAVELING
          ? entry.destinationLocationId === location.id
          : entry.currentLocationId === location.id
      )
      .slice(0, 18)
      .map((entry) => {
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
          actionCompletesAt: entry.actionCompletesAt,
          inventoryFull: entryInventoryUsed >= entryInventoryCapacity,
        };
      }),
  }));
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
    locations: locations.map((location) => ({
      id: location.id,
      key: location.key,
      name: location.name,
      kind: location.kind,
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
          actionCompletesAt: character.actionCompletesAt,
          currentLocationKey: character.currentLocation?.key ?? null,
          currentLocationName: character.currentLocation?.name ?? "Unknown",
          destinationLocationName: character.destinationLocation?.name ?? null,
          inventoryUsed,
          inventoryCapacity,
          inventoryFull: inventoryUsed >= inventoryCapacity,
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
    locations: SEASON_FIVE_LOCATIONS.map((location) => ({
      id: location.key,
      key: location.key,
      name: location.name,
      kind: location.kind,
      xPercent: location.xPercent,
      yPercent: location.yPercent,
      travelMinutes: location.travelMinutes,
      minFishCm: location.minFishCm,
      maxFishCm: location.maxFishCm,
      catchDifficulty: location.catchDifficulty,
    })),
    locationActivity: SEASON_FIVE_LOCATIONS.map((location) => ({
      locationKey: location.key,
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
    const capacity = calculateSeasonFiveInventoryCapacity({
      baseCapacity: character.inventoryCapacity,
      inventoryBonus: effects.inventoryBonus,
    });
    let usedSlots = character.inventoryItems.reduce(
      (sum, item) => sum + item.slots,
      0
    );
    const interval = calculateSeasonFiveCatchIntervalMinutes({
      catchDifficulty: location.catchDifficulty,
      catchBonus: effects.catchBonus,
    });
    const start = floorToMinute(character.lastResolvedAt);
    const minutesDue = Math.min(
      180,
      Math.max(0, Math.floor((resolvedAt.getTime() - start.getTime()) / 60_000))
    );
    const newCatches: ReturnType<typeof createSeasonFiveCatch>[] = [];

    for (let offset = 1; offset <= minutesDue; offset += 1) {
      const tickAt = addMinutes(start, offset);
      const minuteIndex = Math.floor(tickAt.getTime() / 60_000);
      if (minuteIndex % interval !== 0) {
        continue;
      }

      const fish = createSeasonFiveCatch({
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
      });

      if (usedSlots + fish.inventorySlots > capacity) {
        break;
      }

      usedSlots += fish.inventorySlots;
      newCatches.push(fish);
    }

    if (newCatches.length === 0) {
      await db.seasonFiveCharacter.update({
        where: { id: character.id },
        data: {
          lastResolvedAt: resolvedAt,
        },
      });
      continue;
    }

    await db.$transaction(async (tx) => {
      let biggest = character.biggestFishCm;
      for (const fish of newCatches) {
        const created = await tx.seasonFiveFishCatch.create({
          data: {
            cycleId,
            characterId: character.id,
            locationId: location.id,
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

      await tx.seasonFiveCharacter.update({
        where: { id: character.id },
        data: {
          totalFishCaught: {
            increment: newCatches.length,
          },
          experience: {
            increment: newCatches.length * 5,
          },
          biggestFishCm: biggest,
          lastResolvedAt: resolvedAt,
        },
      });
    });
    catchesCreated += newCatches.length;
  }

  return {
    travelCompleted,
    catchesCreated,
  };
}
