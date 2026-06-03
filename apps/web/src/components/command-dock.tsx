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
  { href: "/wiki", label: "Wiki", icon: "\uD83D\uDCD6" },
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

  const urgentCount = feed.filter((i) => i.type === "offer" || i.type === "siege" || i.type === "incident").length;

  function getIcon(type: string): string {
    switch (type) {
      case "offer": return String.fromCodePoint(0x1F4E9);
      case "incident": return String.fromCodePoint(0x1F6A8);
      case "siege": return String.fromCodePoint(0x26A0);
      case "convoy": return String.fromCodePoint(0x1F69A);
      case "army": return String.fromCodePoint(0x1F6E1);
      default: return String.fromCodePoint(0x2022);
    }
  }

  return (
    <>
      <button
        className={styles.feedToggle}
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        data-urgent={urgentCount > 0 || undefined}
      >
        {String(feed.length) + ' event' + (feed.length !== 1 ? 's' : '')}
        {urgentCount > 0 ? ' (' + urgentCount + ' urgent)' : ''}
      </button>

      {open ? (
        <div className={styles.feedPanel}>
          <div className={styles.feedHeader}>
            <span>Operations feed</span>
            <button onClick={() => setOpen(false)}>&times;</button>
          </div>
          {feed.map((item) => {
            const isUrgent = item.type === "offer" || item.type === "siege" || item.type === "incident";

            return (
              <div key={item.id} className={styles.feedItem} data-urgent={isUrgent || undefined}>
                <span className={styles.feedIcon}>{getIcon(item.type)}</span>
                <span>
                  <strong>{item.label}</strong>
                  {item.details ? <span className={styles.feedDetails}> — {item.details}</span> : null}
                  {item.status ? <span className={styles.feedStatus}> [{item.status}]</span> : null}
                </span>
                <time className={styles.feedTime}>
                  {new Date(item.timestamp).toLocaleString()}
                </time>
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
  const pendingDiplomacyCount = state.pendingDiplomacyCount ?? 0;
  const pendingDiplomacyActionCount =
    incomingOffersCount + pendingDiplomacyCount;
  const incidentCount = state.incidentCount ?? 0;
  const showPlayerStatus = Boolean(state.cycle && state.playerSummary);

  function getLinkBadge(href: (typeof DOCK_LINKS)[number]["href"]) {
    if (href === "/castle" && pendingDiplomacyActionCount > 0) {
      return {
        text: String(pendingDiplomacyActionCount),
        severity: "warning",
      } as const;
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
