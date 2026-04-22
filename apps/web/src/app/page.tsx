import Link from "next/link";
import type { Session } from "next-auth";
import styles from "./page.module.css";
import { auth, isAuthConfigured } from "@/auth";
import { SessionActions } from "@/components/session-actions";
import { BattlefieldExperience } from "@/components/battlefield-experience";
import { RealtimeBridge } from "@/components/realtime-bridge";
import { SeasonTimer } from "@/components/season-timer";
import {
  joinFortressAction,
  registerCommanderNameAction,
} from "@/app/game-actions";
import { getHomePageState, type HomePageState } from "@/lib/game/read-model";

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
    },
    availableTargets: [],
    canJoinCycle: false,
    canEditRegistrationName: false,
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
  const showLoginCard = !session?.user;
  const showJoinCard = Boolean(session?.user && state.canJoinCycle);
  const showCommanderNameCard = Boolean(
    session?.user && state.playerSummary?.canRegisterCommanderName
  );
  const isWaitingForSeason =
    !state.phase || state.phase.status === "RESOLUTION" || !state.cycle;
  const showSidePanel = Boolean(
    blockingMessage ||
      showLoginCard ||
      showJoinCard ||
      showCommanderNameCard ||
      isWaitingForSeason
  );

  const phaseCopy =
    state.phase?.status === "REGISTRATION"
      ? {
          title: "Registration is open.",
          description: "Claim a fortress before the timer ends.",
          nextAction: state.playerFortress
            ? "You are locked in. Select your fortress on the map to edit it."
            : "Join this season before the registration window closes.",
          timerLabel: "Registration ends",
          battlefieldTitle: "Season map preview",
          battlefieldDescription: "Fortresses appear as players register.",
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
          : "Registration is open. Name your fortress now and it will appear on the map."
        : state.cycle?.statusMessage ?? state.emptyStateMessage;

  const playerSummaryText = state.playerSummary
    ? `${state.playerSummary.points} pts - ${state.playerSummary.currentAction}${
        state.playerSummary.currentTargetName
          ? ` -> ${state.playerSummary.currentTargetName}`
          : ""
      }`
    : state.isSpectator
      ? "Spectating this cycle"
      : "No fortress yet";

  return (
    <main className={styles.page}>
      <RealtimeBridge enabled={Boolean(state.cycle)} />

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
          <Link className={styles.hudButton} href="/history">
            History
          </Link>
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

      {showSidePanel ? (
        <section
          className={`${styles.sidePanel} ${
            blockingMessage ? styles.statusPanel : ""
          }`}
          aria-live="polite"
        >
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
                <dt>Registration</dt>
                <dd>{formatDeadline(state.cycle.registrationEndsAt)}</dd>
              </div>
              <div>
                <dt>Active deadline</dt>
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
            {state.playerSummary?.isCrowned ? (
              <span className={styles.crownBadge}>Crowned</span>
            ) : null}
          </div>
          <p>{playerSummaryText}</p>
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
                  {entry.isCrowned ? (
                    <small className={styles.crownBadge}>Crowned</small>
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
