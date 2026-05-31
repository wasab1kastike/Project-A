import { HEX_TILES, type HexBiome, type HexTile } from "./map-hex";
import { HOME_OF_A_TILE_ID } from "./constants";

export type TileBonus = {
  gold: number;
  points: number;
  food: number;
  army: number;
  population: number;
  defensePercent: number;
  label: string;
};


const EMPTY_BONUS: TileBonus = {
  gold: 0,
  points: 0,
  food: 0,
  army: 0,
  population: 0,
  defensePercent: 0,
  label: "No bonus",
};

const BIOME_BONUSES: Record<HexBiome, TileBonus> = {
  water: {
    gold: 3,
    points: 1,
    food: 6,
    army: 0,
    population: 0,
    defensePercent: 0,
    label: "+3 gold, +6 food, +1 point / tick",
  },
  lake: {
    gold: 2,
    points: 1,
    food: 2,
    army: 0,
    population: 1,
    defensePercent: 0,
    label: "+2 gold, +2 food, +1 point / tick, +1 worker pool",
  },
  mountains: {
    gold: 4,
    points: 3,
    food: 1,
    army: 0,
    population: 0,
    defensePercent: 3,
    label: "+4 gold, +1 food, +3 points / tick, +3% defense",
  },
  plains: {
    gold: 1,
    points: 1,
    food: 2,
    army: 0,
    population: 0,
    defensePercent: 0,
    label: "+1 gold, +2 food, +1 point / tick",
  },
  forest: {
    gold: 1,
    points: 2,
    food: 2,
    army: 0,
    population: 0,
    defensePercent: 1,
    label: "+1 gold, +2 food, +2 points / tick, +1% defense",
  },
  hills: {
    gold: 3,
    points: 2,
    food: 0,
    army: 0,
    population: 0,
    defensePercent: 1,
    label: "+3 gold, +2 points / tick, +1% defense",
  },
  coast: {
    gold: 2,
    points: 3,
    food: 1,
    army: 0,
    population: 0,
    defensePercent: 0,
    label: "+2 gold, +1 food, +3 points / tick",
  },
  marsh: {
    gold: 1,
    points: 1,
    food: 3,
    army: 1,
    population: 0,
    defensePercent: 0,
    label: "+1 gold, +3 food, +1 army, +1 point / tick",
  },
};



function hashString(value: string) {
  let hash = 2166136261;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}

function formatBonusLabel({
  gold,
  points,
  food,
  army,
  population,
  defensePercent,
}: Omit<TileBonus, "label">) {
  const incomeParts: string[] = [];

  if (gold > 0) {
    incomeParts.push(`+${gold} gold`);
  }

  if (food > 0) {
    incomeParts.push(`+${food} food`);
  }

  if (army > 0) {
    incomeParts.push(`+${army} army`);
  }

  if (points > 0) {
    incomeParts.push(`+${points} points`);
  }

  const effectParts = [
    incomeParts.length > 0 ? `${incomeParts.join(", ")} / tick` : null,
    population > 0 ? `+${population} worker pool` : null,
    defensePercent > 0 ? `+${defensePercent}% defense` : null,
  ].filter((part): part is string => part !== null);

  return effectParts.length > 0 ? effectParts.join(", ") : "No bonus";
}



export function getTileById(tileId: string) {
  return HEX_TILES.find((tile) => tile.id === tileId) ?? null;
}

const TILE_BY_COORDINATE = new Map(
  HEX_TILES.map((tile) => [`${tile.col}:${tile.row}`, tile] as const)
);

export function getAdjacentTileIds(tileId: string) {
  const tile = getTileById(tileId);

  if (!tile) {
    return [];
  }

  const neighborOffsets =
    tile.row % 2 === 0
      ? [
          [-1, -1],
          [0, -1],
          [-1, 0],
          [1, 0],
          [-1, 1],
          [0, 1],
        ]
      : [
          [0, -1],
          [1, -1],
          [-1, 0],
          [1, 0],
          [0, 1],
          [1, 1],
        ];

  return neighborOffsets
    .map(([colOffset, rowOffset]) =>
      TILE_BY_COORDINATE.get(`${tile.col + colOffset}:${tile.row + rowOffset}`)
    )
    .filter((neighbor): neighbor is HexTile => neighbor !== undefined)
    .map((neighbor) => neighbor.id);
}

export function isTileConnectedToFortressOrOwnedTiles({
  tileId,
  fortress,
  ownedTileIds,
}: {
  tileId: string;
  fortress: { mapX: number; mapY: number };
  ownedTileIds: Iterable<string>;
}) {
  const tile = getTileById(tileId);

  if (!tile) {
    return false;
  }

  const adjacentTileIds = new Set(getAdjacentTileIds(tileId));
  const castleTile = HEX_TILES.reduce((nearest, candidate) => {
    const candidateDistance = Math.hypot(
      candidate.xPercent - fortress.mapX,
      candidate.yPercent - fortress.mapY
    );
    const nearestDistance = Math.hypot(
      nearest.xPercent - fortress.mapX,
      nearest.yPercent - fortress.mapY
    );

    return candidateDistance < nearestDistance ? candidate : nearest;
  }, HEX_TILES[0]);

  if (castleTile && adjacentTileIds.has(castleTile.id)) {
    return true;
  }

  for (const ownedTileId of ownedTileIds) {
    if (adjacentTileIds.has(ownedTileId)) {
      return true;
    }
  }

  return false;
}

export function getTemporaryMapObjectives() {
  return [] as Array<never>;
}

export function getTileObjective(_options?: { tileId?: string; cycleId?: string | null; at?: Date | null }) {
  return null;
}

export function getTileBonus(
  tile: Pick<HexTile, "biome"> | null | undefined
) {
  if (!tile) {
    return EMPTY_BONUS;
  }

  return BIOME_BONUSES[tile.biome] ?? EMPTY_BONUS;
}

export function isHomeOfATile(tileId: string) {
  return tileId === HOME_OF_A_TILE_ID;
}

export function getHomeOfABonus(): TileBonus {
  return {
    gold: 0,
    points: 0,
    food: 0,
    army: 0,
    population: 0,
    defensePercent: 0,
    label: "Home of A daily boss: kill it for points, food, army, and a 12h buff",
  };
}

export function sumTileBonuses(
  tiles: Array<Pick<HexTile, "id" | "biome">>
) {
  return tiles.reduce(
    (total, tile) => {
      const bonus = getTileBonus(tile);

      return {
        gold: total.gold + bonus.gold,
        points: total.points + bonus.points,
        food: total.food + bonus.food,
        army: total.army + bonus.army,
        population: total.population + bonus.population,
        defensePercent: total.defensePercent + bonus.defensePercent,
      };
    },
    {
      gold: 0,
      points: 0,
      food: 0,
      army: 0,
      population: 0,
      defensePercent: 0,
    }
  );
}
