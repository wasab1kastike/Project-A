import { CycleStatus, PrismaClient } from "../src/lib/prisma-client";
import {
  CURRENT_MAP_LAYOUT_VERSION,
  TESTING_DURATION_HOURS,
  TESTING_ENDS_BEFORE_ACTIVE_HOURS,
} from "../src/lib/game/constants";

const prisma = new PrismaClient({
  datasources: process.env.DATABASE_URL
    ? {
        db: {
          url: process.env.DATABASE_URL,
        },
      }
    : undefined,
});

const activeStartsAt = new Date(
  process.env.SEASON_ONE_ACTIVE_STARTS_AT ?? "2026-04-23T09:00:00.000Z"
);
const testingStartedAt = new Date(
  activeStartsAt.getTime() - TESTING_DURATION_HOURS * 60 * 60 * 1000
);
const testingEndsAt = new Date(
  activeStartsAt.getTime() -
    TESTING_ENDS_BEFORE_ACTIVE_HOURS * 60 * 60 * 1000
);
const activeEndsAt = new Date(activeStartsAt.getTime() + 72 * 60 * 60 * 1000);

function floorToMinute(date: Date) {
  const floored = new Date(date);
  floored.setSeconds(0, 0);
  return floored;
}

async function main() {
  if (!Number.isFinite(activeStartsAt.getTime())) {
    throw new Error("SEASON_ONE_ACTIVE_STARTS_AT must be a valid ISO datetime.");
  }

  const existingSeasonOne = await prisma.cycle.findFirst({
    where: {
      registrationEndsAt: activeStartsAt,
    },
    select: {
      id: true,
    },
  });

  if (existingSeasonOne) {
    console.log(
      `Season 1 reset already applied for ${activeStartsAt.toISOString()}; skipping.`
    );
    return;
  }

  if (activeStartsAt <= new Date()) {
    throw new Error("Season 1 active start must be in the future.");
  }

  const registrationStartedAt = floorToMinute(new Date());

  await prisma.$transaction(async (tx) => {
    await tx.attackUnit.deleteMany();
    await tx.scoreEvent.deleteMany();
    await tx.gameTick.deleteMany();
    await tx.chatMessage.deleteMany();
    await tx.cycleHistory.deleteMany();
    await tx.winnerRequest.deleteMany();
    await tx.fortress.deleteMany();
    await tx.cycle.deleteMany();

    await tx.cycle.create({
      data: {
        status: CycleStatus.REGISTRATION,
        registrationStartedAt,
        registrationEndsAt: activeStartsAt,
        testingStartedAt,
        testingEndsAt,
        activeStartedAt: null,
        activeEndsAt,
        joiningLockedAt: null,
        winnerId: null,
        crownedFortressId: null,
        mapLayoutVersion: CURRENT_MAP_LAYOUT_VERSION,
      },
    });
  });

  console.log("Production game state reset for Season 1.");
  console.log(`Registration started: ${registrationStartedAt.toISOString()}`);
  console.log(`Testing starts: ${testingStartedAt.toISOString()}`);
  console.log(`Testing ends: ${testingEndsAt.toISOString()}`);
  console.log(`Season active starts: ${activeStartsAt.toISOString()}`);
  console.log(`Season active ends: ${activeEndsAt.toISOString()}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
