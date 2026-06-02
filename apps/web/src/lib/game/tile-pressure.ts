import { getSkillModifiers } from "./race-skill-effects";
import { HEX_TILES, type HexTile } from "./map-hex";
import { getRaceModifiers, isFortressRace, type FortressRace } from "./races";
export {
  getPressureWorkerDescription,
  getPressureWorkerLabel,
} from "./pressure-workers";

export const TILE_PRESSURE_CLAIM_THRESHOLD = 600;
export const LEGACY_TILE_PRESSURE_CLAIM_THRESHOLD = 100;
export const TILE_PRESSURE_DECAY_PERCENT_PER_HOUR = 10;
export const TILE_PRESSURE_DISTANCE_THRESHOLD_STEP_PERCENT = 10;
export const TILE_PRESSURE_DISTANCE_DECAY_STEP_PERCENT = 2;
export const TILE_PRESSURE_MAX_DISTANCE_THRESHOLD_MULTIPLIER = 2;
export const TILE_PRESSURE_MAX_DECAY_PERCENT_PER_HOUR = 30;
export const DEFAULT_TILE_PRESSURE_PRIORITY_LIMIT = 3;
export const FREE_EXPANSION_TILE_CAPACITY = 8;
export const BASE_EXPANSION_TILES_PER_PRESSURE_WORKER = 2;

export function getTilePressurePriorityLimit(fortress?: {
  race?: FortressRace | string | null;
  skillPurchases?: Array<{ nodeKey: string }> | null;
}) {
  if (!fortress?.race || !isFortressRace(fortress.race)) {
    return DEFAULT_TILE_PRESSURE_PRIORITY_LIMIT;
  }

  const modifiers = getSkillModifiers({
    race: fortress.race,
    purchases: fortress.skillPurchases ?? [],
  });

  return Math.max(
    DEFAULT_TILE_PRESSURE_PRIORITY_LIMIT,
    DEFAULT_TILE_PRESSURE_PRIORITY_LIMIT + modifiers.pressurePriorityLimitBonus
  );
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

export function findCastleAnchorTile({
  fortress,
  tiles = HEX_TILES,
}: {
  fortress: { mapX: number; mapY: number };
  tiles?: readonly HexTile[];
}) {
  return tiles.reduce<HexTile | null>((nearest, candidate) => {
    if (!nearest) return candidate;

    const candidateDistance = Math.hypot(
      candidate.xPercent - fortress.mapX,
      candidate.yPercent - fortress.mapY
    );
    const nearestDistance = Math.hypot(
      nearest.xPercent - fortress.mapX,
      nearest.yPercent - fortress.mapY
    );

    if (candidateDistance !== nearestDistance) {
      return candidateDistance < nearestDistance ? candidate : nearest;
    }

    return candidate.id.localeCompare(nearest.id) < 0 ? candidate : nearest;
  }, null);
}

export function getHexRingDistance({
  fromTileId,
  toTileId,
  tiles = HEX_TILES,
}: {
  fromTileId: string;
  toTileId: string;
  tiles?: readonly HexTile[];
}) {
  if (fromTileId === toTileId) return 0;

  const tileByCoordinate = new Map(
    tiles.map((tile) => [`${tile.col}:${tile.row}`, tile] as const)
  );
  const tileById = new Map(tiles.map((tile) => [tile.id, tile] as const));
  const start = tileById.get(fromTileId);

  if (!start || !tileById.has(toTileId)) {
    return null;
  }

  const visited = new Set([fromTileId]);
  const queue: Array<{ tile: HexTile; distance: number }> = [
    { tile: start, distance: 0 },
  ];

  for (let index = 0; index < queue.length; index += 1) {
    const current = queue[index]!;
    const neighborOffsets =
      current.tile.row % 2 === 0
        ? [
            [-1, -1],
            [0, -1],
            [-1, 0],
            [1, 0],
            [-1, 1],
            [0, 1],
          ]
        : [
            [0, -1],
            [1, -1],
            [-1, 0],
            [1, 0],
            [0, 1],
            [1, 1],
          ];

    for (const [colOffset, rowOffset] of neighborOffsets) {
      const neighbor = tileByCoordinate.get(
        `${current.tile.col + colOffset}:${current.tile.row + rowOffset}`
      );

      if (!neighbor || visited.has(neighbor.id)) {
        continue;
      }

      const distance = current.distance + 1;
      if (neighbor.id === toTileId) {
        return distance;
      }

      visited.add(neighbor.id);
      queue.push({ tile: neighbor, distance });
    }
  }

  return null;
}

export function getTilePressureDistanceRing({
  fortress,
  tileId,
  tiles = HEX_TILES,
}: {
  fortress: { mapX: number; mapY: number };
  tileId: string;
  tiles?: readonly HexTile[];
}) {
  const anchor = findCastleAnchorTile({ fortress, tiles });

  if (!anchor) {
    return 1;
  }

  return Math.max(
    1,
    getHexRingDistance({ fromTileId: anchor.id, toTileId: tileId, tiles }) ?? 1
  );
}

export function getTilePressureDistanceMultiplier(distanceRing: number) {
  const extraRings = Math.max(0, Math.floor(distanceRing) - 1);
  const multiplier =
    1 + (extraRings * TILE_PRESSURE_DISTANCE_THRESHOLD_STEP_PERCENT) / 100;

  return Math.min(TILE_PRESSURE_MAX_DISTANCE_THRESHOLD_MULTIPLIER, multiplier);
}

export function getDistanceAdjustedTilePressureClaimThreshold({
  isSeasonFour,
  fortress,
  tileId,
  tiles = HEX_TILES,
}: {
  isSeasonFour: boolean;
  fortress: { mapX: number; mapY: number };
  tileId: string;
  tiles?: readonly HexTile[];
}) {
  const baseThreshold = getTilePressureClaimThreshold(isSeasonFour);

  if (!isSeasonFour) {
    return baseThreshold;
  }

  return Math.ceil(
    baseThreshold *
      getTilePressureDistanceMultiplier(
        getTilePressureDistanceRing({ fortress, tileId, tiles })
      )
  );
}

export function getDistanceAdjustedTilePressureDecayPercent({
  fortress,
  tileId,
  tiles = HEX_TILES,
}: {
  fortress: { mapX: number; mapY: number };
  tileId: string;
  tiles?: readonly HexTile[];
}) {
  const extraRings = Math.max(
    0,
    getTilePressureDistanceRing({ fortress, tileId, tiles }) - 1
  );

  return Math.min(
    TILE_PRESSURE_MAX_DECAY_PERCENT_PER_HOUR,
    TILE_PRESSURE_DECAY_PERCENT_PER_HOUR +
      extraRings * TILE_PRESSURE_DISTANCE_DECAY_STEP_PERCENT
  );
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

export function getExpansionTileCapacity({
  pressureWorkersAssigned,
  race,
  skillPurchases,
}: {
  pressureWorkersAssigned: number;
  race?: FortressRace | string | null;
  skillPurchases?: Array<{ nodeKey: string }> | null;
}) {
  const workerCapacity =
    calculatePressureOutput({ pressureWorkersAssigned }) *
    BASE_EXPANSION_TILES_PER_PRESSURE_WORKER;

  if (!race || !isFortressRace(race)) {
    return FREE_EXPANSION_TILE_CAPACITY + workerCapacity;
  }

  const skillModifiers = getSkillModifiers({
    race,
    purchases: skillPurchases ?? [],
  });
  const raceModifiers = getRaceModifiers(race);

  return Math.max(
    0,
    FREE_EXPANSION_TILE_CAPACITY +
      Math.floor(
        workerCapacity *
          skillModifiers.pressureMultiplier *
          raceModifiers.expansionTileCapacityMultiplier
      )
  );
}

export function calculateOwnershipMaintenanceWorkers({
  pressureWorkersAssigned,
  ownedTileCount,
  race,
  skillPurchases,
}: {
  pressureWorkersAssigned: number;
  ownedTileCount: number;
  race?: FortressRace | string | null;
  skillPurchases?: Array<{ nodeKey: string }> | null;
}) {
  const tileCount = Math.max(0, Math.floor(ownedTileCount));

  if (tileCount <= 0) {
    return 0;
  }

  const capacity = getExpansionTileCapacity({
    pressureWorkersAssigned,
    race,
    skillPurchases,
  });

  if (tileCount > capacity) {
    return 0;
  }

  return Math.floor(capacity / tileCount);
}

export function applyUnsupportedPressureDecay({
  pressure,
  elapsedHours,
  decayPercentPerHour = TILE_PRESSURE_DECAY_PERCENT_PER_HOUR,
}: {
  pressure: number;
  elapsedHours: number;
  decayPercentPerHour?: number;
}) {
  const wholeHours = Math.max(0, Math.floor(elapsedHours));
  if (wholeHours <= 0) return Math.max(0, Math.floor(pressure));

  // Closed-form: pressure × 0.9^hours. Slightly more generous than the old
  // per-hour floor loop (≈1 unit difference at high hours), but O(1) instead
  // of O(hours) — safe for large catch-up intervals.
  const decayFactor = Math.pow(
    1 - Math.max(0, Math.min(100, decayPercentPerHour)) / 100,
    wholeHours,
  );
  return Math.max(0, Math.floor(Math.max(0, Math.floor(pressure)) * decayFactor));
}

export function chooseAutoTilePressurePriorityCandidates({
  fortress,
  tiles,
  distanceTiles = HEX_TILES,
  limit,
  existingTileIds = [],
  isLegalNeutralPressureTile,
}: {
  fortress: { mapX: number; mapY: number };
  tiles: readonly HexTile[];
  distanceTiles?: readonly HexTile[];
  limit: number;
  existingTileIds?: Iterable<string>;
  isLegalNeutralPressureTile: (tileId: string) => boolean;
}) {
  const existing = new Set(existingTileIds);

  return tiles
    .filter((tile) => !existing.has(tile.id) && isLegalNeutralPressureTile(tile.id))
    .map((tile) => ({
      tileId: tile.id,
      distanceRing: getTilePressureDistanceRing({
        fortress,
        tileId: tile.id,
        tiles: distanceTiles,
      }),
    }))
    .sort(
      (left, right) =>
        left.distanceRing - right.distanceRing ||
        left.tileId.localeCompare(right.tileId)
    )
    .slice(0, Math.max(0, Math.floor(limit)))
    .map((candidate) => ({ tileId: candidate.tileId }));
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
