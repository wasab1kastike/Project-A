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
  minFishCm: number;
  maxFishCm: number;
  difficulty: number;
  sizeBonusPercent: number;
  rarityBonus?: number;
  inventoryPressure: number;
}) {
  const speciesRoll = clamp(
    (input.hash % 100) + (input.rarityBonus ?? 0),
    0,
    99
  );
  const species =
    speciesRoll >= SEASON_FIVE_BALANCE.legendaryRollThreshold &&
    input.difficulty >= 4
      ? FISH_SPECIES[4]
      : speciesRoll >= SEASON_FIVE_BALANCE.rareRollThreshold &&
          input.difficulty >= 3
        ? FISH_SPECIES[3]
        : speciesRoll >= SEASON_FIVE_BALANCE.uncommonRollThreshold
          ? FISH_SPECIES[2]
          : speciesRoll >= SEASON_FIVE_BALANCE.commonAltRollThreshold
            ? FISH_SPECIES[1]
            : FISH_SPECIES[0];
  const range = Math.max(1, input.maxFishCm - input.minFishCm);
  const sizeRoll = (input.hash >>> 8) % (range + 1);
  const sizeCm = Math.round(
    (input.minFishCm + sizeRoll) * (1 + input.sizeBonusPercent / 100)
  );

  return {
    speciesKey: species.key,
    speciesName: species.name,
    rarity: species.rarity,
    sizeCm: clamp(
      sizeCm,
      input.minFishCm,
      Math.ceil(input.maxFishCm * SEASON_FIVE_BALANCE.maxSizeMultiplier)
    ),
    inventorySlots:
      species.rarity === SeasonFiveFishRarity.LEGENDARY
        ? input.inventoryPressure + 2
        : species.rarity === SeasonFiveFishRarity.RARE
          ? input.inventoryPressure + 1
          : Math.max(1, input.inventoryPressure),
  };
}
