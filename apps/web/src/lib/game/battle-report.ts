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
  targetIsUnicornDecoy?: boolean;
  targetDecoyLevel?: number | null;
  targetIsLootCamp?: boolean;
  targetLootCampVariant?: string | null;
  targetLootCampStrength?: number | null;
};

export type RaidBattleReportInput = {
  attackerName: string;
  defenderName: string;
  sentArmy: number;
  defenderArmyAtBattleStart: number | null;
  defenderDbLevel: number;
  defenderRace?: FortressRace | null;
  resolvedAttackPower?: number;
  resolvedDefensePower: number;
  outcome: RaidOutcome["outcome"];
  attackerSurvivors: number;
  attackerRetired: number;
  attackerReturned: number;
  defenderLosses: number;
  pointsLooted: number;
  foodLooted: number;
  armyLooted?: number;
  defenderIsUnicornDecoy?: boolean;
  defenderDecoyLevel?: number | null;
  defenderIsLootCamp?: boolean;
  defenderLootCampVariant?: string | null;
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
    if (input.targetIsLootCamp) {
      const reward =
        input.targetLootCampVariant === "CLASSIC"
          ? "food"
          : input.targetLootCampVariant === "RICH"
            ? "points"
            : input.targetLootCampVariant === "CHAOS"
              ? "army and race cooldown reset"
              : "loot";

      lines.push(
        `Target: ${input.targetName}, strength ${input.targetLootCampStrength ?? "unknown"}, rewards ${reward}.`
      );
      lines.push(
        "Loot camps vanish after 10 minutes and pay only when destroyed."
      );
      return lines;
    }

    if (input.targetIsUnicornDecoy) {
      lines.push(
        `Target: ${input.targetName}, unstable copy, backlash ${200 * Math.max(1, input.targetDecoyLevel ?? 1)} army.`
      );
      lines.push("The copy collapses when hit and cannot be looted.");
      return lines;
    }

    const displayedLevel = getDisplayedCastleLevel(input.targetDbLevel);
    const defenseBonusPercent = getDefenseBonusPercent(
      input.targetDbLevel,
      input.targetRace
    );

    lines.push(
      `Target: ${input.targetName}, castle level ${displayedLevel}, defense bonus +${formatPercent(defenseBonusPercent)}.`
    );

    if (
      input.targetVisibleArmy !== null &&
      input.targetVisibleArmy !== undefined
    ) {
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
  if (input.defenderIsUnicornDecoy) {
    const decoyLevel = Math.max(1, input.defenderDecoyLevel ?? 1);
    const lostArmy = input.sentArmy - input.attackerReturned;

    return [
      `Teleport decoy collapsed. ${input.attackerName} hit ${input.defenderName} with ${input.sentArmy} troops.`,
      `The unstable copy was castle level ${decoyLevel} and dealt up to ${
        200 * decoyLevel
      } army backlash.`,
      `${input.attackerReturned} returned. ${lostArmy} troops were lost to the decoy.`,
      "Loot gained: 0 points and 0 food.",
    ];
  }

  if (input.defenderIsLootCamp) {
    const rewardLine =
      input.defenderLootCampVariant === "CLASSIC"
        ? `Loot gained: ${input.foodLooted} food.`
        : input.defenderLootCampVariant === "RICH"
          ? `Loot gained: ${input.pointsLooted} points.`
          : input.defenderLootCampVariant === "CHAOS"
            ? `Loot gained: ${input.armyLooted ?? 0} army and race cooldown reset.`
            : "Loot gained: 0.";

    return [
      `Loot camp raid. ${input.attackerName} hit ${input.defenderName} with ${input.sentArmy} troops.`,
      `Camp strength was ${input.resolvedDefensePower}.`,
      `${input.attackerReturned} troops are returning. Camp health was reduced by ${input.resolvedAttackPower ?? input.sentArmy}.`,
      rewardLine,
    ];
  }

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
