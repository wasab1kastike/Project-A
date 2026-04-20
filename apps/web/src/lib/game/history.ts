import { prisma } from "@/lib/prisma";
import { type PrismaClient } from "@/lib/prisma-client";

export async function getCycleHistoryPageState({
  db = prisma,
}: {
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
          name: true,
          email: true,
        },
      },
      winnerRequest: {
        select: {
          id: true,
          status: true,
          reviewNotes: true,
        },
      },
      cycle: {
        select: {
          fortresses: {
            select: {
              ownerId: true,
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
      winnerLabel: entry.winner.name ?? entry.winner.email ?? "Unknown winner",
      winnerFortressName:
        entry.cycle.fortresses.find(
          (fortress) => fortress.ownerId === entry.winner.id
        )?.name ?? "Unknown fortress",
      winningScore: entry.winningScore,
      endedAt: entry.endedAt,
      winnerRequestSnapshot: entry.winnerRequestSnapshot,
      winnerRequestStatus: entry.winnerRequest?.status ?? null,
      winnerRequestReviewNotes: entry.winnerRequest?.reviewNotes ?? null,
      tieBreakSummary: entry.tieBreakSummary,
    })),
  };
}
