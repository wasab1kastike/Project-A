import { CastleUpgradeSpecialization } from "@/lib/prisma-client";

export const CASTLE_UPGRADE_SPECIALIZATIONS = [
  CastleUpgradeSpecialization.POINTS,
  CastleUpgradeSpecialization.FOOD,
  CastleUpgradeSpecialization.MILITARY,
  CastleUpgradeSpecialization.DEFENSE,
] as const;

export type CastleSpecializationCounts = Record<CastleUpgradeSpecialization, number>;

export const EMPTY_CASTLE_SPECIALIZATION_COUNTS: CastleSpecializationCounts = {
  [CastleUpgradeSpecialization.POINTS]: 0,
  [CastleUpgradeSpecialization.FOOD]: 0,
  [CastleUpgradeSpecialization.MILITARY]: 0,
  [CastleUpgradeSpecialization.DEFENSE]: 0,
};

export function isCastleUpgradeSpecialization(
  value: string
): value is CastleUpgradeSpecialization {
  return CASTLE_UPGRADE_SPECIALIZATIONS.includes(
    value as CastleUpgradeSpecialization
  );
}


// Accepts choices with at least { specialization, level }
export function countCastleSpecializations(
  choices: Array<{ specialization: CastleUpgradeSpecialization; level?: number }>
) {
  const counts = { ...EMPTY_CASTLE_SPECIALIZATION_COUNTS };
  for (const choice of choices) {
    // Use the highest level for each specialization
    const lvl = typeof choice.level === 'number' ? choice.level : 1;
    // Store max(level, previous)
    counts[choice.specialization] = Math.max(counts[choice.specialization], lvl);
  }
  return counts;
}

export function getCastleSpecializationMultiplier(count: number) {
  return 1 + count * 0.1;
}

/**
 * Get the before/after multiplier comparison for a building upgrade
 * 
 * Shows the current multiplier at the current level and what it will be
 * at the next level, along with the percentage increase.
 * 
 * @param currentLevel - Current building level (0 to max-1)
 * @returns Object with current multiplier, next multiplier, absolute difference, and percentage increase
 * 
 * @example
 * // A POINTS building at level 2
 * getBuildingUpgradeComparison(2)
 * // returns {
 * //   currentMultiplier: 1.2,    // 1 + 2*0.1
 * //   nextMultiplier: 1.3,       // 1 + 3*0.1
 * //   absoluteDifference: 0.1,
 * //   percentageIncrease: 8.33   // (0.1 / 1.2) * 100
 * // }
 */
export function getBuildingUpgradeComparison(currentLevel: number) {
  const currentMultiplier = getCastleSpecializationMultiplier(currentLevel);
  const nextMultiplier = getCastleSpecializationMultiplier(currentLevel + 1);
  const absoluteDifference = nextMultiplier - currentMultiplier;
  const percentageIncrease = (absoluteDifference / currentMultiplier) * 100;

  return {
    currentMultiplier,
    nextMultiplier,
    absoluteDifference,
    percentageIncrease,
  };
}
