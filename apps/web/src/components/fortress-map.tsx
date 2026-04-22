"use client";

import {
  Fragment,
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
import type { UnitSpriteVariant } from "@/lib/game/constants";
import styles from "./fortress-map.module.css";

type MapFortress = {
  id: string;
  name: string;
  rawName: string;
  points: number;
  isNpc: boolean;
  health: number;
  maxHealth: number;
  sizeTiles: number;
  iconLabel: string | null;
  isCrowned: boolean;
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
  const actionLabel = action === "ATTACK" ? "assaulting" : "growing";

  return (
    <>
      <span
        className={styles.fortressSprite}
        data-variant={variant}
        aria-hidden="true"
      />
      <span
        className={styles.fortressActionFlag}
        data-action={action}
        aria-label={`Fortress is currently ${actionLabel}`}
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
  onAttackTarget,
  className,
}: {
  fortresses: MapFortress[];
  attackUnits?: AttackUnitMarker[];
  selectedFortressId?: string | null;
  selectedTargetId?: string | null;
  onSelectFortress?: (fortress: MapFortress) => void;
  onAttackTarget?: (fortress: MapFortress) => void;
  className?: string;
}) {
  const shellRef = useRef<HTMLDivElement | null>(null);
  const lastAutoFocusKeyRef = useRef<string | null>(null);
  const userAdjustedViewRef = useRef(false);
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
  const [pendingTargetId, setPendingTargetId] = useState<string | null>(null);

  const ownFortress =
    fortresses.find((fortress) => fortress.isCurrentUser) ?? null;

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
    suppressClickRef.current = false;
    pointerCacheRef.current.clear();
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
    }),
    [scale, translateX, translateY]
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
          Reset view
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
            My fortress
          </button>
        ) : null}
      </div>

      <div
        className={`${styles.viewport} ${isDragging ? styles.dragging : ""}`}
        onWheel={(event) => {
          event.preventDefault();
          userAdjustedViewRef.current = true;
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
                (Boolean(onSelectFortress) && fortress.isCurrentUser) ||
                (Boolean(onAttackTarget) && fortress.isTargetable);
              const variant = getSpriteVariant(fortress);
              const isMega = fortress.isNpc;
              const className = [
                styles.marker,
                isMega ? styles.megaMarker : "",
                fortress.isCrowned ? styles.crownedMarker : "",
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
                    onClick={(event) => {
                      if (suppressClickRef.current) {
                        event.preventDefault();
                        return;
                      }

                      if (fortress.isCurrentUser) {
                        onSelectFortress?.(fortress);
                        return;
                      }

                      if (fortress.isTargetable) {
                        setPendingTargetId(fortress.id);
                      }
                    }}
                    aria-pressed={
                      selectedTargetId === fortress.id ||
                      selectedFortressId === fortress.id
                    }
                    aria-label={
                      isMega
                        ? `${fortress.name}, ${fortress.health} of ${fortress.maxHealth} health`
                        : `${fortress.name}, ${fortress.points} points`
                    }
                  >
                    <span className={styles.selectionPulse} />
                    <span className={styles.spriteFrame}>
                      {isMega ? (
                        <MegaFortressSprite
                          iconLabel={fortress.iconLabel ?? "A-"}
                        />
                      ) : (
                        <FortressSprite
                          variant={variant}
                          action={fortress.currentAction}
                        />
                      )}
                    </span>
                    <span className={styles.pointsBadge}>
                      {isMega
                        ? `${fortress.health}/${fortress.maxHealth}`
                        : fortress.points}
                    </span>
                    <span className={styles.nameplate}>{fortress.name}</span>
                    {fortress.isCrowned ? (
                      <span className={styles.crownBadge}>Crown</span>
                    ) : null}
                    <span className={styles.tooltip}>
                      <strong>{fortress.name}</strong>
                      <span>
                        {isMega
                          ? `${fortress.health}/${fortress.maxHealth} HP`
                          : `${fortress.points} pts - ${fortress.currentAction}`}
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
                        {isMega
                          ? `${fortress.health}/${fortress.maxHealth} HP`
                          : `${fortress.points} pts`}
                      </span>
                      {travelMinutes ? <em>{travelMinutes} min ETA</em> : null}
                      <button
                        type="button"
                        onClick={() => {
                          setPendingTargetId(null);
                          onAttackTarget?.(fortress);
                        }}
                      >
                        Attack
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
