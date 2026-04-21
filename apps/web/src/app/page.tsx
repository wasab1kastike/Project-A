import Link from "next/link";
import type { Session } from "next-auth";
import styles from "./page.module.css";
import { auth, isAuthConfigured } from "@/auth";
import { SessionActions } from "@/components/session-actions";
import { ActiveCommandCenter } from "@/components/active-command-center";
import { ChatPanel } from "@/components/chat-panel";
import { FortressMap } from "@/components/fortress-map";
import { LeaderboardPanel } from "@/components/leaderboard-panel";
import { RealtimeBridge } from "@/components/realtime-bridge";
import { SeasonTimer } from "@/components/season-timer";
import {
  editRegistrationFortressNameAction,
  joinFortressAction,
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
    chat: {
      messages: [],
      canPost: false,
      maxLength: 280,
      postHint: "Palvelussa on tilapäinen häiriö. Yritä hetken kuluttua uudelleen.",
    },
    availableTargets: [],
    canJoinRegistration: false,
    canEditRegistrationName: false,
    emptyStateMessage:
      "Palvelussa on tilapäinen häiriö. Yritä hetken kuluttua uudelleen.",
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
    "Palvelussa on tilapäinen häiriö. Yritä hetken kuluttua uudelleen.";

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
  const userLabel = session?.user?.name ?? session?.user?.email ?? "Commander";
  const phaseClassName = [
    styles.hero,
    state.phase?.status === "REGISTRATION" ? styles.registrationHero : styles.activeHero,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <main className={styles.page}>
      <RealtimeBridge enabled={Boolean(session?.user)} />
      <section className={phaseClassName}>
        <div className={styles.heroCopy}>
          <p className={styles.kicker}>Season Status</p>
          <div className={styles.phaseHeading}>
            <span className={styles.phaseBadge}>
              {state.phase?.label ?? "Waiting for a cycle"}
            </span>
            <h1>
              {state.phase?.status === "REGISTRATION"
                ? "Registration is open."
                : state.phase?.status === "ACTIVE"
                  ? "Season is in progress."
                  : "Waiting for the next season."}
            </h1>
          </div>
          <p className={styles.lead}>
            {state.phase?.status === "REGISTRATION"
              ? "Claim your fortress, review the current roster, and get ready before the season begins."
              : state.phase?.status === "ACTIVE"
                ? "Follow the live timer, coordinate in chat, and manage your next move on the battlefield."
                : "You can review the latest results and check back soon when registration opens again."}
          </p>
        </div>
        <article className={styles.heroPanel}>
          <span className={styles.sectionLabel}>Phase timer</span>
          <SeasonTimer
            deadline={state.phase?.deadline?.toISOString() ?? null}
            label={
              state.phase?.status === "REGISTRATION"
                ? "Registration ends in"
                : state.phase?.status === "ACTIVE"
                  ? "Active cycle ends in"
                  : "Current cycle"
            }
          />
          <p>{state.cycle?.phaseDescription ?? state.emptyStateMessage}</p>
          <dl className={styles.statsList}>
            <div className={styles.statRow}>
              <dt>Joined</dt>
              <dd>
                {state.cycle ? `${state.cycle.joinedCount} / 30` : "0 / 30"}
              </dd>
            </div>
            <div className={styles.statRow}>
              <dt>Remaining slots</dt>
              <dd>{state.cycle?.remainingSlots ?? 30}</dd>
            </div>
            <div className={styles.statRow}>
              <dt>Current phase</dt>
              <dd>{state.phase?.label ?? "Unavailable"}</dd>
            </div>
          </dl>
        </article>
      </section>

      {runtimeError ? <p className={styles.errorBanner}>{runtimeError}</p> : null}
      {error ? <p className={styles.errorBanner}>{error}</p> : null}
      {notice ? <p className={styles.noticeBanner}>{notice}</p> : null}

      <section className={styles.layout}>
        <div className={styles.mainColumn}>
          <article className={styles.panel}>
            <span className={styles.sectionLabel}>Game state</span>
            <h2>
              {state.phase
                ? `Vaihe: ${state.phase.label}`
                : "Uusi kausi ilmoitetaan pian"}
            </h2>
            <p>{state.cycle?.statusMessage ?? state.emptyStateMessage}</p>
            {state.cycle ? (
              <ul className={styles.detailList}>
                <li>
                  Registration window:{" "}
                  {formatDeadline(state.cycle.registrationEndsAt)}
                </li>
                <li>
                  Active deadline: {formatDeadline(state.cycle.activeEndsAt)}
                </li>
                <li>
                  Spectator status:{" "}
                  {state.isSpectator
                    ? "Seuraat peliä katsojana, kunnes liityt mukaan kaudelle."
                    : "Johdat omaa linnoitustasi tällä kaudella."}
                </li>
                <li>
                  Kierroksen päivitykset käsitellään automaattisesti.
                </li>
              </ul>
            ) : null}
          </article>

          <article className={styles.panel}>
            <span className={styles.sectionLabel}>Battlefield</span>
            <h2>
              {state.phase?.status === "REGISTRATION"
                ? "Upcoming season map"
                : "Current cycle battlefield"}
            </h2>
            <p>
              {state.phase?.status === "REGISTRATION"
                ? "Linnoitukset ilmestyvät kartalle pelaajien liittyessä mukaan. Toiminnot avautuvat, kun ilmoittautuminen päättyy."
                : state.phase?.status === "ACTIVE"
                  ? "Kaikki aktiivisen kauden linnoitukset näkyvät täällä. Valitse kohteesi ja suunnittele seuraava siirtosi."
                  : "Taistelukenttä päivittyy, kun seuraava kausi käynnistyy."}
            </p>

            {state.phase?.status === "ACTIVE" && state.playerSummary ? (
              <ActiveCommandCenter
                currentAction={state.playerSummary.currentAction}
                currentTargetId={state.playerSummary.currentTargetId}
                currentTargetName={state.playerSummary.currentTargetName}
                fortressName={state.playerSummary.name}
                mapFortresses={state.mapFortresses}
                targets={state.availableTargets}
              />
            ) : (
              <FortressMap fortresses={state.mapFortresses} />
            )}
          </article>

          <article className={styles.panel}>
            <span className={styles.sectionLabel}>Season control</span>
            <h2>
              {session?.user ? `Signed in as ${userLabel}` : "Spectator mode"}
            </h2>
            <p>
              {session?.user
                ? state.playerFortress
                  ? "Linnoituksesi on mukana tällä kaudella."
                  : "Olet kirjautunut sisään, mutta et ole vielä liittynyt tälle kaudelle. Voit silti keskustella chatissa."
                : "Kirjautumalla sisään voit liittyä kaudelle ja tehdä omia siirtoja."}
            </p>

            {!session?.user ? (
              <SessionActions
                authConfigured={isAuthConfigured}
                isAuthenticated={false}
                isAdmin={false}
              />
            ) : null}

            {session?.user && state.canJoinRegistration ? (
              <form action={joinFortressAction} className={styles.form}>
                <label className={styles.field}>
                  <span>Fortress name</span>
                  <input
                    name="fortressName"
                    type="text"
                    placeholder="Name your fortress"
                    required
                  />
                </label>
                <button className={styles.primaryButton} type="submit">
                  Join season
                </button>
              </form>
            ) : null}

            {session?.user && state.canEditRegistrationName && state.playerFortress ? (
              <form action={editRegistrationFortressNameAction} className={styles.form}>
                <label className={styles.field}>
                  <span>Fortress name</span>
                  <input
                    name="fortressName"
                    type="text"
                    defaultValue={state.playerFortress.name}
                    required
                  />
                </label>
                <button className={styles.primaryButton} type="submit">
                  Update registration name
                </button>
              </form>
            ) : null}

            {session?.user &&
            state.cycle?.status === "REGISTRATION" &&
            !state.canJoinRegistration &&
            !state.canEditRegistrationName ? (
              <p className={styles.inlineHint}>
                {state.playerSummary
                  ? "Your fortress is already locked into the upcoming season. You can still edit its name while registration remains open."
                  : "Ilmoittautuminen on tällä hetkellä suljettu uusilta liittymisiltä. Tarkista tilanne hetken kuluttua uudelleen."}
              </p>
            ) : null}

            {session?.user &&
            state.cycle?.status === "ACTIVE" &&
            state.playerSummary ? (
              <p className={styles.inlineHint}>
                Use the battlefield panel to choose targets from the map or the fallback selector, then submit your action. Rename remains available there as well.
              </p>
            ) : null}

            {session?.user &&
            state.cycle?.status === "ACTIVE" &&
            !state.playerFortress ? (
              <p className={styles.inlineHint}>
                This cycle is already active. You are observing as a spectator
                until the next registration window opens, but you can still post in global chat.
              </p>
            ) : null}
          </article>
        </div>

        <aside className={styles.sidebar}>
          <article className={styles.panel}>
            <LeaderboardPanel
              leaderboard={state.leaderboard}
              playerSummary={state.playerSummary}
              isSpectator={state.isSpectator}
            />
          </article>

          <article className={styles.panel}>
            <span className={styles.sectionLabel}>Session</span>
            <dl className={styles.statsList}>
              <div className={styles.statRow}>
                <dt>Auth configured</dt>
                <dd>{isAuthConfigured ? "Yes" : "No"}</dd>
              </div>
              <div className={styles.statRow}>
                <dt>Role</dt>
                <dd>{session?.user?.role ?? "SPECTATOR"}</dd>
              </div>
              <div className={styles.statRow}>
                <dt>Mode</dt>
                <dd>{state.isSpectator ? "Read-only" : "Participant"}</dd>
              </div>
              <div className={styles.statRow}>
                <dt>Admin nav</dt>
                <dd>{isAdmin ? "Visible" : "Hidden"}</dd>
              </div>
            </dl>
            {session?.user ? (
              <SessionActions
                authConfigured={isAuthConfigured}
                isAuthenticated
                isAdmin={isAdmin}
              />
            ) : null}
            <div className={styles.linkRow}>
              <Link className={styles.secondaryButton} href="/history">
                Open cycle history
              </Link>
              {isAdmin ? (
                <Link className={styles.secondaryButton} href="/admin">
                  Admin dashboard
                </Link>
              ) : null}
            </div>
          </article>

          <article className={styles.panel}>
            <ChatPanel
              messages={state.chat.messages}
              canPost={state.chat.canPost}
              maxLength={state.chat.maxLength}
              postHint={state.chat.postHint}
            />
          </article>
        </aside>
      </section>
    </main>
  );
}
