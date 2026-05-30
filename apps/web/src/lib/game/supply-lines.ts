// =============================================================================
// Supply Lines & Roads — Season 4 Auto-War
// =============================================================================
// Roads build passively as units cross tiles. Higher road levels grant speed
// bonuses. Roads decay if unused. Visible on the map as colored paths.
// Pure functions only. No DB / Prisma imports.
// =============================================================================

// ── Road Levels ──────────────────────────────────────────────────────────────

export const RoadLevel = {
  NONE: 0,
  DIRT: 1,
  STONE: 2,
  HIGHWAY: 3,
} as const;

export type RoadLevel = (typeof RoadLevel)[keyof typeof RoadLevel];

export const ROAD_LEVEL_NAMES: Record<RoadLevel, string> = {
  [RoadLevel.NONE]: "None",
  [RoadLevel.DIRT]: "Dirt Path",
  [RoadLevel.STONE]: "Stone Road",
  [RoadLevel.HIGHWAY]: "Highway",
};

/** Crossings required to reach each road level. */
export const ROAD_THRESHOLDS: Record<RoadLevel, number> = {
  [RoadLevel.NONE]: 0,
  [RoadLevel.DIRT]: 50,
  [RoadLevel.STONE]: 200,
  [RoadLevel.HIGHWAY]: 500,
};

/** Speed bonus multiplier for each road level (additive: 1.0 = baseline). */
export const ROAD_SPEED_BONUS: Record<RoadLevel, number> = {
  [RoadLevel.NONE]: 1.0,
  [RoadLevel.DIRT]: 1.15,
  [RoadLevel.STONE]: 1.3,
  [RoadLevel.HIGHWAY]: 1.5,
};

// ── Road State ───────────────────────────────────────────────────────────────

export type RoadSegment = {
  tileId: string;
  /** Total crossings since road was built (cumulative). */
  crossings: number;
  /** Current road level. */
  level: RoadLevel;
  /** Epoch ms when this road was last used (crossed by a unit). */
  lastUsedAt: number | null;
};

// ── Road Progress ────────────────────────────────────────────────────────────

/**
 * Add crossings to a road segment when units traverse a tile.
 * Each unit crossing adds 1 to the progress counter.
 * Returns the updated road segment.
 */
export function addRoadProgress(
  segment: RoadSegment,
  unitsCrossing: number,
  now: number,
): RoadSegment {
  const newCrossings = segment.crossings + Math.max(0, Math.floor(unitsCrossing));
  const newLevel = getRoadLevelForCrossings(newCrossings);

  return {
    ...segment,
    crossings: newCrossings,
    level: newLevel,
    lastUsedAt: now,
  };
}

/**
 * Determine the road level for a given number of crossings.
 */
export function getRoadLevelForCrossings(crossings: number): RoadLevel {
  if (crossings >= ROAD_THRESHOLDS[RoadLevel.HIGHWAY]) return RoadLevel.HIGHWAY;
  if (crossings >= ROAD_THRESHOLDS[RoadLevel.STONE]) return RoadLevel.STONE;
  if (crossings >= ROAD_THRESHOLDS[RoadLevel.DIRT]) return RoadLevel.DIRT;
  return RoadLevel.NONE;
}

/**
 * Get the speed multiplier for a road level.
 */
export function getRoadSpeedMultiplier(level: RoadLevel): number {
  return ROAD_SPEED_BONUS[level] ?? 1.0;
}

/**
 * Calculate travel time reduction from a road.
 * Returns the travel time multiplier (e.g., 0.85 = 15% faster).
 */
export function getRoadTravelTimeMultiplier(level: RoadLevel): number {
  return 1 / getRoadSpeedMultiplier(level);
}

// ── Road Decay ───────────────────────────────────────────────────────────────

/** Roads decay at 1% per hour of inactivity. */
export const ROAD_DECAY_RATE_PER_HOUR = 0.01;

/**
 * Apply decay to a road segment. Only decays roads that haven't been used.
 * Decay reduces crossings, which may cause the road to downgrade.
 *
 * @param segment — the road segment
 * @param now — current epoch ms
 * @returns updated road segment (may have downgraded)
 */
export function applyRoadDecay(
  segment: RoadSegment,
  now: number,
): RoadSegment {
  if (segment.lastUsedAt === null) return segment;
  if (segment.crossings <= 0) return { ...segment, level: RoadLevel.NONE };

  const msSinceUsed = now - segment.lastUsedAt;
  const hoursSinceUsed = Math.floor(msSinceUsed / 3_600_000);

  if (hoursSinceUsed <= 0) return segment;

  // Each hour of inactivity: crossings *= (1 - decayRate)
  const decayFactor = Math.pow(1 - ROAD_DECAY_RATE_PER_HOUR, hoursSinceUsed);
  const newCrossings = Math.max(0, Math.floor(segment.crossings * decayFactor));
  const newLevel = getRoadLevelForCrossings(newCrossings);

  return {
    ...segment,
    crossings: newCrossings,
    level: newLevel,
  };
}

// ── Road Network ─────────────────────────────────────────────────────────────

export type RoadNetwork = Map<string, RoadSegment>;

/**
 * Create a new road segment for a tile that has never been crossed.
 */
export function createRoadSegment(tileId: string): RoadSegment {
  return {
    tileId,
    crossings: 0,
    level: RoadLevel.NONE,
    lastUsedAt: null,
  };
}

/**
 * Process road crossings for a path of tiles.
 * Each tile in the path gets `unitsCrossing` added to its road progress.
 */
export function recordPathCrossings(
  network: RoadNetwork,
  pathTileIds: string[],
  unitsCrossing: number,
  now: number,
): RoadNetwork {
  const updated = new Map(network);
  for (const tileId of pathTileIds) {
    const existing = updated.get(tileId) ?? createRoadSegment(tileId);
    updated.set(tileId, addRoadProgress(existing, unitsCrossing, now));
  }
  return updated;
}

/**
 * Apply decay to the entire road network.
 */
export function decayRoadNetwork(
  network: RoadNetwork,
  now: number,
): RoadNetwork {
  const updated = new Map<string, RoadSegment>();
  for (const [tileId, segment] of network) {
    const decayed = applyRoadDecay(segment, now);
    if (decayed.crossings > 0 || decayed.level > RoadLevel.NONE) {
      updated.set(tileId, decayed);
    }
    // Fully decayed roads are removed from the network.
  }
  return updated;
}

// ── Combined Travel Speed ────────────────────────────────────────────────────

/**
 * Calculate effective travel time multiplier for a path.
 * Takes the average road speed bonus across all tiles in the path.
 *
 * @returns multiplier where 1.0 = baseline, 0.5 = twice as fast
 */
export function getPathTravelTimeMultiplier(
  network: RoadNetwork,
  pathTileIds: string[],
): number {
  if (pathTileIds.length === 0) return 1.0;

  let totalMultiplier = 0;
  for (const tileId of pathTileIds) {
    const segment = network.get(tileId);
    const level = segment?.level ?? RoadLevel.NONE;
    totalMultiplier += getRoadTravelTimeMultiplier(level);
  }

  return totalMultiplier / pathTileIds.length;
}
