import { prisma } from "@/lib/prisma";
import {
  ChatMessageType,
  CycleStatus,
  Prisma,
  ScoreEventType,
  type PrismaClient,
} from "@/lib/prisma-client";
import { ACTIVE_LOCATION_SHUFFLE_COST, ACTIVE_PLAYER_CAP } from "./constants";
import { getChatLimits } from "./chat";
import { normalizeUnitSpriteVariant } from "./attacks";
import {
  ensureCommanderRegistrationColumn,
  ensureLastReadChatColumn,
} from "./schema-guards";
import { classifyTickHealth, getActiveCycleMinutesBehind } from "./tick";
import {
  getFortressAttackDamage,
  getFortressGrowGain,
  getFortressUpgradeCost,
} from "./upgrades";

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

function getDisplayName(name: string, isSlayerOfA: boolean) {
  void isSlayerOfA;
  return name;
}

async function getFortressLocationShuffleCount(
  db: PrismaClient,
  fortressId: string
) {
  const rows = await db.$queryRaw<Array<{ locationShuffleCount: number }>>(
    Prisma.sql`
      SELECT "locationShuffleCount"
      FROM "Fortress"
      WHERE "id" = ${fortressId}
      LIMIT 1
    `
  );

  return rows[0]?.locationShuffleCount ?? 0;
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
  await Promise.all([
    ensureCommanderRegistrationColumn(db),
    ensureLastReadChatColumn(db),
  ]);

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
          level: true,
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
      gameTicks: {
        orderBy: [{ tickAt: "desc" }, { id: "desc" }],
        take: 1,
        select: {
          tickAt: true,
        },
      },
      chatMessages: {
        orderBy: {
          createdAt: "desc",
        },
        take: getChatLimits().limit,
        select: {
          id: true,
          type: true,
          body: true,
          gifProvider: true,
          gifProviderId: true,
          gifTitle: true,
          gifPreviewUrl: true,
          gifDisplayUrl: true,
          gifWidth: true,
          gifHeight: true,
          gifSourceUrl: true,
          createdAt: true,
          author: {
            select: {
              id: true,
            },
          },
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
        unreadCount: 0,
        hasUnread: false,
        latestMessageAt: null,
        persistsUnread: false,
      },
      communityWish: {
        isOpen: false,
        opensAt: null,
        closesAt: null,
        canSubmit: false,
        submissionHint:
          "Community wishes open during the active season. Voting starts after ranks are locked.",
        proposals: [],
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
  const currentUser = userId
    ? await db.user.findUnique({
        where: {
          id: userId,
        },
        select: {
          lastReadChatAt: true,
        },
      })
    : null;
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
  const lastProcessedTickAt =
    cycle.status === CycleStatus.ACTIVE
      ? (cycle.gameTicks[0]?.tickAt ?? null)
      : null;
  const activeMinutesBehind =
    cycle.status === CycleStatus.ACTIVE
      ? getActiveCycleMinutesBehind({
          activeStartedAt: cycle.activeStartedAt,
          lastProcessedTickAt,
          now,
        })
      : 0;
  const tickDelayMinutes =
    cycle.status === CycleStatus.ACTIVE ? activeMinutesBehind : null;
  const tickHealth =
    cycle.status === CycleStatus.ACTIVE
      ? classifyTickHealth(activeMinutesBehind)
      : null;
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
  const upgradesUnlocked = Boolean(cycle.upgradesUnlockedAt);
  const nextUpgradeCost = playerFortress
    ? getFortressUpgradeCost(playerFortress.level)
    : null;
  const canAffordUpgrade =
    playerFortress !== null &&
    nextUpgradeCost !== null &&
    playerFortress.points >= nextUpgradeCost;
  const receivedSlayerUpgrade =
    playerFortress && cycle.upgradesUnlockedAt
      ? await db.scoreEvent.findFirst({
          where: {
            cycleId: cycle.id,
            fortressId: playerFortress.id,
            eventType: ScoreEventType.FORTRESS_UPGRADE_SLAYER_BONUS,
          },
          orderBy: {
            createdAt: "desc",
          },
          select: {
            id: true,
          },
        })
      : null;
  const locationShuffleCount = playerFortress
    ? await getFortressLocationShuffleCount(db, playerFortress.id)
    : 0;
  const locationShuffleCost = playerFortress
    ? locationShuffleCount === 0
      ? 0
      : ACTIVE_LOCATION_SHUFFLE_COST
    : null;
  const hasOutgoingAttackUnits = playerFortress
    ? cycle.attackUnits.some(
        (unit) => unit.attackerFortress.id === playerFortress.id
      )
    : false;
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
    isSlayerOfA: fortress.id === cycle.crownedFortressId && !fortress.isNpc,
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
  const latestMessageAt = cycle.chatMessages[0]?.createdAt ?? null;
  const chatMessages = [...cycle.chatMessages].reverse().map((message) => ({
    id: message.id,
    type: message.type,
    body: message.body,
    gif:
      message.type === ChatMessageType.GIF &&
      message.gifProvider &&
      message.gifProviderId &&
      message.gifPreviewUrl &&
      message.gifDisplayUrl &&
      message.gifWidth &&
      message.gifHeight &&
      message.gifSourceUrl
        ? {
            provider: message.gifProvider,
            providerId: message.gifProviderId,
            title: message.gifTitle ?? message.body,
            previewUrl: message.gifPreviewUrl,
            displayUrl: message.gifDisplayUrl,
            width: message.gifWidth,
            height: message.gifHeight,
            sourceUrl: message.gifSourceUrl,
          }
        : null,
    createdAt: message.createdAt,
    authorName: commanderNameByOwnerId.get(message.author.id) ?? "Spectator",
    isCurrentUser: message.author.id === userId,
  }));
  const unreadCount = currentUser
    ? await db.chatMessage.count({
        where: {
          cycleId: cycle.id,
          authorId: {
            not: userId,
          },
          ...(currentUser.lastReadChatAt
            ? {
                createdAt: {
                  gt: currentUser.lastReadChatAt,
                },
              }
            : {}),
        },
      })
    : 0;
  const communityWishOpen = activeOpen && cycle.activeEndsAt !== null;
  const currentUserCommunityWish =
    cycle.communityWishProposals.find(
      (proposal) => proposal.authorId === userId
    ) ?? null;

  return {
    isSpectator: !playerFortress,
    cycle: {
      id: cycle.id,
      status: cycle.status,
      registrationEndsAt: cycle.registrationEndsAt,
      joiningLockedAt: cycle.joiningLockedAt,
      activeEndsAt: cycle.activeEndsAt,
      upgradesUnlockedAt: cycle.upgradesUnlockedAt,
      megaFortressDestroyCount: cycle.megaFortressDestroyCount,
      lastProcessedTickAt,
      tickDelayMinutes,
      tickHealth,
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
          level: playerFortress.level,
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
          level: playerFortress.level,
          currentAction: playerFortress.currentAction,
          currentTargetId: playerFortress.targetFortressId,
          currentTargetName: playerFortress.targetFortressId
            ? (() => {
                const target = targetLookup.get(
                  playerFortress.targetFortressId
                );

                return target ? target.name : null;
              })()
            : null,
          isSlayerOfA: playerFortress.id === cycle.crownedFortressId,
          canRename: activeOpen && playerFortress.points >= 10,
          canSetAction: activeOpen,
          locationShuffleCost,
          freeLocationShuffleAvailable: locationShuffleCount === 0,
          hasOutgoingAttackUnits,
          canShuffleLocation:
            activeOpen &&
            playerFortress.currentAction === "GROW" &&
            locationShuffleCost !== null &&
            playerFortress.points >= locationShuffleCost,
          upgradesUnlocked,
          nextUpgradeCost,
          canAffordUpgrade,
          canPurchaseUpgrade:
            activeOpen &&
            upgradesUnlocked &&
            nextUpgradeCost !== null &&
            canAffordUpgrade,
          receivedSlayerUpgrade: Boolean(receivedSlayerUpgrade),
          growPerTick: getFortressGrowGain(playerFortress.level),
          attackDamage: getFortressAttackDamage(playerFortress.level),
        }
      : null,
    leaderboard: sortedFortresses.slice(0, 3).map((fortress, index) => ({
      id: fortress.id,
      commanderName: getDisplayName(
        fortress.commanderName,
        fortress.id === cycle.crownedFortressId
      ),
      name: getDisplayName(
        fortress.name,
        fortress.id === cycle.crownedFortressId
      ),
      rawName: fortress.name,
      points: fortress.points,
      rank: index + 1,
      isSlayerOfA: fortress.id === cycle.crownedFortressId,
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
      unreadCount,
      hasUnread: unreadCount > 0,
      latestMessageAt,
      persistsUnread: Boolean(currentUser),
    },
    communityWish: {
      isOpen: communityWishOpen,
      opensAt: cycle.activeStartedAt,
      closesAt: cycle.activeEndsAt,
      canSubmit:
        Boolean(userId) &&
        Boolean(playerFortress) &&
        communityWishOpen &&
        !currentUserCommunityWish,
      submissionHint: !userId
        ? "Sign in and join this cycle to suggest a community wish."
        : !playerFortress
          ? "Only players in this active cycle can suggest a community wish."
          : !communityWishOpen
            ? "Community wishes open during the active season."
            : currentUserCommunityWish
              ? "You already submitted a community wish for this cycle."
              : "Submit one bounded community wish before the cycle ends. Voting starts after final ranks are locked.",
      proposals: cycle.communityWishProposals.map((proposal) => ({
        id: proposal.id,
        requestText: proposal.requestText,
        status: proposal.status,
        reviewNotes: proposal.reviewNotes,
        createdAt: proposal.createdAt,
        authorLabel:
          commanderNameByOwnerId.get(proposal.authorId) ?? "Unknown player",
        isCurrentUser: proposal.authorId === userId,
      })),
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
