import { DwarfDeepMiningOutcome, RaceAbilityKind } from "@/lib/prisma-client";
import { addHours, addMinutes } from "./time";

export const DWARF_DEEP_MINING_MIN_GOLD_COMMITMENT = 150;
export const DWARF_DEEP_MINING_MAX_GOLD_COMMITMENT = 600;
export const DWARF_DEEP_MINING_RUNE_BOUNTY = 500;
export const DWARF_DEEP_MINING_RICH_VEIN_MIN_GOLD = 300;
export const DWARF_DEEP_MINING_RICH_VEIN_TICKS = 30;
export const DWARF_DEEP_MINING_ECONOMY_MULTIPLIER = 1.5;
export const DWARF_DEEP_MINING_COMBAT_MULTIPLIER = 1.25;
export const DWARF_RUNE_OF_GRUDGES_ACTIVATION_GOLD = 250;
export const DWARF_RUNE_OF_GRUDGES_MAINTENANCE_GOLD = 25;
export const DWARF_RUNE_OF_GRUDGES_MAX_DURATION_HOURS = 6;

export type DwarfDeepMiningRollOutcome = {
  outcome: DwarfDeepMiningOutcome;
  label: string;
  description: string;
};

export const DWARF_DEEP_MINING_OUTCOMES = [
  {
    outcome: DwarfDeepMiningOutcome.RICH_VEIN,
    threshold: 0.2,
    label: "Rich vein",
    description: "Immediate gold from a glittering ore pocket.",
  },
  {
    outcome: DwarfDeepMiningOutcome.ORE_SURGE,
    threshold: 0.35,
    label: "Ore surge",
    description: "+50% gold, food, and recruitment processing for one hour.",
  },
  {
    outcome: DwarfDeepMiningOutcome.BATTLE_RUNES,
    threshold: 0.5,
    label: "Battle runes",
    description: "+25% attack and defense power for one hour.",
  },
  {
    outcome: DwarfDeepMiningOutcome.FACTION_SEAL,
    threshold: 0.62,
    label: "Buried contracts",
    description: "Queued recruits surface from a hidden contract cache.",
  },
  {
    outcome: DwarfDeepMiningOutcome.BURIED_WARBAND,
    threshold: 0.75,
    label: "Buried warband",
    description: "A buried unit cache joins your idle army.",
  },
  {
    outcome: DwarfDeepMiningOutcome.CAVE_IN,
    threshold: 0.86,
    label: "Cave-in",
    description: "Idle army is lost in a tunnel collapse.",
  },
  {
    outcome: DwarfDeepMiningOutcome.UNSTABLE_TUNNELS,
    threshold: 0.95,
    label: "Unstable tunnels",
    description: "The mine sheds part of the committed gold to the depths.",
  },
  {
    outcome: DwarfDeepMiningOutcome.SHAFT_COLLAPSE,
    threshold: 1,
    label: "Shaft collapse",
    description: "Gold, food, and recruitment processing halt for one hour.",
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

export function getDwarfDeepMiningResolveAt(now: Date, committedGold: number) {
  if (committedGold < 250) {
    return addMinutes(now, 10);
  }

  if (committedGold < 400) {
    return addMinutes(now, 20);
  }

  return addMinutes(now, 30);
}

export function isDwarfDeepMiningTimedEffect(kind: RaceAbilityKind) {
  return (
    kind === RaceAbilityKind.DWARF_ECONOMY_SURGE ||
    kind === RaceAbilityKind.DWARF_COMBAT_SURGE ||
    kind === RaceAbilityKind.DWARF_RUNE_SUPPRESSION ||
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
