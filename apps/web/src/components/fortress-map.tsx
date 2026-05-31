"use client";

import {
  Fragment,
  memo,
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
import { getCosmeticSpriteStyle } from "@/lib/game/cosmetic-sprites";
import { findSimplePath, getHexNeighbors, type PathHexTile } from "@/lib/game/march-pathfinding";
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
  armyAmount: number | null;
  launchedAt: Date;
  arrivesAt: Date;
  recalledAt: Date | null;
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
  campaignStatus?: "BUILDING" | "SIEGE_WARNING" | "ENGAGED" | "RESOLVED" | "CANCELED" | null;
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
    gold: number;
    food: number;
    army: number;
    departedAt: number | null;
    arrivesAt: number | null;
  }>;
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

type RoadEdge = { x1: number; y1: number; x2: number; y2: number; level: number };

function computeRoadEdges(
  segments: Array<{ tileId: string; level: number }>,
  hexTiles: typeof HEX_TILES,
): RoadEdge[] {
  if (segments.length === 0) return [];

  const roadMap = new Map(segments.map((s) => [s.tileId, s.level]));
  const tileLookup = new Map(hexTiles.map((t) => [t.id, t]));
  const edges: RoadEdge[] = [];
  const seen = new Set<string>();

  for (const tile of hexTiles) {
    const myLevel = roadMap.get(tile.id);
    if (!myLevel || myLevel <= 0) continue;

    // Compute adjacent hex tiles by checking grid adjacency.
    // Even columns: neighbors at (col±1, row), (col, row±1), (col-1, row±1)
    // Odd columns:  neighbors at (col±1, row), (col, row±1), (col+1, row±1)
    const isEvenCol = tile.col % 2 === 0;
    const neighborOffsets: [number, number][] = [
      [-1, 0], [1, 0], // horizontal
      [0, -1], [0, 1], // vertical
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
        (t) => t.col === neighborCol && t.row === neighborRow,
      );
      if (!neighborTile) continue;

      const neighborLevel = roadMap.get(neighborTile.id);
      if (!neighborLevel || neighborLevel <= 0) continue;

      const edgeKey = [tile.id, neighborTile.id].sort().join("-");
      if (seen.has(edgeKey)) continue;
      seen.add(edgeKey);

      edges.push({
        x1: tile.xPercent,
        y1: tile.yPercent,
        x2: neighborTile.xPercent,
        y2: neighborTile.yPercent,
        level: Math.min(myLevel, neighborLevel),
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
  if (level >= 3) return 3;
  if (level >= 2) return 2;
  return 1.5;
}

// ── Hex Tile Map ─────────────────────────────────────────────────────────────

function HexTileMap({
  mapHexes,
  selectedTileId,
  highlightedTileIds = [],
  onSelectMapHex,
  battlefieldById,
}: {
  mapHexes: MapHexOwnershipMarker[];
  selectedTileId?: string | null;
  highlightedTileIds?: string[];
  onSelectMapHex?: (tileId: string) => void;
  battlefieldById: Map<string, BattlefieldIndicatorData>;
}) {
  const ownershipByTileId = new Map(
    mapHexes.map((ownership) => [ownership.tileId, ownership])
  );
  const highlightedTileIdSet = useMemo(
    () => new Set(highlightedTileIds),
    [highlightedTileIds]
  );
  const tileTapStateRef = useRef<TileTapState | null>(null);

  const handleTilePointerDown = useCallback(
    (
      event: ReactPointerEvent<SVGGElement>,
      tileId: string,
      selectable: boolean
    ) => {
      if (!selectable) {
        return;
      }

      if (event.pointerType === "mouse" && event.button !== 0) {
        return;
      }

      event.stopPropagation();
      tileTapStateRef.current = {
        tileId,
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        cancelled: false,
      };
    },
    []
  );

  const handleTilePointerMove = useCallback(
    (event: ReactPointerEvent<SVGGElement>, tileId: string) => {
      const tapState = tileTapStateRef.current;

      if (
        !tapState ||
        tapState.pointerId !== event.pointerId ||
        tapState.tileId !== tileId
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
    (event: ReactPointerEvent<SVGGElement>, tileId: string) => {
      const tapState = tileTapStateRef.current;

      if (
        tapState &&
        tapState.pointerId === event.pointerId &&
        tapState.tileId === tileId
      ) {
        tileTapStateRef.current = null;
      }
    },
    []
  );

  const handleTilePointerUp = useCallback(
    (event: ReactPointerEvent<SVGGElement>, tileId: string) => {
      const tapState = tileTapStateRef.current;

      if (
        !tapState ||
        tapState.pointerId !== event.pointerId ||
        tapState.tileId !== tileId
      ) {
        return;
      }

      event.stopPropagation();
      tileTapStateRef.current = null;

      if (!tapState.cancelled) {
        onSelectMapHex?.(tileId);
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
    >
      <rect
        width={MAP_WORLD_WIDTH}
        height={MAP_WORLD_HEIGHT}
        className={styles.mapBase}
      />
      {HEX_TILES.map((tile) => {
        const ownership = ownershipByTileId.get(tile.id);
        const isHomeTile = isHomeOfATile(tile.id);
        const isOwnedTile = Boolean(ownership?.ownerFortressId);
        const bonus =
          ownership?.bonus ??
          (isHomeTile ? getHomeOfABonus() : getTileBonus(tile));
        const tileClassName = [
          styles.hexTile,
          styles[`${tile.biome}Tile`],
          tile.spawnable ? styles.spawnableTile : "",
          tile.claimable ? styles.selectableTile : "",
          highlightedTileIdSet.has(tile.id)
            ? styles.highlightedTeleportTile
            : "",
          isOwnedTile ? styles.ownedTile : "",
          isOwnedTile && ownership?.ownerRace
            ? (OWNED_TILE_RACE_CLASS_BY_RACE[ownership.ownerRace] ?? "")
            : "",
          ownership?.pressurePriority ? styles.pressurePriorityTile : "",
          ownership?.attackPriority === 3 ? styles.attackPriorityPrimaryTile : "",
          ownership?.attackPriority === 2 ? styles.attackPrioritySecondaryTile : "",
          ownership?.attackPriority === 1 ? styles.attackPriorityTertiaryTile : "",
          ownership?.isHomeOfA ? styles.contestedTile : "",
          isOwnedTile && ownership?.isCurrentUser ? styles.ownTile : "",
          ownership?.canAttack ? styles.attackableTile : "",
          ownership?.hasActiveBattle ? styles.contestedTile : "",
          selectedTileId === tile.id ? styles.selectedTile : "",
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
            onPointerDown={(event) =>
              handleTilePointerDown(event, tile.id, tile.claimable)
            }
            onPointerMove={(event) => handleTilePointerMove(event, tile.id)}
            onPointerUp={(event) => handleTilePointerUp(event, tile.id)}
            onPointerCancel={(event) => clearTileTap(event, tile.id)}
          >
            <polygon points={getHexPolygonPoints(tile.x, tile.y)} />
            <polyline
              points={getHexPolygonPoints(tile.x, tile.y, HEX_RADIUS * 0.72)}
              className={styles.hexInner}
            />
            {tile.biome === "forest" ? (
              <path
                className={styles.hexFeature}
                d={`M ${tile.x - 15} ${tile.y + 12} h 30 l -15 -28 z M ${tile.x - 4} ${
                  tile.y + 16
                } h 8 v 10 h -8 z`}
              />
            ) : null}
            {tile.biome === "hills" || tile.biome === "mountains" ? (
              <path
                className={styles.hexFeature}
                d={`M ${tile.x - 25} ${tile.y + 16} l 19 -32 l 20 32 z M ${tile.x - 3} ${
                  tile.y + 16
                } l 18 -25 l 20 25 z`}
              />
            ) : null}
            {tile.biome === "marsh" ? (
              <path
                className={styles.hexFeature}
                d={`M ${tile.x - 25} ${tile.y + 11} q 12 -10 24 0 t 24 0 M ${tile.x - 18} ${
                  tile.y - 3
                } v 22 M ${tile.x + 11} ${tile.y - 6} v 24`}
              />
            ) : null}
            {ownership?.hasActiveBattle ? (
              <g
                className={`${styles.battleIndicator} ${
                  (() => {
                    const bf = ownership.activeBattlefieldId
                      ? battlefieldById.get(ownership.activeBattlefieldId)
                      : null;
                    if (!bf) return "";
                    if (bf.battleIntensityPercent >= 70) return styles.battleIntensityHigh;
                    if (bf.battleIntensityPercent >= 30) return styles.battleIntensityMid;
                    return styles.battleIntensityLow;
                  })()
                }`}
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
                  const bf = ownership.activeBattlefieldId
                    ? battlefieldById.get(ownership.activeBattlefieldId)
                    : null;
                  if (!bf) return null;
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
                        width={Math.max(2, Math.round(44 * Math.min(1, bf.progress / 100)))}
                        height={4}
                        rx={2}
                        fill={
                          bf.momentumTier === "ATTACKER_STRONG" || bf.momentumTier === "ATTACKER_EDGE"
                            ? "#ff6b35"
                            : bf.momentumTier === "DEFENDER_STRONG" || bf.momentumTier === "DEFENDER_EDGE"
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
}

function getInterpolatedPoint(origin: Point, target: Point, progress: number) {
  return {
    x: origin.x + (target.x - origin.x) * progress,
    y: origin.y + (target.y - origin.y) * progress,
  };
}

function formatSecondsRemaining(seconds: number) {
  if (seconds < 60) {
    return `${seconds}s`;
  }

  return `${Math.ceil(seconds / 60)}m`;
}

// ── March Path Interpolation ─────────────────────────────────────────────────

/**
 * Given a path of tile center points, compute the position at a given progress
 * (0-1) along the cumulative length of the path.
 */
function getPointAlongPath(
  waypoints: Array<{ x: number; y: number }>,
  progress: number,
): { x: number; y: number } {
  if (waypoints.length === 0) return { x: 0, y: 0 };
  if (waypoints.length === 1) return waypoints[0];

  const clamped = Math.max(0, Math.min(1, progress));

  // Calculate segment lengths.
  const segments: { from: Point; to: Point; length: number }[] = [];
  let totalLength = 0;
  for (let i = 0; i < waypoints.length - 1; i++) {
    const dx = waypoints[i + 1].x - waypoints[i].x;
    const dy = waypoints[i + 1].y - waypoints[i].y;
    const len = Math.sqrt(dx * dx + dy * dy);
    segments.push({ from: waypoints[i], to: waypoints[i + 1], length: len });
    totalLength += len;
  }

  if (totalLength <= 0) return waypoints[0];

  const targetDist = clamped * totalLength;
  let accumulated = 0;
  for (const seg of segments) {
    if (accumulated + seg.length >= targetDist) {
      const segProgress = (targetDist - accumulated) / seg.length;
      return {
        x: seg.from.x + (seg.to.x - seg.from.x) * segProgress,
        y: seg.from.y + (seg.to.y - seg.from.y) * segProgress,
      };
    }
    accumulated += seg.length;
  }

  return waypoints[waypoints.length - 1];
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
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [selectedUnitId, setSelectedUnitId] = useState<string | null>(null);
  const [recallPendingId, setRecallPendingId] = useState<string | null>(null);

  useEffect(() => {
    if (attackUnits.length === 0) {
      return;
    }

    const interval = window.setInterval(() => {
      setNowMs(Date.now());
    }, 250);

    return () => window.clearInterval(interval);
  }, [attackUnits.length]);

  if (attackUnits.length === 0) {
    return null;
  }

  return (
    <div className={styles.attackLayer} aria-label="Active attacks">
      {attackUnits.map((unit) => {
        const skinStyle = getCosmeticSpriteStyle(
          "UNIT",
          unit.attacker.unitCosmeticVariant
        );
        const isReturning = Boolean(unit.recalledAt);
        const routeOrigin = isReturning
          ? (unit.returnOrigin ?? {
              mapX: unit.attacker.mapX,
              mapY: unit.attacker.mapY,
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

        // Compute tile-by-tile march path.
        const hexLookup = new Map(
          HEX_TILES.map((t) => [t.id, { id: t.id, col: t.col, row: t.row }]),
        );
        const startTile = hexLookup.get(
          `${Math.round(origin.x / (MAP_WORLD_WIDTH / 100))},${Math.round(origin.y / (MAP_WORLD_HEIGHT / 100))}`,
        );
        const endTile = hexLookup.get(
          `${Math.round(target.x / (MAP_WORLD_WIDTH / 100))},${Math.round(target.y / (MAP_WORLD_HEIGHT / 100))}`,
        );

        // Build path waypoints in % coordinates.
        let waypoints: Array<{ x: number; y: number }> = [origin, target];
        if (startTile && endTile) {
          const tilePath = findSimplePath(startTile, endTile, hexLookup);
          if (tilePath) {
            waypoints = tilePath.map((tileId) => {
              const tile = HEX_TILES.find((t) => t.id === tileId);
              return tile ? { x: tile.xPercent, y: tile.yPercent } : origin;
            });
          }
        }

        const currentPoint = getPointAlongPath(waypoints, progress);
        const secondsRemaining = Math.max(
          0,
          Math.ceil((new Date(unit.arrivesAt).getTime() - nowMs) / 1000)
        );
        const anchorPoint = presentation.isImpacting ? (waypoints[waypoints.length - 1] ?? target) : currentPoint;
        const selected = selectedUnitId === unit.id;
        const statusText = isReturning ? "returning home" : "on the way";

        // Path line color based on context.
        const pathColor = isReturning ? "#4da6ff" : "#ff8c42";
        const pathDasharray = isReturning ? "4 3" : "4 2";

        return (
          <Fragment key={unit.id}>
            {/* March path line */}
            {waypoints.length > 1 && presentation.showSprite ? (
              <svg
                className={styles.marchPathSvg}
                viewBox={`0 0 100 100`}
                preserveAspectRatio="none"
                aria-hidden="true"
                style={{
                  position: "absolute",
                  inset: 0,
                  width: "100%",
                  height: "100%",
                  pointerEvents: "none",
                  zIndex: 0,
                }}
              >
                {/* Completed portion (solid) */}
                <polyline
                  points={waypoints
                    .slice(0, Math.ceil(waypoints.length * progress) + 1)
                    .map((p) => `${p.x},${p.y}`)
                    .join(" ")}
                  fill="none"
                  stroke={pathColor}
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  opacity="0.6"
                />
                {/* Remaining portion (dashed) */}
                <polyline
                  points={waypoints
                    .slice(Math.floor(waypoints.length * progress))
                    .map((p) => `${p.x},${p.y}`)
                    .join(" ")}
                  fill="none"
                  stroke={pathColor}
                  strokeWidth="1"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeDasharray={pathDasharray}
                  opacity="0.35"
                />
              </svg>
            ) : null}
            <button
              type="button"
              className={`${styles.attackUnit} ${
                presentation.isImpacting ? styles.attackUnitImpacting : ""
              } ${selected ? styles.attackUnitSelected : ""}`}
              style={{
                left: `${anchorPoint.x}%`,
                top: `${anchorPoint.y}%`,
              }}
              onPointerDown={(event) => event.stopPropagation()}
              onClick={(event) => {
                event.stopPropagation();
                setSelectedUnitId((currentId) =>
                  currentId === unit.id ? null : unit.id
                );
              }}
              aria-pressed={selected}
              aria-label={`${unit.attacker.name} army ${statusText}${unit.armyAmount !== null ? ` with ${unit.armyAmount} army` : ""}. ${secondsRemaining} seconds remaining.`}
            >
              {presentation.showSprite ? (
                <>
                  <span
                    className={styles.attackUnitSprite}
                    data-variant={unit.attacker.unitSpriteVariant}
                    data-skin={unit.attacker.unitCosmeticVariant ?? undefined}
                    style={skinStyle ?? undefined}
                  />
                  <span className={styles.attackUnitAmount}>
                    {unit.armyAmount ?? "?"}
                  </span>
                </>
              ) : (
                <span className={styles.attackImpactPulse} aria-hidden="true" />
              )}
            </button>

            {selected ? (
              <div
                className={styles.attackUnitPopover}
                style={{
                  left: `${anchorPoint.x}%`,
                  top: `${anchorPoint.y}%`,
                }}
                onPointerDown={(event) => event.stopPropagation()}
                onClick={(event) => event.stopPropagation()}
              >
                <strong>
                  {unit.armyAmount !== null
                    ? `${unit.armyAmount} army`
                    : "Hidden army"}
                </strong>
                <span>{statusText}</span>
                <em>{formatSecondsRemaining(secondsRemaining)} ETA</em>
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

  // ── Battalion reinforcement particles ─────────────────────────────────
  // When a battalion's size increases, spawn a small unit sprite that
  // marches from the fortress to the battalion's garrison tile with
  // distance-based travel time, just like real attack units.
  type ReinforcementParticle = {
    id: string;
    fromXPercent: number;
    fromYPercent: number;
    toXPercent: number;
    toYPercent: number;
    createdAt: number;
    durationMs: number;
    troopCount: number;
    unitSpriteVariant: string;
    unitCosmeticVariant: string | null;
  };
  const [reinforcementParticles, setReinforcementParticles] = useState<
    ReinforcementParticle[]
  >([]);
  const prevBattalionSizesRef = useRef<Map<string, number>>(new Map());

  // Rough hex distance → ms conversion (same order of magnitude as attack travel)
  const BASE_TILE_TRAVEL_MS = 60_000; // 1 minute per tile

  // Detect battalion size increases → spawn reinforcement particles
  useEffect(() => {
    const fortressById = new Map(fortresses.map((f) => [f.id, f]));
    const tileById = new Map(HEX_TILES.map((t) => [t.id, t]));
    const now = Date.now();
    const newParticles: ReinforcementParticle[] = [];

    for (const marker of battalionMarkers) {
      const key = `${marker.fortressId}:${marker.battalionName}`;
      const prevSize = prevBattalionSizesRef.current.get(key) ?? marker.size;
      const delta = marker.size - prevSize;
      if (delta > 0) {
        const fortress = fortressById.get(marker.fortressId);
        const tile = tileById.get(marker.tileId);
        if (fortress && tile) {
          // Estimate hex distance for travel time
          const dx = Math.abs(fortress.mapX - tile.xPercent);
          const dy = Math.abs(fortress.mapY - tile.yPercent);
          const approxTiles = Math.max(1, Math.round(Math.sqrt(dx * dx + dy * dy) / 3));
          const travelMs = approxTiles * BASE_TILE_TRAVEL_MS;

          newParticles.push({
            id: `reinforce-${key}-${now}-${Math.random().toString(36).slice(2, 6)}`,
            fromXPercent: fortress.mapX,
            fromYPercent: fortress.mapY,
            toXPercent: tile.xPercent,
            toYPercent: tile.yPercent,
            createdAt: now,
            durationMs: Math.max(2000, Math.min(travelMs, 120_000)), // 2s–120s
            troopCount: delta,
            unitSpriteVariant: marker.unitSpriteVariant,
            unitCosmeticVariant: marker.unitCosmeticVariant,
          });
        }
      }
      prevBattalionSizesRef.current.set(key, marker.size);
    }

    if (newParticles.length > 0) {
      setReinforcementParticles((prev) => [...prev, ...newParticles]);
    }
  }, [battalionMarkers, fortresses]);

  // Drive particle animation + cleanup
  const [particleNowMs, setParticleNowMs] = useState(() => Date.now());
  useEffect(() => {
    if (reinforcementParticles.length === 0) return;
    const interval = window.setInterval(() => {
      const now = Date.now();
      setParticleNowMs(now);
      // Cleanup expired particles
      setReinforcementParticles((prev) =>
        prev.filter((p) => now - p.createdAt < p.durationMs + 1000)
      );
    }, 150);
    return () => window.clearInterval(interval);
  }, [reinforcementParticles.length]);

  // Patrol animation state — updates every 500ms for smooth GUARD battalion movement
  const [patrolNowMs, setPatrolNowMs] = useState(() => Date.now());

  useEffect(() => {
    const hasGuardBattalions = battalionMarkers.some(
      (m) => m.mode === "GUARD"
    );
    if (!hasGuardBattalions) return;

    const interval = window.setInterval(() => {
      setPatrolNowMs(Date.now());
    }, 500);

    return () => window.clearInterval(interval);
  }, [battalionMarkers.length]);

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
        { sprite: f.unitSpriteVariant, cosmetic: f.unitCosmeticVariant },
      ])
    );
    return mapHexes
      .filter((hex) => hex.guardArmy != null && hex.guardArmy > 0)
      .map((hex) => {
        const info = hex.ownerFortressId ? spriteByFortressId.get(hex.ownerFortressId) : null;
        return {
          tileId: hex.tileId,
          guardArmy: hex.guardArmy!,
          unitSpriteVariant: info?.sprite ?? 'unit-1',
          unitCosmeticVariant: info?.cosmetic ?? null,
        };
      });
  }, [mapHexes, fortresses]);

  // ── Patrol paths for GUARD-mode battalions ──────────────────────────────
  const patrolData = useMemo(() => {
    const GUARD_BATTALIONS = battalionMarkers.filter(
      (m) => m.mode === "GUARD"
    );
    if (GUARD_BATTALIONS.length === 0) return null;

    // Tile lookup for hex neighbor computation
    const tileLookup = new Map<string, PathHexTile>();
    for (const tile of HEX_TILES) {
      tileLookup.set(`${tile.col},${tile.row}`, {
        id: tile.id,
        col: tile.col,
        row: tile.row,
      });
    }

    // Ownership lookup: tileId → ownerFortressId
    const ownerByTileId = new Map(
      mapHexes
        .filter((h) => h.ownerFortressId != null)
        .map((h) => [h.tileId, h.ownerFortressId!])
    );

    // Tile lookup by id: tileId → HexTile
    const tileById = new Map(HEX_TILES.map((t) => [t.id, t]));

    // Patrol cycle duration per leg (ms)
    const PATROL_LEG_MS = 12_000;

    const markerPatrols: Array<{
      markerIndex: number;
      path: Array<{ xPercent: number; yPercent: number }>;
      legMs: number;
    }> = [];

    for (let i = 0; i < battalionMarkers.length; i++) {
      const m = battalionMarkers[i];
      if (m.mode !== "GUARD") continue;

      const garrisonTile = tileById.get(m.tileId);
      if (!garrisonTile) continue;

      // Find adjacent tiles owned by the same fortress
      const garrisonHex: PathHexTile = {
        id: garrisonTile.id,
        col: garrisonTile.col,
        row: garrisonTile.row,
      };

      const neighbors = getHexNeighbors(garrisonHex, tileLookup);
      const ownedNeighbors = neighbors.filter(
        (n) => ownerByTileId.get(n.id) === m.fortressId
      );

      if (ownedNeighbors.length === 0) continue; // No patrol — stays at garrison

      // Build patrol cycle: garrison → neighbor1 → neighbor2 → ... → garrison
      const path: Array<{ xPercent: number; yPercent: number }> = [
        { xPercent: garrisonTile.xPercent, yPercent: garrisonTile.yPercent },
      ];

      // Add up to 3 neighbors for a varied patrol
      for (const n of ownedNeighbors.slice(0, 3)) {
        const nt = tileById.get(n.id);
        if (nt) {
          path.push({ xPercent: nt.xPercent, yPercent: nt.yPercent });
        }
      }

      // Close the loop back to garrison
      path.push({ xPercent: garrisonTile.xPercent, yPercent: garrisonTile.yPercent });

      markerPatrols.push({
        markerIndex: i,
        path,
        legMs: PATROL_LEG_MS,
      });
    }

    return { markerPatrols, tileById };
  }, [battalionMarkers, mapHexes]);

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
      const hasActiveBattle = activeBattleFortressIds.includes(fortress.id);

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
    [activeBattleFortressIds, onSelectFortress]
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
        <div className={styles.viewportContent} style={viewTransform}>
          <HexTileMap
            mapHexes={mapHexes}
            selectedTileId={selectedTileId}
            highlightedTileIds={highlightedTileIds}
            onSelectMapHex={onSelectMapHex}
            battlefieldById={battlefieldById}
          />
          {(alliedRoads.length > 0 || tradeRouteLines.length > 0 || roadSegments.length > 0) ? (
        <svg
          className={styles.roadsLayer}
          viewBox={`0 0 ${MAP_WORLD_WIDTH} ${MAP_WORLD_HEIGHT}`}
          aria-hidden="true"
        >
          {alliedRoads.map((road, i) => (
            <line
              key={`ally-${i}`}
              x1={road.x1 * MAP_WORLD_WIDTH / 100}
              y1={road.y1 * MAP_WORLD_HEIGHT / 100}
              x2={road.x2 * MAP_WORLD_WIDTH / 100}
              y2={road.y2 * MAP_WORLD_HEIGHT / 100}
              className={styles.roadLine}
            />
          ))}
          {tradeRouteLines.map((route, i) => (
            <line
              key={`trade-${i}`}
              x1={route.x1 * MAP_WORLD_WIDTH / 100}
              y1={route.y1 * MAP_WORLD_HEIGHT / 100}
              x2={route.x2 * MAP_WORLD_WIDTH / 100}
              y2={route.y2 * MAP_WORLD_HEIGHT / 100}
              className={styles.tradeRouteLine}
            />
          ))}
          {computeRoadEdges(roadSegments, HEX_TILES).map((edge, i) => (
            <line
              key={`road-${i}`}
              x1={edge.x1 * MAP_WORLD_WIDTH / 100}
              y1={edge.y1 * MAP_WORLD_HEIGHT / 100}
              x2={edge.x2 * MAP_WORLD_WIDTH / 100}
              y2={edge.y2 * MAP_WORLD_HEIGHT / 100}
              className={`${styles.roadLine} ${getRoadLevelClass(edge.level)}`}
              strokeWidth={getRoadStrokeWidth(edge.level)}
            />
          ))}
        </svg>
      ) : null}
      <AttackUnitsLayer
            attackUnits={attackUnits}
            onRecallAttackUnit={onRecallAttackUnit}
            onInstantRecallAttackUnit={onInstantRecallAttackUnit}
          />
          {guardMarkers.length > 0 ? (
            <div className={styles.guardsLayer} aria-label="Garrisoned units">
              {guardMarkers.map((marker) => {
                const tile = HEX_TILES.find((t) => t.id === marker.tileId);
                if (!tile) return null;

                return (
                  <div
                    key={marker.tileId}
                    className={styles.guardMarker}
                    style={{
                      left: tile.xPercent + '%',
                      top: tile.yPercent + '%',
                    }}
                  >
                    <span
                      className={styles.guardSprite}
                      data-variant={marker.unitSpriteVariant}
                      data-skin={marker.unitCosmeticVariant ?? undefined}
                      style={getCosmeticSpriteStyle("UNIT", marker.unitCosmeticVariant) ?? undefined}
                      aria-hidden="true"
                    />
                    <span className={styles.guardCount}>
                      {marker.guardArmy}
                    </span>
                  </div>
                );
              })}
            </div>
          ) : null}
          {battalionMarkers.length > 0 ? (
            <div className={styles.battalionLayer} aria-label="Battalion units">
              {battalionMarkers.map((marker, markerIndex) => {
                const tile = HEX_TILES.find((t) => t.id === marker.tileId);
                if (!tile) return null;

                // ── Patrol position interpolation ──────────────────────
                let patrolXPercent = tile.xPercent;
                let patrolYPercent = tile.yPercent;
                let isPatrolling = false;

                if (marker.mode === "GUARD" && patrolData) {
                  const patrol = patrolData.markerPatrols.find(
                    (p) => p.markerIndex === markerIndex
                  );
                  if (patrol && patrol.path.length >= 2) {
                    isPatrolling = true;
                    const cycleMs = (patrol.path.length - 1) * patrol.legMs;
                    const elapsed = (patrolNowMs % (cycleMs || 1)) / (cycleMs || 1);
                    const totalLegs = patrol.path.length - 1;
                    const rawLeg = elapsed * totalLegs;
                    const legIndex = Math.min(Math.floor(rawLeg), totalLegs - 1);
                    const legProgress = rawLeg - legIndex; // 0..1 within the leg

                    const from = patrol.path[legIndex];
                    const to = patrol.path[legIndex + 1];
                    patrolXPercent = from.xPercent + (to.xPercent - from.xPercent) * legProgress;
                    patrolYPercent = from.yPercent + (to.yPercent - from.yPercent) * legProgress;
                  }
                }

                const stanceColors: Record<string, string> = {
                  FORTIFY: "#4488ff", PATROL: "#44cc44", TRAINING: "#ffcc00",
                  AMBUSH: "#ff4444", REST: "#888888", MOBILE: "#aaaaaa",
                };
                const raceIcons: Record<string, string[]> = {
                  DWARFS: ["", "⛏", "⛏⛏", "⛏⛏⛏"],
                  ORKS: ["", "💀", "💀💀", "💀💀💀"],
                  SPACE_MURINES: ["", "★", "★★", "★★★"],
                  UNSTABLE_UNICORNS: ["", "🦄", "🦄🦄", "🦄🦄🦄"],
                };
                const tierLabel = (marker.race && raceIcons[marker.race])
                  ? raceIcons[marker.race][marker.tier] ?? "?"
                  : ["", "I", "II", "III"][marker.tier] ?? "?";
                return (
                  <div
                    key={`bn-${marker.tileId}-${marker.battalionName}`}
                    className={`${styles.battalionMarker}${isPatrolling ? ` ${styles.battalionPatrol}` : ""}`}
                    style={{
                      left: `${patrolXPercent}%`,
                      top: `${patrolYPercent}%`,
                    }}
                    title={`${marker.battalionName} · ${marker.stance} · Tier ${marker.tier} · ${marker.size}/${marker.maxSize}`}
                  >
                    <span
                      className={styles.battalionSprite}
                      data-variant={marker.unitSpriteVariant}
                      data-skin={marker.unitCosmeticVariant ?? undefined}
                      style={getCosmeticSpriteStyle("UNIT", marker.unitCosmeticVariant) ?? undefined}
                      aria-hidden="true"
                    />
                    <span
                      className={styles.battalionBadge}
                      style={{ backgroundColor: stanceColors[marker.stance] ?? "#888" }}
                    >
                      {tierLabel}
                    </span>
                    <span className={styles.battalionCount}>
                      {marker.size}
                    </span>
                  </div>
                );
              })}
            </div>
          ) : null}
          {reinforcementParticles.length > 0 ? (
            <div className={styles.reinforcementLayer} aria-label="Troop reinforcements">
              {reinforcementParticles.map((p) => {
                const now = Date.now();
                const elapsed = now - p.createdAt;
                const progress = Math.min(1, Math.max(0, elapsed / p.durationMs));
                // Ease-out for natural deceleration
                const eased = 1 - Math.pow(1 - progress, 3);
                const x = p.fromXPercent + (p.toXPercent - p.fromXPercent) * eased;
                const y = p.fromYPercent + (p.toYPercent - p.fromYPercent) * eased;
                const fadingIn = progress < 0.1;
                const fadingOut = progress > 0.85;
                const opacity = fadingIn ? progress / 0.1 : fadingOut ? (1 - progress) / 0.15 : 1;

                return (
                  <div
                    key={p.id}
                    className={styles.reinforcementParticle}
                    style={{
                      left: `${x}%`,
                      top: `${y}%`,
                      opacity: Math.max(0, Math.min(1, opacity)),
                    }}
                    title={`+${p.troopCount} troops`}
                  >
                    <span
                      className={styles.reinforcementSprite}
                      data-variant={p.unitSpriteVariant}
                      data-skin={p.unitCosmeticVariant ?? undefined}
                      style={getCosmeticSpriteStyle("UNIT", p.unitCosmeticVariant) ?? undefined}
                      aria-hidden="true"
                    />
                    <span className={styles.reinforcementCount}>
                      +{p.troopCount}
                    </span>
                  </div>
                );
              })}
            </div>
          ) : null}
          {convoyMarkers.length > 0 ? (
            <div className={styles.convoyLayer} aria-label="Trade convoys">
              {convoyMarkers.map((convoy) => {
                const from = fortresses.find((f) => f.id === convoy.fromFortressId);
                const to = fortresses.find((f) => f.id === convoy.toFortressId);
                if (!from || !to) return null;
                const totalCargo = convoy.gold + convoy.food + convoy.army;
                const cargoLabel = convoy.gold > 0 ? `${convoy.gold}g` : convoy.food > 0 ? `${convoy.food}f` : `${convoy.army}a`;
                const nowMs = Date.now();
                const progress = convoy.departedAt && convoy.arrivesAt
                  ? Math.min(1, Math.max(0, (nowMs - convoy.departedAt) / (convoy.arrivesAt - convoy.departedAt)))
                  : 0;
                const x = from.mapX + (to.mapX - from.mapX) * progress;
                const y = from.mapY + (to.mapY - from.mapY) * progress;
                return (
                  <div
                    key={convoy.id}
                    className={styles.convoyMarker}
                    style={{
                      left: `${x}%`,
                      top: `${y}%`,
                    }}
                    title={`Convoy: ${totalCargo} cargo (${cargoLabel})`}
                  >
                    <span className={styles.convoyDot} />
                    <span className={styles.convoyLabel}>{totalCargo}</span>
                  </div>
                );
              })}
            </div>
          ) : null}
          {fortresses.length === 0 ? (
            <div className={styles.emptyState}>
              No fortresses on the battlefield yet.
            </div>
          ) : (
            fortresses.map((fortress) => {
              const snappedPosition =
                snappedFortressPositions.get(fortress.id) ??
                snapMapPointToHex({
                  x: fortress.mapX,
                  y: fortress.mapY,
                });
              const selectable =
                (Boolean(onSelectFortress) && fortress.isCurrentUser) ||
                (Boolean(onSelectFortress) &&
                  fortress.fortressKind === "MEGA") ||
                (Boolean(onSelectFortress) &&
                  activeBattleFortressIds.includes(fortress.id)) ||
                (Boolean(onConfirmAttackTarget) && fortress.isTargetable);
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
              const className = [
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

              return (
                <Fragment key={fortress.id}>
                  <button
                    type="button"
                    className={className}
                    style={{
                      left: `${snappedPosition.x}%`,
                      top: `${snappedPosition.y}%`,
                    }}
                    onPointerDown={(event) =>
                      handleMarkerPointerDown(event, fortress, selectable)
                    }
                    onPointerMove={(event) =>
                      handleMarkerPointerMove(event, fortress.id)
                    }
                    onPointerUp={(event) =>
                      handleMarkerPointerUp(event, fortress.id)
                    }
                    onPointerCancel={(event) =>
                      clearMarkerTap(event, fortress.id)
                    }
                    onClick={(event) => {
                      if (event.detail !== 0 || suppressClickRef.current) {
                        event.preventDefault();
                        return;
                      }

                      activateFortress(fortress);
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
                    <span className={styles.selectionPulse} />
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
                        <MegaFortressSprite
                          iconLabel={fortress.iconLabel ?? "A-"}
                        />
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
                          Army to send: {clampedTargetSentArmy}/
                          {maxTargetSentArmy}
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
                            setTargetSentArmy(
                              Number.isFinite(nextArmy)
                                ? Math.floor(nextArmy)
                                : 1
                            );
                          }}
                        />
                      </label>
                      <button
                        type="button"
                        disabled={maxTargetSentArmy <= 0}
                        onPointerDown={(event) => event.stopPropagation()}
                        onClick={async () => {
                          setPendingTargetId(null);
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
            })
          )}
        </div>
      </div>
    </div>
  );
});
