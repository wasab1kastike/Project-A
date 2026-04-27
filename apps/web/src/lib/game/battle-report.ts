import {
  getDefenseBonusPercent,
  getDisplayedCastleLevel,
  type RaidOutcome,
} from "./balance";

export type RaidPreviewInput = {
  availableArmy: number;
  sentArmy: number;
  targetName: string | null;
  targetDbLevel: number | null;
  targetVisibleArmy?: number | null;
};

export type RaidBattleReportInput = {
  attackerName: string;
  defenderName: string;
  sentArmy: number;
  defenderArmyAtBattleStart: number | null;
  defenderDbLevel: number;
  resolvedDefensePower: number;
  outcome: RaidOutcome["outcome"];
  attackerSurvivors: number;
  attackerRetired: number;
  attackerReturned: number;
  defenderLosses: number;
  pointsLooted: number;
  foodLooted: number;
};

function formatPercent(value: number) {
  return `${Math.round(value * 100)}%`;
}

export function formatRaidAttackPreview(input: RaidPreviewInput) {
  const lines: string[] = [
    `Available army: ${input.availableArmy}. Sent army: ${input.sentArmy}.`,
  ];

  if (input.targetName && input.targetDbLevel !== null) {
    const displayedLevel = getDisplayedCastleLevel(input.targetDbLevel);
    const defenseBonusPercent = getDefenseBonusPercent(input.targetDbLevel);

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
  const defenseBonusPercent = getDefenseBonusPercent(input.defenderDbLevel);
  const displayedCastleLevel = getDisplayedCastleLevel(input.defenderDbLevel);
  const isVictory = input.outcome === "ATTACKER_WIN";

  return [
    isVictory
      ? `Raid victory! ${input.attackerName} hit ${input.defenderName} with ${input.sentArmy} troops.`
      : `Raid failed. ${input.attackerName} hit ${input.defenderName} with ${input.sentArmy} troops.`,
    input.defenderArmyAtBattleStart !== null
      ? `Battle start: defender army ${input.defenderArmyAtBattleStart}; castle level ${displayedCastleLevel}, defense +${formatPercent(
          defenseBonusPercent
        )}, power ${input.resolvedDefensePower}.`
      : `Battle start: defender army not stored; castle level ${displayedCastleLevel}, defense +${formatPercent(
          defenseBonusPercent
        )}, power ${input.resolvedDefensePower}.`,
    isVictory
      ? `${input.attackerSurvivors} survived, ${input.attackerReturned} returned, ${input.attackerRetired} retired. Defender lost ${input.defenderLosses} troops.`
      : `Your sent army was lost. Defender lost ${input.defenderLosses} troops.`,
    `Loot gained: ${input.pointsLooted} points and ${input.foodLooted} food.`,
  ];
}
