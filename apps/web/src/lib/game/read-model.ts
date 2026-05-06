import { prisma } from "@/lib/prisma";
import {
  ChatMessageType,
  CommunityWishStatus,
  CycleStatus,
  BattlefieldSide,
  BattlefieldStatus,
  FortressKind,
  Prisma,
  RaceAbilityKind,
  WinnerRequestStatus,
  DwarfDeepMiningOutcome,
  type PrismaClient,
} from "@/lib/prisma-client";
import {
  ACTIVE_LOCATION_SHUFFLE_COST,
  ACTIVE_PLAYER_CAP,
  HOME_OF_A_POINT_INCOME,
  HOME_OF_A_TILE_ID,
  MAX_SIMULTANEOUS_ATTACKS_BASE,
} from "./constants";
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
import {
  formatApproximateForce,
  formatRaidBattleReport,
  formatRaidRecallReport,
} from "./battle-report";
import {
  ensureCommanderRegistrationColumn,
  ensureLastReadChatColumn,
} from "./schema-guards";
import { classifyTickHealth, getActiveCycleMinutesBehind } from "./tick";
import {
  getFortressAttackDamage,
  getFortressUpgradeCost,
  getMaxSimultaneousAttacks,
} from "./upgrades";
import {
  getHelsinkiDayKey,
  getHelsinkiHourKey,
  getNextHelsinkiNoonAfter,
  getRaceBuffTier,
} from "./race-buffs";
import { countCastleSpecializations } from "./specializations";
import { DWARF_DEEP_MINING_RUNE_BOUNTY } from "./dwarf-deep-mining";
import {
  getHomeOfABonus,
  getTileBonus,
  getTileById,
  isHomeOfATile,
} from "./territory";

export type HomePageState = Awaited<ReturnType<typeof getHomePageState>>;

function formatBattlefieldReportLines({
  targetName,
  targetTileId,
  status,
  winnerSide,
  attackerBannerName,
  defenderBannerName,
  attackerArmyRemaining,
  defenderArmyRemaining,
  participantCount,
  incomingCount,
  arrivedReinforcementCount,
  pointsReward,
}: {
  targetName: string;
  targetTileId: string | null;
  status: BattlefieldStatus;
  winnerSide: BattlefieldSide | null;
  attackerBannerName: string;
  defenderBannerName: string | null;
  attackerArmyRemaining: number;
  defenderArmyRemaining: number;
  participantCount: number;
  incomingCount: number;
  arrivedReinforcementCount: number;
  pointsReward: number;
}) {
  const targetLabel = targetTileId ? `tile ${targetTileId}` : targetName;
  const lines = [
    `${attackerBannerName} opened a battlefield against ${defenderBannerName ?? targetLabel}.`,
    `Target: ${targetLabel}. Participants: ${participantCount}.`,
  ];

  if (arrivedReinforcementCount > 0 || incomingCount > 0) {
    lines.push(
      `Reinforcements: ${arrivedReinforcementCount} arrived, ${incomingCount} still marching.`
    );
  }

  if (status === BattlefieldStatus.RESOLVED) {
    const winnerLabel =
      winnerSide === BattlefieldSide.ATTACKER
        ? attackerBannerName
        : (defenderBannerName ?? "defenders");

    lines.push(
      `Final result: ${winnerLabel} won with ${attackerArmyRemaining} attacker army and ${defenderArmyRemaining} defender army remaining.`
    );

    if (targetTileId) {
      lines.push(
        winnerSide === BattlefieldSide.ATTACKER
          ? `Ownership of tile ${targetTileId} transferred to ${attackerBannerName}.`
          : `Ownership of tile ${targetTileId} stayed with ${defenderBannerName ?? "the defender"}.`
      );
    }

      if (pointsReward > 0 && !targetTileId) {
        lines.push(`Battlefield reward paid out: ${pointsReward} gold.`);
      }
  } else {
    lines.push(
      `Battle progress continues with ${attackerArmyRemaining} attacker army and ${defenderArmyRemaining} defender army committed.`
    );
  }

  return lines;
}

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
      authorLabel:
        proposal.authorId === userId ? "Your wish" : "Community wish",
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

function mapLatestSeason(latestResolvedSeason: {
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
}) {
  const winnerFortress = latestResolvedSeason.cycle.fortresses.find(
    (fortress) => fortress.ownerId === latestResolvedSeason.winner.id
  );
  const communityWishAuthor = latestResolvedSeason.communityWishProposal
    ? latestResolvedSeason.cycle.fortresses.find(
        (fortress) =>
          fortress.ownerId ===
          latestResolvedSeason.communityWishProposal?.authorId
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
          gold: true,
          level: true,
          food: true,
          army: true,
          minersAssigned: true,
          farmersAssigned: true,
          recruitersAssigned: true,
          race: true,
          fortressKind: true,
          lootCampVariant: true,
          expiresAt: true,
          unicornDecoySourceFortressId: true,
          unicornDecoyLevel: true,
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
          unicornDecoySourceFortress: {
            select: {
              id: true,
              commanderName: true,
              name: true,
              points: true,
              gold: true,
              level: true,
              race: true,
              owner: {
                select: {
                  unitCosmeticVariant: true,
                  fortressCosmeticVariant: true,
                },
              },
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
          unicornTemporaryTeleports: {
            where: {
              returnedAt: null,
            },
            orderBy: [{ startedAt: "desc" }, { id: "desc" }],
            take: 1,
            select: {
              originMapX: true,
              originMapY: true,
              temporaryMapX: true,
              temporaryMapY: true,
              returnAt: true,
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
          deepMiningRolls: {
            orderBy: [{ createdAt: "desc" }, { id: "desc" }],
            take: 1,
            select: {
              outcome: true,
              committedArmy: true,
              pointDelta: true,
              armyDelta: true,
              activeUntil: true,
              createdAt: true,
              targetFortressId: true,
              runeFortressId: true,
              targetFortress: {
                select: {
                  name: true,
                  commanderName: true,
                },
              },
              runeFortress: {
                select: {
                  health: true,
                  army: true,
                  expiresAt: true,
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
              race: true,
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
      mapHexOwnerships: {
        select: {
          id: true,
          tileId: true,
          claimedAt: true,
          ownerFortressId: true,
          ownerFortress: {
            select: {
              id: true,
              ownerId: true,
              name: true,
              commanderName: true,
            },
          },
        },
      },
      homeOfAHolders: {
        orderBy: [{ capturedAt: "asc" }, { id: "asc" }],
        select: {
          id: true,
          fortressId: true,
          bannerFortressId: true,
          contributionWeight: true,
          capturedAt: true,
          fortress: {
            select: {
              id: true,
              ownerId: true,
              name: true,
              commanderName: true,
            },
          },
          bannerFortress: {
            select: {
              id: true,
              ownerId: true,
              name: true,
              commanderName: true,
            },
          },
        },
      },
      battlefields: {
        where: {
          status: "ACTIVE",
        },
        orderBy: [{ startedAt: "desc" }, { id: "desc" }],
        select: {
          id: true,
          targetTileId: true,
          progress: true,
          attackerArmyRemaining: true,
          defenderArmyRemaining: true,
          startedAt: true,
          attackerBannerFortressId: true,
          defenderBannerFortressId: true,
          targetFortress: {
            select: {
              id: true,
              name: true,
              commanderName: true,
            },
          },
          attackerBannerFortress: {
            select: {
              id: true,
              name: true,
              commanderName: true,
            },
          },
          defenderBannerFortress: {
            select: {
              id: true,
              name: true,
              commanderName: true,
            },
          },
          participants: {
            select: {
              fortressId: true,
              side: true,
              armyCommitted: true,
              armyRemaining: true,
            },
          },
          incomingReinforcements: {
            where: {
              resolvedAt: null,
              cancelledAt: null,
            },
            orderBy: [{ arrivesAt: "asc" }, { id: "asc" }],
            select: {
              id: true,
              armyAmount: true,
              arrivesAt: true,
              reinforcementSide: true,
              attackerFortress: {
                select: {
                  id: true,
                  ownerId: true,
                  name: true,
                },
              },
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
      mapHexes: [],
      homeOfA: null,
      battlefields: [],
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
    cycle.activeStartedAt !== null &&
    cycle.activeStartedAt <= now &&
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
  const upgradesUnlocked = gameplayOpen;
  const raceBuffTier = getRaceBuffTier({
    activeStartedAt: cycle.activeStartedAt,
    now,
    isActiveSeason: cycle.status === CycleStatus.ACTIVE,
  });
  const raceTierThreeUnlocksAt = cycle.activeStartedAt
    ? getNextHelsinkiNoonAfter(cycle.activeStartedAt)
    : null;
  const activeRuneSuppressions = await db.dwarfDeepMiningRoll.findMany({
    where: {
      outcome: DwarfDeepMiningOutcome.FACTION_SEAL,
      activeUntil: {
        gt: now,
      },
      targetFortressId: {
        not: null,
      },
      runeFortress: {
        health: {
          gt: 0,
        },
        expiresAt: {
          gt: now,
        },
      },
    },
    select: {
      targetFortressId: true,
      activeUntil: true,
      runeFortressId: true,
      fortress: {
        select: {
          id: true,
          name: true,
          commanderName: true,
        },
      },
      runeFortress: {
        select: {
          id: true,
          health: true,
          army: true,
          expiresAt: true,
        },
      },
    },
  });
  const suppressedFortressIds = new Set(
    activeRuneSuppressions
      .map((suppression) => suppression.targetFortressId)
      .filter((id): id is string => Boolean(id))
  );
  const playerSuppression =
    playerFortress && suppressedFortressIds.has(playerFortress.id)
      ? (activeRuneSuppressions.find(
          (suppression) => suppression.targetFortressId === playerFortress.id
        ) ?? null)
      : null;
  const getEffectiveRace = (fortress: {
    id: string;
    race: "DWARFS" | "UNSTABLE_UNICORNS" | "SPACE_MURINES" | "ORKS" | null;
  }) => (suppressedFortressIds.has(fortress.id) ? null : fortress.race);
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
    playerFortress.gold >= nextUpgradeCost;
  const receivedSlayerUpgrade = null;
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
  const outboundAttackUnitCount = playerFortress
    ? cycle.attackUnits.filter(
        (unit) => unit.attackerFortress.id === playerFortress.id
      ).length
    : 0;
  const maxSimultaneousAttacks = playerFortress
    ? getMaxSimultaneousAttacks(playerFortress.level, getEffectiveRace(playerFortress))
    : MAX_SIMULTANEOUS_ATTACKS_BASE;
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
  const latestInstantRecallUse = playerFortress
    ? playerFortress.raceAbilityActivations.find(
        (activation) =>
          activation.kind === RaceAbilityKind.SPACE_MURINE_INSTANT_RECALL
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
  const activeUnicornTemporaryTeleport =
    playerFortress?.unicornTemporaryTeleports[0] ?? null;
  const latestUnicornTeleportClaim = playerFortress
    ? playerFortress.raceAbilityActivations.find(
        (activation) => activation.kind === RaceAbilityKind.UNICORN_TELEPORT
      )
    : null;
  const latestDwarfDeepMiningUse = playerFortress
    ? playerFortress.raceAbilityActivations.find(
        (activation) =>
          activation.kind === RaceAbilityKind.DWARF_DEEP_MINING_COOLDOWN
      )
    : null;
  const latestDwarfDeepMiningRoll =
    playerFortress?.deepMiningRolls[0] ?? null;
  const currentDayKey = getHelsinkiDayKey(now);
  const currentHourKey = getHelsinkiHourKey(now);
  const legacyBattleReports = playerFortress
    ? (
        await db.attackUnit.findMany({
          where: {
            cycleId: cycle.id,
            resolvedAt: {
              not: null,
            },
            cancelledAt: null,
            reinforcementBattlefieldId: null,
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
            recalledAt: true,
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
            armyLooted: true,
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
                fortressKind: true,
                lootCampVariant: true,
                unicornDecoyLevel: true,
                level: true,
                race: true,
                maxHealth: true,
                castleUpgradeSpecializations: {
                  select: {
                    specialization: true,
                  },
                },
              },
            },
          },
        })
      ).map((unit) => {
        const attackerReturned = unit.attackerReturned ?? unit.armyAmount;

        if (
          unit.recalledAt &&
          unit.defenderArmyAtBattleStart === null &&
          (unit.resolvedAttackPower ?? 0) === 0 &&
          (unit.resolvedDefensePower ?? 0) === 0 &&
          (unit.defenderLosses ?? 0) === 0 &&
          (unit.pointsLooted ?? 0) === 0 &&
          (unit.foodLooted ?? 0) === 0
        ) {
          return {
            type: "RECALLED" as const,
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
            defenderArmyEstimate: "recalled",
            defenderDbLevel: unit.targetFortress.level,
            defenseBonusPercent: 0,
            defenseMultiplier: 1,
            resolvedAttackPower: unit.resolvedAttackPower ?? 0,
            resolvedDefensePowerEstimate: "0",
            outcome: "RECALLED" as const,
            attackerSurvivors: unit.attackerSurvivors ?? attackerReturned,
            attackerRetired: unit.attackerRetired ?? 0,
            attackerReturned,
            defenderLosses: unit.defenderLosses ?? 0,
            pointsLooted: unit.pointsLooted ?? 0,
            foodLooted: unit.foodLooted ?? 0,
            armyLooted: unit.armyLooted ?? 0,
            reportLines: formatRaidRecallReport({
              attackerName: unit.attackerFortress.name,
              sentArmy: unit.armyAmount,
              returnedArmy: attackerReturned,
              lostArmy: unit.attackerRetired ?? 0,
            }),
          };
        }

        const resolvedAttackPower = unit.resolvedAttackPower ?? unit.armyAmount;
        const resolvedDefensePower = unit.resolvedDefensePower ?? 0;
        const defenderDbLevel = unit.targetFortress.level;
        const defenderCastleSpecializationCounts = countCastleSpecializations(
          unit.targetFortress.castleUpgradeSpecializations
        );
        const outcome: "ATTACKER_WIN" | "DEFENDER_WIN" =
          unit.targetFortress.fortressKind === FortressKind.LOOT_CAMP
            ? resolvedAttackPower > 0
              ? "ATTACKER_WIN"
              : "DEFENDER_WIN"
            : resolvedAttackPower > resolvedDefensePower
              ? "ATTACKER_WIN"
              : "DEFENDER_WIN";

        return {
          type: "BATTLE" as const,
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
            unit.targetFortress.race,
            defenderCastleSpecializationCounts
          ),
          defenseMultiplier: getFortressDefenseMultiplier(
            defenderDbLevel,
            unit.targetFortress.race,
            defenderCastleSpecializationCounts
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
          armyLooted: unit.armyLooted ?? 0,
          reportLines: formatRaidBattleReport({
            attackerName: unit.attackerFortress.name,
            defenderName: unit.targetFortress.name,
            sentArmy: unit.armyAmount,
            defenderArmyAtBattleStart: unit.defenderArmyAtBattleStart,
            defenderDbLevel,
            defenderRace: unit.targetFortress.race,
            defenderCastleSpecializations: defenderCastleSpecializationCounts,
            resolvedDefensePower,
            outcome,
            attackerSurvivors: unit.attackerSurvivors ?? 0,
            attackerRetired: unit.attackerRetired ?? 0,
            attackerReturned: unit.attackerReturned ?? 0,
            defenderLosses: unit.defenderLosses ?? 0,
            pointsLooted: unit.pointsLooted ?? 0,
            foodLooted: unit.foodLooted ?? 0,
            armyLooted: unit.armyLooted ?? 0,
            defenderIsUnicornDecoy:
              unit.targetFortress.fortressKind === FortressKind.UNICORN_DECOY,
            defenderDecoyLevel: unit.targetFortress.unicornDecoyLevel,
            defenderIsLootCamp:
              unit.targetFortress.fortressKind === FortressKind.LOOT_CAMP,
            defenderLootCampVariant: unit.targetFortress.lootCampVariant,
          }),
        };
      })
    : [];
  const battlefieldReports = playerFortress
    ? (
        await db.battlefield.findMany({
          where: {
            cycleId: cycle.id,
            OR: [
              { attackerBannerFortressId: playerFortress.id },
              { defenderBannerFortressId: playerFortress.id },
              { targetFortressId: playerFortress.id },
              {
                participants: {
                  some: {
                    fortressId: playerFortress.id,
                  },
                },
              },
              {
                incomingReinforcements: {
                  some: {
                    attackerFortressId: playerFortress.id,
                  },
                },
              },
            ],
          },
          orderBy: [{ updatedAt: "desc" }, { startedAt: "desc" }, { id: "desc" }],
          take: 5,
          select: {
            id: true,
            targetTileId: true,
            status: true,
            progress: true,
            attackerArmyRemaining: true,
            defenderArmyRemaining: true,
            pointsReward: true,
            startedAt: true,
            resolvedAt: true,
            resolvedWinnerSide: true,
            targetFortress: {
              select: {
                id: true,
                name: true,
                commanderName: true,
                ownerId: true,
              },
            },
            attackerBannerFortress: {
              select: {
                id: true,
                name: true,
                commanderName: true,
                ownerId: true,
              },
            },
            defenderBannerFortress: {
              select: {
                id: true,
                name: true,
                commanderName: true,
                ownerId: true,
              },
            },
            participants: {
              orderBy: [{ joinedAt: "asc" }, { id: "asc" }],
              select: {
                fortressId: true,
                side: true,
                armyCommitted: true,
                armyRemaining: true,
                joinedAt: true,
                fortress: {
                  select: {
                    name: true,
                    commanderName: true,
                    ownerId: true,
                  },
                },
              },
            },
            incomingReinforcements: {
              orderBy: [{ arrivesAt: "asc" }, { id: "asc" }],
              select: {
                id: true,
                armyAmount: true,
                arrivesAt: true,
                resolvedAt: true,
                cancelledAt: true,
                reinforcementSide: true,
                attackerFortress: {
                  select: {
                    name: true,
                    commanderName: true,
                    ownerId: true,
                  },
                },
              },
            },
          },
        })
      ).map((battlefield) => {
        const targetName =
          battlefield.targetTileId !== null
            ? `Tile ${battlefield.targetTileId}`
            : (battlefield.targetFortress?.name ?? "Battlefield");
        const joinedLines = battlefield.participants.map(
          (participant) =>
            `${participant.fortress.name} joined the ${participant.side.toLowerCase()} side with ${participant.armyCommitted} army.`
        );
        const arrivedReinforcements = battlefield.incomingReinforcements.filter(
          (unit) => unit.resolvedAt !== null && unit.cancelledAt === null
        );
        const incomingReinforcements = battlefield.incomingReinforcements.filter(
          (unit) => unit.resolvedAt === null && unit.cancelledAt === null
        );
        const reinforcementLines = arrivedReinforcements.map(
          (unit) =>
            `${unit.attackerFortress.name} reinforcement arrived for ${(unit.reinforcementSide ?? BattlefieldSide.ATTACKER).toLowerCase()} with ${unit.armyAmount} army.`
        );

        return {
          type: "BATTLEFIELD" as const,
          id: battlefield.id,
          launchedAt: battlefield.startedAt,
          resolvedAt: battlefield.resolvedAt ?? battlefield.startedAt,
          targetTileId: battlefield.targetTileId,
          targetName,
          progress: battlefield.progress,
          attackerName: battlefield.attackerBannerFortress.name,
          attackerCommanderName:
            battlefield.attackerBannerFortress.commanderName,
          attackerOwnerId: battlefield.attackerBannerFortress.ownerId,
          defenderName:
            battlefield.defenderBannerFortress?.name ??
            battlefield.targetFortress?.name ??
            "defenders",
          defenderCommanderName:
            battlefield.defenderBannerFortress?.commanderName ??
            battlefield.targetFortress?.commanderName ??
            "Unknown",
          defenderOwnerId:
            battlefield.defenderBannerFortress?.ownerId ??
            battlefield.targetFortress?.ownerId ??
            "",
          sentArmy: battlefield.participants
            .filter(
              (participant) => participant.side === BattlefieldSide.ATTACKER
            )
            .reduce((sum, participant) => sum + participant.armyCommitted, 0),
          defenderArmyEstimate: formatApproximateForce(
            battlefield.defenderArmyRemaining
          ),
          defenderDbLevel: 0,
          defenseBonusPercent: 0,
          defenseMultiplier: 1,
          resolvedAttackPower: battlefield.attackerArmyRemaining,
          resolvedDefensePowerEstimate: formatApproximateForce(
            battlefield.defenderArmyRemaining
          ),
          outcome:
            battlefield.resolvedWinnerSide === BattlefieldSide.ATTACKER
              ? ("ATTACKER_WIN" as const)
              : battlefield.status === BattlefieldStatus.RESOLVED
                ? ("DEFENDER_WIN" as const)
                : ("IN_PROGRESS" as const),
          attackerSurvivors: battlefield.attackerArmyRemaining,
          attackerRetired: 0,
          attackerReturned: battlefield.attackerArmyRemaining,
          defenderLosses: 0,
          pointsLooted:
            battlefield.resolvedWinnerSide === BattlefieldSide.ATTACKER
              ? battlefield.pointsReward
              : 0,
          foodLooted: 0,
          armyLooted: 0,
          reportLines: [
            ...formatBattlefieldReportLines({
              targetName,
              targetTileId: battlefield.targetTileId,
              status: battlefield.status,
              winnerSide: battlefield.resolvedWinnerSide,
              attackerBannerName: battlefield.attackerBannerFortress.name,
              defenderBannerName:
                battlefield.defenderBannerFortress?.name ??
                battlefield.targetFortress?.name ??
                null,
              attackerArmyRemaining: battlefield.attackerArmyRemaining,
              defenderArmyRemaining: battlefield.defenderArmyRemaining,
              participantCount: battlefield.participants.length,
              incomingCount: incomingReinforcements.length,
              arrivedReinforcementCount: arrivedReinforcements.length,
              pointsReward: battlefield.pointsReward,
            }),
            ...joinedLines,
            ...reinforcementLines,
          ],
        };
      })
    : [];
  const battleReports = [...battlefieldReports, ...legacyBattleReports]
    .sort((left, right) => right.resolvedAt.getTime() - left.resolvedAt.getTime())
    .slice(0, 5);
  const visibleFortresses = cycle.fortresses.filter((fortress) => {
    if (
      fortress.fortressKind === FortressKind.LOOT_CAMP ||
      fortress.fortressKind === FortressKind.DWARF_RUNE
    ) {
      return (
        fortress.health > 0 &&
        fortress.expiresAt !== null &&
        fortress.expiresAt > now
      );
    }

    return (
      fortress.fortressKind !== FortressKind.UNICORN_DECOY ||
      fortress.health > 0
    );
  });
  const mapFortresses = visibleFortresses.map((fortress) => {
    const canRevealUnicornDecoy =
      fortress.fortressKind === FortressKind.UNICORN_DECOY &&
      fortress.unicornDecoySourceFortressId === playerFortressId;
    const disguisedSource =
      fortress.fortressKind === FortressKind.UNICORN_DECOY &&
      !canRevealUnicornDecoy
        ? fortress.unicornDecoySourceFortress
        : null;
    const displayFortressKind = disguisedSource
      ? FortressKind.PLAYER
      : fortress.fortressKind;
    const displayName = disguisedSource?.name ?? fortress.name;
    const displayCommanderName =
      disguisedSource?.commanderName ?? fortress.commanderName;
    const displayPoints = disguisedSource?.points ?? fortress.points;
    const displayGold = disguisedSource?.gold ?? fortress.gold;
    const displayRace = disguisedSource?.race ?? fortress.race;
    const displayIsNpc = disguisedSource ? false : fortress.isNpc;
    const displayOwner = disguisedSource?.owner ?? fortress.owner;
    const runeSuppression = activeRuneSuppressions.find(
      (suppression) => suppression.runeFortressId === fortress.id
    );
    const runeOwnerId = runeSuppression?.fortress.id ?? null;

    return {
    id: fortress.id,
    commanderName: getDisplayName(
      displayCommanderName,
      fortress.id === cycle.crownedFortressId && !displayIsNpc
    ),
    name: getDisplayName(
      displayName,
      fortress.id === cycle.crownedFortressId && !displayIsNpc
    ),
    rawName: displayName,
    points: displayPoints,
    gold: displayGold,
    isNpc: displayIsNpc,
    health: fortress.health,
    maxHealth: fortress.maxHealth,
    lootCampVariant: fortress.lootCampVariant,
    expiresAt: fortress.expiresAt,
    sizeTiles: fortress.sizeTiles,
    iconLabel: fortress.iconLabel,
    fortressKind: displayFortressKind,
    unicornDecoyLevel: canRevealUnicornDecoy ? fortress.unicornDecoyLevel : null,
    displayedCastleLevel: getDisplayedCastleLevel(fortress.level),
    population: getFortressPopulation(fortress.level, getEffectiveRace(fortress)),
    defenseMultiplier: getFortressDefenseMultiplier(
      fortress.level,
      getEffectiveRace(fortress),
      countCastleSpecializations(fortress.castleUpgradeSpecializations)
    ),
    food: fortress.food,
    army: fortress.army,
    castleSpecializationCounts: countCastleSpecializations(
      fortress.castleUpgradeSpecializations
    ),
    minersAssigned: fortress.minersAssigned,
    farmersAssigned: fortress.farmersAssigned,
    recruitersAssigned: fortress.recruitersAssigned,
    race: disguisedSource ? disguisedSource.race : getEffectiveRace(fortress),
    rawRace: displayRace,
    dwarfRune: runeSuppression
      ? {
          ownerName: runeSuppression.fortress.name,
          ownerCommanderName: runeSuppression.fortress.commanderName,
          targetFortressId: runeSuppression.targetFortressId,
          bounty: DWARF_DEEP_MINING_RUNE_BOUNTY,
        }
      : null,
    isSlayerOfA: fortress.id === cycle.crownedFortressId && !displayIsNpc,
    currentAction: fortress.currentAction,
    mapX: fortress.mapX,
    mapY: fortress.mapY,
    spriteSeedId: disguisedSource?.id ?? fortress.id,
    unitSpriteVariant: normalizeUnitSpriteVariant(fortress.unitSpriteVariant),
    unitCosmeticVariant: displayOwner?.unitCosmeticVariant ?? null,
    fortressCosmeticVariant: displayOwner?.fortressCosmeticVariant ?? null,
    isCurrentUser: fortress.ownerId === userId,
    isTargetable:
      playerFortressId !== null &&
      gameplayOpen &&
      fortress.id !== playerFortressId &&
      fortress.fortressKind !== FortressKind.MEGA &&
      (fortress.fortressKind !== FortressKind.DWARF_RUNE ||
        runeOwnerId !== playerFortressId) &&
      ((fortress.fortressKind !== FortressKind.LOOT_CAMP &&
        fortress.fortressKind !== FortressKind.DWARF_RUNE) ||
        (fortress.health > 0 &&
          fortress.expiresAt !== null &&
          fortress.expiresAt > now)),
  };
  });
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
    ? (latestResolvedSeason.cycle.fortresses.find(
        (fortress) => fortress.ownerId === userId
      ) ?? null)
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
  const activeBattleTileIds = new Set(
    cycle.battlefields
      .map((battlefield) => battlefield.targetTileId)
      .filter((tileId): tileId is string => tileId !== null)
  );
  const homeOwnership =
    cycle.mapHexOwnerships.find((ownership) =>
      isHomeOfATile(ownership.tileId)
    ) ?? null;
  const homeActiveBattle =
    cycle.battlefields.find((battlefield) =>
      battlefield.targetTileId === HOME_OF_A_TILE_ID
    ) ?? null;
  const homeHolders = cycle.homeOfAHolders.map((holder) => ({
    fortressId: holder.fortressId,
    fortressName: holder.fortress.name,
    commanderName: holder.fortress.commanderName,
    contributionWeight: holder.contributionWeight,
    isCurrentUser: holder.fortress.ownerId === userId,
  }));
  const homeBanner = cycle.homeOfAHolders[0]?.bannerFortress ?? null;
  const canAttackHomeOfA =
    gameplayOpen &&
    playerFortress !== null &&
    playerFortress.army > 0 &&
    homeOwnership?.ownerFortressId !== playerFortress.id &&
    !activeBattleTileIds.has(HOME_OF_A_TILE_ID);
  const mappedMapHexes: Array<{
    id: string;
    tileId: string;
    claimedAt: Date | null;
    ownerFortressId: string | null;
    ownerName: string;
    ownerCommanderName: string;
    isCurrentUser: boolean;
    hasActiveBattle: boolean;
    canAttack: boolean;
    claimCost: number | null;
    bonus: { label: string };
    isHomeOfA: boolean;
    pointIncome: number | null;
    holders: typeof homeHolders;
  }> = cycle.mapHexOwnerships.map((ownership) => {
    const tile = getTileById(ownership.tileId);
    const bonus = isHomeOfATile(ownership.tileId)
      ? getHomeOfABonus()
      : getTileBonus(tile);

    return {
      id: ownership.id,
      tileId: ownership.tileId,
      claimedAt: ownership.claimedAt,
      ownerFortressId: ownership.ownerFortressId,
      ownerName: ownership.ownerFortress.name,
      ownerCommanderName: ownership.ownerFortress.commanderName,
      isCurrentUser: ownership.ownerFortress.ownerId === userId,
      hasActiveBattle: activeBattleTileIds.has(ownership.tileId),
      canAttack:
        gameplayOpen &&
        playerFortress !== null &&
        playerFortress.army > 0 &&
        ownership.ownerFortressId !== playerFortress.id &&
        !activeBattleTileIds.has(ownership.tileId),
      claimCost: null,
      bonus,
      isHomeOfA: isHomeOfATile(ownership.tileId),
      pointIncome: isHomeOfATile(ownership.tileId)
        ? HOME_OF_A_POINT_INCOME
        : null,
      holders: isHomeOfATile(ownership.tileId) ? homeHolders : [],
    };
  });

  if (!homeOwnership) {
    mappedMapHexes.push({
      id: "home-of-a-neutral",
      tileId: HOME_OF_A_TILE_ID,
      claimedAt: null,
      ownerFortressId: null,
      ownerName: "Neutral",
      ownerCommanderName: "Home of A",
      isCurrentUser: false,
      hasActiveBattle: activeBattleTileIds.has(HOME_OF_A_TILE_ID),
      canAttack: canAttackHomeOfA,
      claimCost: null,
      bonus: getHomeOfABonus(),
      isHomeOfA: true,
      pointIncome: HOME_OF_A_POINT_INCOME,
      holders: [],
    });
  }

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
      upgradesUnlockedAt:
        cycle.upgradesUnlockedAt ?? cycle.testingStartedAt ?? cycle.activeStartedAt,
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
                ? "Testing mode is live. You can still join before testing ends; sandbox progress resets before the real season."
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
          gold: playerFortress.gold,
          level: playerFortress.level,
          displayedCastleLevel: getDisplayedCastleLevel(playerFortress.level),
          population: getFortressPopulation(
            playerFortress.level,
            getEffectiveRace(playerFortress)
          ),
          defenseMultiplier: getFortressDefenseMultiplier(
            playerFortress.level,
            getEffectiveRace(playerFortress),
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
          gold: playerFortress.gold,
          level: playerFortress.level,
          displayedCastleLevel: getDisplayedCastleLevel(playerFortress.level),
          population: getFortressPopulation(
            playerFortress.level,
            getEffectiveRace(playerFortress)
          ),
          defenseMultiplier: getFortressDefenseMultiplier(
            playerFortress.level,
            getEffectiveRace(playerFortress),
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
          canRename: activeOpen && playerFortress.gold >= 10,
          isTestingPhase: cycle.status === CycleStatus.TESTING,
          canSetAction: gameplayOpen && playerFortress.race !== null,
          locationShuffleCost,
          freeLocationShuffleAvailable: locationShuffleCount === 0,
          hasOutgoingAttackUnits,
          outboundAttackUnitCount,
          maxSimultaneousAttacks,
          canShuffleLocation:
            gameplayOpen &&
            playerFortress.race !== null &&
            locationShuffleCost !== null &&
            playerFortress.gold >= locationShuffleCost,
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
          factionSuppression: playerSuppression
            ? {
                runeFortressId: playerSuppression.runeFortressId,
                ownerName: playerSuppression.fortress.name,
                ownerCommanderName: playerSuppression.fortress.commanderName,
                activeUntil: playerSuppression.activeUntil,
              }
            : null,
          raceBuffs: {
            tier: raceBuffTier,
            tierThreeUnlocksAt: raceTierThreeUnlocksAt,
            deepMiningLatest: latestDwarfDeepMiningRoll
              ? {
                  outcome: latestDwarfDeepMiningRoll.outcome,
                  committedArmy: latestDwarfDeepMiningRoll.committedArmy,
                  pointDelta: latestDwarfDeepMiningRoll.pointDelta,
                  armyDelta: latestDwarfDeepMiningRoll.armyDelta,
                  activeUntil: latestDwarfDeepMiningRoll.activeUntil,
                  createdAt: latestDwarfDeepMiningRoll.createdAt,
                  targetName:
                    latestDwarfDeepMiningRoll.targetFortress?.name ?? null,
                  runeFortressId: latestDwarfDeepMiningRoll.runeFortressId,
                  runeHealth:
                    latestDwarfDeepMiningRoll.runeFortress?.health ?? null,
                  runeArmy:
                    latestDwarfDeepMiningRoll.runeFortress?.army ?? null,
                }
              : null,
            canActivateDeepMining:
              playerFortress.race === "DWARFS" &&
              (!latestDwarfDeepMiningUse ||
                getHelsinkiHourKey(latestDwarfDeepMiningUse.usedAt) !==
                  currentHourKey),
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
              raceBuffTier >= 3 &&
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
            canInstantRecall:
              playerFortress.race === "SPACE_MURINES" &&
              raceBuffTier >= 3 &&
              (!latestInstantRecallUse ||
                getHelsinkiHourKey(latestInstantRecallUse.usedAt) !==
                  currentHourKey),
            canClaimUnicornTeleport:
              playerFortress.race === "UNSTABLE_UNICORNS" &&
              raceBuffTier >= 1 &&
              activeUnicornTeleportToken === null &&
              activeUnicornTemporaryTeleport === null &&
              (!latestUnicornTeleportClaim ||
                getHelsinkiHourKey(latestUnicornTeleportClaim.usedAt) !==
                  currentHourKey),
            hasUnicornTeleportToken: activeUnicornTeleportToken !== null,
            unicornTeleportTokenExpiresAt:
              activeUnicornTeleportToken?.expiresAt ?? null,
          },
          activeUnicornTeleport: activeUnicornTemporaryTeleport
            ? {
                originTile: `${activeUnicornTemporaryTeleport.originMapX}:${activeUnicornTemporaryTeleport.originMapY}`,
                temporaryTile: `${activeUnicornTemporaryTeleport.temporaryMapX}:${activeUnicornTemporaryTeleport.temporaryMapY}`,
                returnAt: activeUnicornTemporaryTeleport.returnAt,
                isReturnDelayed: activeUnicornTemporaryTeleport.returnAt <= now,
              }
            : null,
          growPerTick: calculateTickProduction({
            ...playerFortress,
            castleSpecializations:
              playerCastleSpecializationCounts ?? undefined,
          }).goldProduced,
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
    mapHexes: mappedMapHexes,
    homeOfA: {
      tileId: HOME_OF_A_TILE_ID,
      pointIncome: HOME_OF_A_POINT_INCOME,
      ownerFortressId: homeOwnership?.ownerFortressId ?? null,
      ownerName: homeOwnership?.ownerFortress.name ?? "Neutral",
      ownerCommanderName:
        homeOwnership?.ownerFortress.commanderName ?? "Home of A",
      bannerFortressId: homeBanner?.id ?? null,
      bannerName: homeBanner?.name ?? null,
      holders: homeHolders,
      activeBattlefieldId: homeActiveBattle?.id ?? null,
      canAttack: canAttackHomeOfA,
      attackDisabledReason: canAttackHomeOfA
        ? null
        : !gameplayOpen
          ? "Home of A can only be attacked during gameplay."
          : !playerFortress
            ? "Join the cycle to attack Home of A."
            : playerFortress.army <= 0
              ? "You need idle army to attack Home of A."
              : homeOwnership?.ownerFortressId === playerFortress.id
                ? "Your banner already controls Home of A."
                : activeBattleTileIds.has(HOME_OF_A_TILE_ID)
                  ? "Home of A is already contested."
                  : null,
    },
    battlefields: cycle.battlefields.map((battlefield) => {
      const currentParticipant = playerFortress
        ? battlefield.participants.find(
            (participant) => participant.fortressId === playerFortress.id
          )
        : null;

      return {
        id: battlefield.id,
        targetTileId: battlefield.targetTileId,
        targetName:
          battlefield.targetTileId !== null
            ? `Tile ${battlefield.targetTileId}`
            : (battlefield.targetFortress?.name ?? "Battlefield"),
        progress: battlefield.progress,
        attackerArmyRemaining: battlefield.attackerArmyRemaining,
        defenderArmyRemaining: battlefield.defenderArmyRemaining,
        startedAt: battlefield.startedAt,
        attackerBanner: {
          id: battlefield.attackerBannerFortress.id,
          name: battlefield.attackerBannerFortress.name,
          commanderName: battlefield.attackerBannerFortress.commanderName,
        },
        defenderBanner: battlefield.defenderBannerFortress
          ? {
              id: battlefield.defenderBannerFortress.id,
              name: battlefield.defenderBannerFortress.name,
              commanderName: battlefield.defenderBannerFortress.commanderName,
            }
          : null,
        participantCount: battlefield.participants.length,
        currentUserSide: currentParticipant?.side ?? null,
        incomingReinforcements: battlefield.incomingReinforcements.map(
          (unit) => ({
            id: unit.id,
            side: unit.reinforcementSide ?? BattlefieldSide.ATTACKER,
            armyAmount: unit.armyAmount,
            arrivesAt: unit.arrivesAt,
            fortressName: unit.attackerFortress.name,
            isCurrentUser: unit.attackerFortress.ownerId === userId,
          })
        ),
        canJoinAttacker:
          gameplayOpen &&
          playerFortress !== null &&
          playerFortress.army > 0 &&
          currentParticipant?.side !== BattlefieldSide.DEFENDER,
        canJoinDefender:
          gameplayOpen &&
          playerFortress !== null &&
          playerFortress.army > 0 &&
          battlefield.defenderBannerFortress !== null &&
          currentParticipant?.side !== BattlefieldSide.ATTACKER,
      };
    }),
    attackUnits: cycle.attackUnits.map((unit) => ({
      id: unit.id,
      armyAmount:
        unit.attackerFortress.race === "UNSTABLE_UNICORNS" &&
        !suppressedFortressIds.has(unit.attackerFortress.id) &&
        unit.attackerFortress.ownerId !== userId
          ? null
          : unit.armyAmount,
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
      canInstantRecall:
        Boolean(userId) &&
        unit.attackerFortress.ownerId === userId &&
        unit.recalledAt === null &&
        unit.attackerFortress.race === "SPACE_MURINES" &&
        raceBuffTier >= 3 &&
        (!latestInstantRecallUse ||
          getHelsinkiHourKey(latestInstantRecallUse.usedAt) !== currentHourKey),
      attacker: {
        id: unit.attackerFortress.id,
        name: unit.attackerFortress.name,
        mapX: unit.attackerFortress.mapX,
        mapY: unit.attackerFortress.mapY,
        race: suppressedFortressIds.has(unit.attackerFortress.id)
          ? null
          : unit.attackerFortress.race,
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
        ? (latestResolvedSeason.communityWishVotingEndsAt ??
          latestResolvedSeason.communityWishProposalEndsAt)
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
      currentUserCommunityWish: currentUserCommunityWish?.requestText ?? "",
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
        ? visibleFortresses
            .filter((fortress) => {
              const runeSuppression = activeRuneSuppressions.find(
                (suppression) => suppression.runeFortressId === fortress.id
              );

              return (
                fortress.id !== playerFortress.id &&
                fortress.fortressKind !== FortressKind.MEGA &&
                runeSuppression?.fortress.id !== playerFortress.id
              );
            })
            .map((fortress) => {
              const canRevealUnicornDecoy =
                fortress.fortressKind === FortressKind.UNICORN_DECOY &&
                fortress.unicornDecoySourceFortressId === playerFortress.id;
              const disguisedSource =
                fortress.fortressKind === FortressKind.UNICORN_DECOY &&
                !canRevealUnicornDecoy
                  ? fortress.unicornDecoySourceFortress
                  : null;

              return {
              id: fortress.id,
              commanderName: getDisplayName(
                disguisedSource?.commanderName ?? fortress.commanderName,
                fortress.id === cycle.crownedFortressId &&
                  !(disguisedSource ? false : fortress.isNpc)
              ),
              name: getDisplayName(
                disguisedSource?.name ?? fortress.name,
                fortress.id === cycle.crownedFortressId &&
                  !(disguisedSource ? false : fortress.isNpc)
              ),
              rawName: disguisedSource?.name ?? fortress.name,
              level: fortress.level,
              race: disguisedSource?.race ?? fortress.race,
              points: disguisedSource?.points ?? fortress.points,
              isNpc: disguisedSource ? false : fortress.isNpc,
              fortressKind: disguisedSource
                ? FortressKind.PLAYER
                : fortress.fortressKind,
              lootCampVariant: fortress.lootCampVariant,
              expiresAt: fortress.expiresAt,
              unicornDecoyLevel: canRevealUnicornDecoy
                ? fortress.unicornDecoyLevel
                : null,
              health: fortress.health,
              maxHealth: fortress.maxHealth,
              army: fortress.army,
              castleSpecializationCounts: countCastleSpecializations(
                fortress.castleUpgradeSpecializations
              ),
              currentAction: fortress.currentAction,
              };
            })
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
