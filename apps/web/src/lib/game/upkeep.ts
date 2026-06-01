// =============================================================================
// Army Upkeep System — Season 4
// =============================================================================
// Every battalion has ongoing food + gold costs per tick. If you can't pay,
// units desert, equipment decays, and morale drops.
// Pure functions only. No DB / Prisma imports.
// =============================================================================

import {
  Battalion,
  BattalionTier,
  BATTALION_TIER_NAMES,
  MORALE_EVENTS,
} from "./battalion-types";

// ── Upkeep Costs ─────────────────────────────────────────────────────────────

/**
 * Per-tier upkeep costs.
 * - foodPerHundred: food consumed per 100 units of this tier per tick.
 * - goldPerBattalion: gold consumed per battalion of this tier per tick.
 */
export type UpkeepCosts = {
  foodPerHundred: number;
  goldPerBattalion: number;
};

export const UPKEEP_COSTS: Record<BattalionTier, UpkeepCosts> = {
  [BattalionTier.RECRUIT]: { foodPerHundred: 1, goldPerBattalion: 0 },
  [BattalionTier.REGULAR]: { foodPerHundred: 2, goldPerBattalion: 1 },
  [BattalionTier.VETERAN]: { foodPerHundred: 3, goldPerBattalion: 2 },
  [BattalionTier.ELITE]: { foodPerHundred: 5, goldPerBattalion: 4 },
};

// ── Calculate Total Upkeep ───────────────────────────────────────────────────

export type UpkeepBill = {
  totalFood: number;
  totalGold: number;
  /** Breakdown per battalion for audit/logging. */
  breakdown: {
    battalionId: string;
    battalionName: string;
    tier: BattalionTier;
    size: number;
    foodCost: number;
    goldCost: number;
  }[];
};

/**
 * Calculate the total food and gold upkeep for all battalions.
 */
const FOOD_PER_50_UNITS = 1;

export function calculateUpkeep(
  battalions: Battalion[],
  upkeepDiscountPercent = 0,
): UpkeepBill {
  const breakdown: UpkeepBill["breakdown"] = [];
  let totalFood = 0;
  let totalGold = 0;
  const discountMultiplier =
    1 - Math.max(0, Math.min(90, upkeepDiscountPercent)) / 100;

  for (const b of battalions) {
    if (b.size <= 0) continue;

    // Simple upkeep: 1 food per 50 units. No tier multipliers, no gold cost.
    const foodCost = Math.ceil(
      Math.ceil(b.size / 50) * FOOD_PER_50_UNITS * discountMultiplier,
    );
    totalFood += foodCost;

    breakdown.push({
      battalionId: b.id,
      battalionName: b.name,
      tier: b.tier,
      size: b.size,
      foodCost,
      goldCost: 0, // no gold upkeep
    });
  }

  return { totalFood, totalGold, breakdown };
}

// ── Shortfall Handling ───────────────────────────────────────────────────────

export type UpkeepShortfall = {
  /** Food deficit (unpaid food). */
  foodShortfall: number;
  /** Gold deficit (unpaid gold). */
  goldShortfall: number;
};

export type UpkeepTickResult = {
  /** Updated battalion list (after desertion/decay). */
  battalions: Battalion[];
  /** Total units lost to desertion this tick. */
  unitsDeserted: number;
  /** Whether equipment decay is active (gold unpaid). */
  equipmentDecay: boolean;
  /** Morale change from starvation. */
  moraleDelta: number;
  /** Food paid this tick. */
  foodPaid: number;
  /** Gold paid this tick. */
  goldPaid: number;
};

/**
 * Apply upkeep for one tick. Deducts food/gold and handles shortfalls.
 *
 * @param battalions — current battalion list
 * @param food — current food
 * @param gold — current gold
 * @returns updated battalions, resources spent, and shortfall effects
 */
export function processUpkeepTick(args: {
  battalions: Battalion[];
  food: number;
  gold: number;
  upkeepDiscountPercent?: number;
}): UpkeepTickResult {
  const bill = calculateUpkeep(
    args.battalions,
    args.upkeepDiscountPercent ?? 0,
  );

  // Deduct what we can.
  const foodPaid = Math.min(args.food, bill.totalFood);
  const goldPaid = Math.min(args.gold, bill.totalGold);

  const foodShortfall = bill.totalFood - foodPaid;
  const goldShortfall = bill.totalGold - goldPaid;

  let battalions = args.battalions.map((b) => ({ ...b }));
  let unitsDeserted = 0;
  let moraleDelta = 0;

  // ── Food Shortfall → Desertion ───────────────────────────────────────
  if (foodShortfall > 0) {
    // Desertion rate: 2% of army per missing food unit, doubled if food=0 (starvation).
    const isStarving = args.food <= 0;
    const baseDesertionRate = isStarving ? 0.04 : 0.02;

    // Desertion targets lowest-tier battalions first.
    const sortedByTier = [...battalions]
      .map((b, idx) => ({ b, idx }))
      .sort((a, b) => a.b.tier - b.b.tier);

    for (const { b, idx } of sortedByTier) {
      if (foodShortfall <= 0) break;
      if (b.size <= 0) continue;

      const deserting = Math.ceil(b.size * baseDesertionRate * foodShortfall);
      const actual = Math.min(deserting, b.size);

      battalions[idx].size -= actual;
      unitsDeserted += actual;
    }

    moraleDelta += isStarving
      ? MORALE_EVENTS.STARVATION_TICK * 2
      : MORALE_EVENTS.STARVATION_TICK;
  }

  // ── Gold Shortfall → Equipment Decay ─────────────────────────────────
  const equipmentDecay = goldShortfall > 0;
  // Equipment decay reduces effectiveness rather than killing units.
  // The caller applies this as a multiplier in combat (handled in battalion-combat.ts).
  // We just flag it here.

  return {
    battalions,
    unitsDeserted,
    equipmentDecay,
    moraleDelta,
    foodPaid,
    goldPaid,
  };
}

// ── Equipment Decay Effect ───────────────────────────────────────────────────

/** Effectiveness penalty when gold upkeep is unpaid. */
export const EQUIPMENT_DECAY_PENALTY = 0.02; // -2% per tick of unpaid gold

/**
 * Calculate the cumulative equipment decay penalty.
 * Each tick of unpaid gold adds PENALTY to the decay factor.
 * Max penalty is capped at -50%.
 */
export function calculateEquipmentDecayFactor(
  consecutiveUnpaidTicks: number,
): number {
  const raw = consecutiveUnpaidTicks * EQUIPMENT_DECAY_PENALTY;
  return Math.min(raw, 0.5);
}

// ── Cost Projection ──────────────────────────────────────────────────────────

/**
 * Project the upkeep cost if a new battalion of the given tier and size
 * were added. Useful for planning before commissioning.
 */
export function projectUpkeepForBattalion(
  tier: BattalionTier,
  size: number,
): { food: number; gold: number } {
  const costs = UPKEEP_COSTS[tier];
  return {
    food: Math.ceil((size / 100) * costs.foodPerHundred),
    gold: costs.goldPerBattalion,
  };
}

/**
 * Get a human-readable summary of current army upkeep.
 */
export function upkeepSummary(bill: UpkeepBill): string {
  const totalUnits = bill.breakdown.reduce((s, b) => s + b.size, 0);
  const parts: string[] = [
    `${totalUnits} units across ${bill.breakdown.length} battalions`,
    `${bill.totalFood} food/tick · ${bill.totalGold} gold/tick`,
  ];

  const byTier = new Map<BattalionTier, number>();
  for (const b of bill.breakdown) {
    byTier.set(b.tier, (byTier.get(b.tier) ?? 0) + b.size);
  }

  for (const [tier, count] of byTier) {
    parts.push(`${BATTALION_TIER_NAMES[tier]}: ${count} units`);
  }

  return parts.join(" · ");
}
