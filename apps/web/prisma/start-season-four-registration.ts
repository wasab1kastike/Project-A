import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

import {
  CycleRuleset,
  CycleStatus,
  PrismaClient,
} from "../src/lib/prisma-client";
import { createPrismaClientOptions } from "../src/lib/prisma-options";
import { floorToMinute } from "../src/lib/game/time";

const prisma = new PrismaClient(createPrismaClientOptions());

const ACTIVE_STARTS_AT = new Date("2026-06-01T09:00:00.000Z");
const ACTIVE_ENDS_AT = new Date("2026-06-15T09:00:00.000Z");

function sameTime(left: Date | null, right: Date | null) {
  return left?.getTime() === right?.getTime();
}

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required.");
  }

  const now = floorToMinute(new Date());

  const result = await prisma.$transaction(async (tx) => {
    const currentCycle = await tx.cycle.findFirst({
      where: {
        resolvedAt: null,
      },
      orderBy: {
        createdAt: "desc",
      },
      include: {
        _count: {
          select: {
            fortresses: true,
            gameTicks: true,
            battlefields: true,
            attackUnits: true,
            scoreEvents: true,
          },
        },
      },
    });

    if (
      currentCycle?.status === CycleStatus.REGISTRATION &&
      currentCycle.ruleset === CycleRuleset.SEASON_4 &&
      sameTime(currentCycle.registrationEndsAt, ACTIVE_STARTS_AT) &&
      sameTime(currentCycle.testingStartedAt, ACTIVE_STARTS_AT) &&
      sameTime(currentCycle.testingEndsAt, ACTIVE_STARTS_AT) &&
      currentCycle.activeStartedAt === null &&
      sameTime(currentCycle.activeEndsAt, ACTIVE_ENDS_AT)
    ) {
      return {
        mode: "already-configured",
        cycleId: currentCycle.id,
        archivedCycleId: null,
        registrationStartedAt: currentCycle.registrationStartedAt,
        registrationEndsAt: currentCycle.registrationEndsAt,
        testingStartedAt: currentCycle.testingStartedAt,
        testingEndsAt: currentCycle.testingEndsAt,
        activeStartedAt: currentCycle.activeStartedAt,
        activeEndsAt: currentCycle.activeEndsAt,
        archivedCounts: currentCycle._count,
      };
    }

    if (currentCycle?.status === CycleStatus.REGISTRATION) {
      const updatedCycle = await tx.cycle.update({
        where: {
          id: currentCycle.id,
        },
        data: {
          ruleset: CycleRuleset.SEASON_4,
          registrationStartedAt: now,
          registrationEndsAt: ACTIVE_STARTS_AT,
          testingStartedAt: ACTIVE_STARTS_AT,
          testingEndsAt: ACTIVE_STARTS_AT,
          activeStartedAt: null,
          activeEndsAt: ACTIVE_ENDS_AT,
          joiningLockedAt: null,
          winnerId: null,
          crownedFortressId: null,
        },
      });

      return {
        mode: "updated-registration-cycle",
        cycleId: updatedCycle.id,
        archivedCycleId: null,
        registrationStartedAt: updatedCycle.registrationStartedAt,
        registrationEndsAt: updatedCycle.registrationEndsAt,
        testingStartedAt: updatedCycle.testingStartedAt,
        testingEndsAt: updatedCycle.testingEndsAt,
        activeStartedAt: updatedCycle.activeStartedAt,
        activeEndsAt: updatedCycle.activeEndsAt,
        archivedCounts: currentCycle._count,
      };
    }

    if (currentCycle) {
      await tx.cycle.update({
        where: {
          id: currentCycle.id,
        },
        data: {
          status: CycleStatus.RESOLUTION,
          resolvedAt: now,
          winnerId: null,
          crownedFortressId: null,
          joiningLockedAt: null,
        },
      });
    }

    const newCycle = await tx.cycle.create({
      data: {
        status: CycleStatus.REGISTRATION,
        ruleset: CycleRuleset.SEASON_4,
        registrationStartedAt: now,
        registrationEndsAt: ACTIVE_STARTS_AT,
        testingStartedAt: ACTIVE_STARTS_AT,
        testingEndsAt: ACTIVE_STARTS_AT,
        activeStartedAt: null,
        activeEndsAt: ACTIVE_ENDS_AT,
        joiningLockedAt: null,
      },
    });

    return {
      mode: "archived-current-and-created-registration",
      cycleId: newCycle.id,
      archivedCycleId: currentCycle?.id ?? null,
      registrationStartedAt: newCycle.registrationStartedAt,
      registrationEndsAt: newCycle.registrationEndsAt,
      testingStartedAt: newCycle.testingStartedAt,
      testingEndsAt: newCycle.testingEndsAt,
      activeStartedAt: newCycle.activeStartedAt,
      activeEndsAt: newCycle.activeEndsAt,
      archivedCounts: currentCycle?._count ?? null,
    };
  });

  console.log(JSON.stringify(result, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
