"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  HEX_RADIUS,
  HEX_TILES,
  MAP_WORLD_HEIGHT,
  MAP_WORLD_WIDTH,
  getHexPolygonPoints,
  snapMapPointToHex,
  type HexBiome,
} from "@/lib/game/map-hex";
import type { UnitSpriteVariant } from "@/lib/game/constants";
import styles from "./fortress-map.module.css";

type MapFortress = {
  id: string;
  name: string;
  points: number;
  currentAction: "GROW" | "ATTACK";
  mapX: number;
  mapY: number;
  unitSpriteVariant: UnitSpriteVariant;
  isCurrentUser: boolean;
  isTargetable: boolean;
};

type AttackUnitMarker = {
  id: string;
  launchedAt: Date;
  arrivesAt: Date;
  attacker: {
    id: string;
    name: string;
    mapX: number;
    mapY: number;
    unitSpriteVariant: UnitSpriteVariant;
  };
  target: {
    id: string;
    name: string;
    mapX: number;
    mapY: number;
  };
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

export type { AttackUnitMarker, MapFortress };

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

const SPRITE_PALETTES: Record<
  SpriteVariant,
  {
    shell: string;
    shellDark: string;
    roof: string;
    glow: string;
    lawn: string;
  }
> = {
  citadel: {
    shell: "#d9e4f2",
    shellDark: "#8a98ab",
    roof: "#6fa4ff",
    glow: "rgba(111, 164, 255, 0.32)",
    lawn: "#456f5b",
  },
  forge: {
    shell: "#f0d9be",
    shellDark: "#9a7a62",
    roof: "#ff8a5c",
    glow: "rgba(255, 138, 92, 0.3)",
    lawn: "#586447",
  },
  spire: {
    shell: "#e6def6",
    shellDark: "#9386ab",
    roof: "#b49dff",
    glow: "rgba(180, 157, 255, 0.3)",
    lawn: "#4b5d78",
  },
  garden: {
    shell: "#d7f0d9",
    shellDark: "#75946f",
    roof: "#7ace87",
    glow: "rgba(122, 206, 135, 0.28)",
    lawn: "#3f7454",
  },
  vault: {
    shell: "#efe3b7",
    shellDark: "#9b8b58",
    roof: "#e0ba4f",
    glow: "rgba(224, 186, 79, 0.28)",
    lawn: "#556246",
  },
  watchtower: {
    shell: "#d4ebef",
    shellDark: "#70909a",
    roof: "#67c4cf",
    glow: "rgba(103, 196, 207, 0.3)",
    lawn: "#3f6870",
  },
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
  return SPRITE_VARIANTS[hashString(fortress.id) % SPRITE_VARIANTS.length];
}

function FortressSprite({
  variant,
  action,
}: {
  variant: SpriteVariant;
  action: "GROW" | "ATTACK";
}) {
  const palette = SPRITE_PALETTES[variant];
  const bannerColor = action === "ATTACK" ? "#ff7c7c" : "#89de8e";
  const actionLabel = action === "ATTACK" ? "assaulting" : "growing";

  return (
    <svg
      viewBox="0 0 64 64"
      className={styles.sprite}
      aria-hidden="true"
      role="presentation"
    >
      <ellipse cx="32" cy="52" rx="19" ry="7" fill="rgba(0, 0, 0, 0.28)" />
      <ellipse cx="32" cy="48" rx="20" ry="9" fill={palette.lawn} />
      <ellipse
        cx="32"
        cy="50"
        rx="14"
        ry="5"
        fill="rgba(255, 255, 255, 0.08)"
      />
      <circle cx="32" cy="28" r="20" fill={palette.glow} />

      {variant === "citadel" ? (
        <>
          <rect
            x="18"
            y="27"
            width="28"
            height="16"
            rx="4"
            fill={palette.shell}
          />
          <rect
            x="23"
            y="18"
            width="9"
            height="15"
            rx="2"
            fill={palette.shellDark}
          />
          <rect
            x="32"
            y="16"
            width="9"
            height="17"
            rx="2"
            fill={palette.shell}
          />
          <path d="M22 27h10l-2-6h-6z" fill={palette.roof} />
          <path d="M32 25h9l-2-7h-5z" fill={palette.roof} />
          <rect
            x="28"
            y="33"
            width="8"
            height="10"
            rx="2"
            fill={palette.shellDark}
          />
          <rect x="21" y="32" width="4" height="5" rx="1" fill="#13202d" />
          <rect x="39" y="32" width="4" height="5" rx="1" fill="#13202d" />
        </>
      ) : null}

      {variant === "forge" ? (
        <>
          <rect
            x="18"
            y="28"
            width="28"
            height="15"
            rx="4"
            fill={palette.shell}
          />
          <rect
            x="21"
            y="22"
            width="10"
            height="21"
            rx="2"
            fill={palette.shellDark}
          />
          <rect
            x="33"
            y="20"
            width="8"
            height="23"
            rx="2"
            fill={palette.shell}
          />
          <path d="M18 28h28l-4-7H23z" fill={palette.roof} />
          <rect x="25" y="33" width="6" height="10" rx="2" fill="#40271d" />
          <rect x="35" y="31" width="6" height="6" rx="1.5" fill="#13202d" />
          <circle cx="26" cy="19" r="3" fill="#ffc77a" />
        </>
      ) : null}

      {variant === "spire" ? (
        <>
          <rect
            x="22"
            y="29"
            width="20"
            height="14"
            rx="4"
            fill={palette.shell}
          />
          <path d="M27 29h10l-5-16z" fill={palette.roof} />
          <rect
            x="29"
            y="18"
            width="6"
            height="22"
            rx="2"
            fill={palette.shellDark}
          />
          <rect
            x="18"
            y="34"
            width="6"
            height="9"
            rx="2"
            fill={palette.shellDark}
          />
          <rect
            x="40"
            y="34"
            width="6"
            height="9"
            rx="2"
            fill={palette.shellDark}
          />
          <rect x="29" y="33" width="6" height="10" rx="2" fill="#223142" />
          <circle cx="32" cy="13" r="2" fill="#fff1a8" />
        </>
      ) : null}

      {variant === "garden" ? (
        <>
          <rect
            x="19"
            y="29"
            width="26"
            height="14"
            rx="5"
            fill={palette.shell}
          />
          <rect
            x="24"
            y="20"
            width="8"
            height="14"
            rx="2"
            fill={palette.shellDark}
          />
          <rect
            x="33"
            y="22"
            width="7"
            height="12"
            rx="2"
            fill={palette.shell}
          />
          <path d="M21 29h22l-3-6H24z" fill={palette.roof} />
          <circle cx="18" cy="29" r="4" fill="#7bcf91" />
          <circle cx="46" cy="31" r="4" fill="#7bcf91" />
          <rect x="29" y="34" width="6" height="9" rx="2" fill="#284331" />
        </>
      ) : null}

      {variant === "vault" ? (
        <>
          <rect
            x="18"
            y="28"
            width="28"
            height="15"
            rx="4"
            fill={palette.shellDark}
          />
          <rect
            x="23"
            y="22"
            width="18"
            height="12"
            rx="4"
            fill={palette.shell}
          />
          <path d="M21 28h22l-3-7H24z" fill={palette.roof} />
          <rect x="28" y="31" width="8" height="12" rx="2" fill="#3e3217" />
          <circle cx="32" cy="37" r="1.5" fill="#f9df88" />
          <rect
            x="18"
            y="40"
            width="6"
            height="3"
            rx="1.5"
            fill={palette.shell}
          />
          <rect
            x="40"
            y="40"
            width="6"
            height="3"
            rx="1.5"
            fill={palette.shell}
          />
        </>
      ) : null}

      {variant === "watchtower" ? (
        <>
          <rect
            x="24"
            y="18"
            width="16"
            height="25"
            rx="4"
            fill={palette.shell}
          />
          <path d="M22 22h20l-3-6H25z" fill={palette.roof} />
          <rect
            x="27"
            y="28"
            width="10"
            height="15"
            rx="2"
            fill={palette.shellDark}
          />
          <rect
            x="21"
            y="37"
            width="6"
            height="6"
            rx="2"
            fill={palette.shellDark}
          />
          <rect
            x="37"
            y="37"
            width="6"
            height="6"
            rx="2"
            fill={palette.shellDark}
          />
          <rect x="30" y="32" width="4" height="7" rx="1.5" fill="#15212d" />
          <rect x="28" y="24" width="8" height="4" rx="1.5" fill="#15212d" />
        </>
      ) : null}

      <path
        d="M34 12v13h7c-2-3-4-4-7-5z"
        fill={bannerColor}
        aria-label={`Fortress is currently ${actionLabel}`}
      />
      <rect x="33" y="12" width="2" height="18" rx="1" fill="#e8edf3" />
    </svg>
  );
}

function HexTileMap() {
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
        const tileClassName = [
          styles.hexTile,
          styles[`${tile.biome}Tile`],
          tile.spawnable ? styles.spawnableTile : "",
        ]
          .filter(Boolean)
          .join(" ");

        return (
          <g
            key={tile.id}
            className={tileClassName}
            aria-label={BIOME_LABELS[tile.biome]}
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

function getAttackProgress(unit: AttackUnitMarker, nowMs: number) {
  const launchedAt = new Date(unit.launchedAt).getTime();
  const arrivesAt = new Date(unit.arrivesAt).getTime();
  const duration = arrivesAt - launchedAt;

  if (duration <= 0) {
    return 1;
  }

  return clampValue((nowMs - launchedAt) / duration, 0, 1);
}

function getInterpolatedPoint(origin: Point, target: Point, progress: number) {
  return {
    x: origin.x + (target.x - origin.x) * progress,
    y: origin.y + (target.y - origin.y) * progress,
  };
}

function AttackUnitsLayer({
  attackUnits,
}: {
  attackUnits: AttackUnitMarker[];
}) {
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    if (attackUnits.length === 0) {
      return;
    }

    const interval = window.setInterval(() => {
      setNowMs(Date.now());
    }, 1000);

    return () => window.clearInterval(interval);
  }, [attackUnits.length]);

  if (attackUnits.length === 0) {
    return null;
  }

  return (
    <div className={styles.attackLayer} aria-label="Active attacks">
      <svg
        className={styles.attackRoutes}
        viewBox={`0 0 ${MAP_WORLD_WIDTH} ${MAP_WORLD_HEIGHT}`}
        aria-hidden="true"
        role="presentation"
      >
        {attackUnits.map((unit) => {
          const origin = snapMapPointToHex({
            x: unit.attacker.mapX,
            y: unit.attacker.mapY,
          });
          const target = snapMapPointToHex({
            x: unit.target.mapX,
            y: unit.target.mapY,
          });

          return (
            <line
              key={unit.id}
              className={styles.attackRoute}
              x1={(origin.x / 100) * MAP_WORLD_WIDTH}
              y1={(origin.y / 100) * MAP_WORLD_HEIGHT}
              x2={(target.x / 100) * MAP_WORLD_WIDTH}
              y2={(target.y / 100) * MAP_WORLD_HEIGHT}
            />
          );
        })}
      </svg>

      {attackUnits.map((unit) => {
        const origin = snapMapPointToHex({
          x: unit.attacker.mapX,
          y: unit.attacker.mapY,
        });
        const target = snapMapPointToHex({
          x: unit.target.mapX,
          y: unit.target.mapY,
        });
        const progress = getAttackProgress(unit, nowMs);
        const currentPoint = getInterpolatedPoint(origin, target, progress);
        const secondsRemaining = Math.max(
          0,
          Math.ceil((new Date(unit.arrivesAt).getTime() - nowMs) / 1000)
        );

        return (
          <div
            key={unit.id}
            className={styles.attackUnit}
            style={{
              left: `${currentPoint.x}%`,
              top: `${currentPoint.y}%`,
            }}
            aria-label={`${unit.attacker.name} unit attacking ${unit.target.name}. ${secondsRemaining} seconds until impact.`}
          >
            <span
              className={styles.attackUnitSprite}
              data-variant={unit.attacker.unitSpriteVariant}
            />
          </div>
        );
      })}
    </div>
  );
}

export function FortressMap({
  fortresses,
  attackUnits = [],
  selectedFortressId,
  selectedTargetId,
  onSelectFortress,
}: {
  fortresses: MapFortress[];
  attackUnits?: AttackUnitMarker[];
  selectedFortressId?: string | null;
  selectedTargetId?: string | null;
  onSelectFortress?: (fortress: MapFortress) => void;
}) {
  const shellRef = useRef<HTMLDivElement | null>(null);
  const pointerCacheRef = useRef<Map<number, Point>>(new Map());
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
    setScale(1);
    setTranslateX(0);
    setTranslateY(0);
    setIsDragging(false);
    setDragStart(null);
    suppressClickRef.current = false;
    pointerCacheRef.current.clear();
    pinchStateRef.current = null;
  }, []);

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
    }),
    [scale, translateX, translateY]
  );

  return (
    <div
      ref={shellRef}
      className={styles.shell}
      role="application"
      aria-label="Battlefield map"
      onKeyDown={(event) => {
        if (
          event.key === "+" ||
          event.key === "=" ||
          event.key === "NumpadAdd"
        ) {
          event.preventDefault();
          zoomFromViewportPoint(scale + ZOOM_STEP);
        }

        if (event.key === "-" || event.key === "NumpadSubtract") {
          event.preventDefault();
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
          onClick={() => zoomFromViewportPoint(scale + ZOOM_STEP)}
        >
          +
        </button>
        <button
          type="button"
          className={styles.controlButton}
          aria-label="Zoom out"
          onClick={() => zoomFromViewportPoint(scale - ZOOM_STEP)}
        >
          -
        </button>
        <button
          type="button"
          className={`${styles.controlButton} ${styles.resetButton}`}
          aria-label="Reset view"
          onClick={resetView}
        >
          Reset view
        </button>
      </div>

      <div
        className={`${styles.viewport} ${isDragging ? styles.dragging : ""}`}
        onWheel={(event) => {
          event.preventDefault();
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
          <HexTileMap />
          <AttackUnitsLayer attackUnits={attackUnits} />
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
                Boolean(onSelectFortress) &&
                (fortress.isTargetable || fortress.isCurrentUser);
              const variant = getSpriteVariant(fortress);
              const className = [
                styles.marker,
                fortress.isCurrentUser ? styles.currentUser : "",
                selectedFortressId === fortress.id ? styles.activeFortress : "",
                selectedTargetId === fortress.id ? styles.selected : "",
                selectable ? styles.selectable : "",
                fortress.isTargetable ? styles.targetable : "",
              ]
                .filter(Boolean)
                .join(" ");

              return (
                <button
                  key={fortress.id}
                  type="button"
                  className={className}
                  style={{
                    left: `${snappedPosition.x}%`,
                    top: `${snappedPosition.y}%`,
                  }}
                  onClick={(event) => {
                    if (suppressClickRef.current) {
                      event.preventDefault();
                      return;
                    }

                    if (selectable) {
                      onSelectFortress?.(fortress);
                    }
                  }}
                  aria-pressed={
                    selectedTargetId === fortress.id ||
                    selectedFortressId === fortress.id
                  }
                  aria-label={`${fortress.name}, ${fortress.points} points`}
                >
                  <span className={styles.selectionPulse} />
                  <span className={styles.spriteFrame}>
                    <FortressSprite
                      variant={variant}
                      action={fortress.currentAction}
                    />
                  </span>
                  <span className={styles.pointsBadge}>{fortress.points}</span>
                  <span className={styles.nameplate}>{fortress.name}</span>
                  <span className={styles.tooltip}>
                    <strong>{fortress.name}</strong>
                    <span>
                      {fortress.points} pts - {fortress.currentAction}
                    </span>
                  </span>
                </button>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
