// =============================================================================
// Season 4 Dwarf Abilities — Grudge Economy + Deep Mining
// =============================================================================
// Pure functions only. No DB / Prisma imports.
// =============================================================================

import {
  AbilityActivationResult,
  computeCooldownEndsAt,
  DwarfDeepMiningOutcome,
  floor,
  RaceAbilityKind,
  ResourceSnapshot,
} from "./race-abilities";

// ═════════════════════════════════════════════════════════════════════════════
// 1. Grudge Economy
// ═════════════════════════════════════════════════════════════════════════════

export const GRUDGE_MAX_TIER = 3;

/** One dwarf fortress's grudge against a target. */
export type Grudge = {
  /** Who the grudge targets. */
  targetFortressId: string;
  /** Grudge tier 1–3. Higher tiers produce more bounty per tick. */
  tier: number;
  /** Epoch ms when the grudge was declared (or upgraded). */
  activeAt: number;
  /** Bounty points accrued since activeAt. */
  bountyPoints: number;
};

/** Bounty points earned per minute (tick), by grudge tier. */
export const GRUDGE_BOUNTY_PER_TICK: Record<number, number> = {
  1: 2,
  2: 5,
  3: 12,
};

/**
 * Bounty points earned per tick (1 minute). Caps at the maximum tier.
 */
export function bountyPerTick(tier: number): number {
  return GRUDGE_BOUNTY_PER_TICK[Math.min(tier, GRUDGE_MAX_TIER)] ?? 0;
}

/**
 * Calculate bounty points accrued since a grudge was activated, given the
 * number of ticks that have elapsed.
 */
export function calculateGrudgeBounty(
  grudge: Grudge,
  ticksElapsed: number,
): number {
  return grudge.bountyPoints + ticksElapsed * bountyPerTick(grudge.tier);
}

/**
 * Score value awarded when bounty is collected (target attacked/destroyed).
 * Formula: bountyPoints × tier multiplier.
 */
export function grudgeBountyScoreValue(
  bountyPoints: number,
  tier: number,
): number {
  return Math.floor(bountyPoints * (1 + (tier - 1) * 0.5));
}

/**
 * Validate that a fortress can place a Rune of Grudges on a target.
 * Returns error string or null (valid).
 */
export function validateRunePlacement(args: {
  /** Does the caster already have an active grudge on this target? */
  existingGrudgeOnTarget: Grudge | undefined;
  /** Is the target a valid enemy? (must not be allied/self/NPC-rune) */
  targetIsValid: boolean;
  /** Does the caster have any grudge slots available? */
  hasFreeGrudgeSlot: boolean;
}): string | null {
  if (!args.targetIsValid) {
    return "You cannot place a Rune of Grudges on that target.";
  }
  if (args.existingGrudgeOnTarget) {
    return "You already have an active grudge against this fortress.";
  }
  if (!args.hasFreeGrudgeSlot) {
    return "You have no free grudge slots. Resolve an existing grudge first.";
  }
  return null;
}

/** Maximum number of simultaneous active grudges for a Dwarf fortress. */
export const MAX_ACTIVE_GRUDGES = 3;

/**
 * Grudge upgrade cost in gold, by target tier.
 * Tier 1 (new grudge) → 500 gold
 * Tier 1→2 upgrade     → 1,000 gold
 * Tier 2→3 upgrade     → 2,500 gold
 */
export const GRUDGE_UPGRADE_GOLD_COST: Record<number, number> = {
  1: 500,
  2: 1_000,
  3: 2_500,
};

/**
 * Create a new grudge (tier 1) against a target.
 */
export function createGrudge(
  targetFortressId: string,
  now: number,
): Grudge {
  return {
    targetFortressId,
    tier: 1,
    activeAt: now,
    bountyPoints: 0,
  };
}

/**
 * Upgrade an existing grudge to a higher tier. Returns the updated grudge.
 * Does NOT validate cost — that's the caller's job.
 */
export function upgradeGrudge(
  grudge: Grudge,
  newTier: number,
  now: number,
): Grudge {
  return {
    ...grudge,
    tier: Math.min(newTier, GRUDGE_MAX_TIER),
    activeAt: now,
  };
}

// ═════════════════════════════════════════════════════════════════════════════
// 2. Deep Mining
// ═════════════════════════════════════════════════════════════════════════════

/** Gold cost to start a Deep Mining expedition. */
export const DEEP_MINING_GOLD_COST = 2_000;

/** How long the expedition takes (ms). Miners are committed during this time. */
export const DEEP_MINING_DURATION_MS = 1_800_000; // 30 minutes

/** Maximum gold that can be invested (higher investment = better outcomes). */
export const DEEP_MINING_MAX_INVESTMENT = 10_000;

/**
 * Weighted outcome table.
 * Weights sum to 100 for percentage-like interpretation.
 * Higher gold investment shifts weights toward favorable outcomes.
 */
export type MiningOutcomeEntry = {
  outcome: DwarfDeepMiningOutcome;
  baseWeight: number;
  /** Extra weight per 1000 gold invested beyond the base cost. */
  weightPerK: number;
  /** Multiplier applied to goldDelta (good outcomes) or loss (bad outcomes). */
  goldMultiplier: number;
  /** Base gold delta before multiplier. */
  baseGoldDelta: number;
  baseFoodDelta: number;
  runesFound: number;
  summary: string;
};

export const DEEP_MINING_OUTCOME_TABLE: MiningOutcomeEntry[] = [
  {
    outcome: DwarfDeepMiningOutcome.RICH_VEIN,
    baseWeight: 15,
    weightPerK: 3,
    goldMultiplier: 2.5,
    baseGoldDelta: 3_000,
    baseFoodDelta: 0,
    runesFound: 0,
    summary: "The miners struck a rich vein! Gold pours into your coffers.",
  },
  {
    outcome: DwarfDeepMiningOutcome.ORE_SURGE,
    baseWeight: 20,
    weightPerK: 2,
    goldMultiplier: 1.5,
    baseGoldDelta: 1_500,
    baseFoodDelta: 500,
    runesFound: 0,
    summary:
      "A surge of ore and provisions — your fortress stockpiles grow.",
  },
  {
    outcome: DwarfDeepMiningOutcome.BATTLE_RUNES,
    baseWeight: 12,
    weightPerK: 2,
    goldMultiplier: 0.3,
    baseGoldDelta: 300,
    baseFoodDelta: 0,
    runesFound: 3,
    summary:
      "Ancient battle runes unearthed! Your next attack deals bonus damage.",
  },
  {
    outcome: DwarfDeepMiningOutcome.FACTION_SEAL,
    baseWeight: 10,
    weightPerK: 1,
    goldMultiplier: 0,
    baseGoldDelta: 0,
    baseFoodDelta: 0,
    runesFound: 1,
    summary:
      "A faction seal of the old Dwarf clans — grants a minor rune and faction standing.",
  },
  {
    outcome: DwarfDeepMiningOutcome.BURIED_WARBAND,
    baseWeight: 13,
    weightPerK: 1,
    goldMultiplier: -0.5, // costs gold, but gives army
    baseGoldDelta: -800,
    baseFoodDelta: 0,
    runesFound: 0,
    summary:
      "A buried warband awakens! They join your army — for a price.",
  },
  {
    outcome: DwarfDeepMiningOutcome.CAVE_IN,
    baseWeight: 14,
    weightPerK: -2,
    goldMultiplier: -1.0,
    baseGoldDelta: -1_500,
    baseFoodDelta: 0,
    runesFound: 0,
    summary:
      "The tunnels collapsed. Miners escape empty-handed and gold is lost.",
  },
  {
    outcome: DwarfDeepMiningOutcome.UNSTABLE_TUNNELS,
    baseWeight: 10,
    weightPerK: -1,
    goldMultiplier: -0.3,
    baseGoldDelta: -400,
    baseFoodDelta: 0,
    runesFound: 0,
    summary:
      "Unstable tunnels slow the expedition. Half the gold is recovered.",
  },
  {
    outcome: DwarfDeepMiningOutcome.SHAFT_COLLAPSE,
    baseWeight: 6,
    weightPerK: -3,
    goldMultiplier: -1.5,
    baseGoldDelta: -2_500,
    baseFoodDelta: 0,
    runesFound: 0,
    summary:
      "A catastrophic shaft collapse. Most of the invested gold is lost.",
  },
];

/** Result of resolving a Deep Mining expedition. */
export type MiningResult = {
  outcome: DwarfDeepMiningOutcome;
  goldDelta: number;
  foodDelta: number;
  runesFound: number;
  summary: string;
};

/**
 * Roll a weighted outcome for Deep Mining.
 * `extraGold` = gold invested beyond the base cost (capped at MAX_INVESTMENT).
 */
export function rollDeepMiningOutcome(extraGold: number): MiningResult {
  const extraK = Math.max(0, Math.floor(extraGold / 1_000));
  const table = DEEP_MINING_OUTCOME_TABLE;

  // Build weighted entries based on investment.
  const weighted = table.map((entry) => {
    const adjustedWeight = Math.max(
      0,
      entry.baseWeight + entry.weightPerK * extraK,
    );
    return { entry, adjustedWeight };
  });

  const totalWeight = weighted.reduce((s, w) => s + w.adjustedWeight, 0);
  if (totalWeight <= 0) {
    // Fallback: uniform distribution.
    const idx = Math.floor(Math.random() * table.length);
    const entry = table[idx];
    return buildMiningResult(entry, extraK);
  }

  let roll = Math.random() * totalWeight;
  for (const { entry, adjustedWeight } of weighted) {
    roll -= adjustedWeight;
    if (roll <= 0) {
      return buildMiningResult(entry, extraK);
    }
  }

  // Fallthrough (floating-point edge case) — return last entry.
  return buildMiningResult(table[table.length - 1], extraK);
}

function buildMiningResult(
  entry: MiningOutcomeEntry,
  extraK: number,
): MiningResult {
  const goldDelta = Math.floor(
    entry.baseGoldDelta + entry.goldMultiplier * extraK * 1_000,
  );
  return {
    outcome: entry.outcome,
    goldDelta,
    foodDelta: entry.baseFoodDelta,
    runesFound: entry.runesFound,
    summary: entry.summary,
  };
}

/** Start a Deep Mining expedition. Returns the expedition state. */
export type MiningExpedition = {
  startedAt: number;
  returnsAt: number;
  goldInvested: number;
};

export function startMiningExpedition(
  goldInvested: number,
  now: number,
): MiningExpedition {
  const capped = Math.min(goldInvested, DEEP_MINING_MAX_INVESTMENT);
  return {
    startedAt: now,
    returnsAt: now + DEEP_MINING_DURATION_MS,
    goldInvested: capped,
  };
}

/** Check whether an expedition has returned. */
export function isExpeditionReady(
  expedition: MiningExpedition,
  now: number,
): boolean {
  return now >= expedition.returnsAt;
}

/**
 * Resolve a Deep Mining expedition — returns null if not yet ready.
 */
export function resolveExpedition(
  expedition: MiningExpedition,
  now: number,
): MiningResult | null {
  if (!isExpeditionReady(expedition, now)) return null;
  const extraGold = expedition.goldInvested - DEEP_MINING_GOLD_COST;
  return rollDeepMiningOutcome(extraGold);
}

// ═════════════════════════════════════════════════════════════════════════════
// 3. Activation Helpers
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Activate Deep Mining. Returns success or error.
 * Pure function — caller handles persistence and auth.
 */
export function activateDeepMining(args: {
  gold: number;
  cooldownEndsAt: number | undefined;
  extraInvestment: number;
  now: number;
}): AbilityActivationResult {
  const totalCost = DEEP_MINING_GOLD_COST + args.extraInvestment;
  if (args.gold < totalCost) {
    return {
      ok: false,
      error: `Deep Mining requires ${totalCost.toLocaleString()} gold (you have ${args.gold.toLocaleString()}).`,
    };
  }

  const expedition = startMiningExpedition(totalCost, args.now);

  return {
    ok: true,
    cooldownEndsAt: computeCooldownEndsAt(
      RaceAbilityKind.DWARF_DEEP_MINING,
      args.now,
    ),
    data: {
      expedition,
      goldSpent: totalCost,
    },
  };
}

/**
 * Activate Rune of Grudges (declare a new grudge).
 * Pure function — caller handles persistence and auth.
 */
export function activateRuneOfGrudges(args: {
  gold: number;
  cooldownEndsAt: number | undefined;
  activeGrudgeCount: number;
  existingGrudgeOnTarget: Grudge | undefined;
  targetIsValid: boolean;
  now: number;
}): AbilityActivationResult {
  const validationError = validateRunePlacement({
    existingGrudgeOnTarget: args.existingGrudgeOnTarget,
    targetIsValid: args.targetIsValid,
    hasFreeGrudgeSlot: args.activeGrudgeCount < MAX_ACTIVE_GRUDGES,
  });
  if (validationError) return { ok: false, error: validationError };

  const cost = GRUDGE_UPGRADE_GOLD_COST[1];
  if (args.gold < cost) {
    return {
      ok: false,
      error: `Placing a Rune of Grudges costs ${cost.toLocaleString()} gold.`,
    };
  }

  return {
    ok: true,
    cooldownEndsAt: computeCooldownEndsAt(
      RaceAbilityKind.DWARF_RUNE_OF_GRUDGES,
      args.now,
    ),
    data: { goldSpent: cost, tier: 1 },
  };
}

/**
 * Upgrade an existing grudge to a higher tier.
 */
export function upgradeRuneOfGrudges(args: {
  gold: number;
  grudge: Grudge;
  now: number;
}): AbilityActivationResult {
  if (args.grudge.tier >= GRUDGE_MAX_TIER) {
    return { ok: false, error: "This grudge is already at max tier." };
  }

  const newTier = args.grudge.tier + 1;
  const cost = GRUDGE_UPGRADE_GOLD_COST[newTier];
  if (args.gold < cost) {
    return {
      ok: false,
      error: `Upgrading to tier ${newTier} costs ${cost.toLocaleString()} gold.`,
    };
  }

  return {
    ok: true,
    data: {
      goldSpent: cost,
      oldTier: args.grudge.tier,
      newTier,
      upgradedGrudge: upgradeGrudge(args.grudge, newTier, args.now),
    },
  };
}

/**
 * Collect bounty from a grudge when the target is attacked.
 * Returns the score value and resets accumulated bounty points.
 */
export function collectGrudgeBounty(grudge: Grudge): {
  scoreValue: number;
  bountyCollected: number;
  tier: number;
} {
  const bountyCollected = grudge.bountyPoints;
  return {
    scoreValue: grudgeBountyScoreValue(bountyCollected, grudge.tier),
    bountyCollected,
    tier: grudge.tier,
  };
}
