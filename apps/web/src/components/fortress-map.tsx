"use client";

import {
  Fragment,
  memo,
  type CSSProperties,
  type MutableRefObject,
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  HEX_RADIUS,
  HEX_TILES,
  MAP_WORLD_HEIGHT,
  MAP_WORLD_WIDTH,
  getHexPolygonPoints,
  snapMapPointToHex,
  type HexBiome,
} from "@/lib/game/map-hex";
import { getAttackTravelMinutes } from "@/lib/game/attacks";
import { getAttackPresentation } from "@/lib/game/attack-presentation";
import {
  getCosmeticSpriteStyle,
  getDefaultRaceCosmeticVariant,
} from "@/lib/game/cosmetic-sprites";
import {
  findSimplePath,
  getHexNeighbors,
  type PathHexTile,
} from "@/lib/game/march-pathfinding";
import type { UnitSpriteVariant } from "@/lib/game/constants";
import {
  getHomeOfABonus,
  getTileBonus,
  isHomeOfATile,
} from "@/lib/game/territory";
import styles from "./fortress-map.module.css";

type MapFortress = {
  id: string;
  commanderName: string;
  name: string;
  rawName: string;
  fortressKind:
    | "PLAYER"
    | "MEGA"
    | "UNICORN_DECOY"
    | "LOOT_CAMP"
    | "DWARF_RUNE";
  lootCampVariant: "STANDARD" | "RICH" | "CHAOS" | "CLASSIC" | null;
  points: number;
  isNpc: boolean;
  health: number;
  maxHealth: number;
  sizeTiles: number;
  iconLabel: string | null;
  isSlayerOfA: boolean;
  currentAction: "GROW" | "ATTACK";
  army: number;
  mapX: number;
  mapY: number;
  spriteSeedId: string;
  race: "DWARFS" | "UNSTABLE_UNICORNS" | "ORKS" | "SPACE_MURINES" | null;
  unitSpriteVariant: UnitSpriteVariant;
  unitCosmeticVariant: string | null;
  fortressCosmeticVariant: string | null;
  isCurrentUser: boolean;
  isTargetable: boolean;
  /** Player's relation to this fortress: war, allied, neutral */
  diplomacyStatus?: "WAR" | "ALLIED" | "NEUTRAL" | null;
};

type AttackUnitMarker = {
  id: string;
  kind?:
    | "ATTACK"
    | "FORTIFY"
    | "BATTLEFIELD_REINFORCEMENT"
    | "BATTALION_REINFORCEMENT";
  armyAmount: number | null;
  launchedAt: Date;
  arrivesAt: Date;
  recalledAt: Date | null;
  targetBattalionName?: string | null;
  reinforcementSide?: "ATTACKER" | "DEFENDER" | null;
  roadSavedSeconds?: number;
  roadSpeedMultiplier?: number;
  routeTileIds?: string[];
  returnOrigin: {
    mapX: number;
    mapY: number;
  } | null;
  canRecall: boolean;
  canInstantRecall: boolean;
  attacker: {
    id: string;
    name: string;
    mapX: number;
    mapY: number;
    race: MapFortress["race"];
    unitSpriteVariant: UnitSpriteVariant;
    unitCosmeticVariant: string | null;
  };
  target: {
    id: string;
    name: string;
    mapX: number;
    mapY: number;
  };
};

type MapHexOwnershipMarker = {
  tileId: string;
  biome?: HexBiome | string | null;
  ownerFortressId?: string | null;
  ownerRace?: "DWARFS" | "UNSTABLE_UNICORNS" | "ORKS" | "SPACE_MURINES" | null;
  ownerName: string;
  ownerCommanderName: string;
  isCurrentUser: boolean;
  hasActiveBattle: boolean;
  canAttack: boolean;
  canFortify?: boolean;
  fortifyDisabledReason?: string | null;
  isConnectedToPlayerTerritory?: boolean;
  pressurePriority?: boolean;
  pressurePriorityRank?: number | null;
  pressurePlayerProgress?: number | null;
  pressureProgress?: number | null;
  pressureThreshold?: number | null;
  pressureLeaderFortressId?: string | null;
  pressureLeaderLabel?: string | null;
  canPrioritizePressure?: boolean;
  pressurePriorityDisabledReason?: string | null;
  /** Attack priority: 0=none, 1=tertiary, 2=secondary, 3=primary */
  attackPriority?: number;
  /** Current ownership pressure (for owned tiles, 0-600). */
  ownershipPressure?: number | null;
  activeBattlefieldId?: string | null;
  attackDisabledReason?: string | null;
  canStartCampaign?: boolean;
  campaignDisabledReason?: string | null;
  campaignId?: string | null;
  campaignOrderId?: string | null;
  campaignStatus?:
    | "BUILDING"
    | "SIEGE_WARNING"
    | "ENGAGED"
    | "RESOLVED"
    | "CANCELED"
    | null;
  campaignProgress?: number | null;
  campaignThreshold?: number | null;
  campaignResponseEndsAt?: Date | null;
  isOwnCampaign?: boolean;
  canStationGuard?: boolean;
  guardDisabledReason?: string | null;
  guardOrderId?: string | null;
  guardArmy?: number | null;
  bonus: {
    label: string;
    gold?: number;
    points?: number;
    food?: number;
    army?: number;
    defensePercent?: number;
  };
  isHomeOfA?: boolean;
  pointIncome?: number | null;
  ownGarrison?: {
    id: string;
    army: number;
    canRecall: boolean;
    recallDisabledReason: string | null;
    canInstantRecall: boolean;
    canTorch: boolean;
    torchDisabledReason: string | null;
  } | null;
  occupyingGarrison?: {
    fortressId: string;
    fortressName: string;
    commanderName: string;
    army: number;
    isCurrentUser: boolean;
  } | null;
  holders?: Array<{
    fortressName: string;
    commanderName: string;
    contributionWeight: number;
    isCurrentUser: boolean;
  }>;
};

type Point = {
  x: number;
  y: number;
};

const TRADE_WAGON_SPRITE_FRAME_COUNT = 10;
const TRADE_WAGON_SPRITES: Record<NonNullable<MapFortress["race"]>, string> = {
  DWARFS: "/assets/wagons/wagon-dwarfs.png",
  ORKS: "/assets/wagons/wagon-orks.png",
  SPACE_MURINES: "/assets/wagons/wagon-space-murines.png",
  UNSTABLE_UNICORNS: "/assets/wagons/wagon-unstable-unicorns.png",
};

function getTradeWagonSpriteStyle(
  race: MapFortress["race"],
  level: number | null | undefined
): CSSProperties {
  const frame = Math.min(
    Math.max(Math.trunc(level ?? 0), 0),
    TRADE_WAGON_SPRITE_FRAME_COUNT - 1
  );
  const position =
    frame === 0 ? 0 : (frame / (TRADE_WAGON_SPRITE_FRAME_COUNT - 1)) * 100;

  return {
    backgroundImage: `url(${
      race ? TRADE_WAGON_SPRITES[race] : "/assets/wagons/wagon-default.png"
    })`,
    backgroundPosition: `${position}% 0`,
  };
}

type DragStart = {
  x: number;
  y: number;
  translateX: number;
  translateY: number;
};

type TileTapState = {
  tileId: string;
  pointerId: number;
  startX: number;
  startY: number;
  cancelled: boolean;
};

type TilePointerTarget = {
  tileId: string;
  selectable: boolean;
};

type MarkerTapState = {
  fortressId: string;
  pointerId: number;
  startX: number;
  startY: number;
  cancelled: boolean;
};

export type { AttackUnitMarker, MapFortress, MapHexOwnershipMarker };

type BattlefieldIndicatorData = {
  id: string;
  targetTileId: string | null;
  targetFortressId: string | null;
  attackerArmyRemaining: number;
  defenderArmyRemaining: number;
  attackerArmyLabel: string;
  defenderArmyLabel: string;
  progress: number;
  battleIntensityPercent: number;
  momentumTier: string;
  incomingAttackerArmy: number;
  incomingDefenderArmy: number;
  attackerBanner: { name: string };
  defenderBanner: { name: string } | null;
};

type FortressMapProps = {
  fortresses: MapFortress[];
  mapHexes?: MapHexOwnershipMarker[];
  attackUnits?: AttackUnitMarker[];
  battlefields?: BattlefieldIndicatorData[];
  selectedFortressId?: string | null;
  selectedTargetId?: string | null;
  selectedTileId?: string | null;
  activeBattleFortressIds?: string[];
  highlightedTileIds?: string[];
  alliedRoads?: Array<{
    x1: number;
    y1: number;
    x2: number;
    y2: number;
  }>;
  tradeRouteLines?: Array<{
    x1: number;
    y1: number;
    x2: number;
    y2: number;
    deliveries: number;
  }>;
  roadSegments?: Array<{
    tileId: string;
    level: number;
    crossings: number;
  }>;
  battalionMarkers?: Array<{
    tileId: string;
    battalionName: string;
    size: number;
    maxSize: number;
    tier: number;
    stance: string;
    mode: string;
    fortressId: string;
    unitSpriteVariant: string;
    unitCosmeticVariant: string | null;
    race: string | null;
  }>;
  convoyMarkers?: Array<{
    id: string;
    fromFortressId: string;
    toFortressId: string;
    fromName?: string;
    toName?: string;
    status?: string;
    gold: number;
    food: number;
    army: number;
    points?: number;
    nukeFuel?: number;
    nukeRocket?: number;
    nukeWrathOfA?: number;
    baseCargoValue?: number;
    deedTileId?: string | null;
    cargoLabel?: string;
    arrivedAwaitingTick?: boolean;
    senderRace?: MapFortress["race"];
    tradeLevel?: number;
    departedAt: number | null;
    arrivesAt: number | null;
  }>;
  nukeBiddingMarker?: {
    isOpen: boolean;
    canLaunch: boolean;
    status: string;
  } | null;
  onSelectFortress?: (fortress: MapFortress) => void;
  onConfirmAttackTarget?: (
    fortress: MapFortress,
    sentArmy: number
  ) => void | Promise<void>;
  onSelectMapHex?: (tileId: string) => void;
  onRecallAttackUnit?: (attackUnit: AttackUnitMarker) => void | Promise<void>;
  onInstantRecallAttackUnit?: (
    attackUnit: AttackUnitMarker
  ) => void | Promise<void>;
  className?: string;
};

const MIN_SCALE = 0.42;
const MAX_SCALE = 2.1;
const ZOOM_STEP = 0.14;
const CLICK_DRAG_THRESHOLD = 6;
const BIOME_LABELS: Record<HexBiome, string> = {
  water: "Sea",
  coast: "Coast",
  plains: "Plains",
  forest: "Forest",
  hills: "Hills",
  mountains: "Mountains",
  marsh: "Marsh",
  lake: "Lake",
};

const SPRITE_VARIANTS = [
  "citadel",
  "forge",
  "spire",
  "garden",
  "vault",
  "watchtower",
] as const;

type SpriteVariant = (typeof SPRITE_VARIANTS)[number];

const RACE_TOKEN_PATHS: Record<string, string> = {
  DWARFS: "/assets/token-dwarf.png",
  ORKS: "/assets/token-orks.png",
  SPACE_MURINES: "/assets/token-space-murines.png",
  UNSTABLE_UNICORNS: "/assets/token-unstable-unicorns.png",
};

// SVG data URL for crossed swords battle indicator
// Falls back to emoji if image asset is not available
const CROSSED_SWORDS_PATH = `/assets/crossed-swords.png`;

const OWNED_TILE_RACE_CLASS_BY_RACE: Record<string, string> = {
  DWARFS: styles.dwarfOwnedTile,
  UNSTABLE_UNICORNS: styles.unicornOwnedTile,
  ORKS: styles.orkOwnedTile,
  SPACE_MURINES: styles.spaceMurineOwnedTile,
};

function hashString(value: string) {
  let hash = 0;

  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }

  return hash;
}

function clampValue(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function getSpriteVariant(fortress: MapFortress): SpriteVariant {
  return SPRITE_VARIANTS[
    hashString(fortress.spriteSeedId) % SPRITE_VARIANTS.length
  ];
}

function getEffectiveUnitCosmeticVariant({
  variant,
  race,
  seed,
}: {
  variant: string | null | undefined;
  race: MapFortress["race"];
  seed: string;
}) {
  return (
    variant ??
    getDefaultRaceCosmeticVariant({
      slot: "UNIT",
      race,
      seed,
    })
  );
}

function FortressSprite({
  variant,
  skinVariant,
}: {
  variant: SpriteVariant;
  skinVariant?: string | null;
}) {
  const skinStyle = getCosmeticSpriteStyle("FORTRESS", skinVariant);

  return (
    <>
      <span
        className={styles.fortressSprite}
        data-variant={variant}
        data-skin={skinVariant ?? undefined}
        style={skinStyle ?? undefined}
        aria-hidden="true"
      />
    </>
  );
}

function MegaFortressSprite({ iconLabel }: { iconLabel: string }) {
  return (
    <span
      className={styles.megaFortressSprite}
      aria-label={iconLabel}
      role="img"
    />
  );
}

function LootCampSprite({
  variant,
}: {
  variant: "STANDARD" | "RICH" | "CHAOS" | "CLASSIC" | null;
}) {
  return (
    <span
      className={styles.lootCampSprite}
      data-variant={variant ?? "STANDARD"}
      aria-hidden="true"
    />
  );
}

function DwarfRuneSprite() {
  return <span className={styles.dwarfRuneSprite} aria-hidden="true" />;
}

// ── Road Rendering Helpers ───────────────────────────────────────────────────

type RoadEdge = {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  level: number;
  crossings: number;
};

function computeRoadEdges(
  segments: Array<{ tileId: string; level: number; crossings?: number }>,
  hexTiles: typeof HEX_TILES
): RoadEdge[] {
  if (segments.length === 0) return [];

  const roadMap = new Map(segments.map((s) => [s.tileId, s]));
  const edges: RoadEdge[] = [];
  const seen = new Set<string>();

  for (const tile of hexTiles) {
    const myRoad = roadMap.get(tile.id);
    if (!myRoad || myRoad.level <= 0) continue;

    // Compute adjacent hex tiles by checking grid adjacency.
    // Even columns: neighbors at (col±1, row), (col, row±1), (col-1, row±1)
    // Odd columns:  neighbors at (col±1, row), (col, row±1), (col+1, row±1)
    const isEvenCol = tile.col % 2 === 0;
    const neighborOffsets: [number, number][] = [
      [-1, 0],
      [1, 0], // horizontal
      [0, -1],
      [0, 1], // vertical
    ];
    if (isEvenCol) {
      neighborOffsets.push([-1, -1], [-1, 1]);
    } else {
      neighborOffsets.push([1, -1], [1, 1]);
    }

    for (const [dc, dr] of neighborOffsets) {
      const neighborCol = tile.col + dc;
      const neighborRow = tile.row + dr;
      const neighborTile = hexTiles.find(
        (t) => t.col === neighborCol && t.row === neighborRow
      );
      if (!neighborTile) continue;

      const neighborRoad = roadMap.get(neighborTile.id);
      if (!neighborRoad || neighborRoad.level <= 0) continue;

      const edgeKey = [tile.id, neighborTile.id].sort().join("-");
      if (seen.has(edgeKey)) continue;
      seen.add(edgeKey);

      edges.push({
        x1: tile.xPercent,
        y1: tile.yPercent,
        x2: neighborTile.xPercent,
        y2: neighborTile.yPercent,
        level: Math.min(myRoad.level, neighborRoad.level),
        crossings: Math.min(myRoad.crossings ?? 0, neighborRoad.crossings ?? 0),
      });
    }
  }

  return edges;
}

function getRoadLevelClass(level: number): string {
  if (level >= 3) return "roadHighway";
  if (level >= 2) return "roadStone";
  if (level >= 1) return "roadDirt";
  return "";
}

function getRoadStrokeWidth(level: number): number {
  if (level >= 3) return 5.4;
  if (level >= 2) return 3.8;
  return 2.7;
}

function getRoadBedStrokeWidth(level: number): number {
  if (level >= 3) return 10.8;
  if (level >= 2) return 8;
  return 6.2;
}

function getRoadDetailStrokeWidth(level: number): number {
  if (level >= 3) return 1;
  if (level >= 2) return 0.95;
  return 0.8;
}

function getRoadLevelKey(level: number): "dirt" | "stone" | "highway" {
  if (level >= 3) return "highway";
  if (level >= 2) return "stone";
  return "dirt";
}

function getRoadLabel(level: number) {
  if (level >= 3) return "Highway";
  if (level >= 2) return "Stone road";
  if (level >= 1) return "Dirt path";
  return "Road";
}

function getRoadSpeedLabel(level: number) {
  if (level >= 3) return "1.5x";
  if (level >= 2) return "1.3x";
  if (level >= 1) return "1.15x";
  return "1x";
}

function getLifeSeedStyle(seed: string, extra?: CSSProperties): CSSProperties {
  const hash = hashString(seed);
  return {
    "--life-delay": `${-((hash % 4200) / 1000).toFixed(2)}s`,
    "--life-duration": `${3.8 + (hash % 1800) / 1000}s`,
    ...extra,
  } as CSSProperties;
}

function findNearestHexTile(point: { x: number; y: number }) {
  let closest: (typeof HEX_TILES)[number] | null = null;
  let closestDist = Infinity;
  for (const tile of HEX_TILES) {
    const dx = tile.xPercent - point.x;
    const dy = tile.yPercent - point.y;
    const dist = dx * dx + dy * dy;
    if (dist < closestDist) {
      closestDist = dist;
      closest = tile;
    }
  }
  return closest;
}

const HEX_TILE_BY_ID = new Map(HEX_TILES.map((tile) => [tile.id, tile]));
const PATH_HEX_LOOKUP = new Map(
  HEX_TILES.map((tile) => [
    tile.id,
    { id: tile.id, col: tile.col, row: tile.row },
  ])
);
const PATH_HEX_BY_COORD = new Map(
  HEX_TILES.map((tile) => [
    `${tile.col},${tile.row}`,
    { id: tile.id, col: tile.col, row: tile.row },
  ])
);
const HEX_TILE_POLYGON_POINTS = new Map(
  HEX_TILES.map((tile) => [tile.id, getHexPolygonPoints(tile.x, tile.y)])
);
const HEX_TILE_INNER_POINTS = new Map(
  HEX_TILES.map((tile) => [
    tile.id,
    getHexPolygonPoints(tile.x, tile.y, HEX_RADIUS * 0.72),
  ])
);
const HEX_TILE_DOMAIN_POINTS = new Map(
  HEX_TILES.map((tile) => [
    tile.id,
    getHexPolygonPoints(tile.x, tile.y, HEX_RADIUS * 0.96),
  ])
);
const HEX_TILE_FEATURE_PATHS = new Map<string, string>(
  HEX_TILES.flatMap((tile): Array<[string, string]> => {
    if (tile.biome === "forest") {
      return [
        [
          tile.id,
          `M ${tile.x - 15} ${tile.y + 12} h 30 l -15 -28 z M ${tile.x - 4} ${
            tile.y + 16
          } h 8 v 10 h -8 z`,
        ],
      ];
    }

    if (tile.biome === "hills" || tile.biome === "mountains") {
      return [
        [
          tile.id,
          `M ${tile.x - 25} ${tile.y + 16} l 19 -32 l 20 32 z M ${tile.x - 3} ${
            tile.y + 16
          } l 18 -25 l 20 25 z`,
        ],
      ];
    }

    if (tile.biome === "marsh") {
      return [
        [
          tile.id,
          `M ${tile.x - 25} ${tile.y + 11} q 12 -10 24 0 t 24 0 M ${
            tile.x - 18
          } ${tile.y - 3} v 22 M ${tile.x + 11} ${tile.y - 6} v 24`,
        ],
      ];
    }

    return [];
  })
);
const PRESSURE_MAX = 600;
const RACE_PRESSURE_COLORS: Record<string, [number, number, number]> = {
  DWARFS: [74, 123, 191],
  ORKS: [90, 158, 75],
  SPACE_MURINES: [212, 168, 67],
  UNSTABLE_UNICORNS: [155, 89, 182],
};
const BIOME_BASE_COLORS: Record<string, [number, number, number]> = {
  water: [31, 103, 128],
  coast: [74, 144, 149],
  plains: [111, 148, 67],
  forest: [47, 116, 69],
  hills: [138, 125, 75],
  mountains: [109, 111, 104],
  marsh: [79, 128, 97],
  lake: [43, 122, 160],
};
const FULL_LIFE_DOMAIN_TILE_LIMIT = 48;
const FULL_ROUTE_DETAIL_LIMIT = 24;
const BATTALION_MODE_COLORS: Record<string, string> = {
  RESERVE: "#888888",
  GUARD: "#44cc88",
  ATTACK: "#ffb040",
  ALLIANCE: "#c080ff",
};
const BATTALION_RACE_TIER_LABELS: Record<string, string[]> = {
  DWARFS: ["", "⛏", "⛏⛏", "⛏⛏⛏"],
  ORKS: ["", "💀", "💀💀", "💀💀💀"],
  SPACE_MURINES: ["", "★", "★★", "★★★"],
  UNSTABLE_UNICORNS: ["", "🦄", "🦄🦄", "🦄🦄🦄"],
};

function getTilePointerTarget(
  event: ReactPointerEvent<SVGSVGElement>
): TilePointerTarget | null {
  const target = event.target;
  if (!(target instanceof Element)) {
    return null;
  }

  const tileElement = target.closest("[data-tile-id]");
  if (!tileElement || !event.currentTarget.contains(tileElement)) {
    return null;
  }

  const tileId = tileElement.getAttribute("data-tile-id");
  if (!tileId) {
    return null;
  }

  return {
    tileId,
    selectable: tileElement.getAttribute("data-tile-selectable") === "true",
  };
}

function blendRgb(
  a: [number, number, number],
  b: [number, number, number],
  ratio: number
): string {
  const r = Math.round(a[0] + (b[0] - a[0]) * ratio);
  const g = Math.round(a[1] + (b[1] - a[1]) * ratio);
  const bl = Math.round(a[2] + (b[2] - a[2]) * ratio);
  return `rgb(${r},${g},${bl})`;
}

// ── Hex Tile Map ─────────────────────────────────────────────────────────────

const MapLifeLayer = memo(function MapLifeLayer({
  mapHexes,
  roadEdges,
  tradeRouteLines,
  battlefields,
  fortresses,
  reducedVisualLoad,
}: {
  mapHexes: MapHexOwnershipMarker[];
  roadEdges: RoadEdge[];
  tradeRouteLines: NonNullable<FortressMapProps["tradeRouteLines"]>;
  battlefields: BattlefieldIndicatorData[];
  fortresses: MapFortress[];
  reducedVisualLoad: boolean;
}) {
  const activeBattleByTileId = useMemo(() => {
    const byId = new Map(
      battlefields.map((battlefield) => [battlefield.id, battlefield])
    );
    return new Map(
      mapHexes
        .filter((hex) => hex.hasActiveBattle && hex.activeBattlefieldId)
        .map((hex) => [hex.tileId, byId.get(hex.activeBattlefieldId!) ?? null])
    );
  }, [battlefields, mapHexes]);

  const visibleDomainHexes = useMemo(
    () =>
      mapHexes.filter(
        (hex) =>
          hex.ownerFortressId &&
          (!reducedVisualLoad || hex.isCurrentUser || hex.hasActiveBattle)
      ),
    [mapHexes, reducedVisualLoad]
  );

  return (
    <div
      className={styles.mapLifeLayer}
      data-reduced={reducedVisualLoad ? "true" : "false"}
      aria-hidden="true"
    >
      <svg
        className={styles.mapLifeSvg}
        viewBox={`0 0 ${MAP_WORLD_WIDTH} ${MAP_WORLD_HEIGHT}`}
      >
        {visibleDomainHexes.map((hex) => {
          const points = HEX_TILE_DOMAIN_POINTS.get(hex.tileId);
          if (!points) return null;

          return (
            <polygon
              key={`domain-${hex.tileId}`}
              className={`${styles.lifeDomain} ${
                hex.isCurrentUser ? styles.lifeOwnDomain : ""
              }`}
              data-race={hex.ownerRace ?? undefined}
              points={points}
              style={getLifeSeedStyle(hex.tileId)}
            />
          );
        })}
        {!reducedVisualLoad
          ? roadEdges.map((edge, index) => (
              <line
                key={`road-life-${index}`}
                x1={(edge.x1 * MAP_WORLD_WIDTH) / 100}
                y1={(edge.y1 * MAP_WORLD_HEIGHT) / 100}
                x2={(edge.x2 * MAP_WORLD_WIDTH) / 100}
                y2={(edge.y2 * MAP_WORLD_HEIGHT) / 100}
                className={`${styles.lifeRoadShimmer} ${getRoadLevelClass(edge.level)}`}
                strokeWidth={Math.max(2, getRoadStrokeWidth(edge.level) + 1.4)}
                style={getLifeSeedStyle(
                  `road-${edge.x1}-${edge.y1}-${edge.x2}-${edge.y2}`
                )}
              />
            ))
          : null}
        {!reducedVisualLoad
          ? tradeRouteLines.map((route, index) => (
              <line
                key={`trade-life-${index}`}
                x1={(route.x1 * MAP_WORLD_WIDTH) / 100}
                y1={(route.y1 * MAP_WORLD_HEIGHT) / 100}
                x2={(route.x2 * MAP_WORLD_WIDTH) / 100}
                y2={(route.y2 * MAP_WORLD_HEIGHT) / 100}
                className={styles.lifeTradeTicks}
                strokeWidth={Math.min(
                  5,
                  2 + Math.log2(Math.max(1, route.deliveries))
                )}
                style={getLifeSeedStyle(`trade-${index}-${route.deliveries}`)}
              />
            ))
          : null}
        {Array.from(activeBattleByTileId.entries()).map(
          ([tileId, battlefield]) => {
            const tile = HEX_TILE_BY_ID.get(tileId);
            if (!tile) return null;

            const intensity = battlefield?.battleIntensityPercent ?? 30;
            const puffCount = reducedVisualLoad
              ? intensity >= 70
                ? 2
                : 1
              : intensity >= 70
                ? 5
                : intensity >= 30
                  ? 4
                  : 3;

            return Array.from({ length: puffCount }, (_, puffIndex) => {
              const hash = hashString(`${tileId}:${puffIndex}`);
              const angle = (hash % 360) * (Math.PI / 180);
              const radius = 9 + (hash % 22);
              const x = tile.x + Math.cos(angle) * radius;
              const y = tile.y + Math.sin(angle) * radius * 0.55;

              return (
                <circle
                  key={`battle-life-${tileId}-${puffIndex}`}
                  cx={x}
                  cy={y}
                  r={3 + (hash % 6)}
                  className={styles.lifeBattlePuff}
                  data-intensity={
                    intensity >= 70 ? "high" : intensity >= 30 ? "mid" : "low"
                  }
                  style={getLifeSeedStyle(`${tileId}:${puffIndex}`, {
                    "--puff-x": `${(hash % 15) - 7}px`,
                    "--puff-y": `${-14 - (hash % 16)}px`,
                  } as CSSProperties)}
                />
              );
            });
          }
        )}
      </svg>
      {fortresses
        .filter(
          (fortress) =>
            fortress.fortressKind === "PLAYER" &&
            (!reducedVisualLoad || fortress.isCurrentUser)
        )
        .map((fortress) => {
          const ownerTile = findNearestHexTile({
            x: fortress.mapX,
            y: fortress.mapY,
          });
          const ownerHex = ownerTile
            ? mapHexes.find(
                (hex) =>
                  hex.tileId === ownerTile.id &&
                  hex.ownerFortressId === fortress.id
              )
            : null;

          return (
            <span
              key={`fortress-life-${fortress.id}`}
              className={`${styles.lifeFortressAura} ${
                fortress.isCurrentUser ? styles.lifeOwnFortressAura : ""
              }`}
              data-race={fortress.race ?? ownerHex?.ownerRace ?? undefined}
              style={getLifeSeedStyle(fortress.id, {
                left: `${fortress.mapX}%`,
                top: `${fortress.mapY}%`,
              })}
            />
          );
        })}
    </div>
  );
});

const HexTileMap = memo(function HexTileMap({
  mapHexes,
  selectedTileId,
  highlightedTileIds = [],
  onSelectMapHex,
  battlefieldById,
  reducedVisualLoad,
}: {
  mapHexes: MapHexOwnershipMarker[];
  selectedTileId?: string | null;
  highlightedTileIds?: string[];
  onSelectMapHex?: (tileId: string) => void;
  battlefieldById: Map<string, BattlefieldIndicatorData>;
  reducedVisualLoad: boolean;
}) {
  const ownershipByTileId = useMemo(
    () => new Map(mapHexes.map((ownership) => [ownership.tileId, ownership])),
    [mapHexes]
  );
  const highlightedTileIdSet = useMemo(
    () => new Set(highlightedTileIds),
    [highlightedTileIds]
  );

  // Compute pressure heatmap fill color for a tile
  const pressureFillByTileId = useMemo(() => {
    const fills = new Map<string, string>();
    const ownerRaceByFortressId = new Map<
      string,
      NonNullable<MapHexOwnershipMarker["ownerRace"]>
    >();
    for (const hex of mapHexes) {
      if (hex.ownerFortressId && hex.ownerRace) {
        ownerRaceByFortressId.set(hex.ownerFortressId, hex.ownerRace);
      }
    }

    for (const hex of mapHexes) {
      const biomeRgb =
        BIOME_BASE_COLORS[hex.biome ?? "plains"] ?? BIOME_BASE_COLORS.plains;

      if (hex.ownerFortressId && hex.ownershipPressure != null) {
        // Owned tile: blend biome → race color based on ownership pressure
        const raceRgb = RACE_PRESSURE_COLORS[hex.ownerRace ?? ""] ?? null;
        if (raceRgb) {
          const ratio = Math.min(1, hex.ownershipPressure / PRESSURE_MAX);
          // Ease the blend: subtle at low pressure, dominant at high
          const eased =
            ratio < 0.33
              ? ratio * 0.3 // barely visible below warning
              : ratio;
          fills.set(
            hex.tileId,
            blendRgb(biomeRgb, raceRgb, Math.min(1, eased))
          );
        }
      } else if (
        hex.pressureProgress != null &&
        hex.pressureProgress > 0 &&
        hex.pressureLeaderFortressId
      ) {
        // Neutral/enemy tile under territorial pressure: subtle wash of leader's race color
        const leaderRace = ownerRaceByFortressId.get(
          hex.pressureLeaderFortressId
        );
        const raceRgb = RACE_PRESSURE_COLORS[leaderRace ?? ""] ?? null;
        if (raceRgb && hex.pressureThreshold) {
          const ratio = Math.min(
            1,
            hex.pressureProgress / hex.pressureThreshold
          );
          // Very subtle — max 20% race color at full pressure
          fills.set(hex.tileId, blendRgb(biomeRgb, raceRgb, ratio * 0.2));
        }
      }
    }
    return fills;
  }, [mapHexes]);

  const tileTapStateRef = useRef<TileTapState | null>(null);

  const handleTilePointerDown = useCallback(
    (event: ReactPointerEvent<SVGSVGElement>) => {
      const tileTarget = getTilePointerTarget(event);
      if (!tileTarget?.selectable) {
        return;
      }

      if (event.pointerType === "mouse" && event.button !== 0) {
        return;
      }

      event.stopPropagation();
      tileTapStateRef.current = {
        tileId: tileTarget.tileId,
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        cancelled: false,
      };
    },
    []
  );

  const handleTilePointerMove = useCallback(
    (event: ReactPointerEvent<SVGSVGElement>) => {
      const tileTarget = getTilePointerTarget(event);
      const tapState = tileTapStateRef.current;

      if (
        !tapState ||
        !tileTarget ||
        tapState.pointerId !== event.pointerId ||
        tapState.tileId !== tileTarget.tileId
      ) {
        return;
      }

      if (
        Math.hypot(
          event.clientX - tapState.startX,
          event.clientY - tapState.startY
        ) > CLICK_DRAG_THRESHOLD
      ) {
        tapState.cancelled = true;
      }
    },
    []
  );

  const clearTileTap = useCallback(
    (event: ReactPointerEvent<SVGSVGElement>) => {
      const tapState = tileTapStateRef.current;

      if (tapState && tapState.pointerId === event.pointerId) {
        tileTapStateRef.current = null;
      }
    },
    []
  );

  const handleTilePointerUp = useCallback(
    (event: ReactPointerEvent<SVGSVGElement>) => {
      const tileTarget = getTilePointerTarget(event);
      const tapState = tileTapStateRef.current;

      if (
        !tapState ||
        !tileTarget ||
        tapState.pointerId !== event.pointerId ||
        tapState.tileId !== tileTarget.tileId
      ) {
        return;
      }

      event.stopPropagation();
      tileTapStateRef.current = null;

      if (!tapState.cancelled) {
        onSelectMapHex?.(tileTarget.tileId);
      }
    },
    [onSelectMapHex]
  );

  return (
    <svg
      className={styles.hexMap}
      viewBox={`0 0 ${MAP_WORLD_WIDTH} ${MAP_WORLD_HEIGHT}`}
      aria-hidden="true"
      role="presentation"
      onPointerDown={handleTilePointerDown}
      onPointerMove={handleTilePointerMove}
      onPointerUp={handleTilePointerUp}
      onPointerCancel={clearTileTap}
    >
      <rect
        width={MAP_WORLD_WIDTH}
        height={MAP_WORLD_HEIGHT}
        className={styles.mapBase}
      />
      {HEX_TILES.map((tile) => {
        const ownership = ownershipByTileId.get(tile.id);
        const activeBattlefield = ownership?.activeBattlefieldId
          ? battlefieldById.get(ownership.activeBattlefieldId)
          : null;
        const battleIntensityClass = activeBattlefield
          ? activeBattlefield.battleIntensityPercent >= 70
            ? styles.battleIntensityHigh
            : activeBattlefield.battleIntensityPercent >= 30
              ? styles.battleIntensityMid
              : styles.battleIntensityLow
          : "";
        const isHomeTile = isHomeOfATile(tile.id);
        const isOwnedTile = Boolean(ownership?.ownerFortressId);
        const isHighlightedTile = highlightedTileIdSet.has(tile.id);
        const isSelectedTile = selectedTileId === tile.id;
        const showInnerDetail =
          isSelectedTile ||
          isHighlightedTile ||
          isHomeTile ||
          Boolean(ownership?.hasActiveBattle) ||
          Boolean(ownership?.pressurePriorityRank) ||
          Boolean(ownership?.isCurrentUser);
        const featurePath = reducedVisualLoad
          ? null
          : HEX_TILE_FEATURE_PATHS.get(tile.id);
        const bonus =
          ownership?.bonus ??
          (isHomeTile ? getHomeOfABonus() : getTileBonus(tile));
        const tileClassName = [
          styles.hexTile,
          styles[`${tile.biome}Tile`],
          tile.spawnable ? styles.spawnableTile : "",
          tile.claimable ? styles.selectableTile : "",
          isHighlightedTile ? styles.highlightedTeleportTile : "",
          isOwnedTile ? styles.ownedTile : "",
          isOwnedTile && ownership?.ownerRace
            ? (OWNED_TILE_RACE_CLASS_BY_RACE[ownership.ownerRace] ?? "")
            : "",
          ownership?.pressurePriority ? styles.pressurePriorityTile : "",
          ownership?.attackPriority === 3
            ? styles.attackPriorityPrimaryTile
            : "",
          ownership?.attackPriority === 2
            ? styles.attackPrioritySecondaryTile
            : "",
          ownership?.attackPriority === 1
            ? styles.attackPriorityTertiaryTile
            : "",
          ownership?.isHomeOfA ? styles.contestedTile : "",
          isOwnedTile && ownership?.isCurrentUser ? styles.ownTile : "",
          ownership?.canAttack ? styles.attackableTile : "",
          ownership?.hasActiveBattle ? styles.contestedTile : "",
          isSelectedTile ? styles.selectedTile : "",
        ]
          .filter(Boolean)
          .join(" ");

        return (
          <g
            key={tile.id}
            className={tileClassName}
            aria-label={
              isOwnedTile && ownership
                ? `${ownership.isHomeOfA ? "Home of A" : BIOME_LABELS[tile.biome]}, owned by ${ownership.ownerName}, ${ownership.bonus.label}${
                    ownership.hasActiveBattle ? ", battle active" : ""
                  }`
                : `${isHomeTile ? "Home of A, neutral control point" : `${BIOME_LABELS[tile.biome]}, unclaimed`}${
                    ownership?.pressureProgress != null &&
                    ownership.pressureThreshold != null
                      ? `, pressure ${ownership.pressureProgress}/${ownership.pressureThreshold}`
                      : ""
                  }, ${bonus.label}`
            }
            data-tile-id={tile.id}
            data-tile-selectable={tile.claimable ? "true" : "false"}
          >
            <polygon
              points={HEX_TILE_POLYGON_POINTS.get(tile.id)}
              style={
                pressureFillByTileId.has(tile.id)
                  ? { fill: pressureFillByTileId.get(tile.id) }
                  : undefined
              }
            />
            {showInnerDetail ? (
              <polyline
                points={HEX_TILE_INNER_POINTS.get(tile.id)}
                className={styles.hexInner}
              />
            ) : null}
            {ownership?.pressurePriorityRank ? (
              <g className={styles.pressurePriorityBadge}>
                <circle cx={tile.x + 22} cy={tile.y - 22} r={13} />
                <text x={tile.x + 22} y={tile.y - 17}>
                  {ownership.pressurePriorityRank}
                </text>
              </g>
            ) : null}
            {featurePath ? (
              <path className={styles.hexFeature} d={featurePath} />
            ) : null}
            {ownership?.hasActiveBattle ? (
              <g
                className={`${styles.battleIndicator} ${battleIntensityClass}`}
              >
                {/* Crossed swords icon */}
                <image
                  xlinkHref={CROSSED_SWORDS_PATH}
                  x={tile.x - 20}
                  y={tile.y - 24}
                  width={40}
                  height={40}
                  onError={(e) => {
                    (e.target as SVGImageElement).style.display = "none";
                  }}
                />
                <text
                  x={tile.x}
                  y={tile.y + 2}
                  textAnchor="middle"
                  className={styles.battleText}
                >
                  ⚔️
                </text>
                {/* Army counts and progress bar — only if we have detail data */}
                {(() => {
                  const bf = activeBattlefield;
                  if (!bf || reducedVisualLoad) return null;
                  return (
                    <>
                      {/* Attacker count badge (left) */}
                      <rect
                        x={tile.x - 30}
                        y={tile.y + 6}
                        width={26}
                        height={12}
                        rx={3}
                        className={styles.battleArmyBadge}
                        fill="rgba(220,80,40,0.85)"
                      />
                      <text
                        x={tile.x - 17}
                        y={tile.y + 15}
                        textAnchor="middle"
                        className={styles.battleArmyLabel}
                      >
                        {bf.attackerArmyLabel}
                      </text>
                      {/* Defender count badge (right) */}
                      <rect
                        x={tile.x + 4}
                        y={tile.y + 6}
                        width={26}
                        height={12}
                        rx={3}
                        className={styles.battleArmyBadge}
                        fill="rgba(40,120,220,0.85)"
                      />
                      <text
                        x={tile.x + 17}
                        y={tile.y + 15}
                        textAnchor="middle"
                        className={styles.battleArmyLabel}
                      >
                        {bf.defenderArmyLabel}
                      </text>
                      {/* Progress bar background */}
                      <rect
                        x={tile.x - 22}
                        y={tile.y + 20}
                        width={44}
                        height={4}
                        rx={2}
                        fill="rgba(0,0,0,0.5)"
                      />
                      {/* Progress bar fill */}
                      <rect
                        x={tile.x - 22}
                        y={tile.y + 20}
                        width={Math.max(
                          2,
                          Math.round(44 * Math.min(1, bf.progress / 100))
                        )}
                        height={4}
                        rx={2}
                        fill={
                          bf.momentumTier === "ATTACKER_STRONG" ||
                          bf.momentumTier === "ATTACKER_EDGE"
                            ? "#ff6b35"
                            : bf.momentumTier === "DEFENDER_STRONG" ||
                                bf.momentumTier === "DEFENDER_EDGE"
                              ? "#4488ff"
                              : "#ffd700"
                        }
                      />
                      {/* Incoming reinforcement arrows */}
                      {bf.incomingAttackerArmy > 0 ? (
                        <text
                          x={tile.x - 30}
                          y={tile.y - 26}
                          className={styles.battleReinforceArrow}
                        >
                          ▲{bf.incomingAttackerArmy}
                        </text>
                      ) : null}
                      {bf.incomingDefenderArmy > 0 ? (
                        <text
                          x={tile.x + 30}
                          y={tile.y - 26}
                          textAnchor="end"
                          className={styles.battleReinforceArrow}
                        >
                          ▲{bf.incomingDefenderArmy}
                        </text>
                      ) : null}
                    </>
                  );
                })()}
              </g>
            ) : null}
          </g>
        );
      })}
    </svg>
  );
});

function formatSecondsRemaining(seconds: number) {
  if (seconds < 60) {
    return `${seconds}s`;
  }

  return `${Math.ceil(seconds / 60)}m`;
}

// ── March Path Interpolation ─────────────────────────────────────────────────

function splitPathAtProgress(
  waypoints: Array<{ x: number; y: number }>,
  progress: number
): {
  currentPoint: { x: number; y: number };
  completedPoints: Array<{ x: number; y: number }>;
  remainingPoints: Array<{ x: number; y: number }>;
} {
  if (waypoints.length <= 1) {
    const point = waypoints[0] ?? { x: 0, y: 0 };
    return {
      currentPoint: point,
      completedPoints: [point],
      remainingPoints: [point],
    };
  }

  const clamped = Math.max(0, Math.min(1, progress));
  const segments: { from: Point; to: Point; length: number }[] = [];
  let totalLength = 0;

  for (let i = 0; i < waypoints.length - 1; i++) {
    const dx = waypoints[i + 1].x - waypoints[i].x;
    const dy = waypoints[i + 1].y - waypoints[i].y;
    const length = Math.sqrt(dx * dx + dy * dy);
    segments.push({ from: waypoints[i], to: waypoints[i + 1], length });
    totalLength += length;
  }

  if (totalLength <= 0) {
    return {
      currentPoint: waypoints[0],
      completedPoints: [waypoints[0]],
      remainingPoints: [waypoints[0]],
    };
  }

  const targetDistance = clamped * totalLength;
  let accumulated = 0;

  for (let segmentIndex = 0; segmentIndex < segments.length; segmentIndex++) {
    const segment = segments[segmentIndex];
    const segmentEnd = accumulated + segment.length;

    if (segmentEnd >= targetDistance) {
      const segmentProgress =
        segment.length <= 0
          ? 0
          : (targetDistance - accumulated) / segment.length;
      const currentPoint = {
        x: segment.from.x + (segment.to.x - segment.from.x) * segmentProgress,
        y: segment.from.y + (segment.to.y - segment.from.y) * segmentProgress,
      };

      return {
        currentPoint,
        completedPoints: [
          ...waypoints.slice(0, segmentIndex + 1),
          currentPoint,
        ],
        remainingPoints: [currentPoint, ...waypoints.slice(segmentIndex + 1)],
      };
    }

    accumulated = segmentEnd;
  }

  const currentPoint = waypoints[waypoints.length - 1];
  return {
    currentPoint,
    completedPoints: [...waypoints],
    remainingPoints: [currentPoint],
  };
}

function pointsToPolyline(points: Array<{ x: number; y: number }>) {
  return points.map((point) => `${point.x},${point.y}`).join(" ");
}

function useMapMotionClock(enabled: boolean, intervalMs: number) {
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    if (!enabled) {
      return;
    }

    let animationFrameId = 0;
    let lastTickAt = 0;

    const tick = () => {
      const nextNow = Date.now();
      if (lastTickAt === 0 || nextNow - lastTickAt >= intervalMs) {
        lastTickAt = nextNow;
        setNowMs(nextNow);
      }
      animationFrameId = window.requestAnimationFrame(tick);
    };

    animationFrameId = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(animationFrameId);
  }, [enabled, intervalMs]);

  return nowMs;
}

// ── Attack Units Layer ───────────────────────────────────────────────────────

function AttackUnitsLayer({
  attackUnits,
  onRecallAttackUnit,
  onInstantRecallAttackUnit,
}: {
  attackUnits: AttackUnitMarker[];
  onRecallAttackUnit?: (attackUnit: AttackUnitMarker) => void | Promise<void>;
  onInstantRecallAttackUnit?: (
    attackUnit: AttackUnitMarker
  ) => void | Promise<void>;
}) {
  const nowMs = useMapMotionClock(
    attackUnits.length > 0,
    attackUnits.length > 10 ? 600 : 300
  );
  const [selectedUnitId, setSelectedUnitId] = useState<string | null>(null);
  const [recallPendingId, setRecallPendingId] = useState<string | null>(null);

  const attackUnitViews = useMemo(
    () =>
      attackUnits.map((unit) => {
        const unitCosmeticVariant = getEffectiveUnitCosmeticVariant({
          variant: unit.attacker.unitCosmeticVariant,
          race: unit.attacker.race,
          seed: unit.attacker.id,
        });
        const skinStyle = getCosmeticSpriteStyle(
          "UNIT",
          unitCosmeticVariant
        );
        const isReturning = Boolean(unit.recalledAt);
        const routeOrigin = isReturning
          ? (unit.returnOrigin ?? {
              mapX: unit.target.mapX,
              mapY: unit.target.mapY,
            })
          : unit.attacker;
        const routeTarget = isReturning ? unit.attacker : unit.target;
        const origin = snapMapPointToHex({
          x: routeOrigin.mapX,
          y: routeOrigin.mapY,
        });
        const target = snapMapPointToHex({
          x: routeTarget.mapX,
          y: routeTarget.mapY,
        });
        const presentation = getAttackPresentation(
          {
            launchedAt: unit.recalledAt ?? unit.launchedAt,
            arrivesAt: unit.arrivesAt,
          },
          nowMs
        );
        const progress = presentation.progress;

        let waypoints: Array<{ x: number; y: number }> = [origin, target];
        const routeTiles =
          !isReturning && unit.routeTileIds && unit.routeTileIds.length > 1
            ? unit.routeTileIds
                .map((tileId) => HEX_TILE_BY_ID.get(tileId))
                .filter((tile): tile is (typeof HEX_TILES)[number] =>
                  Boolean(tile)
                )
            : [];

        if (routeTiles.length > 1) {
          waypoints = routeTiles.map((tile) => ({
            x: tile.xPercent,
            y: tile.yPercent,
          }));
        } else {
          const startHex = findNearestHexTile(origin);
          const endHex = findNearestHexTile(target);
          const startTile = startHex ? PATH_HEX_LOOKUP.get(startHex.id) : null;
          const endTile = endHex ? PATH_HEX_LOOKUP.get(endHex.id) : null;

          const tilePath =
            startTile && endTile
              ? findSimplePath(startTile, endTile, PATH_HEX_LOOKUP)
              : null;
          if (tilePath) {
            waypoints = tilePath.map((tileId) => {
              const tile = HEX_TILE_BY_ID.get(tileId);
              return tile ? { x: tile.xPercent, y: tile.yPercent } : origin;
            });
          }
        }

        const splitPath = splitPathAtProgress(waypoints, progress);
        const secondsRemaining = Math.max(
          0,
          Math.ceil((new Date(unit.arrivesAt).getTime() - nowMs) / 1000)
        );
        const anchorPoint = presentation.isImpacting
          ? (waypoints[waypoints.length - 1] ?? target)
          : splitPath.currentPoint;
        const statusText = isReturning
          ? "returning home"
          : unit.kind === "BATTALION_REINFORCEMENT"
            ? "reinforcing battalion"
            : unit.kind === "BATTLEFIELD_REINFORCEMENT"
              ? "reinforcing battlefield"
              : unit.kind === "FORTIFY"
                ? "fortifying"
                : "on the way";
        const pathColor = isReturning
          ? "#4da6ff"
          : unit.kind === "BATTALION_REINFORCEMENT"
            ? "#44d17a"
            : unit.kind === "BATTLEFIELD_REINFORCEMENT"
              ? "#79d7ff"
              : unit.kind === "FORTIFY"
                ? "#f7c948"
                : "#ff8c42";
        const pathDasharray = isReturning ? "4 3" : "4 2";
        const unitTitle =
          unit.kind === "BATTALION_REINFORCEMENT"
            ? `Reinforcing ${unit.targetBattalionName ?? unit.target.name}`
            : unit.kind === "BATTLEFIELD_REINFORCEMENT"
              ? `Reinforcing ${unit.reinforcementSide?.toLowerCase() ?? "battlefield"} side`
              : unit.target.name;

        return {
          unit,
          unitCosmeticVariant,
          skinStyle,
          presentation,
          waypoints,
          splitPath,
          secondsRemaining,
          anchorPoint,
          statusText,
          pathColor,
          pathDasharray,
          unitTitle,
        };
      }),
    [attackUnits, nowMs]
  );

  const crowdedAttackLayer = attackUnitViews.length > 8;
  const visibleRouteViews = attackUnitViews.filter(
    (view) =>
      view.waypoints.length > 1 &&
      view.presentation.showSprite &&
      (!crowdedAttackLayer || selectedUnitId === view.unit.id)
  );

  if (attackUnits.length === 0) {
    return null;
  }

  return (
    <div className={styles.attackLayer} aria-label="Active attacks">
      {visibleRouteViews.length > 0 ? (
        <svg
          className={styles.marchPathSvg}
          data-crowded={crowdedAttackLayer ? "true" : "false"}
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          {visibleRouteViews.map((view) => (
            <Fragment key={`route-${view.unit.id}`}>
              <polyline
                className={styles.marchRouteTrack}
                points={pointsToPolyline(view.waypoints)}
                fill="none"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <polyline
                className={styles.marchRouteCompleted}
                points={pointsToPolyline(view.splitPath.completedPoints)}
                fill="none"
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{ "--march-color": view.pathColor } as CSSProperties}
              />
              <polyline
                className={styles.marchRouteRemaining}
                points={pointsToPolyline(view.splitPath.remainingPoints)}
                fill="none"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeDasharray={view.pathDasharray}
                style={{ "--march-color": view.pathColor } as CSSProperties}
              />
            </Fragment>
          ))}
        </svg>
      ) : null}
      {attackUnitViews.map((view) => {
        const { unit } = view;
        const selected = selectedUnitId === unit.id;

        return (
          <Fragment key={unit.id}>
            <button
              type="button"
              className={`${styles.attackUnit} ${
                view.presentation.isImpacting ? styles.attackUnitImpacting : ""
              } ${selected ? styles.attackUnitSelected : ""}`}
              style={{
                left: `${view.anchorPoint.x}%`,
                top: `${view.anchorPoint.y}%`,
              }}
              onPointerDown={(event) => event.stopPropagation()}
              onClick={(event) => {
                event.stopPropagation();
                setSelectedUnitId((currentId) =>
                  currentId === unit.id ? null : unit.id
                );
              }}
              aria-pressed={selected}
              aria-label={`${unit.attacker.name} army ${view.statusText}. ${view.secondsRemaining} seconds remaining.`}
            >
              {view.presentation.showSprite ? (
                <>
                  <span
                    className={styles.attackUnitSprite}
                    data-variant={unit.attacker.unitSpriteVariant}
                    data-skin={view.unitCosmeticVariant ?? undefined}
                    style={view.skinStyle ?? undefined}
                  />
                  <span
                    className={styles.attackUnitPresence}
                    aria-hidden="true"
                  />
                </>
              ) : (
                <span className={styles.attackImpactPulse} aria-hidden="true" />
              )}
            </button>

            {selected ? (
              <div
                className={styles.attackUnitPopover}
                style={{
                  left: `${view.anchorPoint.x}%`,
                  top: `${view.anchorPoint.y}%`,
                }}
                onPointerDown={(event) => event.stopPropagation()}
                onClick={(event) => event.stopPropagation()}
              >
                <strong>
                  Army unit
                </strong>
                <span>{view.unitTitle}</span>
                <span>{view.statusText}</span>
                <em>{formatSecondsRemaining(view.secondsRemaining)} ETA</em>
                {unit.roadSavedSeconds && unit.roadSavedSeconds > 0 ? (
                  <span className={styles.attackUnitRoadBonus}>
                    Roads saved {formatSecondsRemaining(unit.roadSavedSeconds)}
                    {unit.roadSpeedMultiplier && unit.roadSpeedMultiplier > 1
                      ? ` (${unit.roadSpeedMultiplier.toFixed(2)}x)`
                      : ""}
                  </span>
                ) : null}
                {unit.canRecall && onRecallAttackUnit ? (
                  <button
                    type="button"
                    disabled={recallPendingId === unit.id}
                    onClick={async () => {
                      setRecallPendingId(unit.id);

                      try {
                        await onRecallAttackUnit(unit);
                        setSelectedUnitId(null);
                      } finally {
                        setRecallPendingId(null);
                      }
                    }}
                  >
                    {recallPendingId === unit.id ? "Recalling..." : "Recall"}
                  </button>
                ) : null}
                {unit.canInstantRecall && onInstantRecallAttackUnit ? (
                  <button
                    type="button"
                    disabled={recallPendingId === unit.id}
                    onClick={async () => {
                      setRecallPendingId(unit.id);

                      try {
                        await onInstantRecallAttackUnit(unit);
                        setSelectedUnitId(null);
                      } finally {
                        setRecallPendingId(null);
                      }
                    }}
                  >
                    {recallPendingId === unit.id
                      ? "Recalling..."
                      : "Instant Recall"}
                  </button>
                ) : null}
              </div>
            ) : null}
          </Fragment>
        );
      })}
    </div>
  );
}

const RoadsLayer = memo(function RoadsLayer({
  alliedRoads,
  tradeRouteLines,
  roadEdges,
  showRoadLegend,
  reducedVisualLoad,
}: {
  alliedRoads: NonNullable<FortressMapProps["alliedRoads"]>;
  tradeRouteLines: NonNullable<FortressMapProps["tradeRouteLines"]>;
  roadEdges: RoadEdge[];
  showRoadLegend: boolean;
  reducedVisualLoad: boolean;
}) {
  if (
    alliedRoads.length === 0 &&
    tradeRouteLines.length === 0 &&
    roadEdges.length === 0 &&
    !showRoadLegend
  ) {
    return null;
  }

  return (
    <>
      {alliedRoads.length > 0 ||
      tradeRouteLines.length > 0 ||
      roadEdges.length > 0 ? (
        <svg
          className={styles.roadsLayer}
          viewBox={`0 0 ${MAP_WORLD_WIDTH} ${MAP_WORLD_HEIGHT}`}
          aria-hidden="true"
        >
          {alliedRoads.map((road, i) => (
            <g key={`ally-${i}`} className={styles.alliedRouteSegment}>
              <line
                x1={(road.x1 * MAP_WORLD_WIDTH) / 100}
                y1={(road.y1 * MAP_WORLD_HEIGHT) / 100}
                x2={(road.x2 * MAP_WORLD_WIDTH) / 100}
                y2={(road.y2 * MAP_WORLD_HEIGHT) / 100}
                className={styles.routeBed}
                strokeWidth={5.2}
              />
              <line
                x1={(road.x1 * MAP_WORLD_WIDTH) / 100}
                y1={(road.y1 * MAP_WORLD_HEIGHT) / 100}
                x2={(road.x2 * MAP_WORLD_WIDTH) / 100}
                y2={(road.y2 * MAP_WORLD_HEIGHT) / 100}
                className={styles.alliedRouteLine}
                strokeWidth={2.8}
              />
              {!reducedVisualLoad ? (
                <line
                  x1={(road.x1 * MAP_WORLD_WIDTH) / 100}
                  y1={(road.y1 * MAP_WORLD_HEIGHT) / 100}
                  x2={(road.x2 * MAP_WORLD_WIDTH) / 100}
                  y2={(road.y2 * MAP_WORLD_HEIGHT) / 100}
                  className={styles.alliedRoutePulse}
                  strokeWidth={0.9}
                />
              ) : null}
            </g>
          ))}
          {tradeRouteLines.map((route, i) => {
            const routeWidth = Math.min(
              5.2,
              2.3 + Math.log2(Math.max(1, route.deliveries)) * 0.42
            );
            return (
              <g key={`trade-${i}`} className={styles.tradeRouteSegment}>
                <line
                  x1={(route.x1 * MAP_WORLD_WIDTH) / 100}
                  y1={(route.y1 * MAP_WORLD_HEIGHT) / 100}
                  x2={(route.x2 * MAP_WORLD_WIDTH) / 100}
                  y2={(route.y2 * MAP_WORLD_HEIGHT) / 100}
                  className={styles.tradeRouteBed}
                  strokeWidth={routeWidth + 3.2}
                />
                <line
                  x1={(route.x1 * MAP_WORLD_WIDTH) / 100}
                  y1={(route.y1 * MAP_WORLD_HEIGHT) / 100}
                  x2={(route.x2 * MAP_WORLD_WIDTH) / 100}
                  y2={(route.y2 * MAP_WORLD_HEIGHT) / 100}
                  className={styles.tradeRouteLine}
                  strokeWidth={routeWidth}
                />
                {!reducedVisualLoad ? (
                  <line
                    x1={(route.x1 * MAP_WORLD_WIDTH) / 100}
                    y1={(route.y1 * MAP_WORLD_HEIGHT) / 100}
                    x2={(route.x2 * MAP_WORLD_WIDTH) / 100}
                    y2={(route.y2 * MAP_WORLD_HEIGHT) / 100}
                    className={styles.tradeRouteCargo}
                    strokeWidth={Math.max(0.8, routeWidth * 0.32)}
                  />
                ) : null}
              </g>
            );
          })}
          {roadEdges.map((edge, i) => {
            const x1 = (edge.x1 * MAP_WORLD_WIDTH) / 100;
            const y1 = (edge.y1 * MAP_WORLD_HEIGHT) / 100;
            const x2 = (edge.x2 * MAP_WORLD_WIDTH) / 100;
            const y2 = (edge.y2 * MAP_WORLD_HEIGHT) / 100;
            return (
              <g
                key={`road-${i}`}
                className={styles.roadSegment}
                data-level={getRoadLevelKey(edge.level)}
              >
                <title>
                  {`${getRoadLabel(edge.level)} - ${edge.crossings} crossings - ${getRoadSpeedLabel(edge.level)} speed`}
                </title>
                <line
                  x1={x1}
                  y1={y1}
                  x2={x2}
                  y2={y2}
                  className={styles.roadBed}
                  strokeWidth={getRoadBedStrokeWidth(edge.level)}
                />
                <line
                  x1={x1}
                  y1={y1}
                  x2={x2}
                  y2={y2}
                  className={styles.roadSurface}
                  strokeWidth={getRoadStrokeWidth(edge.level)}
                />
                {!reducedVisualLoad ? (
                  <>
                    <line
                      x1={x1}
                      y1={y1}
                      x2={x2}
                      y2={y2}
                      className={styles.roadTexture}
                      strokeWidth={getRoadDetailStrokeWidth(edge.level)}
                    />
                    <line
                      x1={x1}
                      y1={y1}
                      x2={x2}
                      y2={y2}
                      className={styles.roadCenter}
                      strokeWidth={getRoadDetailStrokeWidth(edge.level)}
                    />
                  </>
                ) : null}
              </g>
            );
          })}
        </svg>
      ) : null}
      {showRoadLegend ? (
        <div className={styles.roadLegend} aria-label="Road speeds">
          <span className={styles.roadLegendItem}>
            <i className={styles.roadLegendSwatch} data-level="dirt" />
            Dirt 1.15x
          </span>
          <span className={styles.roadLegendItem}>
            <i className={styles.roadLegendSwatch} data-level="stone" />
            Stone 1.3x
          </span>
          <span className={styles.roadLegendItem}>
            <i className={styles.roadLegendSwatch} data-level="highway" />
            Highway 1.5x
          </span>
        </div>
      ) : null}
    </>
  );
});

type GuardMarkerView = {
  tileId: string;
  unitSpriteVariant: string;
  unitCosmeticVariant: string | null;
};

const GuardMarkersLayer = memo(function GuardMarkersLayer({
  guardMarkers,
}: {
  guardMarkers: GuardMarkerView[];
}) {
  if (guardMarkers.length === 0) {
    return null;
  }

  return (
    <div className={styles.guardsLayer} aria-label="Garrisoned units">
      {guardMarkers.map((marker) => {
        const tile = HEX_TILE_BY_ID.get(marker.tileId);
        if (!tile) return null;

        return (
          <div
            key={marker.tileId}
            className={styles.guardMarker}
            style={{
              left: `${tile.xPercent}%`,
              top: `${tile.yPercent}%`,
            }}
          >
            <span
              className={styles.guardSprite}
              data-variant={marker.unitSpriteVariant}
              data-skin={marker.unitCosmeticVariant ?? undefined}
              style={
                getCosmeticSpriteStyle("UNIT", marker.unitCosmeticVariant) ??
                undefined
              }
              aria-hidden="true"
            />
            <span className={styles.guardPresence} aria-hidden="true" />
          </div>
        );
      })}
    </div>
  );
});

const BattalionMarkersLayer = memo(function BattalionMarkersLayer({
  battalionMarkers,
  mapHexes,
  reducedVisualLoad,
}: {
  battalionMarkers: NonNullable<FortressMapProps["battalionMarkers"]>;
  mapHexes: MapHexOwnershipMarker[];
  reducedVisualLoad: boolean;
}) {
  const patrolByMarkerIndex = useMemo(() => {
    const markerPatrols = new Map<
      number,
      {
        path: Array<{ xPercent: number; yPercent: number }>;
        legMs: number;
      }
    >();

    if (battalionMarkers.length === 0) {
      return markerPatrols;
    }

    const ownerByTileId = new Map(
      mapHexes
        .filter((hex) => hex.ownerFortressId != null)
        .map((hex) => [hex.tileId, hex.ownerFortressId!])
    );
    const PATROL_LEG_MS = 12_000;

    for (let i = 0; i < battalionMarkers.length; i++) {
      const marker = battalionMarkers[i];
      const garrisonTile = HEX_TILE_BY_ID.get(marker.tileId);
      if (!garrisonTile) continue;

      const garrisonHex: PathHexTile = {
        id: garrisonTile.id,
        col: garrisonTile.col,
        row: garrisonTile.row,
      };
      const neighbors = getHexNeighbors(garrisonHex, PATH_HEX_BY_COORD);
      const ownedNeighbors = neighbors.filter(
        (neighbor) => ownerByTileId.get(neighbor.id) === marker.fortressId
      );

      if (ownedNeighbors.length === 0) continue;

      const path: Array<{ xPercent: number; yPercent: number }> = [
        { xPercent: garrisonTile.xPercent, yPercent: garrisonTile.yPercent },
      ];

      for (const neighbor of ownedNeighbors.slice(0, 3)) {
        const neighborTile = HEX_TILE_BY_ID.get(neighbor.id);
        if (neighborTile) {
          path.push({
            xPercent: neighborTile.xPercent,
            yPercent: neighborTile.yPercent,
          });
        }
      }

      path.push({
        xPercent: garrisonTile.xPercent,
        yPercent: garrisonTile.yPercent,
      });

      markerPatrols.set(i, { path, legMs: PATROL_LEG_MS });
    }

    return markerPatrols;
  }, [battalionMarkers, mapHexes]);

  const patrolNowMs = useMapMotionClock(
    patrolByMarkerIndex.size > 0,
    reducedVisualLoad ? 2200 : 900
  );

  if (battalionMarkers.length === 0) {
    return null;
  }

  return (
    <div className={styles.battalionLayer} aria-label="Battalion units">
      {battalionMarkers.map((marker, markerIndex) => {
        const tile = HEX_TILE_BY_ID.get(marker.tileId);
        if (!tile) return null;

        let patrolXPercent = tile.xPercent;
        let patrolYPercent = tile.yPercent;
        let isPatrolling = false;
        const patrol = patrolByMarkerIndex.get(markerIndex);

        if (patrol && patrol.path.length >= 2) {
          isPatrolling = true;
          const cycleMs = (patrol.path.length - 1) * patrol.legMs;
          const elapsed = (patrolNowMs % (cycleMs || 1)) / (cycleMs || 1);
          const totalLegs = patrol.path.length - 1;
          const rawLeg = elapsed * totalLegs;
          const legIndex = Math.min(Math.floor(rawLeg), totalLegs - 1);
          const legProgress = rawLeg - legIndex;
          const from = patrol.path[legIndex];
          const to = patrol.path[legIndex + 1];

          patrolXPercent =
            from.xPercent + (to.xPercent - from.xPercent) * legProgress;
          patrolYPercent =
            from.yPercent + (to.yPercent - from.yPercent) * legProgress;
        }

        const tierLabel =
          marker.race && BATTALION_RACE_TIER_LABELS[marker.race]
            ? (BATTALION_RACE_TIER_LABELS[marker.race][marker.tier] ?? "?")
            : (["", "I", "II", "III"][marker.tier] ?? "?");
        const effectiveUnitCosmeticVariant = getEffectiveUnitCosmeticVariant({
          variant: marker.unitCosmeticVariant,
          race: marker.race as MapFortress["race"],
          seed: marker.fortressId,
        });

        return (
          <div
            key={`bn-${marker.tileId}-${marker.battalionName}`}
            className={`${styles.battalionMarker}${
              isPatrolling ? ` ${styles.battalionPatrol}` : ""
            }`}
            style={{
              left: `${patrolXPercent}%`,
              top: `${patrolYPercent}%`,
            }}
            title={`${marker.battalionName} - ${marker.mode} - Tier ${marker.tier}`}
          >
            <span
              className={styles.battalionSprite}
              data-variant={marker.unitSpriteVariant}
              data-skin={effectiveUnitCosmeticVariant ?? undefined}
              style={
                getCosmeticSpriteStyle("UNIT", effectiveUnitCosmeticVariant) ??
                undefined
              }
              aria-hidden="true"
            />
            <span
              className={styles.battalionBadge}
              style={{
                backgroundColor:
                  BATTALION_MODE_COLORS[marker.mode] ?? "#888888",
              }}
            >
              {tierLabel}
            </span>
          </div>
        );
      })}
    </div>
  );
});

const ConvoyMarkersLayer = memo(function ConvoyMarkersLayer({
  convoyMarkers,
  fortresses,
}: {
  convoyMarkers: NonNullable<FortressMapProps["convoyMarkers"]>;
  fortresses: MapFortress[];
}) {
  const convoyNowMs = useMapMotionClock(convoyMarkers.length > 0, 1000);
  const fortressById = useMemo(
    () => new Map(fortresses.map((fortress) => [fortress.id, fortress])),
    [fortresses]
  );

  if (convoyMarkers.length === 0) {
    return null;
  }

  return (
    <div className={styles.convoyLayer} aria-label="Trade convoys">
      {convoyMarkers.map((convoy) => {
        const from = fortressById.get(convoy.fromFortressId);
        const to = fortressById.get(convoy.toFortressId);
        if (!from || !to) return null;

        const totalCargo =
          convoy.gold +
          convoy.food +
          convoy.army +
          (convoy.points ?? 0) +
          (convoy.nukeFuel ?? 0) +
          (convoy.nukeRocket ?? 0) +
          (convoy.nukeWrathOfA ?? 0) +
          (convoy.deedTileId ? 1 : 0);
        const cargoLabel =
          convoy.cargoLabel ??
          ([
            convoy.deedTileId ? `tile ${convoy.deedTileId}` : null,
            convoy.gold > 0 ? `${convoy.gold}g` : null,
            convoy.food > 0 ? `${convoy.food}f` : null,
            convoy.army > 0 ? `${convoy.army} army` : null,
            convoy.points && convoy.points > 0 ? `${convoy.points} pts` : null,
          ]
            .filter(Boolean)
            .join(", ") ||
            "empty wagon");
        const progress =
          convoy.departedAt && convoy.arrivesAt
            ? Math.min(
                1,
                Math.max(
                  0,
                  (convoyNowMs - convoy.departedAt) /
                    (convoy.arrivesAt - convoy.departedAt)
                )
              )
            : 0;
        const x = from.mapX + (to.mapX - from.mapX) * progress;
        const y = from.mapY + (to.mapY - from.mapY) * progress;
        const angle =
          Math.atan2(to.mapY - from.mapY, to.mapX - from.mapX) *
          (180 / Math.PI);
        const secondsUntilArrival = convoy.arrivesAt
          ? Math.ceil((convoy.arrivesAt - convoyNowMs) / 1000)
          : null;
        const timingLabel =
          convoy.arrivedAwaitingTick ||
          (secondsUntilArrival !== null && secondsUntilArrival <= 0)
            ? "arrived, awaiting next tick"
            : secondsUntilArrival !== null
              ? secondsUntilArrival >= 3600
                ? `arrives in ${Math.ceil(secondsUntilArrival / 3600)}h`
                : `arrives in ${Math.max(1, Math.ceil(secondsUntilArrival / 60))}m`
              : "arrival pending";
        const tradeLevel = convoy.tradeLevel ?? 0;
        const senderRace = convoy.senderRace ?? from.race;
        const routeLabel = `${convoy.fromName ?? from.name} to ${convoy.toName ?? to.name}`;
        const escortUnitCosmeticVariant = getEffectiveUnitCosmeticVariant({
          variant: from.unitCosmeticVariant,
          race: from.race,
          seed: from.id,
        });

        return (
          <div
            key={convoy.id}
            className={styles.convoyMarker}
            style={
              {
                left: `${x}%`,
                top: `${y}%`,
                "--convoy-angle": `${angle}deg`,
              } as CSSProperties
            }
            title={`Trade wagon L${tradeLevel}: ${cargoLabel}; ${routeLabel}; ${timingLabel}`}
          >
            <span
              className={styles.convoyWagon}
              data-race={senderRace ?? undefined}
              data-level={tradeLevel}
              style={getTradeWagonSpriteStyle(senderRace, tradeLevel)}
              aria-hidden="true"
            />
            <span
              className={styles.convoyEscort}
              data-variant={from.unitSpriteVariant}
              data-skin={escortUnitCosmeticVariant ?? undefined}
              style={
                getCosmeticSpriteStyle("UNIT", escortUnitCosmeticVariant) ??
                undefined
              }
              aria-hidden="true"
            />
            <span className={styles.convoyLabel}>
              {convoy.arrivedAwaitingTick ? "Tick" : totalCargo}
            </span>
          </div>
        );
      })}
    </div>
  );
});

const FortressMarkersLayer = memo(function FortressMarkersLayer({
  fortresses,
  snappedFortressPositions,
  selectedFortressId,
  selectedTargetId,
  activeBattleFortressIdSet,
  pendingTargetId,
  ownFortress,
  maxTargetSentArmy,
  clampedTargetSentArmy,
  canSelectFortress,
  canConfirmAttackTarget,
  reducedVisualLoad,
  suppressClickRef,
  onConfirmAttackTarget,
  onTargetSentArmyChange,
  onPendingTargetChange,
  onMarkerPointerDown,
  onMarkerPointerMove,
  onMarkerPointerUp,
  onMarkerPointerCancel,
  onActivateFortress,
}: {
  fortresses: MapFortress[];
  snappedFortressPositions: Map<string, Point>;
  selectedFortressId?: string | null;
  selectedTargetId?: string | null;
  activeBattleFortressIdSet: Set<string>;
  pendingTargetId: string | null;
  ownFortress: MapFortress | null;
  maxTargetSentArmy: number;
  clampedTargetSentArmy: number;
  canSelectFortress: boolean;
  canConfirmAttackTarget: boolean;
  reducedVisualLoad: boolean;
  suppressClickRef: MutableRefObject<boolean>;
  onConfirmAttackTarget?: (
    fortress: MapFortress,
    sentArmy: number
  ) => void | Promise<void>;
  onTargetSentArmyChange: (sentArmy: number) => void;
  onPendingTargetChange: (fortressId: string | null) => void;
  onMarkerPointerDown: (
    event: ReactPointerEvent<HTMLButtonElement>,
    fortress: MapFortress,
    selectable: boolean
  ) => void;
  onMarkerPointerMove: (
    event: ReactPointerEvent<HTMLButtonElement>,
    fortressId: string
  ) => void;
  onMarkerPointerUp: (
    event: ReactPointerEvent<HTMLButtonElement>,
    fortressId: string
  ) => void;
  onMarkerPointerCancel: (
    event: ReactPointerEvent<HTMLButtonElement>,
    fortressId: string
  ) => void;
  onActivateFortress: (fortress: MapFortress) => void;
}) {
  if (fortresses.length === 0) {
    return (
      <div className={styles.emptyState}>
        No fortresses on the battlefield yet.
      </div>
    );
  }

  return (
    <>
      {fortresses.map((fortress) => {
        const snappedPosition =
          snappedFortressPositions.get(fortress.id) ??
          snapMapPointToHex({
            x: fortress.mapX,
            y: fortress.mapY,
          });
        const selectable =
          (canSelectFortress && fortress.isCurrentUser) ||
          (canSelectFortress && fortress.fortressKind === "MEGA") ||
          (canSelectFortress && activeBattleFortressIdSet.has(fortress.id)) ||
          (canConfirmAttackTarget && fortress.isTargetable);
        const variant = getSpriteVariant(fortress);
        const isMega = fortress.fortressKind === "MEGA";
        const isLootCamp = fortress.fortressKind === "LOOT_CAMP";
        const isDwarfRune = fortress.fortressKind === "DWARF_RUNE";
        const isUnicornDecoy = fortress.fortressKind === "UNICORN_DECOY";
        const showsHealth = fortress.fortressKind !== "PLAYER";
        const effectiveFortressSkin =
          fortress.fortressCosmeticVariant ??
          (fortress.race === "UNSTABLE_UNICORNS"
            ? `unstable-unicorn-${(hashString(fortress.spriteSeedId) % 2) + 1}`
            : null);
        const markerClassName = [
          styles.marker,
          isMega ? styles.megaMarker : "",
          isLootCamp ? styles.lootCampMarker : "",
          isDwarfRune ? styles.dwarfRuneMarker : "",
          isUnicornDecoy ? styles.unicornDecoyMarker : "",
          fortress.isSlayerOfA ? styles.crownedMarker : "",
          fortress.isCurrentUser ? styles.currentUser : "",
          selectedFortressId === fortress.id ? styles.activeFortress : "",
          selectedTargetId === fortress.id ? styles.selected : "",
          selectable ? styles.selectable : "",
          fortress.isTargetable ? styles.targetable : "",
          fortress.diplomacyStatus === "WAR" ? styles.warMarker : "",
          fortress.diplomacyStatus === "ALLIED" ? styles.alliedMarker : "",
        ]
          .filter(Boolean)
          .join(" ");

        const showTargetPopover =
          pendingTargetId === fortress.id && fortress.isTargetable;
        const travelMinutes =
          showTargetPopover && ownFortress
            ? getAttackTravelMinutes(ownFortress, fortress)
            : null;
        const showSelectionPulse =
          !reducedVisualLoad ||
          selectable ||
          fortress.isCurrentUser ||
          selectedFortressId === fortress.id ||
          selectedTargetId === fortress.id;
        const showTooltip =
          !reducedVisualLoad ||
          fortress.isCurrentUser ||
          selectedFortressId === fortress.id ||
          selectedTargetId === fortress.id ||
          showTargetPopover;

        return (
          <Fragment key={fortress.id}>
            <button
              type="button"
              className={markerClassName}
              style={{
                left: `${snappedPosition.x}%`,
                top: `${snappedPosition.y}%`,
              }}
              onPointerDown={(event) =>
                onMarkerPointerDown(event, fortress, selectable)
              }
              onPointerMove={(event) => onMarkerPointerMove(event, fortress.id)}
              onPointerUp={(event) => onMarkerPointerUp(event, fortress.id)}
              onPointerCancel={(event) =>
                onMarkerPointerCancel(event, fortress.id)
              }
              onClick={(event) => {
                if (event.detail !== 0 || suppressClickRef.current) {
                  event.preventDefault();
                  return;
                }

                onActivateFortress(fortress);
              }}
              aria-pressed={
                selectedTargetId === fortress.id ||
                selectedFortressId === fortress.id
              }
              aria-label={
                isMega
                  ? `${fortress.name}, ${fortress.health} of ${fortress.maxHealth} health`
                  : showsHealth
                    ? `${fortress.name}, ${fortress.health} of ${fortress.maxHealth} health`
                    : `${fortress.name}, ${fortress.points} points`
              }
            >
              {showSelectionPulse ? (
                <span className={styles.selectionPulse} />
              ) : null}
              {fortress.race && !fortress.isNpc ? (
                <span
                  className={styles.raceToken}
                  style={{
                    backgroundImage: `url("${RACE_TOKEN_PATHS[fortress.race]}")`,
                  }}
                />
              ) : null}
              <span className={styles.spriteFrame}>
                {isMega ? (
                  <MegaFortressSprite iconLabel={fortress.iconLabel ?? "A-"} />
                ) : isLootCamp ? (
                  <LootCampSprite variant={fortress.lootCampVariant} />
                ) : isDwarfRune ? (
                  <DwarfRuneSprite />
                ) : (
                  <FortressSprite
                    variant={variant}
                    skinVariant={effectiveFortressSkin}
                  />
                )}
              </span>
              {isMega ? (
                <span className={styles.pointsBadge}>
                  {fortress.health}/{fortress.maxHealth}
                </span>
              ) : showsHealth ? (
                <span className={styles.pointsBadge}>
                  {fortress.health}/{fortress.maxHealth}
                </span>
              ) : null}
              <span className={styles.nameplate}>{fortress.name}</span>
              {fortress.isSlayerOfA ? (
                <span className={styles.crownBadge}>Slayer of A</span>
              ) : null}
              {showTooltip ? (
                <span className={styles.tooltip}>
                  <strong>{fortress.name}</strong>
                  <span>
                    {isMega
                      ? `${fortress.health}/${fortress.maxHealth} HP`
                      : showsHealth
                        ? `${fortress.health}/${fortress.maxHealth} HP`
                        : `${fortress.points} pts${
                            fortress.isSlayerOfA ? " - Slayer of A" : ""
                          }`}
                  </span>
                </span>
              ) : null}
            </button>

            {showTargetPopover ? (
              <div
                className={styles.targetPopover}
                data-target-popover
                style={{
                  left: `${snappedPosition.x}%`,
                  top: `${snappedPosition.y}%`,
                }}
                onPointerDown={(event) => event.stopPropagation()}
              >
                <strong>{fortress.name}</strong>
                <span>
                  {showsHealth
                    ? `${fortress.health}/${fortress.maxHealth} HP`
                    : `${fortress.points} pts`}
                </span>
                {travelMinutes ? <em>{travelMinutes} min ETA</em> : null}
                <label className={styles.targetArmyControl}>
                  <span className={styles.targetArmyLabel}>
                    Army to send: {clampedTargetSentArmy}/{maxTargetSentArmy}
                  </span>
                  <input
                    type="range"
                    min={1}
                    max={Math.max(1, maxTargetSentArmy)}
                    step={1}
                    value={Math.max(1, clampedTargetSentArmy)}
                    disabled={maxTargetSentArmy <= 0}
                    onPointerDown={(event) => event.stopPropagation()}
                    onChange={(event) => {
                      const nextArmy = Number(event.currentTarget.value);
                      onTargetSentArmyChange(
                        Number.isFinite(nextArmy) ? Math.floor(nextArmy) : 1
                      );
                    }}
                  />
                </label>
                <button
                  type="button"
                  disabled={maxTargetSentArmy <= 0}
                  onPointerDown={(event) => event.stopPropagation()}
                  onClick={async () => {
                    onPendingTargetChange(null);
                    await onConfirmAttackTarget?.(
                      fortress,
                      clampedTargetSentArmy
                    );
                  }}
                >
                  Send {clampedTargetSentArmy || 0} army
                </button>
              </div>
            ) : null}
          </Fragment>
        );
      })}
    </>
  );
});

export const FortressMap = memo(function FortressMap({
  fortresses,
  mapHexes = [],
  attackUnits = [],
  selectedFortressId,
  selectedTargetId,
  selectedTileId,
  activeBattleFortressIds = [],
  highlightedTileIds = [],
  alliedRoads = [],
  tradeRouteLines = [],
  roadSegments = [],
  battalionMarkers = [],
  convoyMarkers = [],
  nukeBiddingMarker = null,
  battlefields = [],
  onSelectFortress,
  onConfirmAttackTarget,
  onSelectMapHex,
  onRecallAttackUnit,
  onInstantRecallAttackUnit,
  className,
}: FortressMapProps) {
  const shellRef = useRef<HTMLDivElement | null>(null);
  const lastAutoFocusKeyRef = useRef<string | null>(null);
  const userAdjustedViewRef = useRef(false);
  const pointerCacheRef = useRef<Map<number, Point>>(new Map());
  const markerTapStateRef = useRef<MarkerTapState | null>(null);
  const pinchStateRef = useRef<{
    startScale: number;
    startTranslateX: number;
    startTranslateY: number;
    midpoint: Point;
    distance: number;
  } | null>(null);
  const suppressClickRef = useRef(false);

  const [scale, setScale] = useState(1);
  const [translateX, setTranslateX] = useState(0);
  const [translateY, setTranslateY] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState<DragStart | null>(null);
  const [pendingTargetId, setPendingTargetId] = useState<string | null>(null);
  const [targetSentArmy, setTargetSentArmy] = useState(1);

  const ownFortress =
    fortresses.find((fortress) => fortress.isCurrentUser) ?? null;

  // Battlefield detail lookup: battlefieldId → BattlefieldIndicatorData
  const battlefieldById = useMemo(
    () => new Map(battlefields.map((bf) => [bf.id, bf])),
    [battlefields]
  );

  const guardMarkers = useMemo(() => {
    const spriteByFortressId = new Map(
      fortresses.map((f) => [
        f.id,
        {
          sprite: f.unitSpriteVariant,
          cosmetic: getEffectiveUnitCosmeticVariant({
            variant: f.unitCosmeticVariant,
            race: f.race,
            seed: f.id,
          }),
        },
      ])
    );
    return mapHexes
      .filter((hex) => hex.guardArmy != null && hex.guardArmy > 0)
      .map((hex) => {
        const info = hex.ownerFortressId
          ? spriteByFortressId.get(hex.ownerFortressId)
          : null;
        return {
          tileId: hex.tileId,
          unitSpriteVariant: info?.sprite ?? "unit-1",
          unitCosmeticVariant: info?.cosmetic ?? null,
        };
      });
  }, [mapHexes, fortresses]);

  const roadEdges = useMemo(
    () => computeRoadEdges(roadSegments, HEX_TILES),
    [roadSegments]
  );
  const ownedTileCount = useMemo(
    () =>
      mapHexes.reduce((count, hex) => count + (hex.ownerFortressId ? 1 : 0), 0),
    [mapHexes]
  );
  const reducedMapVisualLoad =
    attackUnits.length > 6 ||
    battlefields.length > 1 ||
    roadEdges.length + tradeRouteLines.length + alliedRoads.length >
      FULL_ROUTE_DETAIL_LIMIT ||
    ownedTileCount > FULL_LIFE_DOMAIN_TILE_LIMIT ||
    battalionMarkers.length > 10 ||
    convoyMarkers.length > 6;

  const snappedFortressPositions = useMemo(
    () =>
      new Map(
        fortresses.map((fortress) => [
          fortress.id,
          snapMapPointToHex({ x: fortress.mapX, y: fortress.mapY }),
        ])
      ),
    [fortresses]
  );
  const activeBattleFortressIdSet = useMemo(
    () => new Set(activeBattleFortressIds),
    [activeBattleFortressIds]
  );
  const maxTargetSentArmy = ownFortress?.army ?? 0;
  const clampedTargetSentArmy =
    maxTargetSentArmy > 0
      ? Math.min(Math.max(1, targetSentArmy), maxTargetSentArmy)
      : 0;

  const clampTranslation = useCallback(
    (nextX: number, nextY: number, nextScale: number) => {
      const shellBounds = shellRef.current?.getBoundingClientRect();

      if (!shellBounds) {
        return { x: nextX, y: nextY };
      }

      const visiblePaddingX = Math.min(shellBounds.width * 0.3, 180);
      const visiblePaddingY = Math.min(shellBounds.height * 0.3, 150);

      const maxX = Math.max(
        0,
        (MAP_WORLD_WIDTH * nextScale - shellBounds.width) / 2 + visiblePaddingX
      );
      const maxY = Math.max(
        0,
        (MAP_WORLD_HEIGHT * nextScale - shellBounds.height) / 2 +
          visiblePaddingY
      );

      return {
        x: clampValue(nextX, -maxX, maxX),
        y: clampValue(nextY, -maxY, maxY),
      };
    },
    []
  );

  const applyView = useCallback(
    (nextScale: number, nextX: number, nextY: number) => {
      const clampedScale = clampValue(nextScale, MIN_SCALE, MAX_SCALE);
      const clampedTranslate = clampTranslation(nextX, nextY, clampedScale);
      setScale(clampedScale);
      setTranslateX(clampedTranslate.x);
      setTranslateY(clampedTranslate.y);
    },
    [clampTranslation]
  );

  const resetView = useCallback(() => {
    userAdjustedViewRef.current = true;
    setScale(1);
    setTranslateX(0);
    setTranslateY(0);
    setIsDragging(false);
    setDragStart(null);
    setPendingTargetId(null);
    suppressClickRef.current = false;
    pointerCacheRef.current.clear();
    markerTapStateRef.current = null;
    pinchStateRef.current = null;
  }, []);

  const focusFortress = useCallback(
    (fortress: Pick<MapFortress, "id" | "mapX" | "mapY">) => {
      const snappedPosition = snapMapPointToHex({
        x: fortress.mapX,
        y: fortress.mapY,
      });
      const focusScale = clampValue(1.08, MIN_SCALE, MAX_SCALE);
      const worldX = (snappedPosition.x / 100) * MAP_WORLD_WIDTH;
      const worldY = (snappedPosition.y / 100) * MAP_WORLD_HEIGHT;
      const nextTranslateX = -(worldX - MAP_WORLD_WIDTH / 2) * focusScale;
      const nextTranslateY = -(worldY - MAP_WORLD_HEIGHT / 2) * focusScale;

      lastAutoFocusKeyRef.current = `${fortress.id}:${fortress.mapX}:${fortress.mapY}`;
      applyView(focusScale, nextTranslateX, nextTranslateY);
    },
    [applyView]
  );

  const zoomFromViewportPoint = useCallback(
    (nextScale: number, pointInShell?: Point) => {
      const shellBounds = shellRef.current?.getBoundingClientRect();
      if (!shellBounds) {
        applyView(nextScale, translateX, translateY);
        return;
      }

      const anchor = pointInShell ?? {
        x: shellBounds.width / 2,
        y: shellBounds.height / 2,
      };

      const anchorCenteredX = anchor.x - shellBounds.width / 2;
      const anchorCenteredY = anchor.y - shellBounds.height / 2;
      const clampedNextScale = clampValue(nextScale, MIN_SCALE, MAX_SCALE);
      const ratio = clampedNextScale / scale;

      const nextTranslateX =
        anchorCenteredX - (anchorCenteredX - translateX) * ratio;
      const nextTranslateY =
        anchorCenteredY - (anchorCenteredY - translateY) * ratio;

      applyView(clampedNextScale, nextTranslateX, nextTranslateY);
    },
    [applyView, scale, translateX, translateY]
  );

  const updatePinch = useCallback(() => {
    const activePointers = Array.from(pointerCacheRef.current.values());
    if (activePointers.length !== 2) {
      pinchStateRef.current = null;
      return;
    }

    const [pointerA, pointerB] = activePointers;
    const midpoint = {
      x: (pointerA.x + pointerB.x) / 2,
      y: (pointerA.y + pointerB.y) / 2,
    };
    const distance = Math.hypot(
      pointerB.x - pointerA.x,
      pointerB.y - pointerA.y
    );

    if (!pinchStateRef.current || pinchStateRef.current.distance === 0) {
      pinchStateRef.current = {
        startScale: scale,
        startTranslateX: translateX,
        startTranslateY: translateY,
        midpoint,
        distance,
      };
      return;
    }

    const pinchState = pinchStateRef.current;
    const shellBounds = shellRef.current?.getBoundingClientRect();
    if (!shellBounds) {
      return;
    }

    const ratio = distance / pinchState.distance;
    const nextScale = clampValue(
      pinchState.startScale * ratio,
      MIN_SCALE,
      MAX_SCALE
    );
    const scaleRatio = nextScale / pinchState.startScale;

    const anchorCenteredX = midpoint.x - shellBounds.width / 2;
    const anchorCenteredY = midpoint.y - shellBounds.height / 2;
    const startAnchorCenteredX = pinchState.midpoint.x - shellBounds.width / 2;
    const startAnchorCenteredY = pinchState.midpoint.y - shellBounds.height / 2;

    const nextTranslateX =
      anchorCenteredX -
      (startAnchorCenteredX - pinchState.startTranslateX) * scaleRatio;
    const nextTranslateY =
      anchorCenteredY -
      (startAnchorCenteredY - pinchState.startTranslateY) * scaleRatio;

    applyView(nextScale, nextTranslateX, nextTranslateY);
  }, [applyView, scale, translateX, translateY]);

  const viewTransform = useMemo(
    () => ({
      transform: `translate(-50%, -50%) translate(${translateX}px, ${translateY}px) scale(${scale})`,
      width: `${MAP_WORLD_WIDTH}px`,
      height: `${MAP_WORLD_HEIGHT}px`,
    }),
    [scale, translateX, translateY]
  );

  const activateFortress = useCallback(
    (fortress: MapFortress) => {
      const hasActiveBattle = activeBattleFortressIdSet.has(fortress.id);

      if (
        fortress.isCurrentUser ||
        fortress.fortressKind === "MEGA" ||
        hasActiveBattle
      ) {
        setPendingTargetId(null);
        onSelectFortress?.(fortress);
        return;
      }

      if (fortress.isTargetable) {
        setPendingTargetId((currentId) =>
          currentId === fortress.id ? null : fortress.id
        );
      }
    },
    [activeBattleFortressIdSet, onSelectFortress]
  );

  const handleMarkerPointerDown = useCallback(
    (
      event: ReactPointerEvent<HTMLButtonElement>,
      fortress: MapFortress,
      selectable: boolean
    ) => {
      if (!selectable) {
        return;
      }

      if (event.pointerType === "mouse" && event.button !== 0) {
        return;
      }

      event.stopPropagation();
      markerTapStateRef.current = {
        fortressId: fortress.id,
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        cancelled: false,
      };

      // Activate on press for immediate feedback; drag gestures still use map-level suppression.
      activateFortress(fortress);
    },
    [activateFortress]
  );

  const handleMarkerPointerMove = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>, fortressId: string) => {
      const tapState = markerTapStateRef.current;

      if (
        !tapState ||
        tapState.pointerId !== event.pointerId ||
        tapState.fortressId !== fortressId
      ) {
        return;
      }

      if (
        Math.hypot(
          event.clientX - tapState.startX,
          event.clientY - tapState.startY
        ) > CLICK_DRAG_THRESHOLD
      ) {
        tapState.cancelled = true;
      }
    },
    []
  );

  const clearMarkerTap = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>, fortressId: string) => {
      const tapState = markerTapStateRef.current;

      if (
        tapState &&
        tapState.pointerId === event.pointerId &&
        tapState.fortressId === fortressId
      ) {
        markerTapStateRef.current = null;
      }
    },
    []
  );

  const handleMarkerPointerUp = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>, fortressId: string) => {
      const tapState = markerTapStateRef.current;

      if (
        !tapState ||
        tapState.pointerId !== event.pointerId ||
        tapState.fortressId !== fortressId
      ) {
        return;
      }

      event.stopPropagation();
      markerTapStateRef.current = null;
    },
    []
  );

  useEffect(() => {
    if (!ownFortress) {
      return;
    }

    const focusKey = `${ownFortress.id}:${ownFortress.mapX}:${ownFortress.mapY}`;
    const lastFocusId = lastAutoFocusKeyRef.current?.split(":")[0] ?? null;
    const shouldFocus =
      lastAutoFocusKeyRef.current === null ||
      lastFocusId !== ownFortress.id ||
      (!userAdjustedViewRef.current &&
        lastAutoFocusKeyRef.current !== focusKey);

    if (shouldFocus) {
      focusFortress(ownFortress);
    }
  }, [focusFortress, ownFortress]);

  return (
    <div
      ref={shellRef}
      className={className ? `${styles.shell} ${className}` : styles.shell}
      role="application"
      aria-label="Battlefield map"
      onKeyDown={(event) => {
        if (
          event.key === "+" ||
          event.key === "=" ||
          event.key === "NumpadAdd"
        ) {
          event.preventDefault();
          userAdjustedViewRef.current = true;
          zoomFromViewportPoint(scale + ZOOM_STEP);
        }

        if (event.key === "-" || event.key === "NumpadSubtract") {
          event.preventDefault();
          userAdjustedViewRef.current = true;
          zoomFromViewportPoint(scale - ZOOM_STEP);
        }

        if (event.key === "0") {
          event.preventDefault();
          resetView();
        }
      }}
      tabIndex={0}
    >
      <div className={styles.controls}>
        <button
          type="button"
          className={styles.controlButton}
          aria-label="Zoom in"
          onClick={() => {
            userAdjustedViewRef.current = true;
            zoomFromViewportPoint(scale + ZOOM_STEP);
          }}
        >
          +
        </button>
        <button
          type="button"
          className={styles.controlButton}
          aria-label="Zoom out"
          onClick={() => {
            userAdjustedViewRef.current = true;
            zoomFromViewportPoint(scale - ZOOM_STEP);
          }}
        >
          -
        </button>
        <button
          type="button"
          className={`${styles.controlButton} ${styles.resetButton}`}
          aria-label="Reset view"
          onClick={resetView}
        >
          0
        </button>
        {ownFortress ? (
          <button
            type="button"
            className={`${styles.controlButton} ${styles.focusButton}`}
            aria-label="Focus my fortress"
            onClick={() => {
              userAdjustedViewRef.current = false;
              focusFortress(ownFortress);
            }}
          >
            Me
          </button>
        ) : null}
      </div>

      <div
        className={`${styles.viewport} ${isDragging ? styles.dragging : ""}`}
        onWheel={(event) => {
          event.preventDefault();
          userAdjustedViewRef.current = true;
          setPendingTargetId(null);
          const shellBounds = shellRef.current?.getBoundingClientRect();
          if (!shellBounds) {
            return;
          }

          const zoomDirection = event.deltaY < 0 ? 1 : -1;
          const nextScale = scale + zoomDirection * ZOOM_STEP;
          zoomFromViewportPoint(nextScale, {
            x: event.clientX - shellBounds.left,
            y: event.clientY - shellBounds.top,
          });
        }}
        onPointerDownCapture={(event) => {
          const shellBounds = shellRef.current?.getBoundingClientRect();
          if (!shellBounds) {
            return;
          }

          const isInPopover = (event.target as HTMLElement).closest(
            "[data-target-popover]"
          );
          if (isInPopover) {
            return;
          }

          setPendingTargetId(null);
          markerTapStateRef.current = null;

          const point = {
            x: event.clientX - shellBounds.left,
            y: event.clientY - shellBounds.top,
          };

          pointerCacheRef.current.set(event.pointerId, point);

          if (pointerCacheRef.current.size === 1) {
            setIsDragging(true);
            setDragStart({
              x: event.clientX,
              y: event.clientY,
              translateX,
              translateY,
            });
            suppressClickRef.current = false;
            pinchStateRef.current = null;
          }

          if (pointerCacheRef.current.size >= 2) {
            setIsDragging(false);
            setDragStart(null);
            suppressClickRef.current = true;
            updatePinch();
            (event.currentTarget as HTMLDivElement).setPointerCapture(
              event.pointerId
            );
          }
        }}
        onPointerMove={(event) => {
          const shellBounds = shellRef.current?.getBoundingClientRect();
          if (!shellBounds) {
            return;
          }

          const point = {
            x: event.clientX - shellBounds.left,
            y: event.clientY - shellBounds.top,
          };

          if (pointerCacheRef.current.has(event.pointerId)) {
            pointerCacheRef.current.set(event.pointerId, point);
          }

          if (pointerCacheRef.current.size >= 2) {
            suppressClickRef.current = true;
            updatePinch();
            return;
          }

          if (!dragStart) {
            return;
          }

          const deltaX = event.clientX - dragStart.x;
          const deltaY = event.clientY - dragStart.y;

          if (Math.hypot(deltaX, deltaY) > CLICK_DRAG_THRESHOLD) {
            suppressClickRef.current = true;
            userAdjustedViewRef.current = true;
            (event.currentTarget as HTMLDivElement).setPointerCapture(
              event.pointerId
            );
          }

          const nextTranslate = clampTranslation(
            dragStart.translateX + deltaX,
            dragStart.translateY + deltaY,
            scale
          );
          setTranslateX(nextTranslate.x);
          setTranslateY(nextTranslate.y);
        }}
        onPointerUpCapture={(event) => {
          pointerCacheRef.current.delete(event.pointerId);
          pinchStateRef.current = null;

          if (pointerCacheRef.current.size === 0) {
            setIsDragging(false);
            setDragStart(null);
            window.setTimeout(() => {
              suppressClickRef.current = false;
            }, 0);
          }
        }}
        onPointerCancelCapture={(event) => {
          pointerCacheRef.current.delete(event.pointerId);
          pinchStateRef.current = null;
          setIsDragging(false);
          setDragStart(null);
          suppressClickRef.current = false;
        }}
      >
        <div
          className={styles.viewportContent}
          data-reduced-visual-load={reducedMapVisualLoad ? "true" : "false"}
          style={viewTransform}
        >
          <HexTileMap
            mapHexes={mapHexes}
            selectedTileId={selectedTileId}
            highlightedTileIds={highlightedTileIds}
            onSelectMapHex={onSelectMapHex}
            battlefieldById={battlefieldById}
            reducedVisualLoad={reducedMapVisualLoad}
          />
          <RoadsLayer
            alliedRoads={alliedRoads}
            tradeRouteLines={tradeRouteLines}
            roadEdges={roadEdges}
            showRoadLegend={roadSegments.length > 0}
            reducedVisualLoad={reducedMapVisualLoad}
          />
          <MapLifeLayer
            mapHexes={mapHexes}
            roadEdges={roadEdges}
            tradeRouteLines={tradeRouteLines}
            battlefields={battlefields}
            fortresses={fortresses}
            reducedVisualLoad={reducedMapVisualLoad}
          />
          <AttackUnitsLayer
            attackUnits={attackUnits}
            onRecallAttackUnit={onRecallAttackUnit}
            onInstantRecallAttackUnit={onInstantRecallAttackUnit}
          />
          <GuardMarkersLayer guardMarkers={guardMarkers} />
          <BattalionMarkersLayer
            battalionMarkers={battalionMarkers}
            mapHexes={mapHexes}
            reducedVisualLoad={reducedMapVisualLoad}
          />
          {nukeBiddingMarker ? (
            <div className={styles.nukeBiddingLayer} aria-label="Nuke bidding">
              {(() => {
                const tile = HEX_TILES.find((candidate) =>
                  isHomeOfATile(candidate.id)
                );
                if (!tile) return null;

                return (
                  <button
                    type="button"
                    className={styles.nukeBiddingMarker}
                    data-open={nukeBiddingMarker.isOpen ? "true" : "false"}
                    style={{
                      left: `${tile.xPercent + 3}%`,
                      top: `${tile.yPercent - 4}%`,
                    }}
                    title={
                      nukeBiddingMarker.canLaunch
                        ? "Nuke ready in Castle > Nukes"
                        : nukeBiddingMarker.isOpen
                          ? "Nuke component bidding open"
                          : "Nuke component bidding closed"
                    }
                    onClick={() => onSelectMapHex?.(tile.id)}
                  >
                    <img
                      src="/assets/nukes/map-bid-icon.png"
                      alt=""
                      aria-hidden="true"
                    />
                    <span>
                      {nukeBiddingMarker.canLaunch
                        ? "Ready"
                        : nukeBiddingMarker.status}
                    </span>
                  </button>
                );
              })()}
            </div>
          ) : null}
          <ConvoyMarkersLayer
            convoyMarkers={convoyMarkers}
            fortresses={fortresses}
          />
          <FortressMarkersLayer
            fortresses={fortresses}
            snappedFortressPositions={snappedFortressPositions}
            selectedFortressId={selectedFortressId}
            selectedTargetId={selectedTargetId}
            activeBattleFortressIdSet={activeBattleFortressIdSet}
            pendingTargetId={pendingTargetId}
            ownFortress={ownFortress}
            maxTargetSentArmy={maxTargetSentArmy}
            clampedTargetSentArmy={clampedTargetSentArmy}
            canSelectFortress={Boolean(onSelectFortress)}
            canConfirmAttackTarget={Boolean(onConfirmAttackTarget)}
            reducedVisualLoad={reducedMapVisualLoad}
            suppressClickRef={suppressClickRef}
            onConfirmAttackTarget={onConfirmAttackTarget}
            onTargetSentArmyChange={setTargetSentArmy}
            onPendingTargetChange={setPendingTargetId}
            onMarkerPointerDown={handleMarkerPointerDown}
            onMarkerPointerMove={handleMarkerPointerMove}
            onMarkerPointerUp={handleMarkerPointerUp}
            onMarkerPointerCancel={clearMarkerTap}
            onActivateFortress={activateFortress}
          />
        </div>
      </div>
    </div>
  );
});
