import { prisma } from "@/lib/prisma";
import { CommunityWishStatus, type PrismaClient } from "@/lib/prisma-client";
import { getCommunityWishVoteBudget } from "./community-wishes";
import { COMMUNITY_WISH_MAX_LENGTH } from "./community-wishes";
import { WINNER_REQUEST_POLICY_URL } from "./winner-requests";

export async function getCycleHistoryPageState({
  userId,
  db = prisma,
}: {
  userId?: string;
  db?: PrismaClient;
} = {}) {
  const entries = await db.cycleHistory.findMany({
    orderBy: {
      endedAt: "desc",
    },
    include: {
      winner: {
        select: {
          id: true,
        },
      },
      winnerRequest: {
        select: {
          id: true,
          authorId: true,
          requestText: true,
          status: true,
          reviewNotes: true,
        },
      },
      communityWishProposal: {
        select: {
          id: true,
          authorId: true,
          requestText: true,
          status: true,
        },
      },
      cycle: {
        select: {
          fortresses: {
            select: {
              ownerId: true,
              commanderName: true,
              name: true,
            },
          },
          communityWishProposals: {
            orderBy: [{ createdAt: "asc" }, { id: "asc" }],
            select: {
              id: true,
              authorId: true,
              requestText: true,
              status: true,
              reviewNotes: true,
              votes: {
                select: {
                  voterId: true,
                  votes: true,
                },
              },
            },
          },
        },
      },
    },
  });

  const budgets = new Map<
    string,
    {
      canVote: boolean;
      voteBudget: number;
      usedVotes: number;
      remainingVotes: number;
      reason: string | null;
    }
  >();

  if (userId) {
    await Promise.all(
      entries.map(async (entry) => {
        budgets.set(
          entry.cycleId,
          await getCommunityWishVoteBudget({
            cycleId: entry.cycleId,
            userId,
            db,
          })
        );
      })
    );
  }

  return {
    entries: entries.map((entry) => {
      const budget = budgets.get(entry.cycleId) ?? {
        canVote: false,
        voteBudget: 0,
        usedVotes: 0,
        remainingVotes: 0,
        reason: userId
          ? "Only players from this resolved cycle can vote."
          : "Sign in as a cycle player to vote on the community wish.",
      };
      const votingOpen =
        entry.communityWishStatus === CommunityWishStatus.OPEN &&
        entry.communityWishVotingEndsAt !== null &&
        entry.communityWishVotingEndsAt > new Date();
      const userVotes = new Map(
        entry.cycle.communityWishProposals.map((proposal) => [
          proposal.id,
          proposal.votes
            .filter((vote) => vote.voterId === userId)
            .reduce((sum, vote) => sum + vote.votes, 0),
        ])
      );
      const communityWishWinnerAuthorLabel = entry.communityWishProposal
        ? (entry.cycle.fortresses.find(
            (fortress) =>
              fortress.ownerId === entry.communityWishProposal?.authorId
          )?.commanderName ?? "Unknown player")
        : null;

      return {
      id: entry.id,
      cycleId: entry.cycleId,
      winnerId: entry.winner.id,
      winnerLabel:
        entry.cycle.fortresses.find(
          (fortress) => fortress.ownerId === entry.winner.id
        )?.commanderName ?? "Unknown winner",
      winnerFortressName:
        entry.cycle.fortresses.find(
          (fortress) => fortress.ownerId === entry.winner.id
      )?.name ?? "Unknown fortress",
      firstSlayerCommanderName: entry.firstSlayerCommanderName,
      firstSlayerFortressName: entry.firstSlayerFortressName,
      winningScore: entry.winningScore,
      endedAt: entry.endedAt,
      winnerRequestSnapshot:
        entry.winnerRequestSnapshot ?? entry.winnerRequest?.requestText ?? null,
      winnerRequestStatus: entry.winnerRequest?.status ?? null,
      winnerRequestReviewNotes: entry.winnerRequest?.reviewNotes ?? null,
      communityWishStatus: entry.communityWishStatus,
      communityWishProposalEndsAt: entry.communityWishProposalEndsAt,
      communityWishVotingEndsAt: entry.communityWishVotingEndsAt,
      communityWishResolvedAt: entry.communityWishResolvedAt,
      communityWishSnapshot:
        entry.communityWishSnapshot ??
        (entry.communityWishProposal
          ? `${communityWishWinnerAuthorLabel}: ${entry.communityWishProposal.requestText}`
          : null) ??
        null,
      communityWishVoteCount: entry.communityWishVoteCount,
      communityWishCanVote:
        Boolean(userId) &&
        votingOpen &&
        budget.canVote &&
        entry.cycle.communityWishProposals.length > 0,
      communityWishVoteBudget: budget.voteBudget,
      communityWishUsedVotes: budget.usedVotes,
      communityWishRemainingVotes: budget.remainingVotes,
      communityWishCanSubmitProposal:
        Boolean(userId) &&
        entry.communityWishStatus === CommunityWishStatus.PROPOSALS_OPEN &&
        entry.communityWishProposalEndsAt !== null &&
        entry.communityWishProposalEndsAt > new Date() &&
        entry.cycle.fortresses.some((fortress) => fortress.ownerId === userId),
      currentUserCommunityWish:
        entry.cycle.communityWishProposals.find(
          (proposal) => proposal.authorId === userId
        )?.requestText ?? "",
      communityWishMaxLength: COMMUNITY_WISH_MAX_LENGTH,
      communityWishVotingMessage:
        entry.communityWishStatus === CommunityWishStatus.NO_PROPOSALS
          ? "No community wish proposals were submitted for this cycle."
          : entry.communityWishStatus === CommunityWishStatus.PROPOSALS_OPEN
            ? "Community wish proposals are open until Monday 12:00. Voting opens after proposals close."
          : entry.communityWishStatus === CommunityWishStatus.RESOLVED
            ? "Community wish voting has been resolved."
            : entry.communityWishStatus === CommunityWishStatus.TIE_REQUIRES_ADMIN
              ? "Community wish voting ended in a tie. Admin resolution is required."
              : !votingOpen
                ? "Community wish voting is closed."
                : budget.reason ??
                  "Allocate your community wish votes. You can change them until voting ends.",
      communityWishProposals: entry.cycle.communityWishProposals.map(
        (proposal) => ({
          id: proposal.id,
          requestText: proposal.requestText,
          status: proposal.status,
          reviewNotes: proposal.reviewNotes,
          authorLabel:
            proposal.authorId === userId ? "Your wish" : "Community wish",
          voteCount: proposal.votes.reduce((sum, vote) => sum + vote.votes, 0),
          currentUserVotes: userVotes.get(proposal.id) ?? 0,
          isVoteEligible: proposal.status !== "REJECTED",
        })
      ),
      tieBreakSummary: entry.tieBreakSummary,
      canSubmitWinnerRequest:
        Boolean(userId) &&
        entry.winner.id === userId &&
        entry.winnerRequest === null,
      submissionEligibilityMessage:
        !userId
          ? "Sign in as the recorded winner to submit a request."
          : entry.winner.id !== userId
            ? "Only the recorded winner can submit a request for this cycle."
            : entry.winnerRequest
              ? "This cycle already has a stored winner request."
              : "You may submit one bounded winner request for this cycle.",
      };
    }),
    policyUrl: WINNER_REQUEST_POLICY_URL,
  };
}
