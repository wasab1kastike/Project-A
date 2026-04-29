import {
  getDefenseBonusPercent,
  getDisplayedCastleLevel,
  type RaidOutcome,
} from "./balance";
import type { FortressRace } from "./races";

const APPROXIMATE_FORCE_BUCKETS = [10, 100, 300, 500, 1000, 5000, 10000];

export type RaidPreviewInput = {
  availableArmy: number;
  sentArmy: number;
  targetName: string | null;
  targetDbLevel: number | null;
  targetRace?: FortressRace | null;
  targetVisibleArmy?: number | null;
};

export type RaidBattleReportInput = {
  attackerName: string;
  defenderName: string;
  sentArmy: number;
  defenderArmyAtBattleStart: number | null;
  defenderDbLevel: number;
  defenderRace?: FortressRace | null;
  resolvedDefensePower: number;
  outcome: RaidOutcome["outcome"];
  attackerSurvivors: number;
  attackerRetired: number;
  attackerReturned: number;
  defenderLosses: number;
  pointsLooted: number;
  foodLooted: number;
};

export type RaidRecallReportInput = {
  attackerName: string;
  sentArmy: number;
  returnedArmy: number;
};

function formatPercent(value: number) {
  return `${Math.round(value * 100)}%`;
}

export function formatApproximateForce(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return "unknown";
  }

  const normalizedValue = Math.max(0, Math.floor(value));

  if (normalizedValue === 0) {
    return "0";
  }

  let nearestBucket = APPROXIMATE_FORCE_BUCKETS[0];
  let nearestDistance = Math.abs(normalizedValue - nearestBucket);

  for (const bucket of APPROXIMATE_FORCE_BUCKETS.slice(1)) {
    const distance = Math.abs(normalizedValue - bucket);

    if (distance < nearestDistance || distance === nearestDistance) {
      nearestBucket = bucket;
      nearestDistance = distance;
    }
  }

  return `${nearestBucket}+`;
}

export function formatRaidAttackPreview(input: RaidPreviewInput) {
  const lines: string[] = [
    `Available army: ${input.availableArmy}. Sent army: ${input.sentArmy}.`,
  ];

  if (input.targetName && input.targetDbLevel !== null) {
    const displayedLevel = getDisplayedCastleLevel(input.targetDbLevel);
    const defenseBonusPercent = getDefenseBonusPercent(
      input.targetDbLevel,
      input.targetRace
    );

    lines.push(
      `Target: ${input.targetName}, castle level ${displayedLevel}, defense bonus +${formatPercent(defenseBonusPercent)}.`
    );

    if (input.targetVisibleArmy !== null && input.targetVisibleArmy !== undefined) {
      lines.push(
        `Target army: ${input.targetVisibleArmy}. Estimated defense power: ${Math.floor(
          input.targetVisibleArmy * (1 + defenseBonusPercent)
        )}.`
      );
    }
  } else {
    lines.push("Choose a target fortress to see defense details.");
  }

  lines.push("Defender wins ties. Sent army leaves your castle immediately.");

  return lines;
}

export function formatRaidBattleReport(input: RaidBattleReportInput) {
  const defenseBonusPercent = getDefenseBonusPercent(
    input.defenderDbLevel,
    input.defenderRace
  );
  const displayedCastleLevel = getDisplayedCastleLevel(input.defenderDbLevel);
  const isVictory = input.outcome === "ATTACKER_WIN";
  const defenderArmyEstimate = formatApproximateForce(
    input.defenderArmyAtBattleStart
  );
  const defensePowerEstimate = formatApproximateForce(
    input.resolvedDefensePower
  );

  return [
    isVictory
      ? `Raid victory! ${input.attackerName} hit ${input.defenderName} with ${input.sentArmy} troops.`
      : `Raid failed. ${input.attackerName} hit ${input.defenderName} with ${input.sentArmy} troops.`,
    input.defenderArmyAtBattleStart !== null
      ? `Battle start: defender army about ${defenderArmyEstimate}; castle level ${displayedCastleLevel}, defense +${formatPercent(
          defenseBonusPercent
        )}, power about ${defensePowerEstimate}.`
      : `Battle start: defender army not stored; castle level ${displayedCastleLevel}, defense +${formatPercent(
          defenseBonusPercent
        )}, power about ${defensePowerEstimate}.`,
    isVictory
      ? `${input.attackerSurvivors} survived, ${input.attackerReturned} returned, ${input.attackerRetired} retired. Defender lost ${input.defenderLosses} troops.`
      : `Your sent army was lost. Defender lost ${input.defenderLosses} troops.`,
    `Loot gained: ${input.pointsLooted} points and ${input.foodLooted} food.`,
  ];
}

export function formatRaidRecallReport(input: RaidRecallReportInput) {
  return [
    `Army recalled. ${input.returnedArmy} troops returned home to ${input.attackerName}.`,
    `Sent army: ${input.sentArmy}. Returned army: ${input.returnedArmy}.`,
  ];
}
