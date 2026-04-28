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

export function countCastleSpecializations(
  choices: Array<{ specialization: CastleUpgradeSpecialization }>
) {
  const counts = { ...EMPTY_CASTLE_SPECIALIZATION_COUNTS };

  for (const choice of choices) {
    counts[choice.specialization] += 1;
  }

  return counts;
}

export function getCastleSpecializationMultiplier(count: number) {
  return 1 + count * 0.1;
}
