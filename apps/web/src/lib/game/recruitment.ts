// =============================================================================
// Passive Recruitment System — Season 4 Army
// =============================================================================
// No queue button. Recruiters produce army every tick. Auto-fills battalions.
// Pure functions only. No DB / Prisma imports.
// =============================================================================

import {
  Battalion,
  BattalionTier,
  BATTALION_COMMISSION_COST,
  DEFAULT_BATTALION_MAX_SIZE,
} from "./battalion-types";

// ── Production Formula ───────────────────────────────────────────────────────

/** Base army units produced per recruiter per tick. */
export const BASE_RECRUITMENT_RATE = 2; // 2 units per recruiter per tick

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

// ── Battalion Creation ───────────────────────────────────────────────────────

/**
 * Check if a new battalion should be auto-created.
 * Returns true when all existing battalions are ≥ fillThreshold AND there's
 * a free slot AND new units would otherwise be wasted.
 */
export function shouldAutoCreateBattalion(args: {
  battalions: Battalion[];
  totalSlots: number;
  wastedUnits: number;
  fillThreshold: number;
}): boolean {
  if (args.battalions.length >= args.totalSlots) return false;
  if (args.wastedUnits <= 0) return false;

  const allFull = args.battalions.every(
    (b) => b.size / b.maxSize >= args.fillThreshold,
  );
  return allFull;
}

/**
 * Create a new battalion. Returns the battalion and the gold cost.
 */
export function createBattalion(args: {
  id: string;
  name: string;
  gold: number;
}): { battalion: Battalion; goldCost: number } | { error: string } {
  if (args.gold < BATTALION_COMMISSION_COST) {
    return {
      error: `Commissioning a new battalion costs ${BATTALION_COMMISSION_COST} gold.`,
    };
  }

  const battalion: Battalion = {
    id: args.id,
    name: args.name,
    size: 0,
    maxSize: DEFAULT_BATTALION_MAX_SIZE,
    tier: BattalionTier.RECRUIT,
    xp: 0,
    readyAt: null,
    stance: "REST" as Battalion["stance"],
    garrisonedAt: null,
    stanceLockedUntil: null,
  };

  return { battalion, goldCost: BATTALION_COMMISSION_COST };
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
  /** Units produced this tick. */
  unitsProduced: number;
  /** Units wasted (all battalions full). */
  unitsWasted: number;
  /** Whether a new battalion was auto-created. */
  battalionCreated: boolean;
  /** Gold spent on auto-creation. */
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
 * @param gold — current gold (for auto-creation)
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
  /** Race-specific name for auto-created battalions. Falls back to generic if omitted. */
  newBattalionName?: string;
}): RecruitmentTickResult {
  let { battalions } = args;
  let goldSpent = 0;
  let battalionCreated = false;

  // 1. Produce units.
  const produced = calculateRecruitment(
    args.recruiters,
    args.barracksLevel,
    args.raceBonus,
  );

  // 2. Distribute to existing battalions.
  const distResult = distributeRecruits(
    battalions,
    produced,
    args.preferredBattalionId,
  );
  battalions = distResult.battalions;
  let wasted = distResult.wasted;

  // 3. If units are wasted and battalions are full, auto-create a new one.
  if (
    wasted > 0 &&
    battalions.length < args.totalSlots &&
    args.gold >= BATTALION_COMMISSION_COST
  ) {
    const existingCount = battalions.length;
    const name = args.newBattalionName ?? `Battalion ${existingCount + 1}`;
    const result = createBattalion({
      id: `bn_${Date.now()}_${existingCount}`,
      name,
      gold: args.gold,
    });

    if ("battalion" in result) {
      battalions = [...battalions, result.battalion];
      goldSpent = result.goldCost;
      battalionCreated = true;

      // Try to fill the new battalion with wasted units.
      const refill = distributeRecruits(battalions, wasted);
      battalions = refill.battalions;
      wasted = refill.wasted;
    }
  }

  return {
    battalions,
    unitsProduced: produced,
    unitsWasted: wasted,
    battalionCreated,
    goldSpent,
  };
}
