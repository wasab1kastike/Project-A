import Link from "next/link";
import styles from "./page.module.css";
import { auth } from "@/auth";
import { getCycleHistoryPageState } from "@/lib/game/history";
import {
  saveCommunityWishVotesAction,
  submitCommunityWishProposalAction,
  submitWinnerRequestAction,
} from "./actions";
import { PATCH_NOTES_PAGE_HREF } from "@/lib/game/site-navigation";

export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

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

export default async function HistoryPage({
  searchParams,
}: {
  searchParams?: SearchParams;
}) {
  const session = await auth();
  const params = (await searchParams) ?? {};
  const error = getSearchValue(params.error);
  const notice = getSearchValue(params.notice);
  const state = await getCycleHistoryPageState({
    userId: session?.user?.id,
  });

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
        </div>
      </section>

      {error ? <p className={styles.errorBanner}>{error}</p> : null}
      {notice ? <p className={styles.noticeBanner}>{notice}</p> : null}

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
                  <dt>First slayer of A</dt>
                  <dd>
                    {entry.firstSlayerCommanderName && entry.firstSlayerFortressName
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
                <div>
                  <dt>Community wish</dt>
                  <dd>
                    {entry.communityWishSnapshot ??
                      entry.communityWishVotingMessage}
                  </dd>
                </div>
                <div>
                  <dt>Community wish status</dt>
                  <dd>
                    {entry.communityWishStatus}
                    {entry.communityWishProposalEndsAt
                      ? ` - proposals close ${formatDateTime(
                          entry.communityWishProposalEndsAt
                        )}`
                      : ""}
                    {entry.communityWishVotingEndsAt
                      ? ` - voting ends ${formatDateTime(
                          entry.communityWishVotingEndsAt
                        )}`
                      : ""}
                  </dd>
                </div>
              </dl>

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
                    <span className={styles.sectionLabel}>Community wish</span>
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
                    <input type="hidden" name="cycleId" value={entry.cycleId} />
                    <span className={styles.sectionLabel}>Community vote</span>
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
                <form action={submitWinnerRequestAction} className={styles.formStack}>
                  <input type="hidden" name="cycleId" value={entry.cycleId} />
                  <label className={styles.fieldStack} htmlFor={`request-${entry.id}`}>
                    <span className={styles.sectionLabel}>Winner request</span>
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
