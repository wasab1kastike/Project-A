import { prisma } from "@/lib/prisma";
import {
  ChatMessageType,
  CommunityWishStatus,
  CycleStatus,
  BattlefieldSide,
  BattlefieldStatus,
  ArmyOrderType,
  CastleUpgradeSpecialization,
  DiplomacyRelationStatus,
  FortressKind,
  OrkBossOrderKind,
  OrkWaaaghInvestmentKind,
  Prisma,
  RaceAbilityKind,
  WinnerRequestStatus,
  TerritoryCampaignStatus,
  NukeComponentKind,
  NukeComponentRoundStatus,
  type PrismaClient,
} from "@/lib/prisma-client";
import {
  ACTIVE_PLAYER_CAP,
  HOME_OF_A_TILE_ID,
  MAX_SIMULTANEOUS_ATTACKS_BASE,
  NPC_SYSTEM_USER_EMAIL,
  getActiveLocationShuffleCost,
  GOD_EMPEROR_CHAT_AUTHOR_NAME,
  GOD_EMPEROR_USER_EMAIL,
  getHomeOfABossReward,
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
import { getAttackTravelMinutes, normalizeUnitSpriteVariant } from "./attacks";
import {
  formatApproximateForce,
  formatRaidBattleReport,
  formatRaidRecallReport,
} from "./battle-report";
import { mapActiveBattlefields } from "./active-battlefield-read-model";
import {
  ensureBattlefieldPointRewardColumn,
  ensureBattalionWarSchema,
  ensureCommanderRegistrationColumn,
  ensureHomeOfABossSchema,
  ensureLastReadChatColumn,
} from "./schema-guards";
import { classifyTickHealth, getActiveCycleMinutesBehind } from "./tick";
import {
  canFortressLevelUp,
  getFortressAttackDamage,
  getFortressUpgradeCost,
  getFortressUpgradeDurationMinutes,
  getMaxSimultaneousAttacks,
} from "./upgrades";
import {
  getHelsinkiDayKey,
  getHelsinkiHourKey,
  getUnicornShatteredRealityAvailability,
  getUnicornTeleportClaimAvailability,
  getRaceBuffTier,
} from "./race-buffs";
import { addHours } from "./time";
import { countCastleSpecializations } from "./specializations";
import { DWARF_DEEP_MINING_RUNE_BOUNTY } from "./dwarf-deep-mining";
import {
  compareLeaderboardFortresses,
  getLeaderboardMetric,
  getLeaderboardTitleConfigs,
  getLeaderboardTitleHolders,
  type LeaderboardCategory,
  type RankedLeaderboardEntry,
} from "./leaderboard-titles";
import { ORK_BOSS_ORDER_CONFIG, ORK_WAAAGH_INVESTMENT_CONFIG } from "./orks";
import { HEX_TILES, type HexTile } from "./map-hex";
import { getHomeOfAMapPosition } from "./mega-fortress";
import {
  getHomeOfABonus,
  getTileBonus,
  getTileById,
  isHomeOfATile,
  isTileConnectedToFortressOrOwnedTiles,
  sumTileBonuses,
} from "./territory";
import { getBattlefieldCasualtyBudget } from "./battlefield-rules";
import { getTileAttackBlockedReason } from "./combat-targeting";
import {
  findDiplomacyRelationForPair,
  getEffectiveDiplomacyStatus,
  getDiplomacyPressureBlockedReason,
} from "./politics";
import {
  CAMPAIGN_SIEGE_THRESHOLD,
  getCampaignStartBlockedReason,
} from "./campaigns";
import {
  getNeutralPressureClaimWinner,
  getDistanceAdjustedTilePressureClaimThreshold,
  getPressureTargetBlockedReason,
  getTilePressureClaimThreshold,
  getTilePressurePriorityLimit,
  getTilePressurePrioritySlot,
  sortTilePressureQueue,
} from "./tile-pressure";
import { isSeasonFourRuleset } from "./rulesets";
import { calculateRoadAdjustedTravel } from "./road-travel";
import { getTradeWagonResourceLimit } from "./trading";
import {
  EMPTY_NUKE_COMPONENT_CARGO,
  getNukeBiddingWindowForDate,
  getNukeComponentLabel,
  getNukeRoundState,
  NUKE_COMPONENT_KINDS,
  NUKE_LAUNCH_GOLD_COST,
  type NukeComponentCargo,
} from "./nukes";

export type HomePageState = Awaited<ReturnType<typeof getHomePageState>>;

const helsinkiTimeFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/Helsinki",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

function formatHelsinkiTime(value: Date) {
  return helsinkiTimeFormatter.format(value);
}

function formatBattlefieldReportLines({
  targetName,
  targetTileId,
  targetTileBonusLabel,
  status,
  winnerSide,
  attackerBannerName,
  defenderBannerName,
  attackerArmyRemaining,
  defenderArmyRemaining,
  attackerLosses,
  defenderLosses,
  participantCount,
  incomingCount,
  arrivedReinforcementCount,
  casualtiesPerTick,
  pointsReward,
  foodReward,
  pointReward = 0,
}: {
  targetName: string;
  targetTileId: string | null;
  targetTileBonusLabel?: string | null;
  status: BattlefieldStatus;
  winnerSide: BattlefieldSide | null;
  attackerBannerName: string;
  defenderBannerName: string | null;
  attackerArmyRemaining: number;
  defenderArmyRemaining: number;
  attackerLosses: number;
  defenderLosses: number;
  participantCount: number;
  incomingCount: number;
  arrivedReinforcementCount: number;
  casualtiesPerTick: number;
  pointsReward: number;
  foodReward: number;
  pointReward?: number;
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
    lines.push(
      `Casualties: attackers lost ${attackerLosses}, defenders lost ${defenderLosses}.`
    );

    if (targetTileId) {
      lines.push(
        winnerSide === BattlefieldSide.ATTACKER
          ? `Ownership of tile ${targetTileId} transferred to ${attackerBannerName}${targetTileBonusLabel ? ` with ${targetTileBonusLabel}` : ""}.`
          : `Ownership of tile ${targetTileId} stayed with ${defenderBannerName ?? "the defender"}${targetTileBonusLabel ? ` and kept ${targetTileBonusLabel}` : ""}.`
      );
    }

    if ((pointsReward > 0 || foodReward > 0) && !targetTileId) {
      lines.push(
        `Castle loot paid out: ${pointsReward} gold and ${foodReward} food.`
      );
    }
    if (pointReward > 0 && !targetTileId) {
      lines.push(`Score stolen: ${pointReward} points.`);
    }
  } else {
    lines.push(
      `Battle continues with ${attackerArmyRemaining} attacker army and ${defenderArmyRemaining} defender army committed; current casualty pace is ${casualtiesPerTick} total units per tick.`
    );
  }

  return lines;
}

const BUILDING_SPECIALIZATIONS = [
  CastleUpgradeSpecialization.DEFENSE,
  CastleUpgradeSpecialization.POINTS,
  CastleUpgradeSpecialization.FOOD,
  CastleUpgradeSpecialization.MILITARY,
  CastleUpgradeSpecialization.TRADE,
] as const;

type BuildingUpgradeOption = {
  level: number;
  maxLevel: number | null;
  nextCost: number | null;
  nextDurationMinutes: number | null;
  canUpgrade: boolean;
};

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
    ensureBattlefieldPointRewardColumn(db),
    ensureBattalionWarSchema(db),
    ensureCommanderRegistrationColumn(db),
    ensureHomeOfABossSchema(db),
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
          unitsKilled: true,
          goblinsKilled: true,
          resourcesStolen: true,
          deliveredCargoValue: true,
          interceptedCargoValue: true,
          level: true,
          food: true,
          army: true,
          recruitmentQueue: true,
          minersAssigned: true,
          farmersAssigned: true,
          recruitersAssigned: true,
          pressureWorkersAssigned: true,
          race: true,
          skillPurchases: {
            select: { nodeKey: true },
          },
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
          castleUpgradeProjects: {
            where: {
              completedAt: null,
            },
            orderBy: [{ startedAt: "asc" }, { id: "asc" }],
            take: 1,
            select: {
              level: true,
              specialization: true,
              goldCost: true,
              startedAt: true,
              completesAt: true,
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
              targetFortressId: true,
              runeFortressId: true,
              goldCost: true,
              maintenanceGoldPerTick: true,
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
          orkScrapBank: {
            select: {
              scrap: true,
            },
          },
          orkScrapEvents: {
            orderBy: [{ createdAt: "desc" }, { id: "desc" }],
            take: 5,
            select: {
              id: true,
              reason: true,
              delta: true,
              balanceAfter: true,
              tileId: true,
              createdAt: true,
              targetFortress: {
                select: {
                  name: true,
                  commanderName: true,
                },
              },
            },
          },
          orkBossOrders: {
            orderBy: [{ usedAt: "desc" }, { id: "desc" }],
            select: {
              id: true,
              kind: true,
              scrapCost: true,
              goldCost: true,
              activeFrom: true,
              activeUntil: true,
              usedAt: true,
            },
          },
          orkWaaaghInvestments: {
            orderBy: [{ createdAt: "desc" }, { id: "desc" }],
            select: {
              id: true,
              kind: true,
              scrapCost: true,
              createdAt: true,
              waaaghActivationId: true,
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
          unicornShatteredRealityRolls: {
            orderBy: [{ createdAt: "desc" }, { id: "desc" }],
            take: 3,
            select: {
              outcome: true,
              summary: true,
              armyDelta: true,
              garrisonArmyDelta: true,
              goldDelta: true,
              foodDelta: true,
              activeUntil: true,
              createdAt: true,
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
            take: 3,
            select: {
              outcome: true,
              committedGold: true,
              goldDelta: true,
              armyDelta: true,
              recruitmentQueueDelta: true,
              resolvedAt: true,
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
          garrisons: {
            orderBy: [{ createdAt: "desc" }, { id: "desc" }],
            select: {
              id: true,
              army: true,
              tileId: true,
              createdAt: true,
              updatedAt: true,
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
          reinforcementSide: true,
          fortifyTargetTileId: true,
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
          reinforcementBattlefield: {
            select: {
              id: true,
              targetTileId: true,
            },
          },
          reinforcementBattalion: {
            select: {
              id: true,
              name: true,
              garrisonedAt: true,
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
          ownershipPressure: true,
          ownerFortress: {
            select: {
              id: true,
              ownerId: true,
              name: true,
              commanderName: true,
              race: true,
            },
          },
        },
      },
      mapHexRoads: {
        select: {
          tileId: true,
          crossings: true,
          level: true,
          lastUsedAt: true,
        },
      },
      battalions: {
        select: {
          id: true,
          fortressId: true,
          name: true,
          size: true,
          maxSize: true,
          tier: true,
          xp: true,
          readyAt: true,
          stance: true,
          mode: true,
          garrisonedAt: true,
        },
      },
      warFronts: {
        select: {
          id: true,
          attackerFortressId: true,
          enemyFortressId: true,
          status: true,
          aggression: true,
        },
      },
      warPolicies: {
        select: {
          id: true,
          fortressId: true,
          maxArmySize: true,
          guardPercent: true,
          defaultAggression: true,
          allianceSupportAttack: true,
          allianceSupportDefense: true,
          allianceSupportPercent: true,
        },
      },
      convoyLegs: {
        where: { status: "IN_TRANSIT" },
        select: {
          id: true,
          fromFortressId: true,
          toFortressId: true,
          status: true,
          gold: true,
          food: true,
          army: true,
          points: true,
          nukeFuel: true,
          nukeRocket: true,
          nukeWrathOfA: true,
          baseCargoValue: true,
          deedTileId: true,
          departedAt: true,
          arrivesAt: true,
        },
      },
      tilePressurePriorities: {
        select: {
          id: true,
          fortressId: true,
          tileId: true,
          weight: true,
        },
      },
      tilePressureStates: {
        select: {
          tileId: true,
          fortressId: true,
          pressure: true,
        },
      },
      armyOrders: {
        where: {
          status: "ACTIVE",
        },
        select: {
          id: true,
          fortressId: true,
          type: true,
          targetTileId: true,
          committedArmy: true,
        },
      },
      territoryCampaigns: {
        where: {
          status: {
            in: ["BUILDING", "SIEGE_WARNING", "ENGAGED"],
          },
        },
        select: {
          id: true,
          attackerFortressId: true,
          defenderFortressId: true,
          armyOrderId: true,
          targetTileId: true,
          status: true,
          progress: true,
          responseEndsAt: true,
        },
      },
      diplomacyRelations: {
        select: {
          fortressAId: true,
          fortressBId: true,
          status: true,
          warStartsAt: true,
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
          targetFortressId: true,
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
              fortressKind: true,
              army: true,
              health: true,
              maxHealth: true,
            },
          },
          attackerBannerFortress: {
            select: {
              id: true,
              name: true,
              commanderName: true,
              race: true,
            },
          },
          defenderBannerFortress: {
            select: {
              id: true,
              name: true,
              commanderName: true,
              race: true,
            },
          },
          participants: {
            select: {
              fortressId: true,
              side: true,
              armyCommitted: true,
              armyRemaining: true,
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
      leaderboards: {
        points: [],
        unitsKilled: [],
        tilesOwned: [],
        goblinsKilled: [],
        resourcesStolen: [],
        deliveredCargoValue: [],
        interceptedCargoValue: [],
      },
      leaderboardTitles: [],
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
        submissionHint: "Community wish voting is not open.",
        proposals: [],
      },
      availableTargets: [],
      canJoinCycle: false,
      canEditRegistrationName: false,
      incomingOfferCount: 0,
      pendingDiplomacyCount: 0,
      incidentCount: 0,
      recallableOrderCount: 0,
      nukeState: null,
      recentActivity: [],
      emptyStateMessage:
        "No unresolved cycle exists yet. Run the seed flow to bootstrap registration.",
    };
  }

  const isSeasonFour = isSeasonFourRuleset(cycle.ruleset);
  const pressureClaimThreshold = getTilePressureClaimThreshold(isSeasonFour);
  const homeMonumentReason = "The center monument is inaccessible in Season 4.";
  const homeTileBonus = isSeasonFour
    ? {
        gold: 0,
        points: 0,
        food: 0,
        army: 0,
        population: 0,
        defensePercent: 0,
        label: "Monument: inaccessible",
      }
    : getHomeOfABonus();

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
  const [
    incomingOfferCount,
    pendingDiplomacyCount,
    incidentCount,
    recallableOrderCount,
  ] =
    playerFortress && isSeasonFour
      ? await Promise.all([
          db.tradeOffer.count({
            where: {
              cycleId: cycle.id,
              receiverFortressId: playerFortress.id,
              status: "PENDING",
            },
          }),
          db.diplomacyRelation.count({
            where: {
              cycleId: cycle.id,
              OR: [
                { fortressAId: playerFortress.id },
                { fortressBId: playerFortress.id },
              ],
              AND: [
                {
                  OR: [
                    {
                      status: DiplomacyRelationStatus.ALLIANCE_PENDING,
                      allianceProposedById: { not: playerFortress.id },
                    },
                    {
                      status: DiplomacyRelationStatus.PEACE_PENDING,
                      peaceProposedById: { not: playerFortress.id },
                    },
                    {
                      status: DiplomacyRelationStatus.WAR_PENDING,
                      warDeclaredById: { not: playerFortress.id },
                      warStartsAt: { gt: now },
                    },
                    {
                      trustUpgradeProposedById: {
                        not: playerFortress.id,
                      },
                      trustUpgradeTier: { not: null },
                    },
                  ],
                },
              ],
            },
          }),
          db.covertIncident.count({
            where: {
              cycleId: cycle.id,
              OR: [
                { detectingFortressId: playerFortress.id },
                { raiderFortressId: playerFortress.id },
              ],
              casusBelliExpiresAt: { gt: now },
            },
          }),
          db.armyOrder.count({
            where: {
              cycleId: cycle.id,
              fortressId: playerFortress.id,
              status: "ACTIVE",
              OR: [
                { campaign: null },
                { campaign: { status: { notIn: ["ENGAGED", "RESOLVED"] } } },
              ],
            },
          }),
        ])
      : [0, 0, 0, 0];

  const nukeState = isSeasonFour
    ? await (async () => {
        const window = getNukeBiddingWindowForDate(now);
        const round = await db.nukeComponentRound.findUnique({
          where: {
            cycleId_startsAt: {
              cycleId: cycle.id,
              startsAt: window.startsAt,
            },
          },
          include: {
            bids: {
              where: { fortressId: playerFortress?.id ?? "__spectator__" },
              orderBy: [{ createdAt: "desc" }, { id: "desc" }],
              select: {
                id: true,
                componentKind: true,
                amount: true,
                createdAt: true,
              },
            },
          },
        });
        const inventoryRows = playerFortress
          ? await db.nukeComponentInventory.findMany({
              where: { cycleId: cycle.id, fortressId: playerFortress.id },
              select: { componentKind: true, quantity: true },
            })
          : [];
        const inventory: NukeComponentCargo = { ...EMPTY_NUKE_COMPONENT_CARGO };

        for (const row of inventoryRows) {
          inventory[row.componentKind] = row.quantity;
        }

        const recentLaunches = await db.nukeLaunch.findMany({
          where: { cycleId: cycle.id },
          orderBy: [{ launchedAt: "desc" }, { id: "desc" }],
          take: 5,
          select: {
            id: true,
            launcherFortressId: true,
            targetFortressId: true,
            targetLevelBefore: true,
            targetLevelAfter: true,
            armyRemoved: true,
            launchedAt: true,
          },
        });
        const canLaunch =
          playerFortress !== null &&
          playerFortress.gold >= NUKE_LAUNCH_GOLD_COST &&
          NUKE_COMPONENT_KINDS.every((kind) => inventory[kind] >= 1);

        return {
          round: {
            id: round?.id ?? null,
            startsAt: window.startsAt,
            endsAt: window.endsAt,
            status:
              round?.status === NukeComponentRoundStatus.RESOLVED
                ? "resolved"
                : getNukeRoundState(now, window.startsAt, window.endsAt),
            isOpen:
              window.isOpen &&
              round?.status !== NukeComponentRoundStatus.RESOLVED,
            bidsArePrivate: true,
            playerBids:
              round?.bids?.map((bid) => ({
                id: bid.id,
                componentKind: bid.componentKind,
                label: getNukeComponentLabel(bid.componentKind),
                amount: bid.amount,
                createdAt: bid.createdAt,
              })) ?? [],
          },
          inventory,
          canLaunch,
          launchGoldCost: NUKE_LAUNCH_GOLD_COST,
          launchDisabledReason: playerFortress
            ? canLaunch
              ? null
              : playerFortress.gold < NUKE_LAUNCH_GOLD_COST
                ? "Launching a nuke costs 250,000 gold."
                : "Collect Fuel, Rocket, and Wrath of A before launching."
            : "Join the cycle before building nukes.",
          eligibleTargets: playerFortress
            ? playerFortresses
                .filter(
                  (fortress) =>
                    fortress.id !== playerFortress.id &&
                    fortress.fortressKind === FortressKind.PLAYER &&
                    !fortress.isNpc
                )
                .map((fortress) => ({
                  id: fortress.id,
                  name: fortress.name,
                  commanderName: fortress.commanderName,
                  level: fortress.level,
                }))
            : [],
          recentLaunches,
        };
      })()
    : null;

  let recentActivity: Array<{
    id: string;
    type: string;
    label: string;
    timestamp: Date;
    details?: string;
    status?: string;
    tileId?: string;
    deedTileId?: string;
  }> = [];

  if (playerFortress && isSeasonFour) {
    const pfId = playerFortress.id;
    const [offers, incidents, convoys, sieges, orders] = await Promise.all([
      db.tradeOffer.findMany({
        where: {
          cycleId: cycle.id,
          receiverFortressId: pfId,
          status: "PENDING",
        },
        select: { id: true, createdAt: true, senderFortressId: true },
        orderBy: { createdAt: "desc" },
        take: 5,
      }),
      db.covertIncident.findMany({
        where: {
          cycleId: cycle.id,
          OR: [{ detectingFortressId: pfId }, { raiderFortressId: pfId }],
        },
        select: {
          id: true,
          detectedAt: true,
          detectingFortressId: true,
          raiderFortressId: true,
          casusBelliExpiresAt: true,
        },
        orderBy: { detectedAt: "desc" },
        take: 5,
      }),
      db.convoyLeg.findMany({
        where: {
          cycleId: cycle.id,
          OR: [
            { fromFortressId: pfId },
            { toFortressId: pfId },
            { interceptedByOrder: { fortressId: pfId } },
          ],
        },
        select: {
          id: true,
          fromFortressId: true,
          toFortressId: true,
          status: true,
          arrivesAt: true,
          settledAt: true,
          deedTileId: true,
          deedFailureReason: true,
          gold: true,
          food: true,
          army: true,
          points: true,
          bonusGold: true,
          bonusFood: true,
          pointsAwarded: true,
          nukeFuel: true,
          nukeRocket: true,
          nukeWrathOfA: true,
          stolenGold: true,
          stolenFood: true,
          stolenArmy: true,
          stolenPoints: true,
          stolenCargoValue: true,
          baseCargoValue: true,
          interceptedByOrder: { select: { fortressId: true } },
        },
        orderBy: [{ arrivesAt: "desc" }, { settledAt: "desc" }],
        take: 15,
      }),
      db.territoryCampaign.findMany({
        where: {
          cycleId: cycle.id,
          defenderFortressId: pfId,
          status: "SIEGE_WARNING",
        },
        select: { id: true, targetTileId: true, responseEndsAt: true },
      }),
      db.armyOrder.findMany({
        where: {
          cycleId: cycle.id,
          fortressId: pfId,
          status: "ACTIVE",
          type: "CAMPAIGN",
        },
        select: {
          id: true,
          type: true,
          committedArmy: true,
          targetTileId: true,
        },
        take: 5,
      }),
    ]);

    const items: Array<{
      id: string;
      type: string;
      label: string;
      timestamp: Date;
      details?: string;
      status?: string;
      tileId?: string;
      deedTileId?: string;
    }> = [];

    for (const o of offers) {
      items.push({
        id: "offer:" + o.id,
        type: "offer",
        label: "Incoming trade offer",
        timestamp: o.createdAt,
      });
    }
    for (const inc of incidents) {
      const isDetector = inc.detectingFortressId === pfId;
      items.push({
        id: "incident:" + inc.id,
        type: "incident",
        label: isDetector ? "Raid detected" : "Raid exposed",
        timestamp: inc.detectedAt,
        status:
          inc.casusBelliExpiresAt && inc.casusBelliExpiresAt > now
            ? "casus belli active"
            : undefined,
      });
    }
    for (const leg of convoys) {
      const isSender = leg.fromFortressId === pfId;
      const outgoing = leg.fromFortressId === pfId;
      const cargoParts = [
        leg.deedTileId ? `tile ${leg.deedTileId}` : null,
        leg.gold > 0 ? `${leg.gold}g` : null,
        leg.food > 0 ? `${leg.food}f` : null,
        leg.army > 0 ? `${leg.army} army` : null,
        leg.points > 0 ? `${leg.points} pts` : null,
        leg.nukeFuel > 0 ? `${leg.nukeFuel} fuel` : null,
        leg.nukeRocket > 0 ? `${leg.nukeRocket} rocket` : null,
        leg.nukeWrathOfA > 0 ? `${leg.nukeWrathOfA} wrath` : null,
      ].filter(Boolean);
      const cargoSummary = cargoParts.join(", ") || "no cargo";
      const raidedByPlayer = leg.interceptedByOrder?.fortressId === pfId;
      if (leg.status === "IN_TRANSIT") {
        items.push({
          id: "convoy:" + leg.id,
          type: "convoy",
          label: outgoing
            ? leg.arrivesAt <= now
              ? "Outbound convoy awaiting tick"
              : "Outbound convoy en route"
            : leg.arrivesAt <= now
              ? "Inbound convoy awaiting tick"
              : "Inbound convoy en route",
          timestamp: leg.arrivesAt,
          details: cargoSummary,
          deedTileId: leg.deedTileId ?? undefined,
        });
      } else if (leg.status === "DELIVERED") {
        const gains = [
          `value ${leg.baseCargoValue}`,
          leg.bonusGold + leg.bonusFood > 0
            ? `bonus ${leg.bonusGold}g/${leg.bonusFood}f`
            : null,
          leg.pointsAwarded > 0 ? `${leg.pointsAwarded} trade pts` : null,
        ].filter(Boolean);
        items.push({
          id: "convoy:" + leg.id,
          type: "convoy",
          label: leg.deedTileId ? "Tile deed delivered" : "Convoy delivered",
          timestamp: leg.settledAt ?? leg.arrivesAt,
          details: `${cargoSummary}; ${gains.join(", ")}`,
          deedTileId: leg.deedTileId ?? undefined,
        });
      } else if (leg.status === "INTERCEPTED" || leg.status === "SEIZED") {
        const stolenParts = [
          leg.stolenGold > 0 ? `${leg.stolenGold}g` : null,
          leg.stolenFood > 0 ? `${leg.stolenFood}f` : null,
          leg.stolenArmy > 0 ? `${leg.stolenArmy} army` : null,
          leg.stolenPoints > 0 ? `${leg.stolenPoints} pts` : null,
        ].filter(Boolean);
        const lossSummary =
          leg.status === "INTERCEPTED" && raidedByPlayer
            ? `stole ${stolenParts.join(", ") || "cargo"}; value ${leg.stolenCargoValue}`
            : leg.status === "INTERCEPTED"
            ? `lost ${cargoSummary}; stolen value ${leg.stolenCargoValue}`
            : `lost ${cargoSummary}`;
        items.push({
          id: "convoy:" + leg.id,
          type: "convoy",
          label:
            leg.status === "INTERCEPTED"
              ? "Convoy intercepted"
              : "Convoy seized",
          timestamp: leg.settledAt ?? leg.arrivesAt,
          details: leg.deedFailureReason
            ? `${lossSummary}; ${leg.deedFailureReason}`
            : lossSummary,
          deedTileId: leg.deedTileId ?? undefined,
        });
      }
    }
    for (const s of sieges) {
      items.push({
        id: "siege:" + s.id,
        type: "siege",
        label: "Siege warning on tile " + s.targetTileId,
        timestamp: s.responseEndsAt ?? now,
        tileId: s.targetTileId,
      });
    }
    for (const ord of orders) {
      items.push({
        id: "order:" + ord.id,
        type: "army",
        label:
          ord.type === "CAMPAIGN"
            ? "Campaign active"
            : "Guard stationed on " + (ord.targetTileId ?? "?"),
        timestamp: now,
        details: ord.committedArmy + " army",
      });
    }

    items.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
    recentActivity = items.slice(0, 20);
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
  const tileCountsByFortressId = new Map<string, number>();

  for (const ownership of cycle.mapHexOwnerships) {
    if (isHomeOfATile(ownership.tileId)) {
      continue;
    }

    tileCountsByFortressId.set(
      ownership.ownerFortressId,
      (tileCountsByFortressId.get(ownership.ownerFortressId) ?? 0) + 1
    );
  }

  const leaderboardTitleHolders = getLeaderboardTitleHolders({
    fortresses: playerFortresses,
    tileCountsByFortressId,
    cycleStatus: cycle.status,
    ruleset: cycle.ruleset,
  });
  const leaderboardTitleConfigs = getLeaderboardTitleConfigs(cycle.ruleset);
  const leaderboardConfigByCategory = new Map(
    leaderboardTitleConfigs.map((config) => [config.category, config])
  );
  const mapLeaderboardEntry = (
    category: LeaderboardCategory,
    fortress: (typeof playerFortresses)[number],
    index: number
  ): RankedLeaderboardEntry => {
    const config = leaderboardConfigByCategory.get(category)!;
    const isTitleHolder = leaderboardTitleHolders[category] === fortress.id;

    return {
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
      unitsKilled: fortress.unitsKilled,
      tilesOwned: tileCountsByFortressId.get(fortress.id) ?? 0,
      goblinsKilled: fortress.goblinsKilled,
      resourcesStolen: fortress.resourcesStolen,
      deliveredCargoValue: fortress.deliveredCargoValue,
      interceptedCargoValue: fortress.interceptedCargoValue,
      metric: getLeaderboardMetric(category, fortress, tileCountsByFortressId),
      rank: index + 1,
      title: isTitleHolder ? config.title : null,
      buffLabel: isTitleHolder ? config.buffLabel : null,
      isTitleHolder,
      isSlayerOfA: fortress.id === cycle.crownedFortressId,
      isCurrentUser: fortress.ownerId === userId,
    };
  };
  const leaderboards = Object.fromEntries(
    leaderboardTitleConfigs.map((config) => [
      config.category,
      [...playerFortresses]
        .sort(
          compareLeaderboardFortresses(config.category, tileCountsByFortressId)
        )
        .slice(0, 3)
        .map((fortress, index) =>
          mapLeaderboardEntry(config.category, fortress, index)
        ),
    ])
  ) as Record<LeaderboardCategory, RankedLeaderboardEntry[]>;
  const targetLookup = new Map(
    cycle.fortresses.map((fortress) => [fortress.id, fortress])
  );
  const playerFortressId = playerFortress?.id ?? null;
  const playerOwnedTileBiomes = playerFortress
    ? cycle.mapHexOwnerships
        .filter(
          (ownership) =>
            ownership.ownerFortressId === playerFortress.id &&
            !isHomeOfATile(ownership.tileId)
        )
        .map((ownership) => getTileById(ownership.tileId)?.biome ?? null)
        .filter((biome): biome is NonNullable<typeof biome> => biome !== null)
    : [];
  const upgradesUnlocked = gameplayOpen;
  const raceBuffTier = getRaceBuffTier({
    activeStartedAt: cycle.activeStartedAt,
    now,
    isActiveSeason: cycle.status === CycleStatus.ACTIVE,
    race: playerFortress?.race ?? null,
    ownedTileBiomes: playerOwnedTileBiomes,
  });
  const raceTierThreeUnlocksAt = null;
  const activeRuneSuppressions = await db.raceAbilityActivation.findMany({
    where: {
      kind: RaceAbilityKind.DWARF_RUNE_GRUDGES,
      activeUntil: {
        gt: now,
      },
      targetFortressId: {
        not: null,
      },
      consumedAt: null,
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
      goldCost: true,
      maintenanceGoldPerTick: true,
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
  const playerCastleSpecializationCounts = playerFortress
    ? countCastleSpecializations(playerFortress.castleUpgradeSpecializations)
    : null;
  const maxBuildingLevel = playerFortress
    ? getDisplayedCastleLevel(playerFortress.level)
    : 0;
  const buildingUpgradeOptions =
    playerFortress && playerCastleSpecializationCounts
      ? BUILDING_SPECIALIZATIONS.reduce(
          (options, specialization) => {
            const currentBuildingLevel =
              playerCastleSpecializationCounts[specialization];
            const upgradesKeep =
              specialization === CastleUpgradeSpecialization.DEFENSE;
            const isAtCap = upgradesKeep
              ? !canFortressLevelUp(playerFortress.level)
              : currentBuildingLevel >= maxBuildingLevel;
            const nextCost = isAtCap
              ? null
              : upgradesKeep
                ? getFortressUpgradeCost(playerFortress.level)
                : getFortressUpgradeCost(currentBuildingLevel);

            options[specialization] = {
              level: currentBuildingLevel,
              maxLevel: upgradesKeep ? null : maxBuildingLevel,
              nextCost,
              nextDurationMinutes:
                nextCost === null
                  ? null
                  : getFortressUpgradeDurationMinutes(currentBuildingLevel),
              canUpgrade:
                gameplayOpen &&
                playerFortress.race !== null &&
                nextCost !== null &&
                playerFortress.gold >= nextCost,
            };

            return options;
          },
          {} as Record<CastleUpgradeSpecialization, BuildingUpgradeOption>
        )
      : null;
  const nextUpgradeCost =
    buildingUpgradeOptions?.[CastleUpgradeSpecialization.DEFENSE]?.nextCost ??
    null;
  const pendingUpgradeSpecializationLevel = null;
  const activeCastleUpgradeProject =
    playerFortress?.castleUpgradeProjects[0] ?? null;
  const canAffordUpgrade =
    buildingUpgradeOptions !== null &&
    Object.values(buildingUpgradeOptions).some((option) => {
      return (
        option.nextCost !== null && playerFortress!.gold >= option.nextCost
      );
    });
  const receivedSlayerUpgrade = null;
  const locationShuffleCount = playerFortress
    ? await getFortressLocationShuffleCount(db, playerFortress.id)
    : 0;
  const locationShuffleCost = playerFortress
    ? getActiveLocationShuffleCost(locationShuffleCount)
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
  let playerInFlightArmy = 0;
  let playerBattlefieldArmy = 0;
  let playerGarrisonArmy = 0;

  if (playerFortress) {
    for (const unit of cycle.attackUnits) {
      if (unit.attackerFortress.id === playerFortress.id) {
        playerInFlightArmy += unit.armyAmount ?? 0;
      }
    }

    for (const battlefield of cycle.battlefields) {
      for (const participant of battlefield.participants) {
        if (participant.fortressId === playerFortress.id) {
          playerBattlefieldArmy += Math.max(0, participant.armyRemaining);
        }
      }
    }

    for (const garrison of playerFortress.garrisons) {
      playerGarrisonArmy += Math.max(0, garrison.army);
    }
  }

  let playerEscortArmy = 0;
  const playerRaidArmy = 0;
  let playerCampaignArmy = 0;
  const playerGuardArmy = 0;
  let playerQueuedArmy = 0;

  if (playerFortress) {
    playerQueuedArmy = playerFortress.recruitmentQueue;
    for (const order of cycle.armyOrders) {
      if (order.fortressId !== playerFortress.id) continue;
      if (order.type === "ESCORT") playerEscortArmy += order.committedArmy;
      else if (order.type === "CAMPAIGN")
        playerCampaignArmy += order.committedArmy;
    }
  }

  const playerAllUnits = playerFortress
    ? playerFortress.army +
      playerInFlightArmy +
      playerBattlefieldArmy +
      playerGarrisonArmy
    : 0;
  const maxSimultaneousAttacks = playerFortress
    ? getMaxSimultaneousAttacks(
        playerFortress.level,
        getEffectiveRace(playerFortress)
      )
    : MAX_SIMULTANEOUS_ATTACKS_BASE;
  const latestWaaaghUse = playerFortress
    ? playerFortress.raceAbilityActivations.find(
        (activation) => activation.kind === RaceAbilityKind.ORK_WAAAGH
      )
    : null;
  const activeWaaagh =
    latestWaaaghUse &&
    latestWaaaghUse.activeFrom <= now &&
    latestWaaaghUse.activeUntil > now
      ? latestWaaaghUse
      : null;
  const activeOrkBossOrder =
    playerFortress?.orkBossOrders.find(
      (order) => order.activeFrom <= now && order.activeUntil > now
    ) ?? null;
  const activeWaaaghInvestments =
    playerFortress && activeWaaagh
      ? playerFortress.orkWaaaghInvestments.filter(
          (investment) => investment.waaaghActivationId === activeWaaagh.id
        )
      : [];
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
  const latestGarrisonInstantRecallUse = playerFortress
    ? playerFortress.raceAbilityActivations.find(
        (activation) =>
          activation.kind ===
          RaceAbilityKind.SPACE_MURINE_GARRISON_INSTANT_RECALL
      )
    : null;
  const latestUnicornShatteredRealityUse = playerFortress
    ? playerFortress.raceAbilityActivations.find(
        (activation) =>
          activation.kind === ("UNICORN_SHATTERED_REALITY" as RaceAbilityKind)
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
  const latestDwarfRuneOfGrudges = playerFortress
    ? (playerFortress.raceAbilityActivations.find(
        (activation) =>
          activation.kind === RaceAbilityKind.DWARF_RUNE_GRUDGES &&
          activation.consumedAt === null &&
          activation.activeUntil > now
      ) ?? null)
    : null;
  const latestDwarfDeepMiningRoll = playerFortress?.deepMiningRolls[0] ?? null;
  const latestUnicornShatteredRealityRoll =
    playerFortress?.unicornShatteredRealityRolls[0] ?? null;
  const currentDayKey = getHelsinkiDayKey(now);
  const currentHourKey = getHelsinkiHourKey(now);
  const dwarfDeepMiningCooldownStartedAt = addHours(now, -1);
  const unicornShatteredRealityAvailability =
    getUnicornShatteredRealityAvailability({
      race: playerFortress?.race ?? null,
      activeStartedAt: cycle.activeStartedAt,
      now,
      isActiveSeason: cycle.status === CycleStatus.ACTIVE,
      ownedTileBiomes: playerOwnedTileBiomes,
      latestUseAt: latestUnicornShatteredRealityUse?.usedAt ?? null,
    });
  const unicornTeleportClaimAvailability = getUnicornTeleportClaimAvailability({
    race: playerFortress?.race ?? null,
    activeStartedAt: cycle.activeStartedAt,
    now,
    isActiveSeason: cycle.status === CycleStatus.ACTIVE,
    ownedTileBiomes: playerOwnedTileBiomes,
    hasActiveTeleportToken: activeUnicornTeleportToken !== null,
    hasActiveTemporaryTeleport: activeUnicornTemporaryTeleport !== null,
    latestClaimAt: latestUnicornTeleportClaim?.usedAt ?? null,
  });
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
                    level: true,
                    specialization: true,
                  },
                },
              },
            },
          },
        })
      )
        .map((unit) => {
          const attackerReturned = unit.attackerReturned ?? unit.armyAmount;
          const isBattlefieldOpenerResolution =
            !unit.recalledAt &&
            unit.targetFortress.fortressKind !== FortressKind.LOOT_CAMP &&
            unit.defenderArmyAtBattleStart !== null &&
            (unit.resolvedAttackPower ?? 0) === 0 &&
            (unit.resolvedDefensePower ?? 0) === 0 &&
            (unit.attackerSurvivors ?? 0) === unit.armyAmount &&
            (unit.attackerRetired ?? 0) === 0 &&
            ((unit.attackerReturned ?? 0) === 0 ||
              (unit.attackerReturned ?? 0) === unit.armyAmount) &&
            (unit.defenderLosses ?? 0) === 0 &&
            (unit.pointsLooted ?? 0) === 0 &&
            (unit.foodLooted ?? 0) === 0 &&
            (unit.armyLooted ?? 0) === 0;

          if (isBattlefieldOpenerResolution) {
            return null;
          }

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

          const resolvedAttackPower =
            unit.resolvedAttackPower ?? unit.armyAmount;
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
              defenderIsHomeOfABoss:
                unit.targetFortress.fortressKind === FortressKind.MEGA,
            }),
          };
        })
        .filter((report) => report !== null)
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
          orderBy: [
            { updatedAt: "desc" },
            { startedAt: "desc" },
            { id: "desc" },
          ],
          take: 5,
          select: {
            id: true,
            targetTileId: true,
            status: true,
            progress: true,
            attackerArmyRemaining: true,
            defenderArmyRemaining: true,
            pointReward: true,
            pointsReward: true,
            foodReward: true,
            startedAt: true,
            resolvedAt: true,
            resolvedWinnerSide: true,
            targetFortress: {
              select: {
                id: true,
                name: true,
                commanderName: true,
                ownerId: true,
                maxHealth: true,
              },
            },
            attackerBannerFortress: {
              select: {
                id: true,
                name: true,
                commanderName: true,
                ownerId: true,
                race: true,
              },
            },
            defenderBannerFortress: {
              select: {
                id: true,
                name: true,
                commanderName: true,
                ownerId: true,
                race: true,
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
        const reportTargetTile =
          battlefield.targetTileId !== null
            ? getTileById(battlefield.targetTileId)
            : null;
        const reportTargetTileBonus =
          battlefield.targetTileId !== null
            ? isHomeOfATile(battlefield.targetTileId)
              ? getHomeOfABonus()
              : getTileBonus(reportTargetTile)
            : null;
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
        const incomingReinforcements =
          battlefield.incomingReinforcements.filter(
            (unit) => unit.resolvedAt === null && unit.cancelledAt === null
          );
        const reinforcementLines = arrivedReinforcements.map(
          (unit) =>
            `${unit.attackerFortress.name} reinforcement arrived for ${(unit.reinforcementSide ?? BattlefieldSide.ATTACKER).toLowerCase()} with ${unit.armyAmount} army.`
        );
        const battleStartsInMinutes = Math.max(
          0,
          Math.ceil((battlefield.startedAt.getTime() - now.getTime()) / 60_000)
        );
        const battleAgeMinutes =
          battleStartsInMinutes > 0
            ? 0
            : Math.max(
                0,
                Math.floor(
                  (now.getTime() - battlefield.startedAt.getTime()) / 60_000
                )
              );
        const casualtiesPerTick =
          battleStartsInMinutes > 0
            ? 0
            : getBattlefieldCasualtyBudget(battleAgeMinutes);
        const attackerLosses = battlefield.participants
          .filter(
            (participant) => participant.side === BattlefieldSide.ATTACKER
          )
          .reduce(
            (sum, participant) =>
              sum +
              Math.max(
                0,
                participant.armyCommitted - participant.armyRemaining
              ),
            0
          );
        const defenderParticipantLosses = battlefield.participants
          .filter(
            (participant) => participant.side === BattlefieldSide.DEFENDER
          )
          .reduce(
            (sum, participant) =>
              sum +
              Math.max(
                0,
                participant.armyCommitted - participant.armyRemaining
              ),
            0
          );
        const defenderNativeLosses =
          battlefield.targetTileId !== null &&
          isHomeOfATile(battlefield.targetTileId) &&
          battlefield.targetFortress
            ? Math.max(
                0,
                battlefield.targetFortress.maxHealth -
                  battlefield.defenderArmyRemaining
              )
            : 0;
        const defenderLosses = defenderParticipantLosses + defenderNativeLosses;

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
          resolvedAttackPower: attackerLosses + defenderLosses,
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
          defenderLosses,
          pointsLooted:
            battlefield.resolvedWinnerSide === BattlefieldSide.ATTACKER
              ? battlefield.pointReward
              : 0,
          foodLooted:
            battlefield.resolvedWinnerSide === BattlefieldSide.ATTACKER
              ? battlefield.foodReward
              : 0,
          armyLooted: 0,
          reportLines: [
            ...formatBattlefieldReportLines({
              targetName,
              targetTileId: battlefield.targetTileId,
              targetTileBonusLabel: reportTargetTileBonus?.label ?? null,
              status: battlefield.status,
              winnerSide: battlefield.resolvedWinnerSide,
              attackerBannerName: battlefield.attackerBannerFortress.name,
              defenderBannerName:
                battlefield.defenderBannerFortress?.name ??
                battlefield.targetFortress?.name ??
                null,
              attackerArmyRemaining: battlefield.attackerArmyRemaining,
              defenderArmyRemaining: battlefield.defenderArmyRemaining,
              attackerLosses,
              defenderLosses,
              participantCount: battlefield.participants.length,
              incomingCount: incomingReinforcements.length,
              arrivedReinforcementCount: arrivedReinforcements.length,
              casualtiesPerTick,
              pointsReward: battlefield.pointsReward,
              foodReward: battlefield.foodReward,
              pointReward: battlefield.pointReward,
            }),
            ...joinedLines,
            ...reinforcementLines,
          ],
        };
      })
    : [];
  const battleReports = [...battlefieldReports, ...legacyBattleReports]
    .sort(
      (left, right) => right.resolvedAt.getTime() - left.resolvedAt.getTime()
    )
    .slice(0, 5);
  const visibleFortresses = cycle.fortresses.filter((fortress) => {
    if (isSeasonFour && fortress.fortressKind !== FortressKind.PLAYER) {
      return false;
    }

    if (
      fortress.fortressKind === FortressKind.LOOT_CAMP ||
      fortress.fortressKind === FortressKind.DWARF_RUNE
    ) {
      return fortress.health > 0;
    }

    return (
      fortress.fortressKind !== FortressKind.UNICORN_DECOY ||
      fortress.health > 0
    );
  });
  const playerDiplomacy = playerFortressId
    ? await prisma.diplomacyRelation.findMany({
        where: {
          cycleId: cycle.id,
          OR: [
            { fortressAId: playerFortressId },
            { fortressBId: playerFortressId },
          ],
        },
        select: { fortressAId: true, fortressBId: true, status: true },
      })
    : [];

  const diplomacyByFortress = new Map<string, string>();
  for (const rel of playerDiplomacy) {
    const otherId =
      rel.fortressAId === playerFortressId ? rel.fortressBId : rel.fortressAId;
    if (rel.status === "WAR" || rel.status === "ALLIED") {
      diplomacyByFortress.set(otherId, rel.status);
    }
  }

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
      unicornDecoyLevel: canRevealUnicornDecoy
        ? fortress.unicornDecoyLevel
        : null,
      displayedCastleLevel: getDisplayedCastleLevel(fortress.level),
      population: getFortressPopulation(
        fortress.level,
        getEffectiveRace(fortress)
      ),
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
      pressureWorkersAssigned: fortress.pressureWorkersAssigned,
      recruitmentQueue: fortress.recruitmentQueue,
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
      diplomacyStatus: (diplomacyByFortress.get(fortress.id) ?? "NEUTRAL") as
        | "WAR"
        | "ALLIED"
        | "NEUTRAL",
      isTargetable:
        !isSeasonFour &&
        playerFortressId !== null &&
        gameplayOpen &&
        fortress.id !== playerFortressId &&
        fortress.fortressKind !== FortressKind.MEGA &&
        (fortress.fortressKind === FortressKind.LOOT_CAMP
          ? fortress.health > 0 &&
            fortress.expiresAt !== null &&
            fortress.expiresAt > now
          : fortress.fortressKind === FortressKind.DWARF_RUNE
            ? fortress.health > 0 && runeOwnerId !== playerFortressId
            : true),
    };
  });
  const roadSegments = (cycle.mapHexRoads ?? []).map((r) => ({
    tileId: r.tileId,
    crossings: r.crossings,
    level: r.level,
    lastUsedAt: r.lastUsedAt?.getTime() ?? null,
  }));
  const globalChatMessages = await db.chatMessage.findMany({
    where: {
      cycleId: cycle.id,
    },
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
          email: true,
        },
      },
    },
  });
  const latestMessageAt = globalChatMessages[0]?.createdAt ?? null;
  const chatMessages = [...globalChatMessages].reverse().map((message) => ({
    isSystem:
      message.author.email === NPC_SYSTEM_USER_EMAIL ||
      message.author.email === GOD_EMPEROR_USER_EMAIL,
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
    authorName:
      message.author.email === GOD_EMPEROR_USER_EMAIL
        ? GOD_EMPEROR_CHAT_AUTHOR_NAME
        : message.author.email === NPC_SYSTEM_USER_EMAIL
          ? "System"
          : (commanderNameByOwnerId.get(message.author.id) ?? "Spectator"),
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
  const usingResolvedWishWindow =
    !isSeasonFour &&
    cycle.status === CycleStatus.REGISTRATION &&
    latestResolvedSeason !== null;
  const communityWishSourceCycleId = usingResolvedWishWindow
    ? latestResolvedSeason.cycleId
    : cycle.id;
  const communityWishSourceProposals = isSeasonFour
    ? []
    : usingResolvedWishWindow
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
    : !isSeasonFour && activeOpen;
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
  const activeBattlefieldByTileId = new Map(
    cycle.battlefields.flatMap((battlefield) =>
      battlefield.targetTileId
        ? ([[battlefield.targetTileId, battlefield]] as const)
        : []
    )
  );
  type TileGarrisonSummary = {
    id: string;
    tileId: string;
    fortressId: string;
    fortressName: string;
    commanderName: string;
    ownerId: string;
    army: number;
    createdAt: Date;
  };
  const allGarrisons: TileGarrisonSummary[] = [];

  for (const fortress of cycle.fortresses) {
    for (const garrison of fortress.garrisons) {
      allGarrisons.push({
        id: garrison.id,
        tileId: garrison.tileId,
        army: garrison.army,
        createdAt: garrison.createdAt,
        fortressId: fortress.id,
        fortressName: fortress.name,
        commanderName: fortress.commanderName,
        ownerId: fortress.ownerId,
      });
    }
  }

  const garrisonsByTileId = new Map<string, TileGarrisonSummary[]>();

  for (const garrison of allGarrisons) {
    const current = garrisonsByTileId.get(garrison.tileId) ?? [];

    current.push(garrison);
    garrisonsByTileId.set(garrison.tileId, current);
  }

  for (const garrisons of garrisonsByTileId.values()) {
    garrisons.sort(
      (left, right) =>
        right.army - left.army ||
        left.createdAt.getTime() - right.createdAt.getTime() ||
        left.id.localeCompare(right.id)
    );
  }

  const homeOwnership =
    cycle.mapHexOwnerships.find((ownership) =>
      isHomeOfATile(ownership.tileId)
    ) ?? null;
  const homeBoss =
    cycle.fortresses.find(
      (fortress) =>
        fortress.fortressKind === FortressKind.MEGA && fortress.isNpc
    ) ?? null;
  const homeRespawnsAt = cycle.homeOfABossRespawnsAt;
  const homeBossAlive =
    homeBoss !== null &&
    homeBoss.health > 0 &&
    (!homeRespawnsAt || homeRespawnsAt <= now);
  const homeStatus: "ALIVE" | "DEFEATED" = homeBossAlive ? "ALIVE" : "DEFEATED";
  const homeReward = homeBoss ? getHomeOfABossReward(homeBoss.maxHealth) : 0;
  const homeHolders: Array<{
    fortressId: string;
    fortressName: string;
    commanderName: string;
    contributionWeight: number;
    capturedAt: Date;
    currentDrainPerTick: number;
    isCurrentUser: boolean;
  }> = [];
  const canAttackHomeOfA =
    !isSeasonFour &&
    gameplayOpen &&
    playerFortress !== null &&
    playerFortress.army > 0 &&
    homeBossAlive;
  const getTileAttackDisabledReason = (ownership: {
    tileId: string;
    ownerFortressId: string | null;
  }) => {
    if (!gameplayOpen) {
      return "Tiles can only be attacked during gameplay.";
    }

    if (!playerFortress) {
      return "Join the cycle to attack tiles.";
    }

    if (playerFortress.army <= 0) {
      return "You need idle army to attack tiles.";
    }

    const diplomacyRelation =
      ownership.ownerFortressId &&
      ownership.ownerFortressId !== playerFortress.id
        ? findDiplomacyRelationForPair({
            relations: cycle.diplomacyRelations,
            fortressOneId: playerFortress.id,
            fortressTwoId: ownership.ownerFortressId,
          })
        : null;

    return getTileAttackBlockedReason({
      tile: getTileById(ownership.tileId),
      tileId: ownership.tileId,
      ownerFortressId: ownership.ownerFortressId,
      attackerFortress: playerFortress,
      ownedTileIds: ownedNormalTileIds,
      hasActiveBattle: activeBattleTileIds.has(ownership.tileId),
      diplomacyRelation,
      now,
      isHomeOfA: isHomeOfATile,
      isConnected: ({ tileId, ownedTileIds }) =>
        isTileConnectedToFortressOrOwnedTiles({
          tileId,
          fortress: playerFortress,
          ownedTileIds,
        }),
    });
  };
  const getTileFortifyDisabledReason = (ownership: {
    tileId: string;
    ownerFortressId: string | null;
  }) => {
    if (!gameplayOpen) {
      return "Tiles can only be fortified during gameplay.";
    }

    if (!playerFortress) {
      return "Join the cycle to fortify tiles.";
    }

    if (ownership.ownerFortressId !== playerFortress.id) {
      return "You can only fortify tiles you own.";
    }

    if (playerFortress.army <= 0) {
      return "You need idle army to fortify tiles.";
    }

    if (activeBattleTileIds.has(ownership.tileId)) {
      return "This tile is already contested.";
    }

    if (outboundAttackUnitCount >= maxSimultaneousAttacks) {
      return `You have reached the maximum number of simultaneous movements (${maxSimultaneousAttacks}).`;
    }

    return null;
  };
  const ownedNormalTiles = playerFortress
    ? cycle.mapHexOwnerships
        .filter(
          (ownership) =>
            ownership.ownerFortressId === playerFortress.id &&
            !isHomeOfATile(ownership.tileId)
        )
        .map((ownership) => getTileById(ownership.tileId))
        .filter((tile): tile is NonNullable<typeof tile> => tile !== null)
    : [];
  const ownedNormalTileIds = ownedNormalTiles.map((tile) => tile.id);
  const ownerByTileId = new Map(
    cycle.mapHexOwnerships.map((ownership) => [
      ownership.tileId,
      ownership.ownerFortressId,
    ])
  );
  const pressurePriorityLimit = playerFortress
    ? getTilePressurePriorityLimit(playerFortress)
    : 0;
  const pressurePriorityQueue = playerFortress
    ? sortTilePressureQueue(
        cycle.tilePressurePriorities.filter(
          (priority) => priority.fortressId === playerFortress.id
        )
      ).map((priority) => ({
        tileId: priority.tileId,
        weight: priority.weight,
        rank: getTilePressurePrioritySlot({
          weight: priority.weight,
          limit: pressurePriorityLimit,
        }),
      }))
    : [];
  const pressurePriorityByTileId = new Map(
    pressurePriorityQueue.map((priority) => [priority.tileId, priority])
  );
  const claimedTileIds = new Set(
    cycle.mapHexOwnerships.map((ownership) => ownership.tileId)
  );
  const activeCampaignByTileId = new Map(
    cycle.territoryCampaigns.map((campaign) => [
      campaign.targetTileId,
      campaign,
    ])
  );
  const pressureStatesByTileId = new Map<
    string,
    Array<{ fortressId: string; pressure: number }>
  >();

  for (const state of cycle.tilePressureStates) {
    if (claimedTileIds.has(state.tileId)) {
      continue;
    }

    const states = pressureStatesByTileId.get(state.tileId) ?? [];
    states.push({
      fortressId: state.fortressId,
      pressure: state.pressure,
    });
    pressureStatesByTileId.set(state.tileId, states);
  }

  const ownedTileBonuses = sumTileBonuses(ownedNormalTiles);
  const ownedTileSummary = {
    totalTileCount: ownedNormalTiles.length,
    goldIncome: ownedTileBonuses.gold,
    pointIncome: ownedTileBonuses.points,
    foodIncome: ownedTileBonuses.food,
    armyIncome: ownedTileBonuses.army,
    workerPoolBonus: ownedTileBonuses.population,
    defenseBonusPercent: ownedTileBonuses.defensePercent,
  };
  const getTilePressureState = (tile: HexTile) => {
    const states = pressureStatesByTileId.get(tile.id) ?? [];
    const ownState = playerFortress
      ? states.find((state) => state.fortressId === playerFortress.id)
      : null;
    const leader = states.reduce<(typeof states)[number] | null>(
      (currentLeader, state) =>
        !currentLeader || state.pressure > currentLeader.pressure
          ? state
          : currentLeader,
      null
    );
    const pressureLeaderFortressId =
      getNeutralPressureClaimWinner({
        states,
        threshold: pressureClaimThreshold,
      }) ??
      leader?.fortressId ??
      null;
    const pressureLeaderLabel =
      pressureLeaderFortressId === null
        ? null
        : pressureLeaderFortressId === playerFortress?.id
          ? "You"
          : "Another fortress";
    const pressureThreshold = playerFortress
      ? getDistanceAdjustedTilePressureClaimThreshold({
          isSeasonFour,
          fortress: playerFortress,
          tileId: tile.id,
        })
      : pressureClaimThreshold;
    const isConnectedToPlayerTerritory =
      playerFortress !== null
        ? isTileConnectedToFortressOrOwnedTiles({
            tileId: tile.id,
            fortress: playerFortress,
            ownedTileIds: ownedNormalTileIds,
          })
        : false;
    const pressurePriorityDisabledReason = (() => {
      if (!gameplayOpen) {
        return "Expansion priorities can only be changed during gameplay.";
      }

      if (!playerFortress) {
        return "Join the cycle to prioritize expansion.";
      }

      const ownerFortressId = ownerByTileId.get(tile.id) ?? null;
      const diplomacyRelation =
        ownerFortressId && ownerFortressId !== playerFortress.id
          ? findDiplomacyRelationForPair({
              relations: cycle.diplomacyRelations,
              fortressOneId: playerFortress.id,
              fortressTwoId: ownerFortressId,
            })
          : null;
      const effectiveDiplomacyStatus = getEffectiveDiplomacyStatus({
        relation: diplomacyRelation,
        now,
      });
      const isQueued = pressurePriorityByTileId.has(tile.id);

      return (
        getPressureTargetBlockedReason({
          tile,
          tileId: tile.id,
          ownerFortressId,
          diplomacyBlockedReason: getDiplomacyPressureBlockedReason({
            relation: diplomacyRelation,
            now,
          }),
          allowEnemyOwned:
            ownerFortressId !== null &&
            ownerFortressId !== playerFortress.id &&
            effectiveDiplomacyStatus === DiplomacyRelationStatus.WAR,
          fortress: playerFortress,
          ownedTileIds: ownedNormalTileIds,
          isHomeOfA: isHomeOfATile,
          isConnected: ({ tileId, ownedTileIds }) =>
            isTileConnectedToFortressOrOwnedTiles({
              tileId,
              fortress: playerFortress,
              ownedTileIds,
            }),
        }) ??
        (!isQueued && pressurePriorityQueue.length >= pressurePriorityLimit
          ? `Expansion queue is full (${pressurePriorityLimit}/${pressurePriorityLimit}).`
          : null)
      );
    })();
    const priority = pressurePriorityByTileId.get(tile.id) ?? null;

    return {
      isConnectedToPlayerTerritory,
      pressurePriority: priority !== null,
      pressurePriorityRank: priority?.rank ?? null,
      pressurePlayerProgress: ownState?.pressure ?? null,
      pressureProgress: ownState?.pressure ?? leader?.pressure ?? null,
      pressureThreshold,
      pressureLeaderFortressId,
      pressureLeaderLabel,
      canPrioritizePressure: pressurePriorityDisabledReason === null,
      pressurePriorityDisabledReason,
    };
  };
  const mappedMapHexes: Array<{
    id: string;
    tileId: string;
    biome: string | null;
    claimedAt: Date | null;
    ownerFortressId: string | null;
    ownerRace: "DWARFS" | "UNSTABLE_UNICORNS" | "ORKS" | "SPACE_MURINES" | null;
    ownerName: string;
    ownerCommanderName: string;
    isCurrentUser: boolean;
    hasActiveBattle: boolean;
    canAttack: boolean;
    canFortify: boolean;
    fortifyDisabledReason: string | null;
    isConnectedToPlayerTerritory: boolean;
    pressurePriority: boolean;
    pressurePriorityRank: number | null;
    pressurePlayerProgress: number | null;
    pressureProgress: number | null;
    pressureThreshold: number | null;
    pressureLeaderFortressId: string | null;
    pressureLeaderLabel: string | null;
    canPrioritizePressure: boolean;
    pressurePriorityDisabledReason: string | null;
    attackPriority: number;
    ownershipPressure: number | null;
    activeBattlefieldId: string | null;
    attackDisabledReason: string | null;
    canStartCampaign: boolean;
    campaignDisabledReason: string | null;
    campaignId: string | null;
    campaignOrderId: string | null;
    campaignStatus: TerritoryCampaignStatus | null;
    campaignProgress: number | null;
    campaignThreshold: number | null;
    campaignResponseEndsAt: Date | null;
    isOwnCampaign: boolean;
    canStationGuard: boolean;
    guardDisabledReason: string | null;
    guardOrderId: string | null;
    guardArmy: number | null;
    bonus: {
      label: string;
      gold: number;
      points: number;
      food: number;
      army: number;
      defensePercent: number;
    };
    isHomeOfA: boolean;
    pointIncome: number | null;
    holders: typeof homeHolders;
    occupyingGarrison: {
      fortressId: string;
      fortressName: string;
      commanderName: string;
      army: number;
      isCurrentUser: boolean;
    } | null;
    ownGarrison: {
      id: string;
      army: number;
      canRecall: boolean;
      recallDisabledReason: string | null;
      canInstantRecall: boolean;
      canTorch: boolean;
      torchDisabledReason: string | null;
    } | null;
  }> = cycle.mapHexOwnerships.map((ownership) => {
    const tile = getTileById(ownership.tileId);
    const isHomeOwnership = isHomeOfATile(ownership.tileId);
    const homeOwnershipHasActiveControl = false;
    const occupyingGarrison =
      (garrisonsByTileId.get(ownership.tileId) ?? []).find(
        (garrison) => garrison.fortressId !== ownership.ownerFortressId
      ) ?? null;
    const ownGarrison =
      playerFortress?.garrisons.find(
        (garrison) => garrison.tileId === ownership.tileId
      ) ?? null;
    const canTorchOwnGarrison =
      !isSeasonFour &&
      Boolean(ownGarrison) &&
      !isHomeOwnership &&
      ownership.ownerFortressId !== playerFortress?.id &&
      !activeBattleTileIds.has(ownership.tileId);
    const pressureState = tile
      ? getTilePressureState(tile)
      : {
          isConnectedToPlayerTerritory: false,
          pressurePriority: false,
          pressurePriorityRank: null,
          pressurePlayerProgress: null,
          pressureProgress: null,
          pressureThreshold: null,
          pressureLeaderFortressId: null,
          pressureLeaderLabel: null,
          canPrioritizePressure: false,
          pressurePriorityDisabledReason:
            "That map tile cannot receive pressure.",
        };
    const bonus = isHomeOwnership ? homeTileBonus : getTileBonus(tile);
    const activeCampaign = activeCampaignByTileId.get(ownership.tileId) ?? null;
    const campaignDisabledReason = (() => {
      if (isHomeOwnership) {
        return homeMonumentReason;
      }

      if (!isSeasonFour) {
        return "Campaign orders are available only in Season 4.";
      }

      if (!gameplayOpen) {
        return "Campaigns can only begin during gameplay.";
      }

      if (!playerFortress) {
        return "Join the cycle to start campaigns.";
      }

      if (playerFortress.army <= 0) {
        return "You need idle army to start a campaign.";
      }

      const relation =
        ownership.ownerFortressId !== playerFortress.id
          ? findDiplomacyRelationForPair({
              relations: cycle.diplomacyRelations,
              fortressOneId: playerFortress.id,
              fortressTwoId: ownership.ownerFortressId,
            })
          : null;

      return getCampaignStartBlockedReason({
        relationStatus: getEffectiveDiplomacyStatus({ relation, now }),
        isEnemyOwned:
          Boolean(ownership.ownerFortressId) &&
          ownership.ownerFortressId !== playerFortress.id,
        isBorderTarget: pressureState.isConnectedToPlayerTerritory,
        hasActiveCampaign: Boolean(activeCampaign),
        hasActiveBattlefield: activeBattleTileIds.has(ownership.tileId),
      });
    })();
    const guardDisabledReason =
      "Manual guard orders are disabled. Set battalions to GUARD in the War Room instead.";

    return {
      id: ownership.id,
      tileId: ownership.tileId,
      biome: tile?.biome ?? null,
      claimedAt: ownership.claimedAt,
      ownerFortressId:
        isHomeOwnership && !homeOwnershipHasActiveControl
          ? null
          : ownership.ownerFortressId,
      ownerRace:
        isHomeOwnership && !homeOwnershipHasActiveControl
          ? null
          : ownership.ownerFortress.race,
      ownerName:
        isHomeOwnership && !homeOwnershipHasActiveControl
          ? isSeasonFour
            ? "Monument"
            : "Neutral"
          : ownership.ownerFortress.name,
      ownerCommanderName:
        isHomeOwnership && !homeOwnershipHasActiveControl
          ? "Home of A"
          : ownership.ownerFortress.commanderName,
      isCurrentUser:
        !isHomeOwnership || homeOwnershipHasActiveControl
          ? ownership.ownerFortress.ownerId === userId
          : false,
      hasActiveBattle: activeBattleTileIds.has(ownership.tileId),
      canAttack: isHomeOwnership
        ? canAttackHomeOfA
        : !isSeasonFour && getTileAttackDisabledReason(ownership) === null,
      canFortify: isHomeOwnership
        ? false
        : !isSeasonFour && getTileFortifyDisabledReason(ownership) === null,
      fortifyDisabledReason: isHomeOwnership
        ? isSeasonFour
          ? homeMonumentReason
          : "Home of A is a daily boss and cannot be fortified."
        : isSeasonFour
          ? "Season 4 defense uses standing guard orders."
          : getTileFortifyDisabledReason(ownership),
      isConnectedToPlayerTerritory: pressureState.isConnectedToPlayerTerritory,
      pressurePriority: pressureState.pressurePriority,
      pressurePriorityRank: pressureState.pressurePriorityRank,
      pressurePlayerProgress: pressureState.pressurePlayerProgress,
      pressureProgress: pressureState.pressureProgress,
      pressureThreshold: pressureState.pressureThreshold,
      pressureLeaderFortressId: pressureState.pressureLeaderFortressId,
      pressureLeaderLabel: pressureState.pressureLeaderLabel,
      attackPriority: 0,
      ownershipPressure: ownership.ownershipPressure ?? null,
      canPrioritizePressure: pressureState.canPrioritizePressure,
      pressurePriorityDisabledReason:
        pressureState.pressurePriorityDisabledReason,
      activeBattlefieldId:
        activeBattlefieldByTileId.get(ownership.tileId)?.id ?? null,
      attackDisabledReason: isHomeOwnership
        ? isSeasonFour
          ? homeMonumentReason
          : canAttackHomeOfA
            ? null
            : !gameplayOpen
              ? "Home of A can only be attacked during gameplay."
              : !playerFortress
                ? "Join the cycle to attack Home of A."
                : playerFortress.army <= 0
                  ? "You need idle army to attack Home of A."
                  : homeRespawnsAt && homeRespawnsAt > now
                    ? "Home of A is defeated and waiting to respawn."
                    : "Home of A is not attackable right now."
        : isSeasonFour
          ? "Season 4 territory attacks use campaign orders."
          : getTileAttackDisabledReason(ownership),
      canStartCampaign: campaignDisabledReason === null,
      campaignDisabledReason,
      campaignId: activeCampaign?.id ?? null,
      campaignOrderId:
        activeCampaign &&
        playerFortress &&
        activeCampaign.attackerFortressId === playerFortress.id
          ? activeCampaign.armyOrderId
          : null,
      campaignStatus: activeCampaign?.status ?? null,
      campaignProgress: activeCampaign?.progress ?? null,
      campaignThreshold: activeCampaign ? CAMPAIGN_SIEGE_THRESHOLD : null,
      campaignResponseEndsAt: activeCampaign?.responseEndsAt ?? null,
      isOwnCampaign: Boolean(
        activeCampaign &&
        playerFortress &&
        activeCampaign.attackerFortressId === playerFortress.id
      ),
      canStationGuard: false,
      guardDisabledReason,
      guardOrderId: null,
      guardArmy: null,
      bonus,
      isHomeOfA: isHomeOwnership,
      pointIncome: isHomeOwnership
        ? null
        : bonus.points > 0
          ? bonus.points
          : null,
      holders: isHomeOwnership ? homeHolders : [],
      occupyingGarrison: occupyingGarrison
        ? {
            fortressId: occupyingGarrison.fortressId,
            fortressName: occupyingGarrison.fortressName,
            commanderName: occupyingGarrison.commanderName,
            army: occupyingGarrison.army,
            isCurrentUser: occupyingGarrison.ownerId === userId,
          }
        : null,
      ownGarrison: ownGarrison
        ? {
            id: ownGarrison.id,
            army: ownGarrison.army,
            canRecall: ownGarrison.army > 0,
            recallDisabledReason:
              ownGarrison.army > 0 ? null : "No garrison army remains.",
            canInstantRecall:
              !isSeasonFour &&
              playerFortress?.race === "SPACE_MURINES" &&
              raceBuffTier >= 1 &&
              (!latestGarrisonInstantRecallUse ||
                getHelsinkiHourKey(latestGarrisonInstantRecallUse.usedAt) !==
                  currentHourKey),
            canTorch: canTorchOwnGarrison,
            torchDisabledReason: canTorchOwnGarrison
              ? null
              : isHomeOfATile(ownership.tileId)
                ? "Home of A cannot be torched."
                : ownership.ownerFortressId === playerFortress?.id
                  ? "You cannot torch your own tile."
                  : activeBattleTileIds.has(ownership.tileId)
                    ? "That tile is already contested."
                    : "That garrison cannot torch this tile.",
          }
        : null,
    };
  });

  if (!homeOwnership) {
    mappedMapHexes.push({
      id: "home-of-a-neutral",
      tileId: HOME_OF_A_TILE_ID,
      biome: getTileById(HOME_OF_A_TILE_ID)?.biome ?? null,
      claimedAt: null,
      ownerFortressId: null,
      ownerRace: null,
      ownerName: isSeasonFour ? "Monument" : "Neutral",
      ownerCommanderName: isSeasonFour ? "Monument of A" : "Home of A",
      isCurrentUser: false,
      hasActiveBattle: false,
      canAttack: canAttackHomeOfA,
      canFortify: false,
      fortifyDisabledReason: isSeasonFour
        ? homeMonumentReason
        : "Home of A is a daily boss and cannot be fortified.",
      isConnectedToPlayerTerritory: false,
      pressurePriority: false,
      pressurePriorityRank: null,
      pressurePlayerProgress: null,
      pressureProgress: null,
      pressureThreshold: null,
      pressureLeaderFortressId: null,
      pressureLeaderLabel: null,
      attackPriority: 0,
      ownershipPressure: null,
      canPrioritizePressure: false,
      pressurePriorityDisabledReason: isSeasonFour
        ? homeMonumentReason
        : "Home of A is a daily boss and cannot receive expansion pressure.",
      activeBattlefieldId: null,
      attackDisabledReason: isSeasonFour
        ? homeMonumentReason
        : canAttackHomeOfA
          ? null
          : !gameplayOpen
            ? "Home of A can only be attacked during gameplay."
            : !playerFortress
              ? "Join the cycle to attack Home of A."
              : playerFortress.army <= 0
                ? "You need idle army to attack Home of A."
                : homeRespawnsAt && homeRespawnsAt > now
                  ? "Home of A is defeated and waiting to respawn."
                  : "Home of A is not attackable right now.",
      canStartCampaign: false,
      campaignDisabledReason: homeMonumentReason,
      campaignId: null,
      campaignOrderId: null,
      campaignStatus: null,
      campaignProgress: null,
      campaignThreshold: null,
      campaignResponseEndsAt: null,
      isOwnCampaign: false,
      canStationGuard: false,
      guardDisabledReason: homeMonumentReason,
      guardOrderId: null,
      guardArmy: null,
      bonus: homeTileBonus,
      isHomeOfA: true,
      pointIncome: null,
      holders: [],
      occupyingGarrison: null,
      ownGarrison: null,
    });
  }

  for (const tile of HEX_TILES) {
    if (
      !tile.claimable ||
      isHomeOfATile(tile.id) ||
      claimedTileIds.has(tile.id)
    ) {
      continue;
    }

    const pressureState = getTilePressureState(tile);
    const bonus = getTileBonus(tile);

    mappedMapHexes.push({
      id: `neutral-${tile.id}`,
      tileId: tile.id,
      biome: tile.biome,
      claimedAt: null,
      ownerFortressId: null,
      ownerRace: null,
      ownerName: "Neutral",
      ownerCommanderName: "Unclaimed",
      isCurrentUser: false,
      hasActiveBattle: activeBattleTileIds.has(tile.id),
      canAttack: false,
      canFortify: false,
      fortifyDisabledReason: "Own this tile before fortifying it.",
      isConnectedToPlayerTerritory: pressureState.isConnectedToPlayerTerritory,
      pressurePriority: pressureState.pressurePriority,
      pressurePriorityRank: pressureState.pressurePriorityRank,
      pressurePlayerProgress: pressureState.pressurePlayerProgress,
      pressureProgress: pressureState.pressureProgress,
      pressureThreshold: pressureState.pressureThreshold,
      pressureLeaderFortressId: pressureState.pressureLeaderFortressId,
      pressureLeaderLabel: pressureState.pressureLeaderLabel,
      attackPriority: 0,
      ownershipPressure: null, // neutral tiles have no ownership pressure
      canPrioritizePressure: pressureState.canPrioritizePressure,
      pressurePriorityDisabledReason:
        pressureState.pressurePriorityDisabledReason,
      activeBattlefieldId: activeBattlefieldByTileId.get(tile.id)?.id ?? null,
      attackDisabledReason: null,
      canStartCampaign: false,
      campaignDisabledReason: "Campaigns target enemy-owned territory.",
      campaignId: null,
      campaignOrderId: null,
      campaignStatus: null,
      campaignProgress: null,
      campaignThreshold: null,
      campaignResponseEndsAt: null,
      isOwnCampaign: false,
      canStationGuard: false,
      guardDisabledReason: "Own this tile before stationing guards.",
      guardOrderId: null,
      guardArmy: null,
      bonus,
      isHomeOfA: false,
      pointIncome: bonus.points > 0 ? bonus.points : null,
      holders: [],
      occupyingGarrison: null,
      ownGarrison: null,
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
        cycle.upgradesUnlockedAt ??
        cycle.testingStartedAt ??
        cycle.activeStartedAt,
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
            : "Build time is open. Players can join, choose a race, and reserve a Season 4 slot before activation."
          : cycle.status === CycleStatus.TESTING
            ? joiningLocked
              ? "Testing mode is live, but joins are currently locked by admin action. Sandbox progress resets before Season 4 activation."
              : "Testing mode is live. Season 4 activation remains held until the redesigned rules pass pretesting."
            : activeOpen
              ? "The season is live. Pressure, diplomacy, convoys, and campaigns resolve through the Season 4 ruleset."
              : "The season has ended. The next registration window is being prepared.",
      statusMessage:
        cycle.status === CycleStatus.REGISTRATION
          ? registrationOpen && joiningLocked
            ? "Build time remains open on the clock, but new joins are currently locked by admin action."
            : registrationOpen
              ? "Build time is open. Joining creates your fortress, locks your race choice, and reserves one of the 30 Season 4 slots."
              : "Build time has expired. The next game tick will either restart build time or move the cycle into ACTIVE."
          : cycle.status === CycleStatus.TESTING
            ? testingOpen && joiningLocked
              ? "Testing mode remains open on the clock, but new joins are currently locked by admin action."
              : testingOpen && remainingSlots > 0
                ? "Testing mode is live. You can still join during pretesting; sandbox progress resets before Season 4 activation."
                : testingOpen
                  ? "Testing mode is live, but all player slots are filled. Sandbox progress resets before Season 4 activation."
                  : "Testing is awaiting the next Season 4 launch decision."
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
          ownerId: playerFortress.ownerId,
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
          population:
            getFortressPopulation(
              playerFortress.level,
              getEffectiveRace(playerFortress)
            ) + ownedTileSummary.workerPoolBonus,
          defenseMultiplier: getFortressDefenseMultiplier(
            playerFortress.level,
            getEffectiveRace(playerFortress),
            playerCastleSpecializationCounts ?? undefined
          ),
          food: playerFortress.food,
          army: playerFortress.army,
          allUnits: playerAllUnits,
          idleArmy: playerFortress?.army ?? 0,
          queuedArmy: playerQueuedArmy,
          escortArmy: playerEscortArmy,
          raidArmy: playerRaidArmy,
          campaignArmy: playerCampaignArmy,
          guardArmy: playerGuardArmy,
          marchingArmy: playerInFlightArmy,
          fightingArmy: playerBattlefieldArmy,
          defendingArmy: playerGarrisonArmy,
          recruitmentQueue: playerFortress.recruitmentQueue,
          minersAssigned: playerFortress.minersAssigned,
          farmersAssigned: playerFortress.farmersAssigned,
          recruitersAssigned: playerFortress.recruitersAssigned,
          pressureWorkersAssigned: playerFortress.pressureWorkersAssigned,
          pressurePriorityLimit,
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
          seasonFourRulesEnabled: isSeasonFour,
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
          population:
            getFortressPopulation(
              playerFortress.level,
              getEffectiveRace(playerFortress)
            ) + ownedTileSummary.workerPoolBonus,
          defenseMultiplier: getFortressDefenseMultiplier(
            playerFortress.level,
            getEffectiveRace(playerFortress),
            playerCastleSpecializationCounts ?? undefined
          ),
          food: playerFortress.food,
          army: playerFortress.army,
          allUnits: playerAllUnits,
          idleArmy: playerFortress?.army ?? 0,
          queuedArmy: playerQueuedArmy,
          escortArmy: playerEscortArmy,
          raidArmy: playerRaidArmy,
          campaignArmy: playerCampaignArmy,
          guardArmy: playerGuardArmy,
          marchingArmy: playerInFlightArmy,
          fightingArmy: playerBattlefieldArmy,
          defendingArmy: playerGarrisonArmy,
          recruitmentQueue: playerFortress.recruitmentQueue,
          minersAssigned: playerFortress.minersAssigned,
          farmersAssigned: playerFortress.farmersAssigned,
          recruitersAssigned: playerFortress.recruitersAssigned,
          pressureWorkersAssigned: playerFortress.pressureWorkersAssigned,
          pressurePriorityLimit,
          race: playerFortress.race,
          currentAction: playerFortress.currentAction,
          currentTargetId: playerFortress.targetFortressId,
          currentTargetName: playerFortress.targetFortressId
            ? (async () => {
                const target = playerFortress.targetFortressId
                  ? targetLookup.get(playerFortress.targetFortressId)
                  : undefined;

                return target ? target.name : null;
              })()
            : null,
          isSlayerOfA: playerFortress.id === cycle.crownedFortressId,
          canRename: activeOpen && playerFortress.gold >= 10,
          isTestingPhase: cycle.status === CycleStatus.TESTING,
          canSetAction: gameplayOpen && playerFortress.race !== null,
          locationShuffleCost,
          freeLocationShuffleAvailable: false,
          hasOutgoingAttackUnits,
          outboundAttackUnitCount,
          maxSimultaneousAttacks,
          canShuffleLocation:
            !isSeasonFour &&
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
            canAffordUpgrade &&
            activeCastleUpgradeProject === null,
          castleSpecializationCounts: playerCastleSpecializationCounts,
          tradeWagonResourceLimit: getTradeWagonResourceLimit(
            playerCastleSpecializationCounts?.[CastleUpgradeSpecialization.TRADE] ??
              0
          ),
          buildingUpgradeOptions,
          castleUpgradeChoices: playerFortress.castleUpgradeSpecializations,
          pendingUpgradeSpecializationLevel,
          activeCastleUpgradeProject: activeCastleUpgradeProject
            ? {
                level: activeCastleUpgradeProject.level,
                specialization: activeCastleUpgradeProject.specialization,
                goldCost: activeCastleUpgradeProject.goldCost,
                startedAt: activeCastleUpgradeProject.startedAt,
                completesAt: activeCastleUpgradeProject.completesAt,
              }
            : null,
          nextUpgradeDurationMinutes:
            nextUpgradeCost !== null
              ? getFortressUpgradeDurationMinutes(
                  playerCastleSpecializationCounts?.DEFENSE ?? 0
                )
              : null,
          receivedSlayerUpgrade: Boolean(receivedSlayerUpgrade),
          factionSuppression: playerSuppression
            ? {
                runeFortressId: playerSuppression.runeFortressId,
                ownerName: playerSuppression.fortress.name,
                ownerCommanderName: playerSuppression.fortress.commanderName,
                activeUntil: playerSuppression.activeUntil,
              }
            : null,
          dwarfRuneOfGrudges: latestDwarfRuneOfGrudges
            ? {
                targetFortressId:
                  latestDwarfRuneOfGrudges.targetFortressId ?? null,
                targetName:
                  latestDwarfRuneOfGrudges.targetFortress?.name ?? null,
                targetCommanderName:
                  latestDwarfRuneOfGrudges.targetFortress?.commanderName ??
                  null,
                runeFortressId: latestDwarfRuneOfGrudges.runeFortressId,
                runeHealth:
                  latestDwarfRuneOfGrudges.runeFortress?.health ?? null,
                runeArmy: latestDwarfRuneOfGrudges.runeFortress?.army ?? null,
                activeUntil: latestDwarfRuneOfGrudges.activeUntil,
                goldCost: latestDwarfRuneOfGrudges.goldCost,
                maintenanceGoldPerTick:
                  latestDwarfRuneOfGrudges.maintenanceGoldPerTick,
              }
            : null,
          raceBuffs: {
            tier: raceBuffTier,
            tierThreeUnlocksAt: raceTierThreeUnlocksAt,
            deepMiningLatest: latestDwarfDeepMiningRoll
              ? {
                  outcome: latestDwarfDeepMiningRoll.outcome,
                  committedGold: latestDwarfDeepMiningRoll.committedGold,
                  goldDelta: latestDwarfDeepMiningRoll.goldDelta,
                  armyDelta: latestDwarfDeepMiningRoll.armyDelta,
                  recruitmentQueueDelta:
                    latestDwarfDeepMiningRoll.recruitmentQueueDelta,
                  resolvedAt: latestDwarfDeepMiningRoll.resolvedAt,
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
            deepMiningHistory: playerFortress.deepMiningRolls.map((roll) => ({
              outcome: roll.outcome,
              committedGold: roll.committedGold,
              goldDelta: roll.goldDelta,
              armyDelta: roll.armyDelta,
              recruitmentQueueDelta: roll.recruitmentQueueDelta,
              resolvedAt: roll.resolvedAt,
              activeUntil: roll.activeUntil,
              createdAt: roll.createdAt,
              targetName: roll.targetFortress?.name ?? null,
              runeFortressId: roll.runeFortressId,
              runeHealth: roll.runeFortress?.health ?? null,
              runeArmy: roll.runeFortress?.army ?? null,
            })),
            unicornShatteredRealityLatest: latestUnicornShatteredRealityRoll
              ? {
                  outcome: latestUnicornShatteredRealityRoll.outcome,
                  summary: latestUnicornShatteredRealityRoll.summary,
                  armyDelta: latestUnicornShatteredRealityRoll.armyDelta,
                  garrisonArmyDelta:
                    latestUnicornShatteredRealityRoll.garrisonArmyDelta,
                  goldDelta: latestUnicornShatteredRealityRoll.goldDelta,
                  foodDelta: latestUnicornShatteredRealityRoll.foodDelta,
                  activeUntil: latestUnicornShatteredRealityRoll.activeUntil,
                  createdAt: latestUnicornShatteredRealityRoll.createdAt,
                }
              : null,
            unicornShatteredRealityHistory:
              playerFortress.unicornShatteredRealityRolls.map((roll) => ({
                outcome: roll.outcome,
                summary: roll.summary,
                armyDelta: roll.armyDelta,
                garrisonArmyDelta: roll.garrisonArmyDelta,
                goldDelta: roll.goldDelta,
                foodDelta: roll.foodDelta,
                activeUntil: roll.activeUntil,
                createdAt: roll.createdAt,
              })),
            canActivateDeepMining:
              playerFortress.race === "DWARFS" &&
              (!latestDwarfDeepMiningUse ||
                latestDwarfDeepMiningUse.usedAt <=
                  dwarfDeepMiningCooldownStartedAt),
            canActivateRuneOfGrudges:
              playerFortress.race === "DWARFS" &&
              raceBuffTier >= 2 &&
              latestDwarfRuneOfGrudges === null,
            dwarfGrudges: playerFortress.dwarfGrudges.map((grudge) => ({
              targetFortressId: grudge.targetFortressId,
              targetName: grudge.targetFortress.name,
              targetCommanderName: grudge.targetFortress.commanderName,
              slot: grudge.slot,
              bonusMultiplier: grudge.bonusMultiplier,
            })),
            canChooseDwarfGrudge:
              playerFortress.race === "DWARFS" && raceBuffTier >= 1,
            canChooseDwarfTierThree:
              playerFortress.race === "DWARFS" &&
              raceBuffTier >= 2 &&
              playerFortress.dwarfGrudges.length > 0,
            canActivateWaaagh:
              playerFortress.race === "ORKS" &&
              raceBuffTier >= 2 &&
              (!latestWaaaghUse ||
                getHelsinkiDayKey(latestWaaaghUse.usedAt) !== currentDayKey),
            waaaghActiveUntil: activeWaaagh?.activeUntil ?? null,
            orkScrap: playerFortress.orkScrapBank?.scrap ?? 0,
            orkScrapEvents: playerFortress.orkScrapEvents.map((event) => ({
              id: event.id,
              reason: event.reason,
              delta: event.delta,
              balanceAfter: event.balanceAfter,
              tileId: event.tileId,
              targetName: event.targetFortress?.name ?? null,
              targetCommanderName: event.targetFortress?.commanderName ?? null,
              createdAt: event.createdAt,
            })),
            activeOrkBossOrder: activeOrkBossOrder
              ? {
                  id: activeOrkBossOrder.id,
                  kind: activeOrkBossOrder.kind,
                  label: ORK_BOSS_ORDER_CONFIG[activeOrkBossOrder.kind].label,
                  description:
                    ORK_BOSS_ORDER_CONFIG[activeOrkBossOrder.kind].description,
                  scrapCost: activeOrkBossOrder.scrapCost,
                  goldCost: activeOrkBossOrder.goldCost,
                  activeUntil: activeOrkBossOrder.activeUntil,
                }
              : null,
            orkBossOrders: Object.values(OrkBossOrderKind).map((kind) => {
              const config = ORK_BOSS_ORDER_CONFIG[kind];
              const disabledReason =
                playerFortress.race !== "ORKS"
                  ? "Only ORKS can bark Boss Orders."
                  : !gameplayOpen
                    ? "Boss Orders are only available during gameplay."
                    : activeOrkBossOrder
                      ? "Another Boss Order is already active."
                      : (playerFortress.orkScrapBank?.scrap ?? 0) <
                          config.scrapCost
                        ? `Needs ${config.scrapCost} Scrap.`
                        : playerFortress.gold < config.goldCost
                          ? `Needs ${config.goldCost} gold.`
                          : null;

              return {
                kind,
                label: config.label,
                description: config.description,
                scrapCost: config.scrapCost,
                goldCost: config.goldCost,
                durationMinutes: config.durationMinutes,
                canActivate: disabledReason === null,
                disabledReason,
              };
            }),
            orkWaaaghInvestments: Object.values(OrkWaaaghInvestmentKind).map(
              (kind) => {
                const config = ORK_WAAAGH_INVESTMENT_CONFIG[kind];
                const alreadyActive = activeWaaaghInvestments.some(
                  (investment) => investment.kind === kind
                );
                const disabledReason =
                  playerFortress.race !== "ORKS"
                    ? "Only ORKS can feed WAAAGH."
                    : !activeWaaagh
                      ? "WAAAGH must be active."
                      : alreadyActive
                        ? "This WAAAGH investment is already active."
                        : (playerFortress.orkScrapBank?.scrap ?? 0) <
                            config.scrapCost
                          ? `Needs ${config.scrapCost} Scrap.`
                          : null;

                return {
                  kind,
                  label: config.label,
                  description: config.description,
                  scrapCost: config.scrapCost,
                  canActivate: disabledReason === null,
                  disabledReason,
                  active: alreadyActive,
                };
              }
            ),
            canActivateStim:
              playerFortress.race === "SPACE_MURINES" &&
              raceBuffTier >= 1 &&
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
              raceBuffTier >= 2 &&
              (!latestInstantRecallUse ||
                getHelsinkiHourKey(latestInstantRecallUse.usedAt) !==
                  currentHourKey),
            canInstantRecallGarrison:
              playerFortress.race === "SPACE_MURINES" &&
              raceBuffTier >= 1 &&
              (!latestGarrisonInstantRecallUse ||
                getHelsinkiHourKey(latestGarrisonInstantRecallUse.usedAt) !==
                  currentHourKey),
            canActivateUnicornShatteredReality:
              unicornShatteredRealityAvailability.canUse,
            unicornShatteredRealityDisabledReason:
              unicornShatteredRealityAvailability.disabledReason,
            canClaimUnicornTeleport: unicornTeleportClaimAvailability.canUse,
            unicornTeleportClaimDisabledReason:
              unicornTeleportClaimAvailability.disabledReason,
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
          ownedTileSummary,
          growPerTick: calculateTickProduction({
            ...playerFortress,
            castleSpecializations:
              playerCastleSpecializationCounts ?? undefined,
          }).goldProduced,
          attackDamage: getFortressAttackDamage(playerFortress.level),
          garrisons: playerFortress.garrisons.map((garrison) => ({
            id: garrison.id,
            army: garrison.army,
            tileId: garrison.tileId,
            createdAt: garrison.createdAt,
            canRecall: garrison.army > 0,
            recallDisabledReason:
              garrison.army > 0 ? null : "No garrison army remains.",
            canInstantRecall:
              playerFortress.race === "SPACE_MURINES" &&
              raceBuffTier >= 1 &&
              (!latestGarrisonInstantRecallUse ||
                getHelsinkiHourKey(latestGarrisonInstantRecallUse.usedAt) !==
                  currentHourKey),
          })),
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
      race: fortress.race,
      rank: index + 1,
      isSlayerOfA: fortress.id === cycle.crownedFortressId,
      isCurrentUser: fortress.ownerId === userId,
    })),
    leaderboards,
    leaderboardTitles: leaderboardTitleConfigs.map((config) => {
      const holderFortressId = leaderboardTitleHolders[config.category] ?? null;
      const holder = holderFortressId
        ? playerFortresses.find((fortress) => fortress.id === holderFortressId)
        : null;

      return {
        category: config.category,
        label: config.label,
        title: config.title,
        metricLabel: config.metricLabel,
        buffLabel: config.buffLabel,
        holderFortressId,
        holderName: holder
          ? getDisplayName(holder.name, holder.id === cycle.crownedFortressId)
          : null,
        holderMetric: holder
          ? getLeaderboardMetric(
              config.category,
              holder,
              tileCountsByFortressId
            )
          : null,
        currentUserMetric: playerFortress
          ? getLeaderboardMetric(
              config.category,
              playerFortress,
              tileCountsByFortressId
            )
          : null,
      };
    }),
    mapFortresses,
    alliedRoads: (cycle.diplomacyRelations ?? [])
      .filter((rel) => rel.status === "ALLIED")
      .map((rel) => {
        const fortresses = cycle.fortresses ?? [];
        const a = fortresses.find((f) => f.id === rel.fortressAId);
        const b = fortresses.find((f) => f.id === rel.fortressBId);
        if (!a || !b) return null;
        return { x1: a.mapX, y1: a.mapY, x2: b.mapX, y2: b.mapY };
      })
      .filter((r): r is NonNullable<typeof r> => r !== null),
    roadSegments,
    mapHexes: mappedMapHexes,
    homeOfA: {
      tileId: HOME_OF_A_TILE_ID,
      pointIncome: 0,
      status: homeStatus,
      statusLabel: isSeasonFour
        ? "Monument: inaccessible in Season 4"
        : homeStatus === "ALIVE"
          ? `Boss alive: ${homeBoss?.health ?? 0}/${homeBoss?.maxHealth ?? 0} HP`
          : homeRespawnsAt && homeRespawnsAt > now
            ? `Defeated. Respawns at ${formatHelsinkiTime(homeRespawnsAt)}`
            : "Respawning soon",
      incomeLabel: isSeasonFour
        ? "No interaction or reward"
        : `Kill reward: ${homeReward} points, food, and army`,
      drainLabel: isSeasonFour
        ? "Preserved as a historical landmark"
        : "Killer receives a 12h +25% combat and economy buff",
      neutralDefenseArmy: isSeasonFour ? 0 : (homeBoss?.health ?? 0),
      holderCount: 0,
      ownerFortressId: null,
      ownerName: isSeasonFour ? "Monument" : "Home of A",
      ownerCommanderName: isSeasonFour ? "Monument of A" : "Home of A",
      bannerFortressId: null,
      bannerName: null,
      isCurrentUserHolder: false,
      holders: homeHolders,
      activeBattlefieldId: null,
      bossHealth: isSeasonFour ? 0 : (homeBoss?.health ?? 0),
      bossMaxHealth: isSeasonFour ? 0 : (homeBoss?.maxHealth ?? 0),
      bossReward: isSeasonFour ? 0 : homeReward,
      respawnsAt: isSeasonFour ? null : homeRespawnsAt,
      canAttack: canAttackHomeOfA,
      attackDisabledReason: isSeasonFour
        ? homeMonumentReason
        : canAttackHomeOfA
          ? null
          : !gameplayOpen
            ? "Home of A can only be attacked during gameplay."
            : !playerFortress
              ? "Join the cycle to attack Home of A."
              : playerFortress.army <= 0
                ? "You need idle army to attack Home of A."
                : homeRespawnsAt && homeRespawnsAt > now
                  ? "Home of A is defeated and waiting to respawn."
                  : "Home of A is not attackable right now.",
    },
    battlefields: mapActiveBattlefields({
      battlefields: isSeasonFour
        ? cycle.battlefields.filter(
            (battlefield) =>
              !isHomeOfATile(battlefield.targetTileId ?? "") &&
              (!battlefield.targetFortress ||
                battlefield.targetFortress.fortressKind === FortressKind.PLAYER)
          )
        : cycle.battlefields,
      cycleId: cycle.id,
      gameplayOpen,
      isSeasonFour,
      now,
      playerFortress,
      userId,
    }),
    attackUnits: cycle.attackUnits.map((unit) => {
      const tileTargetId =
        unit.fortifyTargetTileId ??
        unit.reinforcementBattalion?.garrisonedAt ??
        unit.reinforcementBattlefield?.targetTileId ??
        null;
      const tileTarget = tileTargetId ? getTileById(tileTargetId) : null;
      const homeTarget =
        tileTargetId && isHomeOfATile(tileTargetId)
          ? getHomeOfAMapPosition()
          : null;
      const originPoint =
        unit.recalledAt &&
        unit.returnOriginMapX !== null &&
        unit.returnOriginMapY !== null
          ? {
              mapX: unit.returnOriginMapX,
              mapY: unit.returnOriginMapY,
            }
          : {
              mapX: unit.attackerFortress.mapX,
              mapY: unit.attackerFortress.mapY,
            };
      const targetPoint = unit.recalledAt
        ? {
            mapX: unit.attackerFortress.mapX,
            mapY: unit.attackerFortress.mapY,
          }
        : homeTarget
          ? homeTarget
          : tileTarget
            ? {
                mapX: Math.round(tileTarget.xPercent),
                mapY: Math.round(tileTarget.yPercent),
              }
            : {
                mapX: unit.targetFortress.mapX,
                mapY: unit.targetFortress.mapY,
              };
      const roadTravel = calculateRoadAdjustedTravel({
        origin: originPoint,
        target: targetPoint,
        baseMinutes: getAttackTravelMinutes(originPoint, targetPoint),
        roadSegments,
      });
      return {
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
          unit.recalledAt === null &&
          !unit.reinforcementBattalion &&
          !unit.reinforcementBattlefield,
        canInstantRecall:
          !isSeasonFour &&
          Boolean(userId) &&
          unit.attackerFortress.ownerId === userId &&
          unit.recalledAt === null &&
          unit.attackerFortress.race === "SPACE_MURINES" &&
          raceBuffTier >= 2 &&
          (!latestInstantRecallUse ||
            getHelsinkiHourKey(latestInstantRecallUse.usedAt) !==
              currentHourKey),
        kind: (unit.reinforcementBattalion
          ? "BATTALION_REINFORCEMENT"
          : unit.reinforcementBattlefield
            ? "BATTLEFIELD_REINFORCEMENT"
            : unit.fortifyTargetTileId
              ? "FORTIFY"
              : "ATTACK") as
          | "ATTACK"
          | "FORTIFY"
          | "BATTLEFIELD_REINFORCEMENT"
          | "BATTALION_REINFORCEMENT",
        targetBattalionName: unit.reinforcementBattalion?.name ?? null,
        reinforcementSide: unit.reinforcementSide ?? null,
        roadSavedSeconds: roadTravel.savedMinutes * 60,
        roadSpeedMultiplier: roadTravel.speedMultiplier,
        routeTileIds: roadTravel.routeTileIds,
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
          id:
            unit.reinforcementBattalion?.id ??
            unit.fortifyTargetTileId ??
            unit.reinforcementBattlefield?.id ??
            unit.targetFortress.id,
          name: unit.reinforcementBattalion
            ? unit.reinforcementBattalion.name
            : unit.fortifyTargetTileId
              ? isHomeOfATile(unit.fortifyTargetTileId)
                ? "Home of A"
                : `Tile ${unit.fortifyTargetTileId}`
              : unit.reinforcementBattlefield
                ? "Battlefield reinforcement"
                : unit.targetFortress.name,
          mapX: homeTarget
            ? homeTarget.mapX
            : tileTarget
              ? Math.round(tileTarget.xPercent)
              : unit.targetFortress.mapX,
          mapY: homeTarget
            ? homeTarget.mapY
            : tileTarget
              ? Math.round(tileTarget.yPercent)
              : unit.targetFortress.mapY,
        },
      };
    }),
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
      submissionHint: isSeasonFour
        ? "Community wishes are archived and are not part of Season 4 gameplay."
        : !userId
          ? "Sign in and join this cycle to suggest a community wish."
          : !communityWishSourcePlayerFortress
            ? usingResolvedWishWindow
              ? "Only players from the last finished season can suggest a community wish."
              : "Only players in this cycle can suggest a community wish."
            : communityWishVotingOpen
              ? "Winner wish is guaranteed. Community wish is vote-based. You can edit your short English wish and vote until Monday 25 May at 12:00."
              : communityWishProposalOpen
                ? usingResolvedWishWindow
                  ? "Winner wish is guaranteed. Community wish is vote-based. You can edit your short English wish until Monday 25 May at 12:00 and vote once voting opens."
                  : "Winner wish is guaranteed. Community wish is vote-based. Submit one short English wish while the season is live."
                : "Community wishes are closed for this cycle.",
      proposals: mappedCommunityWishProposals,
    },
    battleReports,
    availableTargets:
      gameplayOpen && playerFortress && !isSeasonFour
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
    recentActivity,
    emptyStateMessage: null,
    incomingOfferCount,
    pendingDiplomacyCount,
    incidentCount,
    recallableOrderCount,
    nukeState,
    battalions: (cycle.battalions ?? []).map((b) => ({
      id: b.id,
      fortressId: b.fortressId,
      name: b.name,
      size: b.size,
      maxSize: b.maxSize,
      tier: b.tier,
      xp: b.xp,
      readyAt: b.readyAt?.getTime() ?? null,
      stance: b.stance,
      mode: b.mode ?? "GUARD",
      garrisonedAt: b.garrisonedAt,
    })),
    warFronts: (cycle.warFronts ?? []).map((f) => ({
      id: f.id,
      attackerFortressId: f.attackerFortressId,
      enemyFortressId: f.enemyFortressId,
      status: f.status,
      aggression: f.aggression,
    })),
    warPolicies: (cycle.warPolicies ?? []).map((p) => ({
      id: p.id,
      fortressId: p.fortressId,
      maxArmySize: p.maxArmySize,
      guardPercent: p.guardPercent,
      defaultAggression: p.defaultAggression,
      allianceSupportAttack: p.allianceSupportAttack,
      allianceSupportDefense: p.allianceSupportDefense,
      allianceSupportPercent: p.allianceSupportPercent,
    })),
    // Established trade routes: fortress pairs with ≥3 completed deliveries
    // get a persistent golden trade route line on the map.
    tradeRouteLines: await (async () => {
      const completedLegs = await db.convoyLeg.groupBy({
        by: ["fromFortressId", "toFortressId"],
        where: {
          cycleId: cycle.id,
          status: "DELIVERED",
        },
        _count: { id: true },
      });

      const ESTABLISHED_ROUTE_THRESHOLD = 3;
      const fortresses = cycle.fortresses ?? [];
      const fortressById = new Map(fortresses.map((f) => [f.id, f]));

      return completedLegs
        .filter((leg) => leg._count.id >= ESTABLISHED_ROUTE_THRESHOLD)
        .map((leg) => {
          const from = fortressById.get(leg.fromFortressId);
          const to = fortressById.get(leg.toFortressId);
          if (!from || !to) return null;
          return {
            x1: from.mapX,
            y1: from.mapY,
            x2: to.mapX,
            y2: to.mapY,
            deliveries: leg._count.id,
          };
        })
        .filter((r): r is NonNullable<typeof r> => r !== null);
    })(),
    convoyMarkers: (cycle.convoyLegs ?? []).map((leg) => {
      const from = (cycle.fortresses ?? []).find(
        (fortress) => fortress.id === leg.fromFortressId
      );
      const to = (cycle.fortresses ?? []).find(
        (fortress) => fortress.id === leg.toFortressId
      );
      const cargoParts = [
        leg.deedTileId ? `tile ${leg.deedTileId}` : null,
        leg.gold > 0 ? `${leg.gold.toLocaleString("en-US")}g` : null,
        leg.food > 0 ? `${leg.food.toLocaleString("en-US")}f` : null,
        leg.army > 0 ? `${leg.army.toLocaleString("en-US")} army` : null,
        leg.points > 0 ? `${leg.points.toLocaleString("en-US")} pts` : null,
        leg.nukeFuel > 0 ? `${leg.nukeFuel.toLocaleString("en-US")} fuel` : null,
        leg.nukeRocket > 0 ? `${leg.nukeRocket.toLocaleString("en-US")} rocket` : null,
        leg.nukeWrathOfA > 0 ? `${leg.nukeWrathOfA.toLocaleString("en-US")} wrath` : null,
      ].filter(Boolean);

      return {
        id: leg.id,
        fromFortressId: leg.fromFortressId,
        toFortressId: leg.toFortressId,
        fromName: from?.name ?? "Unknown fortress",
        toName: to?.name ?? "Unknown fortress",
        status: leg.status,
        gold: leg.gold,
        food: leg.food,
        army: leg.army,
        points: leg.points,
        nukeFuel: leg.nukeFuel,
        nukeRocket: leg.nukeRocket,
        nukeWrathOfA: leg.nukeWrathOfA,
        baseCargoValue: leg.baseCargoValue,
        deedTileId: leg.deedTileId,
        cargoLabel: cargoParts.join(", ") || "empty wagon",
        arrivedAwaitingTick: leg.arrivesAt <= now,
        departedAt: leg.departedAt?.getTime() ?? null,
        arrivesAt: leg.arrivesAt?.getTime() ?? null,
      };
    }),
  };
}
