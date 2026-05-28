"use client";

import Link from "next/link";
import { useState } from "react";
import { usePathname } from "next/navigation";
import { RACE_DEFINITIONS, type FortressRace } from "@/lib/game/races";
import type { HomePageState } from "@/lib/game/read-model";
import { SeasonTimer } from "./season-timer";
import styles from "./command-dock.module.css";

type CommandDockProps = {
  state: HomePageState;
  tickHealth: "ok" | "lagging" | "stalled" | null;
  deadline: string | null;
  timerLabel: string;
};

type Badge = {
  text: string;
  severity: "info" | "warning" | "danger";
};

const RACE_TOKEN_PATHS: Record<FortressRace, string> = {
  DWARFS: "/assets/token-dwarf.png",
  ORKS: "/assets/token-orks.png",
  SPACE_MURINES: "/assets/token-space-murines.png",
  UNSTABLE_UNICORNS: "/assets/token-unstable-unicorns.png",
};

const DOCK_LINKS = [
  { href: "/", label: "Map", icon: "\uD83D\uDDFA" },
  { href: "/castle", label: "Castle", icon: "\uD83C\uDFF0" },
  { href: "/politics", label: "Politics", icon: "\u2696" },
  { href: "/history", label: "Reports", icon: "\uD83D\uDCCB" },
] as const;

function getTickBadge(
  health: "ok" | "lagging" | "stalled" | null
): Badge | null {
  if (!health || health === "ok") {
    return null;
  }

  return {
    text: health === "stalled" ? "Stalled" : "Delayed",
    severity: health === "stalled" ? "danger" : "warning",
  };
}

function DockBadge({ badge }: { badge: Badge }) {
  return (
    <span className={styles.badge} data-severity={badge.severity}>
      {badge.text}
    </span>
  );
}

function RacePopulation({ state }: { state: HomePageState }) {
  const raceCounts = RACE_DEFINITIONS.map((race) => ({
    key: race.key,
    label: race.displayName,
    count: state.mapFortresses.filter(
      (fortress) =>
        !fortress.isNpc &&
        fortress.fortressKind === "PLAYER" &&
        fortress.race === race.key
    ).length,
  }));

  return (
    <div className={styles.raceCounter} aria-label="Players by race">
      <span className={styles.raceCounterLabel}>Players</span>
      {raceCounts.map((race) => (
        <span
          className={styles.raceCount}
          title={`${race.label}: ${race.count}`}
          key={race.key}
        >
          <span
            className={styles.raceToken}
            style={{
              backgroundImage: `url("${RACE_TOKEN_PATHS[race.key]}")`,
            }}
            aria-hidden="true"
          />
          <span className={styles.srOnly}>{race.label}</span>
          <strong>{race.count}</strong>
        </span>
      ))}
    </div>
  );
}


function ActivityFeed({ state }: { state: HomePageState }) {
  const [open, setOpen] = useState(false);
  const feed = state.recentActivity ?? [];

  if (feed.length === 0) return null;

  return (
    <>
      <button
        className={styles.feedToggle}
        onClick={() => setOpen(!open)}
        aria-expanded={open}
      >
        {'+ ' + String(feed.length) + ' events'}
      </button>

      {open ? (
        <div className={styles.feedPanel}>
          <div className={styles.feedHeader}>
            <span>Recent activity</span>
            <button onClick={() => setOpen(false)}>&times;</button>
          </div>
          {feed.map((item) => {
            const isIntercepted = item.status === "INTERCEPTED";
            const isSeized = item.status === "SEIZED";
            const isDelivered = item.status === "DELIVERED";

            return (
              <div key={item.id} className={styles.feedItem}>
                <span className={styles.feedIcon}>
                  {item.deedTileId ? String.fromCodePoint(0x1F3D4) : isIntercepted ? String.fromCodePoint(0x2694) : isSeized ? String.fromCodePoint(0x1F512) : String.fromCodePoint(0x1F4E6)}
                </span>
                <span>
                  {item.deedTileId
                    ? isDelivered
                      ? "Deed " + item.deedTileId + " transferred"
                      : isIntercepted
                        ? "Deed " + item.deedTileId + " lost to raid"
                        : "Deed " + item.deedTileId + " " + (item.deedFailureReason ?? "failed")
                    : isIntercepted
                      ? "Convoy raided: " + item.gold + "g " + item.food + "f"
                      : isDelivered
                        ? "Convoy delivered: " + item.gold + "g " + item.food + "f"
                        : "Convoy " + item.status.toLowerCase()}
                </span>
                {item.settledAt ? (
                  <time className={styles.feedTime}>
                    {new Date(item.settledAt).toLocaleString()}
                  </time>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : null}
    </>
  );
}

export default function CommandDock({
  state,
  tickHealth,
  deadline,
  timerLabel,
}: CommandDockProps) {
  const pathname = usePathname();
  const tickBadge = getTickBadge(tickHealth);
  const incomingOffersCount = state.incomingOfferCount ?? 0;
  const incidentCount = state.incidentCount ?? 0;
  const showPlayerStatus = Boolean(state.cycle && state.playerSummary);

  function getLinkBadge(href: (typeof DOCK_LINKS)[number]["href"]) {
    if (href === "/politics" && incomingOffersCount > 0) {
      return { text: String(incomingOffersCount), severity: "info" } as const;
    }

    if (href === "/" && incidentCount > 0) {
      return { text: String(incidentCount), severity: "warning" } as const;
    }

    return href === "/" ? tickBadge : null;
  }

  const dockLinks = DOCK_LINKS.map((link) => {
    const badge = getLinkBadge(link.href);

    return (
      <Link
        key={link.href}
        href={link.href}
        className={styles.dockLink}
        data-active={pathname === link.href || undefined}
      >
        <span className={styles.linkIcon} aria-hidden="true">
          {link.icon}
        </span>
        <span>{link.label}</span>
        {badge ? <DockBadge badge={badge} /> : null}
      </Link>
    );
  });

  return (
    <>
      <div className={styles.desktopBar}>
        {showPlayerStatus ? (
          <div className={styles.playerStatus}>
            <SeasonTimer
              deadline={deadline}
              label={timerLabel}
              variant="compact"
            />
            <RacePopulation state={state} />
          </div>
        ) : null}
        <nav className={styles.desktopDock} aria-label="Command dock">
          {dockLinks}
        </nav>
        <ActivityFeed state={state} />
      </div>

      {showPlayerStatus ? (
        <aside className={styles.mobileStatus} aria-label="Season status">
          <SeasonTimer
            deadline={deadline}
            label={timerLabel}
            variant="compact"
          />
          <RacePopulation state={state} />
        </aside>
      ) : null}
      <nav className={styles.mobileDock} aria-label="Command dock">
        {dockLinks}
      </nav>
    </>
  );
}
