import { DwarfDeepMiningOutcome, RaceAbilityKind } from "@/lib/prisma-client";
import { addHours } from "./time";

export const DWARF_DEEP_MINING_RUNE_BOUNTY = 500;
export const DWARF_DEEP_MINING_RICH_VEIN_MIN_POINTS = 300;
export const DWARF_DEEP_MINING_RICH_VEIN_TICKS = 30;
export const DWARF_DEEP_MINING_ECONOMY_MULTIPLIER = 1.5;
export const DWARF_DEEP_MINING_COMBAT_MULTIPLIER = 1.25;
export const DWARF_DEEP_MINING_SLOW_ATTACK_MULTIPLIER = 0.5;

export type DwarfDeepMiningRollOutcome = {
  outcome: DwarfDeepMiningOutcome;
  label: string;
  description: string;
};

export const DWARF_DEEP_MINING_OUTCOMES = [
  {
    outcome: DwarfDeepMiningOutcome.RICH_VEIN,
    threshold: 0.25,
    label: "Rich vein",
    description: "Immediate points from a glittering ore pocket.",
  },
  {
    outcome: DwarfDeepMiningOutcome.ORE_SURGE,
    threshold: 0.45,
    label: "Ore surge",
    description: "+50% point, food, and army production for one hour.",
  },
  {
    outcome: DwarfDeepMiningOutcome.BATTLE_RUNES,
    threshold: 0.6,
    label: "Battle runes",
    description: "+25% attack and defense power for one hour.",
  },
  {
    outcome: DwarfDeepMiningOutcome.FACTION_SEAL,
    threshold: 0.65,
    label: "Faction seal",
    description: "A contested rune suppresses the chosen target for one hour.",
  },
  {
    outcome: DwarfDeepMiningOutcome.BURIED_WARBAND,
    threshold: 0.7,
    label: "Buried warband",
    description: "A buried unit cache joins your idle army.",
  },
  {
    outcome: DwarfDeepMiningOutcome.CAVE_IN,
    threshold: 0.82,
    label: "Cave-in",
    description: "Idle army is lost in a tunnel collapse.",
  },
  {
    outcome: DwarfDeepMiningOutcome.UNSTABLE_TUNNELS,
    threshold: 0.92,
    label: "Unstable tunnels",
    description: "New Dwarf attacks and returns are 50% slower for one hour.",
  },
  {
    outcome: DwarfDeepMiningOutcome.SHAFT_COLLAPSE,
    threshold: 1,
    label: "Shaft collapse",
    description: "Point, food, and army production halts for one hour.",
  },
] as const;

export function rollDwarfDeepMining(value = Math.random()) {
  const normalized = Math.min(0.999999, Math.max(0, value));

  return (
    DWARF_DEEP_MINING_OUTCOMES.find((entry) => normalized < entry.threshold) ??
    DWARF_DEEP_MINING_OUTCOMES[DWARF_DEEP_MINING_OUTCOMES.length - 1]
  );
}

export function getDwarfDeepMiningActiveUntil(now: Date) {
  return addHours(now, 1);
}

export function isDwarfDeepMiningTimedEffect(kind: RaceAbilityKind) {
  return (
    kind === RaceAbilityKind.DWARF_ECONOMY_SURGE ||
    kind === RaceAbilityKind.DWARF_COMBAT_SURGE ||
    kind === RaceAbilityKind.DWARF_RUNE_SUPPRESSION ||
    kind === RaceAbilityKind.DWARF_SLOW_ATTACKS ||
    kind === RaceAbilityKind.DWARF_ECONOMY_HALT
  );
}

export function isFactionSuppressed(
  suppressions: Array<{
    targetFortressId: string | null;
    activeUntil: Date | null;
    runeFortress: {
      health: number;
      expiresAt: Date | null;
    } | null;
  }>,
  fortressId: string,
  now: Date
) {
  return suppressions.some((suppression) => {
    return (
      suppression.targetFortressId === fortressId &&
      suppression.activeUntil !== null &&
      suppression.activeUntil > now &&
      suppression.runeFortress !== null &&
      suppression.runeFortress.health > 0 &&
      suppression.runeFortress.expiresAt !== null &&
      suppression.runeFortress.expiresAt > now
    );
  });
}
