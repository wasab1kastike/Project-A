import { prisma } from "@/lib/prisma";
import {
  ArmyOrderStatus,
  ArmyOrderType,
  CastleUpgradeSpecialization,
  CommunityWishStatus,
  CycleStatus,
  FortressKind,
  OrkBossOrderKind,
  OrkWaaaghInvestmentKind,
  RaceAbilityKind,
  TerritoryCampaignStatus,
  NukeComponentRoundStatus,
  type PrismaClient,
} from "@/lib/prisma-client";
import {
  ACTIVE_PLAYER_CAP,
  MAX_SIMULTANEOUS_ATTACKS_BASE,
  getActiveLocationShuffleCost,
} from "./constants";
import {
  calculateTickProduction,
  getDisplayedCastleLevel,
  getFortressDefenseMultiplier,
  getFortressPopulation,
} from "./balance";
import {
  canFortressLevelUp,
  getFortressAttackDamage,
  getFortressUpgradeCost,
  getFortressUpgradeDurationMinutes,
  getMaxSimultaneousAttacks,
} from "./upgrades";
import {
  getRaceBuffTier,
  getHelsinkiDayKey,
  getHelsinkiHourKey,
  getRaceTierTileCount,
  getUnicornShatteredRealityAvailability,
  getUnicornTeleportClaimAvailability,
} from "./race-buffs";
import { addHours } from "./time";
import { countCastleSpecializations } from "./specializations";
import { ORK_BOSS_ORDER_CONFIG, ORK_WAAAGH_INVESTMENT_CONFIG } from "./orks";
import {
  getTileById,
  isHomeOfATile,
  isTileConnectedToFortressOrOwnedTiles,
  sumTileBonuses,
} from "./territory";
import {
  ensureBattlefieldPointRewardColumn,
  ensureBattalionWarSchema,
  ensureCommanderRegistrationColumn,
  ensureHomeOfABossSchema,
  ensureRaceSchemaReadiness,
} from "./schema-guards";
import { isSeasonFourRuleset } from "./rulesets";
import {
  getDoctrineChangeAvailableAt,
  getDoctrineChangeBlockedReason,
  getDoctrineDefinition,
  getDoctrineEffectPercent,
  getDoctrineTier,
  getDoctrineOptionsForRace,
} from "./doctrines";
import { getEarnedSkillPoints } from "./race-skill-service";
import { getSkillModifiers } from "./race-skill-effects";
import { CAMPAIGN_SIEGE_THRESHOLD } from "./campaigns";
import {
  TILE_PRESSURE_CLAIM_THRESHOLD,
  allocatePressureAcrossTargets,
  calculatePressureOutput,
  getDistanceAdjustedTilePressureClaimThreshold,
  getTilePressurePriorityLimit,
  getTilePressurePrioritySlot,
  getPressureTargetBlockedReason,
  sortTilePressureQueue,
} from "./tile-pressure";
import {
  EMPTY_NUKE_COMPONENT_CARGO,
  calculateCompleteNukeCount,
  getNukeBiddingWindowForDate,
  getNukeComponentLabel,
  getNukeRoundState,
  NUKE_COMPONENT_KINDS,
  NUKE_LAUNCH_GOLD_COST,
  type NukeComponentCargo,
} from "./nukes";
import { getTradeWagonResourceLimit } from "./trading";

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

function getDisplayName(name: string, isSlayerOfA: boolean) {
  void isSlayerOfA;
  return name;
}

async function getFortressLocationShuffleCount(
  db: PrismaClient,
  fortressId: string
) {
  try {
    const rows = await db.$queryRaw<Array<{ locationShuffleCount: number }>>`
      SELECT "locationShuffleCount"
      FROM "Fortress"
      WHERE "id" = ${fortressId}
      LIMIT 1
    `;

    return rows[0]?.locationShuffleCount ?? 0;
  } catch (error) {
    console.warn("Failed to read fortress location shuffle count", {
      fortressId,
      error,
    });
    return 0;
  }
}

export type CastlePageState = Awaited<ReturnType<typeof getCastlePageState>>;

export async function getCastlePageState({
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
    ensureRaceSchemaReadiness(db),
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
          mapX: true,
          mapY: true,
          points: true,
          gold: true,
          level: true,
          food: true,
          army: true,
          recruitmentQueue: true,
          minersAssigned: true,
          farmersAssigned: true,
          recruitersAssigned: true,
          pressureWorkersAssigned: true,
          race: true,
          doctrine: true,
          doctrineChangedAt: true,
          fortressKind: true,
          lootCampVariant: true,
          expiresAt: true,
          unicornDecoySourceFortressId: true,
          unicornDecoyLevel: true,
          currentAction: true,
          targetFortressId: true,
          isNpc: true,
          health: true,
          maxHealth: true,
          joinedAt: true,
          skillPurchases: {
            select: { nodeKey: true },
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
            where: {
              activeUntil: {
                gt: now,
              },
            },
            orderBy: [{ activeUntil: "desc" }, { id: "desc" }],
            take: 1,
            select: {
              id: true,
              kind: true,
              scrapCost: true,
              goldCost: true,
              activeFrom: true,
              activeUntil: true,
            },
          },
          orkWaaaghInvestments: {
            where: {
              waaaghActivation: {
                kind: RaceAbilityKind.ORK_WAAAGH,
                activeFrom: {
                  lte: now,
                },
                activeUntil: {
                  gt: now,
                },
              },
            },
            select: {
              kind: true,
              waaaghActivationId: true,
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
              targetFortress: {
                select: {
                  name: true,
                },
              },
              runeFortressId: true,
              runeFortress: {
                select: {
                  health: true,
                  army: true,
                },
              },
            },
          },
          dwarfGrudges: {
            orderBy: [{ slot: "asc" }, { id: "asc" }],
            select: {
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
          unicornTemporaryTeleports: {
            where: {
              returnedAt: null,
            },
            orderBy: [{ returnAt: "asc" }, { id: "asc" }],
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
          garrisons: {
            select: {
              id: true,
              army: true,
              tileId: true,
              createdAt: true,
            },
          },
          battalions: {
            select: {
              id: true,
              name: true,
              size: true,
              maxSize: true,
              tier: true,
              xp: true,
              readyAt: true,
              stance: true,
              mode: true,
              garrisonedAt: true,
              assignments: {
                select: {
                  frontId: true,
                },
              },
            },
          },
          warPolicies: {
            select: {
              id: true,
              maxArmySize: true,
              guardPercent: true,
              defaultAggression: true,
              allianceSupportAttack: true,
              allianceSupportDefense: true,
              allianceSupportPercent: true,
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
          unicornDecoySourceFortress: {
            select: {
              id: true,
              commanderName: true,
              name: true,
              points: true,
              level: true,
              race: true,
            },
          },
        },
      },
      attackUnits: {
        where: {
          resolvedAt: null,
          recalledAt: null,
        },
        select: {
          attackerFortress: {
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
      playerSummary: null,
      availableTargets: [],
      nukeState: null,
    };
  }

  const isSeasonFour = isSeasonFourRuleset(cycle.ruleset);

  const playerFortresses = cycle.fortresses.filter(
    (fortress) => !fortress.isNpc
  );
  const remainingSlots = Math.max(
    0,
    ACTIVE_PLAYER_CAP - playerFortresses.length
  );
  const playerFortress =
    playerFortresses.find((fortress) => fortress.ownerId === userId) ?? null;
  const targetLookup = new Map(
    cycle.fortresses.map((fortress) => [fortress.id, fortress])
  );
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
  const latestHistory =
    cycle.status === CycleStatus.REGISTRATION
      ? await db.cycleHistory.findFirst({
          where: {
            cycleId: {
              not: cycle.id,
            },
          },
          orderBy: {
            endedAt: "desc",
          },
          select: {
            communityWishStatus: true,
            communityWishProposalEndsAt: true,
            communityWishVotingEndsAt: true,
          },
        })
      : null;
  const raceSelectionLockedByCommunityWish =
    latestHistory?.communityWishStatus === CommunityWishStatus.OPEN
      ? latestHistory.communityWishVotingEndsAt !== null &&
        latestHistory.communityWishVotingEndsAt > now
      : latestHistory?.communityWishStatus ===
            CommunityWishStatus.PROPOSALS_OPEN &&
        latestHistory.communityWishProposalEndsAt !== null &&
        latestHistory.communityWishProposalEndsAt > now;
  const canSelectRace =
    playerFortress?.race === null &&
    (registrationOpen || gameplayOpen) &&
    !raceSelectionLockedByCommunityWish;
  const playerOwnedTileBiomes = playerFortress
    ? (
        await db.mapHexOwnership.findMany({
          where: {
            cycleId: cycle.id,
            ownerFortressId: playerFortress.id,
          },
          select: {
            tileId: true,
          },
        })
      )
        .filter((ownership) => !isHomeOfATile(ownership.tileId))
        .map((ownership) => getTileById(ownership.tileId)?.biome ?? null)
        .filter((biome): biome is NonNullable<typeof biome> => biome !== null)
    : [];
  const allianceRelations = playerFortress
    ? await db.diplomacyRelation.findMany({
        where: {
          cycleId: cycle.id,
          status: "ALLIED",
          OR: [
            { fortressAId: playerFortress.id },
            { fortressBId: playerFortress.id },
          ],
        },
        select: {
          fortressAId: true,
          fortressBId: true,
          allianceTrustTier: true,
        },
      })
    : [];
  const alliedFortressIds = new Set(
    allianceRelations.map((relation) =>
      relation.fortressAId === playerFortress?.id
        ? relation.fortressBId
        : relation.fortressAId,
    ),
  );
  const [allianceBattlefields, outgoingAllianceReinforcements] = playerFortress
    ? await Promise.all([
        alliedFortressIds.size > 0
          ? db.battlefield.findMany({
              where: {
                cycleId: cycle.id,
                status: "ACTIVE",
                OR: [
                  { attackerBannerFortressId: { in: [...alliedFortressIds] } },
                  { defenderBannerFortressId: { in: [...alliedFortressIds] } },
                ],
              },
              orderBy: [{ startedAt: "desc" }, { id: "desc" }],
              take: 8,
              select: {
                id: true,
                targetTileId: true,
                targetFortressId: true,
                attackerBannerFortressId: true,
                defenderBannerFortressId: true,
                attackerArmyRemaining: true,
                defenderArmyRemaining: true,
              },
            })
          : [],
        db.attackUnit.findMany({
          where: {
            cycleId: cycle.id,
            attackerFortressId: playerFortress.id,
            reinforcementBattlefieldId: { not: null },
            resolvedAt: null,
            cancelledAt: null,
          },
          orderBy: [{ arrivesAt: "asc" }, { id: "asc" }],
          take: 8,
          select: {
            id: true,
            armyAmount: true,
            arrivesAt: true,
            reinforcementSide: true,
            reinforcementBattlefield: {
              select: {
                id: true,
                targetTileId: true,
                attackerBannerFortressId: true,
                defenderBannerFortressId: true,
              },
            },
          },
        }),
      ])
    : [[], []];
  const playerOwnedTileCount = getRaceTierTileCount({
    race: playerFortress?.race,
    ownedTileBiomes: playerOwnedTileBiomes,
  });

  const raceBuffTier = getRaceBuffTier({
    activeStartedAt: cycle.activeStartedAt,
    now,
    isActiveSeason: cycle.status === CycleStatus.ACTIVE,
    race: playerFortress?.race ?? null,
    ownedTileBiomes: playerOwnedTileBiomes,
  });
  const displayedRaceTier = isSeasonFour
    ? getDoctrineTier({
        race: playerFortress?.race,
        ownedTileBiomes: playerOwnedTileBiomes,
      })
    : raceBuffTier;
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
      fortress: {
        select: {
          id: true,
          name: true,
          commanderName: true,
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
    ? playerFortress.raceAbilityActivations.find(
        (activation) =>
          activation.kind === RaceAbilityKind.DWARF_RUNE_GRUDGES &&
          activation.consumedAt === null &&
          activation.activeUntil > now
      ) ?? null
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
  const ownedNormalTiles = playerFortress
    ? (
        await db.mapHexOwnership.findMany({
          where: {
            cycleId: cycle.id,
            ownerFortressId: playerFortress.id,
          },
          select: {
            tileId: true,
          },
        })
      )
        .filter((ownership) => !isHomeOfATile(ownership.tileId))
        .map((ownership) => getTileById(ownership.tileId))
        .filter((tile): tile is NonNullable<typeof tile> => tile !== null)
    : [];
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
  const playerSkillModifiers =
    playerFortress && isSeasonFour
      ? getSkillModifiers({
          race: playerFortress.race,
          purchases: playerFortress.skillPurchases,
        })
      : null;
  const skillPopulationBonus =
    (playerSkillModifiers?.populationBonus ?? 0) +
    (playerSkillModifiers?.populationPerOwnedTile ?? 0) *
      ownedNormalTiles.length;
  const seasonFourRecords =
    playerFortress && isSeasonFour
      ? await Promise.all([
          db.tilePressurePriority.findMany({
            where: {
              cycleId: cycle.id,
              fortressId: playerFortress.id,
            },
            select: {
              tileId: true,
              weight: true,
            },
            orderBy: [{ weight: "desc" }, { createdAt: "asc" }, { tileId: "asc" }],
          }),
          db.tilePressureState.findMany({
            where: {
              cycleId: cycle.id,
              fortressId: playerFortress.id,
              pressure: {
                gt: 0,
              },
            },
            select: {
              tileId: true,
              pressure: true,
            },
          }),
          db.mapHexOwnership.findMany({
            where: {
              cycleId: cycle.id,
            },
            select: {
              tileId: true,
              ownerFortressId: true,
            },
          }),
          db.armyOrder.findMany({
            where: {
              cycleId: cycle.id,
              fortressId: playerFortress.id,
              status: ArmyOrderStatus.ACTIVE,
            },
            select: {
              id: true,
              type: true,
              targetTileId: true,
              committedArmy: true,
            },
            orderBy: {
              createdAt: "asc",
            },
          }),
          db.territoryCampaign.findMany({
            where: {
              cycleId: cycle.id,
              attackerFortressId: playerFortress.id,
              status: {
                in: [
                  TerritoryCampaignStatus.BUILDING,
                  TerritoryCampaignStatus.SIEGE_WARNING,
                  TerritoryCampaignStatus.ENGAGED,
                ],
              },
            },
            select: {
              id: true,
              status: true,
              targetTileId: true,
              progress: true,
              responseEndsAt: true,
              armyOrder: {
                select: {
                  id: true,
                  status: true,
                  committedArmy: true,
                },
              },
              defenderFortress: {
                select: {
                  name: true,
                },
              },
            },
            orderBy: {
              createdAt: "asc",
            },
          }),
        ])
      : null;
  const pressurePriorities = seasonFourRecords?.[0] ?? [];
  const pressureStates = seasonFourRecords?.[1] ?? [];
  const ownerByTileId = new Map(
    (seasonFourRecords?.[2] ?? []).map((ownership) => [
      ownership.tileId,
      ownership.ownerFortressId,
    ])
  );
  const activeArmyOrders = seasonFourRecords?.[3] ?? [];
  const campaigns = seasonFourRecords?.[4] ?? [];
  const pressureOutput = playerFortress
    ? calculatePressureOutput({
        pressureWorkersAssigned: playerFortress.pressureWorkersAssigned,
      })
    : 0;
  const ownedNormalTileIds = ownedNormalTiles.map((tile) => tile.id);
  const priorityLimit = playerFortress
    ? getTilePressurePriorityLimit(playerFortress)
    : 0;
  const orderedPressurePriorities = sortTilePressureQueue(pressurePriorities);
  const legalNeutralPressurePriorities =
    playerFortress === null
      ? []
      : orderedPressurePriorities.filter(
          (priority) =>
            !ownerByTileId.has(priority.tileId) &&
            getPressureTargetBlockedReason({
              tile: getTileById(priority.tileId),
              tileId: priority.tileId,
              ownerFortressId: null,
              fortress: playerFortress,
              ownedTileIds: ownedNormalTileIds,
              isHomeOfA: isHomeOfATile,
              isConnected: ({ tileId, ownedTileIds }) =>
                isTileConnectedToFortressOrOwnedTiles({
                  tileId,
                  fortress: playerFortress,
                  ownedTileIds,
                }),
            }) === null
        );
  const priorityTileIds = new Set(
    orderedPressurePriorities.map((priority) => priority.tileId)
  );
  const progressByTileId = new Map(
    pressureStates.map((state) => [state.tileId, state.pressure])
  );
  const priorityQueue = orderedPressurePriorities.map((priority) => {
    const ownerFortressId = ownerByTileId.get(priority.tileId) ?? null;
    const pressureThreshold = playerFortress
      ? getDistanceAdjustedTilePressureClaimThreshold({
          isSeasonFour,
          fortress: playerFortress,
          tileId: priority.tileId,
        })
      : TILE_PRESSURE_CLAIM_THRESHOLD;

    return {
      tileId: priority.tileId,
      rank: getTilePressurePrioritySlot({
        weight: priority.weight,
        limit: priorityLimit,
      }),
      ownerFortressId,
      targetKind: ownerFortressId ? "WAR" : "EXPANSION",
      progress: progressByTileId.get(priority.tileId) ?? 0,
      pressureThreshold,
    };
  });
  const activeNeutralPriorities = legalNeutralPressurePriorities.slice(0, 1);
  const allocationsByTileId = new Map(
    allocatePressureAcrossTargets({
      pressure: pressureOutput,
      targets: activeNeutralPriorities,
    }).map((allocation) => [allocation.tileId, allocation.pressure])
  );
  const leadingPriority =
    activeNeutralPriorities.reduce<{
      tileId: string;
      progress: number;
      outputPerTick: number;
      rank: number;
      pressureThreshold: number;
    } | null>((leader, priority) => {
      const candidate = {
        tileId: priority.tileId,
        progress: progressByTileId.get(priority.tileId) ?? 0,
        outputPerTick: allocationsByTileId.get(priority.tileId) ?? 0,
        rank: getTilePressurePrioritySlot({
          weight: priority.weight,
          limit: priorityLimit,
        }),
        pressureThreshold: playerFortress
          ? getDistanceAdjustedTilePressureClaimThreshold({
              isSeasonFour,
              fortress: playerFortress,
              tileId: priority.tileId,
            })
          : TILE_PRESSURE_CLAIM_THRESHOLD,
      };

      return !leader ||
        candidate.progress > leader.progress ||
        (candidate.progress === leader.progress &&
          candidate.tileId.localeCompare(leader.tileId) < 0)
        ? candidate
        : leader;
    }, null);
  const estimatedMinutesRemaining =
    leadingPriority &&
    leadingPriority.outputPerTick > 0 &&
    leadingPriority.progress < leadingPriority.pressureThreshold
      ? Math.ceil(
          (leadingPriority.pressureThreshold - leadingPriority.progress) /
            leadingPriority.outputPerTick
        )
      : null;
  const expansionSummary = isSeasonFour
    ? {
        pressureOutput,
        activePriorityCount: orderedPressurePriorities.length,
        priorityLimit,
        priorityQueue,
        leadingPriority,
        pressureThreshold:
          leadingPriority?.pressureThreshold ?? TILE_PRESSURE_CLAIM_THRESHOLD,
        estimatedMinutesRemaining,
        decayingPressureCount: pressureStates.filter(
          (state) => !priorityTileIds.has(state.tileId)
        ).length,
      }
    : null;
  const operationsSummary = isSeasonFour
    ? {
        committedArmy: activeArmyOrders.reduce(
          (sum, order) => sum + order.committedArmy,
          0
        ),
        activeOrderCount: activeArmyOrders.length,
        guards: [],
        campaigns: campaigns.map((campaign) => ({
          id: campaign.id,
          orderId: campaign.armyOrder.id,
          tileId: campaign.targetTileId,
          opponentName: campaign.defenderFortress.name,
          committedArmy: campaign.armyOrder.committedArmy,
          status: campaign.status,
          progress: campaign.progress,
          threshold: CAMPAIGN_SIEGE_THRESHOLD,
          responseEndsAt: campaign.responseEndsAt,
          canRecall:
            campaign.status !== TerritoryCampaignStatus.ENGAGED &&
            campaign.armyOrder.status === ArmyOrderStatus.ACTIVE,
        })),
        logistics: activeArmyOrders.reduce(
          (summary, order) => {
            if (order.type === ArmyOrderType.ESCORT) {
              summary.escortCount += 1;
              summary.escortArmy += order.committedArmy;
            }

            return summary;
          },
          {
            escortCount: 0,
            escortArmy: 0,
            raidCount: 0,
            raidArmy: 0,
          }
        ),
      }
    : null;

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

  const availableTargets =
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
              name: getDisplayName(
                disguisedSource?.name ?? fortress.name,
                fortress.id === cycle.crownedFortressId &&
                  !(disguisedSource ? false : fortress.isNpc)
              ),
              isNpc: disguisedSource ? false : fortress.isNpc,
            };
          })
      : [];

  const nukeState =
    isSeasonFour && gameplayOpen
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

          const canLaunch =
            playerFortress !== null &&
            playerFortress.gold >= NUKE_LAUNCH_GOLD_COST &&
            NUKE_COMPONENT_KINDS.every((kind) => inventory[kind] >= 1);
          const completeNukeCount = calculateCompleteNukeCount(inventory);

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
                round?.bids.map((bid) => ({
                  id: bid.id,
                  componentKind: bid.componentKind,
                  label: getNukeComponentLabel(bid.componentKind),
                  amount: bid.amount,
                  createdAt: bid.createdAt,
                })) ?? [],
            },
            inventory,
            completeNukeCount,
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
          };
        })()
      : null;

  return {
    playerSummary: playerFortress
      ? {
          id: playerFortress.id,
          cycleId: cycle.id,
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
          ) + ownedTileSummary.workerPoolBonus + skillPopulationBonus,
          defenseMultiplier: getFortressDefenseMultiplier(
            playerFortress.level,
            getEffectiveRace(playerFortress),
            playerCastleSpecializationCounts ?? undefined
          ),
          food: playerFortress.food,
          army: playerFortress.army,
          recruitmentQueue: playerFortress.recruitmentQueue,
          minersAssigned: playerFortress.minersAssigned,
          farmersAssigned: playerFortress.farmersAssigned,
          recruitersAssigned: playerFortress.recruitersAssigned,
          pressureWorkersAssigned: playerFortress.pressureWorkersAssigned,
          legacyAbilitiesEnabled: !isSeasonFour,
          doctrinesEnabled: isSeasonFour,
          doctrine: playerFortress.doctrine,
          doctrineState: {
            selected: getDoctrineDefinition(playerFortress.doctrine),
            effectPercent: getDoctrineEffectPercent(displayedRaceTier),
            changedAt: playerFortress.doctrineChangedAt,
            changeAvailableAt: getDoctrineChangeAvailableAt(
              playerFortress.doctrineChangedAt
            ),
            options: getDoctrineOptionsForRace(playerFortress.race).map(
              (definition) => {
                const blockedReason =
                  playerFortress.doctrine === definition.doctrine
                    ? "This doctrine is active."
                    : getDoctrineChangeBlockedReason({
                        doctrine: definition.doctrine,
                        race: playerFortress.race,
                        changedAt: playerFortress.doctrineChangedAt,
                        now,
                      });

                return {
                  doctrine: definition.doctrine,
                  label: definition.label,
                  description: definition.description,
                  canSelect: gameplayOpen && blockedReason === null,
                  disabledReason: gameplayOpen
                    ? blockedReason
                    : "Doctrines are available during gameplay.",
                };
              }
            ),
          },
          race: playerFortress.race,
          canSelectRace,
          raceSelectionLockedReason: raceSelectionLockedByCommunityWish
            ? "Race choice opens after community wish voting closes."
            : null,
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
          freeLocationShuffleAvailable: false,
          hasOutgoingAttackUnits,
          outboundAttackUnitCount,
          maxSimultaneousAttacks,
          canShuffleLocation:
            gameplayOpen &&
            playerFortress.race !== null &&
            locationShuffleCost !== null &&
            playerFortress.gold >= locationShuffleCost,
          upgradesUnlocked: gameplayOpen,
          nextUpgradeCost,
          canAffordUpgrade,
          canPurchaseUpgrade:
            gameplayOpen &&
            playerFortress.race !== null &&
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
          receivedSlayerUpgrade: false,
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
            tier: displayedRaceTier,
            matchingTileCount: playerOwnedTileCount,
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
            canActivateUnicornShatteredReality:
              unicornShatteredRealityAvailability.canUse,
            unicornShatteredRealityDisabledReason:
              unicornShatteredRealityAvailability.disabledReason,
            stimActiveUntil:
              latestStimUse &&
              latestStimUse.activeFrom <= now &&
              latestStimUse.activeUntil > now
                ? latestStimUse.activeUntil
                : null,
            canClaimUnicornTeleport: unicornTeleportClaimAvailability.canUse,
            unicornTeleportClaimDisabledReason:
              unicornTeleportClaimAvailability.disabledReason,
            hasUnicornTeleportToken: activeUnicornTeleportToken !== null,
            canActivateDeepMining:
              playerFortress.race === "DWARFS" &&
              (!latestDwarfDeepMiningUse ||
                latestDwarfDeepMiningUse.usedAt <=
                  dwarfDeepMiningCooldownStartedAt),
            canActivateRuneOfGrudges:
              playerFortress.race === "DWARFS" &&
              raceBuffTier >= 2 &&
              latestDwarfRuneOfGrudges === null,
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
          expansionSummary,
          operationsSummary,
          battalions: (playerFortress?.battalions ?? []).map((b) => ({
            id: b.id,
            name: b.name,
            size: b.size,
            maxSize: b.maxSize,
            tier: b.tier,
            xp: b.xp,
            readyAt: b.readyAt?.getTime() ?? null,
            stance: b.stance,
            mode: b.mode ?? "GUARD",
            garrisonedAt: b.garrisonedAt,
            frontId: b.assignments?.[0]?.frontId ?? null,
          })),
          warPolicy: playerFortress?.warPolicies?.[0]
            ? {
                maxArmySize: playerFortress.warPolicies[0].maxArmySize,
                guardPercent: playerFortress.warPolicies[0].guardPercent,
                defaultAggression: playerFortress.warPolicies[0].defaultAggression,
                allianceSupportAttack: playerFortress.warPolicies[0].allianceSupportAttack,
                allianceSupportDefense: playerFortress.warPolicies[0].allianceSupportDefense,
                allianceSupportPercent: playerFortress.warPolicies[0].allianceSupportPercent,
              }
            : null,
          allianceWarRoom: {
            allianceBattalionArmy: (playerFortress?.battalions ?? [])
              .filter(
                (b) => (b.mode ?? "GUARD") === "ALLIANCE"
              )
              .reduce((sum, battalion) => sum + battalion.size, 0),
            allies: allianceRelations.map((relation) => {
              const allyId =
                relation.fortressAId === playerFortress?.id
                  ? relation.fortressBId
                  : relation.fortressAId;
              const ally = targetLookup.get(allyId);
              return {
                fortressId: allyId,
                name: ally?.name ?? "Unknown ally",
                commanderName: ally?.commanderName ?? "Unknown commander",
                trustTier: relation.allianceTrustTier,
              };
            }),
            battlefields: allianceBattlefields.map((battlefield) => {
              const attacker = targetLookup.get(battlefield.attackerBannerFortressId);
              const defender = battlefield.defenderBannerFortressId
                ? targetLookup.get(battlefield.defenderBannerFortressId)
                : null;
              const alliedSide: "ATTACKER" | "DEFENDER" | null = alliedFortressIds.has(battlefield.attackerBannerFortressId)
                ? "ATTACKER"
                : battlefield.defenderBannerFortressId &&
                    alliedFortressIds.has(battlefield.defenderBannerFortressId)
                  ? "DEFENDER"
                  : null;

              return {
                id: battlefield.id,
                targetLabel: battlefield.targetTileId
                  ? `Tile ${battlefield.targetTileId}`
                  : battlefield.targetFortressId
                    ? targetLookup.get(battlefield.targetFortressId)?.name ?? "Castle"
                    : "Battlefield",
                alliedSide,
                allyName:
                  alliedSide === "ATTACKER"
                    ? attacker?.name ?? "Ally"
                    : defender?.name ?? "Ally",
                opponentName:
                  alliedSide === "ATTACKER"
                    ? defender?.name ?? "Defender"
                    : attacker?.name ?? "Attacker",
                attackerArmyRemaining: battlefield.attackerArmyRemaining,
                defenderArmyRemaining: battlefield.defenderArmyRemaining,
              };
            }),
            outgoingReinforcements: outgoingAllianceReinforcements.map((unit) => {
              const battlefield = unit.reinforcementBattlefield;
              const alliedFortressId =
                unit.reinforcementSide === "ATTACKER"
                  ? battlefield?.attackerBannerFortressId
                  : battlefield?.defenderBannerFortressId;
              const ally = alliedFortressId ? targetLookup.get(alliedFortressId) : null;

              return {
                id: unit.id,
                armyAmount: unit.armyAmount,
                arrivesAt: unit.arrivesAt,
                side: unit.reinforcementSide,
                allyName: ally?.name ?? "Ally",
                targetLabel: battlefield?.targetTileId
                  ? `Tile ${battlefield.targetTileId}`
                  : "Battlefield",
              };
            }),
          },
          warFronts: (playerFortress?.warFronts ?? []).map((f) => ({
            id: f.id,
            attackerFortressId: f.attackerFortressId,
            enemyFortressId: f.enemyFortressId,
            status: f.status,
            aggression: f.aggression,
          })),
          skillPurchases: playerFortress?.skillPurchases ?? [],
          skillPointsEarned: getEarnedSkillPoints({
            level: playerFortress?.level ?? 1,
            ownedTileCount: ownedNormalTiles.length,
          }),
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
            canInstantRecall:
              playerFortress.race === "SPACE_MURINES" &&
              raceBuffTier >= 1 &&
              (!latestGarrisonInstantRecallUse ||
                getHelsinkiHourKey(latestGarrisonInstantRecallUse.usedAt) !==
                  currentHourKey),
          })),
        }
      : null,
    availableTargets,
    nukeState,
    canJoinCycle:
      Boolean(userId) &&
      (registrationOpen || testingOpen || activeOpen) &&
      !joiningLocked &&
      !playerFortress &&
      remainingSlots > 0,
  };
}
