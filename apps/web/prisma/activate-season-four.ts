import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

import {
  CycleRuleset,
  CycleStatus,
  PrismaClient,
} from "../src/lib/prisma-client";
import { createPrismaClientOptions } from "../src/lib/prisma-options";
import { runGameTick } from "../src/lib/game/tick";
import { floorToMinute } from "../src/lib/game/time";

const prisma = new PrismaClient(createPrismaClientOptions());

const ACTIVE_STARTS_AT = new Date("2026-06-01T09:00:00.000Z");
const ACTIVE_ENDS_AT = new Date("2026-06-15T09:00:00.000Z");

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required.");
  }

  const now = floorToMinute(new Date());

  const prepared = await prisma.$transaction(async (tx) => {
    const cycle = await tx.cycle.findFirst({
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
          },
        },
      },
    });

    if (!cycle) {
      throw new Error("No unresolved cycle is available to activate.");
    }

    if (cycle.ruleset !== CycleRuleset.SEASON_4) {
      throw new Error(
        `Refusing to activate non-Season 4 cycle ${cycle.id} (${cycle.ruleset}).`
      );
    }

    if (cycle.status === CycleStatus.ACTIVE) {
      return {
        mode: "already-active",
        cycleId: cycle.id,
        status: cycle.status,
        activeStartedAt: cycle.activeStartedAt,
        activeEndsAt: cycle.activeEndsAt,
        fortressCount: cycle._count.fortresses,
      };
    }

    if (
      cycle.status !== CycleStatus.REGISTRATION &&
      cycle.status !== CycleStatus.TESTING
    ) {
      throw new Error(
        `Refusing to activate cycle ${cycle.id} from status ${cycle.status}.`
      );
    }

    if (cycle._count.fortresses === 0) {
      throw new Error(
        `Refusing to activate cycle ${cycle.id} because no player fortresses are registered.`
      );
    }

    const updated = await tx.cycle.update({
      where: {
        id: cycle.id,
      },
      data: {
        status: CycleStatus.TESTING,
        registrationEndsAt: ACTIVE_STARTS_AT,
        testingStartedAt: cycle.testingStartedAt ?? ACTIVE_STARTS_AT,
        testingEndsAt: ACTIVE_STARTS_AT,
        activeStartedAt: ACTIVE_STARTS_AT,
        activeEndsAt: ACTIVE_ENDS_AT,
        joiningLockedAt: null,
      },
    });

    return {
      mode:
        cycle.status === CycleStatus.REGISTRATION
          ? "prepared-registration"
          : "prepared-testing",
      cycleId: updated.id,
      status: updated.status,
      activeStartedAt: updated.activeStartedAt,
      activeEndsAt: updated.activeEndsAt,
      fortressCount: cycle._count.fortresses,
    };
  });

  const previousActivationFlag = process.env.SEASON_4_ACTIVATION_ENABLED;
  process.env.SEASON_4_ACTIVATION_ENABLED = "true";

  try {
    const summary = await runGameTick({
      now,
      db: prisma,
    });

    const cycle = await prisma.cycle.findUniqueOrThrow({
      where: {
        id: prepared.cycleId,
      },
      select: {
        id: true,
        ruleset: true,
        status: true,
        testingEndsAt: true,
        activeStartedAt: true,
        activeEndsAt: true,
      },
    });

    console.log(
      JSON.stringify(
        {
          prepared,
          tickSummary: summary,
          cycle,
        },
        null,
        2
      )
    );
  } finally {
    if (previousActivationFlag === undefined) {
      delete process.env.SEASON_4_ACTIVATION_ENABLED;
    } else {
      process.env.SEASON_4_ACTIVATION_ENABLED = previousActivationFlag;
    }
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
