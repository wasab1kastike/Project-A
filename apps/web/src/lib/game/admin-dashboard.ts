import { prisma } from "@/lib/prisma";
import { type PrismaClient } from "@/lib/prisma-client";
import { NPC_SYSTEM_USER_EMAIL } from "./constants";
import { classifyTickHealth, getActiveCycleMinutesBehind } from "./tick";
import { WINNER_REQUEST_POLICY_URL } from "./winner-requests";

export async function getAdminDashboardState({
  db = prisma,
  now = new Date(),
}: {
  db?: PrismaClient;
  now?: Date;
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
          ownerId: true,
          commanderName: true,
          name: true,
          points: true,
          isNpc: true,
          health: true,
          maxHealth: true,
          sizeTiles: true,
          iconLabel: true,
          currentAction: true,
          mapX: true,
          mapY: true,
          joinedAt: true,
          owner: {
            select: {
              id: true,
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
          authorId: true,
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
    where: {
      email: {
        not: NPC_SYSTEM_USER_EMAIL,
      },
    },
    orderBy: [{ role: "desc" }, { createdAt: "asc" }],
    select: {
      id: true,
      role: true,
      createdAt: true,
      fortresses: {
        where: {
          cycleId: currentCycle?.id ?? "__missing__",
        },
        take: 1,
        select: {
          id: true,
          ownerId: true,
          commanderName: true,
          name: true,
          points: true,
          isNpc: true,
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

  const recentWinnerRequests = await db.winnerRequest.findMany({
    orderBy: {
      createdAt: "desc",
    },
    take: 8,
    select: {
      id: true,
      cycleId: true,
      authorId: true,
      requestText: true,
      status: true,
      reviewNotes: true,
      createdAt: true,
      reviewedAt: true,
      reviewedBy: {
        select: {
          id: true,
        },
      },
      cycle: {
        select: {
          resolvedAt: true,
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

  const activeMinutesBehind =
    currentCycle?.status === "ACTIVE"
      ? getActiveCycleMinutesBehind({
          activeStartedAt: currentCycle.activeStartedAt,
          lastProcessedTickAt: currentCycle.gameTicks[0]?.tickAt ?? null,
          now,
        })
      : 0;

  return {
    currentCycle: currentCycle
      ? {
          tickHealth: classifyTickHealth(activeMinutesBehind),
          minutesBehind: activeMinutesBehind,
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
              currentCycle.fortresses.find(
                (fortress) => fortress.ownerId === request.authorId
              )?.commanderName ?? "Unknown player",
          })),
        }
      : null,
    players: users.map((user) => {
      const fortress = user.fortresses[0] ?? null;

      return {
        id: user.id,
        label: fortress?.commanderName ?? "Signed in user",
        role: user.role,
        createdAt: user.createdAt,
        currentFortress: fortress
          ? {
              id: fortress.id,
              commanderName: fortress.commanderName,
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
      ownerLabel: fortress.commanderName,
      ownerRole: fortress.owner.role,
      points: fortress.points,
      isNpc: fortress.isNpc,
      health: fortress.health,
      maxHealth: fortress.maxHealth,
      sizeTiles: fortress.sizeTiles,
      iconLabel: fortress.iconLabel,
      currentAction: fortress.currentAction,
      targetName: fortress.targetFortress?.name ?? null,
      joinedAt: fortress.joinedAt,
      mapLabel: `${fortress.mapX}, ${fortress.mapY}`,
    })) ?? [],
    recentHistory: recentHistory.map((entry) => ({
      id: entry.id,
      cycleId: entry.cycleId,
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
      tieBreakSummary: entry.tieBreakSummary,
    })),
    winnerRequests: recentWinnerRequests.map((request) => ({
      id: request.id,
      cycleId: request.cycleId,
      authorLabel:
        request.cycle.fortresses.find(
          (fortress) => fortress.ownerId === request.authorId
        )?.commanderName ?? "Unknown player",
      winnerFortressName:
        request.cycle.fortresses.find(
          (fortress) => fortress.ownerId === request.authorId
        )?.name ?? "Unknown fortress",
      requestText: request.requestText,
      status: request.status,
      reviewNotes: request.reviewNotes,
      createdAt: request.createdAt,
      reviewedAt: request.reviewedAt,
      reviewedByLabel: request.reviewedBy ? "Admin reviewer" : null,
      resolvedAt: request.cycle.resolvedAt,
    })),
    policyUrl: WINNER_REQUEST_POLICY_URL,
  };
}
