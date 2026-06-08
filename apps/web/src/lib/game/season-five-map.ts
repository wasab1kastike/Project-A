import {
  SeasonFiveLocationKind,
  SeasonFiveMapRole,
  SeasonFiveMapTerrain,
} from "@/lib/prisma-client";
import { HEX_TILES, type HexBiome } from "./map-hex";
import { addHours, addMinutes } from "./time";

export const SEASON_FIVE_MAP_COLUMNS =
  Math.max(...HEX_TILES.map((tile) => tile.col)) + 1;
export const SEASON_FIVE_MAP_ROWS =
  Math.max(...HEX_TILES.map((tile) => tile.row)) + 1;
export const SEASON_FIVE_DAILY_SPECIAL_COUNT = 4;
export const SEASON_FIVE_SECRET_LAKE_KEY = "moon-rusted-key";
export const SEASON_FIVE_WATER_BODY_REVEAL_HOURS = 6;

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

export type SeasonFiveWaterBodyProfileKey =
  | "coast"
  | "lake"
  | "deep"
  | "lava_lake"
  | "void_lake";

export type SeasonFiveWaterBodyProfile = {
  key: SeasonFiveWaterBodyProfileKey;
  label: string;
  kind: SeasonFiveLocationKind;
  baseTravelMinutes: number;
  maxStock: number;
  regenPerHour: number;
  levelRequired: number;
  requiredGearKey: string | null;
  catchDifficulty: number;
  minWeightGrams: number;
  maxWeightGrams: number;
  inventoryPressure: number;
  stockLabels: {
    rich: string;
    steady: string;
    low: string;
    empty: string;
  };
  notableFish: string;
};

export type SeasonFiveWaterBodyPlan = {
  key: string;
  name: string;
  profileKey: SeasonFiveWaterBodyProfileKey;
  profile: SeasonFiveWaterBodyProfile;
  tileKeys: string[];
  hidden: boolean;
};

export type SeasonFiveFishingLocationPlan = {
  key: string;
  name: string;
  kind: SeasonFiveLocationKind;
  tileKey: string;
  waterBodyKey: string;
  travelMinutes: number;
  catchDifficulty: number;
  minWeightGrams: number;
  maxWeightGrams: number;
  inventoryPressure: number;
};

const TERRAIN_BY_BIOME: Record<HexBiome, SeasonFiveMapTerrain> = {
  coast: SeasonFiveMapTerrain.COAST,
  forest: SeasonFiveMapTerrain.FOREST,
  hills: SeasonFiveMapTerrain.HILL,
  lake: SeasonFiveMapTerrain.WATER,
  marsh: SeasonFiveMapTerrain.SWAMP,
  mountains: SeasonFiveMapTerrain.MOUNTAIN,
  plains: SeasonFiveMapTerrain.GRASS,
  water: SeasonFiveMapTerrain.WATER,
};

const LOCATION_TILE_KEYS = {
  home: "t-16-20",
  "mossglass-lake": "t-4-6",
  "old-pier": "t-13-23",
  "blackwake-sea": "t-20-38",
  "moon-depths": "t-25-8",
} as const;

const LOCATION_KEY_BY_TILE_KEY = Object.fromEntries(
  Object.entries(LOCATION_TILE_KEYS).map(([locationKey, tileKey]) => [
    tileKey,
    locationKey,
  ])
) as Record<string, string | undefined>;

const STATIC_LOCATION_NAMES: Record<string, string> = {
  home: "Home Base",
  "mossglass-lake": "Mossglass Lake",
  "old-pier": "Old Pier",
  "blackwake-sea": "Blackwake Sea",
  "moon-depths": "Moon Depths",
};

export const SEASON_FIVE_WATER_BODY_PROFILES = {
  coast: {
    key: "coast",
    label: "Coastal Water",
    kind: SeasonFiveLocationKind.SEA,
    baseTravelMinutes: 6,
    maxStock: 90,
    regenPerHour: 22,
    levelRequired: 1,
    requiredGearKey: null,
    catchDifficulty: 1,
    minWeightGrams: 200,
    maxWeightGrams: 4500,
    inventoryPressure: 1,
    stockLabels: {
      rich: "Surf is crowded",
      steady: "Surf is moving",
      low: "Surf is thinning",
      empty: "Surf is exhausted",
    },
    notableFish: "snoutlets, crabfish, and smug slime-whiskered royalty",
  },
  lake: {
    key: "lake",
    label: "Lake",
    kind: SeasonFiveLocationKind.LAKE,
    baseTravelMinutes: 8,
    maxStock: 68,
    regenPerHour: 14,
    levelRequired: 1,
    requiredGearKey: null,
    catchDifficulty: 2,
    minWeightGrams: 300,
    maxWeightGrams: 12000,
    inventoryPressure: 1,
    stockLabels: {
      rich: "Lake is lively",
      steady: "Lake is steady",
      low: "Lake is picked over",
      empty: "Lake is exhausted",
    },
    notableFish: "gobblers, grumblegills, and suspicious wizard leftovers",
  },
  deep: {
    key: "deep",
    label: "Deep Water",
    kind: SeasonFiveLocationKind.SEA,
    baseTravelMinutes: 14,
    maxStock: 46,
    regenPerHour: 8,
    levelRequired: 5,
    requiredGearKey: "war-veteran-cane",
    catchDifficulty: 4,
    minWeightGrams: 2500,
    maxWeightGrams: 55000,
    inventoryPressure: 2,
    stockLabels: {
      rich: "Depths are stirring",
      steady: "Depths are patient",
      low: "Depths are quiet",
      empty: "Depths are exhausted",
    },
    notableFish: "eyeless soupfish and things with too many opinions",
  },
  lava_lake: {
    key: "lava_lake",
    label: "Lava Lake",
    kind: SeasonFiveLocationKind.LAKE,
    baseTravelMinutes: 18,
    maxStock: 24,
    regenPerHour: 4,
    levelRequired: 8,
    requiredGearKey: "obsidian-roaster-rod",
    catchDifficulty: 5,
    minWeightGrams: 5000,
    maxWeightGrams: 85000,
    inventoryPressure: 3,
    stockLabels: {
      rich: "Lava is boiling",
      steady: "Lava is simmering",
      low: "Lava is cooling",
      empty: "Lava is exhausted",
    },
    notableFish: "snot koi, magma mouths, and noble scalded trophies",
  },
  void_lake: {
    key: "void_lake",
    label: "Void Lake",
    kind: SeasonFiveLocationKind.LAKE,
    baseTravelMinutes: 20,
    maxStock: 18,
    regenPerHour: 3,
    levelRequired: 10,
    requiredGearKey: "screaming-bamboo-pole",
    catchDifficulty: 6,
    minWeightGrams: 1000,
    maxWeightGrams: 120000,
    inventoryPressure: 4,
    stockLabels: {
      rich: "Void is staring back",
      steady: "Void is muttering",
      low: "Void is sulking",
      empty: "Void is emotionally unavailable",
    },
    notableFish:
      "nibblers, blinking holefish, and barons of absolutely nothing",
  },
} as const satisfies Record<
  SeasonFiveWaterBodyProfileKey,
  SeasonFiveWaterBodyProfile
>;

const STATIC_ROLES: Record<
  string,
  { role: SeasonFiveMapRole; roleLabel: string }
> = {
  [LOCATION_TILE_KEYS.home]: {
    role: SeasonFiveMapRole.HOME,
    roleLabel: "Home Base",
  },
};

const SPECIAL_TILE_PLANS = [
  {
    key: "shop",
    role: SeasonFiveMapRole.SHOP,
    roleLabel: "Travelling Shop",
  },
  {
    key: "event",
    role: SeasonFiveMapRole.EVENT,
    roleLabel: "Campfire Event",
  },
  {
    key: "lava",
    role: SeasonFiveMapRole.SECRET_LAKE,
    roleLabel: "Lava Pool",
  },
  {
    key: "void",
    role: SeasonFiveMapRole.SECRET_LAKE,
    roleLabel: "Void Lake",
  },
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
  return HEX_TILES.map((hex) => {
    const key = `t-${hex.row}-${hex.col}`;
    const staticRole = STATIC_ROLES[key];
    const terrain = TERRAIN_BY_BIOME[hex.biome];

    return {
      key,
      row: hex.row,
      col: hex.col,
      xPercent: hex.xPercent,
      yPercent: hex.yPercent,
      terrain,
      visualVariant: hashString(`${hex.row}:${hex.col}:${terrain}`) % 4,
      role: staticRole?.role ?? SeasonFiveMapRole.NONE,
      roleLabel: staticRole?.roleLabel ?? null,
      hidden: false,
      requiredKey: null,
      roleSeedKey: null,
      expiresAt: null,
    };
  });
}

export function isSeasonFiveFishableTile(tile: {
  terrain: SeasonFiveMapTerrain;
  role: SeasonFiveMapRole;
}) {
  return (
    tile.terrain === SeasonFiveMapTerrain.WATER ||
    tile.terrain === SeasonFiveMapTerrain.COAST ||
    tile.role === SeasonFiveMapRole.SECRET_LAKE
  );
}

function getAdjacentSeasonFiveTileKeys(
  tile: Pick<SeasonFiveTileTemplate, "row" | "col">,
  tileByCoordinate: Map<string, SeasonFiveMapTileSnapshot>
) {
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
      tileByCoordinate.get(`${tile.col + colOffset}:${tile.row + rowOffset}`)
    )
    .filter((neighbor): neighbor is SeasonFiveMapTileSnapshot =>
      Boolean(neighbor)
    )
    .map((neighbor) => neighbor.key);
}

function getWaterBodyProfileKey(
  bodyTiles: SeasonFiveMapTileSnapshot[]
): SeasonFiveWaterBodyProfileKey {
  if (
    bodyTiles.some(
      (tile) =>
        tile.role === SeasonFiveMapRole.SECRET_LAKE &&
        tile.roleLabel === "Void Lake"
    )
  ) {
    return "void_lake";
  }
  if (
    bodyTiles.some(
      (tile) =>
        tile.role === SeasonFiveMapRole.SECRET_LAKE &&
        tile.roleLabel === "Lava Pool"
    )
  ) {
    return "lava_lake";
  }
  if (
    bodyTiles.some((tile) => tile.key === LOCATION_TILE_KEYS["moon-depths"])
  ) {
    return "deep";
  }
  if (bodyTiles.some((tile) => tile.terrain === SeasonFiveMapTerrain.COAST)) {
    return "coast";
  }
  return "lake";
}

function getWaterBodyName(
  bodyTiles: SeasonFiveMapTileSnapshot[],
  profile: SeasonFiveWaterBodyProfile,
  index: number
) {
  const secret = bodyTiles.find(
    (tile) => tile.role === SeasonFiveMapRole.SECRET_LAKE
  );
  if (secret?.roleLabel) return secret.roleLabel;

  const namedTile = bodyTiles.find((tile) => {
    const locationKey = LOCATION_KEY_BY_TILE_KEY[tile.key];
    return locationKey && locationKey !== "home";
  });
  const namedLocationKey = namedTile
    ? LOCATION_KEY_BY_TILE_KEY[namedTile.key]
    : null;
  if (namedLocationKey && STATIC_LOCATION_NAMES[namedLocationKey]) {
    return STATIC_LOCATION_NAMES[namedLocationKey];
  }

  return `${profile.label} ${index + 1}`;
}

export function planSeasonFiveWaterBodies(tiles: SeasonFiveMapTileSnapshot[]) {
  const tileByKey = new Map(tiles.map((tile) => [tile.key, tile]));
  const tileByCoordinate = new Map(
    tiles.map((tile) => [`${tile.col}:${tile.row}`, tile] as const)
  );
  const fishableKeys = new Set(
    tiles.filter(isSeasonFiveFishableTile).map((tile) => tile.key)
  );
  const visited = new Set<string>();
  const bodies: SeasonFiveWaterBodyPlan[] = [];

  for (const tile of tiles) {
    if (!fishableKeys.has(tile.key) || visited.has(tile.key)) continue;

    const queue = [tile.key];
    const bodyKeys: string[] = [];
    visited.add(tile.key);

    while (queue.length > 0) {
      const currentKey = queue.shift();
      const current = currentKey ? tileByKey.get(currentKey) : null;
      if (!current) continue;

      bodyKeys.push(current.key);

      if (current.role === SeasonFiveMapRole.SECRET_LAKE) {
        continue;
      }

      for (const neighborKey of getAdjacentSeasonFiveTileKeys(
        current,
        tileByCoordinate
      )) {
        const neighbor = tileByKey.get(neighborKey);
        if (
          !neighbor ||
          visited.has(neighbor.key) ||
          !fishableKeys.has(neighbor.key) ||
          neighbor.role === SeasonFiveMapRole.SECRET_LAKE
        ) {
          continue;
        }
        visited.add(neighbor.key);
        queue.push(neighbor.key);
      }
    }

    const bodyTiles = bodyKeys
      .map((key) => tileByKey.get(key))
      .filter((entry): entry is SeasonFiveMapTileSnapshot => Boolean(entry))
      .sort((left, right) => left.row - right.row || left.col - right.col);
    const firstTile = bodyTiles[0];
    if (!firstTile) continue;

    const profileKey = getWaterBodyProfileKey(bodyTiles);
    const profile = SEASON_FIVE_WATER_BODY_PROFILES[profileKey];
    bodies.push({
      key: `water:${profileKey}:${firstTile.key}`,
      name: getWaterBodyName(bodyTiles, profile, bodies.length),
      profileKey,
      profile,
      tileKeys: bodyTiles.map((entry) => entry.key),
      hidden: false,
    });
  }

  return bodies;
}

export function planSeasonFiveFishingLocations({
  tiles,
  waterBodies,
}: {
  tiles: SeasonFiveMapTileSnapshot[];
  waterBodies: SeasonFiveWaterBodyPlan[];
}) {
  const tileByKey = new Map(tiles.map((tile) => [tile.key, tile]));
  const homeTile = tileByKey.get(LOCATION_TILE_KEYS.home);
  const plans: SeasonFiveFishingLocationPlan[] = [];

  for (const body of waterBodies) {
    for (const tileKey of body.tileKeys) {
      const tile = tileByKey.get(tileKey);
      if (!tile) continue;

      const staticLocationKey = LOCATION_KEY_BY_TILE_KEY[tile.key];
      const key =
        staticLocationKey && staticLocationKey !== "home"
          ? staticLocationKey
          : `tile:${tile.key}`;
      const name =
        staticLocationKey && STATIC_LOCATION_NAMES[staticLocationKey]
          ? STATIC_LOCATION_NAMES[staticLocationKey]
          : `${body.name} ${tile.row + 1}:${tile.col + 1}`;
      const travel = homeTile
        ? calculateSeasonFiveRoutePreview({
            from: homeTile,
            to: tile,
            baseMinutes: body.profile.baseTravelMinutes,
            travelPercent: 0,
          }).travelMinutes
        : body.profile.baseTravelMinutes;

      plans.push({
        key,
        name,
        kind: body.profile.kind,
        tileKey: tile.key,
        waterBodyKey: body.key,
        travelMinutes: travel,
        catchDifficulty: body.profile.catchDifficulty,
        minWeightGrams: body.profile.minWeightGrams,
        maxWeightGrams: body.profile.maxWeightGrams,
        inventoryPressure: body.profile.inventoryPressure,
      });
    }
  }

  return plans.sort((left, right) => left.key.localeCompare(right.key));
}

export function getSeasonFiveWaterBodyStockLabel(input: {
  currentStock: number;
  maxStock: number;
  profileKey: string;
}) {
  const profile =
    SEASON_FIVE_WATER_BODY_PROFILES[
      input.profileKey as SeasonFiveWaterBodyProfileKey
    ] ?? SEASON_FIVE_WATER_BODY_PROFILES.lake;
  const maxStock = Math.max(1, input.maxStock);
  const ratio = Math.max(0, input.currentStock) / maxStock;

  if (ratio <= 0) return profile.stockLabels.empty;
  if (ratio < 0.25) return profile.stockLabels.low;
  if (ratio < 0.7) return profile.stockLabels.steady;
  return profile.stockLabels.rich;
}

export function regenerateSeasonFiveWaterBodyStock(input: {
  currentStock: number;
  maxStock: number;
  regenPerHour: number;
  lastRegeneratedAt: Date;
  now: Date;
}) {
  const maxStock = Math.max(0, input.maxStock);
  const currentStock = Math.min(maxStock, Math.max(0, input.currentStock));
  const regenPerHour = Math.max(0, input.regenPerHour);
  const elapsedMinutes = Math.max(
    0,
    Math.floor(
      (input.now.getTime() - input.lastRegeneratedAt.getTime()) / 60_000
    )
  );

  if (regenPerHour === 0 || elapsedMinutes === 0 || currentStock >= maxStock) {
    return {
      currentStock,
      lastRegeneratedAt: input.lastRegeneratedAt,
      regenerated: 0,
    };
  }

  const regenerated = Math.min(
    maxStock - currentStock,
    Math.floor((elapsedMinutes * regenPerHour) / 60)
  );

  if (regenerated <= 0) {
    return {
      currentStock,
      lastRegeneratedAt: input.lastRegeneratedAt,
      regenerated: 0,
    };
  }

  return {
    currentStock: currentStock + regenerated,
    lastRegeneratedAt: addMinutes(
      input.lastRegeneratedAt,
      Math.floor((regenerated * 60) / regenPerHour)
    ),
    regenerated,
  };
}

function isSpecialEligible(tile: SeasonFiveMapTileSnapshot) {
  return (
    tile.role === SeasonFiveMapRole.NONE &&
    tile.terrain !== SeasonFiveMapTerrain.MOUNTAIN &&
    tile.terrain !== SeasonFiveMapTerrain.WATER &&
    tile.terrain !== SeasonFiveMapTerrain.COAST
  );
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
    index < SPECIAL_TILE_PLANS.length && candidates.length > 0;
    index += 1
  ) {
    const plan = SPECIAL_TILE_PLANS[index];
    if (!plan) continue;
    const candidateIndex = seededIndex(
      `${rotationKey}:${plan.key}`,
      candidates.length
    );
    const [tile] = candidates.splice(candidateIndex, 1);
    if (!tile) continue;

    planned.push({
      tileKey: tile.key,
      role: plan.role,
      roleLabel: plan.roleLabel,
      hidden: false,
      requiredKey: null,
      roleSeedKey: `${rotationKey}:${plan.key}`,
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

export function rollSeasonFiveWaterBodyDiscovery({
  seed,
  luk,
  magik,
  gearKeys,
  purchasedNodeKeys,
  hiddenWaterBodies,
}: {
  seed: string;
  luk: number;
  magik: number;
  gearKeys: Iterable<string>;
  purchasedNodeKeys: Iterable<string>;
  hiddenWaterBodies: Array<{ id: string; key: string }>;
}) {
  if (hiddenWaterBodies.length === 0) return null;

  const gear = new Set(gearKeys);
  const skills = new Set(purchasedNodeKeys);
  const gearBonus =
    (gear.has("bait-stained-cap") ? 5 : 0) +
    (gear.has("pointy-fishing-hat") ? 8 : 0);
  const wizardDeepKeys = new Set([
    "wizard_muttered_bait",
    "wizard_glass_gills",
    "wizard_salt_runes",
    "wizard_abyssal_chorus",
  ]);
  const skillBonus =
    (skills.has("warrior_old_maps") ? 7 : 0) +
    (skills.has("wizard_unhelpful_map") ? 7 : 0) +
    (Array.from(skills).some((key) => wizardDeepKeys.has(key)) ? 6 : 0) +
    (skills.has("rogue_backwater_gossip") ? 7 : 0);
  const chancePercent = Math.min(
    70,
    Math.max(0, 4 + luk * 3 + magik * 2 + gearBonus + skillBonus)
  );
  const roll = hashString(seed) % 100;
  if (roll >= chancePercent) return null;

  const bodyIndex = seededIndex(`${seed}:water-body`, hiddenWaterBodies.length);
  return hiddenWaterBodies[bodyIndex] ?? null;
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
