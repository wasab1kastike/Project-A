import {
  CycleStatus,
  FortressAction,
  ScoreEventType,
  Prisma,
  PrismaClient,
} from "@/lib/prisma-client";
import { prisma } from "@/lib/prisma";
import {
  ACTIVE_PLAYER_CAP,
  ACTIVE_RENAME_COST,
} from "./constants";
import { getRandomUnitSpriteVariant } from "./attacks";
import { canFortressLevelUp, getFortressUpgradeCost } from "./upgrades";
import {
  launchAttackUnit,
} from "./attack-units";
import { GameError } from "./errors";
import { ensureCommanderRegistrationColumn } from "./schema-guards";
import { getFortressSpawnLayout } from "./spawn-layout";

type DatabaseClient = PrismaClient | Prisma.TransactionClient;

const PUBLIC_NAME_MAX_LENGTH = 32;

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
