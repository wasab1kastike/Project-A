"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import type { Session } from "next-auth";
import { io } from "socket.io-client";
import { SessionActions } from "@/components/session-actions";
import { NoticeToast } from "@/components/notice-toast";
import { PROJECT_A_REFRESH_EVENT } from "@/lib/realtime";
import { reviveGameStateDates } from "@/lib/live-state-serialization";
import type {
  SeasonFiveHomeState,
  SeasonFiveStatKey,
} from "@/lib/game/season-five";
import {
  HEX_RADIUS,
  HEX_TILES,
  MAP_WORLD_HEIGHT,
  MAP_WORLD_WIDTH,
  getHexPolygonPoints,
  type HexBiome,
  type HexTile,
} from "@/lib/game/map-hex";
import {
  createSeasonFiveCharacterAction,
  returnSeasonFiveHomeAction,
  startSeasonFiveFishingTripAction,
} from "@/app/game-actions";
import styles from "./season-five.module.css";

const dateTimeFormatter = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "short",
});

function formatClassKey(key: string) {
  return key
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

const CLASS_VISUALS = {
  DRUNKEN_MONK: {
    asset: "/assets/season-5/classes/drunken-monk.svg",
    tone: "monk",
  },
  RETIRED_WARRIOR: {
    asset: "/assets/season-5/classes/retired-warrior.svg",
    tone: "warrior",
  },
  DEMENTED_WIZARD: {
    asset: "/assets/season-5/classes/demented-wizard.svg",
    tone: "wizard",
  },
  BURNT_OUT_ROGUE: {
    asset: "/assets/season-5/classes/burnt-out-rogue.svg",
    tone: "rogue",
  },
} as const;

function getClassVisual(classKey: string) {
  return CLASS_VISUALS[classKey as keyof typeof CLASS_VISUALS] ?? null;
}

function getActionLabel(actionKind: string) {
  if (actionKind === "TRAVELING") return "Traveling";
  if (actionKind === "FISHING") return "Fishing";
  return "Home";
}

const SEASON_FIVE_MIN_SCALE = 0.1;
const SEASON_FIVE_MAX_SCALE = 1.72;
const SEASON_FIVE_ZOOM_STEP = 0.14;
const CLICK_DRAG_THRESHOLD = 6;

type Point = {
  x: number;
  y: number;
};

type DragStart = Point & {
  translateX: number;
  translateY: number;
};

type PinchStart = {
  distance: number;
  midpoint: Point;
  scale: number;
  translateX: number;
  translateY: number;
};

const HEX_TILE_POLYGON_POINTS = new Map(
  HEX_TILES.map((tile) => [tile.id, getHexPolygonPoints(tile.x, tile.y)])
);
const HEX_TILE_INNER_POINTS = new Map(
  HEX_TILES.map((tile) => [
    tile.id,
    getHexPolygonPoints(tile.x, tile.y, HEX_RADIUS * 0.72),
  ])
);
const HEX_TILE_FEATURE_PATHS = new Map<string, string>(
  HEX_TILES.flatMap((tile): Array<[string, string]> => {
    if (tile.biome === "forest") {
      return [
        [
          tile.id,
          `M ${tile.x - 15} ${tile.y + 12} h 30 l -15 -28 z M ${
            tile.x - 4
          } ${tile.y + 16} h 8 v 10 h -8 z`,
        ],
      ];
    }

    if (tile.biome === "hills" || tile.biome === "mountains") {
      return [
        [
          tile.id,
          `M ${tile.x - 25} ${tile.y + 16} l 19 -32 l 20 32 z M ${
            tile.x - 3
          } ${tile.y + 16} l 18 -25 l 20 25 z`,
        ],
      ];
    }

    if (tile.biome === "marsh") {
      return [
        [
          tile.id,
          `M ${tile.x - 25} ${tile.y + 11} q 12 -10 24 0 t 24 0 M ${
            tile.x - 15
          } ${tile.y - 8} v 28 M ${tile.x + 16} ${tile.y - 10} v 27`,
        ],
      ];
    }

    if (tile.biome === "water" || tile.biome === "lake" || tile.biome === "coast") {
      return [
        [
          tile.id,
          `M ${tile.x - 28} ${tile.y - 10} q 14 9 28 0 t 28 0 M ${
            tile.x - 28
          } ${tile.y + 12} q 14 9 28 0 t 28 0`,
        ],
      ];
    }

    return [];
  })
);

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function getViewportMinScale(bounds: DOMRect | undefined) {
  if (!bounds) return 0.18;

  const fitScale = Math.min(
    bounds.width / MAP_WORLD_WIDTH,
    bounds.height / MAP_WORLD_HEIGHT
  );

  return clamp(fitScale * 0.94, SEASON_FIVE_MIN_SCALE, 0.32);
}

function getTouchPointInShell(
  event: ReactPointerEvent<HTMLElement>,
  bounds: DOMRect
): Point {
  return {
    x: event.clientX - bounds.left,
    y: event.clientY - bounds.top,
  };
}

function getPinchSnapshot(points: Point[]) {
  const [first, second] = points;
  if (!first || !second) return null;

  return {
    distance: Math.hypot(second.x - first.x, second.y - first.y),
    midpoint: {
      x: (first.x + second.x) / 2,
      y: (first.y + second.y) / 2,
    },
  };
}

function getNearestSeasonFourHex(point: { xPercent: number; yPercent: number }) {
  let closest = HEX_TILES[0];
  let closestDistance = Number.POSITIVE_INFINITY;

  for (const tile of HEX_TILES) {
    const distance =
      (tile.xPercent - point.xPercent) ** 2 +
      (tile.yPercent - point.yPercent) ** 2;
    if (distance < closestDistance) {
      closest = tile;
      closestDistance = distance;
    }
  }

  return closest;
}

function getRoleMarker(role: string) {
  if (role === "HOME") return "H";
  if (role === "FISHING_SPOT") return "F";
  if (role === "SHOP") return "$";
  if (role === "EVENT") return "!";
  if (role === "SECRET_LAKE") return "?";
  return "";
}

type OpenPanel = "character" | "inventory" | "rankings" | "classes";

async function fetchSeasonFiveState(reason?: string) {
  const searchParams = new URLSearchParams();
  if (reason) {
    searchParams.set("reason", reason);
  }

  const response = await fetch(`/api/game/state?${searchParams.toString()}`, {
    method: "GET",
    credentials: "same-origin",
    headers: {
      Accept: "application/json",
    },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Season 5 state fetch failed with ${response.status}.`);
  }

  return reviveGameStateDates((await response.json()) as SeasonFiveHomeState);
}

export function InventoryPressureMeter({
  character,
}: {
  character: NonNullable<SeasonFiveHomeState["character"]>;
}) {
  return (
    <div
      className={styles.inventoryPressure}
      data-pressure={
        character.inventoryFull
          ? "full"
          : character.inventoryCloseToFull
            ? "tight"
            : "roomy"
      }
    >
      <div className={styles.inventoryPressureHeader}>
        <strong>{character.inventoryPressureLabel}</strong>
        <span>
          {character.inventoryUsed}/{character.inventoryCapacity} slots
        </span>
      </div>
      <div
        className={styles.inventoryPressureTrack}
        aria-label={`Inventory ${character.inventoryPercent}% full`}
      >
        <span style={{ inlineSize: `${character.inventoryPercent}%` }} />
      </div>
      <p className={styles.smallText}>
        {character.inventoryFull
          ? "Fishing pauses until the haul is unloaded."
          : `${character.inventoryRemaining} slot${
              character.inventoryRemaining === 1 ? "" : "s"
            } open before the pack fills.`}
      </p>
    </div>
  );
}

export function ClassPortrait({
  classKey,
  label,
  compact = false,
}: {
  classKey: string;
  label: string;
  compact?: boolean;
}) {
  const visual = getClassVisual(classKey);

  if (!visual) {
    return <span className={styles.classPortraitFallback}>{label}</span>;
  }

  return (
    <span
      className={`${styles.classPortrait} ${styles[visual.tone]} ${
        compact ? styles.compactPortrait : ""
      }`}
    >
      <img src={visual.asset} alt={label} />
    </span>
  );
}

export function SeasonFiveRealtimeBridge({
  enabled,
  onRefresh,
}: {
  enabled: boolean;
  onRefresh: (reason?: string) => void;
}) {
  useEffect(() => {
    if (!enabled) return;

    const socket = io({
      path: "/socket.io",
      withCredentials: true,
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
    });

    socket.on(PROJECT_A_REFRESH_EVENT, (payload?: { reason?: string }) => {
      if (payload?.reason !== "connected") {
        onRefresh(payload?.reason ?? "socket-event");
      }
    });

    return () => {
      socket.disconnect();
    };
  }, [enabled, onRefresh]);

  return null;
}

export function StatBars({
  stats,
  labels,
}: {
  stats: Record<SeasonFiveStatKey, number>;
  labels: Record<SeasonFiveStatKey, string>;
}) {
  return (
    <div className={styles.statBars}>
      {(Object.entries(labels) as Array<[SeasonFiveStatKey, string]>).map(
        ([key, label]) => (
          <div key={key} className={styles.statBar}>
            <span>{label}</span>
            <strong>{stats[key]}</strong>
            <i style={{ inlineSize: `${stats[key] * 10}%` }} />
          </div>
        )
      )}
    </div>
  );
}

function ClosePanelButton({ onClose }: { onClose?: () => void }) {
  if (!onClose) return null;

  return (
    <button
      type="button"
      className={styles.closePanelButton}
      onClick={onClose}
      aria-label="Close panel"
    >
      ×
    </button>
  );
}

function MapOverlay({
  kicker,
  title,
  onClose,
  children,
  meta,
  variant = "left",
}: {
  kicker: string;
  title: string;
  onClose?: () => void;
  children: ReactNode;
  meta?: ReactNode;
  variant?: "left" | "right" | "wide";
}) {
  const variantClass =
    variant === "right"
      ? styles.mapOverlayRight
      : variant === "wide"
        ? styles.mapOverlayWide
        : styles.mapOverlayLeft;

  return (
    <section className={`${styles.mapOverlay} ${variantClass}`}>
      <div className={styles.sectionHeader}>
        <div>
          <p className={styles.kicker}>{kicker}</p>
          <h2>{title}</h2>
        </div>
        {meta}
        <ClosePanelButton onClose={onClose} />
      </div>
      {children}
    </section>
  );
}

function ClassSelection({
  state,
  onClose,
}: {
  state: SeasonFiveHomeState;
  onClose?: () => void;
}) {
  return (
    <MapOverlay
      kicker="Character"
      title="Choose your washed-up hero"
      onClose={onClose}
      variant="wide"
    >
      <div className={styles.classGrid}>
        {state.classes.map((characterClass) => (
          <form
            key={characterClass.key}
            action={createSeasonFiveCharacterAction}
            className={styles.classChoice}
          >
            <input
              type="hidden"
              name="characterClass"
              value={characterClass.key}
            />
            <ClassPortrait
              classKey={characterClass.key}
              label={formatClassKey(characterClass.key)}
            />
            <h3>{formatClassKey(characterClass.key)}</h3>
            <p>{characterClass.summary}</p>
            <StatBars stats={characterClass.stats} labels={state.statLabels} />
            <label className={styles.characterNameField}>
              <span>Name</span>
              <input
                type="text"
                name="characterName"
                maxLength={40}
                minLength={1}
                required
                autoComplete="off"
              />
            </label>
            <button type="submit">Start fishing</button>
          </form>
        ))}
      </div>
    </MapOverlay>
  );
}

function CharacterCommandCard({
  state,
  onClose,
}: {
  state: SeasonFiveHomeState;
  onClose?: () => void;
}) {
  const character = state.character;
  if (!character) return null;

  return (
    <MapOverlay
      kicker="Character"
      title={character.name}
      onClose={onClose}
      variant="left"
      meta={
        <span className={styles.classBadge}>
          <ClassPortrait
            classKey={character.class}
            label={character.classLabel}
            compact
          />
          {character.classLabel}
        </span>
      }
    >

      <div className={styles.commandStatus}>
        <strong>{getActionLabel(character.actionKind)}</strong>
        <span>
          {character.actionKind === "TRAVELING"
            ? `To ${character.destinationLocationName}`
            : character.currentLocationName}
        </span>
      </div>

      {character.actionCompletesAt ? (
        <p className={styles.smallText}>
          Arrival{" "}
          {dateTimeFormatter.format(new Date(character.actionCompletesAt))}
        </p>
      ) : null}

      <div className={styles.statGrid}>
        <div>
          <span>Fish</span>
          <strong>{character.totalFishCaught}</strong>
        </div>
        <div>
          <span>Biggest</span>
          <strong>{character.biggestFishCm} cm</strong>
        </div>
        <div>
          <span>Pack</span>
          <strong>
            {character.inventoryUsed}/{character.inventoryCapacity}
          </strong>
        </div>
        <div>
          <span>Points</span>
          <strong>{character.skillPoints}</strong>
        </div>
      </div>

      <InventoryPressureMeter character={character} />

      <StatBars stats={character.stats} labels={state.statLabels} />

      <div className={styles.commandActions}>
        <form action={returnSeasonFiveHomeAction}>
          <button type="submit" className={styles.secondaryButton}>
            Return / unload
          </button>
        </form>
        <Link className={styles.linkButton} href="/character">
          Manage character
        </Link>
      </div>
    </MapOverlay>
  );
}

function WorldMap({
  state,
  onRouteSelected,
}: {
  state: SeasonFiveHomeState;
  onRouteSelected?: () => void;
}) {
  const character = state.character;
  const shellRef = useRef<HTMLElement | null>(null);
  const userAdjustedViewRef = useRef(false);
  const activePointersRef = useRef(new Map<number, Point>());
  const pinchStartRef = useRef<PinchStart | null>(null);
  const [selectedLocationKey, setSelectedLocationKey] = useState<string | null>(
    null
  );
  const [nowMs, setNowMs] = useState(Date.now());
  const [scale, setScale] = useState(0.62);
  const [translateX, setTranslateX] = useState(0);
  const [translateY, setTranslateY] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState<DragStart | null>(null);
  const selectedLocation =
    state.locations.find((location) => location.key === selectedLocationKey) ??
    null;
  const tileByKey = new Map(state.map.tiles.map((tile) => [tile.key, tile]));
  const locationByTileKey = new Map(
    state.locations
      .filter((location) => location.tileKey)
      .map((location) => [location.tileKey, location])
  );
  const currentTile = character?.currentTileKey
    ? (tileByKey.get(character.currentTileKey) ?? null)
    : null;
  const destinationTile = character?.destinationTileKey
    ? (tileByKey.get(character.destinationTileKey) ?? null)
    : null;
  const selectedTile = selectedLocation?.tileKey
    ? (tileByKey.get(selectedLocation.tileKey) ?? null)
    : null;
  const projectedTileByKey = useMemo(
    () =>
      new Map(
        state.map.tiles.map((tile) => [
          tile.key,
          {
            source: tile,
            hex: getNearestSeasonFourHex(tile),
          },
        ])
      ),
    [state.map.tiles]
  );
  const projectedLocationByKey = useMemo(
    () =>
      new Map(
        state.locations.map((location) => {
          const tile = location.tileKey
            ? projectedTileByKey.get(location.tileKey)?.hex
            : null;
          return [
            location.key,
            tile ?? getNearestSeasonFourHex(location),
          ] as const;
        })
      ),
    [projectedTileByKey, state.locations]
  );
  const currentProjectedHex = currentTile
    ? (projectedTileByKey.get(currentTile.key)?.hex ?? null)
    : null;
  const destinationProjectedHex = destinationTile
    ? (projectedTileByKey.get(destinationTile.key)?.hex ?? null)
    : null;
  const selectedProjectedHex = selectedLocation
    ? (projectedLocationByKey.get(selectedLocation.key) ?? null)
    : null;
  const previewFromHex = currentProjectedHex;
  const previewToHex = selectedProjectedHex;
  const activeRouteFromHex =
    character?.actionKind === "TRAVELING" ? currentProjectedHex : null;
  const activeRouteToHex =
    character?.actionKind === "TRAVELING" ? destinationProjectedHex : null;

  const clampTranslation = useCallback(
    (nextX: number, nextY: number, nextScale: number) => {
      const shellBounds = shellRef.current?.getBoundingClientRect();
      if (!shellBounds) return { x: nextX, y: nextY };

      const visiblePaddingX = Math.min(shellBounds.width * 0.34, 220);
      const visiblePaddingY = Math.min(shellBounds.height * 0.34, 180);
      const overflowX = (MAP_WORLD_WIDTH * nextScale - shellBounds.width) / 2;
      const overflowY = (MAP_WORLD_HEIGHT * nextScale - shellBounds.height) / 2;
      const maxX = overflowX > 0 ? overflowX + visiblePaddingX : 0;
      const maxY = overflowY > 0 ? overflowY + visiblePaddingY : 0;

      return {
        x: clamp(nextX, -maxX, maxX),
        y: clamp(nextY, -maxY, maxY),
      };
    },
    []
  );

  const applyView = useCallback(
    (nextScale: number, nextX: number, nextY: number) => {
      const shellBounds = shellRef.current?.getBoundingClientRect();
      const viewportMinScale = getViewportMinScale(shellBounds);
      const clampedScale = clamp(
        nextScale,
        viewportMinScale,
        SEASON_FIVE_MAX_SCALE
      );
      const clampedTranslate = clampTranslation(nextX, nextY, clampedScale);
      setScale(clampedScale);
      setTranslateX(clampedTranslate.x);
      setTranslateY(clampedTranslate.y);
    },
    [clampTranslation]
  );

  const focusHex = useCallback(
    (hex: HexTile, focusScale = 0.92) => {
      const shellBounds = shellRef.current?.getBoundingClientRect();
      const nextScale = clamp(
        focusScale,
        getViewportMinScale(shellBounds),
        SEASON_FIVE_MAX_SCALE
      );
      const nextTranslateX = -(hex.x - MAP_WORLD_WIDTH / 2) * nextScale;
      const nextTranslateY = -(hex.y - MAP_WORLD_HEIGHT / 2) * nextScale;
      applyView(nextScale, nextTranslateX, nextTranslateY);
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
      const clampedNextScale = clamp(
        nextScale,
        getViewportMinScale(shellBounds),
        SEASON_FIVE_MAX_SCALE
      );
      const ratio = clampedNextScale / scale;

      applyView(
        clampedNextScale,
        anchorCenteredX - (anchorCenteredX - translateX) * ratio,
        anchorCenteredY - (anchorCenteredY - translateY) * ratio
      );
    },
    [applyView, scale, translateX, translateY]
  );

  const resetView = useCallback(() => {
    userAdjustedViewRef.current = false;
    if (currentProjectedHex) {
      focusHex(currentProjectedHex, 0.92);
      return;
    }
    applyView(0.62, 0, 0);
  }, [applyView, currentProjectedHex, focusHex]);

  useEffect(() => {
    if (character?.actionKind !== "TRAVELING") return;

    const interval = window.setInterval(() => {
      setNowMs(Date.now());
    }, 1000);

    return () => window.clearInterval(interval);
  }, [character?.actionKind]);

  useEffect(() => {
    if (userAdjustedViewRef.current) return;

    if (currentProjectedHex) {
      focusHex(currentProjectedHex, 0.92);
      return;
    }

    applyView(0.62, 0, 0);
  }, [applyView, currentProjectedHex, focusHex]);

  const travelProgress =
    character?.actionKind === "TRAVELING" &&
    character.actionStartedAt &&
    character.actionCompletesAt
      ? Math.min(
          1,
          Math.max(
            0,
            (nowMs - new Date(character.actionStartedAt).getTime()) /
              Math.max(
                1,
                new Date(character.actionCompletesAt).getTime() -
                  new Date(character.actionStartedAt).getTime()
              )
          )
        )
      : 0;
  const characterMapPosition =
    activeRouteFromHex && activeRouteToHex
      ? {
          x:
            activeRouteFromHex.x +
            (activeRouteToHex.x - activeRouteFromHex.x) * travelProgress,
          y:
            activeRouteFromHex.y +
            (activeRouteToHex.y - activeRouteFromHex.y) * travelProgress,
        }
      : currentProjectedHex
        ? { x: currentProjectedHex.x, y: currentProjectedHex.y }
        : null;
  const viewTransform = useMemo(
    () => ({
      transform: `translate(-50%, -50%) translate(${translateX}px, ${translateY}px) scale(${scale})`,
      width: `${MAP_WORLD_WIDTH}px`,
      height: `${MAP_WORLD_HEIGHT}px`,
    }),
    [scale, translateX, translateY]
  );
  const showMapDepth = scale >= 0.34;
  const showMapDetail = scale >= 0.38;
  const biomeClassByBiome = useMemo<Record<HexBiome, string>>(
    () => ({
      coast: styles.seasonFiveCoastTile,
      forest: styles.seasonFiveForestTile,
      hills: styles.seasonFiveHillsTile,
      lake: styles.seasonFiveLakeTile,
      marsh: styles.seasonFiveMarshTile,
      mountains: styles.seasonFiveMountainsTile,
      plains: styles.seasonFivePlainsTile,
      water: styles.seasonFiveWaterTile,
    }),
    []
  );

  return (
    <section
      ref={shellRef}
      className={styles.worldPanel}
      aria-label="Season 5 fishing map"
      tabIndex={0}
      onKeyDown={(event) => {
        if (
          event.key === "+" ||
          event.key === "=" ||
          event.key === "NumpadAdd"
        ) {
          event.preventDefault();
          userAdjustedViewRef.current = true;
          zoomFromViewportPoint(scale + SEASON_FIVE_ZOOM_STEP);
        }
        if (event.key === "-" || event.key === "NumpadSubtract") {
          event.preventDefault();
          userAdjustedViewRef.current = true;
          zoomFromViewportPoint(scale - SEASON_FIVE_ZOOM_STEP);
        }
        if (event.key === "0") {
          event.preventDefault();
          resetView();
        }
      }}
    >
      <div
        className={`${styles.mapViewport} ${isDragging ? styles.dragging : ""}`}
        onWheel={(event) => {
          event.preventDefault();
          userAdjustedViewRef.current = true;
          shellRef.current?.focus({ preventScroll: true });
          const shellBounds = shellRef.current?.getBoundingClientRect();
          const zoomAmount = clamp(-event.deltaY / 600, -0.28, 0.28);
          zoomFromViewportPoint(
            scale * (1 + zoomAmount),
            shellBounds
              ? {
                  x: event.clientX - shellBounds.left,
                  y: event.clientY - shellBounds.top,
                }
              : undefined
          );
        }}
        onPointerDown={(event: ReactPointerEvent<HTMLDivElement>) => {
          if (event.pointerType === "mouse" && event.button !== 0) return;
          const target = event.target as HTMLElement;
          if (target.closest("button, a, [role='button']")) return;
          const shellBounds = shellRef.current?.getBoundingClientRect();
          if (!shellBounds) return;

          shellRef.current?.focus({ preventScroll: true });
          activePointersRef.current.set(
            event.pointerId,
            getTouchPointInShell(event, shellBounds)
          );
          event.currentTarget.setPointerCapture(event.pointerId);

          if (activePointersRef.current.size >= 2) {
            const pinchSnapshot = getPinchSnapshot(
              Array.from(activePointersRef.current.values())
            );
            if (pinchSnapshot && pinchSnapshot.distance > 0) {
              userAdjustedViewRef.current = true;
              pinchStartRef.current = {
                ...pinchSnapshot,
                scale,
                translateX,
                translateY,
              };
              setIsDragging(false);
              setDragStart(null);
            }
            return;
          }

          pinchStartRef.current = null;
          setIsDragging(true);
          setDragStart({
            x: event.clientX,
            y: event.clientY,
            translateX,
            translateY,
          });
        }}
        onPointerMove={(event: ReactPointerEvent<HTMLDivElement>) => {
          const shellBounds = shellRef.current?.getBoundingClientRect();
          if (
            shellBounds &&
            activePointersRef.current.has(event.pointerId)
          ) {
            activePointersRef.current.set(
              event.pointerId,
              getTouchPointInShell(event, shellBounds)
            );
          }

          if (
            shellBounds &&
            activePointersRef.current.size >= 2 &&
            pinchStartRef.current
          ) {
            const pinchSnapshot = getPinchSnapshot(
              Array.from(activePointersRef.current.values())
            );
            if (!pinchSnapshot || pinchSnapshot.distance === 0) return;

            userAdjustedViewRef.current = true;
            const pinchStart = pinchStartRef.current;
            const nextScale = clamp(
              pinchStart.scale *
                (pinchSnapshot.distance / pinchStart.distance),
              getViewportMinScale(shellBounds),
              SEASON_FIVE_MAX_SCALE
            );
            const scaleRatio = nextScale / pinchStart.scale;
            const startAnchorCenteredX =
              pinchStart.midpoint.x - shellBounds.width / 2;
            const startAnchorCenteredY =
              pinchStart.midpoint.y - shellBounds.height / 2;
            const currentAnchorCenteredX =
              pinchSnapshot.midpoint.x - shellBounds.width / 2;
            const currentAnchorCenteredY =
              pinchSnapshot.midpoint.y - shellBounds.height / 2;

            applyView(
              nextScale,
              currentAnchorCenteredX -
                (startAnchorCenteredX - pinchStart.translateX) * scaleRatio,
              currentAnchorCenteredY -
                (startAnchorCenteredY - pinchStart.translateY) * scaleRatio
            );
            return;
          }

          if (!dragStart) return;
          const deltaX = event.clientX - dragStart.x;
          const deltaY = event.clientY - dragStart.y;
          if (Math.hypot(deltaX, deltaY) > CLICK_DRAG_THRESHOLD) {
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
        onPointerUp={(event: ReactPointerEvent<HTMLDivElement>) => {
          activePointersRef.current.delete(event.pointerId);
          pinchStartRef.current = null;
          setIsDragging(false);
          setDragStart(null);
          if (event.currentTarget.hasPointerCapture(event.pointerId)) {
            event.currentTarget.releasePointerCapture(event.pointerId);
          }
        }}
        onPointerCancel={(event: ReactPointerEvent<HTMLDivElement>) => {
          activePointersRef.current.delete(event.pointerId);
          pinchStartRef.current = null;
          setIsDragging(false);
          setDragStart(null);
        }}
      >
        <div
          className={styles.mapViewportContent}
          data-map-detail={showMapDetail ? "full" : "low"}
          style={viewTransform}
        >
          <svg
            className={styles.seasonFiveWorldMap}
            viewBox={`0 0 ${MAP_WORLD_WIDTH} ${MAP_WORLD_HEIGHT}`}
            role="img"
            aria-label="Season 5 fishing world map"
          >
            <defs>
              <radialGradient id="seasonFiveWorldLight" cx="32%" cy="20%" r="70%">
                <stop offset="0%" stopColor="rgba(255, 255, 255, 0.34)" />
                <stop offset="48%" stopColor="rgba(255, 255, 255, 0.08)" />
                <stop offset="100%" stopColor="rgba(0, 0, 0, 0.32)" />
              </radialGradient>
            </defs>
            <rect
              className={styles.seasonFiveWorldBase}
              width={MAP_WORLD_WIDTH}
              height={MAP_WORLD_HEIGHT}
            />
            {HEX_TILES.map((hex) => {
              const featurePath = HEX_TILE_FEATURE_PATHS.get(hex.id);
              return (
                <g
                  key={hex.id}
                  className={`${styles.seasonFiveWorldTile} ${
                    biomeClassByBiome[hex.biome]
                  }`}
                >
                  <polygon points={HEX_TILE_POLYGON_POINTS.get(hex.id)} />
                  {showMapDepth ? (
                    <polygon
                      className={styles.seasonFiveWorldLight}
                      points={getHexPolygonPoints(
                        hex.x,
                        hex.y,
                        HEX_RADIUS * 0.96
                      )}
                    />
                  ) : null}
                  {showMapDetail ? (
                    <polyline
                      className={styles.seasonFiveWorldInner}
                      points={HEX_TILE_INNER_POINTS.get(hex.id)}
                    />
                  ) : null}
                  {showMapDetail && featurePath ? (
                    <path
                      className={styles.seasonFiveWorldFeature}
                      d={featurePath}
                    />
                  ) : null}
                </g>
              );
            })}
            {previewFromHex && previewToHex ? (
              <line
                x1={previewFromHex.x}
                y1={previewFromHex.y}
                x2={previewToHex.x}
                y2={previewToHex.y}
                className={styles.previewRoute}
              />
            ) : null}
            {activeRouteFromHex && activeRouteToHex ? (
              <line
                x1={activeRouteFromHex.x}
                y1={activeRouteFromHex.y}
                x2={activeRouteToHex.x}
                y2={activeRouteToHex.y}
                className={styles.activeRoute}
              />
            ) : null}
            {state.map.tiles.map((tile) => {
            const projectedTile = projectedTileByKey.get(tile.key);
            if (!projectedTile) return null;
            const hex = projectedTile.hex;
            const location = locationByTileKey.get(tile.key);
            const activity = location
              ? state.locationActivity.find(
                  (entry) => entry.locationKey === location.key
                )
              : null;
            const roleClass =
              tile.role === "HOME"
                ? styles.homeTile
                  : tile.role === "FISHING_SPOT"
                    ? styles.fishingTile
                    : tile.role === "SHOP"
                    ? styles.shopTile
                    : tile.role === "EVENT"
                      ? styles.eventTile
                      : tile.role === "SECRET_LAKE"
                        ? styles.secretTile
                        : "";
            const isSelected = selectedLocation?.tileKey === tile.key;
            const isCurrent = character?.currentTileKey === tile.key;
            const isDestination = character?.destinationTileKey === tile.key;
            const isInteractive =
              Boolean(character) &&
              character?.actionKind !== "TRAVELING" &&
              Boolean(location) &&
              location?.kind !== "HOME";
            const marker = getRoleMarker(tile.role);

            return (
              <g
                key={tile.key}
                className={`${styles.seasonFiveWorldHotspot} ${roleClass} ${
                  isSelected ? styles.selectedTile : ""
                } ${isCurrent ? styles.currentTile : ""} ${
                  isDestination ? styles.destinationTile : ""
                } ${tile.locked ? styles.lockedTile : ""}`}
                data-variant={tile.visualVariant}
                role={isInteractive ? "button" : undefined}
                tabIndex={isInteractive ? 0 : undefined}
                onClick={() => {
                  if (!isInteractive || !location) return;
                  setSelectedLocationKey(location.key);
                  onRouteSelected?.();
                }}
                onKeyDown={(event) => {
                  if (!isInteractive || !location) return;
                  if (event.key !== "Enter" && event.key !== " ") return;
                  event.preventDefault();
                  setSelectedLocationKey(location.key);
                  onRouteSelected?.();
                }}
              >
                <title>{location?.name ?? tile.roleLabel ?? tile.terrain}</title>
                <polygon
                  className={styles.seasonFiveWorldHotspotArea}
                  points={HEX_TILE_POLYGON_POINTS.get(hex.id)}
                />
                {tile.role !== "NONE" ? (
                  <g className={styles.seasonFiveWorldMarker}>
                    <circle cx={hex.x} cy={hex.y} r="18" />
                    <text x={hex.x} y={hex.y + 7}>
                      {marker}
                    </text>
                  </g>
                ) : null}
                {activity && activity.totalCount > 0 ? (
                  <g className={styles.seasonFiveWorldPopulation}>
                    <circle cx={hex.x + 28} cy={hex.y + 28} r="16" />
                    <text x={hex.x + 28} y={hex.y + 34}>
                      {activity.totalCount}
                    </text>
                  </g>
                ) : null}
                {activity && activity.characters.length > 0 ? (
                  <g className={styles.seasonFiveWorldActors}>
                    {activity.characters.slice(0, 4).map((actor, actorIndex) => (
                      <g
                        key={actor.id}
                        className={
                          actor.actionKind === "TRAVELING"
                            ? styles.travellingDot
                            : actor.actionKind === "FISHING"
                              ? styles.fishingDot
                              : styles.homeDot
                        }
                        transform={`translate(${
                          hex.x + 22 + actorIndex * 12
                        } ${hex.y - 31})`}
                      >
                        <title>{`${actor.name}: ${getActionLabel(
                          actor.actionKind
                        )} (${actor.classLabel})`}</title>
                        <circle r="8" />
                        <text y="3">{actor.classLabel.charAt(0)}</text>
                      </g>
                    ))}
                  </g>
                ) : null}
              </g>
            );
          })}
          </svg>
        {character && characterMapPosition ? (
          <span
            className={styles.characterMapMarker}
            style={
              {
                "--x": `${characterMapPosition.x}px`,
                "--y": `${characterMapPosition.y}px`,
              } as CSSProperties
            }
            title={`${character.name}: ${getActionLabel(character.actionKind)}`}
          >
            <ClassPortrait
              classKey={character.class}
              label={character.classLabel}
              compact
            />
          </span>
        ) : null}
        </div>
      </div>
      {selectedLocation && selectedTile ? (
        <aside className={styles.routePreview}>
          <div>
            <p className={styles.kicker}>Route</p>
            <h3>{selectedLocation.name}</h3>
          </div>
          <p>
            {selectedLocation.travelMinutes}m travel |{" "}
            {selectedLocation.minFishCm}-{selectedLocation.maxFishCm} cm fish
          </p>
          <p>
            Difficulty {selectedLocation.catchDifficulty} | Tile{" "}
            {selectedTile.row + 1}:{selectedTile.col + 1}
          </p>
          <form action={startSeasonFiveFishingTripAction}>
            <input
              type="hidden"
              name="locationKey"
              value={selectedLocation.key}
            />
            <button type="submit">Travel</button>
            <button type="button" onClick={() => setSelectedLocationKey(null)}>
              Cancel
            </button>
          </form>
        </aside>
      ) : null}
    </section>
  );
}

function InventoryPreview({
  state,
  onClose,
}: {
  state: SeasonFiveHomeState;
  onClose?: () => void;
}) {
  const character = state.character;
  if (!character) return null;
  const latest = character.inventory.slice(-4).reverse();

  return (
    <MapOverlay
      kicker="Current haul"
      title="Inventory"
      onClose={onClose}
      variant="right"
      meta={
        character.inventoryFull || character.inventoryCloseToFull ? (
          <span className={styles.warning}>
            {character.inventoryPressureLabel}
          </span>
        ) : null
      }
    >
      <InventoryPressureMeter character={character} />
      <div className={styles.inventoryList}>
        {latest.length > 0 ? (
          latest.map((item) => (
            <div key={item.id}>
              <strong>{item.speciesName}</strong>
              <span className={styles.inventoryMeta}>
                {item.rarity} | {item.sizeCm} cm | {item.slots} slot
                {item.slots === 1 ? "" : "s"}
              </span>
            </div>
          ))
        ) : (
          <p className={styles.smallText}>No fish in the pack yet.</p>
        )}
      </div>
      <div className={styles.commandActions}>
        <form action={returnSeasonFiveHomeAction}>
          <button type="submit" className={styles.secondaryButton}>
            Return / unload
          </button>
        </form>
        <Link className={styles.linkButton} href="/character?tab=inventory">
          Open inventory
        </Link>
      </div>
    </MapOverlay>
  );
}

function LeaguePanel({
  state,
  onClose,
}: {
  state: SeasonFiveHomeState;
  onClose?: () => void;
}) {
  return (
    <MapOverlay
      kicker="League"
      title="Rankings"
      onClose={onClose}
      variant="right"
    >
      <div className={styles.leaderboardColumns}>
        <Leaderboard
          title="Most Fish"
          rows={state.leaderboards.mostFish}
          value={(row) => `${row.totalFishCaught} fish`}
        />
        <Leaderboard
          title="Biggest Fish"
          rows={state.leaderboards.biggestFish}
          value={(row) => `${row.biggestFishCm} cm`}
        />
      </div>
    </MapOverlay>
  );
}

type SeasonFiveLeaderboardRow =
  | SeasonFiveHomeState["leaderboards"]["mostFish"][number]
  | SeasonFiveHomeState["leaderboards"]["biggestFish"][number];

function hasCatchDetails(
  row: SeasonFiveLeaderboardRow
): row is SeasonFiveHomeState["leaderboards"]["biggestFish"][number] {
  return "catchId" in row;
}

function Leaderboard({
  title,
  rows,
  value,
}: {
  title: string;
  rows: SeasonFiveLeaderboardRow[];
  value: (row: SeasonFiveLeaderboardRow) => string;
}) {
  return (
    <div className={styles.leaderboard}>
      <h3>{title}</h3>
      {rows.length > 0 ? (
        <ol>
          {rows.map((row) => (
            <li key={row.id}>
              <span>
                {row.name}
                <small>{row.classLabel}</small>
                {hasCatchDetails(row) ? (
                  <small>
                    {row.speciesName} | {row.rarity}
                  </small>
                ) : null}
              </span>
              <strong>{value(row)}</strong>
            </li>
          ))}
        </ol>
      ) : (
        <p className={styles.smallText}>No ranked catches yet.</p>
      )}
    </div>
  );
}

export function SeasonFiveHomeClient({
  state,
  session,
  actionError,
  notice,
  authConfigured,
  realtimeEnabled,
}: {
  state: SeasonFiveHomeState;
  session: Session | null;
  actionError: string | null;
  notice: string | null;
  authConfigured: boolean;
  realtimeEnabled: boolean;
}) {
  const [liveState, setLiveState] = useState(state);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [openPanel, setOpenPanel] = useState<OpenPanel | null>(() => {
    if (!session) return null;
    return state.character ? null : "classes";
  });
  const refreshPromiseRef = useRef<Promise<void> | null>(null);
  const character = liveState.character;
  const activeUntil = liveState.cycle.activeEndsAt
    ? dateTimeFormatter.format(new Date(liveState.cycle.activeEndsAt))
    : "TBD";
  const refreshSeasonFiveState = useCallback(async (reason?: string) => {
    if (refreshPromiseRef.current) {
      return;
    }

    const refreshPromise = (async () => {
      setIsRefreshing(true);
      try {
        const nextState = await fetchSeasonFiveState(reason);
        setLiveState(nextState);
        setSyncError(null);
      } catch (error) {
        setSyncError(
          error instanceof Error
            ? error.message
            : "Season 5 state refresh failed."
        );
      } finally {
        setIsRefreshing(false);
        refreshPromiseRef.current = null;
      }
    })();

    refreshPromiseRef.current = refreshPromise;
    await refreshPromise;
  }, []);

  useEffect(() => {
    setLiveState(state);
  }, [state]);

  useEffect(() => {
    setOpenPanel((currentPanel) => {
      if (!session) return null;
      if (!liveState.character && currentPanel === "character") {
        return "classes";
      }
      if (!liveState.character && currentPanel === "inventory") {
        return "classes";
      }
      if (liveState.character && currentPanel === "classes") {
        return null;
      }
      return currentPanel;
    });
  }, [session, liveState.character]);

  const closePanel = useCallback(() => {
    setOpenPanel(null);
  }, []);

  return (
    <main className={styles.shell}>
      <SeasonFiveRealtimeBridge
        enabled={realtimeEnabled}
        onRefresh={refreshSeasonFiveState}
      />
      {notice ? <NoticeToast message={notice} /> : null}
      {actionError ? <NoticeToast message={actionError} /> : null}

      <header className={styles.topbar}>
        <div>
          <p className={styles.kicker}>Project-A Season 5 Preview</p>
          <h1>Roguelite Fishing League</h1>
        </div>
        <div className={styles.topbarMeta}>
          <span>Season ends {activeUntil}</span>
          {isRefreshing ? <span>Syncing...</span> : null}
          {syncError ? (
            <span className={styles.syncWarning}>Sync stale</span>
          ) : null}
          <SessionActions
            authConfigured={authConfigured}
            isAuthenticated={Boolean(session?.user)}
            isAdmin={session?.user?.role === "ADMIN"}
            variant="compact"
          />
        </div>
      </header>

      <div className={styles.playfield}>
        <WorldMap state={liveState} onRouteSelected={closePanel} />

        <nav className={styles.mapHud} aria-label="Map panels">
          {character ? (
            <>
              <button
                type="button"
                className={styles.hudButton}
                aria-pressed={openPanel === "character"}
                onClick={() =>
                  setOpenPanel((panel) =>
                    panel === "character" ? null : "character"
                  )
                }
              >
                Character
              </button>
              <button
                type="button"
                className={styles.hudButton}
                aria-pressed={openPanel === "inventory"}
                onClick={() =>
                  setOpenPanel((panel) =>
                    panel === "inventory" ? null : "inventory"
                  )
                }
              >
                Inventory
              </button>
            </>
          ) : session ? (
            <button
              type="button"
              className={styles.hudButton}
              aria-pressed={openPanel === "classes"}
              onClick={() =>
                setOpenPanel((panel) =>
                  panel === "classes" ? null : "classes"
                )
              }
            >
              Classes
            </button>
          ) : null}
          <button
            type="button"
            className={styles.hudButton}
            aria-pressed={openPanel === "rankings"}
            onClick={() =>
              setOpenPanel((panel) =>
                panel === "rankings" ? null : "rankings"
              )
            }
          >
            League
          </button>
        </nav>

        {!session ? (
          <section className={styles.noticeBand}>
            <h2>Sign in to join the open test.</h2>
            <p>Everyone can watch the waters. Signed-in players can fish.</p>
          </section>
        ) : null}

        {!character && session && openPanel === "classes" ? (
          <ClassSelection state={liveState} onClose={closePanel} />
        ) : null}

        {character ? (
          <>
            {openPanel === "character" ? (
              <CharacterCommandCard state={liveState} onClose={closePanel} />
            ) : null}
            {openPanel === "inventory" ? (
              <InventoryPreview state={liveState} onClose={closePanel} />
            ) : null}
          </>
        ) : null}

        {openPanel === "rankings" ? (
          <LeaguePanel state={liveState} onClose={closePanel} />
        ) : null}
      </div>
    </main>
  );
}
