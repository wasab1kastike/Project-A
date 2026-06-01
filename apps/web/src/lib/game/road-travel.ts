import type { Prisma, PrismaClient } from "@/lib/prisma-client";
import { getAttackTravelMinutes } from "./attacks";
import { CONVOY_MINIMUM_TRAVEL_HOURS } from "./trading";
import { HEX_TILES } from "./map-hex";
import { findMarchPath, type PathHexTile, type RoadWeights } from "./march-pathfinding";
import { getRoadSpeedMultiplier, type RoadLevel } from "./supply-lines";
import { addHours, addMinutes } from "./time";

type DatabaseClient = PrismaClient | Prisma.TransactionClient;

export type RoadTravelSegment = {
  tileId: string;
  level: number;
  crossings?: number;
};

export type RoadTravelResult = {
  baseMinutes: number;
  adjustedMinutes: number;
  savedMinutes: number;
  speedMultiplier: number;
  routeTileIds: string[];
};

export type MapPoint = { mapX: number; mapY: number };

const TILE_LOOKUP = new Map<string, PathHexTile>(
  HEX_TILES.map((tile) => [
    tile.id,
    { id: tile.id, col: tile.col, row: tile.row },
  ]),
);

function getPathMs(path: { cumulativeMs: number[] }) {
  return path.cumulativeMs[path.cumulativeMs.length - 1] ?? 0;
}

export function findClosestHexTile(
  mapX: number,
  mapY: number,
): PathHexTile | null {
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

  return closest
    ? { id: closest.id, col: closest.col, row: closest.row }
    : null;
}

export function getRoadWeightsFromSegments(
  roadSegments: RoadTravelSegment[],
): RoadWeights {
  const weights: RoadWeights = new Map();
  for (const segment of roadSegments) {
    const speed = getRoadSpeedMultiplier(segment.level as RoadLevel);
    if (speed > 1) {
      weights.set(segment.tileId, speed);
    }
  }
  return weights;
}

export function calculateRoadAdjustedTravel(args: {
  origin: MapPoint;
  target: MapPoint;
  baseMinutes: number;
  roadSegments: RoadTravelSegment[];
  ownedTileIds?: Set<string>;
}): RoadTravelResult {
  const baseMinutes = Math.max(1, Math.ceil(args.baseMinutes));
  const fallback: RoadTravelResult = {
    baseMinutes,
    adjustedMinutes: baseMinutes,
    savedMinutes: 0,
    speedMultiplier: 1,
    routeTileIds: [],
  };

  const originTile = findClosestHexTile(args.origin.mapX, args.origin.mapY);
  const targetTile = findClosestHexTile(args.target.mapX, args.target.mapY);
  if (!originTile || !targetTile) return fallback;
  if (originTile.id === targetTile.id) {
    return { ...fallback, routeTileIds: [originTile.id] };
  }

  const plainPath = findMarchPath({
    startTile: originTile,
    endTile: targetTile,
    tileLookup: TILE_LOOKUP,
    roads: new Map(),
    ownedTileIds: new Set(),
  });
  const roadPath = findMarchPath({
    startTile: originTile,
    endTile: targetTile,
    tileLookup: TILE_LOOKUP,
    roads: getRoadWeightsFromSegments(args.roadSegments),
    ownedTileIds: args.ownedTileIds ?? new Set(),
  });

  if (!plainPath || !roadPath) return fallback;

  const plainMs = getPathMs(plainPath);
  const roadMs = getPathMs(roadPath);
  if (plainMs <= 0 || roadMs <= 0) {
    return { ...fallback, routeTileIds: roadPath.tiles };
  }

  const travelMultiplier = Math.min(1, Math.max(0.1, roadMs / plainMs));
  const adjustedMinutes = Math.max(1, Math.ceil(baseMinutes * travelMultiplier));
  const savedMinutes = Math.max(0, baseMinutes - adjustedMinutes);

  return {
    baseMinutes,
    adjustedMinutes,
    savedMinutes,
    speedMultiplier: baseMinutes / adjustedMinutes,
    routeTileIds: roadPath.tiles,
  };
}

export async function loadRoadTravelSegments(
  db: DatabaseClient,
  cycleId: string,
): Promise<RoadTravelSegment[]> {
  return db.mapHexRoad.findMany({
    where: { cycleId },
    select: {
      tileId: true,
      level: true,
      crossings: true,
    },
  });
}

export async function getRoadAdjustedAttackArrival(args: {
  db: DatabaseClient;
  cycleId: string;
  launchedAt: Date;
  origin: MapPoint;
  target: MapPoint;
  baseMinutes: number;
  ownedTileIds?: Set<string>;
}) {
  const roadSegments = await loadRoadTravelSegments(args.db, args.cycleId);
  const travel = calculateRoadAdjustedTravel({
    origin: args.origin,
    target: args.target,
    baseMinutes: args.baseMinutes,
    roadSegments,
    ownedTileIds: args.ownedTileIds,
  });

  return {
    arrivesAt: addMinutes(args.launchedAt, travel.adjustedMinutes),
    travel,
  };
}

export async function getRoadAdjustedConvoyArrival(args: {
  db: DatabaseClient;
  cycleId: string;
  acceptedAt: Date;
  from: MapPoint;
  to: MapPoint;
}) {
  const baseMinutes = getAttackTravelMinutes(args.from, args.to);
  const { travel } = await getRoadAdjustedAttackArrival({
    db: args.db,
    cycleId: args.cycleId,
    launchedAt: args.acceptedAt,
    origin: args.from,
    target: args.to,
    baseMinutes,
  });

  return {
    arrivesAt: addMinutes(
      addHours(args.acceptedAt, CONVOY_MINIMUM_TRAVEL_HOURS),
      travel.adjustedMinutes,
    ),
    travel,
  };
}
