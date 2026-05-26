import { DiplomacyRelationStatus, FortressKind } from "@/lib/prisma-client";
import { isHomeOfATile, getTileById, getAdjacentTileIds } from "./territory";
import {
  getTileObjective,
  isTileConnectedToFortressOrOwnedTiles,
} from "./territory";
import { HEX_TILES, type HexTile } from "./map-hex";

export type DeedValidationResult =
  | { ok: true }
  | { ok: false; reason: string };

export function validateTileDeedAllowed({
  tileId,
  senderFortressId,
  receiverFortressId,
  senderOwnedTileIds,
  receiverOwnedTileIds,
  allianceStatus,
  activeBattleTileIds,
  activeCampaignTileIds,
  reservedDeedTileIds,
  cycleId,
  now,
}: {
  tileId: string;
  senderFortressId: string;
  receiverFortressId: string;
  senderOwnedTileIds: string[];
  receiverOwnedTileIds: string[];
  allianceStatus: DiplomacyRelationStatus | null;
  activeBattleTileIds: Set<string>;
  activeCampaignTileIds: Set<string>;
  reservedDeedTileIds: Set<string>;
  cycleId?: string | null;
  now: Date;
}): DeedValidationResult {
  const tile = getTileById(tileId);

  if (!tile) {
    return { ok: false, reason: "That tile does not exist on the map." };
  }

  if (isHomeOfATile(tileId)) {
    return { ok: false, reason: "The center monument cannot be transferred." };
  }

  if (allianceStatus !== DiplomacyRelationStatus.ALLIED) {
    return { ok: false, reason: "Tile deeds require an active alliance." };
  }

  if (!senderOwnedTileIds.includes(tileId)) {
    return { ok: false, reason: "You do not own that tile." };
  }

  if (activeBattleTileIds.has(tileId)) {
    return { ok: false, reason: "That tile is in an active battle." };
  }

  if (activeCampaignTileIds.has(tileId)) {
    return { ok: false, reason: "That tile is under an active campaign." };
  }

  if (reservedDeedTileIds.has(tileId)) {
    return { ok: false, reason: "That tile is already reserved in another deed." };
  }

  const objective = getTileObjective({
    tileId,
    cycleId,
    at: now,
  });

  if (objective) {
    return {
      ok: false,
      reason: `That tile is an active ${objective.name} objective and cannot be transferred.`,
    };
  }

  const senderFortress = {
    mapX: tile.xPercent,
    mapY: tile.yPercent,
  };
  const senderTileIds = senderOwnedTileIds.filter(
    (id) => id !== tileId
  );

  if (!isTileTransferConnected({
    tileId,
    senderOwnedTileIds: senderTileIds,
    receiverOwnedTileIds,
    senderFortress,
  })) {
    return {
      ok: false,
      reason:
        "That transfer would disconnect one of the territory networks.",
    };
  }

  return { ok: true };
}

export function isTileTransferConnected({
  tileId,
  senderOwnedTileIds,
  receiverOwnedTileIds,
  senderFortress,
}: {
  tileId: string;
  senderOwnedTileIds: string[];
  receiverOwnedTileIds: string[];
  senderFortress: { mapX: number; mapY: number };
}): boolean {
  const receiverConnected = isTileConnectedToFortressOrOwnedTiles({
    tileId,
    fortress: senderFortress,
    ownedTileIds: receiverOwnedTileIds,
  });

  if (!receiverConnected) {
    return false;
  }

  if (senderOwnedTileIds.length === 0) {
    return true;
  }

  return isOwnerNetworkStillConnected({
    ownedTileIds: senderOwnedTileIds,
    removedTileId: tileId,
    fortress: senderFortress,
  });
}

function isOwnerNetworkStillConnected({
  ownedTileIds,
  removedTileId,
  fortress,
}: {
  ownedTileIds: string[];
  removedTileId: string;
  fortress: { mapX: number; mapY: number };
}): boolean {
  const remainingIds = ownedTileIds.filter((id) => id !== removedTileId);

  if (remainingIds.length === 0) {
    return true;
  }

  const remainingSet = new Set(remainingIds);
  const castleTile = findCastleTile(fortress);

  if (!castleTile || !remainingSet.has(castleTile.id)) {
    return false;
  }

  const visited = new Set<string>();
  const queue: string[] = [castleTile.id];
  visited.add(castleTile.id);

  while (queue.length > 0) {
    const current = queue.shift()!;

    for (const neighborId of getAdjacentTileIds(current)) {
      if (!remainingSet.has(neighborId) || visited.has(neighborId)) {
        continue;
      }

      visited.add(neighborId);
      queue.push(neighborId);
    }
  }

  return visited.size === remainingSet.size;
}

function findCastleTile(fortress: { mapX: number; mapY: number }) {
  return HEX_TILES.reduce((nearest: HexTile | null, candidate: HexTile) => {
    const candidateDistance = Math.hypot(
      candidate.xPercent - fortress.mapX,
      candidate.yPercent - fortress.mapY
    );

    if (!nearest) {
      return candidate;
    }

    const nearestDistance = Math.hypot(
      nearest.xPercent - fortress.mapX,
      nearest.yPercent - fortress.mapY
    );

    return candidateDistance < nearestDistance ? candidate : nearest;
  }, null as HexTile | null);
}

export function hasActiveDeedForTile({
  convoyLegs,
  tileId,
  now,
}: {
  convoyLegs: Array<{
    status: string;
    deedTileId: string | null;
    arrivesAt: Date;
    settledAt: Date | null;
  }>;
  tileId: string;
  now: Date;
}): boolean {
  return convoyLegs.some(
    (leg) =>
      leg.deedTileId === tileId &&
      leg.settledAt === null &&
      leg.arrivesAt > now
  );
}
