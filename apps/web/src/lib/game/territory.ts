import { HEX_TILES, type HexBiome, type HexTile } from "./map-hex";
import { HOME_OF_A_POINT_INCOME, HOME_OF_A_TILE_ID } from "./constants";

export type TileBonus = {
  points: number;
  food: number;
  army: number;
  defensePercent: number;
  label: string;
};

const EMPTY_BONUS: TileBonus = {
  points: 0,
  food: 0,
  army: 0,
  defensePercent: 0,
  label: "No bonus",
};

const BIOME_BONUSES: Record<HexBiome, TileBonus> = {
  water: EMPTY_BONUS,
  lake: EMPTY_BONUS,
  mountains: {
    points: 0,
    food: 0,
    army: 0,
    defensePercent: 0,
    label: "Impassable",
  },
  plains: {
    points: 1,
    food: 2,
    army: 0,
    defensePercent: 0,
    label: "+1 points, +2 food / tick",
  },
  forest: {
    points: 1,
    food: 1,
    army: 0,
    defensePercent: 1,
    label: "+1 points, +1 food, +1% defense",
  },
  hills: {
    points: 2,
    food: 0,
    army: 0,
    defensePercent: 1,
    label: "+2 points, +1% defense",
  },
  coast: {
    points: 1,
    food: 1,
    army: 0,
    defensePercent: 0,
    label: "+1 points, +1 food / tick",
  },
  marsh: {
    points: 0,
    food: 2,
    army: 1,
    defensePercent: 0,
    label: "+2 food, +1 army / tick",
  },
};

export function getTileById(tileId: string) {
  return HEX_TILES.find((tile) => tile.id === tileId) ?? null;
}

export function getTileBonus(tile: Pick<HexTile, "biome"> | null | undefined) {
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
    points: HOME_OF_A_POINT_INCOME,
    food: 0,
    army: 0,
    defensePercent: 0,
    label: `Home of A control: +${HOME_OF_A_POINT_INCOME} points / tick`,
  };
}

export function getTileClaimCost({
  tile,
  origin,
}: {
  tile: HexTile;
  origin: { mapX: number; mapY: number };
}) {
  const distance = Math.hypot(tile.xPercent - origin.mapX, tile.yPercent - origin.mapY);
  const biomePremium =
    tile.biome === "hills" || tile.biome === "forest"
      ? 8
      : tile.biome === "marsh" || tile.biome === "coast"
        ? 5
        : 0;

  return Math.max(10, Math.ceil(distance / 2) + biomePremium);
}

export function sumTileBonuses(tiles: Array<Pick<HexTile, "biome">>) {
  return tiles.reduce(
    (total, tile) => {
      const bonus = getTileBonus(tile);

      return {
        points: total.points + bonus.points,
        food: total.food + bonus.food,
        army: total.army + bonus.army,
        defensePercent: total.defensePercent + bonus.defensePercent,
      };
    },
    {
      points: 0,
      food: 0,
      army: 0,
      defensePercent: 0,
    }
  );
}
