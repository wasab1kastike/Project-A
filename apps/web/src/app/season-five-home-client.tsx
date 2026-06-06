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

function ClassSelection({ state }: { state: SeasonFiveHomeState }) {
  return (
    <section className={styles.setup}>
      <div className={styles.sectionHeader}>
        <div>
          <p className={styles.kicker}>Character</p>
          <h2>Choose your washed-up hero</h2>
        </div>
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

function CharacterCommandCard({ state }: { state: SeasonFiveHomeState }) {
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
      <div className={styles.mapFrame} aria-hidden="true" />
      <div
        className={styles.tileMap}
        style={
          {
            "--map-columns": state.map.columns,
            "--map-rows": state.map.rows,
          } as CSSProperties
        }
      >
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

          return (
            <div
              key={tile.key}
              className={`${styles.mapTile} ${styles[`terrain${tile.terrain}`]} ${roleClass} ${
                isSelected ? styles.selectedTile : ""
              } ${isCurrent ? styles.currentTile : ""} ${
                isDestination ? styles.destinationTile : ""
              } ${tile.locked ? styles.lockedTile : ""}`}
              data-variant={tile.visualVariant}
              style={
                {
                  "--x": `${tilePosition.x}%`,
                  "--y": `${tilePosition.y}%`,
                } as CSSProperties
              }
            >
              <span className={styles.tileTexture} />
              {tile.role !== "NONE" ? (
                <span className={styles.tileRoleBadge}>
                  {tile.role === "HOME"
                    ? "H"
                    : tile.role === "FISHING_SPOT"
                      ? "F"
                      : tile.role === "SHOP"
                        ? "$"
                        : tile.role === "EVENT"
                          ? "!"
                          : "?"}
                </span>
              ) : null}
              {location ? (
                <button
                  type="button"
                  className={styles.locationTileButton}
                  disabled={!character || character.actionKind === "TRAVELING"}
                  onClick={() => {
                    if (!character || location.kind === "HOME") return;
                    setSelectedLocationKey(location.key);
                  }}
                  title={location.name}
                >
                  <span>{location.name}</span>
                </button>
              ) : tile.role !== "NONE" && tile.roleLabel ? (
                <span className={styles.specialTileLabel}>
                  {tile.roleLabel}
                </span>
              ) : null}
              {activity && activity.totalCount > 0 ? (
                <span className={styles.tilePopulation}>
                  {activity.totalCount}
                </span>
              ) : null}
              {activity && activity.characters.length > 0 ? (
                <span className={styles.tileActivityMarkers}>
                  {activity.characters.slice(0, 4).map((actor) => (
                    <i
                      key={actor.id}
                      className={
                        actor.actionKind === "TRAVELING"
                          ? styles.travellingDot
                          : actor.actionKind === "FISHING"
                            ? styles.fishingDot
                            : styles.homeDot
                      }
                      title={`${actor.name}: ${getActionLabel(
                        actor.actionKind
                      )} (${actor.classLabel})`}
                    >
                      {actor.classLabel.charAt(0)}
                    </i>
                  ))}
                </span>
              ) : null}
            </div>
          );
        })}
      </div>
      <svg
        className={styles.routeLayer}
        viewBox="0 0 100 100"
        aria-hidden="true"
      >
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
      </svg>
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

function InventoryPreview({ state }: { state: SeasonFiveHomeState }) {
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

      {!session ? (
        <section className={styles.noticeBand}>
          <h2>Sign in to join the open test.</h2>
          <p>Everyone can watch the waters. Signed-in players can fish.</p>
        </section>
      ) : null}

      {!character && session ? <ClassSelection state={liveState} /> : null}

      <div className={styles.playfield}>
        {character ? <CharacterCommandCard state={liveState} /> : null}
        <WorldMap state={liveState} />
        {character ? (
          <div className={styles.rightRail}>
            <InventoryPreview state={liveState} />
            <section className={styles.sidePanel}>
              <div className={styles.sectionHeader}>
                <div>
                  <p className={styles.kicker}>League</p>
                  <h2>Rankings</h2>
                </div>
              </div>
              <div className={styles.leaderboardColumns}>
                <Leaderboard
                  title="Most Fish"
                  rows={liveState.leaderboards.mostFish}
                  value={(row) => `${row.totalFishCaught} fish`}
                />
                <Leaderboard
                  title="Biggest Fish"
                  rows={liveState.leaderboards.biggestFish}
                  value={(row) => `${row.biggestFishCm} cm`}
                />
              </div>
            </section>
          </div>
        ) : null}
      </div>
    </main>
  );
}
