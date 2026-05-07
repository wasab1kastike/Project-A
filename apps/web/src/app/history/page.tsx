import Link from "next/link";
import styles from "./page.module.css";
import { auth } from "@/auth";
import { EXPLOIT_HALL_OF_FAME_ENTRIES } from "@/lib/game/exploit-hall-of-fame";
import { getCycleHistoryPageState } from "@/lib/game/history";
import {
  saveCommunityWishVotesAction,
  submitCommunityWishProposalAction,
  submitWinnerRequestAction,
} from "./actions";
import { PATCH_NOTES_PAGE_HREF } from "@/lib/game/site-navigation";

export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;
type HistoryTab = "cycles" | "exploits";

const dateTimeFormatter = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "short",
});

function formatDateTime(value: Date) {
  return dateTimeFormatter.format(value);
}

function getSearchValue(
  value: string | string[] | undefined
): string | undefined {
  if (Array.isArray(value)) {
    return value[0];
  }

  return value;
}

function getHistoryTab(value: string | string[] | undefined): HistoryTab {
  return getSearchValue(value) === "exploits" ? "exploits" : "cycles";
}

function ProgressBar({ label, progress }: { label: string; progress: number }) {
  const normalizedProgress = normalizeProgress(progress);
  const progressState =
    normalizedProgress >= 100
      ? "complete"
      : normalizedProgress <= 0
        ? "empty"
        : "active";

  return (
    <div className={styles.progressWrap} data-progress-state={progressState}>
      <div
        className={styles.progressBar}
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

function formatSeasonName(seasonNumber: number) {
  const seasonNames = [
    "One",
    "Two",
    "Three",
    "Four",
    "Five",
    "Six",
    "Seven",
    "Eight",
    "Nine",
    "Ten",
  ];

  const suffix = seasonNames[seasonNumber - 1] ?? String(seasonNumber);
  return `Season ${suffix}`;
}

export default async function HistoryPage({
  searchParams,
}: {
  searchParams?: SearchParams;
}) {
  const session = await auth();
  const params = (await searchParams) ?? {};
  const error = getSearchValue(params.error);
  const notice = getSearchValue(params.notice);
  const activeTab = getHistoryTab(params.tab);
  const state = await getCycleHistoryPageState({
    userId: session?.user?.id,
  });
  const seasonIndex = [...state.entries]
    .reverse()
    .map((entry, index) => ({
      cycleId: entry.cycleId,
      seasonName: formatSeasonName(index + 1),
      winnerFortressName: entry.winnerFortressName,
      communityWishSnapshot:
        entry.communityWishSnapshot ?? "No community wish recorded.",
    }));

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
            data-active={activeTab === "cycles" ? "true" : undefined}
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
      {notice ? <p className={styles.noticeBanner}>{notice}</p> : null}

      {activeTab === "cycles" ? (
        <section className={styles.stack}>
          {seasonIndex.length > 0 ? (
            <article className={styles.card}>
              <span className={styles.sectionLabel}>Seasons overview</span>
              <h2>Season winners and wishes</h2>
              <ul className={styles.seasonList}>
                {seasonIndex.map((season) => (
                  <li key={season.cycleId}>
                    <strong>{season.seasonName}</strong>
                    <span>Winner fortress: {season.winnerFortressName}</span>
                    <span>Wish: {season.communityWishSnapshot}</span>
                  </li>
                ))}
              </ul>
            </article>
          ) : null}

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
                    <dt>First slayer of A</dt>
                    <dd>
                      {entry.firstSlayerCommanderName &&
                      entry.firstSlayerFortressName
                        ? `${entry.firstSlayerCommanderName} - ${entry.firstSlayerFortressName}`
                        : "No first slayer of A recorded for this cycle."}
                    </dd>
                  </div>
                  <div>
                    <dt>Winner request</dt>
                    <dd>
                      {entry.winnerRequestSnapshot ??
                        "No winner request was stored for this cycle."}
                    </dd>
                  </div>
                  <div>
                    <dt>Request status</dt>
                    <dd className={styles.requestStatus}>
                      <span>
                        {entry.winnerRequestStatus ?? "No linked request"}
                      </span>
                      <ProgressBar
                        label="Winner request"
                        progress={entry.winnerRequestFulfillmentProgress}
                      />
                    </dd>
                  </div>
                  <div>
                    <dt>Tie-break</dt>
                    <dd>
                      {entry.tieBreakSummary ?? "No tie-break summary stored."}
                    </dd>
                  </div>
                  <div>
                    <dt>Review notes</dt>
                    <dd>
                      {entry.winnerRequestReviewNotes ?? "No review notes."}
                    </dd>
                  </div>
                </dl>

                <section className={styles.communityArchive}>
                  <div className={styles.archiveHeader}>
                    <div>
                      <span className={styles.sectionLabel}>
                        Community voted wish
                      </span>
                      <h3>
                        {entry.communityWishSnapshot ??
                          entry.communityWishVotingMessage}
                      </h3>
                    </div>
                    <div className={styles.archiveStatus}>
                      <strong>{entry.communityWishStatus}</strong>
                      <span>{entry.communityWishVoteCount} votes</span>
                    </div>
                  </div>
                  <ProgressBar
                    label="Community voted wish"
                    progress={entry.communityWishFulfillmentProgress}
                  />
                  <p className={styles.helperText}>
                    {entry.communityWishResolvedAt
                      ? `Resolved ${formatDateTime(entry.communityWishResolvedAt)}`
                      : entry.communityWishProposalEndsAt ||
                          entry.communityWishVotingEndsAt
                        ? `${entry.communityWishProposalEndsAt ? `Proposals close ${formatDateTime(entry.communityWishProposalEndsAt)}` : ""}${
                            entry.communityWishProposalEndsAt &&
                            entry.communityWishVotingEndsAt
                              ? " - "
                              : ""
                          }${entry.communityWishVotingEndsAt ? `Voting ends ${formatDateTime(entry.communityWishVotingEndsAt)}` : ""}`
                        : "No community wish resolution time recorded."}
                  </p>
                </section>

                {entry.communityWishProposalOpen ? (
                  <form
                    action={submitCommunityWishProposalAction}
                    className={styles.formStack}
                  >
                    <input type="hidden" name="cycleId" value={entry.cycleId} />
                    <label
                      className={styles.fieldStack}
                      htmlFor={`community-wish-${entry.id}`}
                    >
                      <span className={styles.sectionLabel}>
                        Community wish
                      </span>
                      <textarea
                        id={`community-wish-${entry.id}`}
                        name="requestText"
                        rows={3}
                        maxLength={entry.communityWishMaxLength}
                        placeholder="Add more troop types"
                        defaultValue={entry.currentUserCommunityWish}
                        disabled={!entry.communityWishCanSubmitProposal}
                        required
                      />
                    </label>
                    <p className={styles.helperText}>
                      {entry.communityWishCanSubmitProposal
                        ? `Add or edit one short English wish until Monday 12:00. Voting is already open and ends Monday 24:00. Max ${entry.communityWishMaxLength} characters.`
                        : entry.communityWishVotingMessage}
                    </p>
                    {entry.communityWishCanSubmitProposal ? (
                      <button className={styles.primaryButton} type="submit">
                        Save community wish
                      </button>
                    ) : null}
                  </form>
                ) : null}

                {entry.communityWishStatus === "OPEN" &&
                entry.communityWishProposals.length > 0 ? (
                  <details className={styles.voteDisclosure}>
                    <summary className={styles.disclosureButton}>
                      Open community vote
                      <span>{entry.communityWishProposals.length} wishes</span>
                    </summary>
                    <form
                      action={saveCommunityWishVotesAction}
                      className={styles.formStack}
                    >
                      <input
                        type="hidden"
                        name="cycleId"
                        value={entry.cycleId}
                      />
                      <span className={styles.sectionLabel}>
                        Community vote
                      </span>
                      <p className={styles.helperText}>
                        {entry.communityWishCanVote
                          ? `You have ${entry.communityWishVoteBudget} votes. ${entry.communityWishUsedVotes} currently allocated. You can change them until voting ends.`
                          : entry.communityWishVotingMessage}
                      </p>
                      <div className={styles.voteList}>
                        {entry.communityWishProposals.map((proposal) => (
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
                                  ? entry.communityWishVoteBudget
                                  : 0
                              }
                              defaultValue={proposal.currentUserVotes}
                              disabled={
                                !entry.communityWishCanVote ||
                                !proposal.isVoteEligible
                              }
                            />
                          </label>
                        ))}
                      </div>
                      {entry.communityWishCanVote ? (
                        <button className={styles.primaryButton} type="submit">
                          Save community votes
                        </button>
                      ) : null}
                    </form>
                  </details>
                ) : null}

                {entry.canSubmitWinnerRequest ? (
                  <form
                    action={submitWinnerRequestAction}
                    className={styles.formStack}
                  >
                    <input type="hidden" name="cycleId" value={entry.cycleId} />
                    <label
                      className={styles.fieldStack}
                      htmlFor={`request-${entry.id}`}
                    >
                      <span className={styles.sectionLabel}>
                        Winner request
                      </span>
                      <textarea
                        id={`request-${entry.id}`}
                        name="requestText"
                        rows={5}
                        maxLength={600}
                        placeholder="Describe one bounded gameplay-safe change for a future update."
                        required
                      />
                    </label>
                    <p className={styles.helperText}>
                      One request only. Keep it to one bounded change, avoid
                      direct self-buffs or player-targeted nerfs, and do not ask
                      for more wishes, automatic code, PR, or deploy work.{" "}
                      <a
                        className={styles.inlineLink}
                        href={state.policyUrl}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Read the full policy
                      </a>
                      .
                    </p>
                    <button className={styles.primaryButton} type="submit">
                      Submit request
                    </button>
                  </form>
                ) : (
                  <p className={styles.helperText}>
                    {entry.submissionEligibilityMessage}
                  </p>
                )}
              </article>
            ))
          ) : (
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
          )}
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
