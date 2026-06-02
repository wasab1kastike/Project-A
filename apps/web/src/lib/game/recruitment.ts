// =============================================================================
// Passive Recruitment System — Season 4 Army
// =============================================================================
// No queue button. Recruiters produce army every tick. Existing battalions fill
// automatically, but new battalions are commissioned manually.
// Pure functions only. No DB / Prisma imports.
// =============================================================================

import {
  Battalion,
  BATTALION_COMMISSION_COST,
} from "./battalion-types";

// ── Production Formula ───────────────────────────────────────────────────────

/** Base army units produced per recruiter per tick. */
export const BASE_RECRUITMENT_RATE = 3; // 3 units per recruiter per tick
/** Deprecated compatibility constant. Passive battalion refill does not spend gold. */
export const RECRUITMENT_COST_PER_UNIT = 0;

/** Bonus recruitment rate from barracks upgrades (0–1 range). */
export const BARRACKS_BONUS_PER_LEVEL = 0.15; // +15% per barracks level

/**
 * Calculate army produced this tick.
 *
 *   units = recruiters × baseRate × (1 + barracksLevel × barracksBonus) × raceBonus
 */
export function calculateRecruitment(
  recruiters: number,
  barracksLevel: number,
  raceBonus: number,
): number {
  const base = recruiters * BASE_RECRUITMENT_RATE;
  const barracksMultiplier = 1 + barracksLevel * BARRACKS_BONUS_PER_LEVEL;
  return Math.floor(base * barracksMultiplier * raceBonus);
}

export function getRecruitmentCost(units: number): number {
  return Math.max(0, Math.floor(units)) * RECRUITMENT_COST_PER_UNIT;
}

// ── Battalion Auto-Fill ──────────────────────────────────────────────────────

/**
 * Distribute newly recruited units across battalions.
 *
 * Rules:
 * 1. Units fill the lowest-fill battalion first (by fill %).
 * 2. If all battalions are full, units go to waste (return leftovers).
 * 3. If a preferred battalion is set, it gets priority (but still respects capacity).
 *
 * Returns: updated battalions array and any leftover (wasted) units.
 */
export function distributeRecruits(
  battalions: Battalion[],
  newUnits: number,
  preferredBattalionId?: string,
): { battalions: Battalion[]; wasted: number } {
  if (battalions.length === 0 || newUnits <= 0) {
    return { battalions, wasted: newUnits };
  }

  let remaining = newUnits;
  const updated = battalions.map((b) => ({ ...b }));

  // Sort: preferred first, then by fill % (ascending — emptiest first).
  const sorted = [...updated].sort((a, b) => {
    if (a.id === preferredBattalionId) return -1;
    if (b.id === preferredBattalionId) return 1;
    const fillA = a.size / a.maxSize;
    const fillB = b.size / b.maxSize;
    return fillA - fillB;
  });

  for (const battalion of sorted) {
    if (remaining <= 0) break;
    const space = battalion.maxSize - battalion.size;
    if (space <= 0) continue;
    const toAdd = Math.min(space, remaining);
    battalion.size += toAdd;
    remaining -= toAdd;
  }

  return { battalions: updated, wasted: remaining };
}

// ── Battalion Expansion ──────────────────────────────────────────────────────

/**
 * Expand a battalion's maxSize by 50.
 * Costs gold. Max size is capped.
 */
export function expandBattalion(args: {
  battalion: Battalion;
  gold: number;
  expandCost: number;
  maxBattalionSize: number;
}): { battalion: Battalion; goldCost: number } | { error: string } {
  if (args.gold < args.expandCost) {
    return {
      error: `Expanding battalion costs ${args.expandCost} gold.`,
    };
  }
  if (args.battalion.maxSize >= args.maxBattalionSize) {
    return { error: "Battalion is already at maximum size." };
  }

  const newMaxSize = Math.min(
    args.battalion.maxSize + 50,
    args.maxBattalionSize,
  );

  return {
    battalion: { ...args.battalion, maxSize: newMaxSize },
    goldCost: args.expandCost,
  };
}

// ── Disband ───────────────────────────────────────────────────────────────────

/**
 * Disband a battalion. Recovers 50% of commission cost.
 * Units in the battalion are lost.
 */
export function disbandBattalion(args: {
  battalion: Battalion;
}): { goldRefund: number } {
  const refund = Math.floor(BATTALION_COMMISSION_COST * 0.5);
  return { goldRefund: refund };
}

// ── Tick Processing ──────────────────────────────────────────────────────────

/** Result of processing recruitment for one tick. */
export type RecruitmentTickResult = {
  /** Updated battalion list. */
  battalions: Battalion[];
  /** Units accepted for battalion refill this tick. */
  unitsProduced: number;
  /** Units wasted (all battalions full). */
  unitsWasted: number;
  /** Always false. New battalions are commissioned manually. */
  battalionCreated: boolean;
  /** Always 0. New battalions are commissioned manually. */
  goldSpent: number;
};

/**
 * Process one tick of passive recruitment.
 *
 * @param battalions — current battalion list
 * @param recruiters — number of assigned recruiters
 * @param barracksLevel — barracks upgrade level (0-based)
 * @param raceBonus — race-specific recruitment multiplier (1.0 baseline)
 * @param totalSlots — total available battalion slots
 * @param gold — current gold, retained for API compatibility
 * @param preferredBattalionId — optional preferred battalion for new recruits
 * @returns the tick result with updated battalions
 */
export function processRecruitmentTick(args: {
  battalions: Battalion[];
  recruiters: number;
  barracksLevel: number;
  raceBonus: number;
  totalSlots: number;
  gold: number;
  preferredBattalionId?: string;
  /** Deprecated: battalions are manually commissioned. */
  newBattalionName?: string;
  /** Deprecated: battalions are manually commissioned. */
  defaultBattalionMaxSize?: number;
  maxArmySize?: number;
  /** Flat bonus units from skills or one-time legacy queue cleanup. */
  bonusUnits?: number;
}): RecruitmentTickResult {
  let { battalions } = args;

  // 1. Produce units.
  const uncappedProduced = calculateRecruitment(
    args.recruiters,
    args.barracksLevel,
    args.raceBonus,
  ) + Math.max(0, Math.floor(args.bonusUnits ?? 0));
  const currentTotal = battalions.reduce(
    (sum, battalion) => sum + battalion.size,
    0,
  );
  const capRoom =
    args.maxArmySize === undefined
      ? Number.POSITIVE_INFINITY
      : Math.max(0, args.maxArmySize - currentTotal);
  const produced = Math.min(uncappedProduced, capRoom);

  // 2. Distribute to existing battalions.
  const distResult = distributeRecruits(
    battalions,
    produced,
    args.preferredBattalionId,
  );
  battalions = distResult.battalions;

  return {
    battalions,
    unitsProduced: produced,
    unitsWasted: distResult.wasted,
    battalionCreated: false,
    goldSpent: 0,
  };
}
