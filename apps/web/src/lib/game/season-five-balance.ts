import { SeasonFiveFishRarity } from "@/lib/prisma-client";
import type { SeasonFiveStats } from "./season-five";

export const SEASON_FIVE_BALANCE = {
  statMin: 1,
  statMax: 10,
  catchBaseIntervalMinutes: 5,
  catchSmellBaseline: 5,
  smellPerCatchBonus: 2,
  minCatchIntervalMinutes: 1,
  stronkInventoryBaseline: 5,
  inventorySlotsPerStronk: 2,
  minInventoryCapacity: 1,
  inventoryPressureBaseline: 12,
  inventoryPressureDivisor: 4,
  lukRarityBaseline: 5,
  rarityPerLuk: 3,
  magikRarityBaseline: 6,
  rarityPerMagik: 2,
  stronkSizeBaseline: 5,
  sizePercentPerStronk: 5,
  magikSizeBaseline: 5,
  sizePercentPerMagik: 2,
  quietnessTravelBaseline: 5,
  travelPercentPerQuietness: -5,
  legendaryRollThreshold: 98,
  rareRollThreshold: 88,
  uncommonRollThreshold: 65,
  commonAltRollThreshold: 35,
  maxSizeMultiplier: 1.5,
} as const;

const DEFAULT_FISH_SPECIES = [
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

const FISH_SPECIES_BY_PROFILE = {
  coast: [
    {
      key: "brine-sardine",
      name: "Brine Sardine",
      rarity: SeasonFiveFishRarity.COMMON,
    },
    {
      key: "tin-fin",
      name: "Tin-Fin",
      rarity: SeasonFiveFishRarity.COMMON,
    },
    {
      key: "dock-grouch",
      name: "Dock Grouch",
      rarity: SeasonFiveFishRarity.UNCOMMON,
    },
    {
      key: "stormglass-eel",
      name: "Stormglass Eel",
      rarity: SeasonFiveFishRarity.RARE,
    },
    {
      key: "old-king-cod",
      name: "Old King Cod",
      rarity: SeasonFiveFishRarity.LEGENDARY,
    },
  ],
  lake: DEFAULT_FISH_SPECIES,
  deep: [
    {
      key: "blind-minnow",
      name: "Blind Minnow",
      rarity: SeasonFiveFishRarity.COMMON,
    },
    {
      key: "pressure-cod",
      name: "Pressure Cod",
      rarity: SeasonFiveFishRarity.COMMON,
    },
    {
      key: "moonjaw",
      name: "Moonjaw",
      rarity: SeasonFiveFishRarity.UNCOMMON,
    },
    {
      key: "abyss-lantern-eel",
      name: "Abyss Lantern Eel",
      rarity: SeasonFiveFishRarity.RARE,
    },
    {
      key: "thing-below-the-boat",
      name: "Thing Below the Boat",
      rarity: SeasonFiveFishRarity.LEGENDARY,
    },
  ],
  lava_lake: [
    {
      key: "ash-carp",
      name: "Ash Carp",
      rarity: SeasonFiveFishRarity.COMMON,
    },
    {
      key: "cinder-koi",
      name: "Cinder Koi",
      rarity: SeasonFiveFishRarity.COMMON,
    },
    {
      key: "glassfin-scorcher",
      name: "Glassfin Scorcher",
      rarity: SeasonFiveFishRarity.UNCOMMON,
    },
    {
      key: "magma-eel",
      name: "Magma Eel",
      rarity: SeasonFiveFishRarity.RARE,
    },
    {
      key: "the-boiling-one",
      name: "The Boiling One",
      rarity: SeasonFiveFishRarity.LEGENDARY,
    },
  ],
} as const;

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

export function deriveSeasonFiveBuildEffectValues(stats: SeasonFiveStats) {
  return {
    catchBonus: Math.max(
      0,
      Math.floor(
        (stats.smell - SEASON_FIVE_BALANCE.catchSmellBaseline) /
          SEASON_FIVE_BALANCE.smellPerCatchBonus
      )
    ),
    inventoryBonus: Math.max(
      0,
      (stats.stronk - SEASON_FIVE_BALANCE.stronkInventoryBaseline) *
        SEASON_FIVE_BALANCE.inventorySlotsPerStronk
    ),
    inventoryPressureReduction: Math.max(
      0,
      Math.floor(
        (stats.stronk +
          stats.quietness -
          SEASON_FIVE_BALANCE.inventoryPressureBaseline) /
          SEASON_FIVE_BALANCE.inventoryPressureDivisor
      )
    ),
    rarityBonus: Math.max(
      0,
      (stats.luk - SEASON_FIVE_BALANCE.lukRarityBaseline) *
        SEASON_FIVE_BALANCE.rarityPerLuk +
        Math.max(0, stats.magik - SEASON_FIVE_BALANCE.magikRarityBaseline) *
          SEASON_FIVE_BALANCE.rarityPerMagik
    ),
    sizeBonusPercent:
      Math.max(0, stats.stronk - SEASON_FIVE_BALANCE.stronkSizeBaseline) *
        SEASON_FIVE_BALANCE.sizePercentPerStronk +
      Math.max(0, stats.magik - SEASON_FIVE_BALANCE.magikSizeBaseline) *
        SEASON_FIVE_BALANCE.sizePercentPerMagik,
    travelPercent:
      Math.max(
        0,
        stats.quietness - SEASON_FIVE_BALANCE.quietnessTravelBaseline
      ) * SEASON_FIVE_BALANCE.travelPercentPerQuietness,
  };
}

export function calculateSeasonFiveCatchIntervalMinutes(input: {
  catchDifficulty: number;
  catchBonus: number;
}) {
  return Math.max(
    SEASON_FIVE_BALANCE.minCatchIntervalMinutes,
    SEASON_FIVE_BALANCE.catchBaseIntervalMinutes +
      input.catchDifficulty -
      input.catchBonus
  );
}

export function calculateSeasonFiveInventoryCapacity(input: {
  baseCapacity: number;
  inventoryBonus: number;
}) {
  return Math.max(
    SEASON_FIVE_BALANCE.minInventoryCapacity,
    input.baseCapacity + input.inventoryBonus
  );
}

export function createSeasonFiveCatch(input: {
  seed: string;
  hash: number;
  minWeightGrams: number;
  maxWeightGrams: number;
  difficulty: number;
  sizeBonusPercent: number;
  rarityBonus?: number;
  inventoryPressure: number;
  profileKey?: string | null;
}) {
  const speciesPool =
    FISH_SPECIES_BY_PROFILE[
      input.profileKey as keyof typeof FISH_SPECIES_BY_PROFILE
    ] ?? DEFAULT_FISH_SPECIES;
  const speciesRoll = clamp(
    (input.hash % 100) + (input.rarityBonus ?? 0),
    0,
    99
  );
  const species =
    speciesRoll >= SEASON_FIVE_BALANCE.legendaryRollThreshold &&
    input.difficulty >= 4
      ? speciesPool[4]
      : speciesRoll >= SEASON_FIVE_BALANCE.rareRollThreshold &&
          input.difficulty >= 3
        ? speciesPool[3]
        : speciesRoll >= SEASON_FIVE_BALANCE.uncommonRollThreshold
          ? speciesPool[2]
          : speciesRoll >= SEASON_FIVE_BALANCE.commonAltRollThreshold
            ? speciesPool[1]
            : speciesPool[0];
  const range = Math.max(1, input.maxWeightGrams - input.minWeightGrams);
  const weightRoll = (input.hash >>> 8) % (range + 1);
  const weightGrams = Math.round(
    (input.minWeightGrams + weightRoll) * (1 + input.sizeBonusPercent / 100)
  );

  return {
    speciesKey: species.key,
    speciesName: species.name,
    rarity: species.rarity,
    weightGrams: clamp(
      weightGrams,
      input.minWeightGrams,
      Math.ceil(input.maxWeightGrams * SEASON_FIVE_BALANCE.maxSizeMultiplier)
    ),
    inventorySlots:
      species.rarity === SeasonFiveFishRarity.LEGENDARY
        ? input.inventoryPressure + 2
        : species.rarity === SeasonFiveFishRarity.RARE
          ? input.inventoryPressure + 1
      : Math.max(1, input.inventoryPressure),
  };
}
