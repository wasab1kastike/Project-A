import { SeasonFiveMapRole, SeasonFiveMapTerrain } from "@/lib/prisma-client";
import { addHours } from "./time";

export const SEASON_FIVE_MAP_COLUMNS = 16;
export const SEASON_FIVE_MAP_ROWS = 10;
export const SEASON_FIVE_DAILY_SPECIAL_COUNT = 3;
export const SEASON_FIVE_SECRET_LAKE_KEY = "moon-rusted-key";

export type SeasonFiveTileTemplate = {
  key: string;
  row: number;
  col: number;
  xPercent: number;
  yPercent: number;
  terrain: SeasonFiveMapTerrain;
  visualVariant: number;
  role: SeasonFiveMapRole;
  roleLabel: string | null;
  hidden: boolean;
  requiredKey: string | null;
  roleSeedKey: string | null;
  expiresAt: Date | null;
};

export type SeasonFiveMapTileSnapshot = SeasonFiveTileTemplate & {
  id?: string;
  discoveredAt?: Date | null;
};

const TERRAIN_GRID = [
  "MMFFFFFFSSHHHCCC",
  "MFFFFFFFSSSHHCCC",
  "FFWWFFRRSSSLLCCC",
  "FFWWFFRRGGLLLLCC",
  "FFFFFRRRGGGGLLCC",
  "FFHHHRRRGGGGSSCC",
  "FHHHGGGRRRSSSSCC",
  "WWHHGGGGRRSSCCCC",
  "WWWGGGGGFRRCCCCC",
  "WWWWGGGFFFFCCCCC",
] as const;

const TERRAIN_BY_CODE: Record<string, SeasonFiveMapTerrain> = {
  C: SeasonFiveMapTerrain.COAST,
  F: SeasonFiveMapTerrain.FOREST,
  G: SeasonFiveMapTerrain.GRASS,
  H: SeasonFiveMapTerrain.HILL,
  L: SeasonFiveMapTerrain.WATER,
  M: SeasonFiveMapTerrain.MOUNTAIN,
  R: SeasonFiveMapTerrain.ROAD,
  S: SeasonFiveMapTerrain.SWAMP,
  W: SeasonFiveMapTerrain.WATER,
};

const LOCATION_TILE_KEYS = {
  home: "t-5-7",
  "mossglass-lake": "t-3-3",
  "old-pier": "t-4-11",
  "blackwake-sea": "t-7-13",
  "moon-depths": "t-8-2",
} as const;

const STATIC_ROLES: Record<
  string,
  { role: SeasonFiveMapRole; roleLabel: string }
> = {
  [LOCATION_TILE_KEYS.home]: {
    role: SeasonFiveMapRole.HOME,
    roleLabel: "Home Base",
  },
  [LOCATION_TILE_KEYS["mossglass-lake"]]: {
    role: SeasonFiveMapRole.FISHING_SPOT,
    roleLabel: "Mossglass Lake",
  },
  [LOCATION_TILE_KEYS["old-pier"]]: {
    role: SeasonFiveMapRole.FISHING_SPOT,
    roleLabel: "Old Pier",
  },
  [LOCATION_TILE_KEYS["blackwake-sea"]]: {
    role: SeasonFiveMapRole.FISHING_SPOT,
    roleLabel: "Blackwake Sea",
  },
  [LOCATION_TILE_KEYS["moon-depths"]]: {
    role: SeasonFiveMapRole.FISHING_SPOT,
    roleLabel: "Moon Depths",
  },
};

const SPECIAL_ROLE_SEQUENCE = [
  SeasonFiveMapRole.SHOP,
  SeasonFiveMapRole.EVENT,
  SeasonFiveMapRole.SECRET_LAKE,
] as const;

function hashString(input: string) {
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function seededIndex(seed: string, modulo: number) {
  if (modulo <= 0) return 0;
  return hashString(seed) % modulo;
}

function getHelsinkiDateParts(date: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Helsinki",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const byType = Object.fromEntries(
    parts.map((part) => [part.type, part.value])
  );
  return {
    year: Number(byType.year),
    month: Number(byType.month),
    day: Number(byType.day),
  };
}

export function getSeasonFiveDailyRotationKey(date: Date) {
  const { year, month, day } = getHelsinkiDateParts(date);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(
    2,
    "0"
  )}`;
}

export function getSeasonFiveDailyRotationExpiresAt(date: Date) {
  return addHours(date, 24);
}

export function getSeasonFiveLocationTileKey(locationKey: string) {
  return (
    LOCATION_TILE_KEYS[locationKey as keyof typeof LOCATION_TILE_KEYS] ?? null
  );
}

export function createSeasonFiveMapTiles() {
  const tiles: SeasonFiveTileTemplate[] = [];

  for (let row = 0; row < SEASON_FIVE_MAP_ROWS; row += 1) {
    const terrainRow = TERRAIN_GRID[row] ?? "";
    for (let col = 0; col < SEASON_FIVE_MAP_COLUMNS; col += 1) {
      const key = `t-${row}-${col}`;
      const staticRole = STATIC_ROLES[key];
      const terrain =
        TERRAIN_BY_CODE[terrainRow[col] ?? "G"] ?? SeasonFiveMapTerrain.GRASS;

      tiles.push({
        key,
        row,
        col,
        xPercent:
          Math.round(((col + 0.5) / SEASON_FIVE_MAP_COLUMNS) * 1000) / 10,
        yPercent: Math.round(((row + 0.5) / SEASON_FIVE_MAP_ROWS) * 1000) / 10,
        terrain,
        visualVariant: hashString(`${row}:${col}:${terrain}`) % 4,
        role: staticRole?.role ?? SeasonFiveMapRole.NONE,
        roleLabel: staticRole?.roleLabel ?? null,
        hidden: false,
        requiredKey: null,
        roleSeedKey: null,
        expiresAt: null,
      });
    }
  }

  return tiles;
}

function isSpecialEligible(tile: SeasonFiveMapTileSnapshot) {
  return (
    tile.role === SeasonFiveMapRole.NONE &&
    tile.terrain !== SeasonFiveMapTerrain.MOUNTAIN &&
    tile.terrain !== SeasonFiveMapTerrain.WATER
  );
}

function getSpecialLabel(role: SeasonFiveMapRole) {
  if (role === SeasonFiveMapRole.SHOP) return "Travelling Shop";
  if (role === SeasonFiveMapRole.EVENT) return "Campfire Event";
  if (role === SeasonFiveMapRole.SECRET_LAKE) return "Secret Lake";
  return null;
}

export function planSeasonFiveDailySpecialTiles({
  tiles,
  now,
  rotationKey = getSeasonFiveDailyRotationKey(now),
}: {
  tiles: SeasonFiveMapTileSnapshot[];
  now: Date;
  rotationKey?: string;
}) {
  const candidates = tiles.filter(isSpecialEligible);
  const planned: Array<{
    tileKey: string;
    role: SeasonFiveMapRole;
    roleLabel: string;
    hidden: boolean;
    requiredKey: string | null;
    roleSeedKey: string;
    expiresAt: Date;
  }> = [];

  for (
    let index = 0;
    index < SPECIAL_ROLE_SEQUENCE.length && candidates.length > 0;
    index += 1
  ) {
    const role = SPECIAL_ROLE_SEQUENCE[index];
    const candidateIndex = seededIndex(
      `${rotationKey}:${role}`,
      candidates.length
    );
    const [tile] = candidates.splice(candidateIndex, 1);
    if (!tile) continue;

    planned.push({
      tileKey: tile.key,
      role,
      roleLabel: getSpecialLabel(role) ?? "Map Event",
      hidden: role === SeasonFiveMapRole.SECRET_LAKE,
      requiredKey:
        role === SeasonFiveMapRole.SECRET_LAKE
          ? SEASON_FIVE_SECRET_LAKE_KEY
          : null,
      roleSeedKey: rotationKey,
      expiresAt: getSeasonFiveDailyRotationExpiresAt(now),
    });
  }

  return planned;
}

export function rollSeasonFiveGlobalDiscovery({
  seed,
  luk,
  hiddenTiles,
}: {
  seed: string;
  luk: number;
  hiddenTiles: Array<{ key: string }>;
}) {
  if (hiddenTiles.length === 0) return null;

  const chancePercent = Math.min(45, Math.max(0, 3 + luk * 3));
  const roll = hashString(seed) % 100;
  if (roll >= chancePercent) {
    return null;
  }

  const tileIndex = seededIndex(`${seed}:tile`, hiddenTiles.length);
  return hiddenTiles[tileIndex]?.key ?? null;
}

export function calculateSeasonFiveRoutePreview(input: {
  from: { row: number; col: number };
  to: { row: number; col: number };
  baseMinutes: number;
  travelPercent: number;
}) {
  const distance =
    Math.abs(input.from.row - input.to.row) +
    Math.abs(input.from.col - input.to.col);
  const distanceMinutes = Math.max(0, distance - 1);
  const base = Math.max(1, input.baseMinutes + distanceMinutes);
  const adjusted = Math.max(
    1,
    Math.round(base * (1 + input.travelPercent / 100))
  );

  return {
    distance,
    travelMinutes: adjusted,
  };
}
