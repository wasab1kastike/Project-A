"use client";

import {
  Fragment,
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
import type { UnitSpriteVariant } from "@/lib/game/constants";
import {
  getHomeOfABonus,
  getTileBonus,
  getTileClaimCost,
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
  ownerName: string;
  ownerCommanderName: string;
  isCurrentUser: boolean;
  hasActiveBattle: boolean;
  canAttack: boolean;
  claimCost: number | null;
  activeBattlefieldId?: string | null;
  attackDisabledReason?: string | null;
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

type MarkerTapState = {
  fortressId: string;
  pointerId: number;
  startX: number;
  startY: number;
  cancelled: boolean;
};

export type { AttackUnitMarker, MapFortress, MapHexOwnershipMarker };

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

function HexTileMap({
  mapHexes,
  currentFortressLocation,
  selectedTileId,
  onSelectMapHex,
}: {
  mapHexes: MapHexOwnershipMarker[];
  currentFortressLocation?: { mapX: number; mapY: number } | null;
  selectedTileId?: string | null;
  onSelectMapHex?: (tileId: string) => void;
}) {
  const ownershipByTileId = new Map(
    mapHexes.map((ownership) => [ownership.tileId, ownership])
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
        const neutralClaimCost =
          !ownership && !isHomeTile && currentFortressLocation
            ? getTileClaimCost({ tile, origin: currentFortressLocation })
            : null;
        const bonus =
          ownership?.bonus ??
          (isHomeTile ? getHomeOfABonus() : getTileBonus(tile));
        const tileClassName = [
          styles.hexTile,
          styles[`${tile.biome}Tile`],
          tile.spawnable ? styles.spawnableTile : "",
          ownership ? styles.ownedTile : "",
          ownership?.pointIncome ? styles.objectiveTile : "",
          ownership?.isHomeOfA ? styles.contestedTile : "",
          ownership?.isCurrentUser ? styles.ownTile : "",
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
              ownership
                ? `${ownership.isHomeOfA ? "Home of A" : BIOME_LABELS[tile.biome]}, owned by ${ownership.ownerName}, ${ownership.bonus.label}${
                    ownership.hasActiveBattle ? ", battle active" : ""
                  }`
                : `${isHomeTile ? "Home of A, neutral control point" : `${BIOME_LABELS[tile.biome]}, unclaimed`}${
                    neutralClaimCost ? `, claim cost ${neutralClaimCost}` : ""
                  }, ${bonus.label}`
            }
            onClick={() => {
              if (!tile.spawnable || !onSelectMapHex) {
                return;
              }

              onSelectMapHex(tile.id);
            }}
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
        const currentPoint = getInterpolatedPoint(origin, target, progress);
        const secondsRemaining = Math.max(
          0,
          Math.ceil((new Date(unit.arrivesAt).getTime() - nowMs) / 1000)
        );
        const anchorPoint = presentation.isImpacting ? target : currentPoint;
        const selected = selectedUnitId === unit.id;
        const statusText = isReturning ? "returning home" : "on the way";

        return (
          <Fragment key={unit.id}>
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

export function FortressMap({
  fortresses,
  mapHexes = [],
  attackUnits = [],
  selectedFortressId,
  selectedTargetId,
  selectedTileId,
  onSelectFortress,
  onConfirmAttackTarget,
  onSelectMapHex,
  onRecallAttackUnit,
  onInstantRecallAttackUnit,
  className,
}: {
  fortresses: MapFortress[];
  mapHexes?: MapHexOwnershipMarker[];
  attackUnits?: AttackUnitMarker[];
  selectedFortressId?: string | null;
  selectedTargetId?: string | null;
  selectedTileId?: string | null;
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
}) {
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
      if (fortress.isCurrentUser) {
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
    [onSelectFortress]
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
    },
    []
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
    (event: ReactPointerEvent<HTMLButtonElement>, fortress: MapFortress) => {
      const tapState = markerTapStateRef.current;

      if (
        !tapState ||
        tapState.pointerId !== event.pointerId ||
        tapState.fortressId !== fortress.id
      ) {
        return;
      }

      event.stopPropagation();
      markerTapStateRef.current = null;

      if (!tapState.cancelled) {
        activateFortress(fortress);
      }
    },
    [activateFortress]
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
        onPointerDown={(event) => {
          const shellBounds = shellRef.current?.getBoundingClientRect();
          if (!shellBounds) {
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
          }

          (event.currentTarget as HTMLDivElement).setPointerCapture(
            event.pointerId
          );
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
          }

          const nextTranslate = clampTranslation(
            dragStart.translateX + deltaX,
            dragStart.translateY + deltaY,
            scale
          );
          setTranslateX(nextTranslate.x);
          setTranslateY(nextTranslate.y);
        }}
        onPointerUp={(event) => {
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
        onPointerCancel={(event) => {
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
            currentFortressLocation={
              ownFortress
                ? { mapX: ownFortress.mapX, mapY: ownFortress.mapY }
                : null
            }
            selectedTileId={selectedTileId}
            onSelectMapHex={onSelectMapHex}
          />
          <AttackUnitsLayer
            attackUnits={attackUnits}
            onRecallAttackUnit={onRecallAttackUnit}
            onInstantRecallAttackUnit={onInstantRecallAttackUnit}
          />
          {fortresses.length === 0 ? (
            <div className={styles.emptyState}>
              No fortresses on the battlefield yet.
            </div>
          ) : (
            fortresses.map((fortress) => {
              const snappedPosition = snapMapPointToHex({
                x: fortress.mapX,
                y: fortress.mapY,
              });
              const selectable =
                (Boolean(onSelectFortress) && fortress.isCurrentUser) ||
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
              ]
                .filter(Boolean)
                .join(" ");

              const showTargetPopover =
                pendingTargetId === fortress.id && fortress.isTargetable;
              const travelMinutes = ownFortress
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
                      handleMarkerPointerUp(event, fortress)
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
                      showsHealth
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
                    {showsHealth ? (
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
                        {showsHealth
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
}
