"use client";

import Link from "next/link";
import { useState } from "react";
import type { Session } from "next-auth";
import styles from "./page.module.css";
import { CompensationLootBoxAnnouncement } from "@/components/compensation-loot-box-announcement";
import { SessionActions } from "@/components/session-actions";
import { BattlefieldExperience } from "@/components/battlefield-experience";
import { DismissiblePhaseCard } from "@/components/dismissible-phase-card";
import { GodEmperorGiftNotice } from "@/components/god-emperor-gift-notice";
import { LeaderboardAnnouncement } from "@/components/leaderboard-announcement";
import { NoticeToast } from "@/components/notice-toast";
import { PreviousSeasonWinnerCard } from "@/components/previous-season-winner-card";
import { RealtimeBridge } from "@/components/realtime-bridge";
import { SeasonUpdateAnnouncement } from "@/components/season-update-announcement";
import { SeasonTimer } from "@/components/season-timer";
import CommandDock from "@/components/command-dock";
import {
  LiveGameStateProvider,
  useLiveGameState,
} from "@/components/live-game-state";
import {
  joinFortressFormAction,
  registerCommanderNameFormAction,
} from "@/app/game-actions";
import { getContextualActionHint } from "@/lib/game/action-hints";
import type { HomePageState } from "@/lib/game/read-model";
import type { LeaderboardCategory } from "@/lib/game/leaderboard-titles";
import { RACE_DEFINITIONS, type FortressRace } from "@/lib/game/races";
import {
  PATCH_NOTES_PAGE_HREF,
  PRIMARY_GAME_NAV_LINKS,
  WIKI_PAGE_HREF,
} from "@/lib/game/site-navigation";

const dateTimeFormatter = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "short",
});
const RACE_TOKEN_PATHS: Record<FortressRace, string> = {
  DWARFS: "/assets/token-dwarf.png",
  ORKS: "/assets/token-orks.png",
  SPACE_MURINES: "/assets/token-space-murines.png",
  UNSTABLE_UNICORNS: "/assets/token-unstable-unicorns.png",
};

const JOIN_RACE_COPY: Record<
  FortressRace,
  {
    lore: string;
    pros: string[];
    cons: string[];
  }
> = {
  DWARFS: {
    lore: "They arrived with ledgers, helmets, and seven generations of receipts. Nobody remembers the original insult, but the paperwork is immaculate.",
    pros: [
      "Beer Culture pressure lane",
      "Extra gold from miners",
      "Strong guarded-border identity",
    ],
    cons: ["Slow army travel", "No active rune ability in Season 4"],
  },
  UNSTABLE_UNICORNS: {
    lore: "Every strategy meeting starts with glitter and ends with someone insisting the teleport was definitely intentional.",
    pros: [
      "Glitter Distribution pressure lane",
      "Extra food from farmers",
      "More starting population",
    ],
    cons: ["Lower direct combat bonuses", "No teleport ability in Season 4"],
  },
  SPACE_MURINES: {
    lore: "Tiny professionals in oversized doctrine manuals. If a plan fails, they call it reconnaissance and file it under victory-adjacent.",
    pros: [
      "Imperial Faith pressure lane",
      "Extra army from recruiters",
      "Disciplined campaign foundation",
    ],
    cons: ["Needs timing discipline", "No STIM ability in Season 4"],
  },
  ORKS: {
    lore: "Their logistics doctrine is yelling, their accounting system is teeth, and their recycling program is called Scrap.",
    pros: [
      "Scavenge Mob pressure lane",
      "Extra army from recruiters",
      "Aggressive campaign identity",
    ],
    cons: ["Needs conflict to shine", "No WAAAGH ability in Season 4"],
  },
};

function formatDeadline(deadline: Date | null) {
  if (!deadline) {
    return "No deadline available.";
  }

  return dateTimeFormatter.format(deadline);
}

function formatLastUpdate(lastProcessedTickAt: Date | null) {
  if (!lastProcessedTickAt) {
    return null;
  }

  return dateTimeFormatter.format(lastProcessedTickAt);
}

export function HomeClient({
  initialState,
  session,
  runtimeError,
  actionError,
  notice,
  authConfigured,
  realtimeEnabled,
}: {
  initialState: HomePageState;
  session: Session | null;
  runtimeError: string | null;
  actionError: string | null;
  notice: string | null;
  authConfigured: boolean;
  realtimeEnabled: boolean;
}) {
  return (
    <LiveGameStateProvider initialState={initialState}>
      <HomeClientContent
        session={session}
        runtimeError={runtimeError}
        actionError={actionError}
        notice={notice}
        authConfigured={authConfigured}
        realtimeEnabled={realtimeEnabled}
      />
    </LiveGameStateProvider>
  );
}

function HomeClientContent({
  session,
  runtimeError,
  actionError,
  notice,
  authConfigured,
  realtimeEnabled,
}: {
  session: Session | null;
  runtimeError: string | null;
  actionError: string | null;
  notice: string | null;
  authConfigured: boolean;
  realtimeEnabled: boolean;
}) {
  const { state, isRefreshing, lastRefreshError } = useLiveGameState();

  const isAdmin = session?.user?.role === "ADMIN";
  const userLabel = session?.user
    ? (state.playerSummary?.commanderName ?? "Signed in")
    : "Guest";
  const blockingMessage = runtimeError ?? actionError ?? null;
  const joinedText = state.cycle ? `${state.cycle.joinedCount} / 30` : "0 / 30";
  const remainingText = `${state.cycle?.remainingSlots ?? 30} slots`;
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
  const [selectedLeaderboardCategory, setSelectedLeaderboardCategory] =
    useState<LeaderboardCategory>("points");
  const selectedLeaderboardTitle =
    state.leaderboardTitles.find(
      (title) => title.category === selectedLeaderboardCategory
    ) ?? state.leaderboardTitles[0];
  const leaderboard = state.leaderboard.slice(0, 3);
  const categoryLeaderboard =
    state.leaderboards[selectedLeaderboardCategory]?.slice(0, 3) ??
    leaderboard;
  const isGameplayPhase =
    state.phase?.status === "ACTIVE" || state.phase?.status === "TESTING";
  const tickDelayMinutes = state.cycle?.tickDelayMinutes ?? null;
  const tickHealth = state.cycle?.tickHealth ?? null;
  const showTickStatus =
    isGameplayPhase &&
    state.cycle?.lastProcessedTickAt &&
    tickDelayMinutes !== null;
  const hasTickDelayWarning = tickHealth === "stalled";
  const tickStatusText = showTickStatus
    ? tickHealth === "stalled"
      ? `Tick stalled: last update ${formatLastUpdate(
          state.cycle?.lastProcessedTickAt ?? null
        )} (${tickDelayMinutes} min behind)`
      : tickHealth === "lagging"
        ? `Tick delay: last update ${formatLastUpdate(
            state.cycle?.lastProcessedTickAt ?? null
          )} (${tickDelayMinutes} min behind)`
        : `Last update: ${formatLastUpdate(
            state.cycle?.lastProcessedTickAt ?? null
          )} (live)`
    : null;
  const showLoginCard = !session?.user;
  const showJoinCard = Boolean(session?.user && state.canJoinCycle);
  const showCommanderNameCard = Boolean(
    session?.user && state.playerSummary?.canRegisterCommanderName
  );
  const showArcadeCard = state.phase?.status === "REGISTRATION";
  const isWaitingForSeason =
    !state.phase || state.phase.status === "RESOLUTION" || !state.cycle;
  const showSeasonBanner = Boolean(state.latestSeason && isWaitingForSeason);
  const showSidePanel = Boolean(
    blockingMessage ||
    showLoginCard ||
    showJoinCard ||
    showCommanderNameCard ||
    isWaitingForSeason ||
    showArcadeCard ||
    showSeasonBanner
  );
  const canDismissPhaseCard = Boolean(
    showSidePanel &&
    !blockingMessage &&
    !showLoginCard &&
    !showJoinCard &&
    !showCommanderNameCard &&
    !showArcadeCard &&
    !showSeasonBanner
  );
  const phaseCardStorageKey = `project-a:phase-card:${
    state.cycle?.id ?? "no-cycle"
  }:${state.phase?.status ?? "no-phase"}`;

  const phaseCopy =
    state.phase?.status === "REGISTRATION"
      ? {
          title: "Build phase is open.",
          description: "Claim a fortress and wait for the season to begin.",
          nextAction: state.playerFortress
            ? "You are locked in. The season starts today."
            : "Join before the season starts.",
          timerLabel: "Season",
          battlefieldTitle: "Build phase map",
          battlefieldDescription:
            "Fortresses appear as players join the build phase.",
        }
      : state.phase?.status === "TESTING"
        ? {
            title: "Testing phase is live.",
            description:
              "Test pressure, doctrines, convoys, and campaigns. Sandbox progress resets before the real season.",
            nextAction: state.playerSummary
              ? "Tune your economy and standing orders before the season activates."
              : state.canJoinCycle
                ? "You can still join before testing ends."
                : "Watch the sandbox and wait for the real season start.",
            timerLabel: "Testing ends",
            battlefieldTitle: "Testing battlefield",
            battlefieldDescription:
              "Sandbox pressure and campaign orders are live; progress resets before activation.",
          }
        : state.phase?.status === "ACTIVE"
          ? {
              title: "Season is live.",
              description: "Moves are being resolved in real time.",
              nextAction: state.playerSummary
                ? "Prioritize a border tile or open Castle to manage your standing orders."
                : state.canJoinCycle
                  ? "You can still join this running season while slots are available."
                  : "Follow the live map and wait for the next registration.",
              timerLabel: "Cycle ends",
              battlefieldTitle: "Live battlefield",
              battlefieldDescription:
                "Choose a target and lock your next move.",
            }
          : {
              title: "Next season is not live yet.",
              description: "The current cycle is closed.",
              nextAction: "Check history and return when registration opens.",
              timerLabel: "Current cycle",
              battlefieldTitle: "Battlefield",
              battlefieldDescription:
                "The map updates when the next season starts.",
            };
  const actionHint = getContextualActionHint({
    phaseStatus: state.phase?.status ?? null,
    tickHealth,
    canJoinCycle: state.canJoinCycle,
    playerSummary: state.playerSummary,
    battlefields: state.battlefields,
    mapHexes: state.mapHexes,
    homeOfA: state.homeOfA,
    fallback: phaseCopy.nextAction,
  });

  const centerTitle = blockingMessage
    ? "Something needs attention."
    : showLoginCard
      ? "Join the battlefield."
      : showCommanderNameCard
        ? "Choose your in-game nick."
          : showJoinCard
            ? state.phase?.status === "ACTIVE"
              ? "Join the running season."
              : state.phase?.status === "TESTING"
                ? "Join testing."
                : "Claim your fortress."
          : phaseCopy.title;

  const centerDescription = blockingMessage
    ? blockingMessage
    : showLoginCard
      ? "Sign in to join a fortress, chat, and manage your castle when the season is active."
      : showCommanderNameCard
        ? "Set the commander name other players will see this season. Your account name stays private."
        : showJoinCard
          ? state.phase?.status === "ACTIVE"
            ? "This season is already running. Join now to enter immediately if slots are still available."
            : state.phase?.status === "TESTING"
              ? "Testing mode is live. Join now to test the sandbox; only your roster identity carries into the real season."
              : "Build phase is open. Choose your race, name your fortress, and reserve your Season 4 slot."
          : (state.cycle?.statusMessage ?? state.emptyStateMessage);

  return (
    <main className={styles.page}>
      <RealtimeBridge
        enabled={
          Boolean(state.cycle) && realtimeEnabled
        }
      />
      <GodEmperorGiftNotice fortressName={state.playerSummary?.name} />
      <CompensationLootBoxAnnouncement userId={session?.user?.id ?? null} />

      <div className={styles.mapLayer}>
        <BattlefieldExperience
          immersive
          topActionsContainerId="battlefield-top-actions"
          title={phaseCopy.battlefieldTitle}
          description={phaseCopy.battlefieldDescription}
          phaseStatus={state.phase?.status ?? null}
          playerSummary={state.playerSummary}
          playerFortress={state.playerFortress}
          mapFortresses={state.mapFortresses}
          mapHexes={state.mapHexes}
          homeOfA={state.homeOfA}
          battlefields={state.battlefields}
          attackUnits={state.attackUnits}
          alliedRoads={state.alliedRoads ?? []}
          battleReports={state.battleReports}
          availableTargets={state.availableTargets}
          chat={state.chat}
          canEditRegistrationName={state.canEditRegistrationName}
        />
      </div>
      <div
        id="battlefield-overlay-root"
        className={styles.battlefieldOverlayRoot}
      />
      <div className={styles.mapScrim} />

      <CommandDock
        state={state}
        tickHealth={tickHealth}
        deadline={state.phase?.deadline?.toISOString() ?? null}
        timerLabel={phaseCopy.timerLabel}
      />
      {!state.cycle || !state.playerSummary ? (
      <header className={styles.topHud} aria-label="Season status">
        <div className={styles.statusCluster}>
          <span className={styles.phaseBadge}>
            {state.phase?.label ?? "Waiting for a cycle"}
          </span>
          <SeasonTimer
            deadline={state.phase?.deadline?.toISOString() ?? null}
            label={phaseCopy.timerLabel}
            variant="compact"
          />
          {tickStatusText ? (
            <span
              className={`${styles.tickStatus} ${
                hasTickDelayWarning ? styles.tickStatusWarning : ""
              }`}
            >
              {tickStatusText}
            </span>
          ) : null}
          {isRefreshing ? (
            <span className={styles.tickStatus}>Syncing...</span>
          ) : lastRefreshError ? (
            <span className={`${styles.tickStatus} ${styles.tickStatusWarning}`}>
              Live sync delayed
              <button
                className={styles.retrySyncButton}
                onClick={() => window.dispatchEvent(new CustomEvent("manual-sync-retry"))}
                style={{ marginLeft: 8 }}
              >
                Retry sync
              </button>
            </span>
          ) : null}
          <dl className={styles.hudStats}>
            <div>
              <dt>Joined</dt>
              <dd>{joinedText}</dd>
            </div>
            <div>
              <dt>Open</dt>
              <dd>{remainingText}</dd>
            </div>
          </dl>
          <div className={styles.raceCounter} aria-label="Players by race">
            {raceCounts.map((race) => (
              <span
                className={styles.raceCount}
                title={`${race.label}: ${race.count}`}
                key={race.key}
              >
                <span
                  className={styles.raceCountToken}
                  style={{
                    backgroundImage: `url("${RACE_TOKEN_PATHS[race.key]}")`,
                  }}
                  aria-hidden="true"
                />
                <span className={styles.raceCountValue}>
                  <span className={styles.raceCountLabel}>{race.label}</span>
                  {race.count}
                </span>
              </span>
            ))}
          </div>
        </div>

        <nav className={styles.topLinks} aria-label="Account and pages">
          <span className={styles.accountChip}>
            {session?.user ? userLabel : "Guest"}
          </span>
          <LeaderboardAnnouncement
            leaderboardTitles={state.leaderboardTitles}
            triggerClassName={styles.hudButton}
            userId={session?.user?.id ?? null}
          />
          <SeasonUpdateAnnouncement userId={session?.user?.id ?? null} />
          {state.playerSummary ? (
            <Link className={styles.hudButton} href="/castle">
              Castle
            </Link>
          ) : null}
          {PRIMARY_GAME_NAV_LINKS.filter(
            (link) =>
              link.href !== PATCH_NOTES_PAGE_HREF &&
              link.href !== WIKI_PAGE_HREF
          ).map((link) => (
            <Link className={styles.hudButton} href={link.href} key={link.href}>
              {link.label}
            </Link>
          ))}
          <Link className={styles.hudButton} href={WIKI_PAGE_HREF}>
            Wiki
          </Link>
          {PRIMARY_GAME_NAV_LINKS.filter(
            (link) => link.href === PATCH_NOTES_PAGE_HREF
          ).map((link) => (
            <Link className={styles.hudButton} href={link.href} key={link.href}>
              {link.label}
            </Link>
          ))}
          {isAdmin ? (
            <Link className={styles.hudButton} href="/admin">
              Admin
            </Link>
          ) : null}
          <div
            id="battlefield-top-actions"
            className={styles.battlefieldTopActions}
          />
          {session?.user ? (
            <SessionActions
              authConfigured={authConfigured}
              isAuthenticated
              isAdmin={isAdmin}
              variant="compact"
            />
          ) : null}
        </nav>
      </header>
      ) : null}

      {notice ? <NoticeToast message={notice} autoDismissMs={5000} /> : null}

      {showSidePanel ? (
        <DismissiblePhaseCard
          ariaLive="polite"
          className={`${styles.sidePanel} ${
            blockingMessage ? styles.statusPanel : ""
          }`}
          closeButtonClassName={styles.phaseCardCloseButton}
          isDismissible={canDismissPhaseCard}
          storageKey={phaseCardStorageKey}
        >
          {state.latestSeason ? (
            <PreviousSeasonWinnerCard
              className={styles.seasonSummary}
              closeButtonClassName={styles.seasonSummaryCloseButton}
              cycleId={state.latestSeason.cycleId}
            >
              <span className={styles.sectionLabel}>
                Previous season winner
              </span>
              <h2>{state.latestSeason.winnerLabel}</h2>
              <p>
                {state.latestSeason.winnerFortressName} won with{" "}
                {state.latestSeason.winningScore} points.
              </p>
              {state.latestSeason.firstSlayerCommanderName &&
              state.latestSeason.firstSlayerFortressName ? (
                <p className={styles.slayerNote}>
                  Home of A&apos;s first slayer:{" "}
                  {state.latestSeason.firstSlayerCommanderName} -{" "}
                  {state.latestSeason.firstSlayerFortressName}
                </p>
              ) : null}
            </PreviousSeasonWinnerCard>
          ) : null}
          <span className={styles.sectionLabel}>
            {blockingMessage
              ? "Status"
              : showCommanderNameCard
                ? "Nick registration"
                : showJoinCard
                  ? "Join season"
                  : "Season control"}
          </span>
          <h1>{centerTitle}</h1>
          <p>{centerDescription}</p>

          {showLoginCard && !blockingMessage ? (
            <SessionActions
              authConfigured={authConfigured}
              isAuthenticated={false}
              isAdmin={false}
            />
          ) : null}

          {showJoinCard && !blockingMessage ? (
            <div className={styles.joinModal} role="dialog" aria-modal="true">
              <form action={joinFortressFormAction} className={styles.joinForm}>
                <div className={styles.joinModalHeader}>
                  <span className={styles.sectionLabel}>
                    Choose your trouble
                  </span>
                  <h2>Pick a race before the season notices you.</h2>
                  <p>
                    Race locks for the season. Choose the kind of bad decision
                    you want to optimize.
                  </p>
                </div>
                <div className={styles.joinIdentityGrid}>
                  <label className={styles.field}>
                    <span>In-game nick</span>
                    <input
                      name="commanderName"
                      type="text"
                      maxLength={32}
                      placeholder="Name your commander"
                      required
                    />
                  </label>
                  <label className={styles.field}>
                    <span>Fortress name</span>
                    <input
                      name="fortressName"
                      type="text"
                      maxLength={32}
                      placeholder="Name your fortress"
                      required
                    />
                  </label>
                </div>
                <div className={styles.joinRaceGrid}>
                  {RACE_DEFINITIONS.map((race) => {
                    const copy = JOIN_RACE_COPY[race.key];

                    return (
                      <label key={race.key} className={styles.joinRaceCard}>
                        <input
                          name="race"
                          type="radio"
                          value={race.key}
                          required
                        />
                        <span className={styles.joinRaceCardBody}>
                          <span className={styles.joinRaceTitle}>
                            <span
                              className={styles.joinRaceToken}
                              style={{
                                backgroundImage: `url(${RACE_TOKEN_PATHS[race.key]})`,
                              }}
                              aria-hidden="true"
                            />
                            <strong>{race.displayName}</strong>
                          </span>
                          <span className={styles.joinRaceLore}>
                            {copy.lore}
                          </span>
                          <span className={styles.joinRaceTradeoffs}>
                            <span>
                              <b>Pros</b>
                              {copy.pros.join(" / ")}
                            </span>
                            <span>
                              <b>Cons</b>
                              {copy.cons.join(" / ")}
                            </span>
                          </span>
                        </span>
                      </label>
                    );
                  })}
                </div>
                <button className={styles.primaryButton} type="submit">
                  Join this season
                </button>
              </form>
            </div>
          ) : null}

          {showCommanderNameCard && !blockingMessage ? (
            <form
              action={registerCommanderNameFormAction}
              className={styles.form}
            >
              <label className={styles.field}>
                <span>In-game nick</span>
                <input
                  name="commanderName"
                  type="text"
                  maxLength={32}
                  defaultValue={state.playerSummary?.commanderName}
                  placeholder="Name your commander"
                  required
                />
              </label>
              <button className={styles.primaryButton} type="submit">
                Register nick
              </button>
            </form>
          ) : null}

          {showArcadeCard && !blockingMessage ? (
            <div className={styles.cardActions}>
              <Link className={styles.secondaryButton} href="/shop">
                Open shop
              </Link>
            </div>
          ) : null}

          {isWaitingForSeason && !showLoginCard && !showJoinCard ? (
            <div className={styles.cardActions}>
              <Link className={styles.secondaryButton} href="/history">
                Open cycle history
              </Link>
            </div>
          ) : null}

          {state.cycle ? (
            <dl className={styles.deadlineList}>
              <div>
                <dt>Build</dt>
                <dd>{formatDeadline(state.cycle.registrationEndsAt)}</dd>
              </div>
              <div>
                <dt>Testing</dt>
                <dd>{formatDeadline(state.cycle.testingEndsAt)}</dd>
              </div>
              <div>
                <dt>Season end</dt>
                <dd>{formatDeadline(state.cycle.activeEndsAt)}</dd>
              </div>
            </dl>
          ) : null}
        </DismissiblePhaseCard>
      ) : null}

      <footer className={styles.bottomHud} aria-label="Battlefield summary">
        <section className={styles.playerStrip}>
          <span className={styles.sectionLabel}>
            {state.isSpectator ? "Session" : "Your fortress"}
          </span>
          <div className={styles.fortressTitle}>
            <strong>{state.playerSummary?.name ?? "Spectator"}</strong>
            {state.playerSummary?.isSlayerOfA ? (
              <span className={styles.crownBadge}>Slayer of A</span>
            ) : null}
          </div>
          {state.playerSummary ? (
            <dl className={styles.playerStats}>
              <div>
                <dt>Level</dt>
                <dd>{state.playerSummary.level}</dd>
              </div>
              <div>
                <dt>Points</dt>
                <dd>{state.playerSummary.points}</dd>
              </div>
              <div>
                <dt>Gold</dt>
                <dd>{state.playerSummary.gold}</dd>
              </div>
              <div>
                <dt>Military</dt>
                <dd>
                  {state.playerSummary.army}/{state.playerSummary.allUnits}
                </dd>
              </div>
              {state.playerSummary.currentTargetName ? (
                <div className={styles.targetStat}>
                  <dt>Target</dt>
                  <dd>{state.playerSummary.currentTargetName}</dd>
                </div>
              ) : null}
            </dl>
          ) : (
            <p>
              {state.isSpectator ? "Spectating this cycle" : "No fortress yet"}
            </p>
          )}
        </section>

        <section className={styles.hintStrip}>
          <span className={styles.sectionLabel}>Next</span>
          <div className={styles.actionHint} data-tone={actionHint.tone}>
            <strong>{actionHint.label}</strong>
            <p>{actionHint.message}</p>
          </div>
        </section>

        <section className={styles.leaderboardStrip}>
          <div className={styles.leaderboardHeader}>
            <span className={styles.sectionLabel}>Top 3</span>
            <div className={styles.leaderboardTabs} role="tablist">
              {state.leaderboardTitles.map((title) => (
                <button
                  key={title.category}
                  type="button"
                  className={
                    title.category === selectedLeaderboardCategory
                      ? styles.activeLeaderboardTab
                      : ""
                  }
                  onClick={() => setSelectedLeaderboardCategory(title.category)}
                >
                  {title.label}
                </button>
              ))}
            </div>
          </div>
          {categoryLeaderboard.length > 0 ? (
            <ol className={styles.leaderboardList}>
              {categoryLeaderboard.map((entry) => (
                <li
                  key={entry.id}
                  className={entry.isCurrentUser ? styles.currentLeader : ""}
                >
                  <span>#{entry.rank}</span>
                  <strong>{entry.name}</strong>
                  {entry.title ? (
                    <small className={styles.crownBadge}>{entry.title}</small>
                  ) : entry.isSlayerOfA ? (
                    <small className={styles.crownBadge}>Slayer of A</small>
                  ) : null}
                  <em>
                    {entry.metric} {selectedLeaderboardTitle?.metricLabel ?? "pts"}
                  </em>
                </li>
              ))}
            </ol>
          ) : (
            <p>No fortresses yet.</p>
          )}
          {selectedLeaderboardTitle ? (
            <p className={styles.leaderboardBuff}>
              {selectedLeaderboardTitle.title}: {selectedLeaderboardTitle.buffLabel}
            </p>
          ) : null}
        </section>
      </footer>
    </main>
  );
}
