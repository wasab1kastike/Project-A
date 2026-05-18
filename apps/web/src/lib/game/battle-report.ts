import {
  getDefenseBonusPercent,
  getDisplayedCastleLevel,
  type RaidOutcome,
} from "./balance";
import type { FortressRace } from "./races";
import type { CastleSpecializationCounts } from "./specializations";

const APPROXIMATE_FORCE_BUCKETS = [10, 100, 300, 500, 1000, 5000, 10000];

export type RaidPreviewInput = {
  availableArmy: number;
  sentArmy: number;
  targetName: string | null;
  targetDbLevel: number | null;
  targetRace?: FortressRace | null;
  targetCastleSpecializations?: Partial<CastleSpecializationCounts>;
  targetVisibleArmy?: number | null;
  targetIsUnicornDecoy?: boolean;
  targetDecoyLevel?: number | null;
  targetIsLootCamp?: boolean;
  targetLootCampVariant?: string | null;
  targetLootCampStrength?: number | null;
  targetLootCampDefenseArmy?: number | null;
};

export type RaidBattleReportInput = {
  attackerName: string;
  defenderName: string;
  sentArmy: number;
  defenderArmyAtBattleStart: number | null;
  defenderDbLevel: number;
  defenderRace?: FortressRace | null;
  defenderCastleSpecializations?: Partial<CastleSpecializationCounts>;
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
  defenderIsHomeOfABoss?: boolean;
};

export type RaidRecallReportInput = {
  attackerName: string;
  sentArmy: number;
  returnedArmy: number;
  lostArmy?: number;
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
          ? "food with a little gold"
        : input.targetLootCampVariant === "RICH"
            ? "gold and food with very few points"
            : input.targetLootCampVariant === "CHAOS"
              ? "army, supplies, and race cooldown reset"
              : "loot";

      lines.push(
        `Target: ${input.targetName}, strength ${input.targetLootCampStrength ?? "unknown"}, defending army ${input.targetLootCampDefenseArmy ?? "unknown"}, rewards ${reward}.`
      );
      lines.push(
        "Loot camps vanish after 30 minutes, fight back, and pay only when destroyed."
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
      input.targetRace,
      input.targetCastleSpecializations
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
  // Enhanced battle report for richer, clearer feedback
  // MVP and special event highlights (if available in input)

  // Helper for MVP line
  function getMvpLine(input: any) {
    if (input.mvpName) {
      return `MVP: ${input.mvpName} (${input.mvpRole ?? "top contributor"})`;
    }
    return null;
  }

  if (input.defenderIsUnicornDecoy) {
    const decoyLevel = Math.max(1, input.defenderDecoyLevel ?? 1);
    const lostArmy = input.sentArmy - input.attackerReturned;
    const lines = [
      `Teleport decoy collapsed! ${input.attackerName} hit ${input.defenderName} with ${input.sentArmy} troops.`,
      `The unstable copy was castle level ${decoyLevel} and dealt up to ${200 * decoyLevel} army backlash.`,
      `${input.attackerReturned} returned. ${lostArmy} troops were lost to the decoy.`,
      "Loot gained: 0 gold and 0 food.",
    ];
    const mvp = getMvpLine(input);
    if (mvp) lines.push(mvp);
    return lines;
  }

  if (input.defenderIsLootCamp) {
    const rewardLine =
      input.defenderLootCampVariant === "CLASSIC"
        ? `Loot gained: ${input.pointsLooted} gold and ${input.foodLooted} food.`
        : input.defenderLootCampVariant === "RICH"
          ? `Loot gained: ${input.pointsLooted} gold and ${input.foodLooted} food.`
          : input.defenderLootCampVariant === "CHAOS"
            ? `Loot gained: ${input.pointsLooted} gold, ${input.foodLooted} food, ${input.armyLooted ?? 0} army, and race cooldown reset.`
            : "Loot gained: 0.";

    const lines = [
      `Loot camp raid! ${input.attackerName} hit ${input.defenderName} with ${input.sentArmy} troops.`,
      `Camp defending army: ${input.defenderArmyAtBattleStart ?? 0}, defense power: ${input.resolvedDefensePower}.`,
      input.outcome === "ATTACKER_WIN"
        ? `${input.attackerSurvivors} survived, ${input.attackerReturned} returned, ${input.attackerRetired} retired. Camp health reduced by ${input.resolvedAttackPower ?? 0}.`
        : `The camp fought back. Your sent army was lost, and the camp lost ${input.defenderLosses} defenders.`,
      rewardLine,
    ];
    const mvp = getMvpLine(input);
    if (mvp) lines.push(mvp);
    return lines;
  }

  if (input.defenderIsHomeOfABoss) {
    const rewardLine =
      input.pointsLooted > 0 ||
      input.foodLooted > 0 ||
      (input.armyLooted ?? 0) > 0
        ? `Boss reward: ${input.pointsLooted} points, ${input.foodLooted} food, and ${input.armyLooted ?? 0} army.`
        : "Boss damage recorded. The top damage dealer gets the reward when Home of A falls.";

    const lines = [
      `Boss raid! ${input.attackerName} hit ${input.defenderName} with ${input.sentArmy} troops.`,
      `Home of A took ${input.resolvedAttackPower ?? 0} damage from this march.`,
      `${input.attackerReturned} returned. Home of A does not drop normal raid loot.`,
      rewardLine,
    ];
    const mvp = getMvpLine(input);
    if (mvp) lines.push(mvp);
    return lines;
  }

  const defenseBonusPercent = getDefenseBonusPercent(
    input.defenderDbLevel,
    input.defenderRace,
    input.defenderCastleSpecializations
  );
  const displayedCastleLevel = getDisplayedCastleLevel(input.defenderDbLevel);
  const isVictory = input.outcome === "ATTACKER_WIN";
  const defenderArmyEstimate = formatApproximateForce(
    input.defenderArmyAtBattleStart
  );
  const defensePowerEstimate = formatApproximateForce(
    input.resolvedDefensePower
  );

  const lines = [
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
    `Loot gained: ${input.pointsLooted} gold and ${input.foodLooted} food.`,
  ];
  // Add MVP line if available
  const mvp = getMvpLine(input);
  if (mvp) lines.push(mvp);
  // Add special event highlights if present
  if (input.specialEvent) lines.push(`Special event: ${input.specialEvent}`);
  return lines;
}

export function formatRaidRecallReport(input: RaidRecallReportInput) {
  const lines = [
    `Army recalled. ${input.returnedArmy} troops returned home to ${input.attackerName}.`,
    `Sent army: ${input.sentArmy}. Returned army: ${input.returnedArmy}.`,
  ];

  if ((input.lostArmy ?? 0) > 0) {
    lines.push(`Recall cost: ${input.lostArmy} troops lost.`);
  }

  return lines;
}
