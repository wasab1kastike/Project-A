import { prisma } from "@/lib/prisma";
import {
  CastleUpgradeSpecialization,
  CycleStatus,
  FortressKind,
  OrkBossOrderKind,
  OrkWaaaghInvestmentKind,
  RaceAbilityKind,
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
import { DWARF_DEEP_MINING_RUNE_BOUNTY } from "./dwarf-deep-mining";
import { ORK_BOSS_ORDER_CONFIG, ORK_WAAAGH_INVESTMENT_CONFIG } from "./orks";
import { getTileById, isHomeOfATile, sumTileBonuses } from "./territory";

const BUILDING_SPECIALIZATIONS = [
  CastleUpgradeSpecialization.DEFENSE,
  CastleUpgradeSpecialization.POINTS,
  CastleUpgradeSpecialization.FOOD,
  CastleUpgradeSpecialization.MILITARY,
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
  const rows = await db.$queryRaw<Array<{ locationShuffleCount: number }>>`
      SELECT "locationShuffleCount"
      FROM "Fortress"
      WHERE "id" = ${fortressId}
      LIMIT 1
    `;

  return rows[0]?.locationShuffleCount ?? 0;
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
  const cycle = await db.cycle.findFirst({
    where: {
      resolvedAt: null,
    },
    orderBy: {
      createdAt: "desc",
    },
    include: {
          ownerId: true,
          commanderName: true,
          commanderNameRegisteredAt: true,
          name: true,
          points: true,
          gold: true,
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
          expiresAt: true,
          unicornDecoySourceFortressId: true,
          unicornDecoyLevel: true,
          currentAction: true,
          targetFortressId: true,
          isNpc: true,
          health: true,
          maxHealth: true,
          joinedAt: true,
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
          garrisons: {
            select: {
              id: true,
              army: true,
              tileId: true,
              createdAt: true,
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
    }
  });

  if (!cycle) {
    return {
      playerSummary: null,
      availableTargets: [],
    };
  }

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
  const playerFortressId = playerFortress?.id ?? null;

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
    ? playerFortress.raceAbilityActivations.find(
        (activation) =>
          activation.kind === RaceAbilityKind.DWARF_RUNE_GRUDGES &&
          activation.consumedAt === null &&
          activation.activeUntil > now
      ) ?? null
    : null;
  const latestDwarfDeepMiningRoll = playerFortress?.deepMiningRolls[0] ?? null;
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
  const ownedTileBonuses = sumTileBonuses(ownedNormalTiles, {
    cycleId: cycle.id,
    at: now,
  });
  const ownedTileSummary = {
    totalTileCount: ownedNormalTiles.length,
    goldIncome: ownedTileBonuses.gold,
    pointIncome: ownedTileBonuses.points,
    foodIncome: ownedTileBonuses.food,
    armyIncome: ownedTileBonuses.army,
    workerPoolBonus: ownedTileBonuses.population,
    defenseBonusPercent: ownedTileBonuses.defensePercent,
  };

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

  return {
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
          ) + ownedTileSummary.workerPoolBonus,
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
            tier: raceBuffTier,
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
    canJoinCycle:
      Boolean(userId) &&
      (registrationOpen || testingOpen || activeOpen) &&
      !joiningLocked &&
      !playerFortress &&
      remainingSlots > 0,
  };
}
