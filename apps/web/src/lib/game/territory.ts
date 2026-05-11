import { HEX_TILES, type HexBiome, type HexTile } from "./map-hex";
import {
  HOME_OF_A_ARMY_DRAIN_PER_TICK,
  HOME_OF_A_POINT_INCOME,
  HOME_OF_A_TILE_ID,
  TEMPORARY_MAP_OBJECTIVE_INTERVAL_HOURS,
  TEMPORARY_MAP_OBJECTIVE_POINT_VALUES,
} from "./constants";
export { TEMPORARY_MAP_OBJECTIVE_INTERVAL_HOURS } from "./constants";

export type TileBonus = {
  gold: number;
  points: number;
  food: number;
  army: number;
  defensePercent: number;
  label: string;
};

export type TemporaryMapObjective = {
  slot: number;
  tileId: string;
  name: string;
  points: number;
  activeFrom: Date;
  activeUntil: Date;
  label: string;
};

export const TILE_CLAIM_DURATION_MINUTES = 10;
export const TILE_CLAIM_SEA_DURATION_MINUTES = 25;
export const TILE_CLAIM_MOUNTAINS_DURATION_MINUTES = 20;
export const TILE_CLAIM_MAX_ACTIVE_PROJECTS = 1;

export function getTileClaimDurationMinutes(biome: HexBiome): number {
  if (biome === "water") return TILE_CLAIM_SEA_DURATION_MINUTES;
  if (biome === "mountains") return TILE_CLAIM_MOUNTAINS_DURATION_MINUTES;
  return TILE_CLAIM_DURATION_MINUTES;
}
export const TILE_CLAIM_OWNED_TILE_COST_STEP = 10;

const EMPTY_BONUS: TileBonus = {
  gold: 0,
  points: 0,
  food: 0,
  army: 0,
  defensePercent: 0,
  label: "No bonus",
};

const BIOME_BONUSES: Record<HexBiome, TileBonus> = {
  water: {
    gold: 3,
    points: 0,
    food: 6,
    army: 0,
    defensePercent: 0,
    label: "+3 gold, +6 food / tick",
  },
  lake: EMPTY_BONUS,
  mountains: {
    gold: 4,
    points: 0,
    food: 1,
    army: 0,
    defensePercent: 3,
    label: "+4 gold, +1 food / tick, +3% defense",
  },
  plains: {
    gold: 1,
    points: 0,
    food: 2,
    army: 0,
    defensePercent: 0,
    label: "+1 gold, +2 food / tick",
  },
  forest: {
    gold: 1,
    points: 0,
    food: 2,
    army: 0,
    defensePercent: 1,
    label: "+1 gold, +2 food / tick, +1% defense",
  },
  hills: {
    gold: 3,
    points: 0,
    food: 0,
    army: 0,
    defensePercent: 1,
    label: "+3 gold / tick, +1% defense",
  },
  coast: {
    gold: 2,
    points: 0,
    food: 1,
    army: 0,
    defensePercent: 0,
    label: "+2 gold, +1 food / tick",
  },
  marsh: {
    gold: 1,
    points: 0,
    food: 3,
    army: 1,
    defensePercent: 0,
    label: "+1 gold, +3 food, +1 army / tick",
  },
};

const TEMPORARY_MAP_OBJECTIVE_NAMES = [
  "Supply Depot",
  "Trade Route",
  "Ancient Shrine",
] as const;

const OBJECTIVE_CANDIDATE_TILES = HEX_TILES.filter(
  (tile) => tile.spawnable && !isHomeOfATile(tile.id)
);

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
    defensePercent > 0 ? `+${defensePercent}% defense` : null,
  ].filter((part): part is string => part !== null);

  return effectParts.length > 0 ? effectParts.join(", ") : "No bonus";
}

function combineTileBonuses(base: TileBonus, extra: Omit<TileBonus, "label">): TileBonus {
  const combined = {
    gold: base.gold + extra.gold,
    points: base.points + extra.points,
    food: base.food + extra.food,
    army: base.army + extra.army,
    defensePercent: base.defensePercent + extra.defensePercent,
  };

  return {
    ...combined,
    label: formatBonusLabel(combined),
  };
}

function getObjectiveWindowStart(at: Date) {
  const intervalMs = TEMPORARY_MAP_OBJECTIVE_INTERVAL_HOURS * 60 * 60 * 1000;
  const bucket = Math.floor(at.getTime() / intervalMs);

  return new Date(bucket * intervalMs);
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

export function getTemporaryMapObjectives({
  cycleId,
  at,
}: {
  cycleId: string;
  at: Date;
}) {
  const activeFrom = getObjectiveWindowStart(at);
  const activeUntil = new Date(
    activeFrom.getTime() +
      TEMPORARY_MAP_OBJECTIVE_INTERVAL_HOURS * 60 * 60 * 1000
  );
  const objectiveWindowKey = activeFrom.toISOString();
  const remainingTiles = [...OBJECTIVE_CANDIDATE_TILES];

  return TEMPORARY_MAP_OBJECTIVE_POINT_VALUES.map((points, slot) => {
    let bestIndex = 0;
    let bestScore = -1;

    for (let index = 0; index < remainingTiles.length; index += 1) {
      const score = hashString(
        `${cycleId}:${objectiveWindowKey}:${slot}:${remainingTiles[index].id}`
      );

      if (score > bestScore) {
        bestScore = score;
        bestIndex = index;
      }
    }

    const [tile] = remainingTiles.splice(bestIndex, 1);
    const name =
      TEMPORARY_MAP_OBJECTIVE_NAMES[
        slot % TEMPORARY_MAP_OBJECTIVE_NAMES.length
      ];

    return {
      slot,
      tileId: tile.id,
      name,
      points,
      activeFrom,
      activeUntil,
      label: `${name}: +${points} points / tick while held`,
    } satisfies TemporaryMapObjective;
  });
}

export function getTileObjective({
  tileId,
  cycleId,
  at,
}: {
  tileId: string;
  cycleId?: string | null;
  at?: Date | null;
}) {
  if (!cycleId || !at || isHomeOfATile(tileId)) {
    return null;
  }

  return (
    getTemporaryMapObjectives({
      cycleId,
      at,
    }).find((objective) => objective.tileId === tileId) ?? null
  );
}

export function getTileBonus(
  tile: Pick<HexTile, "biome"> | null | undefined,
  options?: {
    tileId?: string;
    cycleId?: string | null;
    at?: Date | null;
  }
) {
  if (!tile) {
    return EMPTY_BONUS;
  }

  const baseBonus = BIOME_BONUSES[tile.biome] ?? EMPTY_BONUS;
  const objective = options?.tileId
    ? getTileObjective({
        tileId: options.tileId,
        cycleId: options.cycleId,
        at: options.at,
      })
    : null;

  if (!objective) {
    return baseBonus;
  }

  const combined = combineTileBonuses(baseBonus, {
    gold: 0,
    points: objective.points,
    food: 0,
    army: 0,
    defensePercent: 0,
  });

  return {
    ...combined,
    label: `${combined.label}. ${objective.label}`,
  };
}

export function isHomeOfATile(tileId: string) {
  return tileId === HOME_OF_A_TILE_ID;
}

export function getHomeOfABonus(): TileBonus {
  return {
    gold: 0,
    points: HOME_OF_A_POINT_INCOME,
    food: 0,
    army: 0,
    defensePercent: 0,
    label: `Home of A control: +${HOME_OF_A_POINT_INCOME} points / tick, -${HOME_OF_A_ARMY_DRAIN_PER_TICK} army / tick for each holder`,
  };
}

export function getTileClaimCost({
  tile,
  origin,
  race = null,
  ownedTileCount = 0,
  pendingClaimCount = 0,
}: {
  tile: HexTile;
  origin: { mapX: number; mapY: number };
  race?: "DWARFS" | "UNSTABLE_UNICORNS" | "ORKS" | "SPACE_MURINES" | null;
  ownedTileCount?: number;
  pendingClaimCount?: number;
}) {
  const distance = Math.hypot(tile.xPercent - origin.mapX, tile.yPercent - origin.mapY);
  const baseBiomePremium =
    tile.biome === "hills" || tile.biome === "forest"
      ? 12
      : tile.biome === "water"
        ? 18
        : tile.biome === "mountains"
          ? 16
      : tile.biome === "marsh" || tile.biome === "coast"
        ? 8
        : 0;
  const raceDiscount = tile.biome === "mountains" && race === "DWARFS" ? 10 : 0;
  const biomePremium = Math.max(0, baseBiomePremium - raceDiscount);
  const sizeSurcharge =
    (ownedTileCount + pendingClaimCount) * TILE_CLAIM_OWNED_TILE_COST_STEP;

  return 25 + Math.ceil(distance * 0.75) + biomePremium + sizeSurcharge;
}

export function sumTileBonuses(
  tiles: Array<Pick<HexTile, "id" | "biome">>,
  options?: {
    cycleId?: string | null;
    at?: Date | null;
  }
) {
  return tiles.reduce(
    (total, tile) => {
      const bonus = getTileBonus(tile, {
        tileId: tile.id,
        cycleId: options?.cycleId,
        at: options?.at,
      });

      return {
        gold: total.gold + bonus.gold,
        points: total.points + bonus.points,
        food: total.food + bonus.food,
        army: total.army + bonus.army,
        defensePercent: total.defensePercent + bonus.defensePercent,
      };
    },
    {
      gold: 0,
      points: 0,
      food: 0,
      army: 0,
      defensePercent: 0,
    }
  );
}
