import Link from "next/link";
import styles from "./page.module.css";
import { auth } from "@/auth";
import { getCycleHistoryPageState } from "@/lib/game/history";

export const dynamic = "force-dynamic";

const dateTimeFormatter = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "short",
});

function formatDateTime(value: Date) {
  return dateTimeFormatter.format(value);
}

export default async function HistoryPage() {
  const session = await auth();
  const state = await getCycleHistoryPageState();

  return (
    <main className={styles.page}>
      <section className={styles.hero}>
        <div className={styles.heroCopy}>
          <p className={styles.eyebrow}>Cycle archive</p>
          <h1>Resolved seasons, winners, and tie-break receipts.</h1>
          <p>
            Review who won, when the cycle ended, what winner request was on
            file, and whether the finish required tie-break logic.
          </p>
        </div>

        <div className={styles.navRow}>
          <Link className={styles.linkButton} href="/">
            Back to battlefield
          </Link>
          {session?.user?.role === "ADMIN" ? (
            <Link className={styles.linkButton} href="/admin">
              Open admin dashboard
            </Link>
          ) : null}
        </div>
      </section>

      <section className={styles.stack}>
        {state.entries.length > 0 ? (
          state.entries.map((entry) => (
            <article className={styles.card} key={entry.id}>
              <div className={styles.cardHeader}>
                <div>
                  <span className={styles.sectionLabel}>
                    Cycle {entry.cycleId.slice(0, 8)}
                  </span>
                  <h2>{entry.winnerFortressName}</h2>
                  <p>{entry.winnerLabel}</p>
                </div>
                <div className={styles.scoreBlock}>
                  <strong>{entry.winningScore} pts</strong>
                  <span>{formatDateTime(entry.endedAt)}</span>
                </div>
              </div>

              <dl className={styles.metaList}>
                <div>
                  <dt>Winner request</dt>
                  <dd>
                    {entry.winnerRequestSnapshot ??
                      "No winner request was stored for this cycle."}
                  </dd>
                </div>
                <div>
                  <dt>Request status</dt>
                  <dd>{entry.winnerRequestStatus ?? "No linked request"}</dd>
                </div>
                <div>
                  <dt>Tie-break</dt>
                  <dd>{entry.tieBreakSummary ?? "No tie-break summary stored."}</dd>
                </div>
                <div>
                  <dt>Review notes</dt>
                  <dd>{entry.winnerRequestReviewNotes ?? "No review notes."}</dd>
                </div>
              </dl>
            </article>
          ))
        ) : (
          <article className={styles.card}>
            <span className={styles.sectionLabel}>No history yet</span>
            <h2>The archive will populate after the first resolved active cycle.</h2>
            <p>
              Once a cycle reaches resolution, this page will display the winner,
              score, request snapshot, and tie-break audit trail.
            </p>
          </article>
        )}
      </section>
    </main>
  );
}
