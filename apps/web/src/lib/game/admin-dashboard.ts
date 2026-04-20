import { prisma } from "@/lib/prisma";
import { type PrismaClient } from "@/lib/prisma-client";

export async function getAdminDashboardState({
  db = prisma,
}: {
  db?: PrismaClient;
} = {}) {
  const currentCycle = await db.cycle.findFirst({
    where: {
      resolvedAt: null,
    },
    orderBy: {
      createdAt: "desc",
    },
    include: {
      fortresses: {
        orderBy: [{ joinedAt: "asc" }, { id: "asc" }],
        select: {
          id: true,
          name: true,
          points: true,
          currentAction: true,
          mapX: true,
          mapY: true,
          joinedAt: true,
          owner: {
            select: {
              id: true,
              name: true,
              email: true,
              role: true,
            },
          },
          targetFortress: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      },
      winnerRequests: {
        orderBy: {
          createdAt: "desc",
        },
        take: 5,
        select: {
          id: true,
          status: true,
          createdAt: true,
          author: {
            select: {
              name: true,
              email: true,
            },
          },
        },
      },
      gameTicks: {
        orderBy: {
          tickAt: "desc",
        },
        take: 1,
        select: {
          tickAt: true,
        },
      },
      _count: {
        select: {
          chatMessages: true,
          scoreEvents: true,
          winnerRequests: true,
        },
      },
    },
  });

  const users = await db.user.findMany({
    orderBy: [{ role: "desc" }, { createdAt: "asc" }],
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      createdAt: true,
      fortresses: {
        where: {
          cycleId: currentCycle?.id ?? "__missing__",
        },
        take: 1,
        select: {
          id: true,
          name: true,
          points: true,
          currentAction: true,
          joinedAt: true,
        },
      },
    },
  });

  const recentHistory = await db.cycleHistory.findMany({
    orderBy: {
      endedAt: "desc",
    },
    take: 6,
    include: {
      winner: {
        select: {
          id: true,
          name: true,
          email: true,
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
    currentCycle: currentCycle
      ? {
          id: currentCycle.id,
          status: currentCycle.status,
          registrationEndsAt: currentCycle.registrationEndsAt,
          joiningLockedAt: currentCycle.joiningLockedAt,
          activeStartedAt: currentCycle.activeStartedAt,
          activeEndsAt: currentCycle.activeEndsAt,
          joinedCount: currentCycle.fortresses.length,
          lastProcessedTickAt: currentCycle.gameTicks[0]?.tickAt ?? null,
          chatMessageCount: currentCycle._count.chatMessages,
          scoreEventCount: currentCycle._count.scoreEvents,
          winnerRequestCount: currentCycle._count.winnerRequests,
          latestWinnerRequests: currentCycle.winnerRequests.map((request) => ({
            id: request.id,
            status: request.status,
            createdAt: request.createdAt,
            authorLabel:
              request.author.name ?? request.author.email ?? "Unknown player",
          })),
        }
      : null,
    players: users.map((user) => {
      const fortress = user.fortresses[0] ?? null;

      return {
        id: user.id,
        label: user.name ?? user.email ?? "Unnamed user",
        email: user.email,
        role: user.role,
        createdAt: user.createdAt,
        currentFortress: fortress
          ? {
              id: fortress.id,
              name: fortress.name,
              points: fortress.points,
              currentAction: fortress.currentAction,
              joinedAt: fortress.joinedAt,
            }
          : null,
      };
    }),
    fortresses: currentCycle?.fortresses.map((fortress) => ({
      id: fortress.id,
      name: fortress.name,
      ownerLabel:
        fortress.owner.name ?? fortress.owner.email ?? "Unknown player",
      ownerRole: fortress.owner.role,
      points: fortress.points,
      currentAction: fortress.currentAction,
      targetName: fortress.targetFortress?.name ?? null,
      joinedAt: fortress.joinedAt,
      mapLabel: `${fortress.mapX}, ${fortress.mapY}`,
    })) ?? [],
    recentHistory: recentHistory.map((entry) => ({
      id: entry.id,
      cycleId: entry.cycleId,
      winnerLabel: entry.winner.name ?? entry.winner.email ?? "Unknown winner",
      winnerFortressName:
        entry.cycle.fortresses.find(
          (fortress) => fortress.ownerId === entry.winner.id
        )?.name ?? "Unknown fortress",
      winningScore: entry.winningScore,
      endedAt: entry.endedAt,
      tieBreakSummary: entry.tieBreakSummary,
    })),
  };
}
