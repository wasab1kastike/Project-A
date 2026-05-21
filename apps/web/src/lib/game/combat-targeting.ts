export function getTileAttackBlockedReason({
  tile,
  tileId,
  ownerFortressId,
  attackerFortress,
  ownedTileIds,
  hasActiveBattle = false,
  isHomeOfA,
  isConnected,
}: {
  tile: { claimable: boolean } | null | undefined;
  tileId: string;
  ownerFortressId?: string | null;
  attackerFortress: { id: string } | null | undefined;
  ownedTileIds: Iterable<string>;
  hasActiveBattle?: boolean;
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

  if (
    !isConnected({
      tileId,
      ownedTileIds,
    })
  ) {
    return "You can only attack active border tiles.";
  }

  return null;
}

export function canAttackTile(
  input: Parameters<typeof getTileAttackBlockedReason>[0]
) {
  return getTileAttackBlockedReason(input) === null;
}
