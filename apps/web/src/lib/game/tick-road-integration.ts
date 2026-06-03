// =============================================================================
// Tick Road Integration — Record road crossings when units traverse tiles
// =============================================================================
// Called from tick.ts during the arrival phase to record road progress on
// tiles that units walked through.
// =============================================================================

import { HEX_TILES } from "./map-hex";
import { findMarchPath, findSimplePath } from "./march-pathfinding";
import { loadRoadsForCycle, recordPathCrossings } from "./road-persistence";
import { findClosestHexTile, getRoadWeightsFromSegments } from "./road-travel";
import type { PrismaClient } from "@/lib/prisma-client";
import {
  addRoadProgress,
  createRoadSegment,
  RoadLevel,
} from "./supply-lines";

const IDLE_BATTALION_ROAD_UNITS_PER_CROSSING = 100;
const IDLE_BATTALION_MAX_ROAD_CROSSINGS_PER_TICK = 25;

export type IdleBattalionRoadCandidate = {
  id: string;
  fortressId: string;
  size: number;
  garrisonedAt: string | null;
  assignmentCount: number;
  pendingReinforcementCount: number;
};

export type IdleBattalionRoadCrossing = {
  tileId: string;
  crossings: number;
};

export function getIdleBattalionRoadCrossings(
  size: number,
): number {
  if (size <= 0) return 0;
  return Math.min(
    IDLE_BATTALION_MAX_ROAD_CROSSINGS_PER_TICK,
    Math.max(1, Math.ceil(size / IDLE_BATTALION_ROAD_UNITS_PER_CROSSING)),
  );
}

export function getIdleBattalionRoadCrossingPlan(args: {
  battalions: IdleBattalionRoadCandidate[];
  ownedTilesByFortress: Map<string, Set<string>>;
}): IdleBattalionRoadCrossing[] {
  const crossingsByTile = new Map<string, number>();

  for (const battalion of args.battalions) {
    if (battalion.size <= 0 || !battalion.garrisonedAt) continue;
    if (battalion.assignmentCount > 0) continue;
    if (battalion.pendingReinforcementCount > 0) continue;

    const ownedTiles = args.ownedTilesByFortress.get(battalion.fortressId);
    if (!ownedTiles?.has(battalion.garrisonedAt)) continue;

    crossingsByTile.set(
      battalion.garrisonedAt,
      (crossingsByTile.get(battalion.garrisonedAt) ?? 0) +
        getIdleBattalionRoadCrossings(battalion.size),
    );
  }

  return [...crossingsByTile.entries()].map(([tileId, crossings]) => ({
    tileId,
    crossings,
  }));
}

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

  const originTile = findClosestHexTile(originMapX, originMapY);
  const targetTile = findClosestHexTile(targetMapX, targetMapY);

  if (!originTile || !targetTile) return;
  if (originTile.id === targetTile.id) return;

  const tileLookup = new Map(HEX_TILES.map((t) => [t.id, { id: t.id, col: t.col, row: t.row }]));
  const currentRoads = await loadRoadsForCycle(cycleId);
  const roadPath = findMarchPath({
    startTile: originTile,
    endTile: targetTile,
    tileLookup,
    roads: getRoadWeightsFromSegments([...currentRoads.values()]),
    ownedTileIds: new Set(),
  });
  const path = roadPath?.tiles ?? findSimplePath(originTile, targetTile, tileLookup);

  if (!path || path.length === 0) return;

  await recordPathCrossings(cycleId, path, armyAmount, now.getTime());
}

export async function recordIdleBattalionRoadCrossings(args: {
  db: PrismaClient;
  cycleId: string;
  now: Date;
}): Promise<number> {
  const [battalions, ownerships] = await Promise.all([
    args.db.battalion.findMany({
      where: {
        cycleId: args.cycleId,
        size: { gt: 0 },
        garrisonedAt: { not: null },
      },
      select: {
        id: true,
        fortressId: true,
        size: true,
        garrisonedAt: true,
        assignments: {
          select: { id: true },
          take: 1,
        },
        incomingReinforcements: {
          where: {
            resolvedAt: null,
            cancelledAt: null,
          },
          select: { id: true },
          take: 1,
        },
      },
    }),
    args.db.mapHexOwnership.findMany({
      where: {
        cycleId: args.cycleId,
      },
      select: {
        ownerFortressId: true,
        tileId: true,
      },
    }),
  ]);

  const ownedTilesByFortress = new Map<string, Set<string>>();
  for (const ownership of ownerships) {
    const tiles = ownedTilesByFortress.get(ownership.ownerFortressId) ?? new Set<string>();
    tiles.add(ownership.tileId);
    ownedTilesByFortress.set(ownership.ownerFortressId, tiles);
  }

  const plan = getIdleBattalionRoadCrossingPlan({
    battalions: battalions.map((battalion) => ({
      id: battalion.id,
      fortressId: battalion.fortressId,
      size: battalion.size,
      garrisonedAt: battalion.garrisonedAt,
      assignmentCount: battalion.assignments.length,
      pendingReinforcementCount: battalion.incomingReinforcements.length,
    })),
    ownedTilesByFortress,
  });

  if (plan.length === 0) return 0;

  const nowMs = args.now.getTime();
  await args.db.$transaction(async (tx) => {
    for (const crossing of plan) {
      const existing = await tx.mapHexRoad.findUnique({
        where: {
          cycleId_tileId: {
            cycleId: args.cycleId,
            tileId: crossing.tileId,
          },
        },
        select: {
          tileId: true,
          crossings: true,
          level: true,
          lastUsedAt: true,
        },
      });
      const segment = existing
        ? {
            tileId: existing.tileId,
            crossings: existing.crossings,
            level: existing.level as RoadLevel,
            lastUsedAt: existing.lastUsedAt?.getTime() ?? null,
          }
        : createRoadSegment(crossing.tileId);
      const updated = addRoadProgress(segment, crossing.crossings, nowMs);

      await tx.mapHexRoad.upsert({
        where: {
          cycleId_tileId: {
            cycleId: args.cycleId,
            tileId: crossing.tileId,
          },
        },
        create: {
          cycleId: args.cycleId,
          tileId: crossing.tileId,
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
    }
  });

  return plan.reduce((sum, crossing) => sum + crossing.crossings, 0);
}
