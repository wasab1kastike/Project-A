"use client";

import Link from "next/link";
import { useEffect, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import type { Session } from "next-auth";
import { io } from "socket.io-client";
import { SessionActions } from "@/components/session-actions";
import { NoticeToast } from "@/components/notice-toast";
import { PROJECT_A_REFRESH_EVENT } from "@/lib/realtime";
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

export function SeasonFiveRealtimeBridge({ enabled }: { enabled: boolean }) {
  const router = useRouter();

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
        router.refresh();
      }
    });

    return () => {
      socket.disconnect();
    };
  }, [enabled, router]);

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
  const markerOffsets = [
    [0, -46],
    [42, -22],
    [46, 22],
    [0, 46],
    [-42, 22],
    [-46, -22],
    [26, -48],
    [54, 0],
    [26, 48],
    [-26, 48],
    [-54, 0],
    [-26, -48],
  ];

  return (
    <section className={styles.worldPanel} aria-label="Season 5 fishing map">
      <img
        className={styles.worldMapImage}
        src="/assets/season-5/world-map.png"
        alt="A 2.5D fantasy fishing world with lakes, marshes, hills, and a sea coast."
      />
      <div className={styles.mapShade} />
      {state.locations.map((location) => {
        const activity = state.locationActivity.find(
          (entry) => entry.locationKey === location.key
        );
        const isCurrent =
          character?.currentLocationKey === location.key &&
          character.actionKind !== "TRAVELING";
        const isDestination =
          character?.destinationLocationName === location.name &&
          character.actionKind === "TRAVELING";

        return (
          <div
            key={location.key}
            className={`${styles.mapNode} ${
              location.kind === "HOME" ? styles.homeNode : ""
            } ${isCurrent ? styles.currentNode : ""} ${
              isDestination ? styles.destinationNode : ""
            }`}
            style={
              {
                "--x": `${location.xPercent}%`,
                "--y": `${location.yPercent}%`,
              } as CSSProperties
            }
          >
            <form action={startSeasonFiveFishingTripAction}>
              <input type="hidden" name="locationKey" value={location.key} />
              <button
                type="submit"
                disabled={
                  !character ||
                  location.kind === "HOME" ||
                  character.actionKind === "TRAVELING"
                }
                title={location.name}
              >
                <span>{location.name}</span>
                <small>
                  {location.kind === "HOME"
                    ? "Home base"
                    : `${location.travelMinutes}m | ${location.minFishCm}-${location.maxFishCm} cm`}
                </small>
              </button>
            </form>
            <div
              className={styles.activityRing}
              aria-label={`${location.name} activity`}
            >
              {(activity?.characters ?? []).map((actor, index) => (
                <span
                  key={actor.id}
                  className={`${styles.playerMarker} ${
                    actor.actionKind === "TRAVELING"
                      ? styles.travellingMarker
                      : actor.actionKind === "FISHING"
                        ? styles.fishingMarker
                        : styles.homeMarker
                  } ${actor.inventoryFull ? styles.fullInventoryMarker : ""}`}
                  aria-label={`${actor.name}: ${getActionLabel(actor.actionKind)} (${actor.classLabel})${
                    actor.inventoryFull ? ", inventory full" : ""
                  }`}
                  title={`${actor.name}: ${getActionLabel(actor.actionKind)} (${actor.classLabel})${
                    actor.inventoryFull ? " - inventory full" : ""
                  }`}
                  style={
                    {
                      "--marker-x": `${markerOffsets[index % markerOffsets.length][0]}px`,
                      "--marker-y": `${markerOffsets[index % markerOffsets.length][1]}px`,
                    } as CSSProperties
                  }
                >
                  <ClassPortrait
                    classKey={actor.class}
                    label={actor.classLabel}
                    compact
                  />
                  <i aria-hidden="true" />
                </span>
              ))}
            </div>
          </div>
        );
      })}
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
  const character = state.character;
  const activeUntil = state.cycle.activeEndsAt
    ? dateTimeFormatter.format(new Date(state.cycle.activeEndsAt))
    : "TBD";

  return (
    <main className={styles.shell}>
      <SeasonFiveRealtimeBridge enabled={realtimeEnabled} />
      {notice ? <NoticeToast message={notice} /> : null}
      {actionError ? <NoticeToast message={actionError} /> : null}

      <header className={styles.topbar}>
        <div>
          <p className={styles.kicker}>Project-A Season 5 Preview</p>
          <h1>Roguelite Fishing League</h1>
        </div>
        <div className={styles.topbarMeta}>
          <span>Season ends {activeUntil}</span>
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

      {!character && session ? <ClassSelection state={state} /> : null}

      <div className={styles.playfield}>
        {character ? <CharacterCommandCard state={state} /> : null}
        <WorldMap state={state} />
        {character ? (
          <div className={styles.rightRail}>
            <InventoryPreview state={state} />
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
          </div>
        ) : null}
      </div>
    </main>
  );
}
