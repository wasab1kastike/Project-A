import { mintSeasonArcadeCoins } from "../src/lib/game/arcade";
import { CycleStatus, PrismaClient } from "../src/lib/prisma-client";

const defaultDatabaseUrl =
  "postgresql://postgres:postgres@localhost:5432/project_a?schema=public";

process.env.DATABASE_URL ??= defaultDatabaseUrl;

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL,
    },
  },
});

async function main() {
  const seasonOneHistory = await prisma.cycleHistory.findFirst({
    orderBy: {
      endedAt: "asc",
    },
    select: {
      cycleId: true,
      endedAt: true,
    },
  });

  const fallbackResolvedCycle = seasonOneHistory
    ? null
    : await prisma.cycle.findFirst({
        where: {
          status: CycleStatus.RESOLUTION,
          resolvedAt: {
            not: null,
          },
        },
        orderBy: {
          resolvedAt: "asc",
        },
        select: {
          id: true,
          resolvedAt: true,
        },
      });

  const cycleId = seasonOneHistory?.cycleId ?? fallbackResolvedCycle?.id;
  const mintedAt =
    seasonOneHistory?.endedAt ??
    fallbackResolvedCycle?.resolvedAt ??
    new Date();

  if (!cycleId) {
    console.log("No resolved Season 1 cycle found; skipping coin allocation.");
    return;
  }

  const result = await mintSeasonArcadeCoins({
    cycleId,
    now: mintedAt,
    db: prisma,
  });

  console.log(
    `Season 1 arcade coins allocated for cycle ${cycleId}: ${result.mintedPlayers} players, ${result.mintedCoins} coins.`
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
