import {
  CycleStatus,
  FortressAction,
  Prisma,
  PrismaClient,
  ScoreEventType,
} from "@/lib/prisma-client";
import { prisma } from "@/lib/prisma";
import { ACTIVE_DURATION_HOURS, REGISTRATION_DURATION_HOURS } from "./constants";
import { addHours, addMinutes, floorToMinute } from "./time";

type TickSummary = {
  restartedRegistrationCycles: number;
  activatedCycles: number;
  processedMinutes: number;
  scoreEventsCreated: number;
};

function isUniqueTickError(error: unknown) {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  );
}

function getFirstTickAt(activeStartedAt: Date) {
  return addMinutes(floorToMinute(activeStartedAt), 1);
}

function getLastDueTickAt(
  cycle: {
    activeStartedAt: Date | null;
    activeEndsAt: Date | null;
  },
  now: Date
) {
  if (!cycle.activeStartedAt) {
    return null;
  }

  const nowTick = floorToMinute(now);
  const activeEndTick = cycle.activeEndsAt ? floorToMinute(cycle.activeEndsAt) : nowTick;
  const lastDueTickAt = nowTick < activeEndTick ? nowTick : activeEndTick;

  if (lastDueTickAt < getFirstTickAt(cycle.activeStartedAt)) {
    return null;
  }

  return lastDueTickAt;
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

    if (!cycle || cycle.status !== CycleStatus.REGISTRATION || cycle.registrationEndsAt > now) {
      return false;
    }

    if (cycle._count.fortresses > 0) {
      return false;
    }

    const registrationStartedAt = floorToMinute(now);
    const registrationEndsAt = addHours(
      registrationStartedAt,
      REGISTRATION_DURATION_HOURS
    );

    await tx.cycle.update({
      where: {
        id: cycle.id,
      },
      data: {
        status: CycleStatus.REGISTRATION,
        registrationStartedAt,
        registrationEndsAt,
        activeStartedAt: null,
        activeEndsAt: addHours(registrationEndsAt, ACTIVE_DURATION_HOURS),
      },
    });

    return true;
  });
}

async function activateRegistrationCycle(
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

    if (!cycle || cycle.status !== CycleStatus.REGISTRATION || cycle.registrationEndsAt > now) {
      return false;
    }

    if (cycle._count.fortresses === 0) {
      return false;
    }

    const activeStartedAt = cycle.registrationEndsAt;
    const activeEndsAt = addHours(activeStartedAt, ACTIVE_DURATION_HOURS);

    await tx.cycle.update({
      where: {
        id: cycle.id,
      },
      data: {
        status: CycleStatus.ACTIVE,
        activeStartedAt,
        activeEndsAt,
      },
    });

    await tx.fortress.updateMany({
      where: {
        cycleId: cycle.id,
      },
      data: {
        currentAction: FortressAction.GROW,
        targetFortressId: null,
      },
    });

    return true;
  });
}

async function processCycleTick(
  cycleId: string,
  tickAt: Date,
  now: Date,
  db: PrismaClient
) {
  return db.$transaction(async (tx) => {
    const cycle = await tx.cycle.findUnique({
      where: {
        id: cycleId,
      },
      select: {
        id: true,
        status: true,
        activeStartedAt: true,
        activeEndsAt: true,
      },
    });

    if (!cycle || cycle.status !== CycleStatus.ACTIVE || !cycle.activeStartedAt) {
      return { processed: false, scoreEventsCreated: 0 };
    }

    const firstTickAt = getFirstTickAt(cycle.activeStartedAt);
    const lastDueTickAt = getLastDueTickAt(cycle, now);

    if (!lastDueTickAt || tickAt < firstTickAt || tickAt > lastDueTickAt) {
      return { processed: false, scoreEventsCreated: 0 };
    }

    try {
      await tx.gameTick.create({
        data: {
          cycleId,
          tickAt,
        },
      });
    } catch (error) {
      if (isUniqueTickError(error)) {
        return { processed: false, scoreEventsCreated: 0 };
      }

      throw error;
    }

    const fortresses = await tx.fortress.findMany({
      where: {
        cycleId,
      },
      orderBy: [{ joinedAt: "asc" }, { id: "asc" }],
      select: {
        id: true,
        ownerId: true,
        points: true,
        currentAction: true,
        targetFortressId: true,
        joinedAt: true,
      },
    });

    const currentPoints = new Map(
      fortresses.map((fortress) => [fortress.id, fortress.points])
    );
    const scoreEvents: Prisma.ScoreEventCreateManyInput[] = [];

    for (const fortress of fortresses) {
      if (fortress.currentAction === FortressAction.GROW) {
        currentPoints.set(fortress.id, (currentPoints.get(fortress.id) ?? 0) + 1);
        scoreEvents.push({
          cycleId,
          fortressId: fortress.id,
          actorId: fortress.ownerId,
          eventType: ScoreEventType.GROW_TICK,
          delta: 1,
          createdAt: tickAt,
        });
        continue;
      }

      const targetId = fortress.targetFortressId;

      if (!targetId || targetId === fortress.id || !currentPoints.has(targetId)) {
        continue;
      }

      const attackerPoints = currentPoints.get(fortress.id) ?? 0;
      const targetPoints = currentPoints.get(targetId) ?? 0;
      const attackerLoss = Math.min(attackerPoints, 1);
      const targetLoss = Math.min(targetPoints, 2);

      currentPoints.set(fortress.id, attackerPoints - attackerLoss);
      currentPoints.set(targetId, targetPoints - targetLoss);

      scoreEvents.push({
        cycleId,
        fortressId: fortress.id,
        actorId: fortress.ownerId,
        targetFortressId: fortress.id,
        eventType: ScoreEventType.ATTACK_SELF,
        delta: -attackerLoss,
        createdAt: tickAt,
      });
      scoreEvents.push({
        cycleId,
        fortressId: targetId,
        actorId: fortress.ownerId,
        targetFortressId: targetId,
        eventType: ScoreEventType.ATTACK_TARGET,
        delta: -targetLoss,
        createdAt: tickAt,
      });
    }

    for (const fortress of fortresses) {
      const nextPoints = currentPoints.get(fortress.id) ?? fortress.points;

      if (nextPoints !== fortress.points) {
        await tx.fortress.update({
          where: {
            id: fortress.id,
          },
          data: {
            points: nextPoints,
          },
        });
      }
    }

    if (scoreEvents.length > 0) {
      await tx.scoreEvent.createMany({
        data: scoreEvents,
      });
    }

    return {
      processed: true,
      scoreEventsCreated: scoreEvents.length,
    };
  });
}

export async function runGameTick({
  now = new Date(),
  db = prisma,
}: {
  now?: Date;
  db?: PrismaClient;
} = {}): Promise<TickSummary> {
  const summary: TickSummary = {
    restartedRegistrationCycles: 0,
    activatedCycles: 0,
    processedMinutes: 0,
    scoreEventsCreated: 0,
  };

  const expiredRegistrationCycles = await db.cycle.findMany({
    where: {
      status: CycleStatus.REGISTRATION,
      registrationEndsAt: {
        lte: now,
      },
    },
    orderBy: {
      registrationEndsAt: "asc",
    },
    select: {
      id: true,
    },
  });

  for (const cycle of expiredRegistrationCycles) {
    if (await restartEmptyRegistrationCycle(cycle.id, now, db)) {
      summary.restartedRegistrationCycles += 1;
      continue;
    }

    if (await activateRegistrationCycle(cycle.id, now, db)) {
      summary.activatedCycles += 1;
    }
  }

  const activeCycles = await db.cycle.findMany({
    where: {
      status: CycleStatus.ACTIVE,
      activeStartedAt: {
        not: null,
      },
    },
    orderBy: {
      activeStartedAt: "asc",
    },
    select: {
      id: true,
      activeStartedAt: true,
      activeEndsAt: true,
    },
  });

  for (const cycle of activeCycles) {
    if (!cycle.activeStartedAt) {
      continue;
    }

    const lastProcessedTick = await db.gameTick.findFirst({
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

    const nextTickAt = lastProcessedTick
      ? addMinutes(lastProcessedTick.tickAt, 1)
      : getFirstTickAt(cycle.activeStartedAt);
    const lastDueTickAt = getLastDueTickAt(cycle, now);

    if (!lastDueTickAt || nextTickAt > lastDueTickAt) {
      continue;
    }

    for (
      let tickAt = nextTickAt;
      tickAt <= lastDueTickAt;
      tickAt = addMinutes(tickAt, 1)
    ) {
      const result = await processCycleTick(cycle.id, tickAt, now, db);

      if (result.processed) {
        summary.processedMinutes += 1;
        summary.scoreEventsCreated += result.scoreEventsCreated;
      }
    }
  }

  return summary;
}
