import { prisma } from "@/lib/prisma";
import { type PrismaClient } from "@/lib/prisma-client";
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
      cycle: {
        select: {
          fortresses: {
            select: {
              ownerId: true,
              commanderName: true,
              name: true,
            },
          },
        },
      },
    },
  });

  return {
    entries: entries.map((entry) => ({
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
      winningScore: entry.winningScore,
      endedAt: entry.endedAt,
      winnerRequestSnapshot:
        entry.winnerRequestSnapshot ?? entry.winnerRequest?.requestText ?? null,
      winnerRequestStatus: entry.winnerRequest?.status ?? null,
      winnerRequestReviewNotes: entry.winnerRequest?.reviewNotes ?? null,
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
    })),
    policyUrl: WINNER_REQUEST_POLICY_URL,
  };
}
