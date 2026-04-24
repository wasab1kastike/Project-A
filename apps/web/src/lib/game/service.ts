import {
  CycleStatus,
  FortressAction,
  ScoreEventType,
  Prisma,
  PrismaClient,
} from "@/lib/prisma-client";
import { prisma } from "@/lib/prisma";
import {
  ACTIVE_LOCATION_SHUFFLE_COST,
  ACTIVE_PLAYER_CAP,
  ACTIVE_RENAME_COST,
} from "./constants";
import { getRandomUnitSpriteVariant } from "./attacks";
import { canFortressLevelUp, getFortressUpgradeCost } from "./upgrades";
import {
  cancelActiveAttackUnits,
  launchAttackUnit,
} from "./attack-units";
import { GameError } from "./errors";
import {
  ensureCommanderRegistrationColumn,
} from "./schema-guards";
import {
  buildFortressSpawnSeed,
  getFortressSpawnLayout,
  takeOpenSpawnPoint,
} from "./spawn-layout";

type DatabaseClient = PrismaClient | Prisma.TransactionClient;

const PUBLIC_NAME_MAX_LENGTH = 32;
const ACTIVE_EDGE_PADDING = 15;

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
    activeEndsAt: Date | null;
    joiningLockedAt?: Date | null;
  },
  now: Date
) {
  return (
    (cycle.status === CycleStatus.REGISTRATION &&
      cycle.registrationEndsAt > now &&
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
    fortresses.map((fortress) => `${fortress.mapX}:${fortress.mapY}`)
  );
  const layout = getFortressSpawnLayout({
    cycleId: cycle.id,
    purpose: "registration:fortress-layout",
    activeStartedAt: cycle.activeStartedAt,
    count: ACTIVE_PLAYER_CAP,
  });

  return layout.find((position) => {
    return !occupied.has(`${position.x}:${position.y}`);
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
            mapX: openPosition.x,
            mapY: openPosition.y,
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
  const normalizedCommanderName = commanderName !== undefined
    ? normalizeCommanderName(commanderName)
    : null;

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
        throw new GameError("No current cycle is available for nick registration.");
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
        throw new GameError("Join the current cycle before registering a nick.");
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
  now = new Date(),
  db = prisma,
}: {
  userId: string;
  action: FortressAction;
  targetFortressId?: string;
  now?: Date;
  db?: PrismaClient;
}) {
  return db.$transaction(async (tx) => {
    const cycle = await getCurrentCycle(tx);

    if (!cycle || !isActiveWindowOpen(cycle, now)) {
      throw new GameError("The current cycle is not accepting active actions.");
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

    if (!targetFortressId) {
      throw new GameError("Choose a target fortress before attacking.");
    }

    if (targetFortressId === fortress.id) {
      throw new GameError("Your fortress cannot target itself.");
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
        currentAction: FortressAction.ATTACK,
        targetFortressId,
      },
    });

    if (fortress.currentAction !== FortressAction.ATTACK) {
      await launchAttackUnit({
        db: tx,
        cycle,
        attacker: updatedFortress,
        target,
        launchedAt: now,
      });
    }

    return updatedFortress;
  });
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
  now = new Date(),
  db = prisma,
}: {
  userId: string;
  now?: Date;
  db?: PrismaClient;
}) {
  return db.$transaction(async (tx) => {
    const cycle = await getCurrentCycle(tx);

    if (!cycle || !isActiveWindowOpen(cycle, now)) {
      throw new GameError(
        "Castle Yeet is only available during ACTIVE."
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
        points: true,
        currentAction: true,
        mapX: true,
        mapY: true,
      },
    });

    if (!fortress) {
      throw new GameError("You are not participating in the active cycle.");
    }

    if (fortress.currentAction !== FortressAction.GROW) {
      throw new GameError(
        "Switch your fortress to Grow before triggering Castle Yeet."
      );
    }

    const locationShuffleCount = await getFortressLocationShuffleCount(
      tx,
      fortress.id
    );
    const shuffleCost =
      locationShuffleCount === 0 ? 0 : ACTIVE_LOCATION_SHUFFLE_COST;

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
        return `${otherFortress.mapX}:${otherFortress.mapY}`;
      })
    );
    excludedKeys.add(`${fortress.mapX}:${fortress.mapY}`);

    let nextPosition;

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
        }
      );
    } catch {
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
          "mapX" = ${Math.round(nextPosition.x)},
          "mapY" = ${Math.round(nextPosition.y)},
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
  now = new Date(),
  db = prisma,
}: {
  userId: string;
  now?: Date;
  db?: PrismaClient;
}) {
  return db.$transaction(async (tx) => {
    const cycle = await getCurrentCycle(tx);

    if (!cycle || !isActiveWindowOpen(cycle, now)) {
      throw new GameError("Castle upgrades are only available during ACTIVE.");
    }

    if (!cycle.upgradesUnlockedAt) {
      throw new GameError(
        "Castle upgrades unlock after Home of A has fallen."
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
