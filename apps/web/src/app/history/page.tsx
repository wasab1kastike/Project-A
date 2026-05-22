import Link from "next/link";
import type { Session } from "next-auth";
import styles from "./page.module.css";
import { auth } from "@/auth";
import { EXPLOIT_HALL_OF_FAME_ENTRIES } from "@/lib/game/exploit-hall-of-fame";
import { getCycleHistoryPageState } from "@/lib/game/history";
import { PATCH_NOTES_PAGE_HREF } from "@/lib/game/site-navigation";
import { WINNER_REQUEST_POLICY_URL } from "@/lib/game/winner-requests";

export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;
type HistoryTab = "seasons" | "exploits";

function getSearchValue(
  value: string | string[] | undefined
): string | undefined {
  if (Array.isArray(value)) {
    return value[0];
  }

  return value;
}

function getHistoryTab(value: string | string[] | undefined): HistoryTab {
  return getSearchValue(value) === "exploits" ? "exploits" : "seasons";
}

function formatSeasonName(seasonNumber: number) {
  const funnyNames: Record<number, string> = {
    1: "Season of Stutterfire",
    2: "Season of Grudges",
    3: "The Grand Enlistment",
  };

  return funnyNames[seasonNumber] ?? `Season ${seasonNumber}`;
}

export default async function HistoryPage({
  searchParams,
}: {
  searchParams?: SearchParams;
}) {
  let session: Session | null = null;
  const params = (await searchParams) ?? {};
  const error = getSearchValue(params.error);
  const notice = getSearchValue(params.notice);
  const activeTab = getHistoryTab(params.tab);
  let runtimeError: string | null = null;

  try {
    session = await auth();
  } catch (caughtError) {
    console.error("Failed to load history session", caughtError);
    runtimeError = "Sign-in status is temporarily unavailable.";
  }

  let state: Awaited<ReturnType<typeof getCycleHistoryPageState>> = {
    entries: [],
    policyUrl: WINNER_REQUEST_POLICY_URL,
  };

  try {
    state = await getCycleHistoryPageState({
      userId: session?.user?.id,
    });
  } catch (caughtError) {
    console.error("Failed to load history page state", caughtError);
    runtimeError =
      "Season history is temporarily unavailable. Please try again in a moment.";
  }
  const seasonIndex = [...state.entries].reverse().map((entry, index) => ({
    cycleId: entry.cycleId,
    seasonName: formatSeasonName(index + 1),
    winnerLabel: entry.winnerLabel,
    winnerFortressName: entry.winnerFortressName,
    winningScore: entry.winningScore,
    endedAt: entry.endedAt,
    communityWishSnapshot:
      entry.communityWishSnapshot ?? "No community wish recorded.",
  }));
  const latestSeason = seasonIndex.at(-1) ?? null;

  return (
    <main className={styles.page}>
      <section className={styles.hero}>
        <div className={styles.heroCopy}>
          <p className={styles.eyebrow}>History of seasons</p>
          <h1>Resolved seasons, winners, and tie-break receipts.</h1>
          <p>
            Review who won, when the cycle ended, what winner request was on
            file, whether the finish required tie-break logic, and which
            discoveries earned a permanent Hall of Fame entry.
          </p>
          <p>
            Winners may submit one bounded request per resolved cycle under the{" "}
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
        </div>

        <div className={styles.navRow}>
          <Link className={styles.linkButton} href="/">
            Back to battlefield
          </Link>
          <Link className={styles.linkButton} href={PATCH_NOTES_PAGE_HREF}>
            Open patch notes
          </Link>
          {session?.user?.role === "ADMIN" ? (
            <Link className={styles.linkButton} href="/admin">
              Open admin dashboard
            </Link>
          ) : null}
          <Link
            className={styles.linkButton}
            data-active={activeTab === "seasons" ? "true" : undefined}
            href="/history"
          >
            History of seasons
          </Link>
          <Link
            className={styles.linkButton}
            data-active={activeTab === "exploits" ? "true" : undefined}
            href="/history?tab=exploits"
          >
            Exploit Hall of Fame
          </Link>
        </div>
      </section>

      {error ? <p className={styles.errorBanner}>{error}</p> : null}
      {runtimeError ? (
        <p className={styles.errorBanner}>{runtimeError}</p>
      ) : null}
      {notice ? <p className={styles.noticeBanner}>{notice}</p> : null}

      {activeTab === "seasons" ? (
        <section className={styles.stack}>
          {latestSeason ? (
            <article className={styles.winnerSpotlight}>
              <span className={styles.sectionLabel}>Latest winner</span>
              <h2>{latestSeason.winnerLabel}</h2>
              <p>
                {latestSeason.winnerFortressName} won{" "}
                {latestSeason.seasonName} with {latestSeason.winningScore}{" "}
                points. The result is now recorded in season history.
              </p>
            </article>
          ) : null}

          {seasonIndex.length > 0 ? (
            <article className={styles.card}>
              <span className={styles.sectionLabel}>Seasons overview</span>
              <h2>Season winners and wishes</h2>
              <ul className={styles.seasonList}>
                {seasonIndex.map((season) => (
                  <li key={season.cycleId}>
                    <strong>{season.seasonName}</strong>
                    <span>
                      Winner: {season.winnerLabel} of{" "}
                      {season.winnerFortressName}
                    </span>
                    <span>Final score: {season.winningScore} points</span>
                    <span>Wish: {season.communityWishSnapshot}</span>
                  </li>
                ))}
              </ul>
            </article>
          ) : null}

          {seasonIndex.length === 0 ? (
            <article className={styles.card}>
              <span className={styles.sectionLabel}>No history yet</span>
              <h2>
                The archive will populate after the first resolved active cycle.
              </h2>
              <p>
                Once a cycle reaches resolution, this page will display the
                winner, score, request snapshot, and tie-break audit trail.
              </p>
            </article>
          ) : null}
        </section>
      ) : (
        <section className={styles.stack}>
          {EXPLOIT_HALL_OF_FAME_ENTRIES.length > 0 ? (
            EXPLOIT_HALL_OF_FAME_ENTRIES.map((entry) => (
              <article
                className={styles.card}
                key={`${entry.season}-${entry.exploitName}`}
              >
                <div className={styles.cardHeader}>
                  <div>
                    <span className={styles.sectionLabel}>
                      Season {entry.season}
                    </span>
                    <h2>{entry.exploitName}</h2>
                    <p>Discovered in the wild and recorded for posterity.</p>
                  </div>
                </div>

                <dl className={styles.metaList}>
                  <div>
                    <dt>Founder</dt>
                    <dd>{entry.founder}</dd>
                  </div>
                  <div>
                    <dt>First exploiter</dt>
                    <dd>{entry.firstExploiter}</dd>
                  </div>
                </dl>
              </article>
            ))
          ) : (
            <article className={styles.card}>
              <span className={styles.sectionLabel}>Exploit Hall of Fame</span>
              <h2>No entries yet.</h2>
              <p>
                Recorded discoveries will appear here after they are reviewed.
              </p>
            </article>
          )}
        </section>
      )}
    </main>
  );
}
