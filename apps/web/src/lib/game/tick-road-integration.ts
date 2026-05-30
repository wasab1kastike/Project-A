// =============================================================================
// Tick Road Integration — Record road crossings when units traverse tiles
// =============================================================================
// Called from tick.ts during the arrival phase to record road progress on
// tiles that units walked through.
// =============================================================================

import type { PrismaClient } from "@prisma/client";
import { HEX_TILES } from "./map-hex";
import { findSimplePath } from "./march-pathfinding";
import { recordPathCrossings } from "./road-persistence";

/**
 * Record road crossings for an attack unit that has arrived at its target.
 *
 * Computes the tile-by-tile path from the attacker's origin to the target,
 * then records crossings for each tile in the path. This builds roads
 * passively as armies march across the map.
 *
 * @param db — Prisma client (transaction or raw)
 * @param cycleId — current cycle
 * @param originMapX, originMapY — attacker's starting position (map %)
 * @param targetMapX, targetMapY — target tile position (map %)
 * @param armyAmount — number of units crossing (each unit = 1 crossing)
 * @param now — current timestamp
 */
export async function recordUnitRoadCrossings(args: {
  cycleId: string;
  originMapX: number;
  originMapY: number;
  targetMapX: number;
  targetMapY: number;
  armyAmount: number;
  now: Date;
}): Promise<void> {
  const { cycleId, originMapX, originMapY, targetMapX, targetMapY, armyAmount, now } = args;

  if (armyAmount <= 0) return;

  // Snap origin and target to nearest hex tiles.
  const originTile = findClosestHexTile(originMapX, originMapY);
  const targetTile = findClosestHexTile(targetMapX, targetMapY);

  if (!originTile || !targetTile) return;
  if (originTile.id === targetTile.id) return;

  // Compute path.
  const tileLookup = new Map(HEX_TILES.map((t) => [t.id, { id: t.id, col: t.col, row: t.row }]));
  const path = findSimplePath(originTile, targetTile, tileLookup);

  if (!path || path.length === 0) return;

  await recordPathCrossings(cycleId, path, armyAmount, now.getTime());
}

/**
 * Find the hex tile closest to a given map position (in % coordinates 0-100).
 */
function findClosestHexTile(
  mapX: number,
  mapY: number,
): (typeof HEX_TILES)[number] | null {
  let closest: (typeof HEX_TILES)[number] | null = null;
  let closestDist = Infinity;

  for (const tile of HEX_TILES) {
    const dx = tile.xPercent - mapX;
    const dy = tile.yPercent - mapY;
    const dist = dx * dx + dy * dy;
    if (dist < closestDist) {
      closestDist = dist;
      closest = tile;
    }
  }

  return closest;
}
