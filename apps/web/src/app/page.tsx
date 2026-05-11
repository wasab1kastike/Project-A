import Link from "next/link";
import type { Session } from "next-auth";
import styles from "./page.module.css";
import { auth, isAuthConfigured } from "@/auth";
import { CompensationLootBoxAnnouncement } from "@/components/compensation-loot-box-announcement";
import { SessionActions } from "@/components/session-actions";
import { BattlefieldExperience } from "@/components/battlefield-experience";
import { DismissiblePhaseCard } from "@/components/dismissible-phase-card";
import { GodEmperorGiftNotice } from "@/components/god-emperor-gift-notice";
import { NoticeToast } from "@/components/notice-toast";
import { PreviousSeasonWinnerCard } from "@/components/previous-season-winner-card";
import { RealtimeBridge } from "@/components/realtime-bridge";
import { SeasonUpdateAnnouncement } from "@/components/season-update-announcement";
import { SeasonTimer } from "@/components/season-timer";
import { WappuDelayAnnouncement } from "@/components/wappu-delay-announcement";
import {
  joinFortressFormAction,
  saveCommunityWishVotesFormAction,
  registerCommanderNameFormAction,
  submitCommunityWishProposalFormAction,
} from "@/app/game-actions";
import { getContextualActionHint } from "@/lib/game/action-hints";
import { COMMUNITY_WISH_MAX_LENGTH } from "@/lib/game/community-wishes";
import { getHomePageState, type HomePageState } from "@/lib/game/read-model";
import { RACE_DEFINITIONS, type FortressRace } from "@/lib/game/races";
import {
  PATCH_NOTES_PAGE_HREF,
  PRIMARY_GAME_NAV_LINKS,
  WIKI_PAGE_HREF,
} from "@/lib/game/site-navigation";

export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const HOMEPAGE_DATA_TIMEOUT_MS = Number(
  process.env.HOMEPAGE_DATA_TIMEOUT_MS ?? 1_500
);

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
      "Extra gold from miners",
      "Stronger defense on owned tiles",
      "Grudge targets hit harder later",
    ],
    cons: ["Slow army travel", "Deep Mining pays off after a delay"],
  },
  UNSTABLE_UNICORNS: {
    lore: "Every strategy meeting starts with glitter and ends with someone insisting the teleport was definitely intentional.",
    pros: [
      "Extra food from farmers",
      "More starting population",
      "Teleport tricks and hidden army sizes",
    ],
    cons: ["Lower direct combat bonuses", "Chaos requires attention"],
  },
  SPACE_MURINES: {
    lore: "Tiny professionals in oversized doctrine manuals. If a plan fails, they call it reconnaissance and file it under victory-adjacent.",
    pros: [
      "Extra army from recruiters",
      "More attack slots at high levels",
      "STIM and instant recall tools",
    ],
    cons: ["Needs timing discipline", "Less loot-focused than ORKS"],
  },
  ORKS: {
    lore: "Their logistics doctrine is yelling, their accounting system is teeth, and their recycling program is called Scrap.",
    pros: [
      "Scrap economy from fighting",
      "Boss Orders and WAAAGH investments",
      "Best loot carrying capacity",
      "Extra army from recruiters",
    ],
    cons: ["Needs frequent fighting", "Scrap does nothing if you turtle"],
  },
};

function getSearchValue(
  value: string | string[] | undefined
): string | undefined {
  if (Array.isArray(value)) {
    return value[0];
  }

  return value;
}

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

function PromiseProgress({
  label,
  progress,
}: {
  label: string;
  progress: number;
}) {
  const normalizedProgress = normalizeProgress(progress);
  const progressState =
    normalizedProgress >= 100
      ? "complete"
      : normalizedProgress <= 0
        ? "empty"
        : "active";

  return (
    <div
      className={styles.promiseProgressWrap}
      data-progress-state={progressState}
    >
      <div
        className={styles.promiseProgress}
        role="progressbar"
        aria-label={`${label} ${normalizedProgress}% fulfilled`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={normalizedProgress}
      >
        <span style={{ width: `${normalizedProgress}%` }} />
      </div>
      <strong>{normalizedProgress}%</strong>
    </div>
  );
}

function normalizeProgress(progress: number) {
  if (!Number.isFinite(progress)) {
    return 0;
  }

  return Math.min(100, Math.max(0, Math.round(progress)));
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string) {
  let timeout: ReturnType<typeof setTimeout> | null = null;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => {
      reject(new Error(`${label} timed out after ${timeoutMs}ms`));
    }, timeoutMs);
  });

  return Promise.race([promise, timeoutPromise]).finally(() => {
    if (timeout !== null) {
      clearTimeout(timeout);
    }
  });
}

function getDegradedHomePageState(): HomePageState {
  return {
    isSpectator: true,
    cycle: null,
    phase: null,
    playerFortress: null,
    playerSummary: null,
    leaderboard: [],
    mapFortresses: [],
    mapHexes: [],
    homeOfA: null,
    battlefields: [],
    attackUnits: [],
    battleReports: [],
    chat: {
      messages: [],
      canPost: false,
      maxLength: 280,
      postHint:
        "Palvelussa on tilapainen hairio. Yrita hetken kuluttua uudelleen.",
      unreadCount: 0,
      hasUnread: false,
      latestMessageAt: null,
      persistsUnread: false,
    },
    communityWish: {
      cycleId: "",
      isOpen: false,
      opensAt: null,
      closesAt: null,
      canSubmit: false,
      canVote: false,
      voteBudget: 0,
      usedVotes: 0,
      remainingVotes: 0,
      currentUserCommunityWish: "",
      submissionHint:
        "Winner wish is guaranteed. Community wish is vote-based. Wishes can be edited until Monday 12:00, and voting ends Monday 24:00.",
      proposals: [],
    },
    availableTargets: [],
    canJoinCycle: false,
    canEditRegistrationName: false,
    latestSeason: null,
    emptyStateMessage:
      "Palvelussa on tilapainen hairio. Yrita hetken kuluttua uudelleen.",
  };
}

export default async function Home({
  searchParams,
}: {
  searchParams?: SearchParams;
}) {
  const params = (await searchParams) ?? {};
  const error = getSearchValue(params.error);
  const notice = getSearchValue(params.notice);

  let session: Session | null = null;
  let state: HomePageState = getDegradedHomePageState();
  let runtimeError: string | null =
    "Palvelussa on tilapainen hairio. Yrita hetken kuluttua uudelleen.";

  try {
    session = await withTimeout(auth(), HOMEPAGE_DATA_TIMEOUT_MS, "auth");
    state = await withTimeout(
      getHomePageState({
        userId: session?.user?.id,
      }),
      HOMEPAGE_DATA_TIMEOUT_MS,
      "homepage state"
    );
    runtimeError = null;
  } catch (caughtError) {
    console.error("Failed to load homepage state", caughtError);
  }

  const isAdmin = session?.user?.role === "ADMIN";
  const userLabel = session?.user
    ? (state.playerSummary?.commanderName ?? "Signed in")
    : "Guest";
  const blockingMessage = runtimeError ?? error ?? null;
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
  const leaderboard = state.leaderboard.slice(0, 3);
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
  const currentUserCommunityWish =
    state.communityWish.currentUserCommunityWish ?? "";
  const showLoginCard = !session?.user;
  const showJoinCard = Boolean(session?.user && state.canJoinCycle);
  const showCommanderNameCard = Boolean(
    session?.user && state.playerSummary?.canRegisterCommanderName
  );
  const showArcadeCard = state.phase?.status === "REGISTRATION";
  const isWaitingForSeason =
    !state.phase || state.phase.status === "RESOLUTION" || !state.cycle;
  const showWinnerWishPrompt = Boolean(
    session?.user?.id &&
    state.latestSeason &&
    state.latestSeason.winnerId === session.user.id &&
    state.latestSeason.winnerRequestId === null
  );
  const showSeasonBanner = Boolean(
    state.latestSeason && (isWaitingForSeason || showWinnerWishPrompt)
  );
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
    !showWinnerWishPrompt &&
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
              "Try workers, races, upgrades and raids. Sandbox progress resets before the real season.",
            nextAction: state.playerSummary
              ? "Test your economy and attacks, then get ready to choose again when the season starts."
              : state.canJoinCycle
                ? "You can still join before testing ends."
                : "Watch the sandbox and wait for the real season start.",
            timerLabel: "Testing ends",
            battlefieldTitle: "Testing battlefield",
            battlefieldDescription:
              "Sandbox combat is live. Race, resources, attacks and upgrades reset at season start.",
          }
        : state.phase?.status === "ACTIVE"
          ? {
              title: "Season is live.",
              description: "Moves are being resolved in real time.",
              nextAction: state.playerSummary
                ? "Pick a target on the map or open Castle to submit your move."
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
              : "Build phase is open. Name your fortress now and it will appear on the map."
          : (state.cycle?.statusMessage ?? state.emptyStateMessage);

  return (
    <main className={styles.page}>
      <RealtimeBridge
        enabled={
          Boolean(state.cycle) &&
          process.env.NEXT_PUBLIC_REALTIME_ENABLED === "true"
        }
      />
      <GodEmperorGiftNotice fortressName={state.playerSummary?.name} />
      <WappuDelayAnnouncement userId={session?.user?.id ?? null} />
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
          {state.cycle &&
          (state.phase?.status === "ACTIVE" ||
            state.phase?.status === "REGISTRATION") ? (
            <details className={styles.wishPanel}>
              <summary className={styles.wishPanelToggle}>Wish</summary>
              <section
                className={styles.wishPanelContent}
                aria-label="Community wish pool"
              >
                <span className={styles.sectionLabel}>Community wish</span>
                <h2>Season proposals</h2>
                <p>{state.communityWish.submissionHint}</p>
                {state.communityWish.canSubmit ? (
                  <form
                    action={submitCommunityWishProposalFormAction}
                    className={styles.form}
                  >
                    <input
                      type="hidden"
                      name="cycleId"
                      value={state.communityWish.cycleId}
                    />
                    <label className={styles.field}>
                      <div className={styles.fieldHeader}>
                        Proposal
                        <details className={styles.helpDisclosure}>
                          <summary
                            aria-label="Community wish instructions"
                            className={styles.helpButton}
                          >
                            ?
                          </summary>
                          <div className={styles.helpPopover}>
                            <strong>Wish limits</strong>
                            <ul>
                              <li>
                                Winner wish is guaranteed. Community wish is
                                vote-based.
                              </li>
                              <li>
                                Wishes lock Monday 12:00 after the season.
                              </li>
                              <li>Voting closes Monday 24:00.</li>
                              <li>Write in English.</li>
                              <li>
                                Keep it short: max {COMMUNITY_WISH_MAX_LENGTH}{" "}
                                characters.
                              </li>
                              <li>
                                Ask for one feature idea, not a full spec.
                              </li>
                              <li>
                                No self-buffs, targeted nerfs, more wishes, or
                                deploy requests.
                              </li>
                            </ul>
                          </div>
                        </details>
                      </div>
                      <textarea
                        name="requestText"
                        rows={3}
                        maxLength={COMMUNITY_WISH_MAX_LENGTH}
                        placeholder="Add more troop types"
                        defaultValue={currentUserCommunityWish}
                        required
                      />
                    </label>
                    <button className={styles.primaryButton} type="submit">
                      {currentUserCommunityWish ? "Update wish" : "Submit wish"}
                    </button>
                  </form>
                ) : null}
                {state.communityWish.canVote ? (
                  <form
                    action={saveCommunityWishVotesFormAction}
                    className={styles.voteForm}
                  >
                    <input
                      type="hidden"
                      name="cycleId"
                      value={state.communityWish.cycleId}
                    />
                    <span className={styles.voteSectionLabel}>
                      Community vote
                    </span>
                    <p className={styles.voteHint}>
                      You have {state.communityWish.voteBudget} votes.{" "}
                      {state.communityWish.usedVotes} currently allocated. You
                      can change them until voting ends Monday 24:00.
                    </p>
                    <div className={styles.voteList}>
                      {state.communityWish.proposals.map((proposal) => (
                        <label className={styles.voteRow} key={proposal.id}>
                          <span>
                            <strong>{proposal.authorLabel}</strong>
                            <small>
                              {proposal.voteCount} votes - {proposal.status}
                            </small>
                            <em>{proposal.requestText}</em>
                          </span>
                          <input
                            name={`proposalVotes:${proposal.id}`}
                            type="number"
                            min={0}
                            max={
                              proposal.isVoteEligible
                                ? state.communityWish.voteBudget
                                : 0
                            }
                            defaultValue={proposal.currentUserVotes}
                            disabled={
                              !state.communityWish.canVote ||
                              !proposal.isVoteEligible
                            }
                          />
                        </label>
                      ))}
                    </div>
                    {state.communityWish.canVote ? (
                      <button className={styles.primaryButton} type="submit">
                        Save community votes
                      </button>
                    ) : null}
                  </form>
                ) : null}
                {state.communityWish.proposals.length > 0 ? (
                  <ol className={styles.wishList}>
                    {state.communityWish.proposals
                      .slice(0, 4)
                      .map((proposal) => (
                        <li key={proposal.id}>
                          <strong>
                            {proposal.isCurrentUser
                              ? "Your wish"
                              : "Community wish"}
                          </strong>
                          <span>
                            {proposal.voteCount} votes - {proposal.status}
                          </span>
                          <p>{proposal.requestText}</p>
                        </li>
                      ))}
                  </ol>
                ) : (
                  <p>No community wishes have been suggested yet.</p>
                )}
              </section>
            </details>
          ) : null}
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
              authConfigured={isAuthConfigured}
              isAuthenticated
              isAdmin={isAdmin}
              variant="compact"
            />
          ) : null}
        </nav>
      </header>

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
              <div className={styles.currentWishes}>
                <span className={styles.sectionLabel}>Current wishes</span>
                <div className={styles.promiseList}>
                  {state.latestSeason.wishes.winner ? (
                    <article className={styles.promiseCard}>
                      <div className={styles.promiseHeader}>
                        <strong>Winner wish</strong>
                        <span>{state.latestSeason.wishes.winner.status}</span>
                      </div>
                      <p>{state.latestSeason.wishes.winner.text}</p>
                      <small>
                        {state.latestSeason.wishes.winner.ownerLabel}
                      </small>
                      <PromiseProgress
                        label="Winner wish"
                        progress={
                          state.latestSeason.wishes.winner.fulfillmentProgress
                        }
                      />
                    </article>
                  ) : (
                    <article
                      className={`${styles.promiseCard} ${styles.promisePlaceholder}`}
                    >
                      <div className={styles.promiseHeader}>
                        <strong>Winner wish</strong>
                        <span>Waiting</span>
                      </div>
                      <p>No winner request has been submitted yet.</p>
                    </article>
                  )}
                  {state.latestSeason.wishes.community ? (
                    <article className={styles.promiseCard}>
                      <div className={styles.promiseHeader}>
                        <strong>Community voted wish</strong>
                        <span>
                          {state.latestSeason.wishes.community.status}
                        </span>
                      </div>
                      <p>{state.latestSeason.wishes.community.text}</p>
                      <small>
                        {state.latestSeason.wishes.community.ownerLabel} -{" "}
                        {state.latestSeason.wishes.community.voteCount} votes
                      </small>
                      <PromiseProgress
                        label="Community voted wish"
                        progress={
                          state.latestSeason.wishes.community
                            .fulfillmentProgress
                        }
                      />
                    </article>
                  ) : (
                    <article
                      className={`${styles.promiseCard} ${styles.promisePlaceholder}`}
                    >
                      <div className={styles.promiseHeader}>
                        <strong>Community voted wish</strong>
                        <span>Waiting</span>
                      </div>
                      <p>No community wish has been resolved yet.</p>
                    </article>
                  )}
                </div>
              </div>
            </PreviousSeasonWinnerCard>
          ) : null}
          {showWinnerWishPrompt ? (
            <section className={styles.winnerWishPrompt}>
              <span className={styles.sectionLabel}>Winner wish</span>
              <h2>Your guaranteed wish is ready.</h2>
              <p>
                You won the last season. Open history to submit the wish that
                will be carried forward for review.
              </p>
              <Link className={styles.secondaryButton} href="/history">
                Open winner wish form
              </Link>
            </section>
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
              authConfigured={isAuthConfigured}
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
          <span className={styles.sectionLabel}>Top 3</span>
          {leaderboard.length > 0 ? (
            <ol className={styles.leaderboardList}>
              {leaderboard.map((entry) => (
                <li
                  key={entry.id}
                  className={entry.isCurrentUser ? styles.currentLeader : ""}
                >
                  <span>#{entry.rank}</span>
                  <strong>{entry.name}</strong>
                  {entry.isSlayerOfA ? (
                    <small className={styles.crownBadge}>Slayer of A</small>
                  ) : null}
                  <em>{entry.points} pts</em>
                </li>
              ))}
            </ol>
          ) : (
            <p>No fortresses yet.</p>
          )}
        </section>
      </footer>
    </main>
  );
}
