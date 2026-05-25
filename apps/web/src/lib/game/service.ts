import {
  CastleUpgradeSpecialization,
  CommunityWishStatus,
  CycleStatus,
  FortressAction,
  FortressKind,
  ScoreEventType,
  Prisma,
  PrismaClient,
  RaceAbilityKind,
  BattlefieldStatus,
  BattlefieldSide,
  ChatMessageType,
  DiplomacyRelationStatus,
  OrkBossOrderKind,
  OrkScrapEventReason,
  OrkWaaaghInvestmentKind,
  UnicornShatteredRealityOutcome,
} from "@/lib/prisma-client";
import { prisma } from "@/lib/prisma";
import {
  ACTIVE_PLAYER_CAP,
  ACTIVE_RENAME_COST,
  HOME_OF_A_TILE_ID,
  getActiveLocationShuffleCost,
  getHomeOfABossHealth,
} from "./constants";
import {
  getAttackArrivalAt,
  getRandomUnitSpriteVariant,
  normalizeUnitSpriteVariant,
} from "./attacks";
import type { UnitSpriteVariant } from "./constants";
import {
  canFortressLevelUp,
  getFortressUpgradeCost,
  getFortressUpgradeDurationMinutes,
  getMaxSimultaneousAttacks,
} from "./upgrades";
import {
  launchAttackUnit,
  recallAttackUnit as recallAttackUnitRecord,
  instantRecallGarrison as instantRecallGarrisonRecord,
} from "./attack-units";
import { GameError } from "./errors";
import { assertWorkerAssignments, getDisplayedCastleLevel } from "./balance";
import { getRecruitmentCost } from "./army-recruitment";
import { isFortressRace, type FortressRace } from "./races";
import {
  ensureCommanderRegistrationColumn,
  ensureHomeOfABossSchema,
} from "./schema-guards";
import {
  buildFortressSpawnSeed,
  getFortressSpawnLayout,
  getRenderedMapPositionKey,
  takeOpenSpawnPoint,
} from "./spawn-layout";
import {
  getHelsinkiDayKey,
  getRaceAbilityActiveUntil,
  getRaceBuffTier,
  getUnicornShatteredRealityAvailability,
  getUnicornTeleportClaimAvailability,
} from "./race-buffs";
import { addHours, addMinutes } from "./time";
import {
  countCastleSpecializations,
  isCastleUpgradeSpecialization,
} from "./specializations";
import { convertGoldToPoints } from "./currency";
import {
  DWARF_DEEP_MINING_MAX_GOLD_COMMITMENT,
  DWARF_DEEP_MINING_MIN_GOLD_COMMITMENT,
  DWARF_RUNE_OF_GRUDGES_ACTIVATION_GOLD,
  DWARF_RUNE_OF_GRUDGES_MAX_DURATION_HOURS,
  DWARF_RUNE_OF_GRUDGES_MAINTENANCE_GOLD,
  getDwarfDeepMiningResolveAt,
  getDwarfDeepMiningActiveUntil,
  rollDwarfDeepMining,
} from "./dwarf-deep-mining";
import {
  getUnicornShatteredRealityActiveUntil,
  getUnicornShatteredRealityTimedKind,
  rollUnicornShatteredReality,
} from "./unicorn-shattered-reality";
import {
  getTileById,
  isHomeOfATile,
  isTileConnectedToFortressOrOwnedTiles,
} from "./territory";
import { getPressureTargetBlockedReason } from "./tile-pressure";
import { joinBattlefield as joinBattlefieldRecord } from "./battlefields";
import { getTileAttackBlockedReason } from "./combat-targeting";
import { ensureNpcSystemUser, getHomeOfAMapPosition } from "./mega-fortress";
import { recalculateReturningAttackRoutes } from "./fortress-relocation";
import {
  ORK_BOSS_ORDER_CONFIG,
  ORK_WAAAGH_INVESTMENT_CONFIG,
  applyOrkScrapDelta,
  getBossOrderActiveUntil,
  getWaaaghInvestmentCost,
  isRealOrkPlayerFortress,
} from "./orks";
import {
  getAllianceTrustTerms,
  getAllianceTrustUpgradeDeposit,
  isAllianceTrustTier,
  canProposePeace,
  getDiplomacyPressureBlockedReason,
  getCanonicalDiplomacyPair,
  getEffectiveDiplomacyStatus,
  getWarStartsAt,
} from "./politics";

type DatabaseClient = PrismaClient | Prisma.TransactionClient;

const DWARF_RUNE_OF_GRUDGES_ANNOUNCEMENTS = [
  "Rune of Grudges flares to life. {ownerFortress} just pinned {targetFortress} to the wall of grudges.",
  "The Book of Grudges has a fresh page: {ownerCommander} formally blames {targetCommander} for everything.",
  "Stone drums thunder: {ownerFortress} raised the Rune of Grudges, and {targetFortress} is now officially unpopular.",
  "Breaking news from the mountain halls: {ownerCommander} etched {targetCommander} into a very permanent grudge.",
  "Another petty masterpiece: Rune of Grudges active. {targetFortress} is now under premium dwarven disapproval.",
] as const;

function pickRandomItem<T>(items: readonly T[]): T {
  return items[Math.floor(Math.random() * items.length)] ?? items[0];
}

async function getOwnedTileBiomesForFortress({
  db,
  cycleId,
  fortressId,
}: {
  db: DatabaseClient;
  cycleId: string;
  fortressId: string;
}) {
  const ownerships = await db.mapHexOwnership.findMany({
    where: {
      cycleId,
      ownerFortressId: fortressId,
    },
    select: {
      tileId: true,
    },
  });

  return ownerships
    .filter((ownership) => !isHomeOfATile(ownership.tileId))
    .map((ownership) => getTileById(ownership.tileId)?.biome ?? null)
    .filter((biome): biome is NonNullable<typeof biome> => biome !== null);
}

function normalizeRecallAmount(armyAmount: number, availableArmy: number) {
  if (!Number.isInteger(armyAmount) || armyAmount <= 0) {
    throw new GameError("Recall at least 1 army.");
  }

  if (armyAmount > availableArmy) {
    throw new GameError("You cannot recall more army than remains there.");
  }

  return armyAmount;
}

async function createReturningArmyMarker({
  db,
  cycle,
  fortress,
  origin,
  targetFortressId,
  armyAmount,
  now,
}: {
  db: DatabaseClient;
  cycle: { id: string; status?: string; activeStartedAt?: Date | null };
  fortress: {
    id: string;
    mapX: number;
    mapY: number;
    race?: FortressRace | null;
  };
  origin: { mapX: number; mapY: number };
  targetFortressId: string;
  armyAmount: number;
  now: Date;
}) {
  const ownedTileBiomes = await getOwnedTileBiomesForFortress({
    db,
    cycleId: cycle.id,
    fortressId: fortress.id,
  });
  const raceBuffTier = getRaceBuffTier({
    activeStartedAt: cycle.activeStartedAt ?? null,
    now,
    isActiveSeason: cycle.status === CycleStatus.ACTIVE,
    race: fortress.race,
    ownedTileBiomes,
  });
  const arrivesAt = getAttackArrivalAt({
    launchedAt: now,
    origin,
    target: fortress,
    attackerRace: fortress.race,
    raceBuffTier,
  });

  return db.attackUnit.create({
    data: {
      cycleId: cycle.id,
      attackerFortressId: fortress.id,
      targetFortressId,
      armyAmount,
      launchedAt: now,
      arrivesAt,
      recalledAt: now,
      returnOriginMapX: origin.mapX,
      returnOriginMapY: origin.mapY,
    },
  });
}

export type AttackUnitLaunchMarker = {
  id: string;
  armyAmount: number;
  launchedAt: Date;
  arrivesAt: Date;
  recalledAt: Date | null;
  returnOrigin: {
    mapX: number;
    mapY: number;
  } | null;
  canRecall: boolean;
  canInstantRecall: boolean;
  attacker: {
    id: string;
    name: string;
    mapX: number;
    mapY: number;
    unitSpriteVariant: UnitSpriteVariant;
    unitCosmeticVariant: string | null;
  };
  target: {
    id: string;
    name: string;
    mapX: number;
    mapY: number;
  };
};

export type AttackMapHexResult = {
  battlefieldId: string | null;
  launchedAttackUnit: AttackUnitLaunchMarker;
};

function toAttackUnitLaunchMarker({
  unit,
  attacker,
  target,
}: {
  unit: {
    id: string;
    armyAmount: number;
    launchedAt: Date;
    arrivesAt: Date;
    recalledAt: Date | null;
    returnOriginMapX: number | null;
    returnOriginMapY: number | null;
  };
  attacker: {
    id: string;
    name: string;
    mapX: number;
    mapY: number;
    unitSpriteVariant?: string | null;
    owner?: {
      unitCosmeticVariant: string | null;
    } | null;
  };
  target: {
    id: string;
    name: string;
    mapX: number;
    mapY: number;
  };
}): AttackUnitLaunchMarker {
  return {
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
    canRecall: true,
    canInstantRecall: false,
    attacker: {
      id: attacker.id,
      name: attacker.name,
      mapX: attacker.mapX,
      mapY: attacker.mapY,
      unitSpriteVariant: normalizeUnitSpriteVariant(
        attacker.unitSpriteVariant ?? ""
      ),
      unitCosmeticVariant: attacker.owner?.unitCosmeticVariant ?? null,
    },
    target,
  };
}

const PUBLIC_NAME_MAX_LENGTH = 32;
const ACTIVE_EDGE_PADDING = 15;
const SERVICE_TRANSACTION_OPTIONS = {
  maxWait: 10_000,
  timeout: 20_000,
} satisfies Parameters<PrismaClient["$transaction"]>[1];

function normalizePublicName(input: string, label: string) {
  const normalized = input.trim().replace(/\s+/g, " ");

  if (!normalized) {
    throw new GameError(`${label} cannot be empty.`);
  }

  if (normalized.length > PUBLIC_NAME_MAX_LENGTH) {
    throw new GameError(
      `${label} must be ${PUBLIC_NAME_MAX_LENGTH} characters or fewer.`
    );
  }

  return normalized;
}

function normalizeCommanderName(input: string) {
  return normalizePublicName(input, "In-game nick");
}

function normalizeFortressName(input: string) {
  return normalizePublicName(input, "Fortress name");
}

function getCurrentCycle(db: DatabaseClient = prisma) {
  return db.cycle.findFirst({
    where: {
      resolvedAt: null,
    },
    orderBy: {
      createdAt: "desc",
    },
  });
}

function isJoinOpen(
  cycle: {
    status: CycleStatus;
    registrationEndsAt: Date;
    testingEndsAt?: Date | null;
    activeEndsAt: Date | null;
    joiningLockedAt?: Date | null;
  },
  now: Date
) {
  return (
    (cycle.status === CycleStatus.REGISTRATION &&
      cycle.registrationEndsAt > now &&
      !cycle.joiningLockedAt) ||
    (cycle.status === CycleStatus.TESTING &&
      cycle.testingEndsAt !== null &&
      cycle.testingEndsAt !== undefined &&
      cycle.testingEndsAt > now &&
      !cycle.joiningLockedAt) ||
    (cycle.status === CycleStatus.ACTIVE &&
      cycle.activeEndsAt !== null &&
      cycle.activeEndsAt > now)
  );
}

function isRegistrationWindowOpen(
  cycle: {
    status: CycleStatus;
    registrationEndsAt: Date;
  },
  now: Date
) {
  return (
    cycle.status === CycleStatus.REGISTRATION && cycle.registrationEndsAt > now
  );
}

function isActiveWindowOpen(
  cycle: {
    status: CycleStatus;
    activeEndsAt: Date | null;
  },
  now: Date
) {
  return (
    cycle.status === CycleStatus.ACTIVE &&
    cycle.activeEndsAt !== null &&
    cycle.activeEndsAt > now
  );
}

function isGameplayWindowOpen(
  cycle: {
    status: CycleStatus;
    testingEndsAt?: Date | null;
    activeEndsAt: Date | null;
  },
  now: Date
) {
  return (
    (cycle.status === CycleStatus.TESTING &&
      cycle.testingEndsAt !== null &&
      cycle.testingEndsAt !== undefined &&
      cycle.testingEndsAt > now) ||
    isActiveWindowOpen(cycle, now)
  );
}

function isRaceSelectionWindowOpen(
  cycle: {
    status: CycleStatus;
    registrationEndsAt: Date;
    testingEndsAt?: Date | null;
    activeEndsAt: Date | null;
  },
  now: Date
) {
  return (
    isRegistrationWindowOpen(cycle, now) || isGameplayWindowOpen(cycle, now)
  );
}

async function isRaceSelectionLockedByCommunityWish({
  cycleId,
  now,
  db,
}: {
  cycleId: string;
  now: Date;
  db: DatabaseClient;
}) {
  const latestHistory = await db.cycleHistory.findFirst({
    where: {
      cycleId: {
        not: cycleId,
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
  });

  if (!latestHistory) {
    return false;
  }

  if (latestHistory.communityWishStatus === CommunityWishStatus.OPEN) {
    return (
      latestHistory.communityWishVotingEndsAt !== null &&
      latestHistory.communityWishVotingEndsAt > now
    );
  }

  return (
    latestHistory.communityWishStatus === CommunityWishStatus.PROPOSALS_OPEN &&
    latestHistory.communityWishProposalEndsAt !== null &&
    latestHistory.communityWishProposalEndsAt > now
  );
}

function findOpenMapPosition(
  cycle: {
    id: string;
    activeStartedAt?: Date | null;
  },
  fortresses: Array<{
    mapX: number;
    mapY: number;
  }>
) {
  const occupied = new Set(
    fortresses.map((fortress) => getRenderedMapPositionKey(fortress))
  );
  const layout = getFortressSpawnLayout({
    cycleId: cycle.id,
    purpose: "registration:fortress-layout",
    activeStartedAt: cycle.activeStartedAt,
    count: ACTIVE_PLAYER_CAP,
  });

  return layout.find((position) => {
    return !occupied.has(getRenderedMapPositionKey(position));
  });
}

function isUniqueConstraintError(
  error: unknown,
  targetField?: string | string[]
): error is Prisma.PrismaClientKnownRequestError {
  if (
    !(error instanceof Prisma.PrismaClientKnownRequestError) ||
    error.code !== "P2002"
  ) {
    return false;
  }

  if (!targetField) {
    return true;
  }

  const targets = Array.isArray(targetField) ? targetField : [targetField];
  const metaTarget = error.meta?.target;

  if (!Array.isArray(metaTarget)) {
    return false;
  }

  return targets.every((target) => metaTarget.includes(target));
}

async function getFortressLocationShuffleCount(
  db: DatabaseClient,
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

async function getPendingUpgradeSpecializationLevel(
  db: DatabaseClient,
  fortress: { id: string; level: number }
) {
  const selectedCount = await db.castleUpgradeSpecializationChoice.count({
    where: {
      fortressId: fortress.id,
    },
  });

  return selectedCount < fortress.level ? selectedCount + 1 : null;
}

export async function joinRegistrationCycle({
  userId,
  commanderName,
  fortressName,
  race,
  now = new Date(),
  db = prisma,
}: {
  userId: string;
  commanderName?: string;
  fortressName: string;
  race?: FortressRace | string;
  now?: Date;
  db?: PrismaClient;
}) {
  await ensureCommanderRegistrationColumn(db);

  const normalizedName = normalizeFortressName(fortressName);
  const normalizedCommanderName = normalizeCommanderName(
    commanderName ?? fortressName
  );
  const normalizedRace =
    race === undefined ? undefined : isFortressRace(race) ? race : null;

  if (race !== undefined && normalizedRace === null) {
    throw new GameError("Choose a valid race before joining this season.");
  }

  try {
    return await db.$transaction(
      async (tx) => {
        const cycle = await tx.cycle.findFirst({
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
                mapX: true,
                mapY: true,
              },
            },
          },
        });

        if (!cycle) {
          throw new GameError("Joining is closed for this cycle.");
        }

        if (
          cycle.status === CycleStatus.REGISTRATION &&
          cycle.registrationEndsAt > now &&
          cycle.joiningLockedAt
        ) {
          throw new GameError("Registration joining is locked by an admin.");
        }

        if (!isJoinOpen(cycle, now)) {
          throw new GameError("Joining is closed for this cycle.");
        }

        if (
          normalizedRace !== undefined &&
          cycle.status === CycleStatus.REGISTRATION &&
          (await isRaceSelectionLockedByCommunityWish({
            cycleId: cycle.id,
            now,
            db: tx,
          }))
        ) {
          throw new GameError(
            "Race selection opens after community wish voting closes."
          );
        }

        if (cycle.fortresses.some((fortress) => fortress.ownerId === userId)) {
          throw new GameError("You already joined this cycle.");
        }

        if (cycle.fortresses.length >= ACTIVE_PLAYER_CAP) {
          throw new GameError("This cycle is already full.");
        }

        if (
          cycle.fortresses.some((fortress) => fortress.name === normalizedName)
        ) {
          throw new GameError(
            "That fortress name is already taken this cycle."
          );
        }

        if (
          cycle.fortresses.some(
            (fortress) => fortress.commanderName === normalizedCommanderName
          )
        ) {
          throw new GameError("That in-game nick is already taken this cycle.");
        }

        const openPosition = findOpenMapPosition(cycle, cycle.fortresses);

        if (!openPosition) {
          throw new GameError(
            "No map position is available for a new fortress."
          );
        }

        return tx.fortress.create({
          data: {
            cycleId: cycle.id,
            ownerId: userId,
            commanderName: normalizedCommanderName,
            commanderNameRegisteredAt: now,
            name: normalizedName,
            race: normalizedRace,
            mapX: Math.round(openPosition.x),
            mapY: Math.round(openPosition.y),
            unitSpriteVariant: getRandomUnitSpriteVariant(),
            currentAction: FortressAction.GROW,
          },
        });
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      }
    );
  } catch (error) {
    if (isUniqueConstraintError(error, ["cycleId", "ownerId"])) {
      throw new GameError("You already joined this cycle.");
    }

    if (isUniqueConstraintError(error, ["cycleId", "name"])) {
      throw new GameError("That fortress name is already taken this cycle.");
    }

    if (isUniqueConstraintError(error, ["cycleId", "commanderName"])) {
      throw new GameError("That in-game nick is already taken this cycle.");
    }

    throw error;
  }
}

export async function editRegistrationFortressName({
  userId,
  commanderName,
  fortressName,
  now = new Date(),
  db = prisma,
}: {
  userId: string;
  commanderName?: string;
  fortressName: string;
  now?: Date;
  db?: PrismaClient;
}) {
  await ensureCommanderRegistrationColumn(db);

  const normalizedName = normalizeFortressName(fortressName);
  const normalizedCommanderName =
    commanderName !== undefined ? normalizeCommanderName(commanderName) : null;

  try {
    return await db.$transaction(async (tx) => {
      const cycle = await getCurrentCycle(tx);

      if (!cycle || !isRegistrationWindowOpen(cycle, now)) {
        throw new GameError("Registration editing is closed for this cycle.");
      }

      const fortress = await tx.fortress.findUnique({
        where: {
          cycleId_ownerId: {
            cycleId: cycle.id,
            ownerId: userId,
          },
        },
      });

      if (!fortress) {
        throw new GameError(
          "Join the current registration cycle before editing."
        );
      }

      return tx.fortress.update({
        where: {
          id: fortress.id,
        },
        data: {
          ...(normalizedCommanderName
            ? {
                commanderName: normalizedCommanderName,
                commanderNameRegisteredAt: now,
              }
            : {}),
          name: normalizedName,
        },
      });
    });
  } catch (error) {
    if (isUniqueConstraintError(error, ["cycleId", "name"])) {
      throw new GameError("That fortress name is already taken this cycle.");
    }

    if (isUniqueConstraintError(error, ["cycleId", "commanderName"])) {
      throw new GameError("That in-game nick is already taken this cycle.");
    }

    throw error;
  }
}

export async function registerCommanderName({
  userId,
  commanderName,
  now = new Date(),
  db = prisma,
}: {
  userId: string;
  commanderName: string;
  now?: Date;
  db?: PrismaClient;
}) {
  await ensureCommanderRegistrationColumn(db);

  const normalizedCommanderName = normalizeCommanderName(commanderName);

  try {
    return await db.$transaction(async (tx) => {
      const cycle = await getCurrentCycle(tx);

      if (!cycle) {
        throw new GameError(
          "No current cycle is available for nick registration."
        );
      }

      const fortress = await tx.fortress.findUnique({
        where: {
          cycleId_ownerId: {
            cycleId: cycle.id,
            ownerId: userId,
          },
        },
      });

      if (!fortress) {
        throw new GameError(
          "Join the current cycle before registering a nick."
        );
      }

      if (fortress.commanderNameRegisteredAt) {
        throw new GameError("Your in-game nick is already registered.");
      }

      return tx.fortress.update({
        where: {
          id: fortress.id,
        },
        data: {
          commanderName: normalizedCommanderName,
          commanderNameRegisteredAt: now,
        },
      });
    });
  } catch (error) {
    if (isUniqueConstraintError(error, ["cycleId", "commanderName"])) {
      throw new GameError("That in-game nick is already taken this cycle.");
    }

    throw error;
  }
}

export async function setFortressAction({
  userId,
  action,
  targetFortressId,
  sentArmy = 1,
  now = new Date(),
  db = prisma,
}: {
  userId: string;
  action: FortressAction;
  targetFortressId?: string;
  sentArmy?: number;
  now?: Date;
  db?: PrismaClient;
}) {
  return db.$transaction(async (tx) => {
    const cycle = await getCurrentCycle(tx);

    if (!cycle || !isGameplayWindowOpen(cycle, now)) {
      throw new GameError("The current cycle is not accepting active actions.");
    }

    const fortress = await tx.fortress.findUnique({
      where: {
        cycleId_ownerId: {
          cycleId: cycle.id,
          ownerId: userId,
        },
      },
      select: {
        id: true,
        currentAction: true,
        army: true,
        level: true,
        race: true,
        mapX: true,
        mapY: true,
        ownerId: true,
      },
    });

    if (!fortress) {
      throw new GameError("You are not participating in the active cycle.");
    }

    if (action === FortressAction.GROW) {
      return tx.fortress.update({
        where: {
          id: fortress.id,
        },
        data: {
          currentAction: FortressAction.GROW,
          targetFortressId: null,
        },
      });
    }

    if (!fortress.race) {
      throw new GameError("Choose a race before attacking.");
    }

    if (!targetFortressId) {
      throw new GameError("Choose a target fortress before attacking.");
    }

    if (targetFortressId === fortress.id) {
      throw new GameError("Your fortress cannot target itself.");
    }

    if (!Number.isInteger(sentArmy) || sentArmy <= 0) {
      throw new GameError("You must send at least 1 army.");
    }

    if (sentArmy > fortress.army) {
      throw new GameError(
        "You do not have enough army to send that many units."
      );
    }

    const target = await tx.fortress.findFirst({
      where: {
        id: targetFortressId,
        cycleId: cycle.id,
      },
    });

    if (!target) {
      throw new GameError(
        "That attack target is not part of the active cycle."
      );
    }

    if (target.fortressKind === FortressKind.MEGA) {
      throw new GameError("Attack Home of A through the center map tile.");
    }

    if (target.fortressKind === FortressKind.DWARF_RUNE) {
      const [runeRoll, runeActivation] = await Promise.all([
        tx.dwarfDeepMiningRoll.findUnique({
          where: {
            runeFortressId: target.id,
          },
          select: {
            fortress: {
              select: {
                ownerId: true,
              },
            },
          },
        }),
        tx.raceAbilityActivation.findFirst({
          where: {
            kind: RaceAbilityKind.DWARF_RUNE_GRUDGES,
            runeFortressId: target.id,
            consumedAt: null,
            activeUntil: {
              gt: now,
            },
          },
          select: {
            fortress: {
              select: {
                ownerId: true,
                id: true,
              },
            },
          },
        }),
      ]);

      if (
        runeRoll?.fortress?.ownerId === fortress.ownerId ||
        runeActivation?.fortress?.ownerId === fortress.ownerId
      ) {
        throw new GameError("You cannot attack your own Dwarf rune.");
      }
    }

    const updatedFortress = await tx.fortress.update({
      where: {
        id: fortress.id,
      },
      data: {
        currentAction: FortressAction.GROW,
        targetFortressId: null,
      },
    });

    const outboundAttackCount = await tx.attackUnit.count({
      where: {
        attackerFortressId: fortress.id,
        resolvedAt: null,
        cancelledAt: null,
      },
    });

    const effectiveRace = (await isFortressFactionSuppressed(
      tx,
      fortress.id,
      now
    ))
      ? null
      : fortress.race;
    const maxAttacks = getMaxSimultaneousAttacks(fortress.level, effectiveRace);

    if (outboundAttackCount >= maxAttacks) {
      throw new GameError(
        `You have reached the maximum number of simultaneous attacks (${maxAttacks}). Upgrade your castle for more slots.`
      );
    }

    const launchedUnit = await launchAttackUnit({
      db: tx,
      cycle,
      attacker: {
        ...updatedFortress,
        army: fortress.army,
      },
      target,
      launchedAt: now,
      armyAmount: sentArmy,
    });

    if (!launchedUnit) {
      throw new GameError("That attack would arrive after the cycle ends.");
    }

    if (
      (target.fortressKind === FortressKind.PLAYER && !target.isNpc) ||
      target.fortressKind === FortressKind.DWARF_RUNE
    ) {
      const runeActivation =
        target.fortressKind === FortressKind.DWARF_RUNE
          ? await tx.raceAbilityActivation.findFirst({
              where: {
                kind: RaceAbilityKind.DWARF_RUNE_GRUDGES,
                runeFortressId: target.id,
                consumedAt: null,
                activeUntil: {
                  gt: now,
                },
              },
              select: {
                fortressId: true,
              },
            })
          : null;
      const battlefield =
        (await tx.battlefield.findFirst({
          where: {
            cycleId: cycle.id,
            targetFortressId: target.id,
            targetTileId: null,
            status: BattlefieldStatus.ACTIVE,
          },
          select: {
            id: true,
          },
        })) ??
        (await tx.battlefield.create({
          data: {
            cycleId: cycle.id,
            targetFortressId: target.id,
            attackerBannerFortressId: fortress.id,
            defenderBannerFortressId:
              target.fortressKind === FortressKind.DWARF_RUNE
                ? (runeActivation?.fortressId ?? null)
                : target.id,
            attackerArmyRemaining: 0,
            defenderArmyRemaining: target.army,
            pointsReward: Math.floor(target.gold * 0.7),
            foodReward: Math.floor(target.food * 0.7),
            startedAt:
              target.fortressKind === FortressKind.PLAYER && !target.isNpc
                ? addHours(launchedUnit.arrivesAt, 1)
                : now,
          },
          select: {
            id: true,
          },
        }));

      await tx.attackUnit.update({
        where: {
          id: launchedUnit.id,
        },
        data: {
          reinforcementBattlefieldId: battlefield.id,
          reinforcementSide: BattlefieldSide.ATTACKER,
        },
      });
    }

    return updatedFortress;
  });
}

export async function setTilePressurePriority({
  userId,
  tileId,
  now = new Date(),
  db = prisma,
}: {
  userId: string;
  tileId: string;
  now?: Date;
  db?: PrismaClient;
}) {
  return db.$transaction(async (tx) => {
    const cycle = await getCurrentCycle(tx);

    if (!cycle || !isGameplayWindowOpen(cycle, now)) {
      throw new GameError("The current cycle is not accepting expansion priorities.");
    }

    const fortress = await tx.fortress.findUnique({
      where: {
        cycleId_ownerId: {
          cycleId: cycle.id,
          ownerId: userId,
        },
      },
      select: {
        id: true,
        ownerId: true,
        mapX: true,
        mapY: true,
      },
    });

    if (!fortress) {
      throw new GameError("You are not participating in the active cycle.");
    }

    const tile = getTileById(tileId);

    const existing = await tx.mapHexOwnership.findUnique({
      where: {
        cycleId_tileId: {
          cycleId: cycle.id,
          tileId,
        },
      },
      select: {
        ownerFortressId: true,
      },
    });
    const diplomacyRelation =
      existing?.ownerFortressId && existing.ownerFortressId !== fortress.id
        ? await tx.diplomacyRelation.findUnique({
            where: {
              cycleId_fortressAId_fortressBId: {
                cycleId: cycle.id,
                ...getCanonicalDiplomacyPair(
                  fortress.id,
                  existing.ownerFortressId
                ),
              },
            },
            select: {
              status: true,
              warStartsAt: true,
            },
          })
        : null;

    const ownedTileIds = await tx.mapHexOwnership.findMany({
      where: {
        cycleId: cycle.id,
        ownerFortressId: fortress.id,
      },
      select: {
        tileId: true,
      },
    });
    const ownedNormalTileIds = ownedTileIds
      .map((ownership) => ownership.tileId)
      .filter((ownedTileId) => !isHomeOfATile(ownedTileId));

    const blockedReason = getPressureTargetBlockedReason({
      tile,
      tileId,
      ownerFortressId: existing?.ownerFortressId ?? null,
      diplomacyBlockedReason: getDiplomacyPressureBlockedReason({
        relation: diplomacyRelation,
        now,
      }),
      fortress,
      ownedTileIds: ownedNormalTileIds,
      isHomeOfA: isHomeOfATile,
      isConnected: ({ tileId: candidateTileId, ownedTileIds }) =>
        isTileConnectedToFortressOrOwnedTiles({
          tileId: candidateTileId,
          fortress,
          ownedTileIds,
        }),
    });

    if (blockedReason) {
      throw new GameError(blockedReason);
    }

    return tx.tilePressurePriority.upsert({
      where: {
        cycleId_fortressId_tileId: {
          cycleId: cycle.id,
          fortressId: fortress.id,
          tileId,
        },
      },
      create: {
        cycleId: cycle.id,
        fortressId: fortress.id,
        tileId,
        weight: 1,
      },
      update: {
        weight: 1,
      },
      select: {
        id: true,
        cycleId: true,
        fortressId: true,
        tileId: true,
        weight: true,
      },
    });
  }, SERVICE_TRANSACTION_OPTIONS);
}

export async function clearTilePressurePriority({
  userId,
  tileId,
  db = prisma,
}: {
  userId: string;
  tileId: string;
  db?: PrismaClient;
}) {
  return db.$transaction(async (tx) => {
    const cycle = await getCurrentCycle(tx);

    if (!cycle) {
      throw new GameError("There is no active cycle.");
    }

    const fortress = await tx.fortress.findUnique({
      where: {
        cycleId_ownerId: {
          cycleId: cycle.id,
          ownerId: userId,
        },
      },
      select: {
        id: true,
      },
    });

    if (!fortress) {
      throw new GameError("You are not participating in the active cycle.");
    }

    await tx.tilePressurePriority.deleteMany({
      where: {
        cycleId: cycle.id,
        fortressId: fortress.id,
        tileId,
      },
    });

    return { tileId };
  }, SERVICE_TRANSACTION_OPTIONS);
}

async function getActivePlayerFortressForPolitics({
  tx,
  cycleId,
  userId,
}: {
  tx: Prisma.TransactionClient;
  cycleId: string;
  userId: string;
}) {
  const fortress = await tx.fortress.findUnique({
    where: {
      cycleId_ownerId: {
        cycleId,
        ownerId: userId,
      },
    },
    select: {
      id: true,
      gold: true,
      food: true,
    },
  });

  if (!fortress) {
    throw new GameError("You are not participating in the active cycle.");
  }

  return fortress;
}

async function getTargetPlayerFortressForPolitics({
  tx,
  cycleId,
  targetFortressId,
}: {
  tx: Prisma.TransactionClient;
  cycleId: string;
  targetFortressId: string;
}) {
  const target = await tx.fortress.findFirst({
    where: {
      id: targetFortressId,
      cycleId,
      fortressKind: FortressKind.PLAYER,
      isNpc: false,
    },
    select: {
      id: true,
      gold: true,
      food: true,
    },
  });

  if (!target) {
    throw new GameError("That player fortress is not in the active cycle.");
  }

  return target;
}

function assertCanDepositAllianceEscrow({
  fortress,
  gold,
  food,
}: {
  fortress: { gold: number; food: number };
  gold: number;
  food: number;
}) {
  if (fortress.gold < gold || fortress.food < food) {
    throw new GameError(
      `Both fortresses need ${gold.toLocaleString()} gold and ${food.toLocaleString()} food available for this trust deposit.`
    );
  }
}

export async function proposeAlliance({
  userId,
  targetFortressId,
  now = new Date(),
  db = prisma,
}: {
  userId: string;
  targetFortressId: string;
  now?: Date;
  db?: PrismaClient;
}) {
  return db.$transaction(async (tx) => {
    const cycle = await getCurrentCycle(tx);

    if (!cycle || !isGameplayWindowOpen(cycle, now)) {
      throw new GameError("Politics can only change during gameplay.");
    }

    const actor = await getActivePlayerFortressForPolitics({
      tx,
      cycleId: cycle.id,
      userId,
    });
    const target = await getTargetPlayerFortressForPolitics({
      tx,
      cycleId: cycle.id,
      targetFortressId,
    });

    if (actor.id === target.id) {
      throw new GameError("You cannot ally with yourself.");
    }

    const pair = getCanonicalDiplomacyPair(actor.id, target.id);
    const relation = await tx.diplomacyRelation.findUnique({
      where: {
        cycleId_fortressAId_fortressBId: {
          cycleId: cycle.id,
          ...pair,
        },
      },
    });
    const status = getEffectiveDiplomacyStatus({ relation, now });

    if (status === DiplomacyRelationStatus.ALLIED) {
      throw new GameError("These fortresses are already allied.");
    }

    if (status !== DiplomacyRelationStatus.NEUTRAL) {
      throw new GameError("Alliances may only be proposed while relations are neutral.");
    }

    return tx.diplomacyRelation.upsert({
      where: {
        cycleId_fortressAId_fortressBId: {
          cycleId: cycle.id,
          ...pair,
        },
      },
      create: {
        cycleId: cycle.id,
        ...pair,
        status: DiplomacyRelationStatus.ALLIANCE_PENDING,
        allianceProposedById: actor.id,
        allianceProposedAt: now,
      },
      update: {
        status: DiplomacyRelationStatus.ALLIANCE_PENDING,
        allianceProposedById: actor.id,
        allianceProposedAt: now,
        warDeclaredById: null,
        warDeclaredAt: null,
        warStartsAt: null,
        peaceProposedById: null,
        peaceProposedAt: null,
      },
    });
  }, SERVICE_TRANSACTION_OPTIONS);
}

export async function acceptAlliance({
  userId,
  targetFortressId,
  now = new Date(),
  db = prisma,
}: {
  userId: string;
  targetFortressId: string;
  now?: Date;
  db?: PrismaClient;
}) {
  return db.$transaction(async (tx) => {
    const cycle = await getCurrentCycle(tx);

    if (!cycle || !isGameplayWindowOpen(cycle, now)) {
      throw new GameError("Politics can only change during gameplay.");
    }

    const actor = await getActivePlayerFortressForPolitics({
      tx,
      cycleId: cycle.id,
      userId,
    });
    const target = await getTargetPlayerFortressForPolitics({
      tx,
      cycleId: cycle.id,
      targetFortressId,
    });

    if (actor.id === target.id) {
      throw new GameError("You cannot accept an alliance with yourself.");
    }

    const pair = getCanonicalDiplomacyPair(actor.id, target.id);
    const relation = await tx.diplomacyRelation.findUnique({
      where: {
        cycleId_fortressAId_fortressBId: { cycleId: cycle.id, ...pair },
      },
    });

    if (
      !relation ||
      relation.status !== DiplomacyRelationStatus.ALLIANCE_PENDING
    ) {
      throw new GameError("There is no alliance proposal to accept.");
    }

    if (relation.allianceProposedById === actor.id) {
      throw new GameError("The other fortress must accept your alliance proposal.");
    }

    const terms = getAllianceTrustTerms(1);
    assertCanDepositAllianceEscrow({
      fortress: actor,
      gold: terms.escrowGold,
      food: terms.escrowFood,
    });
    assertCanDepositAllianceEscrow({
      fortress: target,
      gold: terms.escrowGold,
      food: terms.escrowFood,
    });

    await Promise.all([
      tx.fortress.update({
        where: { id: actor.id },
        data: {
          gold: { decrement: terms.escrowGold },
          food: { decrement: terms.escrowFood },
        },
      }),
      tx.fortress.update({
        where: { id: target.id },
        data: {
          gold: { decrement: terms.escrowGold },
          food: { decrement: terms.escrowFood },
        },
      }),
    ]);

    return tx.diplomacyRelation.update({
      where: { id: relation.id },
      data: {
        status: DiplomacyRelationStatus.ALLIED,
        allianceProposedById: null,
        allianceProposedAt: null,
        allianceTrustTier: 1,
        allianceEscrowGoldEach: terms.escrowGold,
        allianceEscrowFoodEach: terms.escrowFood,
      },
    });
  }, SERVICE_TRANSACTION_OPTIONS);
}

export async function proposeAllianceTrustUpgrade({
  userId,
  targetFortressId,
  now = new Date(),
  db = prisma,
}: {
  userId: string;
  targetFortressId: string;
  now?: Date;
  db?: PrismaClient;
}) {
  return db.$transaction(async (tx) => {
    const cycle = await getCurrentCycle(tx);

    if (!cycle || !isGameplayWindowOpen(cycle, now)) {
      throw new GameError("Politics can only change during gameplay.");
    }

    const actor = await getActivePlayerFortressForPolitics({
      tx,
      cycleId: cycle.id,
      userId,
    });
    const target = await getTargetPlayerFortressForPolitics({
      tx,
      cycleId: cycle.id,
      targetFortressId,
    });

    if (actor.id === target.id) {
      throw new GameError("You cannot change trust with yourself.");
    }

    const pair = getCanonicalDiplomacyPair(actor.id, target.id);
    const relation = await tx.diplomacyRelation.findUnique({
      where: {
        cycleId_fortressAId_fortressBId: { cycleId: cycle.id, ...pair },
      },
    });

    if (!relation || relation.status !== DiplomacyRelationStatus.ALLIED) {
      throw new GameError("Trust may only be upgraded within an alliance.");
    }

    const requestedTier = relation.allianceTrustTier + 1;

    if (!isAllianceTrustTier(requestedTier)) {
      throw new GameError("This alliance already has maximum trust.");
    }

    return tx.diplomacyRelation.update({
      where: { id: relation.id },
      data: {
        trustUpgradeProposedById: actor.id,
        trustUpgradeProposedAt: now,
        trustUpgradeTier: requestedTier,
      },
    });
  }, SERVICE_TRANSACTION_OPTIONS);
}

export async function acceptAllianceTrustUpgrade({
  userId,
  targetFortressId,
  now = new Date(),
  db = prisma,
}: {
  userId: string;
  targetFortressId: string;
  now?: Date;
  db?: PrismaClient;
}) {
  return db.$transaction(async (tx) => {
    const cycle = await getCurrentCycle(tx);

    if (!cycle || !isGameplayWindowOpen(cycle, now)) {
      throw new GameError("Politics can only change during gameplay.");
    }

    const actor = await getActivePlayerFortressForPolitics({
      tx,
      cycleId: cycle.id,
      userId,
    });
    const target = await getTargetPlayerFortressForPolitics({
      tx,
      cycleId: cycle.id,
      targetFortressId,
    });

    if (actor.id === target.id) {
      throw new GameError("You cannot accept trust with yourself.");
    }

    const pair = getCanonicalDiplomacyPair(actor.id, target.id);
    const relation = await tx.diplomacyRelation.findUnique({
      where: {
        cycleId_fortressAId_fortressBId: { cycleId: cycle.id, ...pair },
      },
    });

    if (
      !relation ||
      relation.status !== DiplomacyRelationStatus.ALLIED ||
      !relation.trustUpgradeTier ||
      !isAllianceTrustTier(relation.trustUpgradeTier)
    ) {
      throw new GameError("There is no trust upgrade proposal to accept.");
    }

    if (relation.trustUpgradeProposedById === actor.id) {
      throw new GameError("The other fortress must accept your trust upgrade.");
    }

    const deposit = getAllianceTrustUpgradeDeposit({
      currentTier: relation.allianceTrustTier,
      requestedTier: relation.trustUpgradeTier,
    });
    assertCanDepositAllianceEscrow({
      fortress: actor,
      gold: deposit.gold,
      food: deposit.food,
    });
    assertCanDepositAllianceEscrow({
      fortress: target,
      gold: deposit.gold,
      food: deposit.food,
    });

    await Promise.all([
      tx.fortress.update({
        where: { id: actor.id },
        data: { gold: { decrement: deposit.gold }, food: { decrement: deposit.food } },
      }),
      tx.fortress.update({
        where: { id: target.id },
        data: { gold: { decrement: deposit.gold }, food: { decrement: deposit.food } },
      }),
    ]);

    const terms = getAllianceTrustTerms(relation.trustUpgradeTier);

    return tx.diplomacyRelation.update({
      where: { id: relation.id },
      data: {
        allianceTrustTier: relation.trustUpgradeTier,
        allianceEscrowGoldEach: terms.escrowGold,
        allianceEscrowFoodEach: terms.escrowFood,
        trustUpgradeProposedById: null,
        trustUpgradeProposedAt: null,
        trustUpgradeTier: null,
      },
    });
  }, SERVICE_TRANSACTION_OPTIONS);
}

export async function betrayAlliance({
  userId,
  targetFortressId,
  now = new Date(),
  db = prisma,
}: {
  userId: string;
  targetFortressId: string;
  now?: Date;
  db?: PrismaClient;
}) {
  return db.$transaction(async (tx) => {
    const cycle = await getCurrentCycle(tx);

    if (!cycle || !isGameplayWindowOpen(cycle, now)) {
      throw new GameError("Politics can only change during gameplay.");
    }

    const actor = await getActivePlayerFortressForPolitics({
      tx,
      cycleId: cycle.id,
      userId,
    });
    const target = await getTargetPlayerFortressForPolitics({
      tx,
      cycleId: cycle.id,
      targetFortressId,
    });

    if (actor.id === target.id) {
      throw new GameError("You cannot betray yourself.");
    }

    const pair = getCanonicalDiplomacyPair(actor.id, target.id);
    const relation = await tx.diplomacyRelation.findUnique({
      where: {
        cycleId_fortressAId_fortressBId: { cycleId: cycle.id, ...pair },
      },
    });

    if (!relation || relation.status !== DiplomacyRelationStatus.ALLIED) {
      throw new GameError("Only an active alliance can be betrayed.");
    }

    await tx.fortress.update({
      where: { id: target.id },
      data: {
        gold: { increment: relation.allianceEscrowGoldEach * 2 },
        food: { increment: relation.allianceEscrowFoodEach * 2 },
      },
    });

    return tx.diplomacyRelation.update({
      where: { id: relation.id },
      data: {
        status: DiplomacyRelationStatus.WAR,
        warDeclaredById: actor.id,
        warDeclaredAt: now,
        warStartsAt: now,
        betrayedById: actor.id,
        betrayedAt: now,
        allianceTrustTier: 0,
        allianceEscrowGoldEach: 0,
        allianceEscrowFoodEach: 0,
        trustUpgradeProposedById: null,
        trustUpgradeProposedAt: null,
        trustUpgradeTier: null,
      },
    });
  }, SERVICE_TRANSACTION_OPTIONS);
}

export async function declareWar({
  userId,
  targetFortressId,
  now = new Date(),
  db = prisma,
}: {
  userId: string;
  targetFortressId: string;
  now?: Date;
  db?: PrismaClient;
}) {
  return db.$transaction(async (tx) => {
    const cycle = await getCurrentCycle(tx);

    if (!cycle || !isGameplayWindowOpen(cycle, now)) {
      throw new GameError("Politics can only change during gameplay.");
    }

    const actor = await getActivePlayerFortressForPolitics({
      tx,
      cycleId: cycle.id,
      userId,
    });
    const target = await getTargetPlayerFortressForPolitics({
      tx,
      cycleId: cycle.id,
      targetFortressId,
    });

    if (actor.id === target.id) {
      throw new GameError("You cannot declare war on yourself.");
    }

    const pair = getCanonicalDiplomacyPair(actor.id, target.id);
    const existing = await tx.diplomacyRelation.findUnique({
      where: {
        cycleId_fortressAId_fortressBId: {
          cycleId: cycle.id,
          ...pair,
        },
      },
    });
    const effectiveStatus = getEffectiveDiplomacyStatus({
      relation: existing,
      now,
    });

    if (effectiveStatus === DiplomacyRelationStatus.ALLIED) {
      throw new GameError("Use betrayal to break an alliance and begin immediate war.");
    }

    if (effectiveStatus === DiplomacyRelationStatus.WAR) {
      return existing
        ? tx.diplomacyRelation.update({
            where: {
              id: existing.id,
            },
            data: {
              status: DiplomacyRelationStatus.WAR,
              warStartsAt: existing.warStartsAt ?? now,
            },
          })
        : tx.diplomacyRelation.create({
            data: {
              cycleId: cycle.id,
              ...pair,
              status: DiplomacyRelationStatus.WAR,
              warDeclaredById: actor.id,
              warDeclaredAt: now,
              warStartsAt: now,
            },
          });
    }

    if (
      existing?.status === DiplomacyRelationStatus.WAR_PENDING &&
      existing.warStartsAt &&
      existing.warStartsAt > now
    ) {
      return existing;
    }

    const warStartsAt = getWarStartsAt(now);

    return tx.diplomacyRelation.upsert({
      where: {
        cycleId_fortressAId_fortressBId: {
          cycleId: cycle.id,
          ...pair,
        },
      },
      create: {
        cycleId: cycle.id,
        ...pair,
        status: DiplomacyRelationStatus.WAR_PENDING,
        warDeclaredById: actor.id,
        warDeclaredAt: now,
        warStartsAt,
      },
      update: {
        status: DiplomacyRelationStatus.WAR_PENDING,
        allianceProposedById: null,
        allianceProposedAt: null,
        warDeclaredById: actor.id,
        warDeclaredAt: now,
        warStartsAt,
        peaceProposedById: null,
        peaceProposedAt: null,
      },
    });
  }, SERVICE_TRANSACTION_OPTIONS);
}

export async function proposePeace({
  userId,
  targetFortressId,
  now = new Date(),
  db = prisma,
}: {
  userId: string;
  targetFortressId: string;
  now?: Date;
  db?: PrismaClient;
}) {
  return db.$transaction(async (tx) => {
    const cycle = await getCurrentCycle(tx);

    if (!cycle || !isGameplayWindowOpen(cycle, now)) {
      throw new GameError("Politics can only change during gameplay.");
    }

    const actor = await getActivePlayerFortressForPolitics({
      tx,
      cycleId: cycle.id,
      userId,
    });
    const target = await getTargetPlayerFortressForPolitics({
      tx,
      cycleId: cycle.id,
      targetFortressId,
    });

    if (actor.id === target.id) {
      throw new GameError("You cannot propose peace with yourself.");
    }

    const pair = getCanonicalDiplomacyPair(actor.id, target.id);
    const relation = await tx.diplomacyRelation.findUnique({
      where: {
        cycleId_fortressAId_fortressBId: {
          cycleId: cycle.id,
          ...pair,
        },
      },
    });

    if (!relation) {
      throw new GameError("You are already at peace.");
    }

    if (relation.status === DiplomacyRelationStatus.PEACE_PENDING) {
      return relation;
    }

    const effectiveStatus = getEffectiveDiplomacyStatus({ relation, now });

    if (!canProposePeace(effectiveStatus)) {
      throw new GameError("Peace can only be proposed from a hostile relation.");
    }

    return tx.diplomacyRelation.update({
      where: {
        id: relation.id,
      },
      data: {
        status: DiplomacyRelationStatus.PEACE_PENDING,
        peaceProposedById: actor.id,
        peaceProposedAt: now,
      },
    });
  }, SERVICE_TRANSACTION_OPTIONS);
}

export async function acceptPeace({
  userId,
  targetFortressId,
  now = new Date(),
  db = prisma,
}: {
  userId: string;
  targetFortressId: string;
  now?: Date;
  db?: PrismaClient;
}) {
  return db.$transaction(async (tx) => {
    const cycle = await getCurrentCycle(tx);

    if (!cycle || !isGameplayWindowOpen(cycle, now)) {
      throw new GameError("Politics can only change during gameplay.");
    }

    const actor = await getActivePlayerFortressForPolitics({
      tx,
      cycleId: cycle.id,
      userId,
    });
    const target = await getTargetPlayerFortressForPolitics({
      tx,
      cycleId: cycle.id,
      targetFortressId,
    });

    if (actor.id === target.id) {
      throw new GameError("You cannot accept peace with yourself.");
    }

    const pair = getCanonicalDiplomacyPair(actor.id, target.id);
    const relation = await tx.diplomacyRelation.findUnique({
      where: {
        cycleId_fortressAId_fortressBId: {
          cycleId: cycle.id,
          ...pair,
        },
      },
    });

    if (!relation || relation.status !== DiplomacyRelationStatus.PEACE_PENDING) {
      throw new GameError("There is no peace proposal to accept.");
    }

    if (relation.peaceProposedById === actor.id) {
      throw new GameError("The other fortress must accept your peace proposal.");
    }

    return tx.diplomacyRelation.update({
      where: {
        id: relation.id,
      },
      data: {
        status: DiplomacyRelationStatus.NEUTRAL,
        warDeclaredById: null,
        warDeclaredAt: null,
        warStartsAt: null,
        peaceProposedById: null,
        peaceProposedAt: null,
        collateralGold: 0,
        collateralFood: 0,
        collateralArmy: 0,
      },
    });
  }, SERVICE_TRANSACTION_OPTIONS);
}

export async function attackMapHex({
  userId,
  tileId,
  sentArmy = 1,
  now = new Date(),
  db = prisma,
}: {
  userId: string;
  tileId: string;
  sentArmy?: number;
  now?: Date;
  db?: PrismaClient;
}): Promise<AttackMapHexResult> {
  await ensureHomeOfABossSchema(db);

  return db.$transaction(async (tx) => {
    const cycle = await getCurrentCycle(tx);

    if (!cycle || !isGameplayWindowOpen(cycle, now)) {
      throw new GameError("The current cycle is not accepting tile attacks.");
    }

    const tile = getTileById(tileId);

    if (!tile || !tile.claimable) {
      throw new GameError("That map tile cannot be attacked.");
    }

    if (!Number.isInteger(sentArmy) || sentArmy <= 0) {
      throw new GameError("You must send at least 1 army.");
    }

    const attacker = await tx.fortress.findUnique({
      where: {
        cycleId_ownerId: {
          cycleId: cycle.id,
          ownerId: userId,
        },
      },
      select: {
        id: true,
        ownerId: true,
        name: true,
        points: true,
        army: true,
        level: true,
        race: true,
        mapX: true,
        mapY: true,
        unitSpriteVariant: true,
        owner: {
          select: {
            unitCosmeticVariant: true,
          },
        },
      },
    });

    if (!attacker) {
      throw new GameError("You are not participating in the active cycle.");
    }

    if (!attacker.race) {
      throw new GameError("Choose a race before attacking tiles.");
    }

    if (sentArmy > attacker.army) {
      throw new GameError(
        "You do not have enough army to send that many units."
      );
    }

    const ownership = await tx.mapHexOwnership.findUnique({
      where: {
        cycleId_tileId: {
          cycleId: cycle.id,
          tileId,
        },
      },
      include: {
        ownerFortress: {
          select: {
            id: true,
            name: true,
            ownerId: true,
            points: true,
            army: true,
            mapX: true,
            mapY: true,
            race: true,
          },
        },
      },
    });

    const isHomeOfA = isHomeOfATile(tileId);

    const homeHasActiveHolders = isHomeOfA
      ? (await tx.fortressGarrison.count({
          where: {
            cycleId: cycle.id,
            tileId: HOME_OF_A_TILE_ID,
            army: {
              gt: 0,
            },
            fortress: {
              homeOfAHoldings: {
                some: {
                  cycleId: cycle.id,
                },
              },
            },
          },
        })) > 0
      : false;
    const effectiveOwnership =
      isHomeOfA && ownership && !homeHasActiveHolders ? null : ownership;

    if (!effectiveOwnership && !isHomeOfA) {
      throw new GameError("Neutral tiles must be pressured, not attacked.");
    }

    if (effectiveOwnership?.ownerFortressId === attacker.id) {
      throw new GameError("You already own that tile.");
    }

    const activeBattle = await tx.battlefield.findFirst({
      where: {
        cycleId: cycle.id,
        targetTileId: tileId,
        status: "ACTIVE",
      },
      select: {
        id: true,
      },
    });

    if (activeBattle && !isHomeOfA) {
      throw new GameError("That tile is already contested.");
    }

    if (!isHomeOfA) {
      const ownedTileIds = await tx.mapHexOwnership.findMany({
        where: {
          cycleId: cycle.id,
          ownerFortressId: attacker.id,
        },
        select: {
          tileId: true,
        },
      });
      const ownedNormalTileIds = ownedTileIds
        .map((ownedTile) => ownedTile.tileId)
        .filter((ownedTileId) => !isHomeOfATile(ownedTileId));
      const diplomacyRelation = effectiveOwnership?.ownerFortressId
        ? await tx.diplomacyRelation.findUnique({
            where: {
              cycleId_fortressAId_fortressBId: {
                cycleId: cycle.id,
                ...getCanonicalDiplomacyPair(
                  attacker.id,
                  effectiveOwnership.ownerFortressId
                ),
              },
            },
            select: {
              status: true,
              warStartsAt: true,
            },
          })
        : null;
      const blockedReason = getTileAttackBlockedReason({
        tile,
        tileId,
        ownerFortressId: effectiveOwnership?.ownerFortressId ?? null,
        attackerFortress: attacker,
        ownedTileIds: ownedNormalTileIds,
        hasActiveBattle: Boolean(activeBattle),
        diplomacyRelation,
        now,
        isHomeOfA: isHomeOfATile,
        isConnected: ({ tileId: candidateTileId, ownedTileIds }) =>
          isTileConnectedToFortressOrOwnedTiles({
            tileId: candidateTileId,
            fortress: attacker,
            ownedTileIds,
          }),
      });

      if (blockedReason) {
        throw new GameError(blockedReason);
      }
    }

    const outboundAttackCount = await tx.attackUnit.count({
      where: {
        attackerFortressId: attacker.id,
        resolvedAt: null,
        cancelledAt: null,
      },
    });
    const effectiveRace = (await isFortressFactionSuppressed(
      tx,
      attacker.id,
      now
    ))
      ? null
      : attacker.race;
    const maxAttacks = getMaxSimultaneousAttacks(attacker.level, effectiveRace);

    if (outboundAttackCount >= maxAttacks) {
      throw new GameError(
        `You have reached the maximum number of simultaneous attacks (${maxAttacks}).`
      );
    }

    if (isHomeOfA) {
      const homePosition = getHomeOfAMapPosition();
      let homeBoss = await tx.fortress.findFirst({
        where: {
          cycleId: cycle.id,
          fortressKind: FortressKind.MEGA,
          isNpc: true,
        },
        select: {
          id: true,
          name: true,
          ownerId: true,
          points: true,
          army: true,
          health: true,
          maxHealth: true,
          mapX: true,
          mapY: true,
          race: true,
        },
      });

      if (!homeBoss) {
        throw new GameError("Home of A is not available in this cycle yet.");
      }

      if (cycle.homeOfABossRespawnsAt && cycle.homeOfABossRespawnsAt <= now) {
        const respawnHealth = getHomeOfABossHealth(
          cycle.megaFortressDestroyCount
        );

        homeBoss = await tx.fortress.update({
          where: {
            id: homeBoss.id,
          },
          data: {
            health: respawnHealth,
            maxHealth: respawnHealth,
          },
          select: {
            id: true,
            name: true,
            ownerId: true,
            points: true,
            army: true,
            health: true,
            maxHealth: true,
            mapX: true,
            mapY: true,
            race: true,
          },
        });
        await tx.cycle.update({
          where: {
            id: cycle.id,
          },
          data: {
            homeOfABossRespawnsAt: null,
          },
        });
      }

      if (homeBoss.health <= 0) {
        throw new GameError("Home of A is defeated and waiting to respawn.");
      }

      const launchedUnit = await launchAttackUnit({
        db: tx,
        cycle,
        attacker,
        target: {
          ...homeBoss,
          mapX: homePosition.mapX,
          mapY: homePosition.mapY,
        },
        launchedAt: now,
        armyAmount: sentArmy,
      });

      if (!launchedUnit) {
        throw new GameError(
          "That Home of A attack would arrive after the cycle ends."
        );
      }

      if (activeBattle) {
        await tx.attackUnit.update({
          where: {
            id: launchedUnit.id,
          },
          data: {
            reinforcementBattlefieldId: activeBattle.id,
            reinforcementSide: BattlefieldSide.ATTACKER,
          },
        });
      }

      return {
        battlefieldId: activeBattle?.id ?? null,
        launchedAttackUnit: toAttackUnitLaunchMarker({
          unit: launchedUnit,
          attacker,
          target: {
            id: homeBoss.id,
            name: homeBoss.name,
            mapX: homePosition.mapX,
            mapY: homePosition.mapY,
          },
        }),
      };
    }

    const targetFortress = effectiveOwnership?.ownerFortress ?? null;

    if (!targetFortress) {
      throw new GameError("That tile has no attack target.");
    }

    const battlefieldTarget = {
      ...targetFortress,
      mapX: Math.round(tile.xPercent),
      mapY: Math.round(tile.yPercent),
    };

    const battlefield = await tx.battlefield.create({
      data: {
        cycleId: cycle.id,
        targetFortressId: targetFortress.id,
        targetTileId: tileId,
        attackerBannerFortressId: attacker.id,
        defenderBannerFortressId: effectiveOwnership?.ownerFortressId ?? null,
        attackerArmyRemaining: 0,
        defenderArmyRemaining: 0,
        pointsReward: 0,
        foodReward: 0,
        startedAt: now,
      },
      select: {
        id: true,
      },
    });

    if (effectiveOwnership) {
      const tileGarrisons = await tx.fortressGarrison.findMany({
        where: {
          cycleId: cycle.id,
          tileId,
          army: {
            gt: 0,
          },
          fortressId: {
            not: attacker.id,
          },
        },
        select: {
          id: true,
          fortressId: true,
          army: true,
          maintenanceDrains: true,
        },
      });
      const garrisonsByFortressId = new Map<
        string,
        { army: number; maintenanceDrains: boolean }
      >();

      for (const garrison of tileGarrisons) {
        const current = garrisonsByFortressId.get(garrison.fortressId) ?? {
          army: 0,
          maintenanceDrains: false,
        };

        garrisonsByFortressId.set(garrison.fortressId, {
          army: current.army + garrison.army,
          maintenanceDrains:
            current.maintenanceDrains || garrison.maintenanceDrains,
        });
      }

      const defendingGarrisonArmy = Array.from(
        garrisonsByFortressId.values()
      ).reduce((sum, garrison) => sum + garrison.army, 0);

      if (defendingGarrisonArmy > 0) {
        await tx.battlefieldParticipant.createMany({
          data: Array.from(garrisonsByFortressId.entries()).map(
            ([fortressId, garrison]) => ({
              battlefieldId: battlefield.id,
              fortressId,
              side: BattlefieldSide.DEFENDER,
              armyCommitted: garrison.army,
              armyRemaining: garrison.army,
              maintenanceDrains: garrison.maintenanceDrains,
              joinedAt: now,
            })
          ),
        });
        await tx.battlefield.update({
          where: {
            id: battlefield.id,
          },
          data: {
            defenderArmyRemaining: {
              increment: defendingGarrisonArmy,
            },
          },
        });
        await tx.fortressGarrison.deleteMany({
          where: {
            id: {
              in: tileGarrisons.map((garrison) => garrison.id),
            },
          },
        });
      }
    }

    const launchedUnit = await launchAttackUnit({
      db: tx,
      cycle,
      attacker,
      target: battlefieldTarget,
      launchedAt: now,
      armyAmount: sentArmy,
    });

    if (!launchedUnit) {
      throw new GameError(
        "That tile attack would arrive after the cycle ends."
      );
    }

    await tx.attackUnit.update({
      where: {
        id: launchedUnit.id,
      },
      data: {
        reinforcementBattlefieldId: battlefield.id,
        reinforcementSide: BattlefieldSide.ATTACKER,
      },
    });
    await tx.battlefield.update({
      where: {
        id: battlefield.id,
      },
      data: {
        startedAt: addHours(launchedUnit.arrivesAt, 1),
      },
    });

    return {
      battlefieldId: battlefield.id,
      launchedAttackUnit: toAttackUnitLaunchMarker({
        unit: launchedUnit,
        attacker,
        target: {
          id: targetFortress.id,
          name: targetFortress.name,
          mapX: battlefieldTarget.mapX,
          mapY: battlefieldTarget.mapY,
        },
      }),
    };
  });
}

export async function fortifyMapHex({
  userId,
  tileId,
  armyAmount,
  now = new Date(),
  db = prisma,
}: {
  userId: string;
  tileId: string;
  armyAmount: number;
  now?: Date;
  db?: PrismaClient;
}): Promise<AttackUnitLaunchMarker> {
  return db.$transaction(async (tx) => {
    const cycle = await getCurrentCycle(tx);

    if (!cycle || !isGameplayWindowOpen(cycle, now)) {
      throw new GameError("The current cycle is not accepting fortifications.");
    }

    const tile = getTileById(tileId);

    if (!tile && !isHomeOfATile(tileId)) {
      throw new GameError("That map tile cannot be fortified.");
    }

    if (isHomeOfATile(tileId)) {
      throw new GameError("Home of A is a daily boss and cannot be fortified.");
    }

    if (!Number.isInteger(armyAmount) || armyAmount <= 0) {
      throw new GameError("Fortify with at least 1 army.");
    }

    const fortress = await tx.fortress.findUnique({
      where: {
        cycleId_ownerId: {
          cycleId: cycle.id,
          ownerId: userId,
        },
      },
      select: {
        id: true,
        ownerId: true,
        name: true,
        points: true,
        army: true,
        level: true,
        race: true,
        mapX: true,
        mapY: true,
        unitSpriteVariant: true,
        owner: {
          select: {
            unitCosmeticVariant: true,
          },
        },
      },
    });

    if (!fortress) {
      throw new GameError("You are not participating in the active cycle.");
    }

    if (fortress.army < armyAmount) {
      throw new GameError(
        "You do not have enough idle army to fortify that tile."
      );
    }

    const ownership = await tx.mapHexOwnership.findUnique({
      where: {
        cycleId_tileId: {
          cycleId: cycle.id,
          tileId,
        },
      },
      select: {
        ownerFortressId: true,
      },
    });

    if (!ownership || ownership.ownerFortressId !== fortress.id) {
      throw new GameError("You can only fortify tiles you own.");
    }

    const activeBattle = await tx.battlefield.findFirst({
      where: {
        cycleId: cycle.id,
        targetTileId: tileId,
        status: BattlefieldStatus.ACTIVE,
      },
      select: {
        id: true,
      },
    });

    if (activeBattle) {
      throw new GameError("That tile is already contested.");
    }

    const outboundAttackCount = await tx.attackUnit.count({
      where: {
        attackerFortressId: fortress.id,
        resolvedAt: null,
        cancelledAt: null,
      },
    });
    const effectiveRace = (await isFortressFactionSuppressed(
      tx,
      fortress.id,
      now
    ))
      ? null
      : fortress.race;
    const maxAttacks = getMaxSimultaneousAttacks(fortress.level, effectiveRace);

    if (outboundAttackCount >= maxAttacks) {
      throw new GameError(
        `You have reached the maximum number of simultaneous attacks (${maxAttacks}).`
      );
    }

    const tilePosition = isHomeOfATile(tileId)
      ? getHomeOfAMapPosition()
      : {
          mapX: Math.round(tile?.xPercent ?? fortress.mapX),
          mapY: Math.round(tile?.yPercent ?? fortress.mapY),
        };
    const target = {
      ...fortress,
      mapX: tilePosition.mapX,
      mapY: tilePosition.mapY,
    };
    const launchedUnit = await launchAttackUnit({
      db: tx,
      cycle,
      attacker: fortress,
      target,
      launchedAt: now,
      armyAmount,
      fortifyTargetTileId: tileId,
    });

    if (!launchedUnit) {
      throw new GameError(
        "That fortification would arrive after the cycle ends."
      );
    }

    return toAttackUnitLaunchMarker({
      unit: launchedUnit,
      attacker: fortress,
      target: {
        id: tileId,
        name: isHomeOfATile(tileId) ? "Home of A" : `Tile ${tileId}`,
        mapX: tilePosition.mapX,
        mapY: tilePosition.mapY,
      },
    });
  });
}

export async function joinBattlefield({
  userId,
  battlefieldId,
  side,
  armyAmount,
  now = new Date(),
  db = prisma,
}: {
  userId: string;
  battlefieldId: string;
  side: BattlefieldSide | string;
  armyAmount: number;
  now?: Date;
  db?: PrismaClient;
}) {
  const normalizedSide =
    side === BattlefieldSide.DEFENDER
      ? BattlefieldSide.DEFENDER
      : BattlefieldSide.ATTACKER;

  return joinBattlefieldRecord({
    db,
    userId,
    battlefieldId,
    side: normalizedSide,
    armyAmount,
    now,
  });
}

export async function recallAttackUnit({
  userId,
  attackUnitId,
  instant = false,
  now = new Date(),
  db = prisma,
}: {
  userId: string;
  attackUnitId: string;
  instant?: boolean;
  now?: Date;
  db?: PrismaClient;
}) {
  return db.$transaction(
    async (tx) => {
      const cycle = await getCurrentCycle(tx);

      if (
        !cycle ||
        (cycle.status !== CycleStatus.ACTIVE &&
          cycle.status !== CycleStatus.TESTING)
      ) {
        throw new GameError("The battlefield is not accepting active actions.");
      }

      return recallAttackUnitRecord({
        db: tx,
        cycle,
        userId,
        attackUnitId,
        instant,
        now,
      });
    },
    {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    }
  );
}

export async function instantRecallGarrison({
  userId,
  garrisonId,
  now = new Date(),
  db = prisma,
}: {
  userId: string;
  garrisonId: string;
  now?: Date;
  db?: PrismaClient;
}) {
  return db.$transaction(
    async (tx) => {
      const cycle = await getCurrentCycle(tx);

      if (
        !cycle ||
        (cycle.status !== CycleStatus.ACTIVE &&
          cycle.status !== CycleStatus.TESTING)
      ) {
        throw new GameError("The battlefield is not accepting active actions.");
      }

      return instantRecallGarrisonRecord({
        db: tx,
        garrisonId,
        userId,
        now,
      });
    },
    {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    }
  );
}

export async function recallBattlefieldArmy({
  userId,
  battlefieldId,
  armyAmount,
  now = new Date(),
  db = prisma,
}: {
  userId: string;
  battlefieldId: string;
  armyAmount: number;
  now?: Date;
  db?: PrismaClient;
}) {
  return db.$transaction(
    async (tx) => {
      const cycle = await getCurrentCycle(tx);

      if (
        !cycle ||
        (cycle.status !== CycleStatus.ACTIVE &&
          cycle.status !== CycleStatus.TESTING)
      ) {
        throw new GameError("The battlefield is not accepting active actions.");
      }

      return recallBattlefieldArmyWithCycle({
        tx,
        cycle,
        userId,
        battlefieldId,
        armyAmount,
        now,
      });
    },
    {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    }
  );
}

async function recallBattlefieldArmyWithCycle({
  tx,
  cycle,
  userId,
  battlefieldId,
  armyAmount,
  now,
}: {
  tx: Prisma.TransactionClient;
  cycle: {
    id: string;
    status: CycleStatus;
    activeStartedAt: Date | null;
  };
  userId: string;
  battlefieldId: string;
  armyAmount: number;
  now: Date;
}) {
  const battlefield = await tx.battlefield.findUnique({
    where: {
      id: battlefieldId,
    },
    select: {
      id: true,
      cycleId: true,
      targetFortressId: true,
      targetTileId: true,
      status: true,
      participants: {
        where: {
          fortress: {
            ownerId: userId,
          },
        },
        select: {
          id: true,
          side: true,
          armyRemaining: true,
          fortress: {
            select: {
              id: true,
              ownerId: true,
              mapX: true,
              mapY: true,
              race: true,
            },
          },
        },
      },
      targetFortress: {
        select: {
          id: true,
          mapX: true,
          mapY: true,
        },
      },
    },
  });

  const participant = battlefield?.participants[0] ?? null;

  if (
    !battlefield ||
    battlefield.cycleId !== cycle.id ||
    battlefield.status !== BattlefieldStatus.ACTIVE ||
    !participant
  ) {
    throw new GameError("That battlefield army is not available to recall.");
  }

  const recalledArmy = normalizeRecallAmount(
    armyAmount,
    participant.armyRemaining
  );
  const targetTile = battlefield.targetTileId
    ? getTileById(battlefield.targetTileId)
    : null;
  const homePosition =
    battlefield.targetTileId && isHomeOfATile(battlefield.targetTileId)
      ? getHomeOfAMapPosition()
      : null;
  const origin = homePosition
    ? {
        mapX: homePosition.mapX,
        mapY: homePosition.mapY,
      }
    : targetTile
      ? {
          mapX: Math.round(targetTile.xPercent),
          mapY: Math.round(targetTile.yPercent),
        }
      : battlefield.targetFortress
        ? {
            mapX: battlefield.targetFortress.mapX,
            mapY: battlefield.targetFortress.mapY,
          }
        : {
            mapX: participant.fortress.mapX,
            mapY: participant.fortress.mapY,
          };

  if (recalledArmy === participant.armyRemaining) {
    await tx.battlefieldParticipant.delete({
      where: {
        id: participant.id,
      },
    });
  } else {
    await tx.battlefieldParticipant.update({
      where: {
        id: participant.id,
      },
      data: {
        armyRemaining: {
          decrement: recalledArmy,
        },
        armyCommitted: {
          decrement: recalledArmy,
        },
      },
    });
  }

  await tx.battlefield.update({
    where: {
      id: battlefield.id,
    },
    data:
      participant.side === BattlefieldSide.ATTACKER
        ? {
            attackerArmyRemaining: {
              decrement: recalledArmy,
            },
          }
        : {
            defenderArmyRemaining: {
              decrement: recalledArmy,
            },
          },
  });

  return createReturningArmyMarker({
    db: tx,
    cycle,
    fortress: participant.fortress,
    origin,
    targetFortressId: battlefield.targetFortressId ?? participant.fortress.id,
    armyAmount: recalledArmy,
    now,
  });
}

export async function recallGarrisonArmy({
  userId,
  garrisonId,
  armyAmount,
  now = new Date(),
  db = prisma,
}: {
  userId: string;
  garrisonId: string;
  armyAmount: number;
  now?: Date;
  db?: PrismaClient;
}) {
  return db.$transaction(
    async (tx) => {
      const cycle = await getCurrentCycle(tx);

      if (
        !cycle ||
        (cycle.status !== CycleStatus.ACTIVE &&
          cycle.status !== CycleStatus.TESTING)
      ) {
        throw new GameError("The battlefield is not accepting active actions.");
      }

      return recallGarrisonArmyWithCycle({
        tx,
        cycle,
        userId,
        garrisonId,
        armyAmount,
        now,
      });
    },
    {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    }
  );
}

async function recallGarrisonArmyWithCycle({
  tx,
  cycle,
  userId,
  garrisonId,
  armyAmount,
  now,
}: {
  tx: Prisma.TransactionClient;
  cycle: {
    id: string;
    status: CycleStatus;
    activeStartedAt: Date | null;
  };
  userId: string;
  garrisonId: string;
  armyAmount: number;
  now: Date;
}) {
  const garrison = await tx.fortressGarrison.findUnique({
    where: {
      id: garrisonId,
    },
    select: {
      id: true,
      cycleId: true,
      tileId: true,
      army: true,
      fortress: {
        select: {
          id: true,
          ownerId: true,
          mapX: true,
          mapY: true,
          race: true,
        },
      },
    },
  });

  if (
    !garrison ||
    !garrison.fortress ||
    garrison.cycleId !== cycle.id ||
    garrison.fortress.ownerId !== userId
  ) {
    throw new GameError("That garrison is not available to recall.");
  }

  const recalledArmy = normalizeRecallAmount(armyAmount, garrison.army);
  const tile = getTileById(garrison.tileId);
  const homePosition = isHomeOfATile(garrison.tileId)
    ? getHomeOfAMapPosition()
    : null;
  const origin = homePosition
    ? {
        mapX: homePosition.mapX,
        mapY: homePosition.mapY,
      }
    : tile
      ? {
          mapX: Math.round(tile.xPercent),
          mapY: Math.round(tile.yPercent),
        }
      : {
          mapX: garrison.fortress.mapX,
          mapY: garrison.fortress.mapY,
        };

  if (recalledArmy === garrison.army) {
    await tx.fortressGarrison.delete({
      where: {
        id: garrison.id,
      },
    });
  } else {
    await tx.fortressGarrison.update({
      where: {
        id: garrison.id,
      },
      data: {
        army: {
          decrement: recalledArmy,
        },
      },
    });
  }

  if (isHomeOfATile(garrison.tileId)) {
    const holder = await tx.homeOfAHolder.findUnique({
      where: {
        cycleId_fortressId: {
          cycleId: cycle.id,
          fortressId: garrison.fortress.id,
        },
      },
      select: {
        id: true,
        contributionWeight: true,
      },
    });

    if (holder) {
      const nextContributionWeight =
        recalledArmy === garrison.army
          ? 0
          : Math.max(0, holder.contributionWeight - recalledArmy);

      if (nextContributionWeight <= 0) {
        await tx.homeOfAHolder.delete({
          where: {
            id: holder.id,
          },
        });
      } else {
        await tx.homeOfAHolder.update({
          where: {
            id: holder.id,
          },
          data: {
            contributionWeight: nextContributionWeight,
          },
        });
      }
    }
  }

  return createReturningArmyMarker({
    db: tx,
    cycle,
    fortress: garrison.fortress,
    origin,
    targetFortressId: garrison.fortress.id,
    armyAmount: recalledArmy,
    now,
  });
}

export type RecallAllUnitsResult = {
  recalledAttackUnits: number;
  recalledBattlefieldArmy: number;
  recalledGarrisonArmy: number;
};

export async function recallAllUnits({
  userId,
  now = new Date(),
  db = prisma,
}: {
  userId: string;
  now?: Date;
  db?: PrismaClient;
}) {
  return db.$transaction(
    async (tx) => {
      const cycle = await getCurrentCycle(tx);

      if (
        !cycle ||
        (cycle.status !== CycleStatus.ACTIVE &&
          cycle.status !== CycleStatus.TESTING)
      ) {
        throw new GameError("The battlefield is not accepting active actions.");
      }

      let recalledAttackUnits = 0;
      let recalledBattlefieldArmy = 0;
      let recalledGarrisonArmy = 0;

      const attackUnits = await tx.attackUnit.findMany({
        where: {
          cycleId: cycle.id,
          attackerFortress: {
            ownerId: userId,
          },
          resolvedAt: null,
          cancelledAt: null,
          recalledAt: null,
          arrivesAt: {
            gt: now,
          },
        },
        select: {
          id: true,
        },
      });

      for (const attackUnit of attackUnits) {
        await recallAttackUnitRecord({
          db: tx,
          cycle,
          userId,
          attackUnitId: attackUnit.id,
          now,
        });
        recalledAttackUnits += 1;
      }

      const participants = await tx.battlefieldParticipant.findMany({
        where: {
          fortress: {
            ownerId: userId,
          },
          armyRemaining: {
            gt: 0,
          },
          battlefield: {
            cycleId: cycle.id,
            status: BattlefieldStatus.ACTIVE,
          },
        },
        select: {
          battlefieldId: true,
          armyRemaining: true,
        },
      });

      for (const participant of participants) {
        await recallBattlefieldArmyWithCycle({
          tx,
          cycle,
          userId,
          battlefieldId: participant.battlefieldId,
          armyAmount: participant.armyRemaining,
          now,
        });
        recalledBattlefieldArmy += participant.armyRemaining;
      }

      const garrisons = await tx.fortressGarrison.findMany({
        where: {
          cycleId: cycle.id,
          army: {
            gt: 0,
          },
          fortress: {
            ownerId: userId,
          },
        },
        select: {
          id: true,
          army: true,
        },
      });

      for (const garrison of garrisons) {
        await recallGarrisonArmyWithCycle({
          tx,
          cycle,
          userId,
          garrisonId: garrison.id,
          armyAmount: garrison.army,
          now,
        });
        recalledGarrisonArmy += garrison.army;
      }

      if (
        recalledAttackUnits === 0 &&
        recalledBattlefieldArmy === 0 &&
        recalledGarrisonArmy === 0
      ) {
        throw new GameError("No units are currently available to recall.");
      }

      return {
        recalledAttackUnits,
        recalledBattlefieldArmy,
        recalledGarrisonArmy,
      } satisfies RecallAllUnitsResult;
    },
    {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    }
  );
}

export async function torchOccupiedMapHex({
  userId,
  garrisonId,
  db = prisma,
}: {
  userId: string;
  garrisonId: string;
  db?: PrismaClient;
}) {
  return db.$transaction(
    async (tx) => {
      const cycle = await getCurrentCycle(tx);

      if (
        !cycle ||
        (cycle.status !== CycleStatus.ACTIVE &&
          cycle.status !== CycleStatus.TESTING)
      ) {
        throw new GameError("The battlefield is not accepting active actions.");
      }

      const garrison = await tx.fortressGarrison.findUnique({
        where: {
          id: garrisonId,
        },
        select: {
          id: true,
          cycleId: true,
          tileId: true,
          fortressId: true,
          fortress: {
            select: {
              ownerId: true,
            },
          },
        },
      });

      if (
        !garrison ||
        !garrison.fortress ||
        garrison.cycleId !== cycle.id ||
        garrison.fortress.ownerId !== userId
      ) {
        throw new GameError("That garrison is not available to torch from.");
      }

      if (isHomeOfATile(garrison.tileId)) {
        throw new GameError("Home of A cannot be torched.");
      }

      const ownership = await tx.mapHexOwnership.findUnique({
        where: {
          cycleId_tileId: {
            cycleId: cycle.id,
            tileId: garrison.tileId,
          },
        },
        select: {
          ownerFortressId: true,
        },
      });

      if (!ownership) {
        throw new GameError("That tile is already neutral.");
      }

      if (ownership.ownerFortressId === garrison.fortressId) {
        throw new GameError("You cannot torch your own tile.");
      }

      const activeBattle = await tx.battlefield.findFirst({
        where: {
          cycleId: cycle.id,
          targetTileId: garrison.tileId,
          status: BattlefieldStatus.ACTIVE,
        },
        select: {
          id: true,
        },
      });

      if (activeBattle) {
        throw new GameError("That tile is already contested.");
      }

      await tx.mapHexOwnership.delete({
        where: {
          cycleId_tileId: {
            cycleId: cycle.id,
            tileId: garrison.tileId,
          },
        },
      });
      await tx.fortressGarrison.deleteMany({
        where: {
          cycleId: cycle.id,
          tileId: garrison.tileId,
        },
      });

      return {
        tileId: garrison.tileId,
      };
    },
    {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    }
  );
}

export async function selectFortressRace({
  userId,
  race,
  now = new Date(),
  db = prisma,
}: {
  userId: string;
  race: FortressRace | string;
  now?: Date;
  db?: PrismaClient;
}) {
  if (!isFortressRace(race)) {
    throw new GameError("Choose a valid race for this season.");
  }

  return db.$transaction(
    async (tx) => {
      const cycle = await getCurrentCycle(tx);

      if (!cycle || !isRaceSelectionWindowOpen(cycle, now)) {
        throw new GameError(
          "Race selection is only available before or during gameplay."
        );
      }

      if (
        cycle.status === CycleStatus.REGISTRATION &&
        (await isRaceSelectionLockedByCommunityWish({
          cycleId: cycle.id,
          now,
          db: tx,
        }))
      ) {
        throw new GameError(
          "Race selection opens after community wish voting closes."
        );
      }

      const fortress = await tx.fortress.findUnique({
        where: {
          cycleId_ownerId: {
            cycleId: cycle.id,
            ownerId: userId,
          },
        },
        select: {
          id: true,
          race: true,
          isNpc: true,
        },
      });

      if (!fortress || fortress.isNpc) {
        throw new GameError("You are not participating in the current cycle.");
      }

      if (fortress.race) {
        if (fortress.race === race) {
          return fortress;
        }

        throw new GameError("Your race is locked for this season.");
      }

      return tx.fortress.update({
        where: {
          id: fortress.id,
        },
        data: {
          race,
        },
      });
    },
    {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    }
  );
}

export async function updateWorkerAssignment({
  userId,
  minersAssigned,
  farmersAssigned,
  recruitersAssigned,
  pressureWorkersAssigned,
  now = new Date(),
  db = prisma,
}: {
  userId: string;
  minersAssigned: number;
  farmersAssigned: number;
  recruitersAssigned: number;
  pressureWorkersAssigned: number;
  now?: Date;
  db?: PrismaClient;
}) {
  return db.$transaction(
    async (tx) => {
      const cycle = await getCurrentCycle(tx);

      if (!cycle || !isGameplayWindowOpen(cycle, now)) {
        throw new GameError(
          "Worker assignments are only available during gameplay."
        );
      }

      const fortress = await tx.fortress.findUnique({
        where: {
          cycleId_ownerId: {
            cycleId: cycle.id,
            ownerId: userId,
          },
        },
        select: {
          id: true,
          level: true,
          race: true,
          isNpc: true,
        },
      });

      if (!fortress || fortress.isNpc) {
        throw new GameError("You are not participating in the active cycle.");
      }

      const ownedTileBiomes = await getOwnedTileBiomesForFortress({
        db: tx,
        cycleId: cycle.id,
        fortressId: fortress.id,
      });
      const extraPopulation = ownedTileBiomes.filter(
        (biome) => biome === "lake"
      ).length;

      assertWorkerAssignments({
        level: fortress.level,
        race: fortress.race,
        extraPopulation,
        minersAssigned,
        farmersAssigned,
        recruitersAssigned,
        pressureWorkersAssigned,
      });

      return tx.fortress.update({
        where: {
          id: fortress.id,
        },
        data: {
          minersAssigned,
          farmersAssigned,
          recruitersAssigned,
          pressureWorkersAssigned,
        },
      });
    },
    {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    }
  );
}

export async function renameActiveFortress({
  userId,
  fortressName,
  now = new Date(),
  db = prisma,
}: {
  userId: string;
  fortressName: string;
  now?: Date;
  db?: PrismaClient;
}) {
  const normalizedName = normalizeFortressName(fortressName);

  try {
    return await db.$transaction(async (tx) => {
      const cycle = await getCurrentCycle(tx);

      if (!cycle || !isActiveWindowOpen(cycle, now)) {
        throw new GameError(
          "Fortress renaming is only available during ACTIVE."
        );
      }

      const fortress = await tx.fortress.findUnique({
        where: {
          cycleId_ownerId: {
            cycleId: cycle.id,
            ownerId: userId,
          },
        },
      });

      if (!fortress) {
        throw new GameError("You are not participating in the active cycle.");
      }

      if (fortress.gold < ACTIVE_RENAME_COST) {
        throw new GameError(
          "You need at least 10 gold to rename your fortress."
        );
      }

      const updatedFortress = await tx.fortress.update({
        where: {
          id: fortress.id,
        },
        data: {
          name: normalizedName,
          gold: fortress.gold - ACTIVE_RENAME_COST,
        },
      });

      await tx.scoreEvent.create({
        data: {
          cycleId: cycle.id,
          fortressId: fortress.id,
          actorId: userId,
          eventType: ScoreEventType.RENAME_COST,
          delta: -ACTIVE_RENAME_COST,
        },
      });

      return updatedFortress;
    });
  } catch (error) {
    if (isUniqueConstraintError(error, ["cycleId", "name"])) {
      throw new GameError("That fortress name is already taken this cycle.");
    }

    throw error;
  }
}

export async function recruitArmy({
  userId,
  unitCount,
  now = new Date(),
  db = prisma,
}: {
  userId: string;
  unitCount: number;
  now?: Date;
  db?: PrismaClient;
}) {
  const normalizedUnitCount = Math.floor(unitCount);

  if (!Number.isInteger(normalizedUnitCount) || normalizedUnitCount <= 0) {
    throw new GameError("Recruit at least 1 army.");
  }

  return db.$transaction(
    async (tx) => {
      const cycle = await getCurrentCycle(tx);

      if (!cycle || !isGameplayWindowOpen(cycle, now)) {
        throw new GameError(
          "Army recruitment is only available during gameplay."
        );
      }

      const fortress = await tx.fortress.findUnique({
        where: {
          cycleId_ownerId: {
            cycleId: cycle.id,
            ownerId: userId,
          },
        },
        select: {
          id: true,
          gold: true,
          race: true,
          isNpc: true,
        },
      });

      if (!fortress || fortress.isNpc) {
        throw new GameError("You are not participating in the active cycle.");
      }

      if (!fortress.race) {
        throw new GameError("Choose a race before recruiting army.");
      }

      const goldCost = getRecruitmentCost(normalizedUnitCount);

      if (fortress.gold < goldCost) {
        throw new GameError(`You need ${goldCost} gold to recruit that army.`);
      }

      return tx.fortress.update({
        where: {
          id: fortress.id,
        },
        data: {
          gold: {
            decrement: goldCost,
          },
          recruitmentQueue: {
            increment: normalizedUnitCount,
          },
        },
        select: {
          id: true,
          gold: true,
          army: true,
          recruitmentQueue: true,
        },
      });
    },
    {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    }
  );
}

export async function shuffleFortressLocation({
  userId,
  useFreeTeleport = false,
  destinationTileId,
  now = new Date(),
  db = prisma,
}: {
  userId: string;
  useFreeTeleport?: boolean;
  destinationTileId?: string | null;
  now?: Date;
  db?: PrismaClient;
}) {
  return db.$transaction(async (tx) => {
    const cycle = await getCurrentCycle(tx);

    if (!cycle || !isGameplayWindowOpen(cycle, now)) {
      throw new GameError(
        "Fortress relocation is only available during gameplay."
      );
    }

    const fortress = await tx.fortress.findUnique({
      where: {
        cycleId_ownerId: {
          cycleId: cycle.id,
          ownerId: userId,
        },
      },
      select: {
        id: true,
        commanderName: true,
        name: true,
        gold: true,
        race: true,
        level: true,
        currentAction: true,
        mapX: true,
        mapY: true,
      },
    });

    if (!fortress) {
      throw new GameError("You are not participating in the active cycle.");
    }

    const locationShuffleCount = await getFortressLocationShuffleCount(
      tx,
      fortress.id
    );
    const freeTeleport = useFreeTeleport
      ? await tx.raceAbilityActivation.findFirst({
          where: {
            fortressId: fortress.id,
            kind: RaceAbilityKind.UNICORN_TELEPORT,
            consumedAt: null,
            expiresAt: {
              gt: now,
            },
          },
          orderBy: [{ expiresAt: "asc" }, { id: "asc" }],
        })
      : null;

    if (useFreeTeleport && !freeTeleport) {
      throw new GameError("You do not have an active Unicorn teleport token.");
    }

    if (useFreeTeleport && destinationTileId) {
      throw new GameError(
        "Unicorn teleport destination is chosen randomly right now."
      );
    }

    if (useFreeTeleport) {
      const activeTemporaryTeleport =
        await tx.unicornTemporaryTeleport.findFirst({
          where: {
            fortressId: fortress.id,
            returnedAt: null,
          },
          select: {
            id: true,
            returnAt: true,
          },
        });

      if (activeTemporaryTeleport) {
        throw new GameError(
          "Your previous Unicorn teleport has not returned home yet."
        );
      }
    }

    const shuffleCost = freeTeleport
      ? 0
      : getActiveLocationShuffleCost(locationShuffleCount);

    if (shuffleCost > 0 && fortress.gold < shuffleCost) {
      throw new GameError(
        `You need at least ${shuffleCost} gold to relocate right now.`
      );
    }

    const otherFortresses = await tx.fortress.findMany({
      where: {
        cycleId: cycle.id,
        id: {
          not: fortress.id,
        },
      },
      select: {
        mapX: true,
        mapY: true,
      },
    });
    const excludedKeys = new Set(
      otherFortresses.map((otherFortress) => {
        return getRenderedMapPositionKey(otherFortress);
      })
    );
    excludedKeys.add(getRenderedMapPositionKey(fortress));

    let nextPosition;

    if (destinationTileId) {
      const destinationTile = getTileById(destinationTileId);

      if (!destinationTile) {
        throw new GameError("Choose a valid destination tile.");
      }

      if (!destinationTile.spawnable) {
        throw new GameError("Castle Yeet can only land on a spawnable tile.");
      }

      const selectedPosition = {
        x: destinationTile.xPercent,
        y: destinationTile.yPercent,
      };
      const currentRenderedKey = getRenderedMapPositionKey(fortress);
      const destinationRenderedKey =
        getRenderedMapPositionKey(selectedPosition);

      if (destinationRenderedKey === currentRenderedKey) {
        throw new GameError("Choose a different destination tile.");
      }

      if (excludedKeys.has(destinationRenderedKey)) {
        throw new GameError("That destination tile is occupied right now.");
      }

      nextPosition = selectedPosition;
    } else {
      try {
        nextPosition = takeOpenSpawnPoint(
          buildFortressSpawnSeed({
            cycleId: cycle.id,
            purpose: "active:player-location-shuffle",
            activeStartedAt: cycle.activeStartedAt,
            tickAt: now,
            entropy: `${fortress.id}:${locationShuffleCount + 1}`,
          }),
          {
            excludedKeys,
            referencePoints: otherFortresses.map((otherFortress) => ({
              x: otherFortress.mapX,
              y: otherFortress.mapY,
            })),
            minSeparationDistance: 9,
            preferredEdgePadding: ACTIVE_EDGE_PADDING,
            scoreRandomness: 10,
          }
        );
      } catch {
        throw new GameError(
          "No alternate fortress location is available right now."
        );
      }
    }

    const cancelledAttackUnitCount = 0;

    const nextMapX = Math.round(nextPosition.x);
    const nextMapY = Math.round(nextPosition.y);

    await tx.$executeRaw(
      Prisma.sql`
        UPDATE "Fortress"
        SET
          "mapX" = ${nextMapX},
          "mapY" = ${nextMapY},
          "locationShuffleCount" = ${locationShuffleCount + 1},
          "gold" = ${fortress.gold - shuffleCost}
        WHERE "id" = ${fortress.id}
      `
    );

    await recalculateReturningAttackRoutes({
      db: tx,
      fortressId: fortress.id,
      oldDestination: {
        mapX: fortress.mapX,
        mapY: fortress.mapY,
      },
      newDestination: {
        mapX: nextMapX,
        mapY: nextMapY,
      },
      now,
    });

    if (shuffleCost > 0) {
      await tx.scoreEvent.create({
        data: {
          cycleId: cycle.id,
          fortressId: fortress.id,
          actorId: userId,
          eventType: "FORTRESS_LOCATION_SHUFFLE_COST" as ScoreEventType,
          delta: -shuffleCost,
          createdAt: now,
        },
      });
    }

    if (freeTeleport) {
      const decoyOwner = await tx.user.create({
        data: {},
        select: {
          id: true,
        },
      });
      const displayedCastleLevel = Math.max(
        1,
        getDisplayedCastleLevel(fortress.level)
      );

      const decoyFortress = await tx.fortress.create({
        data: {
          cycleId: cycle.id,
          ownerId: decoyOwner.id,
          commanderName: `${fortress.commanderName} Decoy ${locationShuffleCount + 1}`,
          name: `${fortress.name} Decoy ${locationShuffleCount + 1}`,
          race: fortress.race,
          fortressKind: FortressKind.UNICORN_DECOY,
          isNpc: true,
          health: 1,
          maxHealth: 1,
          unicornDecoySourceFortressId: fortress.id,
          unicornDecoyLevel: displayedCastleLevel,
          mapX: fortress.mapX,
          mapY: fortress.mapY,
          joinedAt: now,
        },
        select: {
          id: true,
        },
      });

      await tx.unicornTemporaryTeleport.create({
        data: {
          cycleId: cycle.id,
          fortressId: fortress.id,
          decoyFortressId: decoyFortress.id,
          originMapX: fortress.mapX,
          originMapY: fortress.mapY,
          temporaryMapX: nextMapX,
          temporaryMapY: nextMapY,
          startedAt: now,
          returnAt: addHours(now, 1),
        },
      });

      const activeSourceDecoys = await tx.fortress.findMany({
        where: {
          cycleId: cycle.id,
          fortressKind: FortressKind.UNICORN_DECOY,
          unicornDecoySourceFortressId: fortress.id,
          health: {
            gt: 0,
          },
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        select: {
          id: true,
        },
      });
      const decoysToDeactivate = activeSourceDecoys.slice(displayedCastleLevel);

      if (decoysToDeactivate.length > 0) {
        await tx.fortress.updateMany({
          where: {
            id: {
              in: decoysToDeactivate.map((decoy) => decoy.id),
            },
          },
          data: {
            health: 0,
          },
        });
      }

      await tx.raceAbilityActivation.update({
        where: {
          id: freeTeleport.id,
        },
        data: {
          consumedAt: now,
        },
      });
    }

    const updatedFortress = await tx.fortress.findUniqueOrThrow({
      where: {
        id: fortress.id,
      },
    });

    return {
      fortress: updatedFortress,
      shuffleCost,
      cancelledAttackUnitCount,
    };
  });
}

export async function purchaseFortressUpgrade({
  userId,
  specialization,
  now = new Date(),
  db = prisma,
}: {
  userId: string;
  specialization: CastleUpgradeSpecialization | string;
  now?: Date;
  db?: PrismaClient;
}) {
  if (!isCastleUpgradeSpecialization(specialization)) {
    throw new GameError("Choose a castle specialization for this upgrade.");
  }

  return db.$transaction(async (tx) => {
    const cycle = await getCurrentCycle(tx);

    if (!cycle || !isGameplayWindowOpen(cycle, now)) {
      throw new GameError(
        "Castle upgrades are only available during gameplay."
      );
    }

    const fortress = await tx.fortress.findUnique({
      where: {
        cycleId_ownerId: {
          cycleId: cycle.id,
          ownerId: userId,
        },
      },
      include: {
        castleUpgradeSpecializations: {
          select: {
            level: true,
            specialization: true,
          },
        },
      },
    });

    if (!fortress || fortress.isNpc) {
      throw new GameError("You are not participating in the active cycle.");
    }

    const activeUpgradeProject = await tx.castleUpgradeProject.findFirst({
      where: {
        fortressId: fortress.id,
        completedAt: null,
      },
      select: {
        id: true,
      },
    });

    if (activeUpgradeProject) {
      throw new GameError(
        "Your castle already has an upgrade under construction."
      );
    }

    const buildingLevels = countCastleSpecializations(
      fortress.castleUpgradeSpecializations
    );
    const currentBuildingLevel = buildingLevels[specialization];
    const maxBuildingLevel = getDisplayedCastleLevel(fortress.level);
    const upgradesKeep = specialization === CastleUpgradeSpecialization.DEFENSE;

    if (upgradesKeep && !canFortressLevelUp(fortress.level)) {
      throw new GameError("Your castle is already at the maximum level.");
    }

    if (!upgradesKeep && currentBuildingLevel >= maxBuildingLevel) {
      throw new GameError(
        `That building is already at the castle level cap (${maxBuildingLevel}).`
      );
    }

    const upgradeCost = upgradesKeep
      ? getFortressUpgradeCost(fortress.level)
      : getFortressUpgradeCost(currentBuildingLevel);

    if (upgradeCost === null) {
      throw new GameError("That building is already at the maximum level.");
    }

    if (fortress.gold < upgradeCost) {
      throw new GameError(
        `You need at least ${upgradeCost} gold for the next castle upgrade.`
      );
    }

    await tx.fortress.update({
      where: {
        id: fortress.id,
      },
      data: {
        gold: fortress.gold - upgradeCost,
      },
    });

    const targetLevel = currentBuildingLevel + 1;
    const upgradeProject = await tx.castleUpgradeProject.create({
      data: {
        cycleId: cycle.id,
        fortressId: fortress.id,
        level: targetLevel,
        specialization,
        goldCost: upgradeCost,
        startedAt: now,
        completesAt: addMinutes(
          now,
          getFortressUpgradeDurationMinutes(currentBuildingLevel)
        ),
      },
    });

    await tx.scoreEvent.create({
      data: {
        cycleId: cycle.id,
        fortressId: fortress.id,
        actorId: userId,
        eventType: ScoreEventType.FORTRESS_UPGRADE_PURCHASE,
        delta: -upgradeCost,
        createdAt: now,
      },
    });

    return upgradeProject;
  });
}

export async function choosePendingUpgradeSpecialization({
  userId,
  specialization,
  now = new Date(),
  db = prisma,
}: {
  userId: string;
  specialization: CastleUpgradeSpecialization | string;
  now?: Date;
  db?: PrismaClient;
}) {
  if (!isCastleUpgradeSpecialization(specialization)) {
    throw new GameError("Choose a castle specialization for this upgrade.");
  }

  return db.$transaction(async (tx) => {
    const cycle = await getCurrentCycle(tx);

    if (!cycle || !isGameplayWindowOpen(cycle, now)) {
      throw new GameError(
        "Castle specialization is only available during gameplay."
      );
    }

    const fortress = await tx.fortress.findUnique({
      where: {
        cycleId_ownerId: {
          cycleId: cycle.id,
          ownerId: userId,
        },
      },
    });

    if (!fortress || fortress.isNpc) {
      throw new GameError("You are not participating in the active cycle.");
    }

    const pendingLevel = await getPendingUpgradeSpecializationLevel(
      tx,
      fortress
    );

    if (pendingLevel === null) {
      throw new GameError("You do not have a pending castle specialization.");
    }

    return tx.castleUpgradeSpecializationChoice.create({
      data: {
        fortressId: fortress.id,
        level: pendingLevel,
        specialization,
        createdAt: now,
      },
    });
  });
}

export async function chooseDwarfGrudge({
  userId,
  targetFortressId,
  now = new Date(),
  db = prisma,
}: {
  userId: string;
  targetFortressId: string;
  now?: Date;
  db?: PrismaClient;
}) {
  return db.$transaction(async (tx) => {
    const cycle = await getCurrentCycle(tx);

    if (!cycle || cycle.status !== CycleStatus.ACTIVE) {
      throw new GameError(
        "Grudge Book is only available during the active season."
      );
    }

    const fortress = await tx.fortress.findUnique({
      where: {
        cycleId_ownerId: {
          cycleId: cycle.id,
          ownerId: userId,
        },
      },
      select: {
        id: true,
        race: true,
        isNpc: true,
      },
    });

    if (!fortress || fortress.isNpc || fortress.race !== "DWARFS") {
      throw new GameError("Only Dwarfs can use the Grudge Book.");
    }

    const ownedTileBiomes = await getOwnedTileBiomesForFortress({
      db: tx,
      cycleId: cycle.id,
      fortressId: fortress.id,
    });

    if (
      getRaceBuffTier({
        activeStartedAt: cycle.activeStartedAt,
        now,
        isActiveSeason: true,
        race: fortress.race,
        ownedTileBiomes,
      }) < 1
    ) {
      throw new GameError("Grudge Book has not unlocked yet.");
    }

    if (targetFortressId === fortress.id) {
      throw new GameError(
        "You cannot add your own fortress to the Grudge Book."
      );
    }

    const target = await tx.fortress.findFirst({
      where: {
        id: targetFortressId,
        cycleId: cycle.id,
        isNpc: false,
      },
      select: {
        id: true,
      },
    });

    if (!target) {
      throw new GameError("Choose a player fortress for the Grudge Book.");
    }

    await tx.dwarfGrudge.deleteMany({
      where: {
        fortressId: fortress.id,
        targetFortressId,
        NOT: {
          slot: 1,
        },
      },
    });

    return tx.dwarfGrudge.upsert({
      where: {
        fortressId_slot: {
          fortressId: fortress.id,
          slot: 1,
        },
      },
      update: {
        targetFortressId,
        bonusMultiplier: 1,
      },
      create: {
        fortressId: fortress.id,
        targetFortressId,
        slot: 1,
        bonusMultiplier: 1,
      },
    });
  });
}

export async function chooseDwarfTierThreeGrudge({
  userId,
  targetFortressId,
  doubleExisting = false,
  now = new Date(),
  db = prisma,
}: {
  userId: string;
  targetFortressId?: string;
  doubleExisting?: boolean;
  now?: Date;
  db?: PrismaClient;
}) {
  return db.$transaction(async (tx) => {
    const cycle = await getCurrentCycle(tx);

    if (!cycle || cycle.status !== CycleStatus.ACTIVE) {
      throw new GameError(
        "Grudge Book is only available during the active season."
      );
    }

    const fortress = await tx.fortress.findUnique({
      where: {
        cycleId_ownerId: {
          cycleId: cycle.id,
          ownerId: userId,
        },
      },
      select: {
        id: true,
        race: true,
        isNpc: true,
        dwarfGrudges: {
          orderBy: {
            slot: "asc",
          },
          select: {
            id: true,
            slot: true,
            bonusMultiplier: true,
          },
        },
      },
    });

    if (!fortress || fortress.isNpc || fortress.race !== "DWARFS") {
      throw new GameError("Only Dwarfs can use the Grudge Book.");
    }

    const ownedTileBiomes = await getOwnedTileBiomesForFortress({
      db: tx,
      cycleId: cycle.id,
      fortressId: fortress.id,
    });

    if (
      getRaceBuffTier({
        activeStartedAt: cycle.activeStartedAt,
        now,
        isActiveSeason: true,
        race: fortress.race,
        ownedTileBiomes,
      }) < 2
    ) {
      throw new GameError("The second Grudge Book entry has not unlocked yet.");
    }

    const firstGrudge = fortress.dwarfGrudges[0];

    if (!firstGrudge) {
      throw new GameError("Choose your first Grudge Book target first.");
    }

    if (doubleExisting) {
      if (firstGrudge.bonusMultiplier >= 2) {
        throw new GameError(
          "Your first Grudge Book target is already doubled."
        );
      }

      return tx.dwarfGrudge.update({
        where: {
          id: firstGrudge.id,
        },
        data: {
          bonusMultiplier: 2,
        },
      });
    }

    if (!targetFortressId || targetFortressId === fortress.id) {
      throw new GameError(
        "Choose a second player fortress for the Grudge Book."
      );
    }

    const target = await tx.fortress.findFirst({
      where: {
        id: targetFortressId,
        cycleId: cycle.id,
        isNpc: false,
      },
      select: {
        id: true,
      },
    });

    if (!target) {
      throw new GameError("Choose a player fortress for the Grudge Book.");
    }

    await tx.dwarfGrudge.deleteMany({
      where: {
        fortressId: fortress.id,
        targetFortressId,
        NOT: {
          slot: 2,
        },
      },
    });

    return tx.dwarfGrudge.upsert({
      where: {
        fortressId_slot: {
          fortressId: fortress.id,
          slot: 2,
        },
      },
      update: {
        targetFortressId,
        bonusMultiplier: 1,
      },
      create: {
        fortressId: fortress.id,
        targetFortressId,
        slot: 2,
        bonusMultiplier: 1,
      },
    });
  });
}

async function isFortressFactionSuppressed(
  db: DatabaseClient,
  fortressId: string,
  now: Date
) {
  const suppression = await db.raceAbilityActivation.findFirst({
    where: {
      kind: RaceAbilityKind.DWARF_RUNE_GRUDGES,
      targetFortressId: fortressId,
      activeFrom: {
        lte: now,
      },
      activeUntil: {
        gt: now,
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
      id: true,
    },
  });

  return Boolean(suppression);
}

async function getActiveDwarfRuneOfGrudgesContext({
  tx,
  userId,
  now,
}: {
  tx: DatabaseClient;
  userId: string;
  now: Date;
}) {
  const cycle = await getCurrentCycle(tx);

  if (!cycle || cycle.status !== CycleStatus.ACTIVE) {
    throw new GameError(
      "Rune of Grudges is only available during the active season."
    );
  }

  const fortress = await tx.fortress.findUnique({
    where: {
      cycleId_ownerId: {
        cycleId: cycle.id,
        ownerId: userId,
      },
    },
    select: {
      id: true,
      race: true,
      isNpc: true,
      army: true,
      level: true,
    },
  });

  if (!fortress || fortress.isNpc || fortress.race !== "DWARFS") {
    throw new GameError("Only Dwarfs can command the Rune of Grudges.");
  }

  const activation = await tx.raceAbilityActivation.findFirst({
    where: {
      fortressId: fortress.id,
      kind: RaceAbilityKind.DWARF_RUNE_GRUDGES,
      consumedAt: null,
      activeUntil: {
        gt: now,
      },
    },
    orderBy: [{ activeUntil: "desc" }, { id: "desc" }],
    select: {
      id: true,
      runeFortressId: true,
      targetFortressId: true,
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

  if (!activation?.runeFortressId || !activation.runeFortress) {
    throw new GameError("You do not have an active Rune of Grudges.");
  }

  const runeFortressId = activation.runeFortressId;

  if (
    activation.runeFortress.health <= 0 ||
    !activation.runeFortress.expiresAt ||
    activation.runeFortress.expiresAt <= now
  ) {
    throw new GameError("Your Rune of Grudges is no longer active.");
  }

  return {
    cycle,
    fortress,
    activation: {
      ...activation,
      runeFortressId,
    },
  };
}

export async function activateDwarfDeepMining({
  userId,
  committedGold,
  now = new Date(),
  rollValue,
  db = prisma,
}: {
  userId: string;
  committedGold: number;
  now?: Date;
  rollValue?: number;
  db?: PrismaClient;
}) {
  return db.$transaction(
    async (tx) => {
      const cycle = await getCurrentCycle(tx);

      if (!cycle || cycle.status !== CycleStatus.ACTIVE) {
        throw new GameError(
          "Deep Mining is only available during the active season."
        );
      }

      const fortress = await tx.fortress.findUnique({
        where: {
          cycleId_ownerId: {
            cycleId: cycle.id,
            ownerId: userId,
          },
        },
        select: {
          id: true,
          ownerId: true,
          commanderName: true,
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
          isNpc: true,
          mapX: true,
          mapY: true,
          castleUpgradeSpecializations: {
            select: {
              level: true,
              specialization: true,
            },
          },
        },
      });

      if (!fortress || fortress.isNpc || fortress.race !== "DWARFS") {
        throw new GameError("Only Dwarfs can activate Deep Mining.");
      }

      if (
        !Number.isInteger(committedGold) ||
        committedGold < DWARF_DEEP_MINING_MIN_GOLD_COMMITMENT ||
        committedGold > DWARF_DEEP_MINING_MAX_GOLD_COMMITMENT
      ) {
        throw new GameError(
          `Commit between ${DWARF_DEEP_MINING_MIN_GOLD_COMMITMENT} and ${DWARF_DEEP_MINING_MAX_GOLD_COMMITMENT} gold.`
        );
      }

      if (committedGold > fortress.gold) {
        throw new GameError("You do not have enough gold to commit that much.");
      }

      const deepMiningCooldownStartedAt = addHours(now, -1);
      const latestUse = await tx.raceAbilityActivation.findFirst({
        where: {
          fortressId: fortress.id,
          kind: RaceAbilityKind.DWARF_DEEP_MINING_COOLDOWN,
        },
        orderBy: [{ usedAt: "desc" }, { id: "desc" }],
        select: {
          usedAt: true,
        },
      });

      if (latestUse && latestUse.usedAt > deepMiningCooldownStartedAt) {
        throw new GameError(
          "Deep Mining can only be used once every 60 minutes."
        );
      }

      const roll = rollDwarfDeepMining(rollValue);
      const resolveAt = getDwarfDeepMiningResolveAt(now, committedGold);
      const effectUntil = getDwarfDeepMiningActiveUntil(resolveAt);

      await tx.raceAbilityActivation.create({
        data: {
          fortressId: fortress.id,
          kind: RaceAbilityKind.DWARF_DEEP_MINING_COOLDOWN,
          activeFrom: now,
          activeUntil: now,
          usedAt: now,
        },
      });

      await tx.fortress.update({
        where: {
          id: fortress.id,
        },
        data: {
          gold: {
            decrement: committedGold,
          },
        },
      });

      await tx.dwarfDeepMiningRoll.create({
        data: {
          fortressId: fortress.id,
          outcome: roll.outcome,
          committedGold,
          activeUntil: resolveAt,
        },
      });

      return {
        outcome: roll.outcome,
        label: roll.label,
        description: roll.description,
        committedGold,
        resolveAt,
        effectUntil,
      };
    },
    {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    }
  );
}

export async function activateDwarfRuneOfGrudges({
  userId,
  targetFortressId,
  now = new Date(),
  db = prisma,
}: {
  userId: string;
  targetFortressId: string;
  now?: Date;
  db?: PrismaClient;
}) {
  return db.$transaction(async (tx) => {
    const cycle = await getCurrentCycle(tx);

    if (!cycle || cycle.status !== CycleStatus.ACTIVE) {
      throw new GameError(
        "Rune of Grudges is only available during the active season."
      );
    }

    const fortress = await tx.fortress.findUnique({
      where: {
        cycleId_ownerId: {
          cycleId: cycle.id,
          ownerId: userId,
        },
      },
      select: {
        id: true,
        ownerId: true,
        commanderName: true,
        name: true,
        gold: true,
        army: true,
        race: true,
        isNpc: true,
        mapX: true,
        mapY: true,
      },
    });

    if (!fortress || fortress.isNpc || fortress.race !== "DWARFS") {
      throw new GameError("Only Dwarfs can raise the Rune of Grudges.");
    }

    const ownedTileBiomes = await getOwnedTileBiomesForFortress({
      db: tx,
      cycleId: cycle.id,
      fortressId: fortress.id,
    });

    if (
      getRaceBuffTier({
        activeStartedAt: cycle.activeStartedAt,
        now,
        isActiveSeason: true,
        race: fortress.race,
        ownedTileBiomes,
      }) < 2
    ) {
      throw new GameError("Rune of Grudges has not unlocked yet.");
    }

    const activeRune = await tx.raceAbilityActivation.findFirst({
      where: {
        fortressId: fortress.id,
        kind: RaceAbilityKind.DWARF_RUNE_GRUDGES,
        consumedAt: null,
        activeUntil: {
          gt: now,
        },
      },
      select: {
        id: true,
      },
    });

    if (activeRune) {
      throw new GameError("You already have an active Rune of Grudges.");
    }

    if (fortress.gold < DWARF_RUNE_OF_GRUDGES_ACTIVATION_GOLD) {
      throw new GameError("You do not have enough gold to raise the rune.");
    }

    const target = await tx.fortress.findFirst({
      where: {
        id: targetFortressId,
        cycleId: cycle.id,
        isNpc: false,
      },
      select: {
        id: true,
        name: true,
        commanderName: true,
        ownerId: true,
        mapX: true,
        mapY: true,
      },
    });

    if (!target || target.id === fortress.id) {
      throw new GameError("Choose another player fortress for the rune.");
    }

    await tx.fortress.update({
      where: {
        id: fortress.id,
      },
      data: {
        gold: {
          decrement: DWARF_RUNE_OF_GRUDGES_ACTIVATION_GOLD,
        },
      },
    });

    const runeOwner = await tx.user.create({
      data: {},
      select: {
        id: true,
      },
    });

    const runeBaseName = `${fortress.name}-${target.name}`;
    const runeBaseCommanderName = `${fortress.commanderName}-${target.commanderName}`;
    let runeName = runeBaseName;
    let runeCommanderName = runeBaseCommanderName;
    let suffix = 2;

    while (true) {
      const existing = await tx.fortress.findFirst({
        where: {
          cycleId: cycle.id,
          OR: [{ name: runeName }, { commanderName: runeCommanderName }],
        },
        select: {
          id: true,
        },
      });

      if (!existing) {
        break;
      }

      runeName = `${runeBaseName}-${suffix}`;
      runeCommanderName = `${runeBaseCommanderName}-${suffix}`;
      suffix += 1;
    }

    const rune = await tx.fortress.create({
      data: {
        cycleId: cycle.id,
        ownerId: runeOwner.id,
        commanderName: runeCommanderName,
        name: runeName,
        fortressKind: FortressKind.DWARF_RUNE,
        isNpc: true,
        health: 1,
        maxHealth: 1,
        army: 1,
        iconLabel: "DR",
        expiresAt: addHours(now, DWARF_RUNE_OF_GRUDGES_MAX_DURATION_HOURS),
        mapX: Math.round((fortress.mapX + target.mapX) / 2),
        mapY: Math.round((fortress.mapY + target.mapY) / 2),
        joinedAt: now,
      },
      select: {
        id: true,
      },
    });

    await tx.raceAbilityActivation.create({
      data: {
        fortressId: fortress.id,
        kind: RaceAbilityKind.DWARF_RUNE_GRUDGES,
        activeFrom: now,
        activeUntil: addHours(now, DWARF_RUNE_OF_GRUDGES_MAX_DURATION_HOURS),
        usedAt: now,
        targetFortressId: target.id,
        runeFortressId: rune.id,
        goldCost: DWARF_RUNE_OF_GRUDGES_ACTIVATION_GOLD,
        maintenanceGoldPerTick: DWARF_RUNE_OF_GRUDGES_MAINTENANCE_GOLD,
      },
    });

    const systemUser = await ensureNpcSystemUser(tx);
    const announcementTemplate = pickRandomItem(
      DWARF_RUNE_OF_GRUDGES_ANNOUNCEMENTS
    );
    const announcementBody = announcementTemplate
      .replaceAll("{ownerFortress}", fortress.name)
      .replaceAll("{targetFortress}", target.name)
      .replaceAll("{ownerCommander}", fortress.commanderName)
      .replaceAll("{targetCommander}", target.commanderName);

    await tx.chatMessage.create({
      data: {
        cycleId: cycle.id,
        authorId: systemUser.id,
        type: ChatMessageType.TEXT,
        body: `Rune of Grudges: ${announcementBody}`,
        createdAt: now,
      },
    });

    return {
      targetFortressId: target.id,
      targetName: target.name,
      runeFortressId: rune.id,
      activeUntil: addHours(now, DWARF_RUNE_OF_GRUDGES_MAX_DURATION_HOURS),
      goldCost: DWARF_RUNE_OF_GRUDGES_ACTIVATION_GOLD,
      maintenanceGoldPerTick: DWARF_RUNE_OF_GRUDGES_MAINTENANCE_GOLD,
    };
  });
}

export async function reinforceDwarfRuneOfGrudges({
  userId,
  sentArmy,
  now = new Date(),
  db = prisma,
}: {
  userId: string;
  sentArmy: number;
  now?: Date;
  db?: PrismaClient;
}) {
  return db.$transaction(async (tx) => {
    if (!Number.isInteger(sentArmy) || sentArmy <= 0) {
      throw new GameError("You must send at least 1 army.");
    }

    const { cycle, fortress, activation } =
      await getActiveDwarfRuneOfGrudgesContext({
        tx,
        userId,
        now,
      });

    if (!isGameplayWindowOpen(cycle, now)) {
      throw new GameError("The current cycle is not accepting active actions.");
    }

    if (sentArmy > fortress.army) {
      throw new GameError(
        "You do not have enough army to send that many units."
      );
    }

    const outboundAttackCount = await tx.attackUnit.count({
      where: {
        attackerFortressId: fortress.id,
        resolvedAt: null,
        cancelledAt: null,
      },
    });

    const effectiveRace = (await isFortressFactionSuppressed(
      tx,
      fortress.id,
      now
    ))
      ? null
      : fortress.race;
    const maxAttacks = getMaxSimultaneousAttacks(fortress.level, effectiveRace);

    if (outboundAttackCount >= maxAttacks) {
      throw new GameError(
        `You have reached the maximum number of simultaneous attacks (${maxAttacks}). Upgrade your castle for more slots.`
      );
    }

    await tx.fortress.update({
      where: {
        id: fortress.id,
      },
      data: {
        army: {
          decrement: sentArmy,
        },
      },
    });

    const runeFortress = await tx.fortress.update({
      where: {
        id: activation.runeFortressId,
      },
      data: {
        army: {
          increment: sentArmy,
        },
      },
      select: {
        id: true,
        army: true,
      },
    });

    return {
      runeFortressId: runeFortress.id,
      sentArmy,
      runeArmy: runeFortress.army,
    };
  });
}

export async function cancelDwarfRuneOfGrudges({
  userId,
  now = new Date(),
  db = prisma,
}: {
  userId: string;
  now?: Date;
  db?: PrismaClient;
}) {
  return db.$transaction(async (tx) => {
    const { activation } = await getActiveDwarfRuneOfGrudgesContext({
      tx,
      userId,
      now,
    });

    await tx.raceAbilityActivation.update({
      where: {
        id: activation.id,
      },
      data: {
        consumedAt: now,
        activeUntil: now,
      },
    });

    await tx.fortress.update({
      where: {
        id: activation.runeFortressId,
      },
      data: {
        health: 0,
        army: 0,
        expiresAt: now,
      },
    });

    return {
      runeFortressId: activation.runeFortressId,
      cancelledAt: now,
    };
  });
}

export async function activateRaceAbility({
  userId,
  kind,
  now = new Date(),
  db = prisma,
}: {
  userId: string;
  kind: RaceAbilityKind;
  now?: Date;
  db?: PrismaClient;
}) {
  return db.$transaction(async (tx) => {
    const cycle = await getCurrentCycle(tx);

    if (!cycle || cycle.status !== CycleStatus.ACTIVE) {
      throw new GameError(
        "Race abilities are only available during the active season."
      );
    }

    const fortress = await tx.fortress.findUnique({
      where: {
        cycleId_ownerId: {
          cycleId: cycle.id,
          ownerId: userId,
        },
      },
      select: {
        id: true,
        name: true,
        commanderName: true,
        race: true,
        isNpc: true,
      },
    });

    if (!fortress || fortress.isNpc) {
      throw new GameError("You are not participating in the active cycle.");
    }

    const ownedTileBiomes = await getOwnedTileBiomesForFortress({
      db: tx,
      cycleId: cycle.id,
      fortressId: fortress.id,
    });

    if (
      getRaceBuffTier({
        activeStartedAt: cycle.activeStartedAt,
        now,
        isActiveSeason: true,
        race: fortress.race,
        ownedTileBiomes,
      }) < 1
    ) {
      throw new GameError("Race abilities have not unlocked yet.");
    }

    const expectedRace =
      kind === RaceAbilityKind.ORK_WAAAGH
        ? "ORKS"
        : kind === RaceAbilityKind.SPACE_MURINE_STIM
          ? "SPACE_MURINES"
          : null;

    if (!expectedRace || fortress.race !== expectedRace) {
      throw new GameError("That race ability is not available to your race.");
    }

    const dayKey = getHelsinkiDayKey(now);
    const previousUse = await tx.raceAbilityActivation.findFirst({
      where: {
        fortressId: fortress.id,
        kind,
      },
      orderBy: [{ usedAt: "desc" }, { id: "desc" }],
      select: {
        usedAt: true,
      },
    });

    if (previousUse && getHelsinkiDayKey(previousUse.usedAt) === dayKey) {
      throw new GameError("That race ability has already been used today.");
    }

    const activation = await tx.raceAbilityActivation.create({
      data: {
        fortressId: fortress.id,
        kind,
        activeFrom: now,
        activeUntil: getRaceAbilityActiveUntil(now),
        usedAt: now,
      },
    });

    if (kind === RaceAbilityKind.ORK_WAAAGH) {
      const systemUser = await ensureNpcSystemUser(tx);

      await tx.chatMessage.create({
        data: {
          cycleId: cycle.id,
          authorId: systemUser.id,
          type: ChatMessageType.TEXT,
          body: `WAAAGH! ${fortress.name} has started a WAAAGH. ${fortress.commanderName}'s warcry shakes the whole realm.`,
          createdAt: now,
        },
      });
    }

    return activation;
  });
}

export async function activateOrkBossOrder({
  userId,
  kind,
  now = new Date(),
  db = prisma,
}: {
  userId: string;
  kind: OrkBossOrderKind | string;
  now?: Date;
  db?: PrismaClient;
}) {
  if (!Object.values(OrkBossOrderKind).includes(kind as OrkBossOrderKind)) {
    throw new GameError("That Boss Order does not exist.");
  }

  const orderKind = kind as OrkBossOrderKind;
  const config = ORK_BOSS_ORDER_CONFIG[orderKind];

  return db.$transaction(async (tx) => {
    const cycle = await getCurrentCycle(tx);

    if (!cycle || cycle.status !== CycleStatus.ACTIVE) {
      throw new GameError(
        "Boss Orders are only available during the active season."
      );
    }

    const fortress = await tx.fortress.findUnique({
      where: {
        cycleId_ownerId: {
          cycleId: cycle.id,
          ownerId: userId,
        },
      },
      select: {
        id: true,
        cycleId: true,
        race: true,
        isNpc: true,
        fortressKind: true,
        gold: true,
      },
    });

    if (!fortress || !isRealOrkPlayerFortress(fortress)) {
      throw new GameError("Only ORKS can bark Boss Orders.");
    }

    const activeOrder = await tx.orkBossOrder.findFirst({
      where: {
        fortressId: fortress.id,
        activeFrom: { lte: now },
        activeUntil: { gt: now },
      },
      select: { id: true },
    });

    if (activeOrder) {
      throw new GameError("You can only run one Boss Order at a time.");
    }

    if (fortress.gold < config.goldCost) {
      throw new GameError(
        `You need ${config.goldCost} gold for that Boss Order.`
      );
    }

    const bank = await tx.orkScrapBank.upsert({
      where: {
        cycleId_fortressId: {
          cycleId: cycle.id,
          fortressId: fortress.id,
        },
      },
      create: {
        cycleId: cycle.id,
        fortressId: fortress.id,
        scrap: 0,
      },
      update: {},
      select: { scrap: true },
    });

    if (bank.scrap < config.scrapCost) {
      throw new GameError(
        `You need ${config.scrapCost} Scrap for that Boss Order.`
      );
    }

    await tx.fortress.update({
      where: { id: fortress.id },
      data: { gold: { decrement: config.goldCost } },
    });

    const order = await tx.orkBossOrder.create({
      data: {
        cycleId: cycle.id,
        fortressId: fortress.id,
        kind: orderKind,
        scrapCost: config.scrapCost,
        goldCost: config.goldCost,
        activeFrom: now,
        activeUntil: getBossOrderActiveUntil(orderKind, now),
        usedAt: now,
      },
    });

    await applyOrkScrapDelta({
      db: tx,
      cycleId: cycle.id,
      fortressId: fortress.id,
      delta: -config.scrapCost,
      reason: OrkScrapEventReason.BOSS_ORDER,
      now,
      bossOrderId: order.id,
    });

    return order;
  });
}

export async function buyPointsWithGold({
  userId,
  goldAmount,
  now = new Date(),
  db = prisma,
}: {
  userId: string;
  goldAmount: number;
  now?: Date;
  db?: PrismaClient;
}) {
  if (goldAmount <= 0) {
    throw new GameError("Gold amount must be greater than 0.");
  }

  return await db.$transaction(async (tx) => {
    const cycle = await getCurrentCycle(tx);

    if (!cycle || !isActiveWindowOpen(cycle, now)) {
      throw new GameError("You can only convert gold during the ACTIVE phase.");
    }

    const fortress = await tx.fortress.findUnique({
      where: {
        cycleId_ownerId: {
          cycleId: cycle.id,
          ownerId: userId,
        },
      },
    });

    if (!fortress) {
      throw new GameError("You are not participating in the active cycle.");
    }

    if (fortress.gold < goldAmount) {
      throw new GameError("You do not have enough gold for this conversion.");
    }

    const pointsGained = convertGoldToPoints(goldAmount);

    if (pointsGained <= 0) {
      throw new GameError(
        "Gold amount is too small. You need at least 10 gold to convert to 1 point."
      );
    }

    const updatedFortress = await tx.fortress.update({
      where: {
        id: fortress.id,
      },
      data: {
        gold: fortress.gold - goldAmount,
        points: fortress.points + pointsGained,
      },
    });

    return {
      goldSpent: goldAmount,
      pointsGained,
      fortress: updatedFortress,
    };
  });
}

export async function investOrkWaaaghScrap({
  userId,
  kind,
  now = new Date(),
  db = prisma,
}: {
  userId: string;
  kind: OrkWaaaghInvestmentKind | string;
  now?: Date;
  db?: PrismaClient;
}) {
  if (
    !Object.values(OrkWaaaghInvestmentKind).includes(
      kind as OrkWaaaghInvestmentKind
    )
  ) {
    throw new GameError("That WAAAGH investment does not exist.");
  }

  const investmentKind = kind as OrkWaaaghInvestmentKind;
  const scrapCost = getWaaaghInvestmentCost(investmentKind);

  return db.$transaction(async (tx) => {
    const cycle = await getCurrentCycle(tx);

    if (!cycle || cycle.status !== CycleStatus.ACTIVE) {
      throw new GameError(
        "WAAAGH investments are only available during the active season."
      );
    }

    const fortress = await tx.fortress.findUnique({
      where: {
        cycleId_ownerId: {
          cycleId: cycle.id,
          ownerId: userId,
        },
      },
      select: {
        id: true,
        cycleId: true,
        race: true,
        isNpc: true,
        fortressKind: true,
      },
    });

    if (!fortress || !isRealOrkPlayerFortress(fortress)) {
      throw new GameError("Only ORKS can feed the WAAAGH.");
    }

    const waaagh = await tx.raceAbilityActivation.findFirst({
      where: {
        fortressId: fortress.id,
        kind: RaceAbilityKind.ORK_WAAAGH,
        activeFrom: { lte: now },
        activeUntil: { gt: now },
      },
      orderBy: [{ activeUntil: "desc" }, { id: "desc" }],
      select: {
        id: true,
        activeUntil: true,
        orkWaaaghInvestments: {
          select: { kind: true },
        },
      },
    });

    if (!waaagh) {
      throw new GameError(
        "WAAAGH must be active before you can feed it Scrap."
      );
    }

    if (
      waaagh.orkWaaaghInvestments.some(
        (investment) => investment.kind === investmentKind
      )
    ) {
      throw new GameError("That WAAAGH investment is already active.");
    }

    const bank = await tx.orkScrapBank.upsert({
      where: {
        cycleId_fortressId: {
          cycleId: cycle.id,
          fortressId: fortress.id,
        },
      },
      create: {
        cycleId: cycle.id,
        fortressId: fortress.id,
        scrap: 0,
      },
      update: {},
      select: { scrap: true },
    });

    if (bank.scrap < scrapCost) {
      throw new GameError(`You need ${scrapCost} Scrap to feed the WAAAGH.`);
    }

    const investment = await tx.orkWaaaghInvestment.create({
      data: {
        cycleId: cycle.id,
        fortressId: fortress.id,
        waaaghActivationId: waaagh.id,
        kind: investmentKind,
        scrapCost,
      },
    });

    await applyOrkScrapDelta({
      db: tx,
      cycleId: cycle.id,
      fortressId: fortress.id,
      delta: -scrapCost,
      reason: OrkScrapEventReason.WAAAGH_INVESTMENT,
      now,
      waaaghInvestmentId: investment.id,
    });

    const extensionMinutes =
      ORK_WAAAGH_INVESTMENT_CONFIG[investmentKind].extensionMinutes;

    if (extensionMinutes > 0) {
      await tx.raceAbilityActivation.update({
        where: { id: waaagh.id },
        data: {
          activeUntil: addMinutes(waaagh.activeUntil, extensionMinutes),
        },
      });
    }

    return investment;
  });
}

export async function claimUnicornTeleport({
  userId,
  now = new Date(),
  db = prisma,
}: {
  userId: string;
  now?: Date;
  db?: PrismaClient;
}) {
  return db.$transaction(async (tx) => {
    const cycle = await getCurrentCycle(tx);

    if (!cycle) {
      throw new GameError(
        "Unicorn teleport is only available during the active season."
      );
    }

    const fortress = await tx.fortress.findUnique({
      where: {
        cycleId_ownerId: {
          cycleId: cycle.id,
          ownerId: userId,
        },
      },
      select: {
        id: true,
        race: true,
        isNpc: true,
      },
    });

    if (!fortress || fortress.isNpc || fortress.race !== "UNSTABLE_UNICORNS") {
      throw new GameError("Only Unstable Unicorns can claim free teleport.");
    }

    const existingToken = await tx.raceAbilityActivation.findFirst({
      where: {
        fortressId: fortress.id,
        kind: RaceAbilityKind.UNICORN_TELEPORT,
        consumedAt: null,
        expiresAt: {
          gt: now,
        },
      },
    });

    const activeTemporaryTeleport = await tx.unicornTemporaryTeleport.findFirst(
      {
        where: {
          fortressId: fortress.id,
          returnedAt: null,
        },
        select: {
          id: true,
        },
      }
    );

    const latestClaim = await tx.raceAbilityActivation.findFirst({
      where: {
        fortressId: fortress.id,
        kind: RaceAbilityKind.UNICORN_TELEPORT,
      },
      orderBy: [{ usedAt: "desc" }, { id: "desc" }],
      select: {
        usedAt: true,
      },
    });

    const availability = getUnicornTeleportClaimAvailability({
      race: fortress.race,
      activeStartedAt: cycle.activeStartedAt,
      now,
      isActiveSeason: cycle.status === CycleStatus.ACTIVE,
      ownedTileBiomes: await getOwnedTileBiomesForFortress({
        db: tx,
        cycleId: cycle.id,
        fortressId: fortress.id,
      }),
      hasActiveTeleportToken: existingToken !== null,
      hasActiveTemporaryTeleport: activeTemporaryTeleport !== null,
      latestClaimAt: latestClaim?.usedAt ?? null,
    });

    if (!availability.canUse) {
      throw new GameError(
        availability.disabledReason ?? "Unable to claim free teleport."
      );
    }

    return tx.raceAbilityActivation.create({
      data: {
        fortressId: fortress.id,
        kind: RaceAbilityKind.UNICORN_TELEPORT,
        activeFrom: now,
        activeUntil: now,
        usedAt: now,
        expiresAt: getRaceAbilityActiveUntil(now),
      },
    });
  });
}

export async function activateUnicornShatteredReality({
  userId,
  now = new Date(),
  rollValue,
  db = prisma,
}: {
  userId: string;
  now?: Date;
  rollValue?: number;
  db?: PrismaClient;
}) {
  return db.$transaction(async (tx) => {
    const cycle = await getCurrentCycle(tx);

    if (!cycle) {
      throw new GameError(
        "Shattered Reality is only available during the active season."
      );
    }

    const fortress = await tx.fortress.findUnique({
      where: {
        cycleId_ownerId: {
          cycleId: cycle.id,
          ownerId: userId,
        },
      },
      select: {
        id: true,
        race: true,
        isNpc: true,
        army: true,
      },
    });

    if (!fortress || fortress.isNpc || fortress.race !== "UNSTABLE_UNICORNS") {
      throw new GameError(
        "Only Unstable Unicorns can activate Shattered Reality."
      );
    }

    const latestUse = await tx.raceAbilityActivation.findFirst({
      where: {
        fortressId: fortress.id,
        kind: "UNICORN_SHATTERED_REALITY" as RaceAbilityKind,
      },
      orderBy: [{ usedAt: "desc" }, { id: "desc" }],
      select: {
        usedAt: true,
      },
    });

    const availability = getUnicornShatteredRealityAvailability({
      race: fortress.race,
      activeStartedAt: cycle?.activeStartedAt ?? null,
      now,
      isActiveSeason: Boolean(cycle && cycle.status === CycleStatus.ACTIVE),
      ownedTileBiomes: await getOwnedTileBiomesForFortress({
        db: tx,
        cycleId: cycle.id,
        fortressId: fortress.id,
      }),
      latestUseAt: latestUse?.usedAt ?? null,
    });

    if (!availability.canUse) {
      throw new GameError(
        availability.disabledReason ?? "Unable to activate Shattered Reality."
      );
    }

    const garrisons = await tx.fortressGarrison.findMany({
      where: {
        cycleId: cycle.id,
        fortressId: fortress.id,
      },
      select: {
        id: true,
        army: true,
      },
    });

    const outcome = rollUnicornShatteredReality(rollValue);
    const activeUntil = getUnicornShatteredRealityActiveUntil(now);
    const timedKind = getUnicornShatteredRealityTimedKind(outcome);

    await tx.raceAbilityActivation.create({
      data: {
        fortressId: fortress.id,
        kind: RaceAbilityKind.UNICORN_SHATTERED_REALITY,
        activeFrom: now,
        activeUntil: now,
        usedAt: now,
      },
    });

    if (timedKind) {
      await tx.raceAbilityActivation.create({
        data: {
          fortressId: fortress.id,
          kind: timedKind,
          activeFrom: now,
          activeUntil,
          usedAt: now,
        },
      });
    }

    if (outcome === UnicornShatteredRealityOutcome.MIRROR_HOST) {
      const fortressGain = Math.max(1, Math.ceil(fortress.army * 0.2));
      let garrisonGainTotal = 0;

      await tx.fortress.update({
        where: {
          id: fortress.id,
        },
        data: {
          army: {
            increment: fortressGain,
          },
        },
      });

      for (const garrison of garrisons) {
        const gain = Math.max(1, Math.ceil(garrison.army * 0.25));
        garrisonGainTotal += gain;

        await tx.fortressGarrison.update({
          where: {
            id: garrison.id,
          },
          data: {
            army: {
              increment: gain,
            },
          },
        });
      }

      const summary = `Mirror Host: fortress gained ${fortressGain} army and garrisons surged by ${garrisonGainTotal} army.`;
      await tx.unicornShatteredRealityRoll.create({
        data: {
          fortressId: fortress.id,
          outcome,
          summary,
          armyDelta: fortressGain,
          garrisonArmyDelta: garrisonGainTotal,
        },
      });

      return {
        omen: outcome,
        outcome,
        summary,
      };
    }

    const summary =
      outcome === UnicornShatteredRealityOutcome.PRISMATIC_SURGE
        ? "Prismatic Surge: +25% attack and defense power for 1 hour."
        : "Lucky Gallop: +50% gold, food, and recruitment processing for 1 hour.";
    await tx.unicornShatteredRealityRoll.create({
      data: {
        fortressId: fortress.id,
        outcome,
        summary,
        activeUntil,
      },
    });

    return {
      omen: outcome,
      outcome,
      summary,
      activeUntil,
    };
  });
}
