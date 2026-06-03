import {
  CycleStatus,
  FortressKind,
  FortressAction,
  ArmyOrderStatus,
  ArmyOrderType,
  BattlefieldSide,
  BattlefieldStatus,
  DiplomacyRelationStatus,
  Prisma,
  PrismaClient,
  ScoreEventType,
  DwarfDeepMiningOutcome,
  RaceAbilityKind,
  OrkScrapEventReason,
  ChatMessageType,
  CastleUpgradeSpecialization,
  ConvoyLegStatus,
  TerritoryCampaignStatus,
  TradeOfferStatus,
  TradeLineItemKind,
  NukeComponentKind,
} from "@/lib/prisma-client";
import { prisma } from "@/lib/prisma";
import { ensureOpenRegistrationCycle } from "./bootstrap";
import {
  HOME_OF_A_BOSS_BUFF_HOURS,
  HOME_OF_A_BOSS_BUFF_MULTIPLIER,
  HOME_OF_A_BOSS_RESPAWN_HOURS,
  ACTIVE_DURATION_HOURS,
  getHomeOfABossHealth,
  getHomeOfABossReward,
} from "./constants";
import { mintSeasonArcadeCoins } from "./arcade";
import {
  createCommunityWishVoteEntitlements,
  getCommunityWishProposalEndsAt,
  resolveExpiredCommunityWishVotes,
} from "./community-wishes";
import {
  getCommunityWishVotingEndsAt,
  getNextCycleSchedule,
  isSeasonFourActivationEnabled,
  SEASON_4_DELAY_EXTENSION_HOURS,
} from "./season-schedule";
import {
  ensureCurrentMapLayout,
  ensureActiveCycleMegaFortress,
  ensureMegaFortress,
  ensureNpcSystemUser,
} from "./mega-fortress";
import { getAttackArrivalAt } from "./attacks";
import { buildFortressSpawnSeed } from "./spawn-layout";
import { addHours, addMinutes, floorToMinute } from "./time";
import {
  calculateRaidOutcome,
  calculateTickProduction,
  getDisplayedCastleLevel,
} from "./balance";
import {
  getArmyUpkeepCost,
  getStarvationArmyLoss,
  processRecruitmentQueue,
} from "./army-recruitment";
import { getFortressAttackDamage } from "./upgrades";
import {
  getRaceBuffTier,
  isRaceAbilityActive,
} from "./race-buffs";
import { getRaceModifiers, isFortressRace } from "./races";
import { getSkillModifiers } from "./race-skill-effects";
import {
  countCastleSpecializations,
  getCastleSpecializationMultiplier,
} from "./specializations";
import {
  applyOrkScrapDelta,
  getOrkBossOrderCarryMultiplier,
  getOrkBossOrderSpeedMultiplier,
  getOrkDirectRaidScrap,
  getOrkLootCampScrap,
  getOrkStrongerTogetherRate,
  isRealOrkPlayerFortress,
} from "./orks";
import {
  DWARF_DEEP_MINING_ECONOMY_MULTIPLIER,
  DWARF_DEEP_MINING_RUNE_BOUNTY,
} from "./dwarf-deep-mining";
import {
  getLootCampReward,
  resetAttackerRaceAbilityCooldown,
  spawnScheduledLootCamps,
  cleanupUnattackableLootCamps,
} from "./loot-camps";
import {
  createBattlefieldFromAttackUnit,
  processActiveBattlefields,
} from "./battlefields";
import {
  getLeaderboardTitleAttackMultiplier,
  getLeaderboardTitleCastleLootMultiplier,
  getLeaderboardTitleHolders,
  getLeaderboardTitleLootCampRewardMultiplier,
  getLeaderboardTitleTileIncomeMultipliers,
} from "./leaderboard-titles";
import {
  getCombatAttackPowerMultiplier,
  getCombatDefensePowerMultiplier,
  isPlayerCombatTarget,
} from "./combat-buffs";
import { UNICORN_SHATTERED_REALITY_ECONOMY_MULTIPLIER } from "./unicorn-shattered-reality";
import { HEX_TILES } from "./map-hex";
import {
  getTileBonus,
  getTileById,
  isHomeOfATile,
  isTileConnectedToFortressOrOwnedTiles,
} from "./territory";
import {
  applyUnsupportedPressureDecay,
  allocatePressureAcrossTargets,
  calculateOwnershipMaintenanceWorkers,
  calculatePressureOutput,
  chooseAutoTilePressurePriorityCandidates,
  getDistanceAdjustedTilePressureClaimThreshold,
  getDistanceAdjustedTilePressureDecayPercent,
  getEffectiveEnemyPressureOnOwnedTile,
  getEffectiveTilePressure,
  getNeutralPressureClaimWinner,
  getPressureTargetBlockedReason,
  getExpansionTileCapacity,
  getTilePressureClaimThreshold,
  getTilePressurePriorityLimit,
  getTilePressurePriorityWeightForSlot,
  sortTilePressureQueue,
} from "./tile-pressure";
import { isSeasonFourRuleset } from "./rulesets";
import {
  CAMPAIGN_SIEGE_THRESHOLD,
  calculateCampaignProgressPerTick,
  getCampaignResponseEndsAt,
} from "./campaigns";
import {
  getCanonicalDiplomacyPair,
  getCasusBelliExpiresAt,
  getDiplomacyPressureBlockedReason,
  getEffectiveDiplomacyStatus,
} from "./politics";
import {
  calculateTradeCargoValue,
  getActiveTradeWagonLimit,
  getAllianceDeliveryBonus,
  getTradeNukeComponents,
  splitTradeDeliveryPoints,
  splitTradeCargoIntoWagonRuns,
  type TradeCargo,
} from "./trading";
import {
  calculateConvoyEncounterCasualties,
  calculateDetectionChance,
  calculateRaidSuccessChance,
  calculateStolenConvoyCargo,
  getRaidTargetBlockedReason,
  isConvoyRaidEligible,
  resolveSeededChance,
} from "./convoy-conflict";
import {
  getCampaignArmyDoctrineMultiplier,
  getDoctrineTier,
  getEscortDoctrineMultiplier,
  getGuardDetectionDoctrineMultiplier,
  getNeutralPressureDoctrineMultiplier,
  getRaidEvasionDoctrineMultiplier,
  getRaidPowerDoctrineMultiplier,
  getStolenCargoDoctrineMultiplier,
} from "./doctrines";
import { recalculateReturningAttackRoutes } from "./fortress-relocation";
import {
  ensureBattlefieldPointRewardColumn,
  ensureHomeOfABossSchema,
  ensureRaceSchemaReadiness,
} from "./schema-guards";
import { processAutoWarDispatch } from "./tick-auto-war-integration";
import { processAllianceReinforcements } from "./tick-alliance-integration";
import {
  recordIdleBattalionRoadCrossings,
  recordUnitRoadCrossings,
} from "./tick-road-integration";
import { getRoadAdjustedConvoyArrival } from "./road-travel";
import {
  processBattalionRecruitment,
  processBattalionGuard,
  reconcileBattalionCasualties,
} from "./tick-battalion-integration";
import {
  ensureCurrentNukeComponentRound,
  resolveDueNukeComponentRounds,
} from "./service";

export type TickSummary = {
  restartedRegistrationCycles: number;
  testingCyclesStarted: number;
  testingCyclesCompleted: number;
  activatedCycles: number;
  resolvedCycles: number;
  resolvedCommunityWishVotes: number;
  nextRegistrationCyclesCreated: number;
  processedMinutes: number;
  skippedCatchUpMinutes?: number;
  scoreEventsCreated: number;
  launchedAttackUnits: number;
  resolvedAttackUnits: number;
};

type ProcessCycleTickResult = {
  processed: boolean;
  scoreEventsCreated: number;
  launchedAttackUnits: number;
  resolvedAttackUnits: number;
};

function getHomeOfABossDefeatAnnouncement({
  fortressName,
  commanderName,
  reward,
  buffHours,
  respawnHours,
}: {
  fortressName: string;
  commanderName: string;
  reward: number;
  buffHours: number;
  respawnHours: number;
}) {
  return `HOME OF A HAS BEEN BONKED: ${fortressName} dealt the most damage, so ${commanderName} gets ${reward} points, ${reward} food, ${reward} army, and ${buffHours} hours of suspiciously divine swagger. A is now lying down for ${respawnHours} hours and insisting this was all part of the plan.`;
}

const TICK_TRANSACTION_OPTIONS = {
  maxWait: 10_000,
  timeout: 60_000,
} satisfies Parameters<PrismaClient["$transaction"]>[1];

const DEFAULT_MAX_CATCH_UP_MINUTES = 10;

function getConfiguredMaxCatchUpMinutes() {
  const rawValue = process.env.GAME_TICK_MAX_CATCH_UP_MINUTES;

  if (!rawValue) {
    return DEFAULT_MAX_CATCH_UP_MINUTES;
  }

  const parsed = Number(rawValue);

  if (!Number.isFinite(parsed)) {
    return DEFAULT_MAX_CATCH_UP_MINUTES;
  }

  return Math.max(0, Math.floor(parsed));
}

function countDueMinutes(from: Date, to: Date) {
  return Math.max(0, Math.floor((to.getTime() - from.getTime()) / 60_000) + 1);
}

export type TickHealth = "ok" | "lagging" | "stalled";

type TieBreakCandidate = {
  fortressId: string;
  ownerId: string;
  commanderName: string;
  fortressName: string;
  finalScore: number;
  reachedFinalScoreAt: Date;
  joinedAt: Date;
};

function isActiveMapBlocker(
  fortress: {
    fortressKind: FortressKind;
    health: number;
    expiresAt: Date | null;
  },
  tickAt: Date
) {
  if (fortress.fortressKind === FortressKind.PLAYER) {
    return true;
  }

  if (fortress.health <= 0) {
    return false;
  }

  return !fortress.expiresAt || fortress.expiresAt > tickAt;
}

async function processDueUnicornTeleportReturns({
  db,
  cycleId,
  tickAt,
}: {
  db: PrismaClient;
  cycleId: string;
  tickAt: Date;
}) {
  const dueTeleports = await db.unicornTemporaryTeleport.findMany({
    where: {
      cycleId,
      returnedAt: null,
      returnAt: {
        lte: tickAt,
      },
    },
    orderBy: [{ returnAt: "asc" }, { id: "asc" }],
    select: {
      id: true,
      fortressId: true,
      decoyFortressId: true,
      originMapX: true,
      originMapY: true,
      fortress: {
        select: {
          mapX: true,
          mapY: true,
        },
      },
    },
  });

  for (const teleport of dueTeleports) {
    await db.$transaction(async (tx) => {
      const latestTeleport = await tx.unicornTemporaryTeleport.findUnique({
        where: {
          id: teleport.id,
        },
        select: {
          returnedAt: true,
        },
      });

      if (!latestTeleport || latestTeleport.returnedAt) {
        return;
      }

      const blockers = await tx.fortress.findMany({
        where: {
          cycleId,
          mapX: teleport.originMapX,
          mapY: teleport.originMapY,
          id: {
            notIn: [
              teleport.fortressId,
              ...(teleport.decoyFortressId ? [teleport.decoyFortressId] : []),
            ],
          },
        },
        select: {
          fortressKind: true,
          health: true,
          expiresAt: true,
        },
      });

      if (blockers.some((blocker) => isActiveMapBlocker(blocker, tickAt))) {
        return;
      }

      await tx.fortress.update({
        where: {
          id: teleport.fortressId,
        },
        data: {
          mapX: teleport.originMapX,
          mapY: teleport.originMapY,
        },
      });

      if (teleport.decoyFortressId) {
        await tx.fortress.update({
          where: {
            id: teleport.decoyFortressId,
          },
          data: {
            health: 0,
            expiresAt: tickAt,
          },
        });
      }

      await tx.unicornTemporaryTeleport.update({
        where: {
          id: teleport.id,
        },
        data: {
          returnedAt: tickAt,
        },
      });

      await recalculateReturningAttackRoutes({
        db: tx,
        fortressId: teleport.fortressId,
        oldDestination: {
          mapX: teleport.fortress.mapX,
          mapY: teleport.fortress.mapY,
        },
        newDestination: {
          mapX: teleport.originMapX,
          mapY: teleport.originMapY,
        },
        now: tickAt,
      });
    }, TICK_TRANSACTION_OPTIONS);
  }
}

async function processDueCastleUpgradeProjects({
  db,
  cycleId,
  tickAt,
}: {
  db: PrismaClient;
  cycleId: string;
  tickAt: Date;
}) {
  const dueProjects = await db.castleUpgradeProject.findMany({
    where: {
      cycleId,
      completedAt: null,
      completesAt: {
        lte: tickAt,
      },
    },
    orderBy: [{ completesAt: "asc" }, { id: "asc" }],
    select: {
      id: true,
      fortressId: true,
      level: true,
      specialization: true,
    },
  });

  for (const project of dueProjects) {
    await db.$transaction(async (tx) => {
      const latestProject = await tx.castleUpgradeProject.findUnique({
        where: {
          id: project.id,
        },
        select: {
          completedAt: true,
        },
      });

      if (!latestProject || latestProject.completedAt) {
        return;
      }

      const fortress = await tx.fortress.findUnique({
        where: {
          id: project.fortressId,
        },
        select: {
          level: true,
          isNpc: true,
          castleUpgradeSpecializations: {
            select: {
              level: true,
              specialization: true,
            },
          },
        },
      });

      if (!fortress || fortress.isNpc) {
        await tx.castleUpgradeProject.update({
          where: {
            id: project.id,
          },
          data: {
            completedAt: tickAt,
          },
        });
        return;
      }

      const currentSpecializationLevel = countCastleSpecializations(
        fortress.castleUpgradeSpecializations
      )[project.specialization];
      const maxCompletedLevel =
        project.specialization === "DEFENSE"
          ? currentSpecializationLevel + 1
          : getDisplayedCastleLevel(fortress.level);
      const completedLevel = Math.min(
        maxCompletedLevel,
        Math.max(project.level, currentSpecializationLevel + 1)
      );

      if (project.specialization === "DEFENSE") {
        await tx.fortress.update({
          where: {
            id: project.fortressId,
          },
          data: {
            level: fortress.level + 1,
          },
        });
      }

      await tx.castleUpgradeSpecializationChoice.upsert({
        where: {
          fortressId_specialization_level: {
            fortressId: project.fortressId,
            specialization: project.specialization,
            level: completedLevel,
          },
        },
        create: {
          fortressId: project.fortressId,
          level: completedLevel,
          specialization: project.specialization,
          createdAt: tickAt,
        },
        update: {},
      });

      await tx.castleUpgradeProject.update({
        where: {
          id: project.id,
        },
        data: {
          completedAt: tickAt,
        },
      });
    }, TICK_TRANSACTION_OPTIONS);
  }
}

function getSkillPressureMultiplier(fortress: {
  race?: string | null;
  skillPurchases?: Array<{ nodeKey: string }> | null;
}) {
  if (!fortress.race || !isFortressRace(fortress.race)) return 1;
  const modifiers = getSkillModifiers({
    race: fortress.race,
    purchases: fortress.skillPurchases ?? [],
  });
  const thresholdMultiplier = modifiers.claimThreshold
    ? getTilePressureClaimThreshold(true) / modifiers.claimThreshold
    : 1;
  return modifiers.pressureMultiplier * thresholdMultiplier;
}

async function processTilePressureExpansion({
  db,
  cycleId,
  tickAt,
  isSeasonFour,
}: {
  db: PrismaClient;
  cycleId: string;
  tickAt: Date;
  isSeasonFour: boolean;
}) {
  const claimThreshold = getTilePressureClaimThreshold(isSeasonFour);

  await db.$transaction(async (tx) => {
    const [fortresses, ownerships, priorities, diplomacyRelations] = await Promise.all([
      tx.fortress.findMany({
        where: {
          cycleId,
          fortressKind: FortressKind.PLAYER,
          isNpc: false,
        },
        select: {
          id: true,
          race: true,
          mapX: true,
          mapY: true,
          pressureWorkersAssigned: true,
          doctrine: true,
          skillPurchases: { select: { nodeKey: true } },
        },
      }),
      tx.mapHexOwnership.findMany({
        where: {
          cycleId,
        },
        select: {
          tileId: true,
          ownerFortressId: true,
        },
      }),
      tx.tilePressurePriority.findMany({
        where: {
          cycleId,
        },
        select: {
          fortressId: true,
          tileId: true,
          weight: true,
        },
        orderBy: [{ createdAt: "asc" }, { tileId: "asc" }],
      }),
      tx.diplomacyRelation.findMany({
        where: {
          cycleId,
        },
        select: {
          fortressAId: true,
          fortressBId: true,
          status: true,
          warStartsAt: true,
        },
      }),
    ]);

    const ownerByTileId = new Map(
      ownerships.map((ownership) => [
        ownership.tileId,
        ownership.ownerFortressId,
      ])
    );
    const relationByPairKey = new Map(
      diplomacyRelations.map((relation) => [
        `${relation.fortressAId}:${relation.fortressBId}`,
        relation,
      ])
    );
    const getDiplomacyRelationForPair = (
      fortressOneId: string,
      fortressTwoId: string
    ) => {
      const pair = getCanonicalDiplomacyPair(fortressOneId, fortressTwoId);

      return relationByPairKey.get(`${pair.fortressAId}:${pair.fortressBId}`);
    };
    const ownedTileIdsByFortressId = new Map<string, string[]>();
    const ownedTileBiomesByFortressId = new Map<
      string,
      NonNullable<ReturnType<typeof getTileById>>["biome"][]
    >();
    const prioritiesByFortressId = new Map<
      string,
      Array<{ tileId: string; weight: number }>
    >();

    for (const ownership of ownerships) {
      if (isHomeOfATile(ownership.tileId)) {
        continue;
      }

      const ownedTileIds =
        ownedTileIdsByFortressId.get(ownership.ownerFortressId) ?? [];
      ownedTileIds.push(ownership.tileId);
      ownedTileIdsByFortressId.set(ownership.ownerFortressId, ownedTileIds);
      const biome = getTileById(ownership.tileId)?.biome;
      if (biome) {
        const biomes =
          ownedTileBiomesByFortressId.get(ownership.ownerFortressId) ?? [];
        biomes.push(biome);
        ownedTileBiomesByFortressId.set(ownership.ownerFortressId, biomes);
      }
    }

    for (const priority of priorities) {
      const fortressPriorities =
        prioritiesByFortressId.get(priority.fortressId) ?? [];
      fortressPriorities.push({
        tileId: priority.tileId,
        weight: priority.weight,
      });
      prioritiesByFortressId.set(priority.fortressId, fortressPriorities);
    }

    const claimableTiles = HEX_TILES.filter((tile) => tile.claimable);
    const fortressById = new Map(fortresses.map((fortress) => [fortress.id, fortress]));
    const pressuredTileIds = new Set<string>();
    const removePressurePriorityTileFromQueue = (tileId: string) => {
      for (const [fortressId, fortressPriorities] of prioritiesByFortressId) {
        const remainingPriorities = fortressPriorities.filter(
          (priority) => priority.tileId !== tileId
        );
        if (remainingPriorities.length === fortressPriorities.length) continue;
        prioritiesByFortressId.set(fortressId, remainingPriorities);
      }
    };
    const normalizePriorityWeights = async (fortress: (typeof fortresses)[number]) => {
      const priorityLimit = getTilePressurePriorityLimit(fortress);
      const normalizedPriorities = sortTilePressureQueue(
        prioritiesByFortressId.get(fortress.id) ?? []
      ).slice(0, priorityLimit);

      await Promise.all(
        normalizedPriorities.map((priority, index) =>
          tx.tilePressurePriority.updateMany({
            where: {
              cycleId,
              fortressId: fortress.id,
              tileId: priority.tileId,
            },
            data: {
              weight: getTilePressurePriorityWeightForSlot({
                slot: index + 1,
                limit: priorityLimit,
              }),
            },
          })
        )
      );

      prioritiesByFortressId.set(
        fortress.id,
        normalizedPriorities.map((priority, index) => ({
          tileId: priority.tileId,
          weight: getTilePressurePriorityWeightForSlot({
            slot: index + 1,
            limit: priorityLimit,
          }),
        }))
      );
    };
    const fillAutoPressurePriorities = async ({
      fortress,
      isLegalPressureTarget,
    }: {
      fortress: (typeof fortresses)[number];
      isLegalPressureTarget: (tileId: string) => boolean;
    }) => {
      const priorityLimit = getTilePressurePriorityLimit(fortress);
      const currentPriorities = sortTilePressureQueue(
        prioritiesByFortressId.get(fortress.id) ?? []
      );

      if (currentPriorities.length < priorityLimit) {
        const autoCandidates = chooseAutoTilePressurePriorityCandidates({
          fortress,
          tiles: claimableTiles,
          limit: priorityLimit - currentPriorities.length,
          existingTileIds: currentPriorities.map((priority) => priority.tileId),
          isLegalPressureTarget,
        });

        for (const candidate of autoCandidates) {
          const nextSlot =
            (prioritiesByFortressId.get(fortress.id) ?? []).length + 1;
          const priority = {
            tileId: candidate.tileId,
            weight: getTilePressurePriorityWeightForSlot({
              slot: nextSlot,
              limit: priorityLimit,
            }),
          };

          await tx.tilePressurePriority.create({
            data: {
              cycleId,
              fortressId: fortress.id,
              tileId: priority.tileId,
              weight: priority.weight,
            },
          });

          prioritiesByFortressId.set(fortress.id, [
            ...(prioritiesByFortressId.get(fortress.id) ?? []),
            priority,
          ]);
        }
      }

      await normalizePriorityWeights(fortress);
    };

    const storedPressureStates = isSeasonFour
      ? await tx.tilePressureState.findMany({
          where: {
            cycleId,
          },
          select: {
            id: true,
            fortressId: true,
            tileId: true,
            pressure: true,
            lastPressuredAt: true,
            lastDecayedAt: true,
          },
        })
      : [];

    for (const state of storedPressureStates) {
      const ownerFortressId = ownerByTileId.get(state.tileId) ?? null;

      if (ownerFortressId) {
        const fortress = fortressById.get(state.fortressId);
        const relation =
          fortress && ownerFortressId !== state.fortressId
            ? getDiplomacyRelationForPair(state.fortressId, ownerFortressId)
            : null;
        const ownedTileIds =
          fortress && ownerFortressId !== state.fortressId
            ? (ownedTileIdsByFortressId.get(state.fortressId) ?? [])
            : [];
        const isLegalOwnedPressure =
          fortress !== undefined &&
          ownerFortressId !== state.fortressId &&
          getPressureTargetBlockedReason({
            tile: getTileById(state.tileId),
            tileId: state.tileId,
            ownerFortressId,
            diplomacyBlockedReason: getDiplomacyPressureBlockedReason({
              relation,
              now: tickAt,
            }),
            fortress,
            ownedTileIds,
            isHomeOfA: isHomeOfATile,
            isConnected: ({ tileId, ownedTileIds }) =>
              isTileConnectedToFortressOrOwnedTiles({
                tileId,
                fortress,
                ownedTileIds,
              }),
          }) === null;

        if (!isLegalOwnedPressure) {
          await tx.tilePressureState.delete({
            where: {
              id: state.id,
            },
          });
          continue;
        }
      }

      const decayFrom = state.lastDecayedAt ?? state.lastPressuredAt;
      const elapsedHours = Math.floor(
        (tickAt.getTime() - decayFrom.getTime()) / (60 * 60 * 1000)
      );

      if (elapsedHours <= 0) {
        continue;
      }
      const fortress = fortressById.get(state.fortressId);

      const pressure = applyUnsupportedPressureDecay({
        pressure: state.pressure,
        elapsedHours,
        decayPercentPerHour: fortress
          ? getDistanceAdjustedTilePressureDecayPercent({
              fortress,
              tileId: state.tileId,
            })
          : undefined,
      });

      if (pressure <= 0) {
        await tx.tilePressureState.delete({
          where: {
            id: state.id,
          },
        });
        continue;
      }

      await tx.tilePressureState.update({
        where: {
          id: state.id,
        },
        data: {
          pressure,
          lastDecayedAt: addHours(decayFrom, elapsedHours),
        },
      });
    }

    for (const fortress of fortresses) {
      const pressure = calculatePressureOutput({
        pressureWorkersAssigned: fortress.pressureWorkersAssigned,
        race: fortress.race,
      });
      const expansionTileCapacity = getExpansionTileCapacity({
        pressureWorkersAssigned: fortress.pressureWorkersAssigned,
        race: fortress.race,
        skillPurchases: fortress.skillPurchases,
      });

      const ownedTileIds = ownedTileIdsByFortressId.get(fortress.id) ?? [];
      const doctrineTier = isSeasonFour
        ? getDoctrineTier({
            race: fortress.race,
            ownedTileBiomes: ownedTileBiomesByFortressId.get(fortress.id) ?? [],
          })
        : 0;
      const isConnected = ({
        tileId,
        ownedTileIds,
      }: {
        tileId: string;
        ownedTileIds: Iterable<string>;
      }) =>
        isTileConnectedToFortressOrOwnedTiles({
          tileId,
          fortress,
          ownedTileIds,
        });
      const isLegalPriorityTarget = (tileId: string) => {
        const ownerFortressId = ownerByTileId.get(tileId) ?? null;
        const relation =
          ownerFortressId && ownerFortressId !== fortress.id
            ? getDiplomacyRelationForPair(fortress.id, ownerFortressId)
            : null;

        return (
          getPressureTargetBlockedReason({
            tile: getTileById(tileId),
            tileId,
            ownerFortressId,
            diplomacyBlockedReason: getDiplomacyPressureBlockedReason({
              relation,
              now: tickAt,
            }),
            fortress,
            ownedTileIds,
            isHomeOfA: isHomeOfATile,
            isConnected,
          }) === null
        );
      };
      const queuedPriorities = sortTilePressureQueue(
        prioritiesByFortressId.get(fortress.id) ?? []
      );

      const stalePriorities = queuedPriorities.filter(
        (priority) => !isLegalPriorityTarget(priority.tileId)
      );

      if (stalePriorities.length > 0) {
        await tx.tilePressurePriority.deleteMany({
          where: {
            cycleId,
            fortressId: fortress.id,
            tileId: {
              in: stalePriorities.map((priority) => priority.tileId),
            },
          },
        });
        const staleTileIds = new Set(stalePriorities.map((priority) => priority.tileId));
        prioritiesByFortressId.set(
          fortress.id,
          queuedPriorities.filter((priority) => !staleTileIds.has(priority.tileId))
        );
      }

      if (ownedTileIds.length < expansionTileCapacity) {
        await fillAutoPressurePriorities({
          fortress,
          isLegalPressureTarget: isLegalPriorityTarget,
        });
      } else {
        await normalizePriorityWeights(fortress);
      }

      if (pressure <= 0) {
        continue;
      }

      const legalPressurePriorities = sortTilePressureQueue(
        prioritiesByFortressId.get(fortress.id) ?? []
      ).filter((priority) => isLegalPriorityTarget(priority.tileId));
      const legalPressureTargets = legalPressurePriorities.filter((priority) => {
        const ownerFortressId = ownerByTileId.get(priority.tileId) ?? null;

        return ownerFortressId
          ? ownerFortressId !== fortress.id
          : ownedTileIds.length < expansionTileCapacity;
      });
      const targets =
        legalPressureTargets.length > 0
          ? legalPressureTargets.slice(0, 1)
          : ownedTileIds.length < expansionTileCapacity
            ? claimableTiles
                .filter((tile) => isLegalPriorityTarget(tile.id))
                .map((tile) => ({ tileId: tile.id, weight: 1 }))
            : [];

      for (const allocation of allocatePressureAcrossTargets({
        pressure,
        targets,
      })) {
        const doctrinePressure = Math.floor(
          allocation.pressure *
            getNeutralPressureDoctrineMultiplier({
              doctrine: isSeasonFour ? fortress.doctrine : null,
              tier: doctrineTier,
              targetBiome: getTileById(allocation.tileId)?.biome,
            }) *
            getSkillPressureMultiplier(fortress)
        );
        pressuredTileIds.add(allocation.tileId);
        await tx.tilePressureState.upsert({
          where: {
            cycleId_tileId_fortressId: {
              cycleId,
              tileId: allocation.tileId,
              fortressId: fortress.id,
            },
          },
          create: {
            cycleId,
            tileId: allocation.tileId,
            fortressId: fortress.id,
            pressure: doctrinePressure,
            lastPressuredAt: tickAt,
          },
          update: {
            pressure: {
              increment: doctrinePressure,
            },
            lastPressuredAt: tickAt,
            lastDecayedAt: null,
          },
        });
      }
    }

    for (const tileId of pressuredTileIds) {
      if (ownerByTileId.has(tileId)) {
        continue;
      }

      const states = await tx.tilePressureState.findMany({
        where: {
          cycleId,
          tileId,
        },
        select: {
          fortressId: true,
          pressure: true,
        },
      });
      const eligibleStates = states.flatMap((state) => {
        const fortress = fortressById.get(state.fortressId);

        if (!fortress) {
          return state.pressure >= claimThreshold ? [state] : [];
        }

        const threshold = getDistanceAdjustedTilePressureClaimThreshold({
          isSeasonFour,
          fortress,
          tileId,
        });

        if (state.pressure < threshold) {
          return [];
        }

        return [
          {
            ...state,
            effectivePressure: getEffectiveTilePressure({
              isSeasonFour,
              fortress,
              tileId,
              pressure: state.pressure,
            }),
          },
        ];
      });
      const winnerFortressId = getNeutralPressureClaimWinner({
        states: eligibleStates,
        threshold: 0,
      });

      if (!winnerFortressId) {
        continue;
      }
      const winnerOwnedTileCount =
        ownedTileIdsByFortressId.get(winnerFortressId)?.length ?? 0;
      const winner = fortressById.get(winnerFortressId);
      const winnerExpansionTileCapacity = winner
        ? getExpansionTileCapacity({
            pressureWorkersAssigned: winner.pressureWorkersAssigned,
            race: winner.race,
            skillPurchases: winner.skillPurchases,
          })
        : 0;

      if (winnerOwnedTileCount >= winnerExpansionTileCapacity) {
        continue;
      }

      await tx.mapHexOwnership.create({
        data: {
          cycleId,
          tileId,
          ownerFortressId: winnerFortressId,
          claimedAt: tickAt,
        },
      });
      ownerByTileId.set(tileId, winnerFortressId);
      ownedTileIdsByFortressId.set(winnerFortressId, [
        ...(ownedTileIdsByFortressId.get(winnerFortressId) ?? []),
        tileId,
      ]);

      // Award points for claiming a neutral tile
      const TILE_CLAIM_POINTS = 5;
      await tx.scoreEvent.create({
        data: {
          cycleId,
          fortressId: winnerFortressId,
          eventType: ScoreEventType.TILE_CLAIM,
          delta: TILE_CLAIM_POINTS,
          createdAt: tickAt,
        },
      });
      await tx.fortress.update({
        where: { id: winnerFortressId },
        data: { points: { increment: TILE_CLAIM_POINTS } },
      });

      await tx.tilePressurePriority.deleteMany({
        where: {
          cycleId,
          tileId,
        },
      });
      removePressurePriorityTileFromQueue(tileId);
      await tx.tilePressureState.deleteMany({
        where: {
          cycleId,
          tileId,
        },
      });
    }

    for (const fortress of fortresses) {
      const ownedTileIds = ownedTileIdsByFortressId.get(fortress.id) ?? [];
      const isConnected = ({
        tileId,
        ownedTileIds,
      }: {
        tileId: string;
        ownedTileIds: Iterable<string>;
      }) =>
        isTileConnectedToFortressOrOwnedTiles({
          tileId,
          fortress,
          ownedTileIds,
        });
      const isLegalPressureTarget = (tileId: string) => {
        const ownerFortressId = ownerByTileId.get(tileId) ?? null;
        const relation =
          ownerFortressId && ownerFortressId !== fortress.id
            ? getDiplomacyRelationForPair(fortress.id, ownerFortressId)
            : null;

        return (
          getPressureTargetBlockedReason({
            tile: getTileById(tileId),
            tileId,
            ownerFortressId,
            diplomacyBlockedReason: getDiplomacyPressureBlockedReason({
              relation,
              now: tickAt,
            }),
            fortress,
            ownedTileIds,
            isHomeOfA: isHomeOfATile,
            isConnected,
          }) === null
        );
      };

      const expansionTileCapacity = getExpansionTileCapacity({
        pressureWorkersAssigned: fortress.pressureWorkersAssigned,
        race: fortress.race,
        skillPurchases: fortress.skillPurchases,
      });

      if (ownedTileIds.length < expansionTileCapacity) {
        await fillAutoPressurePriorities({
          fortress,
          isLegalPressureTarget,
        });
      } else {
        await normalizePriorityWeights(fortress);
      }
    }
  }, TICK_TRANSACTION_OPTIONS);
}

async function processSeasonFourCampaigns({
  db,
  cycleId,
  tickAt,
}: {
  db: PrismaClient;
  cycleId: string;
  tickAt: Date;
}) {
  await db.$transaction(async (tx) => {
    const campaigns = await tx.territoryCampaign.findMany({
      where: {
        cycleId,
        status: {
          in: [
            TerritoryCampaignStatus.BUILDING,
            TerritoryCampaignStatus.SIEGE_WARNING,
          ],
        },
      },
      include: {
        armyOrder: true,
        attackerFortress: {
          select: {
            id: true,
            pressureWorkersAssigned: true,
            race: true,
            doctrine: true,
          },
        },
      },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });

    for (const campaign of campaigns) {
      const [ownership, relation] = await Promise.all([
        tx.mapHexOwnership.findUnique({
          where: {
            cycleId_tileId: {
              cycleId,
              tileId: campaign.targetTileId,
            },
          },
          select: { ownerFortressId: true },
        }),
        tx.diplomacyRelation.findUnique({
          where: {
            cycleId_fortressAId_fortressBId: {
              cycleId,
              ...getCanonicalDiplomacyPair(
                campaign.attackerFortressId,
                campaign.defenderFortressId
              ),
            },
          },
        }),
      ]);
      const warActive =
        getEffectiveDiplomacyStatus({ relation, now: tickAt }) ===
        DiplomacyRelationStatus.WAR;
      const targetStillDefended =
        ownership?.ownerFortressId === campaign.defenderFortressId;

      if (
        !warActive ||
        !targetStillDefended ||
        campaign.armyOrder.status !== ArmyOrderStatus.ACTIVE
      ) {
        if (campaign.armyOrder.status === ArmyOrderStatus.ACTIVE) {
          await tx.fortress.update({
            where: { id: campaign.attackerFortressId },
            data: { army: { increment: campaign.armyOrder.committedArmy } },
          });
          await tx.armyOrder.update({
            where: { id: campaign.armyOrderId },
            data: { status: ArmyOrderStatus.RETURNED, returnedAt: tickAt },
          });
        }
        await tx.territoryCampaign.update({
          where: { id: campaign.id },
          data: {
            status: TerritoryCampaignStatus.CANCELED,
            canceledAt: tickAt,
            cancellationReason: warActive
              ? "Target ownership changed before the siege."
              : "War is no longer active.",
          },
        });
        continue;
      }

      if (campaign.status === TerritoryCampaignStatus.BUILDING) {
        const attackerOwnedTiles = await tx.mapHexOwnership.findMany({
          where: {
            cycleId,
            ownerFortressId: campaign.attackerFortressId,
          },
          select: { tileId: true },
        });
        const doctrineTier = getDoctrineTier({
          race: campaign.attackerFortress.race,
          ownedTileBiomes: attackerOwnedTiles
            .map((ownership) => getTileById(ownership.tileId)?.biome ?? null)
            .filter((biome): biome is NonNullable<typeof biome> => biome !== null),
        });
        const progressDelta = calculateCampaignProgressPerTick({
          pressureWorkersAssigned:
            campaign.attackerFortress.pressureWorkersAssigned,
          committedArmy: campaign.armyOrder.committedArmy,
          armyContributionMultiplier: getCampaignArmyDoctrineMultiplier(
            campaign.attackerFortress.doctrine,
            doctrineTier
          ),
        });
        const progress = Math.min(
          CAMPAIGN_SIEGE_THRESHOLD,
          campaign.progress + progressDelta
        );

        if (progress < CAMPAIGN_SIEGE_THRESHOLD) {
          await tx.territoryCampaign.update({
            where: { id: campaign.id },
            data: { progress },
          });
          continue;
        }

        await tx.territoryCampaign.update({
          where: { id: campaign.id },
          data: {
            status: TerritoryCampaignStatus.SIEGE_WARNING,
            progress,
            siegeOpenedAt: tickAt,
            responseEndsAt: getCampaignResponseEndsAt(tickAt),
          },
        });
        continue;
      }

      if (!campaign.responseEndsAt || campaign.responseEndsAt > tickAt) {
        continue;
      }

      const [existingBattlefield, guardOrders, garrisons] = await Promise.all([
        tx.battlefield.findFirst({
          where: {
            cycleId,
            targetTileId: campaign.targetTileId,
            status: BattlefieldStatus.ACTIVE,
          },
          select: { id: true },
        }),
        tx.armyOrder.findMany({
          where: {
            cycleId,
            fortressId: campaign.defenderFortressId,
            type: ArmyOrderType.GUARD,
            status: ArmyOrderStatus.ACTIVE,
            targetTileId: campaign.targetTileId,
          },
        }),
        tx.fortressGarrison.findMany({
          where: {
            cycleId,
            fortressId: campaign.defenderFortressId,
            tileId: campaign.targetTileId,
            army: { gt: 0 },
          },
        }),
      ]);

      if (existingBattlefield) {
        continue;
      }

      const defenderArmy =
        guardOrders.reduce((sum, order) => sum + order.committedArmy, 0) +
        garrisons.reduce((sum, garrison) => sum + garrison.army, 0);
      const battlefield = await tx.battlefield.create({
        data: {
          cycleId,
          targetTileId: campaign.targetTileId,
          targetFortressId: campaign.defenderFortressId,
          attackerBannerFortressId: campaign.attackerFortressId,
          defenderBannerFortressId: campaign.defenderFortressId,
          attackerArmyRemaining: campaign.armyOrder.committedArmy,
          defenderArmyRemaining: defenderArmy,
          startedAt: tickAt,
          participants: {
            create: [
              {
                fortressId: campaign.attackerFortressId,
                side: BattlefieldSide.ATTACKER,
                armyCommitted: campaign.armyOrder.committedArmy,
                armyRemaining: campaign.armyOrder.committedArmy,
                maintenanceDrains: false,
                joinedAt: tickAt,
              },
              ...(defenderArmy > 0
                ? [
                    {
                      fortressId: campaign.defenderFortressId,
                      side: BattlefieldSide.DEFENDER,
                      armyCommitted: defenderArmy,
                      armyRemaining: defenderArmy,
                      maintenanceDrains: false,
                      joinedAt: tickAt,
                    },
                  ]
                : []),
            ],
          },
        },
        select: { id: true },
      });

      if (garrisons.length > 0) {
        await tx.fortressGarrison.deleteMany({
          where: { id: { in: garrisons.map((garrison) => garrison.id) } },
        });
      }
      if (guardOrders.length > 0) {
        await tx.armyOrder.updateMany({
          where: { id: { in: guardOrders.map((order) => order.id) } },
          data: { status: ArmyOrderStatus.TRANSFERRED, transferredAt: tickAt },
        });
      }
      await tx.armyOrder.update({
        where: { id: campaign.armyOrderId },
        data: { status: ArmyOrderStatus.TRANSFERRED, transferredAt: tickAt },
      });
      await tx.territoryCampaign.update({
        where: { id: campaign.id },
        data: {
          status: TerritoryCampaignStatus.ENGAGED,
          battlefieldId: battlefield.id,
          engagedAt: tickAt,
        },
      });
    }
  }, TICK_TRANSACTION_OPTIONS);
}

function getTradeCargoFromLineItems({
  lineItems,
  fromFortressId,
}: {
  lineItems: {
    fromFortressId: string;
    kind: TradeLineItemKind;
    amount: number | null;
    nukeComponentKind?: NukeComponentKind | null;
  }[];
  fromFortressId: string;
}) {
  const cargo: TradeCargo = {
    gold: 0,
    food: 0,
    army: 0,
    points: 0,
    nukeComponents: {
      [NukeComponentKind.FUEL]: 0,
      [NukeComponentKind.ROCKET]: 0,
      [NukeComponentKind.WRATH_OF_A]: 0,
    },
  };

  for (const lineItem of lineItems) {
    if (lineItem.fromFortressId !== fromFortressId || !lineItem.amount) {
      continue;
    }

    if (lineItem.kind === TradeLineItemKind.GOLD) {
      cargo.gold += lineItem.amount;
    } else if (lineItem.kind === TradeLineItemKind.FOOD) {
      cargo.food += lineItem.amount;
    } else if (lineItem.kind === TradeLineItemKind.ARMY) {
      cargo.army += lineItem.amount;
    } else if (lineItem.kind === TradeLineItemKind.POINTS) {
      cargo.points += lineItem.amount;
    } else if (
      lineItem.kind === TradeLineItemKind.NUKE_COMPONENT &&
      lineItem.nukeComponentKind
    ) {
      cargo.nukeComponents![lineItem.nukeComponentKind] += lineItem.amount;
    }
  }

  return cargo;
}

function subtractLaunchedTradeCargo({
  original,
  launched,
}: {
  original: TradeCargo;
  launched: TradeCargo;
}) {
  const originalNukes = getTradeNukeComponents(original);
  const launchedNukes = getTradeNukeComponents(launched);

  return {
    gold: Math.max(0, original.gold - launched.gold),
    food: Math.max(0, original.food - launched.food),
    army: Math.max(0, original.army - launched.army),
    points: Math.max(0, original.points - launched.points),
    nukeComponents: {
      [NukeComponentKind.FUEL]: Math.max(
        0,
        originalNukes[NukeComponentKind.FUEL] -
          launchedNukes[NukeComponentKind.FUEL]
      ),
      [NukeComponentKind.ROCKET]: Math.max(
        0,
        originalNukes[NukeComponentKind.ROCKET] -
          launchedNukes[NukeComponentKind.ROCKET]
      ),
      [NukeComponentKind.WRATH_OF_A]: Math.max(
        0,
        originalNukes[NukeComponentKind.WRATH_OF_A] -
          launchedNukes[NukeComponentKind.WRATH_OF_A]
      ),
    },
  };
}

async function getQueuedTradeWagonRuns({
  tx,
  tradeOfferId,
  fromFortressId,
  toFortressId,
}: {
  tx: Prisma.TransactionClient;
  tradeOfferId: string;
  fromFortressId: string;
  toFortressId: string;
}) {
  const [offer, launchedLegs, fromFortress] = await Promise.all([
    tx.tradeOffer.findUniqueOrThrow({
      where: { id: tradeOfferId },
      include: { lineItems: true },
    }),
    tx.convoyLeg.findMany({
      where: { tradeOfferId, fromFortressId, toFortressId },
      select: {
        gold: true,
        food: true,
        army: true,
        points: true,
        nukeFuel: true,
        nukeRocket: true,
        nukeWrathOfA: true,
        deedTileId: true,
      },
    }),
    tx.fortress.findUniqueOrThrow({
      where: { id: fromFortressId },
      select: {
        race: true,
        castleUpgradeSpecializations: true,
        skillPurchases: { select: { nodeKey: true } },
      },
    }),
  ]);
  const launchedCargo = launchedLegs.reduce<TradeCargo>(
    (total, leg) => {
      const totalNukes = getTradeNukeComponents(total);

      return {
        gold: total.gold + leg.gold,
        food: total.food + leg.food,
        army: total.army + leg.army,
        points: total.points + leg.points,
        nukeComponents: {
          [NukeComponentKind.FUEL]:
            totalNukes[NukeComponentKind.FUEL] + leg.nukeFuel,
          [NukeComponentKind.ROCKET]:
            totalNukes[NukeComponentKind.ROCKET] + leg.nukeRocket,
          [NukeComponentKind.WRATH_OF_A]:
            totalNukes[NukeComponentKind.WRATH_OF_A] + leg.nukeWrathOfA,
        },
      };
    },
    {
      gold: 0,
      food: 0,
      army: 0,
      points: 0,
      nukeComponents: {
        [NukeComponentKind.FUEL]: 0,
        [NukeComponentKind.ROCKET]: 0,
        [NukeComponentKind.WRATH_OF_A]: 0,
      },
    }
  );
  const originalCargo = getTradeCargoFromLineItems({
    lineItems: offer.lineItems,
    fromFortressId,
  });
  const remainingCargo = subtractLaunchedTradeCargo({
    original: originalCargo,
    launched: launchedCargo,
  });
  const skillModifiers =
    fromFortress.race && isFortressRace(fromFortress.race)
      ? getSkillModifiers({
          race: fromFortress.race,
          purchases: fromFortress.skillPurchases ?? [],
        })
      : null;
  const tradeLevel = countCastleSpecializations(
    fromFortress.castleUpgradeSpecializations
  )[CastleUpgradeSpecialization.TRADE];
  const chunks = splitTradeCargoIntoWagonRuns(
    remainingCargo,
    tradeLevel,
    skillModifiers?.tradeWagonCapacityPercent ?? 0
  );
  const deedLineItem = offer.lineItems.find(
    (lineItem) =>
      lineItem.kind === TradeLineItemKind.TILE &&
      lineItem.fromFortressId === fromFortressId &&
      lineItem.toFortressId === toFortressId &&
      lineItem.tileId
  );
  const deedAlreadyLaunched = launchedLegs.some((leg) => leg.deedTileId);

  if (deedLineItem?.tileId && !deedAlreadyLaunched && chunks.length === 0) {
    chunks.push({
      gold: 0,
      food: 0,
      army: 0,
      points: 0,
      nukeComponents: {
        [NukeComponentKind.FUEL]: 0,
        [NukeComponentKind.ROCKET]: 0,
        [NukeComponentKind.WRATH_OF_A]: 0,
      },
    });
  }

  return {
    chunks,
    deedTileId:
      deedLineItem?.tileId && !deedAlreadyLaunched ? deedLineItem.tileId : null,
    wagonLimit: getActiveTradeWagonLimit(
      skillModifiers?.tradeWagonSlotBonus ?? 0
    ),
  };
}

async function launchQueuedTradeWagonRuns({
  tx,
  cycleId,
  tradeOfferId,
  fromFortressId,
  toFortressId,
  departedAt,
}: {
  tx: Prisma.TransactionClient;
  cycleId: string;
  tradeOfferId: string;
  fromFortressId: string;
  toFortressId: string;
  departedAt: Date;
}) {
  const queued = await getQueuedTradeWagonRuns({
    tx,
    tradeOfferId,
    fromFortressId,
    toFortressId,
  });

  if (queued.chunks.length === 0) {
    return 0;
  }

  const activeOutboundWagons = await tx.convoyLeg.count({
    where: {
      cycleId,
      fromFortressId,
      status: ConvoyLegStatus.IN_TRANSIT,
    },
  });
  const freeWagons = Math.max(0, queued.wagonLimit - activeOutboundWagons);

  if (freeWagons <= 0) {
    return 0;
  }

  const [fromFortress, toFortress] = await Promise.all([
    tx.fortress.findUniqueOrThrow({
      where: { id: fromFortressId },
      select: { mapX: true, mapY: true },
    }),
    tx.fortress.findUniqueOrThrow({
      where: { id: toFortressId },
      select: { mapX: true, mapY: true },
    }),
  ]);
  const legs = await Promise.all(
    queued.chunks.slice(0, freeWagons).map(async (cargo, index) => ({
      cargo,
      deedTileId: index === 0 ? queued.deedTileId : null,
      arrivesAt: (
        await getRoadAdjustedConvoyArrival({
          db: tx,
          cycleId,
          acceptedAt: departedAt,
          from: fromFortress,
          to: toFortress,
        })
      ).arrivesAt,
    }))
  );

  await tx.convoyLeg.createMany({
    data: legs.map((leg) => ({
      cycleId,
      tradeOfferId,
      fromFortressId,
      toFortressId,
      status: ConvoyLegStatus.IN_TRANSIT,
      gold: leg.cargo.gold,
      food: leg.cargo.food,
      army: leg.cargo.army,
      points: leg.cargo.points,
      nukeFuel: getTradeNukeComponents(leg.cargo)[NukeComponentKind.FUEL],
      nukeRocket: getTradeNukeComponents(leg.cargo)[NukeComponentKind.ROCKET],
      nukeWrathOfA:
        getTradeNukeComponents(leg.cargo)[NukeComponentKind.WRATH_OF_A],
      baseCargoValue: calculateTradeCargoValue(leg.cargo),
      deedTileId: leg.deedTileId,
      departedAt,
      arrivesAt: leg.arrivesAt,
    })),
  });

  return legs.length;
}

async function hasQueuedTradeWagonRuns({
  tx,
  tradeOfferId,
}: {
  tx: Prisma.TransactionClient;
  tradeOfferId: string;
}) {
  const offer = await tx.tradeOffer.findUniqueOrThrow({
    where: { id: tradeOfferId },
    include: { lineItems: true },
  });
  const directions = new Set(
    offer.lineItems.map(
      (lineItem) => `${lineItem.fromFortressId}:${lineItem.toFortressId}`
    )
  );

  for (const direction of directions) {
    const [fromFortressId, toFortressId] = direction.split(":");

    if (!fromFortressId || !toFortressId) {
      continue;
    }

    const queued = await getQueuedTradeWagonRuns({
      tx,
      tradeOfferId,
      fromFortressId,
      toFortressId,
    });

    if (queued.chunks.length > 0) {
      return true;
    }
  }

  return false;
}

async function launchQueuedAcceptedTradeOfferRuns({
  tx,
  cycleId,
  tickAt,
}: {
  tx: Prisma.TransactionClient;
  cycleId: string;
  tickAt: Date;
}) {
  const acceptedOffers = await tx.tradeOffer.findMany({
    where: {
      cycleId,
      status: TradeOfferStatus.ACCEPTED,
    },
    include: { lineItems: true },
    orderBy: [
      { acceptedAt: "asc" },
      { createdAt: "asc" },
      { id: "asc" },
    ],
  });

  for (const offer of acceptedOffers) {
    const directions = new Set(
      offer.lineItems.map(
        (lineItem) => `${lineItem.fromFortressId}:${lineItem.toFortressId}`
      )
    );

    for (const direction of directions) {
      const [fromFortressId, toFortressId] = direction.split(":");

      if (!fromFortressId || !toFortressId) {
        continue;
      }

      await launchQueuedTradeWagonRuns({
        tx,
        cycleId,
        tradeOfferId: offer.id,
        fromFortressId,
        toFortressId,
        departedAt: tickAt,
      });
    }
  }
}

async function advanceTradeOfferAfterConvoySettlement({
  tx,
  cycleId,
  leg,
  tickAt,
}: {
  tx: Prisma.TransactionClient;
  cycleId: string;
  leg: {
    id: string;
    tradeOfferId: string;
    fromFortressId: string;
    toFortressId: string;
  };
  tickAt: Date;
}) {
  await launchQueuedTradeWagonRuns({
    tx,
    cycleId,
    tradeOfferId: leg.tradeOfferId,
    fromFortressId: leg.fromFortressId,
    toFortressId: leg.toFortressId,
    departedAt: tickAt,
  });

  const unsettled = await tx.convoyLeg.count({
    where: {
      tradeOfferId: leg.tradeOfferId,
      status: ConvoyLegStatus.IN_TRANSIT,
      id: { not: leg.id },
    },
  });

  if (unsettled === 0) {
    const hasQueuedRuns = await hasQueuedTradeWagonRuns({
      tx,
      tradeOfferId: leg.tradeOfferId,
    });

    if (!hasQueuedRuns) {
      await tx.tradeOffer.update({
        where: { id: leg.tradeOfferId },
        data: {
          status: TradeOfferStatus.COMPLETED,
          completedAt: tickAt,
        },
      });
    }
  }
}

async function processSeasonFourConvoys({
  db,
  cycleId,
  tickAt,
}: {
  db: PrismaClient;
  cycleId: string;
  tickAt: Date;
}) {
  return db.$transaction(async (tx) => {
    const doctrineContextByFortressId = new Map<
      string,
      { doctrine: import("@/lib/prisma-client").FortressDoctrine | null; tier: number }
    >();
    const getDoctrineContext = async (fortressId: string) => {
      const existing = doctrineContextByFortressId.get(fortressId);
      if (existing) {
        return existing;
      }

      const [fortress, ownerships] = await Promise.all([
        tx.fortress.findUniqueOrThrow({
          where: { id: fortressId },
          select: { race: true, doctrine: true },
        }),
        tx.mapHexOwnership.findMany({
          where: { cycleId, ownerFortressId: fortressId },
          select: { tileId: true },
        }),
      ]);
      const context = {
        doctrine: fortress.doctrine,
        tier: getDoctrineTier({
          race: fortress.race,
          ownedTileBiomes: ownerships
            .map((ownership) => getTileById(ownership.tileId)?.biome ?? null)
            .filter((biome): biome is NonNullable<typeof biome> => biome !== null),
        }),
      };
      doctrineContextByFortressId.set(fortressId, context);
      return context;
    };

    await tx.tradeOffer.updateMany({
      where: {
        cycleId,
        status: TradeOfferStatus.PENDING,
        expiresAt: { lte: tickAt },
      },
      data: { status: TradeOfferStatus.EXPIRED },
    });
    await launchQueuedAcceptedTradeOfferRuns({ tx, cycleId, tickAt });

    const legs = await tx.convoyLeg.findMany({
      where: {
        cycleId,
        status: ConvoyLegStatus.IN_TRANSIT,
      },
      include: {
        escortOrder: true,
        fromFortress: {
          select: {
            race: true,
            skillPurchases: { select: { nodeKey: true } },
          },
        },
      },
      orderBy: [{ arrivesAt: "asc" }, { id: "asc" }],
    });
    let scoreEventsCreated = 0;
    const deliveredConvoyLegs: Array<{ fromFortressId: string; toFortressId: string }> = [];

    // Count completed deliveries per fortress pair for trade hub bonus
    const completedDeliveries = await tx.convoyLeg.groupBy({
      by: ["fromFortressId", "toFortressId"],
      where: {
        cycleId,
        status: ConvoyLegStatus.DELIVERED,
      },
      _count: { id: true },
    });
    const establishedDeliveriesByPair = new Map<string, number>();
    for (const row of completedDeliveries) {
      const key = `${row.fromFortressId}:${row.toFortressId}`;
      establishedDeliveriesByPair.set(key, row._count.id);
    }

    for (const leg of legs) {
      const relation = await tx.diplomacyRelation.findUnique({
        where: {
          cycleId_fortressAId_fortressBId: {
            cycleId,
            ...getCanonicalDiplomacyPair(leg.fromFortressId, leg.toFortressId),
          },
        },
      });
      const effectiveStatus = getEffectiveDiplomacyStatus({
        relation,
        now: tickAt,
      });
      const senderSkillModifiers =
        leg.fromFortress.race && isFortressRace(leg.fromFortress.race)
          ? getSkillModifiers({
              race: leg.fromFortress.race,
              purchases: leg.fromFortress.skillPurchases ?? [],
            })
          : null;
      const seized =
        effectiveStatus === DiplomacyRelationStatus.ENEMY ||
        effectiveStatus === DiplomacyRelationStatus.WAR;
      let escortAlreadyReturned = false;

      const returnEscort = async () => {
        if (
          escortAlreadyReturned ||
          !leg.escortOrder ||
          leg.escortOrder.status !== ArmyOrderStatus.ACTIVE
        ) {
          return;
        }

        await tx.fortress.update({
          where: { id: leg.escortOrder.fortressId },
          data: { army: { increment: leg.escortOrder.committedArmy } },
        });
        await tx.armyOrder.update({
          where: { id: leg.escortOrder.id },
          data: { status: ArmyOrderStatus.RETURNED, returnedAt: tickAt },
        });
        escortAlreadyReturned = true;
      };

      if (!seized && isConvoyRaidEligible({ ...leg, hasDeed: Boolean(leg.deedTileId) })) {
        const potentialRaidOrders = await tx.armyOrder.findMany({
          where: {
            cycleId,
            type: ArmyOrderType.RAID,
            status: ArmyOrderStatus.ACTIVE,
            committedArmy: { gt: 0 },
            targetFortressId: {
              in: [leg.fromFortressId, leg.toFortressId],
            },
            fortressId: {
              notIn: [leg.fromFortressId, leg.toFortressId],
            },
          },
          orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        });
        let raidOrder: (typeof potentialRaidOrders)[number] | null = null;

        for (const candidate of potentialRaidOrders) {
          const pairStatuses = await Promise.all(
            [leg.fromFortressId, leg.toFortressId].map(async (fortressId) => {
              const candidateRelation = await tx.diplomacyRelation.findUnique({
                where: {
                  cycleId_fortressAId_fortressBId: {
                    cycleId,
                    ...getCanonicalDiplomacyPair(candidate.fortressId, fortressId),
                  },
                },
              });

              return getEffectiveDiplomacyStatus({
                relation: candidateRelation,
                now: tickAt,
              });
            })
          );

          if (
            pairStatuses.every(
              (status) => getRaidTargetBlockedReason(status) === null
            )
          ) {
            raidOrder = candidate;
            break;
          }
        }

        if (raidOrder) {
          const raidDoctrine = await getDoctrineContext(raidOrder.fortressId);
          const escortDoctrine = leg.escortOrder
            ? await getDoctrineContext(leg.escortOrder.fortressId)
            : null;
          const escortArmy =
            leg.escortOrder?.status === ArmyOrderStatus.ACTIVE
              ? leg.escortOrder.committedArmy
              : 0;
          const raidArmy = raidOrder.committedArmy;
          const raidPower =
            raidArmy *
            getRaidPowerDoctrineMultiplier(raidDoctrine.doctrine, raidDoctrine.tier);
          const escortPower =
            escortArmy *
            getEscortDoctrineMultiplier(
              escortDoctrine?.doctrine,
              escortDoctrine?.tier ?? 0
            );
          const raidResult = resolveSeededChance({
            seed: `${cycleId}:${leg.id}:${raidOrder.id}:${tickAt.toISOString()}:raid`,
            chancePercent: calculateRaidSuccessChance({
              raidArmy: raidPower,
              escortArmy: escortPower,
            }),
          });
          const casualties = calculateConvoyEncounterCasualties({
            raidArmy,
            escortArmy,
            raidSucceeded: raidResult.succeeded,
          });
          const survivingRaidArmy = raidArmy - casualties.raidLosses;
          const survivingEscortArmy = escortArmy - casualties.escortLosses;

          if (leg.escortOrder?.status === ArmyOrderStatus.ACTIVE) {
            if (survivingEscortArmy > 0) {
              await tx.fortress.update({
                where: { id: leg.escortOrder.fortressId },
                data: { army: { increment: survivingEscortArmy } },
              });
            }
            await tx.armyOrder.update({
              where: { id: leg.escortOrder.id },
              data: {
                committedArmy: survivingEscortArmy,
                status: ArmyOrderStatus.RETURNED,
                returnedAt: tickAt,
              },
            });
            escortAlreadyReturned = true;
          }

          await tx.armyOrder.update({
            where: { id: raidOrder.id },
            data: {
              committedArmy: survivingRaidArmy,
              ...(survivingRaidArmy === 0
                ? { status: ArmyOrderStatus.CANCELED, canceledAt: tickAt }
                : {}),
            },
          });

          let detected = false;

          for (const detectingFortressId of [
            leg.fromFortressId,
            leg.toFortressId,
          ]) {
            const detectingDoctrine = await getDoctrineContext(
              detectingFortressId
            );
            const guards = await tx.armyOrder.aggregate({
              where: {
                cycleId,
                fortressId: detectingFortressId,
                type: ArmyOrderType.GUARD,
                status: ArmyOrderStatus.ACTIVE,
              },
              _sum: { committedArmy: true },
            });
            const detectionChance = calculateDetectionChance({
              guardArmy:
                (guards._sum.committedArmy ?? 0) *
                getGuardDetectionDoctrineMultiplier(
                  detectingDoctrine.doctrine,
                  detectingDoctrine.tier
                ),
              raidArmy:
                raidArmy *
                getRaidEvasionDoctrineMultiplier(
                  raidDoctrine.doctrine,
                  raidDoctrine.tier
                ),
            });

            if (
              detectionChance === null ||
              !resolveSeededChance({
                seed: `${cycleId}:${leg.id}:${raidOrder.id}:${detectingFortressId}:${tickAt.toISOString()}:detect`,
                chancePercent: detectionChance,
              }).succeeded
            ) {
              continue;
            }

            detected = true;
            const incidentPair = getCanonicalDiplomacyPair(
              raidOrder.fortressId,
              detectingFortressId
            );
            const detectedRelation = await tx.diplomacyRelation.findUnique({
              where: {
                cycleId_fortressAId_fortressBId: {
                  cycleId,
                  ...incidentPair,
                },
              },
            });
            const detectedStatus = getEffectiveDiplomacyStatus({
              relation: detectedRelation,
              now: tickAt,
            });
            const casusBelliExpiresAt =
              detectedStatus === DiplomacyRelationStatus.WAR
                ? null
                : getCasusBelliExpiresAt(tickAt);

            if (detectedStatus !== DiplomacyRelationStatus.WAR) {
              await tx.diplomacyRelation.upsert({
                where: {
                  cycleId_fortressAId_fortressBId: {
                    cycleId,
                    ...incidentPair,
                  },
                },
                create: {
                  cycleId,
                  ...incidentPair,
                  status: DiplomacyRelationStatus.ENEMY,
                  casusBelliFortressId: detectingFortressId,
                  casusBelliExpiresAt,
                },
                update: {
                  status: DiplomacyRelationStatus.ENEMY,
                  allianceProposedById: null,
                  allianceProposedAt: null,
                  warDeclaredById: null,
                  warDeclaredAt: null,
                  warStartsAt: null,
                  peaceProposedById: null,
                  peaceProposedAt: null,
                  casusBelliFortressId: detectingFortressId,
                  casusBelliExpiresAt,
                },
              });
            }

            await tx.covertIncident.create({
              data: {
                cycleId,
                convoyLegId: leg.id,
                raidOrderId: raidOrder.id,
                raiderFortressId: raidOrder.fortressId,
                detectingFortressId,
                detectedAt: tickAt,
                casusBelliExpiresAt,
              },
            });
          }

          if (raidResult.succeeded) {
            const stolen = calculateStolenConvoyCargo({
              gold: leg.gold,
              food: leg.food,
              army: leg.army,
              points: leg.points,
              nukeComponents: {
                FUEL: leg.nukeFuel,
                ROCKET: leg.nukeRocket,
                WRATH_OF_A: leg.nukeWrathOfA,
              },
            }, getStolenCargoDoctrineMultiplier(
              raidDoctrine.doctrine,
              raidDoctrine.tier
            ));

            await tx.fortress.update({
              where: { id: raidOrder.fortressId },
              data: {
                gold: { increment: stolen.gold },
                food: { increment: stolen.food },
                army: { increment: stolen.army },
                points: { increment: stolen.points + stolen.scorePoints },
                interceptedCargoValue: { increment: stolen.baseValue },
              },
            });
            const stolenNukeComponents =
              stolen.nukeComponents ?? {
                FUEL: 0,
                ROCKET: 0,
                WRATH_OF_A: 0,
              };
            for (const [componentKind, quantity] of Object.entries(
              stolenNukeComponents
            )) {
              if (quantity <= 0) continue;
              const kind = componentKind as NukeComponentKind;
              await tx.nukeComponentInventory.upsert({
                where: {
                  cycleId_fortressId_componentKind: {
                    cycleId,
                    fortressId: raidOrder.fortressId,
                    componentKind: kind,
                  },
                },
                create: {
                  cycleId,
                  fortressId: raidOrder.fortressId,
                  componentKind: kind,
                  quantity,
                },
                update: { quantity: { increment: quantity } },
              });
            }

            if (stolen.scorePoints > 0) {
              await tx.scoreEvent.create({
                data: {
                  cycleId,
                  fortressId: raidOrder.fortressId,
                  targetFortressId: leg.fromFortressId,
                  eventType: ScoreEventType.CONVOY_INTERCEPTION,
                  delta: stolen.scorePoints,
                  createdAt: tickAt,
                },
              });
              scoreEventsCreated += 1;
            }

            await tx.convoyLeg.update({
              where: { id: leg.id },
              data: {
                status: ConvoyLegStatus.INTERCEPTED,
                interceptedByOrderId: raidOrder.id,
                encounterResolvedAt: tickAt,
                encounterSucceeded: true,
                interceptedAt: tickAt,
                stolenGold: stolen.gold,
                stolenFood: stolen.food,
                stolenArmy: stolen.army,
                stolenPoints: stolen.points,
                stolenNukeFuel: stolenNukeComponents.FUEL,
                stolenNukeRocket: stolenNukeComponents.ROCKET,
                stolenNukeWrathOfA: stolenNukeComponents.WRATH_OF_A,
                stolenCargoValue: stolen.baseValue,
                raidDetected: detected,
                deedFailureReason: leg.deedTileId
                  ? "Deed destroyed by interception."
                  : undefined,
                settledAt: tickAt,
              },
            });

            await advanceTradeOfferAfterConvoySettlement({
              tx,
              cycleId,
              leg,
              tickAt,
            });

            continue;
          }

          await tx.convoyLeg.update({
            where: { id: leg.id },
            data: {
              interceptedByOrderId: raidOrder.id,
              encounterResolvedAt: tickAt,
              encounterSucceeded: false,
              raidDetected: detected,
            },
          });
        }
      }

      if (!seized && leg.arrivesAt > tickAt) {
        continue;
      }

      await returnEscort();

      const bonus = getAllianceDeliveryBonus({
        cargo: {
          gold: leg.gold,
          food: leg.food,
          army: leg.army,
          points: leg.points,
          nukeComponents: {
            FUEL: leg.nukeFuel,
            ROCKET: leg.nukeRocket,
            WRATH_OF_A: leg.nukeWrathOfA,
          },
        },
        isAllied: effectiveStatus === DiplomacyRelationStatus.ALLIED,
        trustTier: relation?.allianceTrustTier ?? 0,
        tradeProfitPercent: senderSkillModifiers?.tradeProfitPercent ?? 0,
      });
      const pairKey = `${leg.fromFortressId}:${leg.toFortressId}`;
      const establishedCount = establishedDeliveriesByPair.get(pairKey) ?? 0;
      const points = seized
        ? { total: 0, sender: 0, receiver: 0 }
        : splitTradeDeliveryPoints(
            leg.baseCargoValue,
            establishedCount,
            senderSkillModifiers?.tradeProfitPercent ?? 0
          );

      await tx.fortress.update({
        where: { id: leg.toFortressId },
        data: {
          gold: { increment: leg.gold + (seized ? 0 : bonus.gold) },
          food: { increment: leg.food + (seized ? 0 : bonus.food) },
          army: { increment: leg.army },
          points: { increment: seized ? 0 : leg.points + points.receiver },
        },
      });
      if (!seized) {
        for (const [componentKind, quantity] of Object.entries({
          FUEL: leg.nukeFuel,
          ROCKET: leg.nukeRocket,
          WRATH_OF_A: leg.nukeWrathOfA,
        })) {
          if (quantity <= 0) continue;
          const kind = componentKind as NukeComponentKind;
          await tx.nukeComponentInventory.upsert({
            where: {
              cycleId_fortressId_componentKind: {
                cycleId,
                fortressId: leg.toFortressId,
                componentKind: kind,
              },
            },
            create: {
              cycleId,
              fortressId: leg.toFortressId,
              componentKind: kind,
              quantity,
            },
            update: { quantity: { increment: quantity } },
          });
        }
      }

      if (!seized) {
        deliveredConvoyLegs.push({
          fromFortressId: leg.fromFortressId,
          toFortressId: leg.toFortressId,
        });

        await tx.fortress.update({
          where: { id: leg.fromFortressId },
          data: {
            deliveredCargoValue: { increment: leg.baseCargoValue },
            points: { increment: points.sender },
          },
        });

        if (points.sender > 0) {
          await tx.scoreEvent.create({
            data: {
              cycleId,
              fortressId: leg.fromFortressId,
              targetFortressId: leg.toFortressId,
              eventType: ScoreEventType.TRADE_DELIVERY,
              delta: points.sender,
              createdAt: tickAt,
            },
          });
          scoreEventsCreated += 1;
        }

        if (points.receiver > 0) {
          await tx.scoreEvent.create({
            data: {
              cycleId,
              fortressId: leg.toFortressId,
              targetFortressId: leg.fromFortressId,
              eventType: ScoreEventType.TRADE_DELIVERY,
              delta: points.receiver,
              createdAt: tickAt,
            },
          });
          scoreEventsCreated += 1;
        }
      }

      if (!seized && leg.deedTileId) {
        const [deedTile, activeBattles, activeCampaigns, objectives, fromFort, toFort] = await Promise.all([
          tx.mapHexOwnership.findUnique({
            where: { cycleId_tileId: { cycleId, tileId: leg.deedTileId } },
          }),
          tx.battlefield.findMany({
            where: { cycleId, targetTileId: leg.deedTileId, status: BattlefieldStatus.ACTIVE },
            select: { id: true },
          }),
          tx.territoryCampaign.findMany({
            where: { cycleId, targetTileId: leg.deedTileId, status: { in: ['BUILDING', 'SIEGE_WARNING', 'ENGAGED'] } },
            select: { id: true },
          }),
          Promise.resolve(null),
          tx.fortress.findUnique({ where: { id: leg.fromFortressId }, select: { mapX: true, mapY: true } }),
          tx.fortress.findUnique({ where: { id: leg.toFortressId }, select: { mapX: true, mapY: true } }),
        ]);

        const hasActiveBattle = activeBattles.length > 0;
        const hasActiveCampaign = activeCampaigns.length > 0;
        const isObjective = false;
        const deedStillValid =
          deedTile &&
          deedTile.ownerFortressId === leg.fromFortressId &&
          effectiveStatus === DiplomacyRelationStatus.ALLIED &&
          !hasActiveBattle &&
          !hasActiveCampaign &&
          !isObjective;

        if (deedStillValid) {
          await tx.mapHexOwnership.update({
            where: { cycleId_tileId: { cycleId, tileId: leg.deedTileId } },
            data: { ownerFortressId: leg.toFortressId },
          });

          await tx.tilePressurePriority.deleteMany({
            where: { cycleId, tileId: leg.deedTileId },
          });
          await tx.tilePressureState.deleteMany({
            where: { cycleId, tileId: leg.deedTileId },
          });
        } else {
          await tx.convoyLeg.update({
            where: { id: leg.id },
            data: {
              deedFailureReason: deedTile
                ? "Deed invalid at delivery: " + [
                    effectiveStatus !== DiplomacyRelationStatus.ALLIED && "alliance broken",
                    deedTile.ownerFortressId !== leg.fromFortressId && "tile no longer owned",
                    hasActiveBattle && "tile in active battle",
                    hasActiveCampaign && "tile in active campaign",
                    isObjective && "tile is an active objective",
                  ].filter(Boolean).join(", ")
                : "Deed invalid at delivery: tile no longer exists in the cycle.",
            },
          });
        }
      }

      await tx.convoyLeg.update({
        where: { id: leg.id },
        data: {
          status: seized ? ConvoyLegStatus.SEIZED : ConvoyLegStatus.DELIVERED,
          bonusGold: seized ? 0 : bonus.gold,
          bonusFood: seized ? 0 : bonus.food,
          pointsAwarded: points.total,
          deedSettledAt: !seized && leg.deedTileId ? tickAt : undefined,
          deedFailureReason: seized && leg.deedTileId
            ? "Deed cancelled: parties became hostile."
            : undefined,
          settledAt: tickAt,
        },
      });

      await advanceTradeOfferAfterConvoySettlement({
        tx,
        cycleId,
        leg,
        tickAt,
      });
    }

    await launchQueuedAcceptedTradeOfferRuns({ tx, cycleId, tickAt });

    return { scoreEventsCreated, deliveredConvoyLegs };
  }, TICK_TRANSACTION_OPTIONS);
}

async function finalizeSeasonFourCampaigns({
  db,
  cycleId,
  tickAt,
}: {
  db: PrismaClient;
  cycleId: string;
  tickAt: Date;
}) {
  await db.territoryCampaign.updateMany({
    where: {
      cycleId,
      status: TerritoryCampaignStatus.ENGAGED,
      battlefield: { status: BattlefieldStatus.RESOLVED },
    },
    data: {
      status: TerritoryCampaignStatus.RESOLVED,
      resolvedAt: tickAt,
    },
  });
}

async function retireDisabledGuardAndRaidOrders({
  db,
  cycleId,
  tickAt,
}: {
  db: PrismaClient;
  cycleId: string;
  tickAt: Date;
}) {
  const disabledOrders = await db.armyOrder.findMany({
    where: {
      cycleId,
      status: ArmyOrderStatus.ACTIVE,
      type: { in: [ArmyOrderType.GUARD, ArmyOrderType.RAID] },
    },
    select: {
      id: true,
      fortressId: true,
      committedArmy: true,
    },
  });

  if (disabledOrders.length === 0) {
    return;
  }

  const armyByFortress = new Map<string, number>();
  for (const order of disabledOrders) {
    armyByFortress.set(
      order.fortressId,
      (armyByFortress.get(order.fortressId) ?? 0) + order.committedArmy
    );
  }

  await db.$transaction(async (tx) => {
    await Promise.all(
      Array.from(armyByFortress.entries()).map(([fortressId, army]) =>
        tx.fortress.update({
          where: { id: fortressId },
          data: { army: { increment: army } },
        })
      )
    );

    await tx.armyOrder.updateMany({
      where: {
        id: { in: disabledOrders.map((order) => order.id) },
        status: ArmyOrderStatus.ACTIVE,
      },
      data: {
        status: ArmyOrderStatus.RETURNED,
        returnedAt: tickAt,
      },
    });
  });
}

function isUniqueTickError(error: unknown) {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  );
}

function getFirstTickAt(activeStartedAt: Date) {
  return addMinutes(floorToMinute(activeStartedAt), 1);
}

export function classifyTickHealth(minutesBehind: number): TickHealth {
  if (minutesBehind >= 3) {
    return "stalled";
  }

  if (minutesBehind >= 2) {
    return "lagging";
  }

  return "ok";
}

type TickRunnerStage =
  | "schema-preflight"
  | "restart-registration"
  | "start-testing-cycle"
  | "complete-testing-cycle"
  | "load-last-processed-tick"
  | "process-minute"
  | "resolve-active-cycle";

export class TickRunnerError extends Error {
  readonly stage: TickRunnerStage;
  readonly cycleId?: string;
  readonly tickAt?: Date;
  readonly now: Date;

  constructor({
    stage,
    cycleId,
    tickAt,
    now,
    cause,
  }: {
    stage: TickRunnerStage;
    cycleId?: string;
    tickAt?: Date;
    now: Date;
    cause: unknown;
  }) {
    const parts = [`Tick runner failed during ${stage}.`];

    if (cycleId) {
      parts.push(`cycle=${cycleId}`);
    }

    if (tickAt) {
      parts.push(`tickAt=${tickAt.toISOString()}`);
    }

    parts.push(`now=${now.toISOString()}`);

    super(parts.join(" "));
    this.name = "TickRunnerError";
    this.stage = stage;
    this.cycleId = cycleId;
    this.tickAt = tickAt;
    this.now = now;

    if (cause !== undefined) {
      Object.defineProperty(this, "cause", {
        value: cause,
        enumerable: false,
        configurable: true,
      });
    }
  }
}

export function getActiveCycleMinutesBehind({
  activeStartedAt,
  lastProcessedTickAt,
  now,
}: {
  activeStartedAt: Date | null;
  lastProcessedTickAt: Date | null;
  now: Date;
}) {
  if (!activeStartedAt) {
    return 0;
  }

  const firstDueTickAt = getFirstTickAt(activeStartedAt);
  const dueTickAt = floorToMinute(now);

  if (dueTickAt < firstDueTickAt) {
    return 0;
  }

  const latestProcessedTickAt =
    lastProcessedTickAt ?? addMinutes(firstDueTickAt, -1);

  if (latestProcessedTickAt >= dueTickAt) {
    return 0;
  }

  const diffMilliseconds =
    dueTickAt.getTime() - latestProcessedTickAt.getTime();
  return Math.floor(diffMilliseconds / (60 * 1000));
}

function getLastDueTickAt(
  cycle: {
    status?: CycleStatus;
    testingEndsAt?: Date | null;
    activeStartedAt: Date | null;
    activeEndsAt: Date | null;
  },
  now: Date
) {
  if (!cycle.activeStartedAt) {
    return null;
  }

  const nowTick = floorToMinute(now);
  const effectiveEndsAt =
    cycle.status === CycleStatus.TESTING
      ? cycle.testingEndsAt
      : cycle.activeEndsAt;
  const activeEndTick = effectiveEndsAt
    ? floorToMinute(effectiveEndsAt)
    : nowTick;
  const lastDueTickAt = nowTick < activeEndTick ? nowTick : activeEndTick;

  if (lastDueTickAt < getFirstTickAt(cycle.activeStartedAt)) {
    return null;
  }

  return lastDueTickAt;
}

function hasHomeOfABossBuff(
  activations: Array<{
    kind: RaceAbilityKind;
    activeFrom: Date;
    activeUntil: Date;
  }>,
  tickAt: Date
) {
  return isRaceAbilityActive(
    activations,
    RaceAbilityKind.HOME_OF_A_BOSS_BUFF,
    tickAt
  );
}

async function restartEmptyRegistrationCycle(
  cycleId: string,
  now: Date,
  db: PrismaClient
) {
  return db.$transaction(async (tx) => {
    const cycle = await tx.cycle.findUnique({
      where: {
        id: cycleId,
      },
      include: {
        _count: {
          select: {
            fortresses: true,
          },
        },
      },
    });

    if (
      !cycle ||
      cycle.status !== CycleStatus.REGISTRATION ||
      !cycle.testingStartedAt ||
      !cycle.testingEndsAt ||
      cycle.testingStartedAt > now
    ) {
      return false;
    }

    if (cycle._count.fortresses > 0) {
      return false;
    }

    const registrationStartedAt = floorToMinute(now);
    const schedule = getNextCycleSchedule(registrationStartedAt);

    await tx.cycle.update({
      where: {
        id: cycle.id,
      },
      data: {
        status: CycleStatus.REGISTRATION,
        registrationStartedAt,
        registrationEndsAt: schedule.registrationEndsAt,
        testingStartedAt: schedule.testingStartedAt,
        testingEndsAt: schedule.testingEndsAt,
        activeStartedAt: null,
        activeEndsAt: schedule.activeEndsAt,
      },
    });

    return true;
  }, TICK_TRANSACTION_OPTIONS);
}

async function startTestingCycle(cycleId: string, now: Date, db: PrismaClient) {
  return db.$transaction(async (tx) => {
    const cycle = await tx.cycle.findUnique({
      where: {
        id: cycleId,
      },
      include: {
        _count: {
          select: {
            fortresses: true,
          },
        },
      },
    });

    if (
      !cycle ||
      cycle.status !== CycleStatus.REGISTRATION ||
      !cycle.testingStartedAt ||
      !cycle.testingEndsAt ||
      cycle.testingStartedAt > now
    ) {
      return false;
    }

    if (cycle._count.fortresses === 0) {
      return false;
    }

    const testingStartedAt = cycle.testingStartedAt!;
    const testingEndsAt = cycle.testingEndsAt!;
    const activeStartedAt = cycle.registrationEndsAt;

    await tx.cycle.update({
      where: {
        id: cycle.id,
      },
      data: {
        status: CycleStatus.TESTING,
        testingStartedAt,
        testingEndsAt,
        activeStartedAt,
        activeEndsAt: addHours(activeStartedAt, ACTIVE_DURATION_HOURS),
        joiningLockedAt: null,
      },
    });

    await tx.fortress.updateMany({
      where: {
        cycleId: cycle.id,
        isNpc: false,
      },
      data: {
        currentAction: FortressAction.GROW,
        targetFortressId: null,
      },
    });

    if (!isSeasonFourRuleset(cycle.ruleset)) {
      await ensureMegaFortress({
        db: tx,
        cycleId: cycle.id,
        seed: buildFortressSpawnSeed({
          cycleId: cycle.id,
          activeStartedAt: testingStartedAt,
          tickAt: testingStartedAt,
          purpose: "testing:mega-fortress",
          entropy: cycle.registrationEndsAt.toISOString(),
        }),
      });
    }

    return true;
  }, TICK_TRANSACTION_OPTIONS);
}

async function completeTestingCycle(
  cycleId: string,
  now: Date,
  db: PrismaClient
) {
  return db.$transaction(async (tx) => {
    const cycle = await tx.cycle.findUnique({
      where: {
        id: cycleId,
      },
      include: {
        _count: {
          select: {
            fortresses: true,
          },
        },
      },
    });

    if (
      !cycle ||
      cycle.status !== CycleStatus.TESTING ||
      !cycle.testingEndsAt ||
      !cycle.activeStartedAt ||
      cycle.testingEndsAt > now ||
      cycle.activeStartedAt > now
    ) {
      return false;
    }

    if (
      isSeasonFourRuleset(cycle.ruleset) &&
      !isSeasonFourActivationEnabled()
    ) {
      const delayedUntil = addHours(
        floorToMinute(now),
        SEASON_4_DELAY_EXTENSION_HOURS
      );

      await tx.cycle.update({
        where: {
          id: cycle.id,
        },
        data: {
          registrationEndsAt: delayedUntil,
          testingEndsAt: delayedUntil,
          activeStartedAt: delayedUntil,
          activeEndsAt: addHours(delayedUntil, ACTIVE_DURATION_HOURS),
        },
      });

      return false;
    }

    const activeStartedAt = cycle.activeStartedAt;
    const activeEndsAt = addHours(activeStartedAt, ACTIVE_DURATION_HOURS);

    await tx.attackUnit.deleteMany({
      where: {
        cycleId,
      },
    });
    await tx.battlefield.deleteMany({
      where: {
        cycleId,
      },
    });
    await tx.homeOfAHolder.deleteMany({
      where: {
        cycleId,
      },
    });
    await tx.tilePressurePriority.deleteMany({
      where: {
        cycleId,
      },
    });
    await tx.tilePressureState.deleteMany({
      where: {
        cycleId,
      },
    });
    await tx.mapHexOwnership.deleteMany({
      where: {
        cycleId,
      },
    });
    await tx.castleUpgradeSpecializationChoice.deleteMany({
      where: {
        fortress: {
          cycleId,
        },
      },
    });
    await tx.castleUpgradeProject.deleteMany({
      where: {
        cycleId,
      },
    });
    await tx.raceAbilityActivation.deleteMany({
      where: {
        fortress: {
          cycleId,
        },
      },
    });
    await tx.orkScrapEvent.deleteMany({
      where: {
        cycleId,
      },
    });
    await tx.orkWaaaghInvestment.deleteMany({
      where: {
        cycleId,
      },
    });
    await tx.orkBossOrder.deleteMany({
      where: {
        cycleId,
      },
    });
    await tx.orkScrapBank.deleteMany({
      where: {
        cycleId,
      },
    });
    await tx.unicornTemporaryTeleport.deleteMany({
      where: {
        cycleId,
      },
    });
    await tx.dwarfGrudge.deleteMany({
      where: {
        fortress: {
          cycleId,
        },
      },
    });
    await tx.scoreEvent.deleteMany({
      where: {
        cycleId,
      },
    });
    await tx.gameTick.deleteMany({
      where: {
        cycleId,
      },
    });
    await tx.fortress.deleteMany({
      where: {
        cycleId,
        isNpc: true,
      },
    });
    await tx.fortress.updateMany({
      where: {
        cycleId,
        isNpc: false,
      },
      data: {
        points: 0,
        gold: 0,
        unitsKilled: 0,
        goblinsKilled: 0,
        resourcesStolen: 0,
        level: 0,
        food: 0,
        army: 0,
        minersAssigned: 10,
        farmersAssigned: 10,
        recruitersAssigned: 5,
        pressureWorkersAssigned: 0,
        fortressKind: FortressKind.PLAYER,
        currentAction: FortressAction.GROW,
        targetFortressId: null,
        health: 0,
        maxHealth: 0,
        sizeTiles: 1,
        iconLabel: null,
        unicornDecoySourceFortressId: null,
        unicornDecoyLevel: null,
        locationShuffleCount: 0,
      },
    });
    await tx.cycle.update({
      where: {
        id: cycleId,
      },
      data: {
        status: CycleStatus.ACTIVE,
        activeStartedAt,
        activeEndsAt,
        joiningLockedAt: null,
        winnerId: null,
        crownedFortressId: null,
        upgradesUnlockedAt: null,
        homeOfABossRespawnsAt: null,
        megaFortressDestroyCount: 0,
      },
    });
    if (!isSeasonFourRuleset(cycle.ruleset)) {
      await ensureMegaFortress({
        db: tx,
        cycleId,
        seed: buildFortressSpawnSeed({
          cycleId,
          activeStartedAt,
          tickAt: activeStartedAt,
          purpose: "activate:mega-fortress",
          entropy: cycle.testingEndsAt.toISOString(),
        }),
      });
    }

    return true;
  }, TICK_TRANSACTION_OPTIONS);
}

function compareTieBreakCandidates(
  left: TieBreakCandidate,
  right: TieBreakCandidate
) {
  if (left.finalScore !== right.finalScore) {
    return right.finalScore - left.finalScore;
  }

  const reachDelta =
    left.reachedFinalScoreAt.getTime() - right.reachedFinalScoreAt.getTime();

  if (reachDelta !== 0) {
    return reachDelta;
  }

  const joinedDelta = left.joinedAt.getTime() - right.joinedAt.getTime();

  if (joinedDelta !== 0) {
    return joinedDelta;
  }

  return left.fortressId.localeCompare(right.fortressId);
}

function formatTieBreakSummary(
  winner: TieBreakCandidate,
  tiedCandidates: TieBreakCandidate[]
) {
  if (tiedCandidates.length <= 1) {
    return `No tie-break needed. ${winner.fortressName} won outright with ${winner.finalScore} points.`;
  }

  const summary = tiedCandidates
    .map((candidate) => {
      return `${candidate.fortressName} reached ${candidate.finalScore} at ${candidate.reachedFinalScoreAt.toISOString()}`;
    })
    .join("; ");

  return `Tie on ${winner.finalScore} points resolved by earliest reach time. ${summary}. Winner: ${winner.fortressName}.`;
}

function formatSeasonWinnerAnnouncement({
  winner,
  tiedCandidates,
  communityWishVotingEndsAt,
}: {
  winner: TieBreakCandidate;
  tiedCandidates: TieBreakCandidate[];
  communityWishVotingEndsAt: Date | null;
}) {
  const tieNote =
    tiedCandidates.length > 1
      ? " Tie-break went to the earliest fortress to reach the final score."
      : "";
  if (!communityWishVotingEndsAt) {
    return `Season ended. ${winner.commanderName} of ${winner.fortressName} wins with ${winner.finalScore} points.${tieNote} Registration for the next season is opening.`;
  }

  const votingDeadline = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Helsinki",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(communityWishVotingEndsAt);

  return `Season ended. ${winner.commanderName} of ${winner.fortressName} wins with ${winner.finalScore} points.${tieNote} Community wish voting is open until ${votingDeadline}.`;
}

async function resolveExpiredActiveCycle(
  cycleId: string,
  now: Date,
  db: PrismaClient
) {
  return db.$transaction(async (tx) => {
    const cycle = await tx.cycle.findUnique({
      where: {
        id: cycleId,
      },
      include: {
        fortresses: {
          where: {
            isNpc: false,
          },
          orderBy: [{ joinedAt: "asc" }, { id: "asc" }],
          select: {
            id: true,
            ownerId: true,
            commanderName: true,
            name: true,
            points: true,
            joinedAt: true,
          },
        },
        winnerRequests: {
          orderBy: {
            createdAt: "asc",
          },
          select: {
            id: true,
            authorId: true,
            requestText: true,
            status: true,
          },
        },
        history: {
          select: {
            id: true,
          },
        },
      },
    });

    if (
      !cycle ||
      cycle.status !== CycleStatus.ACTIVE ||
      !cycle.activeStartedAt ||
      !cycle.activeEndsAt ||
      cycle.activeEndsAt > now ||
      cycle.history
    ) {
      return { resolved: false, createdNextCycle: false };
    }

    const resolutionEndedAt = cycle.activeEndsAt;

    if (cycle.fortresses.length === 0) {
      await tx.cycle.update({
        where: {
          id: cycle.id,
        },
        data: {
          status: CycleStatus.RESOLUTION,
          resolvedAt: resolutionEndedAt,
          joiningLockedAt: null,
        },
      });

      await ensureOpenRegistrationCycle(tx, resolutionEndedAt);

      return { resolved: true, createdNextCycle: true };
    }

    const scoreEvents = await tx.scoreEvent.findMany({
      where: {
        cycleId: cycle.id,
      },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: {
        fortressId: true,
        delta: true,
        createdAt: true,
      },
    });

    const finalScores = new Map(
      cycle.fortresses.map((fortress) => [fortress.id, fortress.points])
    );
    const currentScores = new Map(
      cycle.fortresses.map((fortress) => [fortress.id, 0])
    );
    const reachedFinalScoreAt = new Map<string, Date>();

    for (const fortress of cycle.fortresses) {
      if (fortress.points === 0) {
        reachedFinalScoreAt.set(fortress.id, cycle.activeStartedAt);
      }
    }

    let eventIndex = 0;

    while (eventIndex < scoreEvents.length) {
      const tickAt = scoreEvents[eventIndex]?.createdAt;

      if (!tickAt) {
        break;
      }

      const deltas = new Map<string, number>();

      while (
        eventIndex < scoreEvents.length &&
        scoreEvents[eventIndex]?.createdAt.getTime() === tickAt.getTime()
      ) {
        const event = scoreEvents[eventIndex];

        if (event) {
          deltas.set(
            event.fortressId,
            (deltas.get(event.fortressId) ?? 0) + event.delta
          );
        }

        eventIndex += 1;
      }

      for (const [fortressId, delta] of deltas) {
        currentScores.set(
          fortressId,
          (currentScores.get(fortressId) ?? 0) + delta
        );
      }

      for (const fortress of cycle.fortresses) {
        if (reachedFinalScoreAt.has(fortress.id)) {
          continue;
        }

        if (
          (currentScores.get(fortress.id) ?? 0) ===
          (finalScores.get(fortress.id) ?? 0)
        ) {
          reachedFinalScoreAt.set(fortress.id, tickAt);
        }
      }
    }

    const rankedFortresses = cycle.fortresses
      .map((fortress) => ({
        fortressId: fortress.id,
        ownerId: fortress.ownerId,
        commanderName: fortress.commanderName,
        fortressName: fortress.name,
        finalScore: fortress.points,
        reachedFinalScoreAt:
          reachedFinalScoreAt.get(fortress.id) ?? resolutionEndedAt,
        joinedAt: fortress.joinedAt,
      }))
      .sort(compareTieBreakCandidates);

    const winner = rankedFortresses[0];

    if (!winner) {
      return { resolved: false, createdNextCycle: false };
    }

    const tiedCandidates = rankedFortresses.filter(
      (candidate) => candidate.finalScore === winner.finalScore
    );
    const winnerRequest =
      cycle.winnerRequests.find(
        (request) => request.authorId === winner.ownerId
      ) ?? null;
    const firstSlayerFortress =
      cycle.fortresses.find(
        (fortress) => fortress.id === cycle.crownedFortressId
      ) ?? null;

    await tx.cycle.update({
      where: {
        id: cycle.id,
      },
      data: {
        status: CycleStatus.RESOLUTION,
        winnerId: winner.ownerId,
        resolvedAt: resolutionEndedAt,
        joiningLockedAt: null,
      },
    });

    const keepsCommunityWishVoting = !isSeasonFourRuleset(cycle.ruleset);
    const communityWishProposalEndsAt = keepsCommunityWishVoting
      ? getCommunityWishProposalEndsAt(resolutionEndedAt)
      : null;
    const communityWishVotingEndsAt = communityWishProposalEndsAt
      ? getCommunityWishVotingEndsAt(communityWishProposalEndsAt)
      : null;

    await tx.cycleHistory.create({
      data: {
        cycleId: cycle.id,
        winnerId: winner.ownerId,
        winnerRequestId: winnerRequest?.id ?? null,
        winningScore: winner.finalScore,
        endedAt: resolutionEndedAt,
        firstSlayerCommanderName: firstSlayerFortress?.commanderName ?? null,
        firstSlayerFortressName: firstSlayerFortress?.name ?? null,
        tieBreakSummary: formatTieBreakSummary(winner, tiedCandidates),
        winnerRequestSnapshot: winnerRequest
          ? `[${winnerRequest.status}] ${winnerRequest.requestText}`
          : null,
        communityWishProposalEndsAt,
        communityWishVotingEndsAt,
        communityWishStatus: keepsCommunityWishVoting ? "OPEN" : "NO_PROPOSALS",
      },
    });

    const systemUser = await ensureNpcSystemUser(tx);
    await tx.chatMessage.create({
      data: {
        cycleId: cycle.id,
        authorId: systemUser.id,
        type: ChatMessageType.TEXT,
        body: formatSeasonWinnerAnnouncement({
          winner,
          tiedCandidates,
          communityWishVotingEndsAt,
        }),
        createdAt: resolutionEndedAt,
      },
    });

    if (keepsCommunityWishVoting) {
      await createCommunityWishVoteEntitlements({
        cycleId: cycle.id,
        rankedFortresses,
        db: tx,
      });
    }

    await mintSeasonArcadeCoins({
      cycleId: cycle.id,
      now: resolutionEndedAt,
      db: tx,
      rankedFortresses,
    });

    await ensureOpenRegistrationCycle(tx, resolutionEndedAt);

    return { resolved: true, createdNextCycle: true };
  }, TICK_TRANSACTION_OPTIONS);
}

async function processCycleTick(
  cycleId: string,
  tickAt: Date,
  now: Date,
  db: PrismaClient
) {
  const cycle = await db.cycle.findUnique({
    where: {
      id: cycleId,
    },
    select: {
      id: true,
      status: true,
      ruleset: true,
      testingStartedAt: true,
      testingEndsAt: true,
      activeStartedAt: true,
      activeEndsAt: true,
      upgradesUnlockedAt: true,
      crownedFortressId: true,
      homeOfABossRespawnsAt: true,
      megaFortressDestroyCount: true,
    },
  });

  if (
    !cycle ||
    (cycle.status !== CycleStatus.ACTIVE &&
      cycle.status !== CycleStatus.TESTING) ||
    !(cycle.status === CycleStatus.TESTING
      ? cycle.testingStartedAt
      : cycle.activeStartedAt)
  ) {
    return {
      processed: false,
      scoreEventsCreated: 0,
      launchedAttackUnits: 0,
      resolvedAttackUnits: 0,
    };
  }

  const gameplayStartedAt =
    cycle.status === CycleStatus.TESTING
      ? cycle.testingStartedAt!
      : cycle.activeStartedAt!;
  const isSeasonFour = isSeasonFourRuleset(cycle.ruleset);

  if (!isSeasonFour) {
    await ensureActiveCycleMegaFortress({
      db: db,
      cycleId,
    });
  }

  if (
    !isSeasonFour &&
    cycle.homeOfABossRespawnsAt &&
    cycle.homeOfABossRespawnsAt <= tickAt
  ) {
    const respawnHealth = getHomeOfABossHealth(cycle.megaFortressDestroyCount);

    await db.fortress.updateMany({
      where: {
        cycleId,
        fortressKind: FortressKind.MEGA,
        isNpc: true,
      },
      data: {
        health: respawnHealth,
        maxHealth: respawnHealth,
      },
    });
    await db.cycle.update({
      where: {
        id: cycleId,
      },
      data: {
        homeOfABossRespawnsAt: null,
      },
    });
  }

  const firstTickAt = getFirstTickAt(gameplayStartedAt);
  const lastDueTickAt = getLastDueTickAt(
    {
      ...cycle,
      activeStartedAt: gameplayStartedAt,
    },
    now
  );

  if (!lastDueTickAt || tickAt < firstTickAt || tickAt > lastDueTickAt) {
    return {
      processed: false,
      scoreEventsCreated: 0,
      launchedAttackUnits: 0,
      resolvedAttackUnits: 0,
    };
  }

  try {
    await db.$transaction(async (gateTx) => {
      await gateTx.gameTick.create({
        data: {
          cycleId,
          tickAt,
        },
      });
    }, TICK_TRANSACTION_OPTIONS);
  } catch (error) {
    if (isUniqueTickError(error)) {
      return {
        processed: false,
        scoreEventsCreated: 0,
        launchedAttackUnits: 0,
        resolvedAttackUnits: 0,
      };
    }

    throw error;
  }

  await ensureCurrentMapLayout({
    db: db,
    cycleId,
    seed: buildFortressSpawnSeed({
      cycleId,
      activeStartedAt: gameplayStartedAt,
      tickAt,
      purpose: "tick:layout-v3",
    }),
  });

  if (!isSeasonFour) {
    await processDueUnicornTeleportReturns({
      db,
      cycleId,
      tickAt,
    });
  }

  await processDueCastleUpgradeProjects({
    db,
    cycleId,
    tickAt,
  });

  await processTilePressureExpansion({
    db,
    cycleId,
    tickAt,
    isSeasonFour,
  });

  await retireDisabledGuardAndRaidOrders({
    db,
    cycleId,
    tickAt,
  });

  let convoyScoreEventsCreated = 0;
  let deliveredConvoyLegs: Array<{ fromFortressId: string; toFortressId: string }> = [];

  // Auto-war dispatch (always runs for debugging; requires WarPolicy + battalions)
  if (true) {
    // Auto-war dispatch runs BEFORE campaign processing so new campaigns
    // are picked up in the same tick.
    const [
      warRelations,
      currentCampaigns,
      lightFortresses,
      ownerships,
      pressurePriorities,
    ] = await Promise.all([
      db.diplomacyRelation.findMany({
        where: { cycleId, status: { in: ["WAR", "WAR_PENDING"] } },
        select: { status: true, fortressAId: true, fortressBId: true, warStartsAt: true },
      }),
      db.territoryCampaign.findMany({
        where: {
          cycleId,
          status: { in: ["BUILDING", "SIEGE_WARNING", "ENGAGED"] },
        },
        select: {
          id: true,
          attackerFortressId: true,
          defenderFortressId: true,
          targetTileId: true,
          armyOrder: { select: { committedArmy: true, status: true } },
        },
      }),
      db.fortress.findMany({
        where: { cycleId, isNpc: false },
        select: {
          id: true,
          level: true,
          army: true,
          mapX: true,
          mapY: true,
          ownerId: true,
          pressureWorkersAssigned: true,
          race: true,
          skillPurchases: { select: { nodeKey: true } },
        },
      }),
      db.mapHexOwnership.findMany({
        where: { cycleId },
        select: { ownerFortressId: true, tileId: true },
      }),
      db.tilePressurePriority.findMany({
        where: { cycleId },
        select: { fortressId: true, tileId: true, weight: true },
      }),
    ]);

    const activeWars = warRelations.filter(
      (r) => r.status === "WAR" || (r.status === "WAR_PENDING" && r.warStartsAt && r.warStartsAt <= tickAt),
    );

    await processAutoWarDispatch({
      db,
      cycleId,
      now: tickAt,
      fortresses: lightFortresses.map((f) => ({
        id: f.id,
        level: f.level,
        army: f.army,
        mapX: f.mapX,
        mapY: f.mapY,
        ownerId: f.ownerId ?? "",
      })),
      diplomacyRelations: activeWars.map((r) => ({
        status: "WAR" as const,
        fortressAId: r.fortressAId,
        fortressBId: r.fortressBId,
      })),
      ownedTiles: ownerships.map((o) => ({
        tileId: o.tileId,
        ownerFortressId: o.ownerFortressId,
      })),
      activeCampaigns: currentCampaigns.map((c) => ({
        id: c.id,
        attackerFortressId: c.attackerFortressId,
        defenderFortressId: c.defenderFortressId,
        targetTileId: c.targetTileId,
        armyOrder: c.armyOrder
          ? { committedArmy: c.armyOrder.committedArmy, status: c.armyOrder.status }
          : null,
      })),
      priorityTiles: pressurePriorities.map((priority) => {
        const targetOwner = ownerships.find(
          (ownership) => ownership.tileId === priority.tileId,
        )?.ownerFortressId;
        return {
          fortressId: priority.fortressId,
          tileId: priority.tileId,
          priority: Math.max(1, Math.min(3, priority.weight)) as 1 | 2 | 3,
          targetEnemyId: targetOwner ?? null,
        };
      }),
    });

    // Ownership pressure processing (after auto-war, before campaigns).
    const { processAllOwnershipPressure } = await import("./tile-pressure");
    const allOwnerships = await db.mapHexOwnership.findMany({
      where: { cycleId },
      select: { tileId: true, ownerFortressId: true, ownershipPressure: true },
    });
    const guardTiles = new Set(
      (await db.fortressGarrison.findMany({
        where: { cycleId, army: { gt: 0 } },
        select: { tileId: true },
      })).map((g) => g.tileId),
    );
    const enemyPressures = await db.tilePressureState.findMany({
      where: { cycleId },
      select: { tileId: true, fortressId: true, pressure: true },
    });
    const pressureWorkersByFortress = new Map<string, number>();
    const lightFortressById = new Map(
      lightFortresses.map((fortress) => [fortress.id, fortress])
    );
    const ownershipByTileId = new Map(
      allOwnerships.map((ownership) => [ownership.tileId, ownership])
    );
    const enemyPressureByTile = new Map<string, number>();
    for (const ep of enemyPressures) {
      const ownership = ownershipByTileId.get(ep.tileId);

      if (!ownership || ep.fortressId === ownership.ownerFortressId) {
        continue;
      }

      const attackerFortress = lightFortressById.get(ep.fortressId);
      const ownerFortress = lightFortressById.get(ownership.ownerFortressId);

      if (!attackerFortress || !ownerFortress) {
        continue;
      }

      const effectivePressure = getEffectiveEnemyPressureOnOwnedTile({
        isSeasonFour,
        tileId: ep.tileId,
        pressure: ep.pressure,
        attackerFortress,
        ownerFortress,
      });
      const existing = enemyPressureByTile.get(ep.tileId) ?? 0;
      enemyPressureByTile.set(ep.tileId, existing + effectivePressure);
    }
    for (const f of lightFortresses) {
      pressureWorkersByFortress.set(f.id, f.pressureWorkersAssigned ?? 0);
    }
    const ownedTileCount = new Map<string, number>();
    for (const o of allOwnerships) {
      const count = ownedTileCount.get(o.ownerFortressId) ?? 0;
      ownedTileCount.set(o.ownerFortressId, count + 1);
    }
    const inputs = allOwnerships.map((o) => {
      const totalWorkers = pressureWorkersByFortress.get(o.ownerFortressId) ?? 0;
      const ownerFortress = lightFortressById.get(o.ownerFortressId);
      const tileCount = ownedTileCount.get(o.ownerFortressId) ?? 1;
      const workersPerTile = calculateOwnershipMaintenanceWorkers({
        pressureWorkersAssigned: totalWorkers,
        ownedTileCount: tileCount,
        race: ownerFortress?.race,
        skillPurchases: ownerFortress?.skillPurchases,
      });
      return {
        tileId: o.tileId,
        ownerFortressId: o.ownerFortressId,
        currentPressure: o.ownershipPressure,
        maintenanceWorkers: workersPerTile,
        enemyPressureOnTile: enemyPressureByTile.get(o.tileId) ?? 0,
        hasGuard: guardTiles.has(o.tileId),
      };
    });
    const result = processAllOwnershipPressure(inputs);
    for (const upd of result.updates) {
      await db.mapHexOwnership.update({
        where: { cycleId_tileId: { cycleId, tileId: upd.tileId } },
        data: { ownershipPressure: upd.newPressure },
      });
    }
    for (const tileId of result.lostTiles) {
      await db.mapHexOwnership.delete({
        where: { cycleId_tileId: { cycleId, tileId } },
      });
    }

    // Alliance reinforcements.
    const alliedBattlefields = await db.battlefield.findMany({
      where: { cycleId, status: "ACTIVE" },
      select: { id: true, targetTileId: true, defenderBannerFortressId: true, attackerBannerFortressId: true, status: true },
    });
    await processAllianceReinforcements({
      db,
      cycleId,
      now: tickAt,
      diplomacyRelations: [
        ...activeWars.map((r) => ({
          status: "WAR" as const,
          fortressAId: r.fortressAId,
          fortressBId: r.fortressBId,
        })),
        // Also need ALLIED relations.
        ...(await db.diplomacyRelation.findMany({
          where: { cycleId, status: "ALLIED" },
          select: { status: true, fortressAId: true, fortressBId: true },
        })),
      ],
      activeBattlefields: alliedBattlefields,
    });

    await processSeasonFourCampaigns({ db, cycleId, tickAt });
    const convoyResult = await processSeasonFourConvoys({
      db,
      cycleId,
      tickAt,
    });
    convoyScoreEventsCreated = convoyResult.scoreEventsCreated;
    deliveredConvoyLegs = convoyResult.deliveredConvoyLegs;
    await resolveDueNukeComponentRounds({ now: tickAt, db });
    await ensureCurrentNukeComponentRound({ now: tickAt, db });
  }

  // Eternal goblins: loot camps no longer expire from timers
  // They only disappear when killed by players
  // await expireLootCamps({
  //   db: db,
  //   cycleId,
  //   tickAt,
  // });
  if (!isSeasonFour) {
    await db.fortress.updateMany({
      where: {
        cycleId,
        fortressKind: FortressKind.DWARF_RUNE,
        health: {
          gt: 0,
        },
        expiresAt: {
          lte: tickAt,
        },
      },
      data: {
        health: 0,
      },
    });

    await spawnScheduledLootCamps({
      db: db,
      cycleId,
      activeStartedAt: gameplayStartedAt,
      tickAt,
    });

    // Cleanup any unattackable loot camps (old or new).
    await cleanupUnattackableLootCamps({ db, cycleId, tickAt });
  }

  const fortresses = await db.fortress.findMany({
    where: {
      cycleId,
    },
    orderBy: [{ joinedAt: "asc" }, { id: "asc" }],
    select: {
      id: true,
      name: true,
      ownerId: true,
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
      race: true,
      fortressKind: true,
      lootCampVariant: true,
      unicornDecoyLevel: true,
      currentAction: true,
      targetFortressId: true,
      isNpc: true,
      health: true,
      maxHealth: true,
      expiresAt: true,
      mapX: true,
      mapY: true,
      joinedAt: true,
      skillPurchases: {
        select: { nodeKey: true },
      },
      castleUpgradeSpecializations: {
        select: {
          level: true,
          specialization: true,
        },
      },
      raceAbilityActivations: {
        where: {
          activeUntil: {
            gt: tickAt,
          },
        },
        select: {
          id: true,
          kind: true,
          activeFrom: true,
          activeUntil: true,
          consumedAt: true,
          targetFortressId: true,
          runeFortressId: true,
          goldCost: true,
          maintenanceGoldPerTick: true,
        },
      },
      orkBossOrders: {
        where: {
          activeUntil: {
            gt: tickAt,
          },
        },
        select: {
          kind: true,
          activeFrom: true,
          activeUntil: true,
        },
      },
      orkWaaaghInvestments: {
        where: {
          waaaghActivation: {
            activeFrom: {
              lte: tickAt,
            },
            activeUntil: {
              gt: tickAt,
            },
          },
        },
        select: {
          kind: true,
        },
      },
      dwarfGrudges: {
        select: {
          targetFortressId: true,
          bonusMultiplier: true,
        },
      },
    },
  });
  const mapHexOwnerships = await db.mapHexOwnership.findMany({
    where: {
      cycleId,
    },
    select: {
      ownerFortressId: true,
      tileId: true,
    },
  });
  const ownedTileCountsByFortressId = new Map<string, number>();
  const ownedBiomeLookup = new Map<
    string,
    Array<
      | "water"
      | "coast"
      | "plains"
      | "forest"
      | "hills"
      | "mountains"
      | "marsh"
      | "lake"
    >
  >();

  for (const ownership of mapHexOwnerships) {
    if (isHomeOfATile(ownership.tileId)) {
      continue;
    }

    ownedTileCountsByFortressId.set(
      ownership.ownerFortressId,
      (ownedTileCountsByFortressId.get(ownership.ownerFortressId) ?? 0) + 1
    );

    const biome = getTileById(ownership.tileId)?.biome;

    if (!biome) {
      continue;
    }

    const ownedBiomes = ownedBiomeLookup.get(ownership.ownerFortressId) ?? [];
    ownedBiomes.push(biome);
    ownedBiomeLookup.set(ownership.ownerFortressId, ownedBiomes);
  }
  const activeRuneSuppressions = isSeasonFour
    ? []
    : await db.raceAbilityActivation.findMany({
        where: {
          kind: RaceAbilityKind.DWARF_RUNE_GRUDGES,
          activeUntil: {
            gt: tickAt,
          },
          consumedAt: null,
          targetFortressId: {
            not: null,
          },
          runeFortress: {
            health: {
              gt: 0,
            },
            expiresAt: {
              gt: tickAt,
            },
          },
        },
        select: {
          targetFortressId: true,
        },
      });
  const suppressedFortressIds = new Set(
    activeRuneSuppressions
      .map((suppression) => suppression.targetFortressId)
      .filter((id): id is string => Boolean(id))
  );

  const currentPoints = new Map(
    fortresses.map((fortress) => [fortress.id, fortress.points])
  );
  const currentUnitsKilled = new Map(
    fortresses.map((fortress) => [fortress.id, fortress.unitsKilled])
  );
  const currentGoblinsKilled = new Map(
    fortresses.map((fortress) => [fortress.id, fortress.goblinsKilled])
  );
  const currentResourcesStolen = new Map(
    fortresses.map((fortress) => [fortress.id, fortress.resourcesStolen])
  );
  const currentGold = new Map(
    fortresses.map((fortress) => [fortress.id, fortress.gold])
  );
  const currentFood = new Map(
    fortresses.map((fortress) => [fortress.id, fortress.food])
  );
  const currentArmy = new Map(
    fortresses.map((fortress) => [fortress.id, fortress.army])
  );
  const currentRecruitmentQueue = new Map(
    fortresses.map((fortress) => [fortress.id, fortress.recruitmentQueue])
  );
  const currentHealth = new Map(
    fortresses.map((fortress) => [fortress.id, fortress.health])
  );
  const leaderboardTitleHolders = getLeaderboardTitleHolders({
    fortresses,
    tileCountsByFortressId: ownedTileCountsByFortressId,
    cycleStatus: cycle.status,
    ruleset: cycle.ruleset,
  });
  // Load battalions and war policies for battalion-based recruitment + guard.
  const battalions = await db.battalion.findMany({
    where: { cycleId },
  });
  const warPolicies = await db.warPolicy.findMany({
    where: { cycleId },
  });

  const fortressLookup = new Map(
    fortresses.map((fortress) => [fortress.id, fortress])
  );
  for (const fortress of fortresses) {
    const activeRune = isSeasonFour
      ? null
      : fortress.raceAbilityActivations.find(
      (activation) =>
        activation.kind === RaceAbilityKind.DWARF_RUNE_GRUDGES &&
        activation.activeFrom <= tickAt &&
        activation.activeUntil > tickAt &&
        activation.consumedAt === null
      );

    if (!activeRune || !activeRune.targetFortressId) {
      continue;
    }

    const upkeepCost = activeRune.maintenanceGoldPerTick || 25;
    const currentGoldValue = currentGold.get(fortress.id) ?? fortress.gold;

    if (currentGoldValue >= upkeepCost) {
      currentGold.set(fortress.id, currentGoldValue - upkeepCost);
      continue;
    }

    currentHealth.set(activeRune.runeFortressId ?? fortress.id, 0);
    suppressedFortressIds.delete(activeRune.targetFortressId);
    await db.fortress.update({
      where: {
        id: fortress.id,
      },
      data: {
        gold: currentGoldValue,
      },
    });
    if (activeRune.runeFortressId) {
      await db.fortress.update({
        where: {
          id: activeRune.runeFortressId,
        },
        data: {
          health: 0,
          army: 0,
          expiresAt: tickAt,
        },
      });
    }
    await db.raceAbilityActivation.update({
      where: {
        id: activeRune.id,
      },
      data: {
        consumedAt: tickAt,
        activeUntil: tickAt,
      },
    });
  }
  const scoreEvents: Prisma.ScoreEventCreateManyInput[] = [];
  const destroyedMegaTargets = new Set<string>();
  let resolvedAttackUnits = 0;
  const isSuppressed = (fortressId: string) =>
    suppressedFortressIds.has(fortressId);
  const getEffectiveRace = (fortress: {
    id: string;
    race: (typeof fortresses)[number]["race"];
  }) => (isSuppressed(fortress.id) ? null : fortress.race);
  const getDwarfSpeedMultiplier = (fortress: (typeof fortresses)[number]) =>
    getRaceModifiers(fortress.race).travelSpeedMultiplier;
  const getOrkSpeedMultiplier = (fortress: (typeof fortresses)[number]) =>
    getOrkBossOrderSpeedMultiplier(fortress.orkBossOrders, tickAt);
  const getFortressRaceBuffTier = (fortress: (typeof fortresses)[number]) =>
    getRaceBuffTier({
      activeStartedAt: cycle.activeStartedAt,
      now: tickAt,
      isActiveSeason: cycle.status === CycleStatus.ACTIVE,
      race: getEffectiveRace(fortress),
      ownedTileBiomes: ownedBiomeLookup.get(fortress.id) ?? [],
    });
  const getOrkWaaghActive = (fortress: (typeof fortresses)[number]) =>
    !isSeasonFour &&
    getEffectiveRace(fortress) === "ORKS" &&
    getFortressRaceBuffTier(fortress) >= 2 &&
    isRaceAbilityActive(
      fortress.raceAbilityActivations,
      RaceAbilityKind.ORK_WAAAGH,
      tickAt
    );

  const dwarfEconomySurgedThisTick = new Set<string>();
  const dwarfEconomyHaltedThisTick = new Set<string>();
  const dwarfCombatSurgedThisTick = new Set<string>();

  const pendingDeepMiningRolls = isSeasonFour ? [] : await db.dwarfDeepMiningRoll.findMany({
    where: {
      resolvedAt: null,
      activeUntil: {
        lte: tickAt,
      },
    },
    include: {
      fortress: {
        select: {
          id: true,
          ownerId: true,
          commanderName: true,
          name: true,
          gold: true,
          army: true,
          level: true,
          minersAssigned: true,
          farmersAssigned: true,
          recruitmentQueue: true,
          recruitersAssigned: true,
          race: true,
          mapX: true,
          mapY: true,
          castleUpgradeSpecializations: {
            select: {
              level: true,
              specialization: true,
            },
          },
        },
      },
    },
  });

  for (const roll of pendingDeepMiningRolls) {
    const source = fortressLookup.get(roll.fortressId) ?? roll.fortress;
    const sourceGold = currentGold.get(source.id) ?? source.gold;
    const sourceArmy = currentArmy.get(source.id) ?? source.army;
    const sourceRecruitmentQueue =
      currentRecruitmentQueue.get(source.id) ?? source.recruitmentQueue;
    const sourceFood = "food" in source ? source.food : 0;
    const effectUntil = addHours(tickAt, 1);
    const production = calculateTickProduction({
      food: currentFood.get(source.id) ?? sourceFood,
      level: source.level,
      minersAssigned: source.minersAssigned,
      farmersAssigned: source.farmersAssigned,
      recruitersAssigned: source.recruitersAssigned,
      race: source.race,
      castleSpecializations: countCastleSpecializations(
        source.castleUpgradeSpecializations
      ),
    });
    const rollUpdateData: Prisma.DwarfDeepMiningRollUpdateInput = {};

    if (roll.outcome === DwarfDeepMiningOutcome.RICH_VEIN) {
      const goldDelta = Math.max(300, production.goldProduced * 30);
      currentGold.set(source.id, sourceGold + goldDelta);
      await db.scoreEvent.create({
        data: {
          cycleId,
          fortressId: source.id,
          actorId: source.ownerId,
          eventType: ScoreEventType.DWARF_DEEP_MINING_POINTS,
          delta: goldDelta,
          createdAt: tickAt,
        },
      });
      rollUpdateData.goldDelta = goldDelta;
    } else if (roll.outcome === DwarfDeepMiningOutcome.ORE_SURGE) {
      await db.raceAbilityActivation.create({
        data: {
          fortressId: source.id,
          kind: RaceAbilityKind.DWARF_ECONOMY_SURGE,
          activeFrom: tickAt,
          activeUntil: effectUntil,
          usedAt: tickAt,
        },
      });
      dwarfEconomySurgedThisTick.add(source.id);
    } else if (roll.outcome === DwarfDeepMiningOutcome.BATTLE_RUNES) {
      await db.raceAbilityActivation.create({
        data: {
          fortressId: source.id,
          kind: RaceAbilityKind.DWARF_COMBAT_SURGE,
          activeFrom: tickAt,
          activeUntil: effectUntil,
          usedAt: tickAt,
        },
      });
      dwarfCombatSurgedThisTick.add(source.id);
    } else if (roll.outcome === DwarfDeepMiningOutcome.FACTION_SEAL) {
      const queueDelta = Math.min(
        250,
        Math.max(25, Math.floor(roll.committedGold / 2))
      );
      currentRecruitmentQueue.set(
        source.id,
        sourceRecruitmentQueue + queueDelta
      );
      rollUpdateData.recruitmentQueueDelta = queueDelta;
    } else if (roll.outcome === DwarfDeepMiningOutcome.BURIED_WARBAND) {
      const armyDelta = Math.min(
        250,
        Math.max(25, Math.floor(sourceArmy * 0.2))
      );
      currentArmy.set(source.id, sourceArmy + armyDelta);
      rollUpdateData.armyDelta = armyDelta;
    } else if (roll.outcome === DwarfDeepMiningOutcome.CAVE_IN) {
      const armyDelta = -Math.min(
        sourceArmy,
        Math.max(25, Math.ceil(sourceArmy * 0.25))
      );
      currentArmy.set(source.id, Math.max(0, sourceArmy + armyDelta));
      rollUpdateData.armyDelta = armyDelta;
    } else if (roll.outcome === DwarfDeepMiningOutcome.UNSTABLE_TUNNELS) {
      const goldDelta = -Math.min(
        roll.committedGold,
        Math.max(25, Math.floor(roll.committedGold * 0.25))
      );
      currentGold.set(source.id, Math.max(0, sourceGold + goldDelta));
      rollUpdateData.goldDelta = goldDelta;
    } else if (roll.outcome === DwarfDeepMiningOutcome.SHAFT_COLLAPSE) {
      await db.raceAbilityActivation.create({
        data: {
          fortressId: source.id,
          kind: RaceAbilityKind.DWARF_ECONOMY_HALT,
          activeFrom: tickAt,
          activeUntil: effectUntil,
          usedAt: tickAt,
        },
      });
      dwarfEconomyHaltedThisTick.add(source.id);
    }

    await db.dwarfDeepMiningRoll.update({
      where: {
        id: roll.id,
      },
      data: {
        ...rollUpdateData,
        resolvedAt: tickAt,
        activeUntil:
          roll.outcome === DwarfDeepMiningOutcome.ORE_SURGE ||
          roll.outcome === DwarfDeepMiningOutcome.BATTLE_RUNES ||
          roll.outcome === DwarfDeepMiningOutcome.SHAFT_COLLAPSE
            ? effectUntil
            : null,
      },
    });
  }

  if (isSeasonFour) {
    await db.attackUnit.updateMany({
      where: {
        cycleId,
        resolvedAt: null,
        cancelledAt: null,
        targetFortress: {
          fortressKind: {
            not: FortressKind.PLAYER,
          },
        },
      },
      data: {
        cancelledAt: tickAt,
      },
    });
  }

  // === ARRIVAL PHASE: Process all due attack units (arrivals, reinforcements, direct attacks) ===
  // This must happen BEFORE any battlefield is resolved!
  const dueAttackUnits = await db.attackUnit.findMany({
    where: {
      cycleId,
      resolvedAt: null,
      cancelledAt: null,
      arrivesAt: {
        lte: tickAt,
      },
    },
    orderBy: [{ arrivesAt: "asc" }, { id: "asc" }],
    select: {
      id: true,
      attackerFortressId: true,
      targetFortressId: true,
      reinforcementBattlefieldId: true,
      reinforcementBattalionId: true,
      reinforcementSide: true,
      fortifyTargetTileId: true,
      armyAmount: true,
      arrivesAt: true,
      recalledAt: true,
      returnOriginMapX: true,
      returnOriginMapY: true,
      attackerReturned: true,
      defenderArmyAtBattleStart: true,
      resolvedAttackPower: true,
      resolvedDefensePower: true,
      attackerSurvivors: true,
      attackerRetired: true,
      defenderLosses: true,
      pointsLooted: true,
      foodLooted: true,
      armyLooted: true,
      reinforcementBattlefield: {
        select: {
          targetTileId: true,
        },
      },
      reinforcementBattalion: {
        select: {
          garrisonedAt: true,
        },
      },
    },
  });

  const resolvedBatchAttackUnitIds = new Set<string>();
  const retiredSeasonFourSelfFortifyUnitIds = new Set<string>();
  for (const unit of dueAttackUnits) {
    // All arrivals are processed and committed to their battlefields before any battlefield is resolved.
    if (
      isSeasonFour &&
      unit.fortifyTargetTileId &&
      unit.attackerFortressId === unit.targetFortressId &&
      !unit.reinforcementBattlefieldId &&
      !unit.reinforcementBattalionId
    ) {
      await db.attackUnit.update({
        where: {
          id: unit.id,
        },
        data: {
          resolvedAt: tickAt,
          defenderArmyAtBattleStart: null,
          resolvedAttackPower: 0,
          resolvedDefensePower: 0,
          attackerSurvivors: 0,
          attackerRetired: unit.armyAmount,
          attackerReturned: 0,
          defenderLosses: 0,
          pointsLooted: 0,
          foodLooted: 0,
          armyLooted: 0,
        },
      });
      retiredSeasonFourSelfFortifyUnitIds.add(unit.id);
      resolvedBatchAttackUnitIds.add(unit.id);
      resolvedAttackUnits += 1;
      continue;
    }

    if (unit.reinforcementBattalionId) {
      const battalion = await db.battalion.findUnique({
        where: {
          id: unit.reinforcementBattalionId,
        },
        select: {
          id: true,
          size: true,
          maxSize: true,
        },
      });

      let acceptedArmy = 0;
      let returnedArmy = unit.armyAmount;

      if (battalion) {
        acceptedArmy = Math.max(
          0,
          Math.min(unit.armyAmount, battalion.maxSize - battalion.size),
        );
        returnedArmy = unit.armyAmount - acceptedArmy;

        if (acceptedArmy > 0) {
          await db.battalion.update({
            where: {
              id: battalion.id,
            },
            data: {
              size: {
                increment: acceptedArmy,
              },
            },
          });
        }
      } else {
        await db.fortress.update({
          where: {
            id: unit.attackerFortressId,
          },
          data: {
            army: {
              increment: returnedArmy,
            },
          },
        });
      }

      await db.attackUnit.update({
        where: {
          id: unit.id,
        },
        data: {
          resolvedAt: tickAt,
          defenderArmyAtBattleStart: null,
          resolvedAttackPower: 0,
          resolvedDefensePower: 0,
          attackerSurvivors: acceptedArmy,
          attackerRetired: 0,
          attackerReturned: battalion ? 0 : returnedArmy,
          defenderLosses: 0,
          pointsLooted: 0,
          foodLooted: 0,
          armyLooted: 0,
        },
      });
      resolvedBatchAttackUnitIds.add(unit.id);
      resolvedAttackUnits += 1;
      continue;
    }

    if (unit.fortifyTargetTileId) {
      const existingGarrison = await db.fortressGarrison.findFirst({
        where: {
          cycleId,
          fortressId: unit.attackerFortressId,
          tileId: unit.fortifyTargetTileId,
          maintenanceDrains: false,
        },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        select: {
          id: true,
        },
      });

      if (existingGarrison) {
        await db.fortressGarrison.update({
          where: {
            id: existingGarrison.id,
          },
          data: {
            army: {
              increment: unit.armyAmount,
            },
          },
        });
      } else {
        await db.fortressGarrison.create({
          data: {
            cycleId,
            fortressId: unit.attackerFortressId,
            battlefieldId: null,
            tileId: unit.fortifyTargetTileId,
            army: unit.armyAmount,
            maintenanceDrains: false,
          },
        });
      }

      await db.attackUnit.update({
        where: {
          id: unit.id,
        },
        data: {
          resolvedAt: tickAt,
          defenderArmyAtBattleStart: null,
          resolvedAttackPower: 0,
          resolvedDefensePower: 0,
          attackerSurvivors: unit.armyAmount,
          attackerRetired: 0,
          attackerReturned: 0,
          defenderLosses: 0,
          pointsLooted: 0,
          foodLooted: 0,
          armyLooted: 0,
        },
      });
      resolvedBatchAttackUnitIds.add(unit.id);
      resolvedAttackUnits += 1;
      continue;
    }

    if (unit.reinforcementBattlefieldId && unit.reinforcementSide) {
      const battlefield = await db.battlefield.findUnique({
        where: {
          id: unit.reinforcementBattlefieldId,
        },
        select: {
          id: true,
          status: true,
        },
      });

      if (battlefield?.status === "ACTIVE") {
        await db.battlefieldParticipant.upsert({
          where: {
            battlefieldId_fortressId: {
              battlefieldId: battlefield.id,
              fortressId: unit.attackerFortressId,
            },
          },
          update: {
            armyCommitted: {
              increment: unit.armyAmount,
            },
            armyRemaining: {
              increment: unit.armyAmount,
            },
          },
          create: {
            battlefieldId: battlefield.id,
            fortressId: unit.attackerFortressId,
            side: unit.reinforcementSide,
            armyCommitted: unit.armyAmount,
            armyRemaining: unit.armyAmount,
            maintenanceDrains: true,
            joinedAt: tickAt,
          },
        });
        await db.battlefield.update({
          where: {
            id: battlefield.id,
          },
          data:
            unit.reinforcementSide === "ATTACKER"
              ? {
                  attackerArmyRemaining: {
                    increment: unit.armyAmount,
                  },
                }
              : {
                  defenderArmyRemaining: {
                    increment: unit.armyAmount,
                  },
                },
        });
      } else {
        await db.fortress.update({
          where: {
            id: unit.attackerFortressId,
          },
          data: {
            army: {
              increment: unit.armyAmount,
            },
          },
        });
      }

      await db.attackUnit.update({
        where: {
          id: unit.id,
        },
        data: {
          resolvedAt: tickAt,
          defenderArmyAtBattleStart: null,
          resolvedAttackPower: 0,
          resolvedDefensePower: 0,
          attackerSurvivors: unit.armyAmount,
          attackerRetired: 0,
          attackerReturned:
            battlefield?.status === "ACTIVE" ? 0 : unit.armyAmount,
          defenderLosses: 0,
          pointsLooted: 0,
          foodLooted: 0,
          armyLooted: 0,
        },
      });
      resolvedBatchAttackUnitIds.add(unit.id);
      resolvedAttackUnits += 1;
      continue;
    }

    const target = fortressLookup.get(unit.targetFortressId);

    if (unit.recalledAt || !target) {
      continue;
    }

    if (target.isNpc || target.fortressKind !== FortressKind.PLAYER) {
      if (target.fortressKind === FortressKind.MEGA) {
        await createBattlefieldFromAttackUnit({
          db,
          attackUnitId: unit.id,
          tickAt,
        });
        resolvedBatchAttackUnitIds.add(unit.id);
        resolvedAttackUnits += 1;
      }

      continue;
    }

    await createBattlefieldFromAttackUnit({
      db,
      attackUnitId: unit.id,
      tickAt,
    });
    resolvedBatchAttackUnitIds.add(unit.id);
    resolvedAttackUnits += 1;
  }

  // Record road crossings for all arrived units.
  for (const unit of dueAttackUnits) {
    if (retiredSeasonFourSelfFortifyUnitIds.has(unit.id)) {
      continue;
    }

    if (unit.armyAmount > 0) {
      const attacker = fortressLookup.get(unit.attackerFortressId);
      const target = fortressLookup.get(unit.targetFortressId);
      if (attacker && target) {
        const origin = {
          mapX: unit.returnOriginMapX ?? attacker.mapX,
          mapY: unit.returnOriginMapY ?? attacker.mapY,
        };
        let destination = unit.recalledAt
          ? { mapX: attacker.mapX, mapY: attacker.mapY }
          : { mapX: target.mapX, mapY: target.mapY };
        const targetTileId =
          !unit.recalledAt &&
          (unit.fortifyTargetTileId ??
            unit.reinforcementBattalion?.garrisonedAt ??
            unit.reinforcementBattlefield?.targetTileId);
        const targetTile = targetTileId ? getTileById(targetTileId) : null;
        if (targetTile) {
          destination = {
            mapX: targetTile.xPercent,
            mapY: targetTile.yPercent,
          };
        }

        await recordUnitRoadCrossings({
          cycleId,
          originMapX: origin.mapX,
          originMapY: origin.mapY,
          targetMapX: destination.mapX,
          targetMapY: destination.mapY,
          armyAmount: unit.armyAmount,
          now: tickAt,
        });
      }
    }
  }

  // Record road crossings for delivered convoy legs (trade caravans build roads).
  // Each convoy contributes multiple crossings since caravans wear paths faster.
  const CONVOY_ROAD_CROSSINGS = 10;
  for (const leg of deliveredConvoyLegs) {
    const from = fortressLookup.get(leg.fromFortressId);
    const to = fortressLookup.get(leg.toFortressId);
    if (from && to) {
      await recordUnitRoadCrossings({
        cycleId,
        originMapX: from.mapX,
        originMapY: from.mapY,
        targetMapX: to.mapX,
        targetMapY: to.mapY,
        armyAmount: CONVOY_ROAD_CROSSINGS,
        now: tickAt,
      });
    }
  }

  // All due arrivals are now processed. Only after this, resolve battlefields.
  const dueAttackUnitsByTargetId = new Map<string, typeof dueAttackUnits>();
  for (const dueAttackUnit of dueAttackUnits) {
    const targetUnits =
      dueAttackUnitsByTargetId.get(dueAttackUnit.targetFortressId) ?? [];
    targetUnits.push(dueAttackUnit);
    dueAttackUnitsByTargetId.set(dueAttackUnit.targetFortressId, targetUnits);
  }
  const getPendingTargetUnits = (targetId: string) =>
    (dueAttackUnitsByTargetId.get(targetId) ?? []).filter(
      (targetUnit) => !resolvedBatchAttackUnitIds.has(targetUnit.id)
    );

  for (const unit of dueAttackUnits) {
    if (resolvedBatchAttackUnitIds.has(unit.id)) {
      continue;
    }

    const attacker = fortressLookup.get(unit.attackerFortressId);
    const target = fortressLookup.get(unit.targetFortressId);

    if (unit.recalledAt) {
      const returningArmy = unit.attackerReturned ?? unit.armyAmount;

      if (attacker) {
        currentArmy.set(
          attacker.id,
          (currentArmy.get(attacker.id) ?? attacker.army) + returningArmy
        );
      }

      const pureRecallDetection =
        unit.defenderArmyAtBattleStart === null &&
        unit.resolvedAttackPower === null &&
        unit.resolvedDefensePower === null &&
        unit.attackerSurvivors === null &&
        unit.attackerRetired === null &&
        unit.attackerReturned === null &&
        unit.defenderLosses === null &&
        unit.pointsLooted === null &&
        unit.foodLooted === null;
      const updateData: Prisma.AttackUnitUpdateInput = {
        resolvedAt: tickAt,
      };

      if (pureRecallDetection) {
        updateData.defenderArmyAtBattleStart = null;
        updateData.resolvedAttackPower = 0;
        updateData.resolvedDefensePower = 0;
        updateData.attackerSurvivors = returningArmy;
        updateData.attackerRetired = 0;
        updateData.attackerReturned = returningArmy;
        updateData.defenderLosses = 0;
        updateData.pointsLooted = 0;
        updateData.foodLooted = 0;
        updateData.armyLooted = 0;
      }

      await db.attackUnit.update({
        where: {
          id: unit.id,
        },
        data: updateData,
      });

      resolvedAttackUnits += 1;
      resolvedBatchAttackUnitIds.add(unit.id);
      continue;
    }

    if (target?.fortressKind === FortressKind.UNICORN_DECOY) {
      const targetUnits = getPendingTargetUnits(target.id);
      const copiedLevel = Math.max(1, target.unicornDecoyLevel ?? 1);
      const decoyCasualties = target.health > 0 ? 200 * copiedLevel : 0;

      for (const targetUnit of targetUnits) {
        const targetAttacker = fortressLookup.get(
          targetUnit.attackerFortressId
        );
        const attackerReturned = Math.max(
          0,
          targetUnit.armyAmount - decoyCasualties
        );
        const attackerLost = targetUnit.armyAmount - attackerReturned;

        if (targetAttacker && attackerReturned > 0) {
          const returnArrivesAt = getAttackArrivalAt({
            launchedAt: tickAt,
            origin: {
              mapX: target.mapX,
              mapY: target.mapY,
            },
            target: {
              mapX: targetAttacker.mapX,
              mapY: targetAttacker.mapY,
            },
            attackerRace: getEffectiveRace(targetAttacker),
            raceBuffTier: getFortressRaceBuffTier(targetAttacker),
            speedMultiplier:
              getDwarfSpeedMultiplier(targetAttacker) *
              getOrkSpeedMultiplier(targetAttacker),
            waaagh: getOrkWaaghActive(targetAttacker),
          });

          await db.attackUnit.update({
            where: {
              id: targetUnit.id,
            },
            data: {
              recalledAt: tickAt,
              returnOriginMapX: target.mapX,
              returnOriginMapY: target.mapY,
              arrivesAt: returnArrivesAt,
              defenderArmyAtBattleStart: 0,
              resolvedAttackPower: targetUnit.armyAmount,
              resolvedDefensePower: decoyCasualties,
              attackerSurvivors: attackerReturned,
              attackerRetired: attackerLost,
              attackerReturned,
              defenderLosses: 0,
              pointsLooted: 0,
              foodLooted: 0,
              armyLooted: 0,
            },
          });
        } else {
          await db.attackUnit.update({
            where: {
              id: targetUnit.id,
            },
            data: {
              resolvedAt: tickAt,
              defenderArmyAtBattleStart: 0,
              resolvedAttackPower: targetUnit.armyAmount,
              resolvedDefensePower: decoyCasualties,
              attackerSurvivors: attackerReturned,
              attackerRetired: attackerLost,
              attackerReturned,
              defenderLosses: 0,
              pointsLooted: 0,
              foodLooted: 0,
              armyLooted: 0,
            },
          });
          resolvedAttackUnits += 1;
        }

        resolvedBatchAttackUnitIds.add(targetUnit.id);

        if (targetAttacker) {
          scoreEvents.push({
            cycleId,
            fortressId: targetAttacker.id,
            actorId: targetAttacker.ownerId,
            targetFortressId: target.id,
            eventType: ScoreEventType.UNICORN_DECOY_DESTROY,
            delta: 0,
            createdAt: tickAt,
          });
        }
      }

      if (targetUnits.length > 0) {
        currentHealth.set(target.id, 0);
        await db.fortress.update({
          where: {
            id: target.id,
          },
          data: {
            health: 0,
          },
        });
      }

      continue;
    }

    if (target?.fortressKind === FortressKind.DWARF_RUNE) {
      const runeActivation = await db.raceAbilityActivation.findFirst({
        where: {
          kind: RaceAbilityKind.DWARF_RUNE_GRUDGES,
          runeFortressId: target.id,
          activeUntil: {
            gt: tickAt,
          },
          consumedAt: null,
        },
        select: {
          fortressId: true,
          targetFortressId: true,
          id: true,
        },
      });
      const runeOwner = runeActivation
        ? fortressLookup.get(runeActivation.fortressId)
        : null;
      const targetUnits = getPendingTargetUnits(target.id);
      const runeOutcomes = new Map<
        string,
        {
          attackPower: number;
          defensePower: number;
          attackerSurvivors: number;
          attackerRetired: number;
          attackerReturned: number;
          defenderLosses: number;
          defenderArmyAtBattleStart: number;
        }
      >();
      let destroyer: {
        unitId: string;
        attacker: NonNullable<typeof attacker>;
      } | null = null;

      for (const targetUnit of targetUnits) {
        const targetAttacker = fortressLookup.get(
          targetUnit.attackerFortressId
        );

        if (!targetAttacker || targetAttacker.ownerId === runeOwner?.ownerId) {
          continue;
        }

        const defenderArmy = currentArmy.get(target.id) ?? target.army;
        const targetAttackerRaceBuffTier =
          getFortressRaceBuffTier(targetAttacker);
        const outcome = calculateRaidOutcome({
          attackArmy: targetUnit.armyAmount,
          attackerRace: getEffectiveRace(targetAttacker),
          defenderArmy,
          defenderDbLevel: 0,
          defenderRace: null,
          attackPowerMultiplier: getCombatAttackPowerMultiplier({
            fortress: {
              ...targetAttacker,
              race: getEffectiveRace(targetAttacker),
            },
            now: tickAt,
            targetFortressId: target.id,
            targetIsPlayerFortress: isPlayerCombatTarget(target),
            leaderboardTitleHolders,
            combatSurgedThisTick: dwarfCombatSurgedThisTick,
            enableWaaagh: targetAttackerRaceBuffTier >= 2,
            enableDwarfGrudge: targetAttackerRaceBuffTier >= 1,
            enableLegacyAbilities: !isSeasonFour,
          }),
          defenderGold: 0,
          defenderFood: 0,
        });
        const defenderArmyAfterBattle = Math.max(
          0,
          defenderArmy - outcome.defenderLosses
        );

        currentArmy.set(target.id, defenderArmyAfterBattle);
        if (outcome.defenderLosses > 0) {
          currentUnitsKilled.set(
            targetAttacker.id,
            (currentUnitsKilled.get(targetAttacker.id) ??
              targetAttacker.unitsKilled) + outcome.defenderLosses
          );
        }
        runeOutcomes.set(targetUnit.id, {
          attackPower: outcome.attackPower,
          defensePower: outcome.defensePower,
          attackerSurvivors: outcome.attackerSurvivors,
          attackerRetired: outcome.attackerRetired,
          attackerReturned: outcome.attackerReturned,
          defenderLosses: outcome.defenderLosses,
          defenderArmyAtBattleStart: defenderArmy,
        });

        if (defenderArmyAfterBattle <= 0 && !destroyer) {
          destroyer = {
            unitId: targetUnit.id,
            attacker: targetAttacker,
          };
          currentHealth.set(target.id, 0);
        }
      }

      if (destroyer) {
        currentGold.set(
          destroyer.attacker.id,
          (currentGold.get(destroyer.attacker.id) ?? destroyer.attacker.gold) +
            DWARF_DEEP_MINING_RUNE_BOUNTY
        );
        if (runeActivation?.targetFortressId) {
          suppressedFortressIds.delete(runeActivation.targetFortressId);
        }
        if (runeActivation) {
          await db.raceAbilityActivation.update({
            where: {
              id: runeActivation.id,
            },
            data: {
              consumedAt: tickAt,
              activeUntil: tickAt,
            },
          });
        }
        await db.fortress.update({
          where: {
            id: target.id,
          },
          data: {
            health: 0,
            army: 0,
            expiresAt: tickAt,
          },
        });
        scoreEvents.push({
          cycleId,
          fortressId: destroyer.attacker.id,
          actorId: destroyer.attacker.ownerId,
          targetFortressId: target.id,
          eventType: ScoreEventType.DWARF_RUNE_BOUNTY,
          delta: DWARF_DEEP_MINING_RUNE_BOUNTY,
          createdAt: tickAt,
        });
      }

      for (const targetUnit of targetUnits) {
        const targetAttacker = fortressLookup.get(
          targetUnit.attackerFortressId
        );
        const outcome = runeOutcomes.get(targetUnit.id);
        const attackerReturned = outcome?.attackerReturned ?? 0;
        const unitGetsReward =
          Boolean(destroyer) && targetUnit.id === destroyer?.unitId;

        if (!targetAttacker || !outcome) {
          await db.attackUnit.update({
            where: {
              id: targetUnit.id,
            },
            data: {
              resolvedAt: tickAt,
              defenderArmyAtBattleStart: null,
              resolvedAttackPower: 0,
              resolvedDefensePower: 0,
              attackerSurvivors: 0,
              attackerRetired: targetUnit.armyAmount,
              attackerReturned: 0,
              defenderLosses: 0,
              pointsLooted: 0,
              foodLooted: 0,
              armyLooted: 0,
            },
          });
          resolvedAttackUnits += 1;
          resolvedBatchAttackUnitIds.add(targetUnit.id);
          continue;
        }

        if (attackerReturned > 0) {
          const returnArrivesAt = getAttackArrivalAt({
            launchedAt: tickAt,
            origin: {
              mapX: target.mapX,
              mapY: target.mapY,
            },
            target: {
              mapX: targetAttacker.mapX,
              mapY: targetAttacker.mapY,
            },
            attackerRace: getEffectiveRace(targetAttacker),
            raceBuffTier: getFortressRaceBuffTier(targetAttacker),
            speedMultiplier:
              getDwarfSpeedMultiplier(targetAttacker) *
              getOrkSpeedMultiplier(targetAttacker),
            waaagh: getOrkWaaghActive(targetAttacker),
          });

          await db.attackUnit.update({
            where: {
              id: targetUnit.id,
            },
            data: {
              recalledAt: tickAt,
              returnOriginMapX: target.mapX,
              returnOriginMapY: target.mapY,
              arrivesAt: returnArrivesAt,
              defenderArmyAtBattleStart: outcome.defenderArmyAtBattleStart,
              resolvedAttackPower: outcome.attackPower,
              resolvedDefensePower: outcome.defensePower,
              attackerSurvivors: outcome.attackerSurvivors,
              attackerRetired: outcome.attackerRetired,
              attackerReturned,
              defenderLosses: outcome.defenderLosses,
              pointsLooted: unitGetsReward ? DWARF_DEEP_MINING_RUNE_BOUNTY : 0,
              foodLooted: 0,
              armyLooted: 0,
            },
          });
        } else {
          await db.attackUnit.update({
            where: {
              id: targetUnit.id,
            },
            data: {
              resolvedAt: tickAt,
              defenderArmyAtBattleStart: outcome.defenderArmyAtBattleStart,
              resolvedAttackPower: outcome.attackPower,
              resolvedDefensePower: outcome.defensePower,
              attackerSurvivors: outcome.attackerSurvivors,
              attackerRetired: outcome.attackerRetired,
              attackerReturned,
              defenderLosses: outcome.defenderLosses,
              pointsLooted: unitGetsReward ? DWARF_DEEP_MINING_RUNE_BOUNTY : 0,
              foodLooted: 0,
              armyLooted: 0,
            },
          });
          resolvedAttackUnits += 1;
        }

        resolvedBatchAttackUnitIds.add(targetUnit.id);
      }

      continue;
    }

    if (target?.fortressKind === FortressKind.LOOT_CAMP) {
      const targetUnits = getPendingTargetUnits(target.id);
      const lootCampOutcomes = new Map<
        string,
        {
          attackPower: number;
          defensePower: number;
          attackerSurvivors: number;
          attackerRetired: number;
          attackerReturned: number;
          defenderLosses: number;
          targetLoss: number;
          defenderArmyAtBattleStart: number;
        }
      >();
      let destroyer: {
        unitId: string;
        attacker: NonNullable<typeof attacker>;
      } | null = null;

      for (const targetUnit of targetUnits) {
        const targetAttacker = fortressLookup.get(
          targetUnit.attackerFortressId
        );

        if (!targetAttacker) {
          continue;
        }

        const targetHealth = currentHealth.get(target.id) ?? target.health;
        const defenderArmy = currentArmy.get(target.id) ?? target.army;
        const targetAttackerRaceBuffTier =
          getFortressRaceBuffTier(targetAttacker);
        const outcome = calculateRaidOutcome({
          attackArmy: targetUnit.armyAmount,
          attackerRace: getEffectiveRace(targetAttacker),
          defenderArmy,
          defenderDbLevel: 0,
          defenderHasCastle: false,
          defenderRace: null,
          attackPowerMultiplier: getCombatAttackPowerMultiplier({
            fortress: {
              ...targetAttacker,
              race: getEffectiveRace(targetAttacker),
            },
            now: tickAt,
            targetFortressId: target.id,
            targetIsPlayerFortress: isPlayerCombatTarget(target),
            leaderboardTitleHolders,
            combatSurgedThisTick: dwarfCombatSurgedThisTick,
            enableWaaagh: targetAttackerRaceBuffTier >= 2,
            enableDwarfGrudge: targetAttackerRaceBuffTier >= 1,
            enableLegacyAbilities: !isSeasonFour,
          }),
          defenderGold: 0,
          defenderFood: 0,
        });
        const attackerWon = outcome.outcome === "ATTACKER_WIN";
        const defenderArmyAfterBattle = Math.max(
          0,
          defenderArmy - outcome.defenderLosses
        );
        const targetLoss = Math.min(
          targetHealth,
          attackerWon
            ? targetUnit.armyAmount *
                getFortressAttackDamage(targetAttacker.level)
            : 0
        );

        currentArmy.set(target.id, defenderArmyAfterBattle);
        if (outcome.defenderLosses > 0) {
          currentUnitsKilled.set(
            targetAttacker.id,
            (currentUnitsKilled.get(targetAttacker.id) ??
              targetAttacker.unitsKilled) + outcome.defenderLosses
          );
        }
        lootCampOutcomes.set(targetUnit.id, {
          attackPower: outcome.attackPower,
          defensePower: outcome.defensePower,
          attackerSurvivors: outcome.attackerSurvivors,
          attackerRetired: outcome.attackerRetired,
          attackerReturned: outcome.attackerReturned,
          defenderLosses: outcome.defenderLosses,
          targetLoss,
          defenderArmyAtBattleStart: defenderArmy,
        });

        const nextHealth = targetHealth - targetLoss;
        currentHealth.set(target.id, nextHealth);

        if (nextHealth <= 0 && !destroyer) {
          destroyer = {
            unitId: targetUnit.id,
            attacker: targetAttacker,
          };
        }
      }

      const destroyed = (currentHealth.get(target.id) ?? target.health) <= 0;
      const reward =
        destroyed && destroyer
          ? getLootCampReward(target.lootCampVariant, target.maxHealth)
          : null;

      if (destroyed && destroyer && reward) {
        const rewardMultiplier = getLeaderboardTitleLootCampRewardMultiplier(
          leaderboardTitleHolders,
          destroyer.attacker.id
        );
        const boostedReward = {
          ...reward,
          gold: Math.floor(reward.gold * rewardMultiplier),
          points: Math.floor(reward.points * rewardMultiplier),
          food: Math.floor(reward.food * rewardMultiplier),
          army: Math.floor(reward.army * rewardMultiplier),
        };
        currentGoblinsKilled.set(
          destroyer.attacker.id,
          (currentGoblinsKilled.get(destroyer.attacker.id) ??
            destroyer.attacker.goblinsKilled) + 1
        );
        currentGold.set(
          destroyer.attacker.id,
          (currentGold.get(destroyer.attacker.id) ?? destroyer.attacker.gold) +
            boostedReward.gold
        );
        currentPoints.set(
          destroyer.attacker.id,
          (currentPoints.get(destroyer.attacker.id) ?? 0) + boostedReward.points
        );
        currentFood.set(
          destroyer.attacker.id,
          (currentFood.get(destroyer.attacker.id) ?? destroyer.attacker.food) +
            boostedReward.food
        );
        currentArmy.set(
          destroyer.attacker.id,
          (currentArmy.get(destroyer.attacker.id) ?? destroyer.attacker.army) +
            boostedReward.army
        );

        if (boostedReward.points > 0) {
          scoreEvents.push({
            cycleId,
            fortressId: destroyer.attacker.id,
            actorId: destroyer.attacker.ownerId,
            targetFortressId: target.id,
            eventType: ScoreEventType.LOOT_CAMP_REWARD,
            delta: boostedReward.points,
            createdAt: tickAt,
          });
        }

        if (reward.resetRaceCooldown) {
          await resetAttackerRaceAbilityCooldown({
            db: db,
            fortress: destroyer.attacker,
            now: tickAt,
          });
        }

        if (isRealOrkPlayerFortress(destroyer.attacker)) {
          await applyOrkScrapDelta({
            db,
            cycleId,
            fortressId: destroyer.attacker.id,
            delta: getOrkLootCampScrap(target.lootCampVariant),
            reason: OrkScrapEventReason.LOOT_CAMP,
            now: tickAt,
            targetFortressId: target.id,
            attackUnitId: destroyer.unitId,
          });
        }
      }

      const unitRewardBase =
        destroyed && destroyer && reward
          ? {
              ...reward,
              gold: Math.floor(
                reward.gold *
                  getLeaderboardTitleLootCampRewardMultiplier(
                    leaderboardTitleHolders,
                    destroyer.attacker.id
                  )
              ),
              points: Math.floor(
                reward.points *
                  getLeaderboardTitleLootCampRewardMultiplier(
                    leaderboardTitleHolders,
                    destroyer.attacker.id
                  )
              ),
              food: Math.floor(
                reward.food *
                  getLeaderboardTitleLootCampRewardMultiplier(
                    leaderboardTitleHolders,
                    destroyer.attacker.id
                  )
              ),
              army: Math.floor(
                reward.army *
                  getLeaderboardTitleLootCampRewardMultiplier(
                    leaderboardTitleHolders,
                    destroyer.attacker.id
                  )
              ),
            }
          : null;

      for (const targetUnit of targetUnits) {
        const targetAttacker = fortressLookup.get(
          targetUnit.attackerFortressId
        );
        const outcome = lootCampOutcomes.get(targetUnit.id);
        const attackerReturned = outcome?.attackerReturned ?? 0;
        const unitGetsReward =
          Boolean(destroyer) && targetUnit.id === destroyer?.unitId && reward;
        const unitReward = unitGetsReward
          ? (unitRewardBase ?? reward)
          : {
              points: 0,
              gold: 0,
              food: 0,
              army: 0,
            };

        if (!targetAttacker || !outcome) {
          await db.attackUnit.update({
            where: {
              id: targetUnit.id,
            },
            data: {
              resolvedAt: tickAt,
              defenderArmyAtBattleStart: null,
              resolvedAttackPower: 0,
              resolvedDefensePower: 0,
              attackerSurvivors: 0,
              attackerRetired: targetUnit.armyAmount,
              attackerReturned: 0,
              defenderLosses: 0,
              pointsLooted: 0,
              foodLooted: 0,
              armyLooted: 0,
            },
          });
          resolvedAttackUnits += 1;
          resolvedBatchAttackUnitIds.add(targetUnit.id);
          continue;
        }

        if (attackerReturned > 0) {
          const returnArrivesAt = getAttackArrivalAt({
            launchedAt: tickAt,
            origin: {
              mapX: target.mapX,
              mapY: target.mapY,
            },
            target: {
              mapX: targetAttacker.mapX,
              mapY: targetAttacker.mapY,
            },
            attackerRace: getEffectiveRace(targetAttacker),
            raceBuffTier: getFortressRaceBuffTier(targetAttacker),
            speedMultiplier:
              getDwarfSpeedMultiplier(targetAttacker) *
              getOrkSpeedMultiplier(targetAttacker),
          });

          await db.attackUnit.update({
            where: {
              id: targetUnit.id,
            },
            data: {
              recalledAt: tickAt,
              returnOriginMapX: target.mapX,
              returnOriginMapY: target.mapY,
              arrivesAt: returnArrivesAt,
              defenderArmyAtBattleStart: outcome.defenderArmyAtBattleStart,
              resolvedAttackPower: outcome.targetLoss,
              resolvedDefensePower: outcome.defensePower,
              attackerSurvivors: outcome.attackerSurvivors,
              attackerRetired: outcome.attackerRetired,
              attackerReturned,
              defenderLosses: outcome.defenderLosses,
              pointsLooted: unitReward.gold,
              foodLooted: unitReward.food,
              armyLooted: unitReward.army,
            },
          });
        } else {
          await db.attackUnit.update({
            where: {
              id: targetUnit.id,
            },
            data: {
              resolvedAt: tickAt,
              defenderArmyAtBattleStart: outcome.defenderArmyAtBattleStart,
              resolvedAttackPower: outcome.targetLoss,
              resolvedDefensePower: outcome.defensePower,
              attackerSurvivors: outcome.attackerSurvivors,
              attackerRetired: outcome.attackerRetired,
              attackerReturned,
              defenderLosses: outcome.defenderLosses,
              pointsLooted: unitReward.gold,
              foodLooted: unitReward.food,
              armyLooted: unitReward.army,
            },
          });
          resolvedAttackUnits += 1;
        }

        resolvedBatchAttackUnitIds.add(targetUnit.id);
      }

      continue;
    }

    if (target?.isNpc) {
      const targetUnits = getPendingTargetUnits(target.id);

      if (target.fortressKind === FortressKind.MEGA) {
        if ((currentHealth.get(target.id) ?? target.health) <= 0) {
          for (const targetUnit of targetUnits) {
            const targetAttacker = fortressLookup.get(
              targetUnit.attackerFortressId
            );
            const attackerReturned = targetUnit.armyAmount;

            if (targetAttacker && attackerReturned > 0) {
              currentArmy.set(
                targetAttacker.id,
                (currentArmy.get(targetAttacker.id) ?? targetAttacker.army) +
                  attackerReturned
              );

              await db.attackUnit.update({
                where: {
                  id: targetUnit.id,
                },
                data: {
                  resolvedAt: tickAt,
                  defenderArmyAtBattleStart: null,
                  resolvedAttackPower: 0,
                  resolvedDefensePower: 0,
                  attackerSurvivors: targetUnit.armyAmount,
                  attackerRetired: 0,
                  attackerReturned,
                  defenderLosses: 0,
                  pointsLooted: 0,
                  foodLooted: 0,
                  armyLooted: 0,
                },
              });
              resolvedAttackUnits += 1;
            }

            resolvedBatchAttackUnitIds.add(targetUnit.id);
          }

          continue;
        }

        for (const targetUnit of targetUnits) {
          const targetAttacker = fortressLookup.get(
            targetUnit.attackerFortressId
          );
          const attackerReturned = targetUnit.armyAmount;

          if (!targetAttacker) {
            continue;
          }

          const targetHealth = currentHealth.get(target.id) ?? target.health;
          const targetLoss = Math.min(
            targetHealth,
            Math.floor(
              targetUnit.armyAmount *
                getFortressAttackDamage(targetAttacker.level) *
                (!isSeasonFour &&
                hasHomeOfABossBuff(targetAttacker.raceAbilityActivations, tickAt)
                  ? HOME_OF_A_BOSS_BUFF_MULTIPLIER
                  : 1) *
                getLeaderboardTitleAttackMultiplier(
                  leaderboardTitleHolders,
                  targetAttacker.id
                )
            )
          );

          if (targetLoss > 0) {
            currentHealth.set(target.id, targetHealth - targetLoss);
            await db.homeOfABossDamageContribution.upsert({
              where: {
                cycleId_bossGeneration_fortressId: {
                  cycleId,
                  bossGeneration: cycle.megaFortressDestroyCount,
                  fortressId: targetAttacker.id,
                },
              },
              create: {
                cycleId,
                bossGeneration: cycle.megaFortressDestroyCount,
                fortressId: targetAttacker.id,
                damage: targetLoss,
                firstDamagedAt: tickAt,
                lastDamagedAt: tickAt,
              },
              update: {
                damage: {
                  increment: targetLoss,
                },
                lastDamagedAt: tickAt,
              },
            });
            scoreEvents.push({
              cycleId,
              fortressId: target.id,
              actorId: targetAttacker.ownerId,
              targetFortressId: target.id,
              eventType: ScoreEventType.MEGA_DAMAGE,
              delta: -targetLoss,
              createdAt: tickAt,
            });
          }

          if (attackerReturned > 0) {
            currentArmy.set(
              targetAttacker.id,
              (currentArmy.get(targetAttacker.id) ?? targetAttacker.army) +
                attackerReturned
            );

            await db.attackUnit.update({
              where: {
                id: targetUnit.id,
              },
              data: {
                resolvedAt: tickAt,
                defenderArmyAtBattleStart: null,
                resolvedAttackPower: targetLoss,
                resolvedDefensePower: 0,
                attackerSurvivors: targetUnit.armyAmount,
                attackerRetired: 0,
                attackerReturned,
                defenderLosses: 0,
                pointsLooted: 0,
                foodLooted: 0,
                armyLooted: 0,
              },
            });
            resolvedAttackUnits += 1;
          }

          resolvedBatchAttackUnitIds.add(targetUnit.id);
        }

        if ((currentHealth.get(target.id) ?? target.health) <= 0) {
          const winnerContribution =
            await db.homeOfABossDamageContribution.findFirst({
              where: {
                cycleId,
                bossGeneration: cycle.megaFortressDestroyCount,
              },
              orderBy: [
                { damage: "desc" },
                { firstDamagedAt: "asc" },
                { fortressId: "asc" },
              ],
              include: {
                fortress: {
                  select: {
                    id: true,
                    ownerId: true,
                    name: true,
                    commanderName: true,
                    points: true,
                    food: true,
                    army: true,
                  },
                },
              },
            });

          if (winnerContribution) {
            const reward = getHomeOfABossReward(target.maxHealth);

            currentPoints.set(
              winnerContribution.fortressId,
              (currentPoints.get(winnerContribution.fortressId) ??
                winnerContribution.fortress.points) + reward
            );
            currentFood.set(
              winnerContribution.fortressId,
              (currentFood.get(winnerContribution.fortressId) ??
                winnerContribution.fortress.food) + reward
            );
            currentArmy.set(
              winnerContribution.fortressId,
              (currentArmy.get(winnerContribution.fortressId) ??
                winnerContribution.fortress.army) + reward
            );
            scoreEvents.push({
              cycleId,
              fortressId: winnerContribution.fortressId,
              actorId: winnerContribution.fortress.ownerId,
              targetFortressId: target.id,
              eventType: ScoreEventType.MEGA_DESTROY_BONUS,
              delta: reward,
              createdAt: tickAt,
            });
            await db.raceAbilityActivation.create({
              data: {
                fortressId: winnerContribution.fortressId,
                kind: RaceAbilityKind.HOME_OF_A_BOSS_BUFF,
                activeFrom: tickAt,
                activeUntil: addHours(tickAt, HOME_OF_A_BOSS_BUFF_HOURS),
                usedAt: tickAt,
                expiresAt: addHours(tickAt, HOME_OF_A_BOSS_BUFF_HOURS),
                targetFortressId: target.id,
              },
            });
            const rewardReportUnit =
              targetUnits.find(
                (unit) =>
                  unit.attackerFortressId === winnerContribution.fortressId
              ) ??
              (await db.attackUnit.findFirst({
                where: {
                  cycleId,
                  targetFortressId: target.id,
                  attackerFortressId: winnerContribution.fortressId,
                  OR: [
                    {
                      resolvedAt: {
                        not: null,
                      },
                    },
                    {
                      recalledAt: {
                        not: null,
                      },
                    },
                  ],
                  cancelledAt: null,
                },
                orderBy: [
                  {
                    resolvedAt: "desc",
                  },
                  {
                    arrivesAt: "desc",
                  },
                  {
                    id: "desc",
                  },
                ],
                select: {
                  id: true,
                },
              }));

            if (rewardReportUnit) {
              await db.attackUnit.update({
                where: {
                  id: rewardReportUnit.id,
                },
                data: {
                  pointsLooted: reward,
                  foodLooted: reward,
                  armyLooted: reward,
                },
              });
            }
            const systemUser = await ensureNpcSystemUser(db);
            await db.chatMessage.create({
              data: {
                cycleId,
                authorId: systemUser.id,
                type: ChatMessageType.TEXT,
                body: getHomeOfABossDefeatAnnouncement({
                  fortressName: winnerContribution.fortress.name,
                  commanderName: winnerContribution.fortress.commanderName,
                  reward,
                  buffHours: HOME_OF_A_BOSS_BUFF_HOURS,
                  respawnHours: HOME_OF_A_BOSS_RESPAWN_HOURS,
                }),
                createdAt: tickAt,
              },
            });
            await db.cycle.update({
              where: {
                id: cycleId,
              },
              data: {
                crownedFortressId:
                  cycle.crownedFortressId ?? winnerContribution.fortressId,
                upgradesUnlockedAt: cycle.upgradesUnlockedAt ?? tickAt,
                homeOfABossRespawnsAt: addHours(
                  tickAt,
                  HOME_OF_A_BOSS_RESPAWN_HOURS
                ),
                megaFortressDestroyCount: {
                  increment: 1,
                },
              },
            });
          }

          currentHealth.set(target.id, 0);
          destroyedMegaTargets.add(target.id);
        }

        continue;
      }

      for (const targetUnit of targetUnits) {
        const targetAttacker = fortressLookup.get(
          targetUnit.attackerFortressId
        );
        const attackerReturned = targetUnit.armyAmount;

        if (targetAttacker && attackerReturned > 0) {
          const returnArrivesAt = getAttackArrivalAt({
            launchedAt: tickAt,
            origin: {
              mapX: target.mapX,
              mapY: target.mapY,
            },
            target: {
              mapX: targetAttacker.mapX,
              mapY: targetAttacker.mapY,
            },
            attackerRace: getEffectiveRace(targetAttacker),
            raceBuffTier: getFortressRaceBuffTier(targetAttacker),
            speedMultiplier:
              getDwarfSpeedMultiplier(targetAttacker) *
              getOrkSpeedMultiplier(targetAttacker),
          });

          await db.attackUnit.update({
            where: {
              id: targetUnit.id,
            },
            data: {
              recalledAt: tickAt,
              returnOriginMapX: target.mapX,
              returnOriginMapY: target.mapY,
              arrivesAt: returnArrivesAt,
              defenderArmyAtBattleStart: null,
              resolvedAttackPower: targetUnit.armyAmount,
              resolvedDefensePower: 0,
              attackerSurvivors: targetUnit.armyAmount,
              attackerRetired: 0,
              attackerReturned,
              defenderLosses: 0,
              pointsLooted: 0,
              foodLooted: 0,
              armyLooted: 0,
            },
          });
        } else {
          await db.attackUnit.update({
            where: {
              id: targetUnit.id,
            },
            data: {
              resolvedAt: tickAt,
              defenderArmyAtBattleStart: null,
              resolvedAttackPower: targetUnit.armyAmount,
              resolvedDefensePower: 0,
              attackerSurvivors: targetUnit.armyAmount,
              attackerRetired: 0,
              attackerReturned,
              defenderLosses: 0,
              pointsLooted: 0,
              foodLooted: 0,
              armyLooted: 0,
            },
          });
          resolvedAttackUnits += 1;
        }

        resolvedBatchAttackUnitIds.add(targetUnit.id);
      }

      continue;
    }

    if (!attacker || !target) {
      await db.attackUnit.update({
        where: {
          id: unit.id,
        },
        data: {
          resolvedAt: tickAt,
        },
      });

      resolvedAttackUnits += 1;
      resolvedBatchAttackUnitIds.add(unit.id);
      continue;
    }
    const defenderArmy = currentArmy.get(target.id) ?? target.army;
    const defenderGold = currentGold.get(target.id) ?? target.gold;
    const defenderFood = currentFood.get(target.id) ?? target.food;
    const defenderArmyAtBattleStart = defenderArmy;
    const attackerRace = getEffectiveRace(attacker);
    const defenderRace = getEffectiveRace(target);
    const attackerRaceBuffTier = getFortressRaceBuffTier(attacker);
    const defenderRaceBuffTier = getFortressRaceBuffTier(target);
    const attackerStim =
      !isSeasonFour &&
      attackerRace === "SPACE_MURINES" &&
      attackerRaceBuffTier >= 1 &&
      isRaceAbilityActive(
        attacker.raceAbilityActivations,
        RaceAbilityKind.SPACE_MURINE_STIM,
        tickAt
      );
    const defenderStim =
      !isSeasonFour &&
      defenderRace === "SPACE_MURINES" &&
      defenderRaceBuffTier >= 1 &&
      isRaceAbilityActive(
        target.raceAbilityActivations,
        RaceAbilityKind.SPACE_MURINE_STIM,
        tickAt
      );
    const attackerOrkCarryMultiplier =
      !isSeasonFour && attackerRace === "ORKS"
        ? getOrkBossOrderCarryMultiplier(attacker.orkBossOrders, tickAt)
        : 1;
    const outcome = calculateRaidOutcome({
      attackArmy: unit.armyAmount,
      attackerRace,
      defenderArmy,
      defenderDbLevel: target.level,
      defenderRace,
      defenderCastleSpecializations: countCastleSpecializations(
        target.castleUpgradeSpecializations
      ),
      attackPowerMultiplier: getCombatAttackPowerMultiplier({
        fortress: {
          ...attacker,
          race: attackerRace,
        },
        now: tickAt,
        targetFortressId: target.id,
        targetIsPlayerFortress: isPlayerCombatTarget(target),
        leaderboardTitleHolders,
        combatSurgedThisTick: dwarfCombatSurgedThisTick,
        enableWaaagh: attackerRaceBuffTier >= 2,
        enableDwarfGrudge: attackerRaceBuffTier >= 1,
        enableLegacyAbilities: !isSeasonFour,
      }),
      defensePowerMultiplier: getCombatDefensePowerMultiplier({
        fortress: {
          ...target,
          race: defenderRace,
        },
        now: tickAt,
        opponentFortressId: attacker.id,
        opponentIsPlayerFortress: isPlayerCombatTarget(attacker),
        combatSurgedThisTick: dwarfCombatSurgedThisTick,
        enableWaaagh: defenderRaceBuffTier >= 2,
        enableDwarfGrudge: defenderRaceBuffTier >= 1,
        enableLegacyAbilities: !isSeasonFour,
      }),
      preventAttackerCasualties: attackerStim,
      preventDefenderLosses: defenderStim,
      carryCapacityMultiplier: attackerOrkCarryMultiplier,
      defenderGold,
      defenderFood,
    });
    const stealsFromPlayerCastle =
      !target.isNpc && target.fortressKind === FortressKind.PLAYER;
    const castleLootMultiplier = stealsFromPlayerCastle
      ? getLeaderboardTitleCastleLootMultiplier(
          leaderboardTitleHolders,
          attacker.id
        )
      : 1;
    const goldLooted = Math.min(
      defenderGold,
      Math.floor(outcome.goldLooted * castleLootMultiplier)
    );
    const foodLooted = Math.min(
      defenderFood,
      Math.floor(outcome.foodLooted * castleLootMultiplier)
    );

    if (outcome.attackerReturned > 0) {
      const returnArrivesAt = getAttackArrivalAt({
        launchedAt: tickAt,
        origin: {
          mapX: target.mapX,
          mapY: target.mapY,
        },
        target: {
          mapX: attacker.mapX,
          mapY: attacker.mapY,
        },
        attackerRace: attackerRace,
        raceBuffTier: attackerRaceBuffTier,
        speedMultiplier:
          getDwarfSpeedMultiplier(attacker) * getOrkSpeedMultiplier(attacker),
        waaagh: getOrkWaaghActive(attacker),
      });

      await db.attackUnit.update({
        where: {
          id: unit.id,
        },
        data: {
          recalledAt: tickAt,
          returnOriginMapX: target.mapX,
          returnOriginMapY: target.mapY,
          arrivesAt: returnArrivesAt,
          defenderArmyAtBattleStart,
          resolvedAttackPower: outcome.attackPower,
          resolvedDefensePower: outcome.defensePower,
          attackerSurvivors: outcome.attackerSurvivors,
          attackerRetired: outcome.attackerRetired,
          attackerReturned: outcome.attackerReturned,
          defenderLosses: outcome.defenderLosses,
          pointsLooted: goldLooted,
          foodLooted,
          armyLooted: 0,
        },
      });
    } else {
      await db.attackUnit.update({
        where: {
          id: unit.id,
        },
        data: {
          resolvedAt: tickAt,
          defenderArmyAtBattleStart,
          resolvedAttackPower: outcome.attackPower,
          resolvedDefensePower: outcome.defensePower,
          attackerSurvivors: outcome.attackerSurvivors,
          attackerRetired: outcome.attackerRetired,
          attackerReturned: outcome.attackerReturned,
          defenderLosses: outcome.defenderLosses,
          pointsLooted: goldLooted,
          foodLooted,
          armyLooted: 0,
        },
      });
      resolvedAttackUnits += 1;
    }

    currentArmy.set(
      target.id,
      Math.max(0, defenderArmy - outcome.defenderLosses)
    );
    if (outcome.defenderLosses > 0) {
      currentUnitsKilled.set(
        attacker.id,
        (currentUnitsKilled.get(attacker.id) ?? attacker.unitsKilled) +
          outcome.defenderLosses
      );
    }
    const attackerLosses = Math.max(0, unit.armyAmount - outcome.attackerReturned);
    if (attackerLosses > 0 && !target.isNpc) {
      currentUnitsKilled.set(
        target.id,
        (currentUnitsKilled.get(target.id) ?? target.unitsKilled) +
          attackerLosses
      );
    }
    currentGold.set(
      attacker.id,
      (currentGold.get(attacker.id) ?? attacker.gold) + goldLooted
    );
    currentGold.set(target.id, Math.max(0, defenderGold - goldLooted));
    const attackerWaaagh =
      !isSeasonFour &&
      attackerRace === "ORKS" &&
      attackerRaceBuffTier >= 2 &&
      isRaceAbilityActive(
        attacker.raceAbilityActivations,
        RaceAbilityKind.ORK_WAAAGH,
        tickAt
      );
    const strongerTogether =
      attackerRace === "ORKS" &&
      attackerRaceBuffTier >= 1 &&
      outcome.defenderLosses > 0
        ? Math.floor(
            outcome.defenderLosses *
              getOrkStrongerTogetherRate({
                waaaghActive: attackerWaaagh,
                investments: attacker.orkWaaaghInvestments,
              })
          )
        : 0;
    currentFood.set(
      attacker.id,
      (currentFood.get(attacker.id) ?? attacker.food) + foodLooted
    );
    currentFood.set(target.id, Math.max(0, defenderFood - foodLooted));
    if (stealsFromPlayerCastle) {
      const stolenResources = goldLooted + foodLooted;

      if (stolenResources > 0) {
        currentResourcesStolen.set(
          attacker.id,
          (currentResourcesStolen.get(attacker.id) ??
            attacker.resourcesStolen) + stolenResources
        );
      }
    }
    if (strongerTogether > 0) {
      currentArmy.set(
        attacker.id,
        (currentArmy.get(attacker.id) ?? attacker.army) + strongerTogether
      );
    }

    if (
      outcome.outcome === "ATTACKER_WIN" &&
      isRealOrkPlayerFortress(attacker) &&
      !target.isNpc
    ) {
      await applyOrkScrapDelta({
        db,
        cycleId,
        fortressId: attacker.id,
        delta: getOrkDirectRaidScrap({
          defenderLosses: outcome.defenderLosses,
          goldLooted,
          foodLooted,
        }),
        reason: OrkScrapEventReason.DIRECT_RAID,
        now: tickAt,
        targetFortressId: target.id,
        attackUnitId: unit.id,
      });
    }

    if (goldLooted > 0) {
      scoreEvents.push(
        {
          cycleId,
          fortressId: target.id,
          actorId: attacker.ownerId,
          targetFortressId: target.id,
          eventType: ScoreEventType.ATTACK_TARGET,
          delta: -goldLooted,
          createdAt: tickAt,
        },
        {
          cycleId,
          fortressId: attacker.id,
          actorId: attacker.ownerId,
          targetFortressId: target.id,
          eventType: ScoreEventType.ATTACK_TARGET,
          delta: goldLooted,
          createdAt: tickAt,
        }
      );

      // Winner bonus: attacker gets bonus points for defeating enemy army
      if (
        outcome.outcome === "ATTACKER_WIN" &&
        outcome.defenderLosses > 0
      ) {
        const winnerBonus = Math.max(1, Math.floor(outcome.defenderLosses / 50));
        scoreEvents.push({
          cycleId,
          fortressId: attacker.id,
          actorId: attacker.ownerId,
          targetFortressId: target.id,
          eventType: ScoreEventType.ATTACK_TARGET,
          delta: winnerBonus,
          createdAt: tickAt,
        });
        currentPoints.set(
          attacker.id,
          (currentPoints.get(attacker.id) ?? 0) + winnerBonus
        );
      }
    }
  }

  const ownedTiles = await db.mapHexOwnership.findMany({
    where: {
      cycleId,
    },
    select: {
      ownerFortressId: true,
      tileId: true,
    },
  });

  // Load road data for road network bonus
  const roadTiles = new Set(
    (
      await db.mapHexRoad.findMany({
        where: { cycleId, level: { gte: 1 } },
        select: { tileId: true },
      })
    ).map((r) => r.tileId)
  );

  const tileGarrisons = await db.fortressGarrison.findMany({
    where: {
      cycleId,
      army: {
        gt: 0,
      },
      tileId: {
        in: ownedTiles.map((ownership) => ownership.tileId),
      },
    },
    orderBy: [{ army: "desc" }, { createdAt: "asc" }, { id: "asc" }],
    select: {
      id: true,
      tileId: true,
      fortressId: true,
      army: true,
      createdAt: true,
    },
  });
  type TileGarrisonBonusCandidate = {
    id: string;
    tileId: string;
    fortressId: string;
    army: number;
    createdAt: Date;
  };
  const garrisonsByTileId = new Map<string, TileGarrisonBonusCandidate[]>();

  for (const garrison of tileGarrisons) {
    const current = garrisonsByTileId.get(garrison.tileId) ?? [];

    current.push(garrison);
    garrisonsByTileId.set(garrison.tileId, current);
  }

  const tileBonusesByFortressId = new Map<
    string,
    { gold: number; points: number; food: number; army: number }
  >();

  for (const ownership of ownedTiles) {
    if (isHomeOfATile(ownership.tileId)) {
      continue;
    }

    const tile = getTileById(ownership.tileId);
    const bonus = getTileBonus(tile);
    const occupyingGarrison = (
      garrisonsByTileId.get(ownership.tileId) ?? []
    ).find((garrison) => garrison.fortressId !== ownership.ownerFortressId);
    const bonusFortressId =
      occupyingGarrison?.fortressId ?? ownership.ownerFortressId;
    const titleMultipliers = getLeaderboardTitleTileIncomeMultipliers(
      leaderboardTitleHolders,
      bonusFortressId,
      cycle.ruleset
    );
    const boostedBonus = {
      gold: Math.floor(bonus.gold * titleMultipliers.resource),
      points: Math.floor(
        bonus.points * titleMultipliers.resource * titleMultipliers.points
      ),
      food: Math.floor(bonus.food * titleMultipliers.resource),
      army: Math.floor(bonus.army * titleMultipliers.resource),
    };
    const current = tileBonusesByFortressId.get(bonusFortressId) ?? {
      gold: 0,
      points: 0,
      food: 0,
      army: 0,
    };

    tileBonusesByFortressId.set(bonusFortressId, {
      gold: current.gold + boostedBonus.gold,
      points:
        current.points +
        boostedBonus.points +
        (roadTiles.has(ownership.tileId) ? 1 : 0), // +1 pt/tick for road-connected tiles
      food: current.food + boostedBonus.food,
      army: current.army + boostedBonus.army,
    });
  }

  // ========================================================================
  // FORTRESS PRODUCTION PHASE
  // ========================================================================
  // Each fortress produces resources (gold, food, army) based on its
  // worker assignments, level, and specializations.
  //
  // This phase:
  // 1. Calculates base production using calculateTickProduction()
  // 2. Applies race ability modifiers (DWARF_ECONOMY_HALT, DWARF_ECONOMY_SURGE)
  // 3. Combines production with territory tile bonuses
  // 4. Records production in currentGold/currentFood/currentArmy maps
  // 5. Creates score events for non-zero production
  //
  // See castle-production.ts and balance.ts for production calculation details.
  // ========================================================================

  for (const fortress of fortresses) {
    if (fortress.isNpc) {
      continue;
    }

    // Calculate base fortress production (gold, food, army).
    // This is a pure function based on worker assignments, level, race, and specializations.
    const castleSpecializations = countCastleSpecializations(
      fortress.castleUpgradeSpecializations
    );
    const production = calculateTickProduction({
      ...fortress,
      race: getEffectiveRace(fortress),
      food: currentFood.get(fortress.id) ?? fortress.food,
      castleSpecializations,
    });

    // Check for DWARF race ability modifiers that affect economy
    const economyHalted =
      !isSeasonFour &&
      getEffectiveRace(fortress) === "DWARFS" &&
      (dwarfEconomyHaltedThisTick.has(fortress.id) ||
        isRaceAbilityActive(
          fortress.raceAbilityActivations,
          RaceAbilityKind.DWARF_ECONOMY_HALT,
          tickAt
        ));
    const economySurged =
      !isSeasonFour &&
      getEffectiveRace(fortress) === "DWARFS" &&
      (dwarfEconomySurgedThisTick.has(fortress.id) ||
        isRaceAbilityActive(
          fortress.raceAbilityActivations,
          RaceAbilityKind.DWARF_ECONOMY_SURGE,
          tickAt
        ));
    const homeBossEconomyBuff =
      !isSeasonFour &&
      hasHomeOfABossBuff(fortress.raceAbilityActivations, tickAt);

    const skillModifiers =
      isSeasonFour && getEffectiveRace(fortress)
        ? getSkillModifiers({
            race: getEffectiveRace(fortress),
            purchases: fortress.skillPurchases ?? [],
          })
        : null;
    const skillFoodBonus = Math.floor(
      (fortress.farmersAssigned / 10) *
        (skillModifiers?.foodPerTenFarmersBonus ?? 0)
    );
    const skillGoldBonus = Math.floor(
      (fortress.minersAssigned / 10) *
        (skillModifiers?.goldPerTenMinersBonus ?? 0)
    );
    const skillArmyBonus = Math.floor(
      (fortress.recruitersAssigned / 10) *
        (skillModifiers?.armyPerTenRecruitersBonus ?? 0)
    );
    const unicornEconomySurge =
      !isSeasonFour &&
      getEffectiveRace(fortress) === "UNSTABLE_UNICORNS" &&
      isRaceAbilityActive(
        fortress.raceAbilityActivations,
        RaceAbilityKind.UNICORN_ECONOMY_SURGE,
        tickAt
      );
    const economyMultiplier =
      (economySurged ? DWARF_DEEP_MINING_ECONOMY_MULTIPLIER : 1) *
      (unicornEconomySurge
        ? UNICORN_SHATTERED_REALITY_ECONOMY_MULTIPLIER
        : 1) *
      (homeBossEconomyBuff ? HOME_OF_A_BOSS_BUFF_MULTIPLIER : 1);

    // Apply race ability modifiers to production
    // DWARF_ECONOMY_HALT: reduces all production to 0
    // DWARF_ECONOMY_SURGE: multiplies production by DWARF_DEEP_MINING_ECONOMY_MULTIPLIER
    const producedGold = economyHalted
      ? 0
      : Math.floor((production.goldProduced + skillGoldBonus) * economyMultiplier);
    const producedFood = economyHalted
      ? 0
      : Math.floor((production.foodProduced + skillFoodBonus) * economyMultiplier);
    const recruitmentResult = economyHalted
      ? {
          unitsCreated: 0,
          newQueue:
            currentRecruitmentQueue.get(fortress.id) ??
            fortress.recruitmentQueue,
        }
      : processRecruitmentQueue(
          currentRecruitmentQueue.get(fortress.id) ?? fortress.recruitmentQueue,
          fortress.recruitersAssigned,
          getEffectiveRace(fortress),
          getCastleSpecializationMultiplier(
            castleSpecializations[CastleUpgradeSpecialization.MILITARY]
          ) * economyMultiplier
        );
    const armyProduced = recruitmentResult.unitsCreated + skillArmyBonus;

    const currentArmyValue = currentArmy.get(fortress.id) ?? fortress.army;
    // Calculate final food/army state after production, upkeep, and starvation.
    const activeArmyUpkeep = Math.floor(
      getArmyUpkeepCost(
        currentArmyValue,
        skillModifiers?.upkeepDiscountPercent ?? 0
      )
    );
    const foodBeforeUpkeep =
      (currentFood.get(fortress.id) ?? fortress.food) + producedFood;
    const starvationArmyLoss =
      !economyHalted &&
      fortress.fortressKind === FortressKind.PLAYER &&
      activeArmyUpkeep > 0 &&
      foodBeforeUpkeep < activeArmyUpkeep
        ? getStarvationArmyLoss(currentArmyValue)
        : 0;
    const foodAfterProduction = economyHalted
      ? (currentFood.get(fortress.id) ?? fortress.food)
      : Math.max(0, foodBeforeUpkeep - activeArmyUpkeep);

    const tileBonus = tileBonusesByFortressId.get(fortress.id) ?? {
      gold: 0,
      points: 0,
      food: 0,
      army: 0,
    };

    // Record produced resources in accumulator maps for database update
    currentGold.set(
      fortress.id,
      (currentGold.get(fortress.id) ?? fortress.gold) +
        producedGold +
        tileBonus.gold
    );
    currentPoints.set(
      fortress.id,
      (currentPoints.get(fortress.id) ?? 0) + tileBonus.points
    );
    currentFood.set(
      fortress.id,
      Math.max(0, foodAfterProduction + tileBonus.food)
    );
    currentArmy.set(
      fortress.id,
      Math.max(0, currentArmyValue - starvationArmyLoss) +
        armyProduced +
        tileBonus.army
    );
    currentRecruitmentQueue.set(fortress.id, recruitmentResult.newQueue);

    // Create score events for tile bonuses
    // Production from workers is recorded via GROW_TICK events (see fortress action handling)
    if (tileBonus.points > 0) {
      scoreEvents.push({
        cycleId,
        fortressId: fortress.id,
        actorId: fortress.ownerId,
        eventType: ScoreEventType.GROW_TICK,
        delta: tileBonus.points,
        createdAt: tickAt,
      });
    }
    // TODO: add a dedicated resource history model for food and army deltas.
  }

  const fortressUpdates: Array<{
    id: string;
    data: {
      points: number;
      unitsKilled: number;
      goblinsKilled: number;
      resourcesStolen: number;
      gold: number;
      food: number;
      army: number;
      recruitmentQueue: number;
      health: number;
    };
  }> = [];

  for (const fortress of fortresses) {
    const nextPoints = currentPoints.get(fortress.id) ?? fortress.points;
    const nextUnitsKilled =
      currentUnitsKilled.get(fortress.id) ?? fortress.unitsKilled;
    const nextGoblinsKilled =
      currentGoblinsKilled.get(fortress.id) ?? fortress.goblinsKilled;
    const nextResourcesStolen =
      currentResourcesStolen.get(fortress.id) ?? fortress.resourcesStolen;
    const nextGold = currentGold.get(fortress.id) ?? fortress.gold;
    const nextFood = currentFood.get(fortress.id) ?? fortress.food;
    const nextArmy = currentArmy.get(fortress.id) ?? fortress.army;
    const nextRecruitmentQueue =
      currentRecruitmentQueue.get(fortress.id) ?? fortress.recruitmentQueue;
    const nextHealth = currentHealth.get(fortress.id) ?? fortress.health;

    if (
      nextPoints === fortress.points &&
      nextUnitsKilled === fortress.unitsKilled &&
      nextGoblinsKilled === fortress.goblinsKilled &&
      nextResourcesStolen === fortress.resourcesStolen &&
      nextGold === fortress.gold &&
      nextFood === fortress.food &&
      nextArmy === fortress.army &&
      nextRecruitmentQueue === fortress.recruitmentQueue &&
      nextHealth === fortress.health
    ) {
      continue;
    }

    fortressUpdates.push({
      id: fortress.id,
      data: {
        points: nextPoints,
        unitsKilled: nextUnitsKilled,
        goblinsKilled: nextGoblinsKilled,
        resourcesStolen: nextResourcesStolen,
        gold: nextGold,
        food: nextFood,
        army: nextArmy,
        recruitmentQueue: nextRecruitmentQueue,
        health: nextHealth,
      },
    });
  }

  const fortressUpdateChunkSize = 25;
  for (let i = 0; i < fortressUpdates.length; i += fortressUpdateChunkSize) {
    const chunk = fortressUpdates.slice(i, i + fortressUpdateChunkSize);
    await Promise.all(
      chunk.map((update) =>
        db.fortress.update({
          where: { id: update.id },
          data: update.data,
        })
      )
    );
  }

  if (scoreEvents.length > 0) {
    await db.scoreEvent.createMany({
      data: scoreEvents,
    });
  }

  // === BATTALION RECRUITMENT ===
  if (true) { // Always run for Season 4 test season
    // Build recruiters map from fortress data.
    const recruitersByFortress = new Map<string, number>();
    const raceByFortress = new Map<string, string | null>();
    const levelByFortress = new Map<string, number>();
    const barracksByFortress = new Map<string, number>();
    const goldByFortress = new Map<string, number>();
    const maxArmyByFortress = new Map<string, number>();
    const guardPercentByFortress = new Map<string, number>();
    const ownedTilesByFortress = new Map<string, string[]>();

    for (const fortress of fortresses) {
      if (fortress.isNpc) continue;
      const castleSpecializations = countCastleSpecializations(
        fortress.castleUpgradeSpecializations
      );
      recruitersByFortress.set(fortress.id, fortress.recruitersAssigned);
      raceByFortress.set(fortress.id, fortress.race);
      levelByFortress.set(fortress.id, fortress.level);
      barracksByFortress.set(
        fortress.id,
        castleSpecializations[CastleUpgradeSpecialization.MILITARY],
      );
      goldByFortress.set(fortress.id, currentGold.get(fortress.id) ?? fortress.gold);
      const policy = warPolicies.find((p) => p.fortressId === fortress.id);
      maxArmyByFortress.set(fortress.id, policy?.maxArmySize ?? 500);
      guardPercentByFortress.set(fortress.id, policy?.guardPercent ?? 30);
      ownedTilesByFortress.set(
        fortress.id,
        mapHexOwnerships
          .filter((ownership) => ownership.ownerFortressId === fortress.id)
          .map((ownership) => ownership.tileId),
      );
    }

    const fortressPositionsById = new Map(
      fortresses.map((fortress) => [
        fortress.id,
        { mapX: fortress.mapX, mapY: fortress.mapY },
      ]),
    );

    const recruitedArmyByFortress = await processBattalionRecruitment({
      ctx: { db, cycleId, now: tickAt },
      recruitersByFortress,
      raceByFortress,
      levelByFortress,
      barracksLevelByFortress: barracksByFortress,
      goldByFortress,
      maxArmyByFortress,
      skillPurchasesByFortress: new Map(
        fortresses.map((fortress) => [
          fortress.id,
          fortress.skillPurchases ?? [],
        ])
      ),
      currentArmyByFortress: new Map(
        fortresses.map((fortress) => [
          fortress.id,
          currentArmy.get(fortress.id) ?? fortress.army,
        ])
      ),
      fortressPositionsById,
    });

    await processBattalionGuard({
      ctx: { db, cycleId, now: tickAt },
      guardPercentByFortress,
      ownedTilesByFortress,
      fortressPositionsById,
    });

    await recordIdleBattalionRoadCrossings({
      db,
      cycleId,
      now: tickAt,
    });

    for (const [fortressId, army] of recruitedArmyByFortress) {
      currentArmy.set(fortressId, army);
    }

    if (recruitedArmyByFortress.size > 0) {
      await Promise.all(
        Array.from(recruitedArmyByFortress.entries()).map(
          ([fortressId, army]) =>
            db.fortress.update({
              where: { id: fortressId },
              data: { army },
            })
        )
      );
    }

    // Apply tiered battalion upkeep (replaces flat food cost).
    const allBattalionsAfter = await db.battalion.findMany({
      where: { cycleId },
    });
    for (const fortress of fortresses) {
      if (fortress.isNpc) continue;
      const bnList = allBattalionsAfter.filter(
        (b) => b.fortressId === fortress.id,
      );
      if (bnList.length === 0) continue;

      const { processUpkeepTick } = await import("./upkeep");
      const upkeepResult = processUpkeepTick({
        battalions: bnList.map((b) => ({
          id: b.id,
          name: b.name,
          size: b.size,
          maxSize: b.maxSize,
          tier: b.tier as 0 | 1 | 2 | 3,
          xp: b.xp,
          readyAt: b.readyAt?.getTime() ?? null,
          stance: b.stance as any,
          garrisonedAt: b.garrisonedAt,
          stanceLockedUntil: b.stanceLockedUntil?.getTime() ?? null,
        })),
        food: currentFood.get(fortress.id) ?? fortress.food,
        gold: currentGold.get(fortress.id) ?? fortress.gold,
        upkeepDiscountPercent:
          fortress.race && isFortressRace(fortress.race)
            ? getSkillModifiers({
                race: fortress.race,
                purchases: fortress.skillPurchases ?? [],
              }).upkeepDiscountPercent
            : 0,
      });

      // Apply upkeep results.
      currentFood.set(fortress.id, upkeepResult.foodPaid);
      currentGold.set(fortress.id, upkeepResult.goldPaid);

      // Write battalion size changes from desertion.
      for (const bn of upkeepResult.battalions) {
        if (bn.size !== bnList.find((b) => b.id === bn.id)?.size) {
          await db.battalion.update({
            where: { id: bn.id },
            data: { size: bn.size },
          });
        }
      }
    }
  }

  // === BATTLEFIELD RESOLUTION PHASE ===
  // Only now, after all arrivals are processed, resolve battlefields.
  const battlefieldResult = await processActiveBattlefields({
    db,
    cycleId,
    tickAt,
  });

  if (isSeasonFour) {
    await finalizeSeasonFourCampaigns({ db, cycleId, tickAt });
  }

  // Apply garrison maintenance drain.
  // Unicorn garrisons drain every other tick to support the new tile-holding loop.
  await db.fortressGarrison.updateMany({
    where: {
      cycleId,
      army: {
        gt: 0,
      },
      maintenanceDrains: true,
      fortress: {
        race: {
          not: "UNSTABLE_UNICORNS",
        },
      },
    },
    data: {
      army: {
        decrement: 1,
      },
    },
  });

  if (tickAt.getUTCMinutes() % 2 === 0) {
    await db.fortressGarrison.updateMany({
      where: {
        cycleId,
        army: {
          gt: 0,
        },
        maintenanceDrains: true,
        fortress: {
          race: "UNSTABLE_UNICORNS",
        },
      },
      data: {
        army: {
          decrement: 1,
        },
      },
    });
  }

  // Delete garrisons with 0 army
  await db.fortressGarrison.deleteMany({
    where: {
      cycleId,
      army: {
        lte: 0,
      },
    },
  });

  // === BATTALION COMBAT RECONCILIATION ===
  // After all combat resolves, reconcile battalion sizes with actual fortress.army.
  // Distribues combat losses proportionally across battalions.
  // Runs every tick, so multi-tick battles update incrementally.
  // Kill tracking (unitsKilled) is handled separately by the existing combat code.
  // Always reconcile battalion casualties (not gated — needed for all cycles).
  {
    const postCombatArmy = new Map<string, number>();
    const preCombatArmy = new Map<string, number>();

    for (const fortress of fortresses) {
      if (fortress.isNpc) continue;
      const post = currentArmy.get(fortress.id) ?? fortress.army;
      const pre = fortress.army;
      if (post !== pre) {
        postCombatArmy.set(fortress.id, post);
        preCombatArmy.set(fortress.id, pre);
      }
    }

    if (postCombatArmy.size > 0) {
      await reconcileBattalionCasualties({
        ctx: { db, cycleId },
        currentArmyByFortress: postCombatArmy,
        previousArmyByFortress: preCombatArmy,
      });
    }

  }

  return {
    processed: true,
    scoreEventsCreated:
      scoreEvents.length +
      battlefieldResult.scoreEventsCreated +
      convoyScoreEventsCreated,
    launchedAttackUnits: 0,
    resolvedAttackUnits: resolvedAttackUnits + battlefieldResult.resolved,
  };
}

export async function runGameTick({
  now = new Date(),
  db = prisma,
  maxCatchUpMinutes = getConfiguredMaxCatchUpMinutes(),
}: {
  now?: Date;
  db?: PrismaClient;
  maxCatchUpMinutes?: number | null;
} = {}): Promise<TickSummary> {
  try {
    await ensureBattlefieldPointRewardColumn(db);
    await ensureHomeOfABossSchema(db);
    await ensureRaceSchemaReadiness(db);
  } catch (error) {
    throw new TickRunnerError({
      stage: "schema-preflight",
      now,
      cause: error,
    });
  }

  const summary: TickSummary = {
    restartedRegistrationCycles: 0,
    testingCyclesStarted: 0,
    testingCyclesCompleted: 0,
    activatedCycles: 0,
    resolvedCycles: 0,
    resolvedCommunityWishVotes: 0,
    nextRegistrationCyclesCreated: 0,
    processedMinutes: 0,
    skippedCatchUpMinutes: 0,
    scoreEventsCreated: 0,
    launchedAttackUnits: 0,
    resolvedAttackUnits: 0,
  };

  const expiredRegistrationCycles = await db.cycle.findMany({
    where: {
      status: CycleStatus.REGISTRATION,
      OR: [
        {
          testingStartedAt: {
            lte: now,
          },
        },
        {
          registrationEndsAt: {
            lte: now,
          },
        },
      ],
    },
    orderBy: {
      registrationEndsAt: "asc",
    },
    select: {
      id: true,
    },
  });

  const communityWishResolution = await resolveExpiredCommunityWishVotes({
    now,
    db,
  });
  summary.resolvedCommunityWishVotes = communityWishResolution.resolved;

  for (const cycle of expiredRegistrationCycles) {
    try {
      if (await restartEmptyRegistrationCycle(cycle.id, now, db)) {
        summary.restartedRegistrationCycles += 1;
        continue;
      }
    } catch (error) {
      throw new TickRunnerError({
        stage: "restart-registration",
        cycleId: cycle.id,
        now,
        cause: error,
      });
    }

    try {
      if (await startTestingCycle(cycle.id, now, db)) {
        summary.testingCyclesStarted += 1;
      }
    } catch (error) {
      throw new TickRunnerError({
        stage: "start-testing-cycle",
        cycleId: cycle.id,
        now,
        cause: error,
      });
    }
  }

  const expiredTestingCycles = await db.cycle.findMany({
    where: {
      status: CycleStatus.TESTING,
      testingEndsAt: {
        lte: now,
      },
    },
    orderBy: {
      testingEndsAt: "asc",
    },
    select: {
      id: true,
    },
  });

  for (const cycle of expiredTestingCycles) {
    try {
      if (await completeTestingCycle(cycle.id, now, db)) {
        summary.testingCyclesCompleted += 1;
        summary.activatedCycles += 1;
      }
    } catch (error) {
      throw new TickRunnerError({
        stage: "complete-testing-cycle",
        cycleId: cycle.id,
        now,
        cause: error,
      });
    }
  }

  const activeCycles = await db.cycle.findMany({
    where: {
      status: {
        in: [CycleStatus.TESTING, CycleStatus.ACTIVE],
      },
      activeStartedAt: {
        not: null,
      },
    },
    orderBy: {
      activeStartedAt: "asc",
    },
    select: {
      id: true,
      status: true,
      testingStartedAt: true,
      testingEndsAt: true,
      activeStartedAt: true,
      activeEndsAt: true,
    },
  });

  for (const cycle of activeCycles) {
    const gameplayStartedAt =
      cycle.status === CycleStatus.TESTING
        ? cycle.testingStartedAt
        : cycle.activeStartedAt;

    if (!gameplayStartedAt) {
      continue;
    }

    let lastProcessedTick: { tickAt: Date } | null;

    try {
      lastProcessedTick = await db.gameTick.findFirst({
        where: {
          cycleId: cycle.id,
        },
        orderBy: {
          tickAt: "desc",
        },
        select: {
          tickAt: true,
        },
      });
    } catch (error) {
      throw new TickRunnerError({
        stage: "load-last-processed-tick",
        cycleId: cycle.id,
        now,
        cause: error,
      });
    }

    const nextTickAt = lastProcessedTick
      ? addMinutes(lastProcessedTick.tickAt, 1)
      : getFirstTickAt(gameplayStartedAt);
    const lastDueTickAt = getLastDueTickAt(
      {
        ...cycle,
        activeStartedAt: gameplayStartedAt,
      },
      now
    );

    if (lastDueTickAt && nextTickAt <= lastDueTickAt) {
      const totalDueMinutes = countDueMinutes(nextTickAt, lastDueTickAt);
      const effectiveLastDueTickAt =
        maxCatchUpMinutes === null
          ? lastDueTickAt
          : addMinutes(
              nextTickAt,
              Math.min(totalDueMinutes, maxCatchUpMinutes) - 1
            );
      const skippedMinutes =
        maxCatchUpMinutes === null
          ? 0
          : Math.max(0, totalDueMinutes - maxCatchUpMinutes);

      if (skippedMinutes > 0) {
        summary.skippedCatchUpMinutes =
          (summary.skippedCatchUpMinutes ?? 0) + skippedMinutes;
        console.warn(
          JSON.stringify({
            event: "tick-catch-up-capped",
            cycleId: cycle.id,
            nextTickAt: nextTickAt.toISOString(),
            lastDueTickAt: lastDueTickAt.toISOString(),
            processedThisRun: maxCatchUpMinutes,
            remainingBacklogMinutes: skippedMinutes,
          })
        );
      }

      for (
        let tickAt = nextTickAt;
        tickAt <= effectiveLastDueTickAt;
        tickAt = addMinutes(tickAt, 1)
      ) {
        let result: ProcessCycleTickResult;

        try {
          result = await processCycleTick(cycle.id, tickAt, now, db);
        } catch (error) {
          throw new TickRunnerError({
            stage: "process-minute",
            cycleId: cycle.id,
            tickAt,
            now,
            cause: error,
          });
        }

        if (result.processed) {
          summary.processedMinutes += 1;
          summary.scoreEventsCreated += result.scoreEventsCreated;
          summary.launchedAttackUnits += result.launchedAttackUnits;
          summary.resolvedAttackUnits += result.resolvedAttackUnits;
        }
      }
    }

    let resolution: {
      resolved: boolean;
      createdNextCycle: boolean;
    };

    try {
      resolution = await resolveExpiredActiveCycle(cycle.id, now, db);
    } catch (error) {
      throw new TickRunnerError({
        stage: "resolve-active-cycle",
        cycleId: cycle.id,
        now,
        cause: error,
      });
    }

    if (resolution.resolved) {
      summary.resolvedCycles += 1;
    }

    if (resolution.createdNextCycle) {
      summary.nextRegistrationCyclesCreated += 1;
    }
  }

  return summary;
}
