import { prisma } from "@/lib/prisma";
import { CycleStatus, type PrismaClient } from "@/lib/prisma-client";
import { ACTIVE_PLAYER_CAP } from "./constants";
import { getChatLimits } from "./chat";
import { normalizeUnitSpriteVariant } from "./attacks";

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

function getDisplayName(name: string, isCrowned: boolean) {
  void isCrowned;
  return name;
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
          commanderName: true,
          commanderNameRegisteredAt: true,
          name: true,
          points: true,
          currentAction: true,
          targetFortressId: true,
          unitSpriteVariant: true,
          isNpc: true,
          health: true,
          maxHealth: true,
          sizeTiles: true,
          iconLabel: true,
          mapX: true,
          mapY: true,
          joinedAt: true,
        },
      },
      attackUnits: {
        where: {
          resolvedAt: null,
          cancelledAt: null,
        },
        orderBy: [{ launchedAt: "asc" }, { id: "asc" }],
        select: {
          id: true,
          launchedAt: true,
          arrivesAt: true,
          attackerFortress: {
            select: {
              id: true,
              name: true,
              mapX: true,
              mapY: true,
              unitSpriteVariant: true,
            },
          },
          targetFortress: {
            select: {
              id: true,
              name: true,
              mapX: true,
              mapY: true,
            },
          },
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
      attackUnits: [],
      chat: {
        messages: [],
        canPost: false,
        maxLength: getChatLimits().maxLength,
        postHint: "Chat unlocks once the next unresolved cycle exists.",
      },
      availableTargets: [],
      canJoinCycle: false,
      canEditRegistrationName: false,
      emptyStateMessage:
        "No unresolved cycle exists yet. Run the seed flow to bootstrap registration.",
    };
  }

  const playerFortresses = cycle.fortresses.filter(
    (fortress) => !fortress.isNpc
  );
  const joinedCount = playerFortresses.length;
  const remainingSlots = Math.max(0, ACTIVE_PLAYER_CAP - joinedCount);
  const playerFortress =
    playerFortresses.find((fortress) => fortress.ownerId === userId) ?? null;
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
  const sortedFortresses = [...playerFortresses].sort(
    compareByLeaderboardOrder
  );
  const targetLookup = new Map(
    cycle.fortresses.map((fortress) => [fortress.id, fortress])
  );
  const playerFortressId = playerFortress?.id ?? null;
  const commanderNameByOwnerId = new Map(
    playerFortresses.map((fortress) => [
      fortress.ownerId,
      getDisplayName(
        fortress.commanderName,
        fortress.id === cycle.crownedFortressId
      ),
    ])
  );
  const mapFortresses = cycle.fortresses.map((fortress) => ({
    id: fortress.id,
    commanderName: getDisplayName(
      fortress.commanderName,
      fortress.id === cycle.crownedFortressId && !fortress.isNpc
    ),
    name: getDisplayName(
      fortress.name,
      fortress.id === cycle.crownedFortressId && !fortress.isNpc
    ),
    rawName: fortress.name,
    points: fortress.points,
    isNpc: fortress.isNpc,
    health: fortress.health,
    maxHealth: fortress.maxHealth,
    sizeTiles: fortress.sizeTiles,
    iconLabel: fortress.iconLabel,
    isCrowned: fortress.id === cycle.crownedFortressId && !fortress.isNpc,
    currentAction: fortress.currentAction,
    mapX: fortress.mapX,
    mapY: fortress.mapY,
    unitSpriteVariant: normalizeUnitSpriteVariant(fortress.unitSpriteVariant),
    isCurrentUser: fortress.ownerId === userId,
    isTargetable:
      playerFortressId !== null &&
      activeOpen &&
      fortress.id !== playerFortressId,
  }));
  const chatMessages = [...cycle.chatMessages].reverse().map((message) => ({
    id: message.id,
    body: message.body,
    createdAt: message.createdAt,
    authorName: commanderNameByOwnerId.get(message.author.id) ?? "Spectator",
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
            ? "Registration time is still running, but joins are currently locked by admin action."
            : "Players can join the upcoming season and set their fortress name."
          : activeOpen
            ? "The season is live. New players can still join this cycle while slots remain."
            : "The active season is closing. New joins are blocked until the next cycle opens.",
      statusMessage:
        cycle.status === CycleStatus.REGISTRATION
          ? registrationOpen && joiningLocked
            ? "Registration remains open on the clock, but new joins are currently locked by admin action."
            : registrationOpen
              ? "Registration is open. Joining creates your fortress immediately and reserves one of the 30 season slots."
              : "Registration has expired. The next game tick will either restart registration or move the cycle into ACTIVE."
          : joiningLocked
            ? "The season is active, but joining is currently locked by admin action."
            : activeOpen && remainingSlots > 0
              ? "The active season is running. New commanders can still join this season while slots are available."
              : activeOpen
                ? "The active season is running, but all player slots are filled. Joining is closed for this cycle."
                : "The ACTIVE deadline has passed. Joining is closed until the next registration cycle opens.",
    },
    phase: {
      status: cycle.status,
      deadline,
      isOpen:
        cycle.status === CycleStatus.REGISTRATION
          ? registrationOpen
          : activeOpen,
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
          commanderName: getDisplayName(
            playerFortress.commanderName,
            playerFortress.id === cycle.crownedFortressId
          ),
          canRegisterCommanderName:
            playerFortress.commanderNameRegisteredAt === null,
          name: getDisplayName(
            playerFortress.name,
            playerFortress.id === cycle.crownedFortressId
          ),
          rawName: playerFortress.name,
          points: playerFortress.points,
          currentAction: playerFortress.currentAction,
          mapX: playerFortress.mapX,
          mapY: playerFortress.mapY,
          targetFortress: playerFortress.targetFortressId
            ? (cycle.fortresses.find(
                (fortress) => fortress.id === playerFortress.targetFortressId
              ) ?? null)
            : null,
        }
      : null,
    playerSummary: playerFortress
      ? {
          id: playerFortress.id,
          commanderName: getDisplayName(
            playerFortress.commanderName,
            playerFortress.id === cycle.crownedFortressId
          ),
          canRegisterCommanderName:
            playerFortress.commanderNameRegisteredAt === null,
          name: getDisplayName(
            playerFortress.name,
            playerFortress.id === cycle.crownedFortressId
          ),
          rawName: playerFortress.name,
          points: playerFortress.points,
          currentAction: playerFortress.currentAction,
          currentTargetId: playerFortress.targetFortressId,
          currentTargetName: playerFortress.targetFortressId
            ? (() => {
                const target = targetLookup.get(playerFortress.targetFortressId);

                return target ? target.name : null;
              })()
            : null,
          isCrowned: playerFortress.id === cycle.crownedFortressId,
          canRename: activeOpen && playerFortress.points >= 10,
          canSetAction: activeOpen,
        }
      : null,
    leaderboard: sortedFortresses.slice(0, 3).map((fortress, index) => ({
      id: fortress.id,
      commanderName: getDisplayName(
        fortress.commanderName,
        fortress.id === cycle.crownedFortressId
      ),
      name: getDisplayName(fortress.name, fortress.id === cycle.crownedFortressId),
      rawName: fortress.name,
      points: fortress.points,
      rank: index + 1,
      isCrowned: fortress.id === cycle.crownedFortressId,
      isCurrentUser: fortress.ownerId === userId,
    })),
    mapFortresses,
    attackUnits: cycle.attackUnits.map((unit) => ({
      id: unit.id,
      launchedAt: unit.launchedAt,
      arrivesAt: unit.arrivesAt,
      attacker: {
        id: unit.attackerFortress.id,
        name: unit.attackerFortress.name,
        mapX: unit.attackerFortress.mapX,
        mapY: unit.attackerFortress.mapY,
        unitSpriteVariant: normalizeUnitSpriteVariant(
          unit.attackerFortress.unitSpriteVariant
        ),
      },
      target: {
        id: unit.targetFortress.id,
        name: unit.targetFortress.name,
        mapX: unit.targetFortress.mapX,
        mapY: unit.targetFortress.mapY,
      },
    })),
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
              commanderName: getDisplayName(
                fortress.commanderName,
                fortress.id === cycle.crownedFortressId && !fortress.isNpc
              ),
              name: getDisplayName(
                fortress.name,
                fortress.id === cycle.crownedFortressId && !fortress.isNpc
              ),
              rawName: fortress.name,
              points: fortress.points,
              isNpc: fortress.isNpc,
              health: fortress.health,
              maxHealth: fortress.maxHealth,
              currentAction: fortress.currentAction,
            }))
        : [],
    canJoinCycle:
      Boolean(userId) &&
      (registrationOpen || activeOpen) &&
      !joiningLocked &&
      !playerFortress &&
      remainingSlots > 0,
    canEditRegistrationName:
      Boolean(userId) && registrationOpen && Boolean(playerFortress),
    emptyStateMessage: null,
  };
}
