export const MAP_WORLD_WIDTH = 3810;
export const MAP_WORLD_HEIGHT = 2425;
export const HEX_RADIUS = 52;
export const HEX_WIDTH = Math.sqrt(3) * HEX_RADIUS;
export const HEX_VERTICAL_STEP = HEX_RADIUS * 1.5;

const HEX_MARGIN_X = 62;
const HEX_MARGIN_Y = 60;

export type HexBiome =
  | "water"
  | "coast"
  | "plains"
  | "forest"
  | "hills"
  | "mountains"
  | "marsh"
  | "lake";

export type HexTile = {
  id: string;
  col: number;
  row: number;
  x: number;
  y: number;
  xPercent: number;
  yPercent: number;
  biome: HexBiome;
  spawnable: boolean;
  claimable: boolean;
};

export type MapPoint = {
  x: number;
  y: number;
};

function roundPercent(value: number) {
  return Math.round(value * 100) / 100;
}

function hashTile(col: number, row: number) {
  let value = (col + 1) * 374761393 + (row + 1) * 668265263;
  value = (value ^ (value >>> 13)) * 1274126177;
  return ((value ^ (value >>> 16)) >>> 0) / 4294967295;
}

function getDistancePercent(
  x: number,
  y: number,
  centerX: number,
  centerY: number,
) {
  return Math.hypot(x - centerX, y - centerY);
}

function classifyBiome(col: number, row: number, xPercent: number, yPercent: number) {
  const noise = hashTile(col, row);
  const northLake = getDistancePercent(xPercent, yPercent, 16, 16);
  const centralLake = getDistancePercent(xPercent, yPercent, 57, 43);
  const southLake = getDistancePercent(xPercent, yPercent, 22, 84);
  const westRiver = Math.abs(yPercent - (10 + xPercent * 0.74 + Math.sin(col * 0.7) * 3));
  const eastRiver = Math.abs(yPercent - (94 - xPercent * 0.58 + Math.sin(row * 0.9) * 4));

  if (xPercent > 89 || (xPercent > 84 && yPercent > 58)) {
    return "water";
  }

  if (northLake < 8 || centralLake < 6.6 || southLake < 7.5) {
    return "lake";
  }

  if (westRiver < 2.8 || eastRiver < 2.4) {
    return "coast";
  }

  if (xPercent > 81 || (xPercent > 76 && yPercent > 62)) {
    return "coast";
  }

  if (yPercent < 17 && xPercent > 30 && xPercent < 74) {
    return noise > 0.45 ? "mountains" : "hills";
  }

  if (yPercent < 30 && xPercent > 48 && xPercent < 80) {
    return noise > 0.36 ? "forest" : "hills";
  }

  if (xPercent < 24 && yPercent > 30 && yPercent < 66) {
    return noise > 0.22 ? "forest" : "plains";
  }

  if (xPercent > 34 && xPercent < 64 && yPercent > 68) {
    return noise > 0.32 ? "forest" : "marsh";
  }

  if (xPercent > 62 && yPercent > 48 && yPercent < 78) {
    return noise > 0.46 ? "hills" : "plains";
  }

  if (yPercent > 76 && noise > 0.52) {
    return "marsh";
  }

  if (noise > 0.86) {
    return "hills";
  }

  if (noise > 0.68) {
    return "forest";
  }

  return "plains";
}

export function getHexPolygonPoints(x: number, y: number, radius = HEX_RADIUS) {
  return Array.from({ length: 6 }, (_, index) => {
    const angle = ((60 * index - 90) * Math.PI) / 180;
    return `${roundPercent(x + radius * Math.cos(angle))},${roundPercent(
      y + radius * Math.sin(angle),
    )}`;
  }).join(" ");
}

export function generateHexTiles() {
  const tiles: HexTile[] = [];
  let row = 0;

  for (
    let y = HEX_MARGIN_Y;
    y <= MAP_WORLD_HEIGHT - HEX_MARGIN_Y;
    y += HEX_VERTICAL_STEP
  ) {
    const rowOffset = row % 2 === 0 ? 0 : HEX_WIDTH / 2;
    let col = 0;

    for (
      let x = HEX_MARGIN_X + rowOffset;
      x <= MAP_WORLD_WIDTH - HEX_MARGIN_X;
      x += HEX_WIDTH
    ) {
      const xPercent = roundPercent((x / MAP_WORLD_WIDTH) * 100);
      const yPercent = roundPercent((y / MAP_WORLD_HEIGHT) * 100);
      const biome = classifyBiome(col, row, xPercent, yPercent);

      tiles.push({
        id: `${col}:${row}`,
        col,
        row,
        x,
        y,
        xPercent,
        yPercent,
        biome,
        spawnable: biome !== "water" && biome !== "lake" && biome !== "mountains",
        claimable: true,
      });

      col += 1;
    }

    row += 1;
  }

  return tiles;
}

export const HEX_TILES = generateHexTiles();
export const HEX_SPAWN_TILES = HEX_TILES.filter((tile) => tile.spawnable);

function toWorldPoint(point: MapPoint) {
  return {
    x: (point.x / 100) * MAP_WORLD_WIDTH,
    y: (point.y / 100) * MAP_WORLD_HEIGHT,
  };
}

function getNearestTile(point: MapPoint, tiles: readonly HexTile[]) {
  const worldPoint = toWorldPoint(point);
  let nearest = tiles[0];
  let nearestDistance = Number.POSITIVE_INFINITY;

  for (const tile of tiles) {
    const distance = Math.hypot(tile.x - worldPoint.x, tile.y - worldPoint.y);

    if (distance < nearestDistance) {
      nearest = tile;
      nearestDistance = distance;
    }
  }

  return nearest;
}

export function snapMapPointToHex(point: MapPoint) {
  const tile = getNearestTile(point, HEX_SPAWN_TILES);

  return {
    x: tile.xPercent,
    y: tile.yPercent,
    tile,
  };
}

export function isPointNearSpawnHex(point: MapPoint, maxDistancePx = HEX_RADIUS * 0.55) {
  const tile = getNearestTile(point, HEX_SPAWN_TILES);
  const worldPoint = toWorldPoint(point);

  return Math.hypot(tile.x - worldPoint.x, tile.y - worldPoint.y) <= maxDistancePx;
}

export function getStrategicSpawnPositions(count: number) {
  if (count <= 0) {
    return [];
  }

  const columns = Math.ceil(Math.sqrt(count * 1.2));
  const rows = Math.ceil(count / columns);
  const preferredTargets: MapPoint[] = [];

  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < columns; col += 1) {
      preferredTargets.push({
        x: roundPercent(7 + ((col + 0.5) / columns) * 86),
        y: roundPercent(7 + ((row + 0.5) / rows) * 86),
      });
    }
  }
  const chosen: HexTile[] = [];

  for (const target of preferredTargets) {
    const candidates = HEX_SPAWN_TILES
      .filter((tile) => !chosen.includes(tile))
      .map((tile) => ({
        tile,
        targetDistance: Math.hypot(
          tile.xPercent - target.x,
          tile.yPercent - target.y,
        ),
        chosenDistance:
          chosen.length === 0
            ? Number.POSITIVE_INFINITY
            : Math.min(
                ...chosen.map((selected) =>
                  Math.hypot(tile.xPercent - selected.xPercent, tile.yPercent - selected.yPercent),
                ),
              ),
      }))
      .sort((left, right) => {
        if (left.targetDistance !== right.targetDistance) {
          return left.targetDistance - right.targetDistance;
        }

        return right.chosenDistance - left.chosenDistance;
      });

    const best =
      candidates.find((candidate) => candidate.chosenDistance >= 9.5)?.tile ??
      candidates[0]?.tile;

    if (best) {
      chosen.push(best);
    }

    if (chosen.length === count) {
      break;
    }
  }

  return chosen.slice(0, count).map((tile) => ({
    x: Math.round(tile.xPercent),
    y: Math.round(tile.yPercent),
  }));
}
