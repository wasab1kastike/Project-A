import {
  CastleUpgradeSpecialization,
  CycleStatus,
  FortressAction,
  ScoreEventType,
  Prisma,
  PrismaClient,
  RaceAbilityKind,
} from "@/lib/prisma-client";
import { prisma } from "@/lib/prisma";
import {
  ACTIVE_LOCATION_SHUFFLE_COST,
  ACTIVE_PLAYER_CAP,
  ACTIVE_RENAME_COST,
} from "./constants";
import { getRandomUnitSpriteVariant } from "./attacks";
import {
  canFortressLevelUp,
  getFortressUpgradeCost,
  getMaxSimultaneousAttacks,
} from "./upgrades";
import {
  cancelActiveAttackUnits,
  launchAttackUnit,
  recallAttackUnit as recallAttackUnitRecord,
} from "./attack-units";
import { GameError } from "./errors";
import { assertWorkerAssignments } from "./balance";
import { isFortressRace, type FortressRace } from "./races";
import { ensureCommanderRegistrationColumn } from "./schema-guards";
import {
  buildFortressSpawnSeed,
  getFortressSpawnLayout,
  getRenderedMapPositionKey,
  takeOpenSpawnPoint,
} from "./spawn-layout";
import {
  getHelsinkiDayKey,
  getHelsinkiHourKey,
  getRaceAbilityActiveUntil,
  getRaceBuffTier,
} from "./race-buffs";
import { isCastleUpgradeSpecialization } from "./specializations";

type DatabaseClient = PrismaClient | Prisma.TransactionClient;

const PUBLIC_NAME_MAX_LENGTH = 32;
const ACTIVE_EDGE_PADDING = 15;
const LOCATION_SHUFFLE_INITIAL_MIN_TRAVEL_DISTANCE = 24;
const LOCATION_SHUFFLE_MIN_TRAVEL_DISTANCE_FLOOR = 12;
const LOCATION_SHUFFLE_MIN_TRAVEL_DISTANCE_STEP = 2;
const LOCATION_SHUFFLE_SCORE_RANDOMNESS = 24;

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
  const normalizedCommanderName = normalizeCommanderName(
    commanderName ?? fortressName
  );

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
      throw new GameError("You do not have enough army to send that many units.");
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

    const maxAttacks = getMaxSimultaneousAttacks(fortress.level, fortress.race);

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

    return updatedFortress;
  });
}

export async function recallAttackUnit({
  userId,
  attackUnitId,
  now = new Date(),
  db = prisma,
}: {
  userId: string;
  attackUnitId: string;
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
        now,
      });
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
  now = new Date(),
  db = prisma,
}: {
  userId: string;
  minersAssigned: number;
  farmersAssigned: number;
  recruitersAssigned: number;
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

      assertWorkerAssignments({
        level: fortress.level,
        race: fortress.race,
        minersAssigned,
        farmersAssigned,
        recruitersAssigned,
      });

      return tx.fortress.update({
        where: {
          id: fortress.id,
        },
        data: {
          minersAssigned,
          farmersAssigned,
          recruitersAssigned,
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

      if (fortress.points < ACTIVE_RENAME_COST) {
        throw new GameError(
          "You need at least 10 points to rename your fortress."
        );
      }

      const updatedFortress = await tx.fortress.update({
        where: {
          id: fortress.id,
        },
        data: {
          name: normalizedName,
          points: fortress.points - ACTIVE_RENAME_COST,
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

export async function shuffleFortressLocation({
  userId,
  useFreeTeleport = false,
  now = new Date(),
  db = prisma,
}: {
  userId: string;
  useFreeTeleport?: boolean;
  now?: Date;
  db?: PrismaClient;
}) {
  return db.$transaction(async (tx) => {
    const cycle = await getCurrentCycle(tx);

    if (!cycle || !isGameplayWindowOpen(cycle, now)) {
      throw new GameError("Castle Yeet is only available during gameplay.");
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
        points: true,
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
    const shuffleCost =
      locationShuffleCount === 0 || freeTeleport ? 0 : ACTIVE_LOCATION_SHUFFLE_COST;

    if (shuffleCost > 0 && fortress.points < shuffleCost) {
      throw new GameError(
        `You need at least ${ACTIVE_LOCATION_SHUFFLE_COST} points to trigger Castle Yeet again.`
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
    const currentRenderedKey = getRenderedMapPositionKey(fortress);
    excludedKeys.add(currentRenderedKey);

    let nextPosition: { x: number; y: number } | null = null;
    let nextPersistedMapX: number | null = null;
    let nextPersistedMapY: number | null = null;

    for (let attempt = 0; attempt < 12; attempt += 1) {
      let candidate: { x: number; y: number };
      const requiredTravelDistance = Math.max(
        LOCATION_SHUFFLE_MIN_TRAVEL_DISTANCE_FLOOR,
        LOCATION_SHUFFLE_INITIAL_MIN_TRAVEL_DISTANCE -
          LOCATION_SHUFFLE_MIN_TRAVEL_DISTANCE_STEP * attempt
      );

      try {
        candidate = takeOpenSpawnPoint(
          buildFortressSpawnSeed({
            cycleId: cycle.id,
            purpose: "active:player-location-shuffle",
            activeStartedAt: cycle.activeStartedAt,
            tickAt: now,
            entropy: `${fortress.id}:${locationShuffleCount + 1}:${attempt}`,
          }),
          {
            excludedKeys,
            referencePoints: [
              { x: fortress.mapX, y: fortress.mapY },
              ...otherFortresses.map((otherFortress) => ({
                x: otherFortress.mapX,
                y: otherFortress.mapY,
              })),
            ],
            minSeparationDistance: 9,
            preferredEdgePadding: ACTIVE_EDGE_PADDING,
            scoreRandomness: LOCATION_SHUFFLE_SCORE_RANDOMNESS,
          }
        );
      } catch {
        break;
      }

      const travelDistance = Math.hypot(
        candidate.x - fortress.mapX,
        candidate.y - fortress.mapY
      );

      if (travelDistance < requiredTravelDistance) {
        excludedKeys.add(getRenderedMapPositionKey(candidate));
        continue;
      }

      const persistedMapX = Math.round(candidate.x);
      const persistedMapY = Math.round(candidate.y);
      const persistedRenderedKey = getRenderedMapPositionKey({
        mapX: persistedMapX,
        mapY: persistedMapY,
      });

      if (
        persistedRenderedKey === currentRenderedKey ||
        excludedKeys.has(persistedRenderedKey)
      ) {
        excludedKeys.add(getRenderedMapPositionKey(candidate));
        excludedKeys.add(persistedRenderedKey);
        continue;
      }

      nextPosition = candidate;
      nextPersistedMapX = persistedMapX;
      nextPersistedMapY = persistedMapY;
      break;
    }

    if (!nextPosition || nextPersistedMapX === null || nextPersistedMapY === null) {
      throw new GameError(
        "No alternate fortress location is available right now."
      );
    }

    const cancelledAttackUnitCount = await cancelActiveAttackUnits({
      db: tx,
      attackerFortressId: fortress.id,
      cancelledAt: now,
    });

    await tx.$executeRaw(
      Prisma.sql`
        UPDATE "Fortress"
        SET
          "mapX" = ${nextPersistedMapX},
          "mapY" = ${nextPersistedMapY},
          "locationShuffleCount" = ${locationShuffleCount + 1},
          "points" = ${fortress.points - shuffleCost}
        WHERE "id" = ${fortress.id}
      `
    );

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
      throw new GameError("Castle upgrades are only available during gameplay.");
    }

    if (!cycle.upgradesUnlockedAt) {
      throw new GameError("Castle upgrades unlock after Home of A has fallen.");
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

    const pendingSpecializationLevel =
      await getPendingUpgradeSpecializationLevel(tx, fortress);

    if (pendingSpecializationLevel !== null) {
      throw new GameError(
        "Choose the specialization for your free castle upgrade first."
      );
    }

    if (!canFortressLevelUp(fortress.level)) {
      throw new GameError("Your castle is already at the maximum level.");
    }

    const upgradeCost = getFortressUpgradeCost(fortress.level);

    if (upgradeCost === null) {
      throw new GameError("Your castle is already at the maximum level.");
    }

    if (fortress.points < upgradeCost) {
      throw new GameError(
        `You need at least ${upgradeCost} points for the next castle upgrade.`
      );
    }

    const updatedFortress = await tx.fortress.update({
      where: {
        id: fortress.id,
      },
      data: {
        level: fortress.level + 1,
        points: fortress.points - upgradeCost,
      },
    });

    await tx.castleUpgradeSpecializationChoice.create({
      data: {
        fortressId: fortress.id,
        level: fortress.level + 1,
        specialization,
        createdAt: now,
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

    return updatedFortress;
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
      throw new GameError("Castle specialization is only available during gameplay.");
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

    const pendingLevel = await getPendingUpgradeSpecializationLevel(tx, fortress);

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
      throw new GameError("Grudge Book is only available during the active season.");
    }

    if (
      getRaceBuffTier({
        activeStartedAt: cycle.activeStartedAt,
        now,
        isActiveSeason: true,
      }) < 2
    ) {
      throw new GameError("Grudge Book has not unlocked yet.");
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

    if (targetFortressId === fortress.id) {
      throw new GameError("You cannot add your own fortress to the Grudge Book.");
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

    const grudgeCount = await tx.dwarfGrudge.count({
      where: {
        fortressId: fortress.id,
      },
    });

    if (grudgeCount >= 1) {
      throw new GameError("Your first Grudge Book target is already locked.");
    }

    return tx.dwarfGrudge.create({
      data: {
        fortressId: fortress.id,
        targetFortressId,
        slot: 1,
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
      throw new GameError("Grudge Book is only available during the active season.");
    }

    if (
      getRaceBuffTier({
        activeStartedAt: cycle.activeStartedAt,
        now,
        isActiveSeason: true,
      }) < 3
    ) {
      throw new GameError("The second Grudge Book entry has not unlocked yet.");
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

    const firstGrudge = fortress.dwarfGrudges[0];

    if (!firstGrudge) {
      throw new GameError("Choose your first Grudge Book target first.");
    }

    if (fortress.dwarfGrudges.some((grudge) => grudge.slot === 2)) {
      throw new GameError("Your tier 3 Grudge Book choice is already locked.");
    }

    if (doubleExisting) {
      if (firstGrudge.bonusMultiplier >= 2) {
        throw new GameError("Your first Grudge Book target is already doubled.");
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
      throw new GameError("Choose a second player fortress for the Grudge Book.");
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

    return tx.dwarfGrudge.create({
      data: {
        fortressId: fortress.id,
        targetFortressId,
        slot: 2,
      },
    });
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
      throw new GameError("Race abilities are only available during the active season.");
    }

    if (
      getRaceBuffTier({
        activeStartedAt: cycle.activeStartedAt,
        now,
        isActiveSeason: true,
      }) < 2
    ) {
      throw new GameError("Race abilities have not unlocked yet.");
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
      throw new GameError("You are not participating in the active cycle.");
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

    return tx.raceAbilityActivation.create({
      data: {
        fortressId: fortress.id,
        kind,
        activeFrom: now,
        activeUntil: getRaceAbilityActiveUntil(now),
        usedAt: now,
      },
    });
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

    if (!cycle || cycle.status !== CycleStatus.ACTIVE) {
      throw new GameError("Unicorn teleport is only available during the active season.");
    }

    if (
      getRaceBuffTier({
        activeStartedAt: cycle.activeStartedAt,
        now,
        isActiveSeason: true,
      }) < 1
    ) {
      throw new GameError("Free hourly teleport has not unlocked yet.");
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

    if (existingToken) {
      throw new GameError("You already have an unused free teleport token.");
    }

    const hourKey = getHelsinkiHourKey(now);
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

    if (latestClaim && getHelsinkiHourKey(latestClaim.usedAt) === hourKey) {
      throw new GameError("Free teleport has already been claimed this hour.");
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
