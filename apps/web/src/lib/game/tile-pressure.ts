import type { FortressRace } from "./races";
export {
  getPressureWorkerDescription,
  getPressureWorkerLabel,
} from "./pressure-workers";

export const TILE_PRESSURE_CLAIM_THRESHOLD = 600;
export const LEGACY_TILE_PRESSURE_CLAIM_THRESHOLD = 100;
export const TILE_PRESSURE_DECAY_PERCENT_PER_HOUR = 10;
export const DEFAULT_TILE_PRESSURE_PRIORITY_LIMIT = 3;

export function getTilePressurePriorityLimit(_fortress?: unknown) {
  return DEFAULT_TILE_PRESSURE_PRIORITY_LIMIT;
}

export function getTilePressurePriorityWeightForSlot({
  slot,
  limit = DEFAULT_TILE_PRESSURE_PRIORITY_LIMIT,
}: {
  slot: number;
  limit?: number;
}) {
  return Math.max(1, limit - Math.max(1, Math.floor(slot)) + 1);
}

export function getTilePressurePrioritySlot({
  weight,
  limit = DEFAULT_TILE_PRESSURE_PRIORITY_LIMIT,
}: {
  weight: number;
  limit?: number;
}) {
  const normalizedWeight = Math.max(1, Math.floor(weight));
  return Math.max(1, limit - normalizedWeight + 1);
}

export function sortTilePressureQueue<T extends { tileId: string; weight?: number }>(
  priorities: T[]
) {
  return [...priorities].sort((left, right) => {
    const weightDelta = (right.weight ?? 1) - (left.weight ?? 1);

    if (weightDelta !== 0) {
      return weightDelta;
    }

    return left.tileId.localeCompare(right.tileId);
  });
}

export function getTilePressureClaimThreshold(isSeasonFour: boolean) {
  return isSeasonFour
    ? TILE_PRESSURE_CLAIM_THRESHOLD
    : LEGACY_TILE_PRESSURE_CLAIM_THRESHOLD;
}

export function calculatePressureOutput({
  pressureWorkersAssigned,
}: {
  pressureWorkersAssigned: number;
  race?: FortressRace | null;
}) {
  if (!Number.isFinite(pressureWorkersAssigned)) {
    return 0;
  }

  return Math.max(0, Math.floor(pressureWorkersAssigned));
}

export function applyUnsupportedPressureDecay({
  pressure,
  elapsedHours,
}: {
  pressure: number;
  elapsedHours: number;
}) {
  const wholeHours = Math.max(0, Math.floor(elapsedHours));
  if (wholeHours <= 0) return Math.max(0, Math.floor(pressure));

  // Closed-form: pressure × 0.9^hours. Slightly more generous than the old
  // per-hour floor loop (≈1 unit difference at high hours), but O(1) instead
  // of O(hours) — safe for large catch-up intervals.
  const decayFactor = Math.pow(
    1 - TILE_PRESSURE_DECAY_PERCENT_PER_HOUR / 100,
    wholeHours,
  );
  return Math.max(0, Math.floor(Math.max(0, Math.floor(pressure)) * decayFactor));
}

export function getPressureTargetBlockedReason({
  tile,
  tileId,
  ownerFortressId = null,
  diplomacyBlockedReason = null,
  fortress,
  ownedTileIds,
  isHomeOfA,
  isConnected,
  allowEnemyOwned = false,
}: {
  tile: { claimable: boolean } | null | undefined;
  tileId: string;
  ownerFortressId?: string | null;
  diplomacyBlockedReason?: string | null;
  fortress: { id: string } | null | undefined;
  ownedTileIds: Iterable<string>;
  isHomeOfA: (tileId: string) => boolean;
  isConnected: (input: { tileId: string; ownedTileIds: Iterable<string> }) => boolean;
  allowEnemyOwned?: boolean;
}) {
  if (!fortress) {
    return "Join the cycle to prioritize expansion.";
  }

  if (!tile || !tile.claimable) {
    return "That map tile cannot receive pressure.";
  }

  if (isHomeOfA(tileId)) {
    return "Home of A is a daily boss and cannot receive expansion pressure.";
  }

  if (ownerFortressId === fortress.id) {
    return "You already own that tile.";
  }

  if (ownerFortressId) {
    if (diplomacyBlockedReason) {
      return diplomacyBlockedReason;
    }

    if (!allowEnemyOwned) {
      return "Enemy-owned tiles require an active war before they can be queued.";
    }
  }

  if (
    !isConnected({
      tileId,
      ownedTileIds,
    })
  ) {
    return "That tile is not connected to your castle or owned territory.";
  }

  return null;
}

export function canPressureTarget(input: Parameters<typeof getPressureTargetBlockedReason>[0]) {
  return getPressureTargetBlockedReason(input) === null;
}

export function allocatePressureAcrossTargets({
  pressure,
  targets,
}: {
  pressure: number;
  targets: Array<{ tileId: string; weight?: number }>;
}) {
  const output = Math.max(0, Math.floor(pressure));
  const weightedTargets = targets
    .map((target) => ({
      tileId: target.tileId,
      weight: Math.max(1, Math.floor(target.weight ?? 1)),
    }))
    .sort((a, b) => a.tileId.localeCompare(b.tileId));

  if (output <= 0 || weightedTargets.length === 0) {
    return [];
  }

  const totalWeight = weightedTargets.reduce(
    (total, target) => total + target.weight,
    0
  );
  const allocations = weightedTargets.map((target) => ({
    tileId: target.tileId,
    pressure: Math.floor((output * target.weight) / totalWeight),
  }));
  let allocated = allocations.reduce(
    (total, allocation) => total + allocation.pressure,
    0
  );

  for (const allocation of allocations) {
    if (allocated >= output) {
      break;
    }

    allocation.pressure += 1;
    allocated += 1;
  }

  return allocations.filter((allocation) => allocation.pressure > 0);
}

export function getNeutralPressureClaimWinner({
  states,
  threshold = TILE_PRESSURE_CLAIM_THRESHOLD,
}: {
  states: Array<{ fortressId: string; pressure: number }>;
  threshold?: number;
}) {
  const eligibleStates = states
    .filter((state) => state.pressure >= threshold)
    .sort((a, b) => b.pressure - a.pressure);

  if (eligibleStates.length === 0) {
    return null;
  }

  const leader = eligibleStates[0];
  const tied = eligibleStates.some(
    (state) =>
      state.fortressId !== leader.fortressId && state.pressure === leader.pressure
  );

  return tied ? null : leader.fortressId;
}

// ═════════════════════════════════════════════════════════════════════════════
// Ownership Pressure — Season 4 Dynamic Territory
// ═════════════════════════════════════════════════════════════════════════════

/** Base decay: ownership pressure lost per tick (2 per minute). */
export const OWNERSHIP_PRESSURE_DECAY_PER_TICK = 2;

/** Maintenance: pressure regained per pressure worker assigned to this tile. */
export const OWNERSHIP_PRESSURE_MAINTENANCE_PER_WORKER = 4;

/** Enemy pressure: each enemy pressure point reduces ownership by this much. */
export const ENEMY_PRESSURE_DECAY_MULTIPLIER = 0.5;

/** Pressure disruption: enemy pressure on a tile also reduces ownership. */
export const PRESSURE_DISRUPT_MULTIPLIER = 1.0;

/** Guard presence: reduces decay by this fraction (0.5 = 50% reduction). */
export const GUARD_DECAY_REDUCTION = 0.5;

/** Warning threshold: player gets notified when pressure drops below this. */
export const OWNERSHIP_PRESSURE_WARNING = 200;

/** Maximum ownership pressure (cap). */
export const MAX_OWNERSHIP_PRESSURE = 600;

export type OwnershipPressureInput = {
  tileId: string;
  ownerFortressId: string;
  currentPressure: number;
  maintenanceWorkers: number;
  enemyPressureOnTile: number;
  hasGuard: boolean;
};

export type OwnershipPressureResult = {
  tileId: string;
  newPressure: number;
  becameNeutral: boolean;
};

/**
 * Process ownership pressure for a single tile.
 * Returns the new pressure and whether the tile was lost.
 */
export function processOwnershipPressure(
  input: OwnershipPressureInput,
): OwnershipPressureResult {
  let pressure = input.currentPressure;

  // Base decay.
  let decay = OWNERSHIP_PRESSURE_DECAY_PER_TICK;

  // Guard presence halves decay.
  if (input.hasGuard) {
    decay = Math.floor(decay * (1 - GUARD_DECAY_REDUCTION));
  }

  // Enemy pressure accelerates decay.
  const enemyDecay = Math.floor(
    input.enemyPressureOnTile * ENEMY_PRESSURE_DECAY_MULTIPLIER,
  );
  decay += enemyDecay;

  // Maintenance workers add pressure.
  const maintenance = input.maintenanceWorkers * OWNERSHIP_PRESSURE_MAINTENANCE_PER_WORKER;

  pressure = pressure - decay + maintenance;

  // Cap at max.
  pressure = Math.min(pressure, MAX_OWNERSHIP_PRESSURE);

  const becameNeutral = pressure <= 0;

  return {
    tileId: input.tileId,
    newPressure: Math.max(0, pressure),
    becameNeutral,
  };
}

/**
 * Batch process ownership pressure for all owned tiles.
 * Returns updates for tiles that changed and a list of tiles that became neutral.
 */
export function processAllOwnershipPressure(inputs: OwnershipPressureInput[]): {
  updates: Array<{ tileId: string; newPressure: number }>;
  lostTiles: string[];
} {
  const updates: Array<{ tileId: string; newPressure: number }> = [];
  const lostTiles: string[] = [];

  for (const input of inputs) {
    const result = processOwnershipPressure(input);
    if (result.becameNeutral) {
      lostTiles.push(input.tileId);
    } else if (result.newPressure !== input.currentPressure) {
      updates.push({ tileId: input.tileId, newPressure: result.newPressure });
    }
  }

  return { updates, lostTiles };
}
