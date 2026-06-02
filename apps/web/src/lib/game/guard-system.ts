// =============================================================================
// Passive Guard System — Season 4 Army
// =============================================================================
// No "place 100 guards on tile X." Set a guard % — battalions auto-distribute
// to owned tiles based on priority, borders, and proximity.
// Pure functions only. No DB / Prisma imports.
// =============================================================================

import { Battalion, BattalionStance } from "./battalion-types";

// ── Guard Configuration ──────────────────────────────────────────────────────

export type GuardConfig = {
  /** Percentage of total army allocated to guard duty (0–100). */
  guardPercent: number;
  /** Default stance for guarding battalions. */
  defaultStance: BattalionStance;
};

export const DEFAULT_GUARD_CONFIG: GuardConfig = {
  guardPercent: 30,
  defaultStance: BattalionStance.FORTIFY,
};

// ── Tile Priority ────────────────────────────────────────────────────────────

export const TilePriority = {
  HIGH: 3,
  NORMAL: 2,
  LOW: 1,
  NONE: 0,
} as const;

export type TilePriority = (typeof TilePriority)[keyof typeof TilePriority];

/** A tile that this fortress owns and can guard. */
export type GuardableTile = {
  tileId: string;
  /** How much the fortress wants to defend this tile. Set by player. */
  priority: TilePriority;
  /** Whether this tile borders an unowned or enemy tile. */
  isBorder: boolean;
  /** Number of enemy fortresses within 2 hexes. */
  enemyProximity: number;
  /** Resource production value (gold + food per tick). Higher = more valuable. */
  productionValue: number;
  /** Existing guard strength already on this tile (from previously assigned battalions). */
  currentGuardStrength: number;
};

// ── Weight Calculation ───────────────────────────────────────────────────────

/** Weight multiplier per priority level. */
const PRIORITY_WEIGHTS: Record<number, number> = {
  [TilePriority.HIGH]: 3.0,
  [TilePriority.NORMAL]: 1.0,
  [TilePriority.LOW]: 0.3,
  [TilePriority.NONE]: 0.0,
};

/** Bonus weight for border tiles. */
const BORDER_WEIGHT_BONUS = 0.5; // +50%

/** Bonus weight per enemy within 2 hexes. */
const ENEMY_PROXIMITY_BONUS = 0.25; // +25% per enemy

/**
 * Calculate the guard weight for a tile.
 * Higher weight = more guard allocation.
 */
export function calculateTileGuardWeight(tile: GuardableTile): number {
  if (tile.priority === TilePriority.NONE) return 0;

  let weight = PRIORITY_WEIGHTS[tile.priority] ?? 1.0;

  if (tile.isBorder) {
    weight *= 1 + BORDER_WEIGHT_BONUS;
  }

  weight *= 1 + tile.enemyProximity * ENEMY_PROXIMITY_BONUS;

  // Slight boost for high-production tiles (max +20%).
  const productionBonus = Math.min(tile.productionValue / 500, 0.2);
  weight *= 1 + productionBonus;

  return weight;
}

// ── Guard Distribution ───────────────────────────────────────────────────────

export type GuardDistribution = {
  tileId: string;
  assignedStrength: number;
  weight: number;
};

/**
 * Distribute the guard pool across owned tiles.
 *
 * Algorithm:
 * 1. Calculate weight for each tile.
 * 2. Normalize weights → allocation percentages.
 * 3. Allocate guard pool proportionally.
 * 4. Floor to integers (remainder goes to highest-weight tile).
 *
 * @param tiles — all guardable tiles owned by this fortress.
 * @param guardPool — total army strength allocated to guarding.
 * @returns per-tile distribution and any unassigned remainder.
 */
export function distributeGuardPool(
  tiles: GuardableTile[],
  guardPool: number,
): { distribution: GuardDistribution[]; unassigned: number } {
  if (tiles.length === 0 || guardPool <= 0) {
    return {
      distribution: [],
      unassigned: guardPool,
    };
  }

  // Calculate weights.
  const weighted = tiles.map((tile) => ({
    tileId: tile.tileId,
    weight: calculateTileGuardWeight(tile),
  }));

  const totalWeight = weighted.reduce((s, w) => s + w.weight, 0);

  if (totalWeight <= 0) {
    // All weights are zero → even distribution.
    const perTile = Math.floor(guardPool / tiles.length);
    const remainder = guardPool - perTile * tiles.length;
    return {
      distribution: tiles.map((t, i) => ({
        tileId: t.tileId,
        assignedStrength: perTile + (i < remainder ? 1 : 0),
        weight: 0,
      })),
      unassigned: 0,
    };
  }

  // Proportional distribution.
  let assignedTotal = 0;
  const distribution: GuardDistribution[] = weighted.map((w) => {
    const raw = (w.weight / totalWeight) * guardPool;
    const strength = Math.floor(raw);
    assignedTotal += strength;
    return { tileId: w.tileId, assignedStrength: strength, weight: w.weight };
  });

  // Distribute remainder to highest-weight tiles.
  let remainder = guardPool - assignedTotal;
  const sorted = [...distribution].sort((a, b) => b.weight - a.weight);
  for (let i = 0; i < remainder; i++) {
    sorted[i % sorted.length].assignedStrength++;
  }

  return { distribution, unassigned: 0 };
}

// ── Battalion-to-Tile Assignment ─────────────────────────────────────────────

export type BattalionAssignment = {
  battalionId: string;
  tileId: string;
  /** How many units from this battalion are assigned to this tile. */
  unitsAssigned: number;
  stance: BattalionStance;
};

/**
 * Assign battalions to tiles based on the guard distribution.
 *
 * Battalions are indivisible. The distribution chooses where whole
 * battalions should patrol; it must never peel units off one battalion into
 * several tile assignments.
 *
 * Returns the updated battalion list and the assignments made.
 */
export function assignBattalionsToTiles(args: {
  battalions: Battalion[];
  distribution: GuardDistribution[];
  guardPoolSize: number;
  defaultStance: BattalionStance;
}): { battalions: Battalion[]; assignments: BattalionAssignment[] } {
  const assignments: BattalionAssignment[] = [];
  const updated = args.battalions.map((b) => ({ ...b }));

  // Find available battalions (not on orders, not already deployed).
  const available = updated.filter(
    (b) =>
      b.garrisonedAt === null &&
      b.stance !== "MOBILE" &&
      b.size > 0,
  );

  if (
    available.length === 0 ||
    args.distribution.length === 0 ||
    args.guardPoolSize <= 0
  ) {
    return { battalions: updated, assignments };
  }

  const targetTiles = [...args.distribution]
    .filter((dist) => dist.assignedStrength > 0 || dist.weight > 0)
    .sort((a, b) => b.assignedStrength - a.assignedStrength || b.weight - a.weight);

  if (targetTiles.length === 0) {
    return { battalions: updated, assignments };
  }

  let assignedStrength = 0;
  let targetIndex = 0;

  for (const bat of available) {
    if (assignedStrength >= args.guardPoolSize && assignments.length > 0) {
      break;
    }

    const target = targetTiles[targetIndex % targetTiles.length];
    targetIndex++;

    assignments.push({
      battalionId: bat.id,
      tileId: target.tileId,
      unitsAssigned: bat.size,
      stance: args.defaultStance,
    });

    assignedStrength += bat.size;

    // Update battalion garrison status. Stance is now hidden behind mode,
    // so guards always use the guard stance.
    const original = updated.find((b) => b.id === bat.id);
    if (original) {
      original.garrisonedAt = target.tileId;
      original.stance = args.defaultStance;
    }
  }

  return { battalions: updated, assignments };
}

// ── Guard Tick Processing ────────────────────────────────────────────────────

export type GuardTickResult = {
  /** The total guard pool size (units allocated to guarding). */
  guardPoolSize: number;
  /** Per-tile distribution of the guard pool. */
  distribution: GuardDistribution[];
  /** Specific battalion-to-tile assignments. */
  assignments: BattalionAssignment[];
  /** Updated battalion list. */
  battalions: Battalion[];
};

/**
 * Process one tick of guard distribution.
 *
 * @param battalions — current battalion list
 * @param ownedTiles — tiles owned by this fortress
 * @param config — guard % and default stance
 */
export function processGuardTick(args: {
  battalions: Battalion[];
  ownedTiles: GuardableTile[];
  config: GuardConfig;
}): GuardTickResult {
  const totalArmy = args.battalions.reduce((s, b) => s + b.size, 0);
  const guardPoolSize = Math.floor(
    totalArmy * (args.config.guardPercent / 100),
  );

  const { distribution } = distributeGuardPool(
    args.ownedTiles,
    guardPoolSize,
  );

  const { battalions, assignments } = assignBattalionsToTiles({
    battalions: args.battalions,
    distribution,
    guardPoolSize,
    defaultStance: args.config.defaultStance,
  });

  return {
    guardPoolSize,
    distribution,
    assignments,
    battalions,
  };
}

// ── Recall Guard ─────────────────────────────────────────────────────────────

/**
 * Recall all guarding battalions back to the fortress.
 * Removes garrison assignments and sets stance to REST.
 */
export function recallAllGuards(battalions: Battalion[]): Battalion[] {
  return battalions.map((b) => ({
    ...b,
    garrisonedAt: null,
    stance: BattalionStance.REST,
    stanceLockedUntil: null,
  }));
}

/**
 * Recall guards from a specific tile.
 */
export function recallTileGuards(
  battalions: Battalion[],
  tileId: string,
): Battalion[] {
  return battalions.map((b) =>
    b.garrisonedAt === tileId
      ? { ...b, garrisonedAt: null, stance: BattalionStance.REST, stanceLockedUntil: null }
      : b,
  );
}
