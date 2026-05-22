import {
  getDiplomacyAttackBlockedReason,
  type DiplomacyRelationLike,
} from "./politics";

export function getTileAttackBlockedReason({
  tile,
  tileId,
  ownerFortressId,
  attackerFortress,
  ownedTileIds,
  hasActiveBattle = false,
  diplomacyRelation = null,
  now,
  isHomeOfA,
  isConnected,
}: {
  tile: { claimable: boolean } | null | undefined;
  tileId: string;
  ownerFortressId?: string | null;
  attackerFortress: { id: string } | null | undefined;
  ownedTileIds: Iterable<string>;
  hasActiveBattle?: boolean;
  diplomacyRelation?: DiplomacyRelationLike | null;
  now?: Date;
  isHomeOfA: (tileId: string) => boolean;
  isConnected: (input: { tileId: string; ownedTileIds: Iterable<string> }) => boolean;
}) {
  if (!attackerFortress) {
    return "Join the cycle to attack tiles.";
  }

  if (!tile || !tile.claimable) {
    return "That map tile cannot be attacked.";
  }

  if (isHomeOfA(tileId)) {
    return null;
  }

  if (!ownerFortressId) {
    return "Neutral tiles cannot be attacked.";
  }

  if (ownerFortressId === attackerFortress.id) {
    return "Your banner already controls this tile.";
  }

  if (hasActiveBattle) {
    return "This tile is already contested.";
  }

  const isBorderTarget = isConnected({
    tileId,
    ownedTileIds,
  });

  if (now) {
    return getDiplomacyAttackBlockedReason({
      relation: diplomacyRelation,
      now,
      isHomeOfA: isHomeOfA(tileId),
      isBorderTarget,
    });
  }

  if (!isBorderTarget) {
    return "You can only attack active border tiles.";
  }

  return null;
}

export function canAttackTile(
  input: Parameters<typeof getTileAttackBlockedReason>[0]
) {
  return getTileAttackBlockedReason(input) === null;
}
