// =============================================================================
// Road Persistence — Season 4
// =============================================================================
// Wraps supply-lines.ts pure functions with Prisma database reads/writes.
// Roads are per-tile per-cycle, with crossing counts and computed levels.
// =============================================================================

import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import {
  addRoadProgress,
  applyRoadDecay,
  createRoadSegment,
  getRoadLevelForCrossings,
  RoadLevel,
} from "./supply-lines";

// ── Types ────────────────────────────────────────────────────────────────────

export type RoadRecord = {
  tileId: string;
  crossings: number;
  level: RoadLevel;
  lastUsedAt: number | null;
};

// ── Read ─────────────────────────────────────────────────────────────────────

/**
 * Load all road segments for a cycle.
 */
export async function loadRoadsForCycle(
  cycleId: string,
): Promise<Map<string, RoadRecord>> {
  const rows = await prisma.mapHexRoad.findMany({
    where: { cycleId },
    select: {
      tileId: true,
      crossings: true,
      level: true,
      lastUsedAt: true,
    },
  });

  const map = new Map<string, RoadRecord>();
  for (const row of rows) {
    map.set(row.tileId, {
      tileId: row.tileId,
      crossings: row.crossings,
      level: row.level as RoadLevel,
      lastUsedAt: row.lastUsedAt?.getTime() ?? null,
    });
  }

  return map;
}

/**
 * Load a single road segment.
 */
export async function loadRoadSegment(
  cycleId: string,
  tileId: string,
): Promise<RoadRecord | null> {
  const row = await prisma.mapHexRoad.findUnique({
    where: { cycleId_tileId: { cycleId, tileId } },
    select: {
      tileId: true,
      crossings: true,
      level: true,
      lastUsedAt: true,
    },
  });

  if (!row) return null;

  return {
    tileId: row.tileId,
    crossings: row.crossings,
    level: row.level as RoadLevel,
    lastUsedAt: row.lastUsedAt?.getTime() ?? null,
  };
}

// ── Write ────────────────────────────────────────────────────────────────────

/**
 * Record that units crossed a tile, adding to its road progress.
 * Creates the road segment if it doesn't exist yet.
 */
export async function recordTileCrossing(
  cycleId: string,
  tileId: string,
  unitsCrossing: number,
  now: number,
): Promise<RoadRecord> {
  const existing = await loadRoadSegment(cycleId, tileId);

  if (existing) {
    const segment = {
      tileId: existing.tileId,
      crossings: existing.crossings,
      level: existing.level,
      lastUsedAt: existing.lastUsedAt,
    };
    const updated = addRoadProgress(segment, unitsCrossing, now);

    await prisma.mapHexRoad.update({
      where: { cycleId_tileId: { cycleId, tileId } },
      data: {
        crossings: updated.crossings,
        level: updated.level,
        lastUsedAt: new Date(updated.lastUsedAt!),
      },
    });

    return updated;
  }

  // Create new segment.
  const segment = createRoadSegment(tileId);
  const updated = addRoadProgress(segment, unitsCrossing, now);

  await prisma.mapHexRoad.create({
    data: {
      cycleId,
      tileId,
      crossings: updated.crossings,
      level: updated.level,
      lastUsedAt: updated.lastUsedAt ? new Date(updated.lastUsedAt) : null,
    },
  });

  return updated;
}

/**
 * Record crossings for an entire path of tiles.
 * Useful when a unit marches across multiple tiles.
 */
export async function recordPathCrossings(
  cycleId: string,
  tileIds: string[],
  unitsCrossing: number,
  now: number,
): Promise<Map<string, RoadRecord>> {
  const map = new Map<string, RoadRecord>();

  // Use a transaction for bulk road updates.
  await prisma.$transaction(async (tx) => {
    for (const tileId of tileIds) {
      const existing = await tx.mapHexRoad.findUnique({
        where: { cycleId_tileId: { cycleId, tileId } },
        select: { tileId: true, crossings: true, level: true, lastUsedAt: true },
      });

      const segment = existing
        ? {
            tileId: existing.tileId,
            crossings: existing.crossings,
            level: existing.level as RoadLevel,
            lastUsedAt: existing.lastUsedAt?.getTime() ?? null,
          }
        : createRoadSegment(tileId);

      const updated = addRoadProgress(segment, unitsCrossing, now);

      await tx.mapHexRoad.upsert({
        where: { cycleId_tileId: { cycleId, tileId } },
        create: {
          cycleId,
          tileId,
          crossings: updated.crossings,
          level: updated.level,
          lastUsedAt: updated.lastUsedAt ? new Date(updated.lastUsedAt) : null,
        },
        update: {
          crossings: updated.crossings,
          level: updated.level,
          lastUsedAt: updated.lastUsedAt ? new Date(updated.lastUsedAt) : null,
        },
      });

      map.set(tileId, updated);
    }
  });

  return map;
}

// ── Decay ────────────────────────────────────────────────────────────────────

/**
 * Apply decay to all road segments in a cycle (called per tick or periodically).
 * Roads that fully decay to NONE level with 0 crossings are deleted.
 */
export async function decayRoadsForCycle(
  cycleId: string,
  now: number,
): Promise<void> {
  const roads = await prisma.mapHexRoad.findMany({
    where: { cycleId },
    select: { tileId: true, crossings: true, level: true, lastUsedAt: true },
  });

  const toUpdate: { tileId: string; crossings: number; level: number; lastUsedAt: Date | null }[] = [];
  const toDelete: string[] = [];

  for (const row of roads) {
    const segment = {
      tileId: row.tileId,
      crossings: row.crossings,
      level: row.level as RoadLevel,
      lastUsedAt: row.lastUsedAt?.getTime() ?? null,
    };
    const decayed = applyRoadDecay(segment, now);

    if (decayed.crossings <= 0 && decayed.level <= RoadLevel.NONE) {
      toDelete.push(row.tileId);
    } else {
      toUpdate.push({
        tileId: row.tileId,
        crossings: decayed.crossings,
        level: decayed.level,
        lastUsedAt: decayed.lastUsedAt !== null ? new Date(decayed.lastUsedAt) : null,
      });
    }
  }

  if (toDelete.length > 0 || toUpdate.length > 0) {
    await prisma.$transaction(async (tx) => {
      for (const del of toDelete) {
        await tx.mapHexRoad.delete({
          where: { cycleId_tileId: { cycleId, tileId: del } },
        });
      }
      for (const upd of toUpdate) {
        await tx.mapHexRoad.update({
          where: { cycleId_tileId: { cycleId, tileId: upd.tileId } },
          data: {
            crossings: upd.crossings,
            level: upd.level,
            lastUsedAt: upd.lastUsedAt,
          },
        });
      }
    });
  }
}
