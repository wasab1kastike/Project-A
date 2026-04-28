import { prisma } from "@/lib/prisma";
import { CycleStatus, type PrismaClient } from "@/lib/prisma-client";
import { GameError } from "./errors";
import { ensureOpenRegistrationCycle } from "./bootstrap";
import { floorToMinute } from "./time";
import { runGameTick } from "./tick";

export async function setRegistrationJoiningLock({
  locked,
  now = new Date(),
  db = prisma,
}: {
  locked: boolean;
  now?: Date;
  db?: PrismaClient;
}) {
  return db.$transaction(async (tx) => {
    const cycle = await tx.cycle.findFirst({
      where: {
        resolvedAt: null,
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    if (
      !cycle ||
      (cycle.status !== CycleStatus.REGISTRATION &&
        cycle.status !== CycleStatus.TESTING)
    ) {
      throw new GameError("Joining can only be locked before ACTIVE.");
    }

    const joiningEndsAt =
      cycle.status === CycleStatus.TESTING
        ? cycle.testingEndsAt
        : cycle.registrationEndsAt;

    if (!joiningEndsAt || joiningEndsAt <= now) {
      throw new GameError("Joining already expired for the current cycle.");
    }

    return tx.cycle.update({
      where: {
        id: cycle.id,
      },
      data: {
        joiningLockedAt: locked ? floorToMinute(now) : null,
      },
    });
  });
}

export async function forceEndCurrentCycle({
  now = new Date(),
  db = prisma,
}: {
  now?: Date;
  db?: PrismaClient;
} = {}) {
  const effectiveNow = floorToMinute(now);

  await db.$transaction(async (tx) => {
    const cycle = await tx.cycle.findFirst({
      where: {
        resolvedAt: null,
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    if (!cycle) {
      throw new GameError("No unresolved cycle is available to force-end.");
    }

    if (cycle.status === CycleStatus.REGISTRATION) {
      await tx.cycle.update({
        where: {
          id: cycle.id,
        },
        data: {
          registrationEndsAt: effectiveNow,
          testingStartedAt: effectiveNow,
          testingEndsAt: effectiveNow,
          activeStartedAt: effectiveNow,
        },
      });

      return;
    }

    if (cycle.status === CycleStatus.TESTING) {
      await tx.cycle.update({
        where: {
          id: cycle.id,
        },
        data: {
          testingEndsAt: effectiveNow,
          activeStartedAt: effectiveNow,
        },
      });

      return;
    }

    if (cycle.status === CycleStatus.ACTIVE) {
      const activeEndsAt =
        cycle.activeStartedAt && effectiveNow < cycle.activeStartedAt
          ? cycle.activeStartedAt
          : effectiveNow;

      await tx.cycle.update({
        where: {
          id: cycle.id,
        },
        data: {
          activeEndsAt,
        },
      });

      return;
    }

    throw new GameError("The current cycle is already resolving.");
  });

  return runGameTick({
    now: effectiveNow,
    db,
  });
}

export async function emergencyResetCurrentCycle({
  now = new Date(),
  db = prisma,
}: {
  now?: Date;
  db?: PrismaClient;
} = {}) {
  const effectiveNow = floorToMinute(now);

  return db.$transaction(async (tx) => {
    const cycle = await tx.cycle.findFirst({
      where: {
        resolvedAt: null,
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    if (!cycle) {
      throw new GameError("No unresolved cycle is available to reset.");
    }

    await tx.cycle.update({
      where: {
        id: cycle.id,
      },
      data: {
        status: CycleStatus.RESOLUTION,
        resolvedAt: effectiveNow,
        winnerId: null,
        joiningLockedAt: null,
      },
    });

    const nextCycle = await ensureOpenRegistrationCycle(tx, effectiveNow);

    return {
      archivedCycleId: cycle.id,
      nextCycleId: nextCycle.id,
    };
  });
}

export async function runManualCatchUpTick({
  now = new Date(),
  db = prisma,
}: {
  now?: Date;
  db?: PrismaClient;
} = {}) {
  return runGameTick({
    now: floorToMinute(now),
    db,
  });
}
