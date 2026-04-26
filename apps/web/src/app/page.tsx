import Link from "next/link";
import type { Session } from "next-auth";
import styles from "./page.module.css";
import { auth, isAuthConfigured } from "@/auth";
import { SessionActions } from "@/components/session-actions";
import { BattlefieldExperience } from "@/components/battlefield-experience";
import { MegaFortressNotice } from "@/components/mega-fortress-notice";
import { RealtimeBridge } from "@/components/realtime-bridge";
import { SeasonTimer } from "@/components/season-timer";
import {
  joinFortressAction,
  registerCommanderNameAction,
  submitCommunityWishProposalAction,
} from "@/app/game-actions";
import { COMMUNITY_WISH_MAX_LENGTH } from "@/lib/game/community-wishes";
import { getHomePageState, type HomePageState } from "@/lib/game/read-model";
import { PRIMARY_GAME_NAV_LINKS } from "@/lib/game/site-navigation";

export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const dateTimeFormatter = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "short",
});

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

function getDegradedHomePageState(): HomePageState {
  return {
    isSpectator: true,
    cycle: null,
    phase: null,
    playerFortress: null,
    playerSummary: null,
    leaderboard: [],
    mapFortresses: [],
    attackUnits: [],
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
      isOpen: false,
      opensAt: null,
      closesAt: null,
      canSubmit: false,
      submissionHint:
        "The season winner gets one guaranteed wish. Community voting starts after the season ends. Wishes can be edited until Monday 12:00, and voting ends Monday 24:00.",
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
    session = await auth();
    state = await getHomePageState({
      userId: session?.user?.id,
    });
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
  const leaderboard = state.leaderboard.slice(0, 3);
  const isActivePhase = state.phase?.status === "ACTIVE";
  const tickDelayMinutes = state.cycle?.tickDelayMinutes ?? null;
  const tickHealth = state.cycle?.tickHealth ?? null;
  const showTickStatus =
    isActivePhase &&
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
    state.communityWish.proposals.find((proposal) => proposal.isCurrentUser) ??
    null;
  const showLoginCard = !session?.user;
  const showJoinCard = Boolean(session?.user && state.canJoinCycle);
  const showCommanderNameCard = Boolean(
    session?.user && state.playerSummary?.canRegisterCommanderName
  );
  const showArcadeCard = state.phase?.status === "REGISTRATION";
  const showSeasonBanner = Boolean(state.latestSeason);
  const isWaitingForSeason =
    !state.phase || state.phase.status === "RESOLUTION" || !state.cycle;
  const showSidePanel = Boolean(
    blockingMessage ||
    showLoginCard ||
    showJoinCard ||
    showCommanderNameCard ||
    isWaitingForSeason ||
    showArcadeCard ||
    showSeasonBanner
  );

  const phaseCopy =
    state.phase?.status === "REGISTRATION"
      ? {
          title: "Build phase is open.",
          description: "Claim a fortress and wait for the next season to begin.",
          nextAction: state.playerFortress
            ? "You are locked in. Use the arcade while the next season is being prepared."
            : "Join before Wednesday to take part in the next season.",
          timerLabel: "Build ends",
          battlefieldTitle: "Build phase map",
          battlefieldDescription: "Fortresses appear as players join the build phase.",
        }
      : state.phase?.status === "ACTIVE"
        ? {
            title: "Season is live.",
            description: "Moves are being resolved in real time.",
            nextAction: state.playerSummary
              ? "Pick a target on the map or open Orders to submit your move."
              : state.canJoinCycle
                ? "You can still join this running season while slots are available."
                : "Follow the live map and wait for the next registration.",
            timerLabel: "Cycle ends",
            battlefieldTitle: "Live battlefield",
            battlefieldDescription: "Choose a target and lock your next move.",
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

  const centerTitle = blockingMessage
    ? "Something needs attention."
    : showLoginCard
      ? "Join the battlefield."
      : showCommanderNameCard
        ? "Choose your in-game nick."
        : showJoinCard
          ? state.phase?.status === "ACTIVE"
            ? "Join the running season."
            : "Claim your fortress."
          : phaseCopy.title;

  const centerDescription = blockingMessage
    ? blockingMessage
    : showLoginCard
      ? "Sign in to join a fortress, chat, and submit orders when the season is active."
      : showCommanderNameCard
        ? "Set the commander name other players will see this season. Your account name stays private."
        : showJoinCard
          ? state.phase?.status === "ACTIVE"
            ? "This season is already running. Join now to enter immediately if slots are still available."
            : "Build phase is open. Name your fortress now and it will appear on the map."
          : (state.cycle?.statusMessage ?? state.emptyStateMessage);

  return (
    <main className={styles.page}>
      <RealtimeBridge enabled={Boolean(state.cycle)} />
      <MegaFortressNotice
        cycleId={state.cycle?.id ?? null}
        megaFortressDestroyCount={state.cycle?.megaFortressDestroyCount ?? 0}
      />

      <div className={styles.mapLayer}>
        <BattlefieldExperience
          immersive
          title={phaseCopy.battlefieldTitle}
          description={phaseCopy.battlefieldDescription}
          phaseStatus={state.phase?.status ?? null}
          playerSummary={state.playerSummary}
          playerFortress={state.playerFortress}
          mapFortresses={state.mapFortresses}
          attackUnits={state.attackUnits}
          targets={state.availableTargets}
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
        </div>

        <nav className={styles.topLinks} aria-label="Account and pages">
          <span className={styles.accountChip}>
            {session?.user ? userLabel : "Guest"}
          </span>
          {PRIMARY_GAME_NAV_LINKS.map((link) => (
            <Link className={styles.hudButton} href={link.href} key={link.href}>
              {link.label}
            </Link>
          ))}
          {isAdmin ? (
            <Link className={styles.hudButton} href="/admin">
              Admin
            </Link>
          ) : null}
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

      {notice ? <p className={styles.noticeToast}>{notice}</p> : null}

      {state.cycle && state.phase?.status === "ACTIVE" ? (
        <details className={styles.wishPanel} open>
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
                action={submitCommunityWishProposalAction}
                className={styles.form}
              >
                <input type="hidden" name="cycleId" value={state.cycle.id} />
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
                            Winner wish is guaranteed. Community voting starts
                            after the season ends.
                          </li>
                          <li>Wishes lock Monday 12:00 after the season.</li>
                          <li>Voting closes Monday 24:00.</li>
                          <li>Write in English.</li>
                          <li>
                            Keep it short: max {COMMUNITY_WISH_MAX_LENGTH}{" "}
                            characters.
                          </li>
                          <li>Ask for one feature idea, not a full spec.</li>
                          <li>
                            No self-buffs, targeted nerfs, more wishes, or deploy
                            requests.
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
                    defaultValue={currentUserCommunityWish?.requestText ?? ""}
                    required
                  />
                </label>
                <button className={styles.primaryButton} type="submit">
                  {currentUserCommunityWish ? "Update wish" : "Submit wish"}
                </button>
              </form>
            ) : null}
            {state.communityWish.proposals.length > 0 ? (
              <ol className={styles.wishList}>
                {state.communityWish.proposals.slice(0, 4).map((proposal) => (
                  <li key={proposal.id}>
                    <strong>
                      {proposal.isCurrentUser ? "Your wish" : "Community wish"}
                    </strong>
                    <span>{proposal.status}</span>
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

      {showSidePanel ? (
        <section
          className={`${styles.sidePanel} ${
            blockingMessage ? styles.statusPanel : ""
          }`}
          aria-live="polite"
        >
          {state.latestSeason ? (
            <section className={styles.seasonSummary}>
              <span className={styles.sectionLabel}>Previous season winner</span>
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
            </section>
          ) : null}
          {session?.user?.id &&
          state.latestSeason &&
          state.latestSeason.winnerId === session.user.id &&
          state.latestSeason.winnerRequestId === null ? (
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
            <form action={joinFortressAction} className={styles.form}>
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
              <button className={styles.primaryButton} type="submit">
                Join this season
              </button>
            </form>
          ) : null}

          {showCommanderNameCard && !blockingMessage ? (
            <form action={registerCommanderNameAction} className={styles.form}>
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
              <Link className={styles.secondaryButton} href="/arcade">
                Play build arcade
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
                <dt>Season end</dt>
                <dd>{formatDeadline(state.cycle.activeEndsAt)}</dd>
              </div>
            </dl>
          ) : null}
        </section>
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
                <dt>Action</dt>
                <dd>{state.playerSummary.currentAction}</dd>
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
          <p>{phaseCopy.nextAction}</p>
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
