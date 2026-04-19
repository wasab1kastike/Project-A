import styles from "./page.module.css";
import { auth, isAuthConfigured } from "@/auth";
import { SessionActions } from "@/components/session-actions";
import {
  editRegistrationFortressNameAction,
  joinFortressAction,
  renameFortressAction,
  setFortressActionAction,
} from "@/app/game-actions";
import { getHomePageState } from "@/lib/game/read-model";

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

export default async function Home({
  searchParams,
}: {
  searchParams?: SearchParams;
}) {
  const params = (await searchParams) ?? {};
  const error = getSearchValue(params.error);
  const notice = getSearchValue(params.notice);

  const session = await auth();
  const isAdmin = session?.user?.role === "ADMIN";
  const userLabel = session?.user?.name ?? session?.user?.email ?? "Commander";
  const state = await getHomePageState({
    userId: session?.user?.id,
  });
  const currentTargetName =
    state.playerFortress?.targetFortress?.name ?? "No target selected";

  return (
    <main className={styles.page}>
      <section className={styles.hero}>
        <div className={styles.heroCopy}>
          <p className={styles.kicker}>Milestone 2</p>
          <h1>Season bootstrap is live.</h1>
          <p className={styles.lead}>
            Registration, fortress onboarding, action selection, rename costs,
            and minute ticks now share the same database-backed season model.
          </p>
        </div>
        <article className={styles.heroPanel}>
          <span className={styles.sectionLabel}>Current cycle</span>
          <h2>{state.cycle?.status ?? "No open cycle"}</h2>
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
              <dt>Deadline</dt>
              <dd>{formatDeadline(state.cycle?.deadline ?? null)}</dd>
            </div>
          </dl>
        </article>
      </section>

      {error ? <p className={styles.errorBanner}>{error}</p> : null}
      {notice ? <p className={styles.noticeBanner}>{notice}</p> : null}

      <section className={styles.layout}>
        <div className={styles.mainColumn}>
          <article className={styles.panel}>
            <span className={styles.sectionLabel}>Game state</span>
            <h2>
              {state.cycle
                ? `Phase: ${state.cycle.status}`
                : "Waiting for the first seed cycle"}
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
                  Tick runner status: run `npm run game:tick` to transition
                  expired registration windows and process score updates.
                </li>
              </ul>
            ) : null}
          </article>

          <article className={styles.panel}>
            <span className={styles.sectionLabel}>Season control</span>
            <h2>
              {session?.user ? `Signed in as ${userLabel}` : "Spectator mode"}
            </h2>
            <p>
              {session?.user
                ? state.playerFortress
                  ? "Your fortress is attached to the current unresolved cycle."
                  : "You are signed in but not yet participating in this season."
                : "Signed-out visitors can inspect season state, but only authenticated users can join and submit actions."}
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
                Registration is currently closed for new joins. If the deadline
                has passed, the next tick run will either restart registration
                or move the season into ACTIVE.
              </p>
            ) : null}

            {session?.user &&
            state.cycle?.status === "ACTIVE" &&
            state.playerFortress ? (
              <div className={styles.stack}>
                <form action={setFortressActionAction} className={styles.form}>
                  <label className={styles.field}>
                    <span>Current action</span>
                    <select
                      name="action"
                      defaultValue={state.playerFortress.currentAction}
                    >
                      <option value="GROW">Grow</option>
                      <option value="ATTACK">Attack</option>
                    </select>
                  </label>
                  <label className={styles.field}>
                    <span>Attack target</span>
                    <select
                      name="targetFortressId"
                      defaultValue={state.playerFortress.targetFortress?.id ?? ""}
                    >
                      <option value="">No target</option>
                      {state.availableTargets.map((target) => (
                        <option key={target.id} value={target.id}>
                          {target.name} ({target.points} pts)
                        </option>
                      ))}
                    </select>
                  </label>
                  <button className={styles.primaryButton} type="submit">
                    Save action
                  </button>
                </form>

                <form action={renameFortressAction} className={styles.form}>
                  <label className={styles.field}>
                    <span>Rename fortress (costs 10 points)</span>
                    <input
                      name="fortressName"
                      type="text"
                      defaultValue={state.playerFortress.name}
                      required
                    />
                  </label>
                  <button className={styles.secondaryButton} type="submit">
                    Spend 10 points to rename
                  </button>
                </form>
              </div>
            ) : null}

            {session?.user &&
            state.cycle?.status === "ACTIVE" &&
            !state.playerFortress ? (
              <p className={styles.inlineHint}>
                This cycle is already active. You are observing as a spectator
                until the next registration window opens.
              </p>
            ) : null}
          </article>
        </div>

        <aside className={styles.sidebar}>
          <article className={styles.panel}>
            <span className={styles.sectionLabel}>Fortress</span>
            <h2>
              {state.playerFortress ? state.playerFortress.name : "No fortress yet"}
            </h2>
            <dl className={styles.statsList}>
              <div className={styles.statRow}>
                <dt>Points</dt>
                <dd>{state.playerFortress?.points ?? 0}</dd>
              </div>
              <div className={styles.statRow}>
                <dt>Action</dt>
                <dd>{state.playerFortress?.currentAction ?? "None"}</dd>
              </div>
              <div className={styles.statRow}>
                <dt>Target</dt>
                <dd>{currentTargetName}</dd>
              </div>
              <div className={styles.statRow}>
                <dt>Map slot</dt>
                <dd>
                  {state.playerFortress
                    ? `${state.playerFortress.mapX}, ${state.playerFortress.mapY}`
                    : "Unassigned"}
                </dd>
              </div>
            </dl>
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
          </article>
        </aside>
      </section>
    </main>
  );
}
