// =============================================================================
// Army Veterancy XP System — Season 4
// =============================================================================
// Battalions gain XP from surviving battles. XP thresholds unlock tier
// promotions. Field promotions cost gold to jump a tier early.
// Pure functions only. No DB / Prisma imports.
// =============================================================================

import {
  Battalion,
  BattalionTier,
  BATTALION_TIER_NAMES,
  MORALE_EVENTS,
  TIER_MULTIPLIERS,
} from "./battalion-types";

// ── XP Gain from Combat ──────────────────────────────────────────────────────

/**
 * XP awarded per surviving unit after combat.
 * Higher-tier enemies give more XP.
 */
export const XP_PER_SURVIVING_UNIT: Record<BattalionTier, number> = {
  [BattalionTier.RECRUIT]: 0, // fighting recruits gives no XP (baseline)
  [BattalionTier.REGULAR]: 1,
  [BattalionTier.VETERAN]: 2,
  [BattalionTier.ELITE]: 3,
};

/** Bonus XP for winning a battle (multiplier on base XP). */
export const WIN_XP_MULTIPLIER = 1.5;

/** Bonus XP for fighting in a battlefield (vs. skirmish). */
export const BATTLEFIELD_XP_MULTIPLIER = 2.0;

/**
 * Calculate XP earned by a battalion from combat.
 *
 * @param survivors — how many units from this battalion survived
 * @param enemyTier — the tier of the enemy battalion fought
 * @param won — whether this side won the battle
 * @param isBattlefield — whether this was a battlefield (multi-participant) or skirmish
 */
export function calculateCombatXp(args: {
  survivors: number;
  enemyTier: BattalionTier;
  won: boolean;
  isBattlefield: boolean;
}): number {
  const baseXpPerUnit = XP_PER_SURVIVING_UNIT[args.enemyTier] ?? 0;
  if (baseXpPerUnit <= 0) return 0;

  let xp = args.survivors * baseXpPerUnit;

  if (args.won) {
    xp = Math.floor(xp * WIN_XP_MULTIPLIER);
  }

  if (args.isBattlefield) {
    xp = Math.floor(xp * BATTLEFIELD_XP_MULTIPLIER);
  }

  return xp;
}

// ── Tier Advancement ─────────────────────────────────────────────────────────

/**
 * Check if a battalion has enough XP to advance to the next tier.
 * Returns the new tier if advanced, or null if not ready.
 */
export function checkTierAdvancement(
  battalion: Battalion,
): BattalionTier | null {
  if (battalion.tier >= BattalionTier.ELITE) return null;

  const nextTier = (battalion.tier + 1) as BattalionTier;
  const requiredXp = TIER_MULTIPLIERS[nextTier].xpToReach;

  if (battalion.xp >= requiredXp) {
    return nextTier;
  }

  return null;
}

/**
 * Apply a tier promotion to a battalion.
 * Resets XP to 0 (excess XP carries over).
 */
export function promoteBattalion(
  battalion: Battalion,
  newTier: BattalionTier,
): Battalion {
  const requiredXp = TIER_MULTIPLIERS[newTier].xpToReach;
  const excessXp = Math.max(0, battalion.xp - requiredXp);

  return {
    ...battalion,
    tier: newTier,
    xp: excessXp,
  };
}

// ── Field Promotion ──────────────────────────────────────────────────────────

/**
 * Gold cost to field-promote a battalion to the next tier.
 * Cost scales with current tier and battalion size.
 */
export const FIELD_PROMOTION_BASE_COST: Record<BattalionTier, number> = {
  [BattalionTier.RECRUIT]: 500, // Recruit → Regular
  [BattalionTier.REGULAR]: 1_500, // Regular → Veteran
  [BattalionTier.VETERAN]: 5_000, // Veteran → Elite
  [BattalionTier.ELITE]: 0, // Cannot promote beyond Elite
};

/** Cost per unit in the battalion (added to base cost). */
export const FIELD_PROMOTION_COST_PER_UNIT = 2;

/**
 * Calculate the gold cost for a field promotion.
 */
export function calculateFieldPromotionCost(
  battalion: Battalion,
): number | null {
  if (battalion.tier >= BattalionTier.ELITE) return null;

  const base = FIELD_PROMOTION_BASE_COST[battalion.tier];
  const perUnit = battalion.size * FIELD_PROMOTION_COST_PER_UNIT;

  return base + perUnit;
}

/**
 * Apply a field promotion. Costs gold, instantly promotes the battalion.
 * Does NOT validate cost — caller checks.
 */
export function applyFieldPromotion(
  battalion: Battalion,
): { battalion: Battalion; newTier: BattalionTier; goldCost: number } | null {
  if (battalion.tier >= BattalionTier.ELITE) return null;

  const cost = calculateFieldPromotionCost(battalion);
  if (cost === null) return null;

  const newTier = (battalion.tier + 1) as BattalionTier;

  return {
    battalion: {
      ...battalion,
      tier: newTier,
      xp: 0, // XP reset on paid promotion
    },
    newTier,
    goldCost: cost,
  };
}

// ── Passive Training XP ──────────────────────────────────────────────────────

/**
 * XP gained per tick when in TRAINING stance.
 * Only the lowest-tier battalion gains XP from training.
 */
export const TRAINING_XP_PER_TICK = 1;

/**
 * Apply training XP to eligible battalions.
 * Only battalions in TRAINING stance with the lowest tier get XP.
 */
export function applyTrainingXp(battalions: Battalion[]): Battalion[] {
  if (battalions.length === 0) return battalions;

  // Find the lowest tier among training battalions.
  const trainingBattalions = battalions.filter(
    (b) => b.stance === "TRAINING" && b.tier < BattalionTier.ELITE,
  );

  if (trainingBattalions.length === 0) return battalions;

  const lowestTier = Math.min(
    ...trainingBattalions.map((b) => b.tier),
  );

  return battalions.map((b) => {
    if (b.stance === "TRAINING" && b.tier === lowestTier) {
      return { ...b, xp: b.xp + TRAINING_XP_PER_TICK };
    }
    return b;
  });
}

// ── XP Tick Processing ───────────────────────────────────────────────────────

export type XpTickResult = {
  /** Updated battalion list (after training XP and auto-promotions). */
  battalions: Battalion[];
  /** Battalions that were promoted this tick. */
  promotions: {
    battalionId: string;
    battalionName: string;
    oldTier: BattalionTier;
    newTier: BattalionTier;
  }[];
};

/**
 * Process one tick of XP: apply training XP, check for auto-promotions.
 */
export function processXpTick(battalions: Battalion[]): XpTickResult {
  let updated = applyTrainingXp(battalions);
  const promotions: XpTickResult["promotions"] = [];

  // Check each battalion for tier advancement.
  updated = updated.map((b) => {
    const nextTier = checkTierAdvancement(b);
    if (nextTier !== null) {
      promotions.push({
        battalionId: b.id,
        battalionName: b.name,
        oldTier: b.tier,
        newTier: nextTier,
      });
      return promoteBattalion(b, nextTier);
    }
    return b;
  });

  return { battalions: updated, promotions };
}

// ── XP Summary ───────────────────────────────────────────────────────────────

/**
 * Get a human-readable XP progress string for a battalion.
 */
export function xpProgressString(battalion: Battalion): string {
  if (battalion.tier >= BattalionTier.ELITE) return "MAX TIER";

  const nextTier = (battalion.tier + 1) as BattalionTier;
  const required = TIER_MULTIPLIERS[nextTier].xpToReach;
  const pct = Math.min(100, Math.floor((battalion.xp / required) * 100));

  return `${BATTALION_TIER_NAMES[battalion.tier]} → ${BATTALION_TIER_NAMES[nextTier]}: ${battalion.xp}/${required} XP (${pct}%)`;
}
