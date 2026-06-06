"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
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

function getTileMapPosition(tile: {
  row: number;
  xPercent: number;
  yPercent: number;
}) {
  const rowOffset = tile.row % 2 === 1 ? 2.9 : 0;

  return {
    x: Math.min(97, Math.max(3, tile.xPercent + rowOffset)),
    y: tile.yPercent,
  };
}

const SEASON_FIVE_HEX_RADIUS_X = 3.62;
const SEASON_FIVE_HEX_RADIUS_Y = 4.72;

function getSeasonFiveHexPoints(
  point: { x: number; y: number },
  scale = 1
) {
  const radiusX = SEASON_FIVE_HEX_RADIUS_X * scale;
  const radiusY = SEASON_FIVE_HEX_RADIUS_Y * scale;

  return [
    `${point.x - radiusX / 2},${point.y - radiusY}`,
    `${point.x + radiusX / 2},${point.y - radiusY}`,
    `${point.x + radiusX},${point.y}`,
    `${point.x + radiusX / 2},${point.y + radiusY}`,
    `${point.x - radiusX / 2},${point.y + radiusY}`,
    `${point.x - radiusX},${point.y}`,
  ].join(" ");
}

function getSeasonFiveFeaturePath({
  terrain,
  x,
  y,
}: {
  terrain: string;
  x: number;
  y: number;
}) {
  if (terrain === "FOREST") {
    return `M ${x - 1.5} ${y + 1.8} h 3 l -1.5 -4.2 z M ${x - 0.4} ${y + 2.4} h 0.8 v 1.1 h -0.8 z`;
  }

  if (terrain === "HILL" || terrain === "MOUNTAIN") {
    return `M ${x - 2.8} ${y + 2.3} l 2.2 -4.4 l 2.4 4.4 z M ${x - 0.2} ${y + 2.3} l 1.7 -3.3 l 2.2 3.3 z`;
  }

  if (terrain === "WATER" || terrain === "COAST") {
    return `M ${x - 3} ${y - 1.1} q 1.5 1 3 0 t 3 0 M ${x - 3} ${y + 1.2} q 1.5 1 3 0 t 3 0`;
  }

  if (terrain === "SWAMP") {
    return `M ${x - 2.8} ${y + 1.6} q 1.2 -1.5 2.4 0 t 2.4 0 M ${x - 1.8} ${y - 1.4} v 3.4 M ${x + 1.7} ${y - 1.2} v 3.1`;
  }

  if (terrain === "ROAD") {
    return `M ${x - 3.2} ${y - 2.8} c 1.7 1.4 1.7 4.1 0 5.6 M ${x + 3.2} ${y - 2.8} c -1.7 1.4 -1.7 4.1 0 5.6`;
  }

  return null;
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

function ClassSelection({
  state,
  onClose,
}: {
  state: SeasonFiveHomeState;
  onClose?: () => void;
}) {
  return (
    <section className={styles.setup}>
      <div className={styles.sectionHeader}>
        <div>
          <p className={styles.kicker}>Character</p>
          <h2>Choose your washed-up hero</h2>
        </div>
        <ClosePanelButton onClose={onClose} />
      </div>
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
            <button type="submit">Start fishing</button>
          </form>
        ))}
      </div>
    </section>
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
    <aside className={styles.commandCard}>
      <div className={styles.sectionHeader}>
        <div>
          <p className={styles.kicker}>Character</p>
          <h2>{character.name}</h2>
        </div>
        <span className={styles.classBadge}>
          <ClassPortrait
            classKey={character.class}
            label={character.classLabel}
            compact
          />
          {character.classLabel}
        </span>
        <ClosePanelButton onClose={onClose} />
      </div>

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
    </aside>
  );
}

function WorldMap({ state }: { state: SeasonFiveHomeState }) {
  const character = state.character;
  const [selectedLocationKey, setSelectedLocationKey] = useState<string | null>(
    null
  );
  const [nowMs, setNowMs] = useState(Date.now());
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
  const previewFromTile = currentTile;
  const previewToTile = selectedTile;
  const activeRouteFromTile =
    character?.actionKind === "TRAVELING" ? currentTile : null;
  const activeRouteToTile =
    character?.actionKind === "TRAVELING" ? destinationTile : null;

  useEffect(() => {
    if (character?.actionKind !== "TRAVELING") return;

    const interval = window.setInterval(() => {
      setNowMs(Date.now());
    }, 1000);

    return () => window.clearInterval(interval);
  }, [character?.actionKind]);

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
    activeRouteFromTile && activeRouteToTile
      ? {
          x:
            getTileMapPosition(activeRouteFromTile).x +
            (getTileMapPosition(activeRouteToTile).x -
              getTileMapPosition(activeRouteFromTile).x) *
              travelProgress,
          y:
            getTileMapPosition(activeRouteFromTile).y +
            (getTileMapPosition(activeRouteToTile).y -
              getTileMapPosition(activeRouteFromTile).y) *
              travelProgress,
        }
      : currentTile
        ? getTileMapPosition(currentTile)
        : null;

  return (
    <section className={styles.worldPanel} aria-label="Season 5 fishing map">
      <div className={styles.mapBoard}>
        <div className={styles.mapFrame} aria-hidden="true" />
        <div
          className={styles.seasonFiveHexMap}
          style={
            {
              "--map-columns": state.map.columns,
              "--map-rows": state.map.rows,
            } as CSSProperties
          }
        >
          <svg
            className={styles.seasonFiveHexMapSvg}
            viewBox="0 0 100 100"
            role="img"
            aria-label="Season 5 fishing world map"
          >
            <defs>
              <linearGradient id="seasonFiveGrass" x1="18%" y1="6%" x2="82%" y2="94%">
                <stop offset="0%" stopColor="#a7c767" />
                <stop offset="54%" stopColor="#5d9a4b" />
                <stop offset="100%" stopColor="#2f6d3d" />
              </linearGradient>
              <linearGradient id="seasonFiveForest" x1="16%" y1="4%" x2="84%" y2="96%">
                <stop offset="0%" stopColor="#75ad61" />
                <stop offset="46%" stopColor="#2d7142" />
                <stop offset="100%" stopColor="#163a2b" />
              </linearGradient>
              <linearGradient id="seasonFiveWater" x1="14%" y1="8%" x2="86%" y2="92%">
                <stop offset="0%" stopColor="#6ed0d4" />
                <stop offset="56%" stopColor="#258bad" />
                <stop offset="100%" stopColor="#113d63" />
              </linearGradient>
              <linearGradient id="seasonFiveCoast" x1="12%" y1="6%" x2="88%" y2="94%">
                <stop offset="0%" stopColor="#82c6bf" />
                <stop offset="52%" stopColor="#3d9293" />
                <stop offset="100%" stopColor="#bd9c5d" />
              </linearGradient>
              <linearGradient id="seasonFiveSwamp" x1="14%" y1="6%" x2="86%" y2="94%">
                <stop offset="0%" stopColor="#8b9f58" />
                <stop offset="48%" stopColor="#4f704b" />
                <stop offset="100%" stopColor="#27463d" />
              </linearGradient>
              <linearGradient id="seasonFiveHill" x1="14%" y1="5%" x2="86%" y2="95%">
                <stop offset="0%" stopColor="#d4b66f" />
                <stop offset="58%" stopColor="#8e7546" />
                <stop offset="100%" stopColor="#574332" />
              </linearGradient>
              <linearGradient id="seasonFiveMountain" x1="14%" y1="5%" x2="86%" y2="95%">
                <stop offset="0%" stopColor="#c9c7b5" />
                <stop offset="54%" stopColor="#7b7f74" />
                <stop offset="100%" stopColor="#414946" />
              </linearGradient>
              <linearGradient id="seasonFiveRoad" x1="14%" y1="5%" x2="86%" y2="95%">
                <stop offset="0%" stopColor="#d8b06b" />
                <stop offset="58%" stopColor="#9b6c3a" />
                <stop offset="100%" stopColor="#614129" />
              </linearGradient>
              <radialGradient id="seasonFiveHexLight" cx="32%" cy="20%" r="64%">
                <stop offset="0%" stopColor="rgba(255, 255, 255, 0.34)" />
                <stop offset="48%" stopColor="rgba(255, 255, 255, 0.08)" />
                <stop offset="100%" stopColor="rgba(0, 0, 0, 0.32)" />
              </radialGradient>
            </defs>
            <rect className={styles.seasonFiveMapBase} width="100" height="100" />
            {previewFromTile && previewToTile ? (
              <line
                x1={getTileMapPosition(previewFromTile).x}
                y1={getTileMapPosition(previewFromTile).y}
                x2={getTileMapPosition(previewToTile).x}
                y2={getTileMapPosition(previewToTile).y}
                className={styles.previewRoute}
              />
            ) : null}
            {activeRouteFromTile && activeRouteToTile ? (
              <line
                x1={getTileMapPosition(activeRouteFromTile).x}
                y1={getTileMapPosition(activeRouteFromTile).y}
                x2={getTileMapPosition(activeRouteToTile).x}
                y2={getTileMapPosition(activeRouteToTile).y}
                className={styles.activeRoute}
              />
            ) : null}
            {state.map.tiles.map((tile) => {
            const tilePosition = getTileMapPosition(tile);
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
            const featurePath = getSeasonFiveFeaturePath({
              terrain: tile.terrain,
              x: tilePosition.x,
              y: tilePosition.y,
            });

            return (
              <g
                key={tile.key}
                className={`${styles.seasonFiveHexTile} ${styles[`terrain${tile.terrain}`]} ${roleClass} ${
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
                }}
                onKeyDown={(event) => {
                  if (!isInteractive || !location) return;
                  if (event.key !== "Enter" && event.key !== " ") return;
                  event.preventDefault();
                  setSelectedLocationKey(location.key);
                }}
              >
                <title>{location?.name ?? tile.roleLabel ?? tile.terrain}</title>
                <polygon points={getSeasonFiveHexPoints(tilePosition)} />
                <polygon
                  className={styles.seasonFiveHexLight}
                  points={getSeasonFiveHexPoints(tilePosition, 0.96)}
                />
                <polyline
                  className={styles.seasonFiveHexInner}
                  points={getSeasonFiveHexPoints(tilePosition, 0.72)}
                />
                {featurePath ? (
                  <path
                    className={styles.seasonFiveHexFeature}
                    d={featurePath}
                  />
                ) : null}
                {tile.role !== "NONE" ? (
                  <g className={styles.seasonFiveHexMarker}>
                    <circle cx={tilePosition.x} cy={tilePosition.y} r="1.9" />
                    <text x={tilePosition.x} y={tilePosition.y + 0.68}>
                    {tile.role === "HOME"
                      ? "H"
                      : tile.role === "FISHING_SPOT"
                        ? "F"
                        : tile.role === "SHOP"
                          ? "$"
                          : tile.role === "EVENT"
                            ? "!"
                            : "?"}
                    </text>
                  </g>
                ) : null}
                {activity && activity.totalCount > 0 ? (
                  <g className={styles.seasonFiveHexPopulation}>
                    <circle cx={tilePosition.x + 2.42} cy={tilePosition.y + 2.56} r="1.7" />
                    <text x={tilePosition.x + 2.42} y={tilePosition.y + 3.08}>
                      {activity.totalCount}
                    </text>
                  </g>
                ) : null}
                {activity && activity.characters.length > 0 ? (
                  <g className={styles.seasonFiveHexActors}>
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
                          tilePosition.x + 1.85 + actorIndex * 1.08
                        } ${tilePosition.y - 2.72})`}
                      >
                        <title>{`${actor.name}: ${getActionLabel(
                          actor.actionKind
                        )} (${actor.classLabel})`}</title>
                        <circle r="0.8" />
                        <text y="0.3">{actor.classLabel.charAt(0)}</text>
                      </g>
                    ))}
                  </g>
                ) : null}
              </g>
            );
          })}
          </svg>
        </div>
        {character && characterMapPosition ? (
          <span
            className={styles.characterMapMarker}
            style={
              {
                "--x": `${characterMapPosition.x}%`,
                "--y": `${characterMapPosition.y}%`,
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
    <section className={styles.sidePanel}>
      <div className={styles.sectionHeader}>
        <div>
          <p className={styles.kicker}>Current haul</p>
          <h2>Inventory</h2>
        </div>
        {character.inventoryFull || character.inventoryCloseToFull ? (
          <span className={styles.warning}>
            {character.inventoryPressureLabel}
          </span>
        ) : null}
        <ClosePanelButton onClose={onClose} />
      </div>
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
    </section>
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
    <section className={styles.sidePanel}>
      <div className={styles.sectionHeader}>
        <div>
          <p className={styles.kicker}>League</p>
          <h2>Rankings</h2>
        </div>
        <ClosePanelButton onClose={onClose} />
      </div>
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
    </section>
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
        <WorldMap state={liveState} />

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
