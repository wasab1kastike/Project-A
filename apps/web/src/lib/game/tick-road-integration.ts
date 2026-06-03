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
import { addRoadProgress, createRoadSegment, RoadLevel } from "./supply-lines";

const IDLE_BATTALION_ROAD_UNITS_PER_CROSSING = 100;
const IDLE_BATTALION_MAX_ROAD_CROSSINGS_PER_TICK = 25;

export type IdleBattalionRoadCandidate = {
  id: string;
  fortressId: string;
  size: number;
  mode: string | null;
  assignmentCount: number;
  pendingReinforcementCount: number;
};

export type IdleBattalionRoadCrossing = {
  tileId: string;
  crossings: number;
};

type RoadPatrolPoint = {
  mapX: number;
  mapY: number;
};

type RoadWarFront = {
  attackerFortressId: string;
  enemyFortressId: string;
  status: string;
};

export function getIdleBattalionRoadCrossings(size: number): number {
  if (size <= 0) return 0;
  return Math.min(
    IDLE_BATTALION_MAX_ROAD_CROSSINGS_PER_TICK,
    Math.max(1, Math.ceil(size / IDLE_BATTALION_ROAD_UNITS_PER_CROSSING))
  );
}

export function getIdleBattalionRoadCrossingPlan(args: {
  battalions: IdleBattalionRoadCandidate[];
  ownedTilesByFortress: Map<string, Set<string>>;
  fortressPositionsById: Map<string, RoadPatrolPoint>;
  warFronts?: RoadWarFront[];
  alliedFortressIdsByFortress?: Map<string, Set<string>>;
}): IdleBattalionRoadCrossing[] {
  const crossingsByTile = new Map<string, number>();
  const spreadIndexByMode = new Map<string, number>();

  for (const battalion of args.battalions) {
    if (battalion.size <= 0) continue;
    if (battalion.assignmentCount > 0) continue;
    if (battalion.pendingReinforcementCount > 0) continue;

    const ownedTiles = args.ownedTilesByFortress.get(battalion.fortressId);
    if (!ownedTiles || ownedTiles.size === 0) continue;

    const mode = getBattalionRoadMode(battalion.mode);
    const spreadKey = `${battalion.fortressId}:${mode}`;
    const spreadIndex = spreadIndexByMode.get(spreadKey) ?? 0;
    spreadIndexByMode.set(spreadKey, spreadIndex + 1);
    const tileId = getModePatrolTile({
      mode,
      fortressId: battalion.fortressId,
      ownedTiles,
      spreadIndex,
      fortressPositionsById: args.fortressPositionsById,
      warFronts: args.warFronts ?? [],
      alliedFortressIdsByFortress:
        args.alliedFortressIdsByFortress ?? new Map(),
    });

    if (!tileId) continue;

    crossingsByTile.set(
      tileId,
      (crossingsByTile.get(tileId) ?? 0) +
        getIdleBattalionRoadCrossings(battalion.size)
    );
  }

  return [...crossingsByTile.entries()].map(([tileId, crossings]) => ({
    tileId,
    crossings,
  }));
}

function getBattalionRoadMode(
  mode: string | null
): "GUARD" | "ATTACK" | "RESERVE" | "ALLIANCE" {
  return mode === "ATTACK" ||
    mode === "RESERVE" ||
    mode === "ALLIANCE" ||
    mode === "GUARD"
    ? mode
    : "GUARD";
}

function getModePatrolTile(args: {
  mode: "GUARD" | "ATTACK" | "RESERVE" | "ALLIANCE";
  fortressId: string;
  ownedTiles: Set<string>;
  spreadIndex: number;
  fortressPositionsById: Map<string, RoadPatrolPoint>;
  warFronts: RoadWarFront[];
  alliedFortressIdsByFortress: Map<string, Set<string>>;
}) {
  const ownedTiles = getKnownOwnedTiles(args.ownedTiles);
  if (ownedTiles.length === 0) return null;

  const home = args.fortressPositionsById.get(args.fortressId) ?? null;
  const nearestToPoint = (point: RoadPatrolPoint | null) =>
    pickPatrolTile(
      sortTilesByDistance(ownedTiles, point ?? home),
      args.spreadIndex
    );

  if (args.mode === "GUARD") {
    const borderTiles = ownedTiles.filter((tile) =>
      HEX_TILES.some((candidate) => {
        if (candidate.id === tile.id || args.ownedTiles.has(candidate.id)) {
          return false;
        }

        const colDistance = Math.abs(candidate.col - tile.col);
        const rowDistance = Math.abs(candidate.row - tile.row);
        return colDistance <= 1 && rowDistance <= 1;
      })
    );

    return (
      pickPatrolTile(
        sortTilesByDistance(borderTiles, home),
        args.spreadIndex
      ) ?? nearestToPoint(home)
    );
  }

  if (args.mode === "ATTACK") {
    const front = args.warFronts.find(
      (candidate) =>
        candidate.attackerFortressId === args.fortressId &&
        (candidate.status === "ADVANCING" || candidate.status === "STALLED")
    );
    const enemy = front
      ? (args.fortressPositionsById.get(front.enemyFortressId) ?? null)
      : null;

    return nearestToPoint(enemy ?? home);
  }

  if (args.mode === "ALLIANCE") {
    const ally = [
      ...(args.alliedFortressIdsByFortress.get(args.fortressId) ?? []),
    ]
      .map((fortressId) => args.fortressPositionsById.get(fortressId))
      .filter((point): point is RoadPatrolPoint => Boolean(point))
      .sort(
        (left, right) =>
          getPointDistance(home, left) - getPointDistance(home, right)
      )[0];

    return nearestToPoint(ally ?? home);
  }

  return nearestToPoint(home);
}

function getKnownOwnedTiles(ownedTiles: Set<string>) {
  const ownedTileIds = ownedTiles;
  return HEX_TILES.filter((tile) => ownedTileIds.has(tile.id));
}

function pickPatrolTile(tiles: typeof HEX_TILES, spreadIndex: number) {
  if (tiles.length === 0) return null;
  return tiles[spreadIndex % Math.min(12, tiles.length)]?.id ?? null;
}

function sortTilesByDistance(
  tiles: typeof HEX_TILES,
  point: RoadPatrolPoint | null
) {
  if (!point) return [...tiles];

  return [...tiles].sort((left, right) => {
    const leftDistance = Math.hypot(
      left.xPercent - point.mapX,
      left.yPercent - point.mapY
    );
    const rightDistance = Math.hypot(
      right.xPercent - point.mapX,
      right.yPercent - point.mapY
    );
    return leftDistance - rightDistance || left.id.localeCompare(right.id);
  });
}

function getPointDistance(from: RoadPatrolPoint | null, to: RoadPatrolPoint) {
  if (!from) return 0;
  return Math.hypot(from.mapX - to.mapX, from.mapY - to.mapY);
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
  const {
    cycleId,
    originMapX,
    originMapY,
    targetMapX,
    targetMapY,
    armyAmount,
    now,
  } = args;

  if (armyAmount <= 0) return;

  const originTile = findClosestHexTile(originMapX, originMapY);
  const targetTile = findClosestHexTile(targetMapX, targetMapY);

  if (!originTile || !targetTile) return;
  if (originTile.id === targetTile.id) return;

  const tileLookup = new Map(
    HEX_TILES.map((t) => [t.id, { id: t.id, col: t.col, row: t.row }])
  );
  const currentRoads = await loadRoadsForCycle(cycleId);
  const roadPath = findMarchPath({
    startTile: originTile,
    endTile: targetTile,
    tileLookup,
    roads: getRoadWeightsFromSegments([...currentRoads.values()]),
    ownedTileIds: new Set(),
  });
  const path =
    roadPath?.tiles ?? findSimplePath(originTile, targetTile, tileLookup);

  if (!path || path.length === 0) return;

  await recordPathCrossings(cycleId, path, armyAmount, now.getTime());
}

export async function recordIdleBattalionRoadCrossings(args: {
  db: PrismaClient;
  cycleId: string;
  now: Date;
}): Promise<number> {
  const [battalions, ownerships, fortresses, warFronts, diplomacyRelations] =
    await Promise.all([
      args.db.battalion.findMany({
        where: {
          cycleId: args.cycleId,
          size: { gt: 0 },
        },
        select: {
          id: true,
          fortressId: true,
          size: true,
          mode: true,
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
      args.db.fortress.findMany({
        where: {
          cycleId: args.cycleId,
        },
        select: {
          id: true,
          mapX: true,
          mapY: true,
        },
      }),
      args.db.warFront.findMany({
        where: {
          cycleId: args.cycleId,
          status: {
            in: ["ADVANCING", "STALLED"],
          },
        },
        select: {
          attackerFortressId: true,
          enemyFortressId: true,
          status: true,
        },
      }),
      args.db.diplomacyRelation.findMany({
        where: {
          cycleId: args.cycleId,
          status: "ALLIED",
        },
        select: {
          fortressAId: true,
          fortressBId: true,
        },
      }),
    ]);

  const ownedTilesByFortress = new Map<string, Set<string>>();
  for (const ownership of ownerships) {
    const tiles =
      ownedTilesByFortress.get(ownership.ownerFortressId) ?? new Set<string>();
    tiles.add(ownership.tileId);
    ownedTilesByFortress.set(ownership.ownerFortressId, tiles);
  }
  const fortressPositionsById = new Map(
    fortresses.map((fortress) => [
      fortress.id,
      { mapX: fortress.mapX, mapY: fortress.mapY },
    ])
  );
  const alliedFortressIdsByFortress = new Map<string, Set<string>>();
  for (const relation of diplomacyRelations) {
    const a =
      alliedFortressIdsByFortress.get(relation.fortressAId) ??
      new Set<string>();
    a.add(relation.fortressBId);
    alliedFortressIdsByFortress.set(relation.fortressAId, a);

    const b =
      alliedFortressIdsByFortress.get(relation.fortressBId) ??
      new Set<string>();
    b.add(relation.fortressAId);
    alliedFortressIdsByFortress.set(relation.fortressBId, b);
  }

  const plan = getIdleBattalionRoadCrossingPlan({
    battalions: battalions.map((battalion) => ({
      id: battalion.id,
      fortressId: battalion.fortressId,
      size: battalion.size,
      mode: battalion.mode,
      assignmentCount: battalion.assignments.length,
      pendingReinforcementCount: battalion.incomingReinforcements.length,
    })),
    ownedTilesByFortress,
    fortressPositionsById,
    warFronts,
    alliedFortressIdsByFortress,
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
