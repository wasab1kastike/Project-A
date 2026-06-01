// =============================================================================
// March Pathfinding — A* on Hex Grid
// =============================================================================
// Computes tile-by-tile paths for unit movement. Road bonuses reduce edge cost.
// Pure functions only. No DB / Prisma imports.
// =============================================================================

// ── Hex Tile for Pathfinding ─────────────────────────────────────────────────

export type PathHexTile = {
  id: string;
  col: number;
  row: number;
};

// ── Road Network for Pathfinding ─────────────────────────────────────────────

export type RoadWeights = Map<string, number>; // tileId → speed multiplier (1.0+)

// ── Path Result ──────────────────────────────────────────────────────────────

export type MarchPath = {
  /** Ordered tile IDs from start to end (inclusive). */
  tiles: string[];
  /** Cumulative travel time (ms) to reach each tile. Same length as tiles. */
  cumulativeMs: number[];
};

// ── Adjacency ────────────────────────────────────────────────────────────────

/**
 * Get the 6 hex neighbors for a tile at (col, row).
 * Even columns offset differently from odd columns in a pointy-top hex grid.
 */
export function getHexNeighbors(
  tile: PathHexTile,
  tileLookup: Map<string, PathHexTile>,
): PathHexTile[] {
  const isEvenCol = tile.col % 2 === 0;
  const offsets: [number, number][] = [
    [-1, 0], [1, 0],
    [0, -1], [0, 1],
  ];
  if (isEvenCol) {
    offsets.push([-1, -1], [-1, 1]);
  } else {
    offsets.push([1, -1], [1, 1]);
  }

  const neighbors: PathHexTile[] = [];
  for (const [dc, dr] of offsets) {
    const neighborCol = tile.col + dc;
    const neighborRow = tile.row + dr;
    const neighbor =
      tileLookup.get(`${neighborCol}:${neighborRow}`) ??
      tileLookup.get(`${neighborCol},${neighborRow}`);
    if (neighbor) neighbors.push(neighbor);
  }
  return neighbors;
}

// ── Edge Cost ────────────────────────────────────────────────────────────────

/** Base travel time per hex tile in ms (1 minute per tile at base speed). */
export const BASE_TILE_TRAVEL_MS = 60_000; // 1 minute

/**
 * Calculate the travel cost to move into a tile.
 * Roads reduce travel time: cost = BASE / speedMultiplier.
 */
export function getTileTravelCost(
  tileId: string,
  roads: RoadWeights,
): number {
  const speedMultiplier = roads.get(tileId) ?? 1.0;
  return BASE_TILE_TRAVEL_MS / Math.max(0.1, speedMultiplier);
}

// ── Heuristic ────────────────────────────────────────────────────────────────

/**
 * Hex distance heuristic for A*.
 * On a hex grid: distance = max(|dc|, |dr|, |dc+dr|) / 2 or similar.
 * Simplified: steps = (|dc| + |dr| + |dc+dr|) / 2
 */
function hexDistance(a: PathHexTile, b: PathHexTile): number {
  const dc = Math.abs(a.col - b.col);
  const dr = Math.abs(a.row - b.row);
  // For offset coordinates in a pointy-top hex grid.
  // Convert to cube coordinates for accurate distance.
  const aq = a.col - (a.row - (a.row & 1)) / 2;
  const ar = a.row;
  const bq = b.col - (b.row - (b.row & 1)) / 2;
  const br = b.row;
  const as = -aq - ar;
  const bs = -bq - br;
  return (Math.abs(aq - bq) + Math.abs(ar - br) + Math.abs(as - bs)) / 2;
}

// ── A* Pathfinding ───────────────────────────────────────────────────────────

/**
 * Find the shortest path between two tiles using A*.
 *
 * @param startTile — starting tile
 * @param endTile — destination tile
 * @param tileLookup — all hex tiles indexed by id
 * @param roads — road speed bonuses per tile
 * @param ownedTileIds — tiles owned by the moving player (preferred, slight discount)
 * @returns MarchPath or null if no path exists
 */
export function findMarchPath(args: {
  startTile: PathHexTile;
  endTile: PathHexTile;
  tileLookup: Map<string, PathHexTile>;
  roads: RoadWeights;
  ownedTileIds: Set<string>;
}): MarchPath | null {
  const { startTile, endTile, tileLookup, roads, ownedTileIds } = args;

  // A* data structures.
  const openSet = new Set<string>();
  const cameFrom = new Map<string, string>();
  const gScore = new Map<string, number>(); // cost from start
  const fScore = new Map<string, number>(); // g + heuristic

  gScore.set(startTile.id, 0);
  fScore.set(startTile.id, hexDistance(startTile, endTile));
  openSet.add(startTile.id);

  while (openSet.size > 0) {
    // Find node with lowest fScore.
    let current: string | null = null;
    let lowestF = Infinity;
    for (const id of openSet) {
      const f = fScore.get(id) ?? Infinity;
      if (f < lowestF) {
        lowestF = f;
        current = id;
      }
    }

    if (!current) break;
    if (current === endTile.id) {
      // Reconstruct path.
      return reconstructPath(cameFrom, current, gScore);
    }

    openSet.delete(current);

    const currentTile = tileLookup.get(current);
    if (!currentTile) continue;

    const currentG = gScore.get(current) ?? Infinity;

    for (const neighbor of getHexNeighbors(currentTile, tileLookup)) {
      let edgeCost = getTileTravelCost(neighbor.id, roads);

      // Slight discount for owned tiles (10% cheaper).
      if (ownedTileIds.has(neighbor.id)) {
        edgeCost *= 0.9;
      }

      const tentativeG = currentG + edgeCost;

      if (tentativeG < (gScore.get(neighbor.id) ?? Infinity)) {
        cameFrom.set(neighbor.id, current);
        gScore.set(neighbor.id, tentativeG);
        fScore.set(
          neighbor.id,
          tentativeG + hexDistance(neighbor, endTile) * BASE_TILE_TRAVEL_MS,
        );
        openSet.add(neighbor.id);
      }
    }
  }

  return null; // No path found.
}

function reconstructPath(
  cameFrom: Map<string, string>,
  current: string,
  gScore: Map<string, number>,
): MarchPath {
  const tiles: string[] = [current];
  while (cameFrom.has(current)) {
    current = cameFrom.get(current)!;
    tiles.unshift(current);
  }

  const cumulativeMs: number[] = [];
  for (const tileId of tiles) {
    cumulativeMs.push(gScore.get(tileId) ?? 0);
  }

  return { tiles, cumulativeMs };
}

// ── Simple Path (BFS) ────────────────────────────────────────────────────────

/**
 * Find a path using BFS (unweighted, for when road data isn't available).
 * Returns tile IDs in order from start to end.
 */
export function findSimplePath(
  startTile: PathHexTile,
  endTile: PathHexTile,
  tileLookup: Map<string, PathHexTile>,
): string[] | null {
  const visited = new Set<string>();
  const cameFrom = new Map<string, string>();
  const queue: string[] = [startTile.id];
  visited.add(startTile.id);

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (current === endTile.id) {
      const path: string[] = [current];
      let cursor = current;
      while (cameFrom.has(cursor)) {
        cursor = cameFrom.get(cursor)!;
        path.unshift(cursor);
      }
      return path;
    }

    const currentTile = tileLookup.get(current);
    if (!currentTile) continue;

    for (const neighbor of getHexNeighbors(currentTile, tileLookup)) {
      if (!visited.has(neighbor.id)) {
        visited.add(neighbor.id);
        cameFrom.set(neighbor.id, current);
        queue.push(neighbor.id);
      }
    }
  }

  return null;
}
