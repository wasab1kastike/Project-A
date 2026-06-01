import {
  ConvoyLegStatus,
  DiplomacyRelationStatus,
} from "@/lib/prisma-client";
import { calculateTradeCargoValue, getTradeNukeComponents, type TradeCargo } from "./trading";

export const RAID_ELIGIBLE_CARGO_VALUE = 1_000;
export const RAID_WINNER_CASUALTY_PERCENT = 15;
export const RAID_LOSER_CASUALTY_PERCENT = 40;

export function getRaidTargetBlockedReason(status: DiplomacyRelationStatus) {
  return status === DiplomacyRelationStatus.ALLIED
    ? "Allied routes cannot be raided."
    : null;
}

export function isConvoyRaidEligible({
  status,
  baseCargoValue,
  encounterResolvedAt,
  hasDeed = false,
}: {
  status: ConvoyLegStatus;
  baseCargoValue: number;
  encounterResolvedAt?: Date | null;
  hasDeed?: boolean;
}) {
  return (
    status === ConvoyLegStatus.IN_TRANSIT &&
    !encounterResolvedAt &&
    (hasDeed || baseCargoValue >= RAID_ELIGIBLE_CARGO_VALUE)
  );
}

function clampChance(value: number) {
  return Math.max(10, Math.min(90, value));
}

export function calculateRaidSuccessChance({
  raidArmy,
  escortArmy,
}: {
  raidArmy: number;
  escortArmy: number;
}) {
  if (raidArmy <= 0) {
    return 10;
  }

  return clampChance(
    Math.round((100 * raidArmy) / (raidArmy + Math.max(0, escortArmy)))
  );
}

export function calculateDetectionChance({
  guardArmy,
  raidArmy,
}: {
  guardArmy: number;
  raidArmy: number;
}) {
  if (guardArmy <= 0) {
    return null;
  }

  return clampChance(
    Math.round((100 * guardArmy) / (guardArmy + Math.max(0, raidArmy)))
  );
}

function stableRoll(seed: string) {
  let hash = 2166136261;

  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return (Math.abs(hash) % 100) + 1;
}

export function resolveSeededChance({
  seed,
  chancePercent,
}: {
  seed: string;
  chancePercent: number;
}) {
  const roll = stableRoll(seed);

  return {
    chancePercent,
    roll,
    succeeded: roll <= chancePercent,
  };
}

function calculateCasualties(army: number, percent: number) {
  return army > 0 ? Math.min(army, Math.max(1, Math.ceil((army * percent) / 100))) : 0;
}

export function calculateConvoyEncounterCasualties({
  raidArmy,
  escortArmy,
  raidSucceeded,
}: {
  raidArmy: number;
  escortArmy: number;
  raidSucceeded: boolean;
}) {
  return {
    raidLosses: calculateCasualties(
      raidArmy,
      raidSucceeded ? RAID_WINNER_CASUALTY_PERCENT : RAID_LOSER_CASUALTY_PERCENT
    ),
    escortLosses: calculateCasualties(
      escortArmy,
      raidSucceeded ? RAID_LOSER_CASUALTY_PERCENT : RAID_WINNER_CASUALTY_PERCENT
    ),
  };
}

export function calculateStolenConvoyCargo(
  cargo: TradeCargo,
  stolenCargoMultiplier = 1
) {
  const share = Math.min(1, 0.5 * Math.max(1, stolenCargoMultiplier));
  const nukeComponents = getTradeNukeComponents(cargo);
  const stolen = {
    gold: Math.floor(cargo.gold * share),
    food: Math.floor(cargo.food * share),
    army: Math.floor(cargo.army * share),
    points: Math.floor(cargo.points * share),
    ...(cargo.nukeComponents
      ? {
          nukeComponents: {
            FUEL: Math.floor(nukeComponents.FUEL * share),
            ROCKET: Math.floor(nukeComponents.ROCKET * share),
            WRATH_OF_A: Math.floor(nukeComponents.WRATH_OF_A * share),
          },
        }
      : {}),
  };
  const baseValue = calculateTradeCargoValue(stolen);

  return {
    ...stolen,
    baseValue,
    scorePoints: Math.floor(baseValue / 1_000),
  };
}
