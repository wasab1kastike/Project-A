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

export const SEASON_FIVE_FISH_SPECIES_BY_PROFILE = {
  coast: [
    {
      key: "barnacle-snoutlet",
      name: "Barnacle Snoutlet",
      rarity: SeasonFiveFishRarity.COMMON,
    },
    {
      key: "soggy-crown-herring",
      name: "Soggy Crown Herring",
      rarity: SeasonFiveFishRarity.COMMON,
    },
    {
      key: "tax-evading-crabfish",
      name: "Tax-Evading Crabfish",
      rarity: SeasonFiveFishRarity.UNCOMMON,
    },
    {
      key: "screaming-pearl-eel",
      name: "Screaming Pearl Eel",
      rarity: SeasonFiveFishRarity.RARE,
    },
    {
      key: "duke-slimewhisker",
      name: "Duke Slimewhisker",
      rarity: SeasonFiveFishRarity.LEGENDARY,
    },
  ],
  lake: [
    {
      key: "puddle-gobbler",
      name: "Puddle Gobbler",
      rarity: SeasonFiveFishRarity.COMMON,
    },
    {
      key: "mucus-pike",
      name: "Mucus Pike",
      rarity: SeasonFiveFishRarity.COMMON,
    },
    {
      key: "grumblegill",
      name: "Grumblegill",
      rarity: SeasonFiveFishRarity.UNCOMMON,
    },
    {
      key: "wizards-lost-toe-trout",
      name: "Wizard's Lost-Toe Trout",
      rarity: SeasonFiveFishRarity.RARE,
    },
    {
      key: "sir-gulp-a-lot",
      name: "Sir Gulp-a-Lot",
      rarity: SeasonFiveFishRarity.LEGENDARY,
    },
  ],
  deep: [
    {
      key: "eyeless-soupfish",
      name: "Eyeless Soupfish",
      rarity: SeasonFiveFishRarity.COMMON,
    },
    {
      key: "gloom-blubber",
      name: "Gloom Blubber",
      rarity: SeasonFiveFishRarity.COMMON,
    },
    {
      key: "teeth-with-fins",
      name: "Teeth-With-Fins",
      rarity: SeasonFiveFishRarity.UNCOMMON,
    },
    {
      key: "abyssal-belch-eel",
      name: "Abyssal Belch Eel",
      rarity: SeasonFiveFishRarity.RARE,
    },
    {
      key: "the-regrettable-mouth",
      name: "The Regrettable Mouth",
      rarity: SeasonFiveFishRarity.LEGENDARY,
    },
  ],
  lava_lake: [
    {
      key: "ashbelly-guppy",
      name: "Ashbelly Guppy",
      rarity: SeasonFiveFishRarity.COMMON,
    },
    {
      key: "cinder-snot-koi",
      name: "Cinder Snot Koi",
      rarity: SeasonFiveFishRarity.COMMON,
    },
    {
      key: "blisterfin-dumpling",
      name: "Blisterfin Dumpling",
      rarity: SeasonFiveFishRarity.UNCOMMON,
    },
    {
      key: "magma-maw-eel",
      name: "Magma Maw Eel",
      rarity: SeasonFiveFishRarity.RARE,
    },
    {
      key: "lord-scaldington",
      name: "Lord Scaldington",
      rarity: SeasonFiveFishRarity.LEGENDARY,
    },
  ],
  void_lake: [
    {
      key: "void-nibbler",
      name: "Void Nibbler",
      rarity: SeasonFiveFishRarity.COMMON,
    },
    {
      key: "blinking-holefish",
      name: "Blinking Holefish",
      rarity: SeasonFiveFishRarity.COMMON,
    },
    {
      key: "existential-gulp-eel",
      name: "Existential Gulp Eel",
      rarity: SeasonFiveFishRarity.UNCOMMON,
    },
    {
      key: "negative-bone-catfish",
      name: "Negative-Bone Catfish",
      rarity: SeasonFiveFishRarity.RARE,
    },
    {
      key: "baron-nothing-to-see",
      name: "Baron Nothing-To-See",
      rarity: SeasonFiveFishRarity.LEGENDARY,
    },
  ],
} as const;

const DEFAULT_FISH_SPECIES = SEASON_FIVE_FISH_SPECIES_BY_PROFILE.lake;

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
    SEASON_FIVE_FISH_SPECIES_BY_PROFILE[
      input.profileKey as keyof typeof SEASON_FIVE_FISH_SPECIES_BY_PROFILE
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
