import { prisma } from "@/lib/prisma";
import {
  ChatMessageType,
  CommunityWishStatus,
  CycleStatus,
  Prisma,
  RaceAbilityKind,
  ScoreEventType,
  WinnerRequestStatus,
  type PrismaClient,
} from "@/lib/prisma-client";
import { ACTIVE_LOCATION_SHUFFLE_COST, ACTIVE_PLAYER_CAP } from "./constants";
import {
  calculateTickProduction,
  getDefenseBonusPercent,
  getDisplayedCastleLevel,
  getFortressDefenseMultiplier,
  getFortressPopulation,
} from "./balance";
import { getChatLimits } from "./chat";
import { getCommunityWishVoteBudget } from "./community-wishes";
import { normalizeUnitSpriteVariant } from "./attacks";
import { formatApproximateForce, formatRaidBattleReport } from "./battle-report";
import {
  ensureCommanderRegistrationColumn,
  ensureLastReadChatColumn,
} from "./schema-guards";
import { classifyTickHealth, getActiveCycleMinutesBehind } from "./tick";
import { getFortressAttackDamage, getFortressUpgradeCost } from "./upgrades";
import {
  getHelsinkiDayKey,
  getHelsinkiHourKey,
  getNextHelsinkiNoonAfter,
  getRaceBuffTier,
} from "./race-buffs";
import { countCastleSpecializations } from "./specializations";

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

function mapCommunityWishProposals({
  proposals,
  userId,
}: {
  proposals: Array<{
    id: string;
    authorId: string;
    requestText: string;
    status: WinnerRequestStatus;
    reviewNotes: string | null;
    createdAt: Date;
    votes: Array<{
      voterId: string;
      votes: number;
    }>;
  }>;
  userId?: string;
}) {
  return proposals.map((proposal) => {
    const voteCount = proposal.votes.reduce((sum, vote) => sum + vote.votes, 0);

    return {
      id: proposal.id,
      requestText: proposal.requestText,
      status: proposal.status,
      reviewNotes: proposal.reviewNotes,
      createdAt: proposal.createdAt,
      authorLabel: proposal.authorId === userId ? "Your wish" : "Community wish",
      isCurrentUser: proposal.authorId === userId,
      voteCount,
      currentUserVotes:
        userId !== undefined
          ? proposal.votes
              .filter((vote) => vote.voterId === userId)
              .reduce((sum, vote) => sum + vote.votes, 0)
          : 0,
      isVoteEligible: proposal.status !== WinnerRequestStatus.REJECTED,
    };
  });
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

function mapLatestSeason(
  latestResolvedSeason: {
    cycleId: string;
    endedAt: Date;
    communityWishStatus: CommunityWishStatus;
    communityWishSnapshot: string | null;
    communityWishVoteCount: number;
    communityWishFulfillmentProgress: number;
    winningScore: number;
    firstSlayerCommanderName: string | null;
    firstSlayerFortressName: string | null;
    cycle: {
      fortresses: Array<{
        ownerId: string;
        commanderName: string;
        name: string;
      }>;
    };
    winner: {
      id: string;
    };
    winnerRequest: {
      id: string;
      requestText: string;
      status: WinnerRequestStatus;
      reviewNotes: string | null;
      fulfillmentProgress: number;
    } | null;
    communityWishProposal: {
      id: string;
      authorId: string;
      requestText: string;
      status: WinnerRequestStatus;
    } | null;
  }
) {
  const winnerFortress = latestResolvedSeason.cycle.fortresses.find(
    (fortress) => fortress.ownerId === latestResolvedSeason.winner.id
  );
  const communityWishAuthor = latestResolvedSeason.communityWishProposal
    ? latestResolvedSeason.cycle.fortresses.find(
        (fortress) =>
          fortress.ownerId === latestResolvedSeason.communityWishProposal?.authorId
      )
    : null;
  const communityWishText =
    latestResolvedSeason.communityWishSnapshot ??
    (latestResolvedSeason.communityWishProposal
      ? `${communityWishAuthor?.commanderName ?? "Unknown player"}: ${
          latestResolvedSeason.communityWishProposal.requestText
        }`
      : null);

  return {
    cycleId: latestResolvedSeason.cycleId,
    winnerId: latestResolvedSeason.winner.id,
    winnerRequestId: latestResolvedSeason.winnerRequest?.id ?? null,
    winnerLabel: winnerFortress?.commanderName ?? "Unknown winner",
    winnerFortressName: winnerFortress?.name ?? "Unknown fortress",
    winningScore: latestResolvedSeason.winningScore,
    endedAt: latestResolvedSeason.endedAt,
    firstSlayerCommanderName: latestResolvedSeason.firstSlayerCommanderName,
    firstSlayerFortressName: latestResolvedSeason.firstSlayerFortressName,
    wishes: {
      winner: latestResolvedSeason.winnerRequest
        ? {
            id: latestResolvedSeason.winnerRequest.id,
            text: latestResolvedSeason.winnerRequest.requestText,
            ownerLabel: winnerFortress?.commanderName ?? "Winner",
            status: latestResolvedSeason.winnerRequest.status,
            reviewNotes: latestResolvedSeason.winnerRequest.reviewNotes,
            fulfillmentProgress:
              latestResolvedSeason.winnerRequest.fulfillmentProgress,
          }
        : null,
      community: communityWishText
        ? {
            text: communityWishText,
            ownerLabel: "Community vote",
            status: latestResolvedSeason.communityWishStatus,
            voteCount: latestResolvedSeason.communityWishVoteCount,
            fulfillmentProgress:
              latestResolvedSeason.communityWishFulfillmentProgress,
          }
        : null,
    },
  };
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

  const latestResolvedSeason = await db.cycleHistory.findFirst({
    orderBy: {
      endedAt: "desc",
    },
    select: {
      cycleId: true,
      endedAt: true,
      communityWishStatus: true,
      communityWishProposalEndsAt: true,
      communityWishVotingEndsAt: true,
      communityWishResolvedAt: true,
      communityWishSnapshot: true,
      communityWishVoteCount: true,
      communityWishFulfillmentProgress: true,
      winningScore: true,
      firstSlayerCommanderName: true,
      firstSlayerFortressName: true,
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
              createdAt: true,
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
      winner: {
        select: {
          id: true,
        },
      },
      winnerRequest: {
        select: {
          id: true,
          requestText: true,
          status: true,
          reviewNotes: true,
          fulfillmentProgress: true,
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
    },
  });

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
          food: true,
          army: true,
          minersAssigned: true,
          farmersAssigned: true,
          recruitersAssigned: true,
          race: true,
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
          owner: {
            select: {
              unitCosmeticVariant: true,
              fortressCosmeticVariant: true,
            },
          },
          castleUpgradeSpecializations: {
            orderBy: {
              level: "asc",
            },
            select: {
              level: true,
              specialization: true,
            },
          },
          raceAbilityActivations: {
            orderBy: [{ usedAt: "desc" }, { id: "desc" }],
            select: {
              id: true,
              kind: true,
              activeFrom: true,
              activeUntil: true,
              usedAt: true,
              expiresAt: true,
              consumedAt: true,
            },
          },
          dwarfGrudges: {
            orderBy: {
              slot: "asc",
            },
            select: {
              id: true,
              targetFortressId: true,
              slot: true,
              bonusMultiplier: true,
              targetFortress: {
                select: {
                  name: true,
                  commanderName: true,
                },
              },
            },
          },
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
            armyAmount: true,
            launchedAt: true,
            arrivesAt: true,
            recalledAt: true,
            returnOriginMapX: true,
            returnOriginMapY: true,
            attackerFortress: {
              select: {
                id: true,
                ownerId: true,
                name: true,
                mapX: true,
                mapY: true,
              unitSpriteVariant: true,
              owner: {
                select: {
                  unitCosmeticVariant: true,
                },
              },
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
          votes: {
            select: {
              voterId: true,
              votes: true,
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
      latestSeason: latestResolvedSeason
        ? mapLatestSeason(latestResolvedSeason)
        : null,
      playerFortress: null,
      playerSummary: null,
      leaderboard: [],
      mapFortresses: [],
      attackUnits: [],
      battleReports: [],
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
        cycleId: "",
        isOpen: false,
        opensAt: null,
        closesAt: null,
        canSubmit: false,
        canVote: false,
        voteBudget: 0,
        usedVotes: 0,
        remainingVotes: 0,
        currentUserCommunityWish: "",
        submissionHint:
          "Winner wish is guaranteed. Community wish is vote-based. Wishes can be edited until Monday 12:00, and voting ends Monday 24:00.",
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
  const globalFortresses = await db.fortress.findMany({
    select: {
      ownerId: true,
      commanderName: true,
      joinedAt: true,
    },
    orderBy: [{ joinedAt: "desc" }, { id: "desc" }],
  });
  const commanderNameByOwnerId = new Map<string, string>();

  for (const fortress of globalFortresses) {
    if (!commanderNameByOwnerId.has(fortress.ownerId)) {
      commanderNameByOwnerId.set(fortress.ownerId, fortress.commanderName);
    }
  }
  const registrationOpen =
    cycle.status === CycleStatus.REGISTRATION && cycle.registrationEndsAt > now;
  const testingOpen =
    cycle.status === CycleStatus.TESTING &&
    cycle.testingEndsAt !== null &&
    cycle.testingEndsAt > now;
  const joiningLocked = Boolean(cycle.joiningLockedAt);
  const activeOpen =
    cycle.status === CycleStatus.ACTIVE &&
    cycle.activeEndsAt !== null &&
    cycle.activeEndsAt > now;
  const gameplayOpen = testingOpen || activeOpen;
  const lastProcessedTickAt =
    cycle.status === CycleStatus.ACTIVE || cycle.status === CycleStatus.TESTING
      ? (cycle.gameTicks[0]?.tickAt ?? null)
      : null;
  const activeMinutesBehind =
    cycle.status === CycleStatus.ACTIVE || cycle.status === CycleStatus.TESTING
      ? getActiveCycleMinutesBehind({
          activeStartedAt:
            cycle.status === CycleStatus.TESTING
              ? cycle.testingStartedAt
              : cycle.activeStartedAt,
          lastProcessedTickAt,
          now,
        })
      : 0;
  const tickDelayMinutes =
    cycle.status === CycleStatus.ACTIVE || cycle.status === CycleStatus.TESTING
      ? activeMinutesBehind
      : null;
  const tickHealth =
    cycle.status === CycleStatus.ACTIVE || cycle.status === CycleStatus.TESTING
      ? classifyTickHealth(activeMinutesBehind)
      : null;
  const deadline =
    cycle.status === CycleStatus.REGISTRATION
      ? (cycle.testingStartedAt ?? cycle.registrationEndsAt)
      : cycle.status === CycleStatus.TESTING
        ? cycle.testingEndsAt
      : cycle.activeEndsAt;
  const sortedFortresses = [...playerFortresses].sort(
    compareByLeaderboardOrder
  );
  const targetLookup = new Map(
    cycle.fortresses.map((fortress) => [fortress.id, fortress])
  );
  const playerFortressId = playerFortress?.id ?? null;
  const upgradesUnlocked = Boolean(cycle.upgradesUnlockedAt);
  const raceBuffTier = getRaceBuffTier({
    activeStartedAt: cycle.activeStartedAt,
    now,
    isActiveSeason: cycle.status === CycleStatus.ACTIVE,
  });
  const raceTierThreeUnlocksAt = cycle.activeStartedAt
    ? getNextHelsinkiNoonAfter(cycle.activeStartedAt)
    : null;
  const nextUpgradeCost = playerFortress
    ? getFortressUpgradeCost(playerFortress.level)
    : null;
  const playerCastleSpecializationCounts = playerFortress
    ? countCastleSpecializations(playerFortress.castleUpgradeSpecializations)
    : null;
  const pendingUpgradeSpecializationLevel =
    playerFortress &&
    playerFortress.castleUpgradeSpecializations.length < playerFortress.level
      ? playerFortress.castleUpgradeSpecializations.length + 1
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
  const latestWaaaghUse = playerFortress
    ? playerFortress.raceAbilityActivations.find(
        (activation) => activation.kind === RaceAbilityKind.ORK_WAAAGH
      )
    : null;
  const latestStimUse = playerFortress
    ? playerFortress.raceAbilityActivations.find(
        (activation) => activation.kind === RaceAbilityKind.SPACE_MURINE_STIM
      )
    : null;
  const activeUnicornTeleportToken = playerFortress
    ? (playerFortress.raceAbilityActivations.find((activation) => {
        return (
          activation.kind === RaceAbilityKind.UNICORN_TELEPORT &&
          activation.consumedAt === null &&
          activation.expiresAt !== null &&
          activation.expiresAt > now
        );
      }) ?? null)
    : null;
  const latestUnicornTeleportClaim = playerFortress
    ? playerFortress.raceAbilityActivations.find(
        (activation) => activation.kind === RaceAbilityKind.UNICORN_TELEPORT
      )
    : null;
  const currentDayKey = getHelsinkiDayKey(now);
  const currentHourKey = getHelsinkiHourKey(now);
  const battleReports = playerFortress
    ? (
        await db.attackUnit.findMany({
          where: {
            cycleId: cycle.id,
            resolvedAt: {
              not: null,
            },
            cancelledAt: null,
            OR: [
              {
                attackerFortressId: playerFortress.id,
              },
              {
                targetFortressId: playerFortress.id,
              },
            ],
          },
          orderBy: [
            {
              resolvedAt: "desc",
            },
            {
              launchedAt: "desc",
            },
            {
              id: "desc",
            },
          ],
          take: 5,
          select: {
            id: true,
            launchedAt: true,
            resolvedAt: true,
            armyAmount: true,
            defenderArmyAtBattleStart: true,
            resolvedAttackPower: true,
            resolvedDefensePower: true,
            attackerSurvivors: true,
            attackerRetired: true,
            attackerReturned: true,
            defenderLosses: true,
            pointsLooted: true,
            foodLooted: true,
            attackerFortress: {
              select: {
                id: true,
                name: true,
                commanderName: true,
                ownerId: true,
              },
            },
            targetFortress: {
              select: {
                id: true,
                name: true,
                commanderName: true,
                ownerId: true,
                level: true,
                race: true,
              },
            },
          },
        })
      ).map((unit) => {
        const resolvedAttackPower = unit.resolvedAttackPower ?? unit.armyAmount;
        const resolvedDefensePower = unit.resolvedDefensePower ?? 0;
        const defenderDbLevel = unit.targetFortress.level;
        const outcome: "ATTACKER_WIN" | "DEFENDER_WIN" =
          resolvedAttackPower > resolvedDefensePower
            ? "ATTACKER_WIN"
            : "DEFENDER_WIN";

        return {
          id: unit.id,
          launchedAt: unit.launchedAt,
          resolvedAt: unit.resolvedAt ?? unit.launchedAt,
          attackerName: unit.attackerFortress.name,
          attackerCommanderName: unit.attackerFortress.commanderName,
          attackerOwnerId: unit.attackerFortress.ownerId,
          defenderName: unit.targetFortress.name,
          defenderCommanderName: unit.targetFortress.commanderName,
          defenderOwnerId: unit.targetFortress.ownerId,
          sentArmy: unit.armyAmount,
          defenderArmyEstimate: formatApproximateForce(
            unit.defenderArmyAtBattleStart
          ),
          defenderDbLevel,
          defenseBonusPercent: getDefenseBonusPercent(
            defenderDbLevel,
            unit.targetFortress.race
          ),
          defenseMultiplier: getFortressDefenseMultiplier(
            defenderDbLevel,
            unit.targetFortress.race
          ),
          resolvedAttackPower,
          resolvedDefensePowerEstimate:
            formatApproximateForce(resolvedDefensePower),
          outcome,
          attackerSurvivors: unit.attackerSurvivors ?? 0,
          attackerRetired: unit.attackerRetired ?? 0,
          attackerReturned: unit.attackerReturned ?? 0,
          defenderLosses: unit.defenderLosses ?? 0,
          pointsLooted: unit.pointsLooted ?? 0,
          foodLooted: unit.foodLooted ?? 0,
          reportLines: formatRaidBattleReport({
            attackerName: unit.attackerFortress.name,
            defenderName: unit.targetFortress.name,
            sentArmy: unit.armyAmount,
            defenderArmyAtBattleStart: unit.defenderArmyAtBattleStart,
            defenderDbLevel,
            defenderRace: unit.targetFortress.race,
            resolvedDefensePower,
            outcome,
            attackerSurvivors: unit.attackerSurvivors ?? 0,
            attackerRetired: unit.attackerRetired ?? 0,
            attackerReturned: unit.attackerReturned ?? 0,
            defenderLosses: unit.defenderLosses ?? 0,
            pointsLooted: unit.pointsLooted ?? 0,
            foodLooted: unit.foodLooted ?? 0,
          }),
        };
      })
    : [];
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
    displayedCastleLevel: getDisplayedCastleLevel(fortress.level),
    population: getFortressPopulation(fortress.level, fortress.race),
    defenseMultiplier: getFortressDefenseMultiplier(
      fortress.level,
      fortress.race,
      countCastleSpecializations(fortress.castleUpgradeSpecializations)
    ),
    food: fortress.food,
    army: fortress.army,
    minersAssigned: fortress.minersAssigned,
    farmersAssigned: fortress.farmersAssigned,
    recruitersAssigned: fortress.recruitersAssigned,
    race: fortress.race,
    isSlayerOfA: fortress.id === cycle.crownedFortressId && !fortress.isNpc,
    currentAction: fortress.currentAction,
    mapX: fortress.mapX,
    mapY: fortress.mapY,
    unitSpriteVariant: normalizeUnitSpriteVariant(fortress.unitSpriteVariant),
    unitCosmeticVariant: fortress.owner?.unitCosmeticVariant ?? null,
    fortressCosmeticVariant: fortress.owner?.fortressCosmeticVariant ?? null,
    isCurrentUser: fortress.ownerId === userId,
    isTargetable:
      playerFortressId !== null &&
      gameplayOpen &&
      fortress.id !== playerFortressId,
  }));
  const globalChatMessages = await db.chatMessage.findMany({
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
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
  });
  const latestMessageAt = globalChatMessages[0]?.createdAt ?? null;
  const chatMessages = [...globalChatMessages].reverse().map((message) => ({
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
  const usingResolvedWishWindow =
    cycle.status === CycleStatus.REGISTRATION && latestResolvedSeason !== null;
  const communityWishSourceCycleId = usingResolvedWishWindow
    ? latestResolvedSeason.cycleId
    : cycle.id;
  const communityWishSourceProposals = usingResolvedWishWindow
    ? latestResolvedSeason.cycle.communityWishProposals
    : cycle.communityWishProposals;
  const communityWishSourcePlayerFortress = usingResolvedWishWindow
    ? latestResolvedSeason.cycle.fortresses.find(
        (fortress) => fortress.ownerId === userId
      ) ?? null
    : playerFortress;
  const communityWishProposalOpen = usingResolvedWishWindow
    ? latestResolvedSeason.communityWishStatus === CommunityWishStatus.OPEN ||
      latestResolvedSeason.communityWishStatus ===
        CommunityWishStatus.PROPOSALS_OPEN
    : activeOpen;
  const communityWishVotingOpen =
    usingResolvedWishWindow &&
    latestResolvedSeason.communityWishStatus === CommunityWishStatus.OPEN &&
    latestResolvedSeason.communityWishVotingEndsAt !== null &&
    latestResolvedSeason.communityWishVotingEndsAt > now;
  const communityWishVoteBudget =
    userId && communityWishVotingOpen
      ? await getCommunityWishVoteBudget({
          cycleId: communityWishSourceCycleId,
          userId,
          db,
        })
      : {
          canVote: false,
          voteBudget: 0,
          usedVotes: 0,
          remainingVotes: 0,
          reason: userId
            ? "Community wish voting is not open yet."
            : "Sign in as a cycle player to vote on the community wish.",
        };
  const currentUserCommunityWish =
    communityWishSourceProposals.find(
      (proposal) => proposal.authorId === userId
    ) ?? null;
  const mappedCommunityWishProposals = mapCommunityWishProposals({
    proposals: communityWishSourceProposals,
    userId,
  });
  const latestSeason = latestResolvedSeason
    ? mapLatestSeason(latestResolvedSeason)
    : null;
  return {
    isSpectator: !playerFortress,
    cycle: {
      id: cycle.id,
      status: cycle.status,
      registrationEndsAt: cycle.registrationEndsAt,
      testingStartedAt: cycle.testingStartedAt,
      testingEndsAt: cycle.testingEndsAt,
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
            ? "Build time is still running, but joins are currently locked by admin action."
            : "Build time is open. Players can join before the next season starts on Wednesday."
          : cycle.status === CycleStatus.TESTING
            ? joiningLocked
              ? "Testing mode is live, but joins are currently locked by admin action. Sandbox progress resets before the real season."
              : "Testing mode is live. Players can join and try the economy, races, upgrades and raids before everything resets for the real season."
          : activeOpen
            ? "The season is live. Community wishes can be proposed until Sunday and voted on after it ends."
            : "The season has ended. Build and wish resolution are in progress.",
      statusMessage:
        cycle.status === CycleStatus.REGISTRATION
          ? registrationOpen && joiningLocked
            ? "Build time remains open on the clock, but new joins are currently locked by admin action."
            : registrationOpen
              ? "Build time is open. Joining creates your fortress immediately and reserves one of the 30 season slots before Wednesday."
              : "Build time has expired. The next game tick will either restart build time or move the cycle into ACTIVE."
          : cycle.status === CycleStatus.TESTING
            ? testingOpen && joiningLocked
              ? "Testing mode remains open on the clock, but new joins are currently locked by admin action."
              : testingOpen && remainingSlots > 0
                ? "Testing mode is live. You can still join before the real season starts; sandbox progress resets first."
                : testingOpen
                  ? "Testing mode is live, but all player slots are filled. Sandbox progress resets before the real season."
                  : "Testing has ended. The next game tick will reset sandbox progress and start the real season."
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
            : cycle.status === CycleStatus.TESTING
              ? testingOpen
            : activeOpen,
        label:
          cycle.status === CycleStatus.REGISTRATION
            ? registrationOpen && joiningLocked
              ? "Build locked"
              : registrationOpen
                ? "Build phase"
                : "Build expired"
            : cycle.status === CycleStatus.TESTING
              ? testingOpen && joiningLocked
                ? "Testing locked"
                : testingOpen
                  ? "Testing phase"
                  : "Testing expired"
            : activeOpen
              ? "Season live"
              : "Awaiting build start",
    },
    latestSeason,
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
          displayedCastleLevel: getDisplayedCastleLevel(playerFortress.level),
          population: getFortressPopulation(
            playerFortress.level,
            playerFortress.race
          ),
          defenseMultiplier: getFortressDefenseMultiplier(
            playerFortress.level,
            playerFortress.race,
            playerCastleSpecializationCounts ?? undefined
          ),
          food: playerFortress.food,
          army: playerFortress.army,
          minersAssigned: playerFortress.minersAssigned,
          farmersAssigned: playerFortress.farmersAssigned,
          recruitersAssigned: playerFortress.recruitersAssigned,
          race: playerFortress.race,
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
          displayedCastleLevel: getDisplayedCastleLevel(playerFortress.level),
          population: getFortressPopulation(
            playerFortress.level,
            playerFortress.race
          ),
          defenseMultiplier: getFortressDefenseMultiplier(
            playerFortress.level,
            playerFortress.race,
            playerCastleSpecializationCounts ?? undefined
          ),
          food: playerFortress.food,
          army: playerFortress.army,
          minersAssigned: playerFortress.minersAssigned,
          farmersAssigned: playerFortress.farmersAssigned,
          recruitersAssigned: playerFortress.recruitersAssigned,
          race: playerFortress.race,
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
          isTestingPhase: cycle.status === CycleStatus.TESTING,
          canSetAction: gameplayOpen && playerFortress.race !== null,
          locationShuffleCost,
          freeLocationShuffleAvailable: locationShuffleCount === 0,
          hasOutgoingAttackUnits,
          canShuffleLocation:
            gameplayOpen &&
            playerFortress.race !== null &&
            locationShuffleCost !== null &&
            playerFortress.points >= locationShuffleCost,
          upgradesUnlocked,
          nextUpgradeCost,
          canAffordUpgrade,
          canPurchaseUpgrade:
            gameplayOpen &&
            playerFortress.race !== null &&
            upgradesUnlocked &&
            nextUpgradeCost !== null &&
            canAffordUpgrade &&
            pendingUpgradeSpecializationLevel === null,
          castleSpecializationCounts: playerCastleSpecializationCounts,
          castleUpgradeChoices: playerFortress.castleUpgradeSpecializations,
          pendingUpgradeSpecializationLevel,
          receivedSlayerUpgrade: Boolean(receivedSlayerUpgrade),
          raceBuffs: {
            tier: raceBuffTier,
            tierThreeUnlocksAt: raceTierThreeUnlocksAt,
            dwarfGrudges: playerFortress.dwarfGrudges.map((grudge) => ({
              targetFortressId: grudge.targetFortressId,
              targetName: grudge.targetFortress.name,
              targetCommanderName: grudge.targetFortress.commanderName,
              slot: grudge.slot,
              bonusMultiplier: grudge.bonusMultiplier,
            })),
            canChooseDwarfGrudge:
              playerFortress.race === "DWARFS" &&
              raceBuffTier >= 2 &&
              playerFortress.dwarfGrudges.length === 0,
            canChooseDwarfTierThree:
              playerFortress.race === "DWARFS" &&
              raceBuffTier >= 3 &&
              playerFortress.dwarfGrudges.length > 0 &&
              !playerFortress.dwarfGrudges.some(
                (grudge) => grudge.slot === 2 || grudge.bonusMultiplier >= 2
              ),
            canActivateWaaagh:
              playerFortress.race === "ORKS" &&
              raceBuffTier >= 2 &&
              (!latestWaaaghUse ||
                getHelsinkiDayKey(latestWaaaghUse.usedAt) !== currentDayKey),
            waaaghActiveUntil:
              latestWaaaghUse &&
              latestWaaaghUse.activeFrom <= now &&
              latestWaaaghUse.activeUntil > now
                ? latestWaaaghUse.activeUntil
                : null,
            canActivateStim:
              playerFortress.race === "SPACE_MURINES" &&
              raceBuffTier >= 2 &&
              (!latestStimUse ||
                getHelsinkiDayKey(latestStimUse.usedAt) !== currentDayKey),
            stimActiveUntil:
              latestStimUse &&
              latestStimUse.activeFrom <= now &&
              latestStimUse.activeUntil > now
                ? latestStimUse.activeUntil
                : null,
            canClaimUnicornTeleport:
              playerFortress.race === "UNSTABLE_UNICORNS" &&
              raceBuffTier >= 3 &&
              activeUnicornTeleportToken === null &&
              (!latestUnicornTeleportClaim ||
                getHelsinkiHourKey(latestUnicornTeleportClaim.usedAt) !==
                  currentHourKey),
            hasUnicornTeleportToken: activeUnicornTeleportToken !== null,
            unicornTeleportTokenExpiresAt:
              activeUnicornTeleportToken?.expiresAt ?? null,
          },
          growPerTick: calculateTickProduction({
            ...playerFortress,
            castleSpecializations: playerCastleSpecializationCounts ?? undefined,
          }).pointsProduced,
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
        armyAmount: unit.armyAmount,
        launchedAt: unit.launchedAt,
        arrivesAt: unit.arrivesAt,
        recalledAt: unit.recalledAt,
        returnOrigin:
          unit.returnOriginMapX !== null && unit.returnOriginMapY !== null
            ? {
                mapX: unit.returnOriginMapX,
                mapY: unit.returnOriginMapY,
              }
            : null,
        canRecall:
          Boolean(userId) &&
          unit.attackerFortress.ownerId === userId &&
          unit.recalledAt === null,
        attacker: {
          id: unit.attackerFortress.id,
          name: unit.attackerFortress.name,
        mapX: unit.attackerFortress.mapX,
        mapY: unit.attackerFortress.mapY,
        unitSpriteVariant: normalizeUnitSpriteVariant(
          unit.attackerFortress.unitSpriteVariant
        ),
        unitCosmeticVariant:
          unit.attackerFortress.owner?.unitCosmeticVariant ?? null,
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
      cycleId: communityWishSourceCycleId,
      isOpen: communityWishProposalOpen || communityWishVotingOpen,
      opensAt: usingResolvedWishWindow
        ? latestResolvedSeason.endedAt
        : cycle.activeStartedAt,
      closesAt: usingResolvedWishWindow
        ? latestResolvedSeason.communityWishVotingEndsAt ??
          latestResolvedSeason.communityWishProposalEndsAt
        : cycle.activeEndsAt,
      canSubmit:
        Boolean(userId) &&
        Boolean(communityWishSourcePlayerFortress) &&
        communityWishProposalOpen,
      canVote:
        Boolean(userId) &&
        communityWishVotingOpen &&
        communityWishVoteBudget.canVote &&
        communityWishSourceProposals.length > 0,
      voteBudget: communityWishVoteBudget.voteBudget,
      usedVotes: communityWishVoteBudget.usedVotes,
      remainingVotes: communityWishVoteBudget.remainingVotes,
      currentUserCommunityWish:
        currentUserCommunityWish?.requestText ?? "",
      submissionHint: !userId
        ? "Sign in and join this cycle to suggest a community wish."
        : !communityWishSourcePlayerFortress
          ? usingResolvedWishWindow
            ? "Only players from the last finished season can suggest a community wish."
            : "Only players in this cycle can suggest a community wish."
          : communityWishVotingOpen
            ? "Winner wish is guaranteed. Community wish is vote-based. You can edit your short English wish until Monday 12:00 and vote until Monday 24:00."
            : communityWishProposalOpen
              ? usingResolvedWishWindow
                ? "Winner wish is guaranteed. Community wish is vote-based. You can edit your short English wish until Monday 12:00 and vote once voting opens."
                : "Winner wish is guaranteed. Community wish is vote-based. Submit one short English wish while the season is live."
              : "Community wishes are closed for this cycle.",
      proposals: mappedCommunityWishProposals,
    },
    battleReports,
    availableTargets:
      gameplayOpen && playerFortress
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
              level: fortress.level,
              race: fortress.race,
              points: fortress.points,
              isNpc: fortress.isNpc,
              health: fortress.health,
              maxHealth: fortress.maxHealth,
              currentAction: fortress.currentAction,
            }))
        : [],
    canJoinCycle:
      Boolean(userId) &&
      (registrationOpen || testingOpen || activeOpen) &&
      !joiningLocked &&
      !playerFortress &&
      remainingSlots > 0,
    canEditRegistrationName:
      Boolean(userId) && registrationOpen && Boolean(playerFortress),
    emptyStateMessage: null,
  };
}
