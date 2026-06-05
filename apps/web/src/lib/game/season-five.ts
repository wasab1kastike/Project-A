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
import { addHours, addMinutes, floorToMinute } from "./time";

type DatabaseClient = PrismaClient;

export const SEASON_FIVE_PREVIEW_FLAG = "SEASON_5_PREVIEW_ENABLED";
export const SEASON_FIVE_DURATION_HOURS = 24 * 14;

export const SEASON_FIVE_CLASSES = {
  [SeasonFiveCharacterClass.DRUNKEN_MONK]: {
    label: "Drunken Monk",
    summary:
      "Finds rhythm in bad balance. Faster travel and reliable common catches.",
    catchBonus: 1,
    sizeBonusPercent: 0,
    travelPercent: -15,
    inventoryBonus: 0,
  },
  [SeasonFiveCharacterClass.RETIRED_WARRIOR]: {
    label: "Retired Warrior",
    summary:
      "Treats fishing like one last campaign. Better trophy size and steady packs.",
    catchBonus: 0,
    sizeBonusPercent: 12,
    travelPercent: 0,
    inventoryBonus: 2,
  },
  [SeasonFiveCharacterClass.DEMENTED_WIZARD]: {
    label: "Demented Wizard",
    summary: "Argues with the water until rare fish answer back.",
    catchBonus: 0,
    sizeBonusPercent: 8,
    travelPercent: 10,
    inventoryBonus: 0,
  },
  [SeasonFiveCharacterClass.BURNT_OUT_ROGUE]: {
    label: "Burnt-Out Rogue",
    summary:
      "Knows where the quiet docks are. Efficient inventory and strong rare-fish odds.",
    catchBonus: 0,
    sizeBonusPercent: 4,
    travelPercent: -5,
    inventoryBonus: 4,
  },
} as const;

export const SEASON_FIVE_SKILLS = [
  {
    key: "steady_hands",
    name: "Steady Hands",
    description: "Improves passive catch tempo.",
    catchBonus: 1,
    inventoryBonus: 0,
    sizeBonusPercent: 0,
    travelPercent: 0,
  },
  {
    key: "deep_pockets",
    name: "Deep Pockets",
    description: "Adds four inventory slots.",
    catchBonus: 0,
    inventoryBonus: 4,
    sizeBonusPercent: 0,
    travelPercent: 0,
  },
  {
    key: "trophy_lies",
    name: "Trophy Lies",
    description: "Makes every large fish slightly more believable.",
    catchBonus: 0,
    inventoryBonus: 0,
    sizeBonusPercent: 10,
    travelPercent: 0,
  },
  {
    key: "muddy_shortcuts",
    name: "Muddy Shortcuts",
    description: "Cuts travel time to fishing spots.",
    catchBonus: 0,
    inventoryBonus: 0,
    sizeBonusPercent: 0,
    travelPercent: -15,
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
  },
  {
    slot: SeasonFiveGearSlot.ROD,
    key: "war-veteran-cane",
    name: "War Veteran Cane",
    rarity: SeasonFiveGearRarity.UNCOMMON,
    power: 1,
    equipped: false,
  },
  {
    slot: SeasonFiveGearSlot.BAIT,
    key: "pocket-breadcrumbs",
    name: "Pocket Breadcrumbs",
    rarity: SeasonFiveGearRarity.COMMON,
    power: 0,
    equipped: true,
  },
  {
    slot: SeasonFiveGearSlot.BAIT,
    key: "glowing-worms",
    name: "Glowing Worms",
    rarity: SeasonFiveGearRarity.UNCOMMON,
    power: 1,
    equipped: false,
  },
  {
    slot: SeasonFiveGearSlot.PACK,
    key: "canvas-creel",
    name: "Canvas Creel",
    rarity: SeasonFiveGearRarity.COMMON,
    power: 0,
    equipped: true,
  },
  {
    slot: SeasonFiveGearSlot.PACK,
    key: "bottomless-ish-bucket",
    name: "Bottomless-ish Bucket",
    rarity: SeasonFiveGearRarity.RARE,
    power: 2,
    equipped: false,
  },
  {
    slot: SeasonFiveGearSlot.TRINKET,
    key: "lucky-bottlecap",
    name: "Lucky Bottlecap",
    rarity: SeasonFiveGearRarity.COMMON,
    power: 0,
    equipped: true,
  },
] as const;

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

function getSkillEffects(purchasedNodeKeys: Iterable<string>) {
  const keys = new Set(purchasedNodeKeys);
  return SEASON_FIVE_SKILLS.reduce(
    (effects, skill) => {
      if (!keys.has(skill.key)) return effects;
      return {
        catchBonus: effects.catchBonus + (skill.catchBonus ?? 0),
        inventoryBonus: effects.inventoryBonus + (skill.inventoryBonus ?? 0),
        sizeBonusPercent:
          effects.sizeBonusPercent + (skill.sizeBonusPercent ?? 0),
        travelPercent: effects.travelPercent + (skill.travelPercent ?? 0),
      };
    },
    { catchBonus: 0, inventoryBonus: 0, sizeBonusPercent: 0, travelPercent: 0 }
  );
}

function getGearEffects(
  gear: Array<{
    slot: SeasonFiveGearSlot;
    power: number;
    equipped: boolean;
  }>
) {
  return gear
    .filter((item) => item.equipped)
    .reduce(
      (effects, item) => {
        if (item.slot === SeasonFiveGearSlot.ROD) {
          effects.sizeBonusPercent += item.power * 6;
        } else if (item.slot === SeasonFiveGearSlot.BAIT) {
          effects.catchBonus += item.power;
        } else if (item.slot === SeasonFiveGearSlot.PACK) {
          effects.inventoryBonus += item.power * 4;
        } else if (item.slot === SeasonFiveGearSlot.TRINKET) {
          effects.sizeBonusPercent += item.power * 3;
        }
        return effects;
      },
      { catchBonus: 0, inventoryBonus: 0, sizeBonusPercent: 0 }
    );
}

export function getSeasonFiveBuildEffects(input: {
  characterClass: SeasonFiveCharacterClass;
  gear?: Array<{ slot: SeasonFiveGearSlot; power: number; equipped: boolean }>;
  purchasedNodeKeys?: Iterable<string>;
}) {
  const classEffects = SEASON_FIVE_CLASSES[input.characterClass];
  const gearEffects = getGearEffects(input.gear ?? []);
  const skillEffects = getSkillEffects(input.purchasedNodeKeys ?? []);

  return {
    catchBonus:
      classEffects.catchBonus +
      gearEffects.catchBonus +
      skillEffects.catchBonus,
    inventoryBonus:
      classEffects.inventoryBonus +
      gearEffects.inventoryBonus +
      skillEffects.inventoryBonus,
    sizeBonusPercent:
      classEffects.sizeBonusPercent +
      gearEffects.sizeBonusPercent +
      skillEffects.sizeBonusPercent,
    travelPercent: classEffects.travelPercent + skillEffects.travelPercent,
  };
}

export function calculateSeasonFiveTravelMinutes(input: {
  baseMinutes: number;
  travelPercent: number;
}) {
  if (input.baseMinutes <= 0) return 0;
  return Math.max(
    1,
    Math.ceil(input.baseMinutes * (1 + input.travelPercent / 100))
  );
}

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
  inventoryPressure: number;
}) {
  const hash = hashString(input.seed);
  const speciesRoll = hash % 100;
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
      inventoryCapacity: 12 + SEASON_FIVE_CLASSES[selectedClass].inventoryBonus,
      gear: {
        createMany: {
          data: STARTER_GEAR.map((gear) => ({ ...gear })),
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
  const skill = SEASON_FIVE_SKILLS.find(
    (candidate) => candidate.key === nodeKey
  );
  if (!skill) {
    throw new GameError("That Season 5 skill does not exist.");
  }

  const cycle = await ensureSeasonFivePreviewCycle({ db });

  await db.$transaction(async (tx) => {
    const character = await tx.seasonFiveCharacter.findUnique({
      where: { cycleId_userId: { cycleId: cycle.id, userId } },
      include: { skillPurchases: true },
    });

    if (!character) {
      throw new GameError("Create a Season 5 character before buying skills.");
    }

    if (
      character.skillPurchases.some((purchase) => purchase.nodeKey === nodeKey)
    ) {
      throw new GameError("That skill is already unlocked.");
    }

    if (character.skillPoints <= 0) {
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
        skillPoints: { decrement: 1 },
        inventoryCapacity:
          nodeKey === "deep_pockets"
            ? character.inventoryCapacity + 4
            : character.inventoryCapacity,
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
  const travelMinutes = calculateSeasonFiveTravelMinutes({
    baseMinutes: destination.travelMinutes,
    travelPercent: effects.travelPercent,
  });

  await db.seasonFiveCharacter.update({
    where: { id: character.id },
    data: {
      actionKind: SeasonFiveActionKind.TRAVELING,
      destinationLocationId: destination.id,
      actionStartedAt: now,
      actionCompletesAt: addMinutes(now, travelMinutes),
      lastResolvedAt: now,
    },
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
      data: {
        actionKind: SeasonFiveActionKind.AT_HOME,
        destinationLocationId: null,
        actionStartedAt: null,
        actionCompletesAt: null,
        lastResolvedAt: now,
      },
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
  const travelMinutes = calculateSeasonFiveTravelMinutes({
    baseMinutes: 10,
    travelPercent: effects.travelPercent,
  });

  await db.seasonFiveCharacter.update({
    where: { id: character.id },
    data: {
      actionKind: SeasonFiveActionKind.TRAVELING,
      destinationLocationId: home.id,
      actionStartedAt: now,
      actionCompletesAt: addMinutes(now, travelMinutes),
      lastResolvedAt: now,
    },
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
          inventoryBonus: 0,
        })
      : 0;

  return {
    cycle: {
      id: cycle.id,
      activeEndsAt: cycle.activeEndsAt,
    },
    classes: Object.entries(SEASON_FIVE_CLASSES).map(([key, definition]) => ({
      key,
      ...definition,
    })),
    skills: SEASON_FIVE_SKILLS,
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
          actionKind: character.actionKind,
          actionCompletesAt: character.actionCompletesAt,
          currentLocationKey: character.currentLocation?.key ?? null,
          currentLocationName: character.currentLocation?.name ?? "Unknown",
          destinationLocationName: character.destinationLocation?.name ?? null,
          inventoryUsed,
          inventoryCapacity,
          inventoryFull: inventoryUsed >= inventoryCapacity,
          effects,
          gear: character.gear.map((gear) => ({
            id: gear.id,
            slot: gear.slot,
            key: gear.key,
            name: gear.name,
            rarity: gear.rarity,
            power: gear.power,
            equipped: gear.equipped,
          })),
          skillPurchases: character.skillPurchases.map(
            (purchase) => purchase.nodeKey
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
    classes: Object.entries(SEASON_FIVE_CLASSES).map(([key, definition]) => ({
      key,
      ...definition,
    })),
    skills: SEASON_FIVE_SKILLS,
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
        data: {
          actionKind: SeasonFiveActionKind.AT_HOME,
          currentLocationId: destination.id,
          destinationLocationId: null,
          actionStartedAt: null,
          actionCompletesAt: null,
          lastResolvedAt: resolvedAt,
        },
      });
    } else {
      await db.seasonFiveCharacter.update({
        where: { id: character.id },
        data: {
          actionKind: SeasonFiveActionKind.FISHING,
          currentLocationId: destination.id,
          destinationLocationId: null,
          actionStartedAt: resolvedAt,
          actionCompletesAt: null,
          lastResolvedAt: resolvedAt,
        },
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
      inventoryBonus: 0,
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
        inventoryPressure: location.inventoryPressure,
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
