import { prisma } from "@/lib/prisma";
import { CycleStatus, type PrismaClient } from "@/lib/prisma-client";
import { ACTIVE_PLAYER_CAP } from "./constants";
import { getChatLimits } from "./chat";

export type HomePageState = Awaited<ReturnType<typeof getHomePageState>>;

function compareByLeaderboardOrder(
  left: {
    points: number;
    joinedAt: Date;
    name: string;
  },
  right: {
    points: number;
    joinedAt: Date;
    name: string;
  }
) {
  if (left.points !== right.points) {
    return right.points - left.points;
  }

  const joinedDelta = left.joinedAt.getTime() - right.joinedAt.getTime();

  if (joinedDelta !== 0) {
    return joinedDelta;
  }

  return left.name.localeCompare(right.name);
}

export async function getHomePageState({
  userId,
  now = new Date(),
  db = prisma,
}: {
  userId?: string;
  now?: Date;
  db?: PrismaClient;
}) {
  const cycle = await db.cycle.findFirst({
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
          name: true,
          points: true,
          currentAction: true,
          targetFortressId: true,
          mapX: true,
          mapY: true,
          joinedAt: true,
        },
      },
      chatMessages: {
        orderBy: {
          createdAt: "desc",
        },
        take: getChatLimits().limit,
        select: {
          id: true,
          body: true,
          createdAt: true,
          author: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
      },
    },
  });

  if (!cycle) {
    return {
      isSpectator: true,
      cycle: null,
      phase: null,
      playerFortress: null,
      playerSummary: null,
      leaderboard: [],
      mapFortresses: [],
      chat: {
        messages: [],
        canPost: false,
        maxLength: getChatLimits().maxLength,
        postHint: "Chat unlocks once the next unresolved cycle exists.",
      },
      availableTargets: [],
      canJoinRegistration: false,
      canEditRegistrationName: false,
      emptyStateMessage:
        "No unresolved cycle exists yet. Run the seed flow to bootstrap registration.",
    };
  }

  const joinedCount = cycle.fortresses.length;
  const remainingSlots = Math.max(0, ACTIVE_PLAYER_CAP - joinedCount);
  const playerFortress =
    cycle.fortresses.find((fortress) => fortress.ownerId === userId) ?? null;
  const registrationOpen =
    cycle.status === CycleStatus.REGISTRATION && cycle.registrationEndsAt > now;
  const joiningLocked = Boolean(cycle.joiningLockedAt);
  const activeOpen =
    cycle.status === CycleStatus.ACTIVE &&
    cycle.activeEndsAt !== null &&
    cycle.activeEndsAt > now;
  const deadline =
    cycle.status === CycleStatus.REGISTRATION
      ? cycle.registrationEndsAt
      : cycle.activeEndsAt;
  const sortedFortresses = [...cycle.fortresses].sort(compareByLeaderboardOrder);
  const targetLookup = new Map(
    cycle.fortresses.map((fortress) => [fortress.id, fortress])
  );
  const playerFortressId = playerFortress?.id ?? null;
  const mapFortresses = cycle.fortresses.map((fortress) => ({
    id: fortress.id,
    name: fortress.name,
    points: fortress.points,
    currentAction: fortress.currentAction,
    mapX: fortress.mapX,
    mapY: fortress.mapY,
    isCurrentUser: fortress.ownerId === userId,
    isTargetable:
      playerFortressId !== null &&
      activeOpen &&
      fortress.id !== playerFortressId,
  }));
  const chatMessages = [...cycle.chatMessages]
    .reverse()
    .map((message) => ({
      id: message.id,
      body: message.body,
      createdAt: message.createdAt,
      authorName:
        message.author.name ?? "Unknown commander",
      isCurrentUser: message.author.id === userId,
    }));

  return {
    isSpectator: !playerFortress,
    cycle: {
      id: cycle.id,
      status: cycle.status,
      registrationEndsAt: cycle.registrationEndsAt,
      joiningLockedAt: cycle.joiningLockedAt,
      activeEndsAt: cycle.activeEndsAt,
      joinedCount,
      remainingSlots,
      deadline,
      phaseDescription:
        cycle.status === CycleStatus.REGISTRATION
          ? joiningLocked
            ? "Registration time is still running, but an admin has temporarily locked new joins. Existing participants can still review the lobby and edit their fortress name."
            : "Players can join the upcoming season and set their fortress name."
          : "Joined fortresses can grow, attack, and spend points on renames.",
      statusMessage:
        cycle.status === CycleStatus.REGISTRATION
          ? registrationOpen && joiningLocked
            ? "Registration remains open on the clock, but new joins are currently locked by admin action."
            : registrationOpen
            ? "Registration is open. Joining creates your fortress immediately and reserves one of the 30 season slots."
            : "Registration has expired. The next game tick will either restart registration or move the cycle into ACTIVE."
          : activeOpen
            ? "The active season is running. Action changes persist until you change them again."
            : "The ACTIVE deadline has passed. The next game tick will resolve the winner and open the next registration cycle.",
    },
    phase: {
      status: cycle.status,
      deadline,
      isOpen: cycle.status === CycleStatus.REGISTRATION ? registrationOpen : activeOpen,
      label:
        cycle.status === CycleStatus.REGISTRATION
          ? registrationOpen && joiningLocked
            ? "Registration locked"
            : registrationOpen
            ? "Registration open"
            : "Registration expired"
          : activeOpen
            ? "Active season"
            : "Awaiting next tick",
    },
    playerFortress: playerFortress
      ? {
          id: playerFortress.id,
          name: playerFortress.name,
          points: playerFortress.points,
          currentAction: playerFortress.currentAction,
          mapX: playerFortress.mapX,
          mapY: playerFortress.mapY,
          targetFortress:
            playerFortress.targetFortressId
              ? cycle.fortresses.find(
                  (fortress) => fortress.id === playerFortress.targetFortressId
                ) ?? null
              : null,
        }
      : null,
    playerSummary: playerFortress
      ? {
          id: playerFortress.id,
          name: playerFortress.name,
          points: playerFortress.points,
          currentAction: playerFortress.currentAction,
          currentTargetId: playerFortress.targetFortressId,
          currentTargetName: playerFortress.targetFortressId
            ? targetLookup.get(playerFortress.targetFortressId)?.name ?? null
            : null,
          canRename: activeOpen && playerFortress.points >= 10,
          canSetAction: activeOpen,
        }
      : null,
    leaderboard: sortedFortresses.slice(0, 3).map((fortress, index) => ({
      id: fortress.id,
      name: fortress.name,
      points: fortress.points,
      rank: index + 1,
      isCurrentUser: fortress.ownerId === userId,
    })),
    mapFortresses,
    chat: {
      messages: chatMessages,
      canPost: Boolean(userId),
      maxLength: getChatLimits().maxLength,
      postHint: userId
        ? null
        : "Sign in with Google to post in chat. You can still watch the conversation in read-only mode.",
    },
    availableTargets:
      activeOpen && playerFortress
        ? cycle.fortresses
            .filter((fortress) => fortress.id !== playerFortress.id)
            .map((fortress) => ({
              id: fortress.id,
              name: fortress.name,
              points: fortress.points,
              currentAction: fortress.currentAction,
            }))
        : [],
    canJoinRegistration:
      Boolean(userId) &&
      registrationOpen &&
      !joiningLocked &&
      !playerFortress &&
      remainingSlots > 0,
    canEditRegistrationName:
      Boolean(userId) && registrationOpen && Boolean(playerFortress),
    emptyStateMessage: null,
  };
}
