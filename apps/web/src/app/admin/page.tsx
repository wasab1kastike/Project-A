import Link from "next/link";
import styles from "./page.module.css";
import { requireAdminSession } from "@/lib/admin";
import { getAdminDashboardState } from "@/lib/game/admin-dashboard";
import {
  emergencyResetCycleAction,
  forceEndCycleAction,
  reviewWinnerRequestAction,
  runManualCatchUpTickAction,
  toggleJoiningLockAction,
} from "./actions";

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

function formatDateTime(value: Date | null) {
  if (!value) {
    return "Not set";
  }

  return dateTimeFormatter.format(value);
}

export default async function AdminPage({
  searchParams,
}: {
  searchParams?: SearchParams;
}) {
  const session = await requireAdminSession();
  const params = (await searchParams) ?? {};
  const error = getSearchValue(params.error);
  const notice = getSearchValue(params.notice);
  const state = await getAdminDashboardState();

  return (
    <main className={styles.page}>
      <section className={styles.hero}>
        <div className={styles.heroCopy}>
          <p className={styles.eyebrow}>Admin control room</p>
          <h1>Run the season without leaving the repo.</h1>
          <p>
            Inspect players, audit fortress state, force deadlines forward, and
            keep cycle history moving when something goes sideways.
          </p>
          <p>
            Winner request review follows the{" "}
            <a
              className={styles.inlineLink}
              href={state.policyUrl}
              target="_blank"
              rel="noreferrer"
            >
              v1 change policy
            </a>
            .
          </p>
          <div className={styles.navRow}>
            <Link className={styles.linkButton} href="/">
              Back to battlefield
            </Link>
            <Link className={styles.linkButton} href="/history">
              Open cycle history
            </Link>
          </div>
        </div>

        <article className={styles.heroCard}>
          <span className={styles.sectionLabel}>Signed in as</span>
          <h2>Admin session</h2>
          <dl className={styles.statsList}>
            <div className={styles.statRow}>
              <dt>Role</dt>
              <dd>{session.user.role}</dd>
            </div>
            <div className={styles.statRow}>
              <dt>Current cycle</dt>
              <dd>{state.currentCycle?.status ?? "No unresolved cycle"}</dd>
            </div>
            <div className={styles.statRow}>
              <dt>Joined fortresses</dt>
              <dd>{state.currentCycle?.joinedCount ?? 0}</dd>
            </div>
            <div className={styles.statRow}>
              <dt>Joining lock</dt>
              <dd>
                {state.currentCycle?.joiningLockedAt
                  ? "Locked"
                  : "Open if registration is live"}
              </dd>
            </div>
          </dl>
        </article>
      </section>

      {error ? <p className={styles.errorBanner}>{error}</p> : null}
      {notice ? <p className={styles.noticeBanner}>{notice}</p> : null}
      {state.currentCycle?.tickHealth === "stalled" ? (
        <p className={styles.stalledBanner}>
          Tick runner stalled. Scores, impacts, and new attack launches may be frozen until you replay the missed minutes.
        </p>
      ) : null}

      <section className={styles.grid}>
        <article className={styles.card}>
          <span className={styles.sectionLabel}>Cycle operations</span>
          <h2>Manual controls</h2>
          <p>
            Force the current cycle to its next state, pause new joins during
            registration, or archive a broken cycle and boot a clean one.
          </p>
          <p>
            Use catch-up replay when the ACTIVE cycle falls behind. It reprocesses
            every missed minute and refreshes the battlefield, leaderboard, and
            history views.
          </p>

          <div className={styles.actionStack}>
            <form action={toggleJoiningLockAction} className={styles.inlineForm}>
              <input
                type="hidden"
                name="intent"
                value={state.currentCycle?.joiningLockedAt ? "unlock" : "lock"}
              />
              <button
                className={styles.secondaryButton}
                type="submit"
                disabled={state.currentCycle?.status !== "REGISTRATION"}
              >
                {state.currentCycle?.joiningLockedAt
                  ? "Unlock joining"
                  : "Lock joining"}
              </button>
            </form>

            <form action={forceEndCycleAction} className={styles.inlineForm}>
              <button
                className={styles.primaryButton}
                type="submit"
                disabled={!state.currentCycle}
              >
                Force end current cycle
              </button>
            </form>

            <form action={emergencyResetCycleAction} className={styles.inlineForm}>
              <button
                className={styles.dangerButton}
                type="submit"
                disabled={!state.currentCycle}
              >
                Emergency reset
              </button>
            </form>

            <form action={runManualCatchUpTickAction} className={styles.inlineForm}>
              <button
                className={styles.warningButton}
                type="submit"
                disabled={!state.currentCycle}
              >
                Replay missed ticks now
              </button>
            </form>
          </div>
        </article>

        <article className={styles.card}>
          <span className={styles.sectionLabel}>Current cycle</span>
          <h2>
            {state.currentCycle
              ? `Cycle ${state.currentCycle.id.slice(0, 8)}`
              : "No unresolved cycle"}
          </h2>
          {state.currentCycle ? (
            <>
              <dl className={styles.statsList}>
                <div className={styles.statRow}>
                  <dt>Registration ends</dt>
                  <dd>{formatDateTime(state.currentCycle.registrationEndsAt)}</dd>
                </div>
                <div className={styles.statRow}>
                  <dt>Active starts</dt>
                  <dd>{formatDateTime(state.currentCycle.activeStartedAt)}</dd>
                </div>
                <div className={styles.statRow}>
                  <dt>Active ends</dt>
                  <dd>{formatDateTime(state.currentCycle.activeEndsAt)}</dd>
                </div>
                <div className={styles.statRow}>
                  <dt>Last tick</dt>
                  <dd>{formatDateTime(state.currentCycle.lastProcessedTickAt)}</dd>
                </div>
                <div className={styles.statRow}>
                  <dt>Tick health</dt>
                  <dd>{state.currentCycle.tickHealth}</dd>
                </div>
                <div className={styles.statRow}>
                  <dt>Minutes behind</dt>
                  <dd>{state.currentCycle.minutesBehind}</dd>
                </div>
                <div className={styles.statRow}>
                  <dt>Score events</dt>
                  <dd>{state.currentCycle.scoreEventCount}</dd>
                </div>
                <div className={styles.statRow}>
                  <dt>Chat messages</dt>
                  <dd>{state.currentCycle.chatMessageCount}</dd>
                </div>
                <div className={styles.statRow}>
                  <dt>Winner requests</dt>
                  <dd>{state.currentCycle.winnerRequestCount}</dd>
                </div>
              </dl>

              {state.currentCycle.tickHealth === "stalled" ? (
                <p className={styles.recoveryHint}>
                  Tick processing is stalled. Replay the missed minutes from the
                  manual controls panel to restore point growth, attack impacts,
                  and the next outbound launches.
                </p>
              ) : null}

              {state.currentCycle.latestWinnerRequests.length > 0 ? (
                <div className={styles.subsection}>
                  <h3>Latest winner requests</h3>
                  <ul className={styles.requestList}>
                    {state.currentCycle.latestWinnerRequests.map((request) => (
                      <li key={request.id}>
                        <strong>{request.authorLabel}</strong>
                        <span>{request.status}</span>
                        <small>{formatDateTime(request.createdAt)}</small>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </>
          ) : (
            <p>No unresolved cycle is currently available to inspect.</p>
          )}
        </article>
      </section>

      <section className={styles.grid}>
        <article className={styles.card}>
          <span className={styles.sectionLabel}>Players</span>
          <h2>User inspection</h2>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Player</th>
                  <th>Role</th>
                  <th>Current fortress</th>
                  <th>Points</th>
                  <th>Joined</th>
                </tr>
              </thead>
              <tbody>
                {state.players.map((player) => (
                  <tr key={player.id}>
                    <td>
                      <strong>{player.label}</strong>
                      <small>{player.currentFortress ? "Participant" : "Spectator"}</small>
                    </td>
                    <td>{player.role}</td>
                    <td>{player.currentFortress?.name ?? "Spectator"}</td>
                    <td>{player.currentFortress?.points ?? "-"}</td>
                    <td>{formatDateTime(player.currentFortress?.joinedAt ?? null)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </article>

        <article className={styles.card}>
          <span className={styles.sectionLabel}>Fortresses</span>
          <h2>Cycle fortress inspection</h2>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Fortress</th>
                  <th>Owner</th>
                  <th>Type</th>
                  <th>Points</th>
                  <th>HP</th>
                  <th>Action</th>
                  <th>Target</th>
                  <th>Map</th>
                </tr>
              </thead>
              <tbody>
                {state.fortresses.length > 0 ? (
                  state.fortresses.map((fortress) => (
                    <tr key={fortress.id}>
                      <td>
                        <strong>{fortress.name}</strong>
                        <small>{formatDateTime(fortress.joinedAt)}</small>
                      </td>
                      <td>
                        {fortress.ownerLabel}
                        <small>{fortress.ownerRole}</small>
                      </td>
                      <td>
                        {fortress.isNpc ? "NPC" : "Player"}
                        <small>
                          {fortress.isNpc
                            ? `${fortress.iconLabel ?? "A-"} · ${fortress.sizeTiles} tiles`
                            : "1 tile"}
                        </small>
                      </td>
                      <td>{fortress.points}</td>
                      <td>
                        {fortress.isNpc
                          ? `${fortress.health} / ${fortress.maxHealth}`
                          : "-"}
                      </td>
                      <td>{fortress.currentAction}</td>
                      <td>{fortress.targetName ?? "None"}</td>
                      <td>{fortress.mapLabel}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={8}>No fortresses are attached to the current cycle.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </article>
      </section>

      <section className={styles.grid}>
        <article className={styles.card}>
          <span className={styles.sectionLabel}>Winner requests</span>
          <h2>Review queue</h2>
          <div className={styles.historyList}>
            {state.winnerRequests.length > 0 ? (
              state.winnerRequests.map((request) => (
                <div className={styles.historyItem} key={request.id}>
                  <div className={styles.reviewHeader}>
                    <div>
                      <strong>{request.winnerFortressName}</strong>
                      <p>
                        {request.authorLabel} · Cycle {request.cycleId.slice(0, 8)}
                      </p>
                    </div>
                    <div>
                      <strong>{request.status}</strong>
                      <p>{formatDateTime(request.createdAt)}</p>
                    </div>
                  </div>
                  <p>{request.requestText}</p>
                  <p>
                    Reviewed by: {request.reviewedByLabel ?? "Not reviewed yet"}
                    {request.reviewedAt
                      ? ` · ${formatDateTime(request.reviewedAt)}`
                      : ""}
                  </p>
                  <p>{request.reviewNotes ?? "No review notes yet."}</p>
                  <form action={reviewWinnerRequestAction} className={styles.reviewForm}>
                    <input type="hidden" name="requestId" value={request.id} />
                    <label className={styles.fieldStack}>
                      <span>Review state</span>
                      <select name="status" defaultValue={request.status}>
                        <option value="SUBMITTED">SUBMITTED</option>
                        <option value="UNDER_ADMIN_REVIEW">UNDER_ADMIN_REVIEW</option>
                        <option value="NEEDS_SIMPLIFICATION">NEEDS_SIMPLIFICATION</option>
                        <option value="ACCEPTED">ACCEPTED</option>
                        <option value="REJECTED">REJECTED</option>
                      </select>
                    </label>
                    <label className={styles.fieldStack}>
                      <span>Review notes</span>
                      <textarea
                        name="reviewNotes"
                        rows={4}
                        defaultValue={request.reviewNotes ?? ""}
                        placeholder="Explain the decision or the simplification needed."
                      />
                    </label>
                    <button className={styles.primaryButton} type="submit">
                      Save review
                    </button>
                  </form>
                </div>
              ))
            ) : (
              <p>No winner requests have been submitted yet.</p>
            )}
          </div>
        </article>

        <article className={styles.card}>
          <span className={styles.sectionLabel}>Recent history</span>
          <h2>Last resolved cycles</h2>
          <div className={styles.historyList}>
            {state.recentHistory.length > 0 ? (
              state.recentHistory.map((entry) => (
                <div className={styles.historyItem} key={entry.id}>
                  <div>
                    <strong>{entry.winnerFortressName}</strong>
                    <p>{entry.winnerLabel}</p>
                  </div>
                  <div>
                    <strong>{entry.winningScore} pts</strong>
                    <p>{formatDateTime(entry.endedAt)}</p>
                  </div>
                  <p>{entry.tieBreakSummary ?? "No tie-break summary stored."}</p>
                </div>
              ))
            ) : (
              <p>No cycle history has been written yet.</p>
            )}
          </div>
        </article>
      </section>
    </main>
  );
}
