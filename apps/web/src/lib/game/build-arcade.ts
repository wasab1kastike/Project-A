import { prisma } from "@/lib/prisma";
import {
  BUILD_ARCADE_SKIN_VARIANTS,
  type BuildArcadeSkinVariant,
} from "./constants";
import { CycleStatus, PrismaClient } from "@/lib/prisma-client";
import { GameError } from "./errors";

function getRewardVariant(score: number): BuildArcadeSkinVariant | null {
  if (score >= 24) {
    return BUILD_ARCADE_SKIN_VARIANTS[3];
  }

  if (score >= 18) {
    return BUILD_ARCADE_SKIN_VARIANTS[2];
  }

  if (score >= 10) {
    return BUILD_ARCADE_SKIN_VARIANTS[1];
  }

  if (score >= 5) {
    return BUILD_ARCADE_SKIN_VARIANTS[0];
  }

  return null;
}

function normalizeScore(score: number) {
  if (!Number.isFinite(score)) {
    return 0;
  }

  return Math.max(0, Math.trunc(score));
}

export async function getBuildArcadePageState({
  userId,
  now = new Date(),
  db = prisma,
}: {
  userId?: string;
  now?: Date;
  db?: PrismaClient;
}) {
  const cycle = await db.cycle.findFirst({
    where: {
      resolvedAt: null,
    },
    orderBy: {
      createdAt: "desc",
    },
    include: {
      ...(userId
        ? {
            fortresses: {
              where: {
                ownerId: userId,
              },
              take: 1,
              select: {
                id: true,
                ownerId: true,
              },
            },
            buildArcadeRuns: {
              where: {
                userId,
              },
              take: 1,
              orderBy: {
                score: "desc",
              },
              select: {
                score: true,
                rewardVariant: true,
              },
            },
          }
        : {}),
    },
  });

  const playerFortress = cycle?.fortresses[0] ?? null;
  const bestRun = cycle?.buildArcadeRuns?.[0] ?? null;
  const buildOpen =
    cycle?.status === CycleStatus.REGISTRATION &&
    cycle.registrationEndsAt > now;

  return {
    cycleId: cycle?.id ?? null,
    buildEndsAt: cycle?.registrationEndsAt ?? null,
    buildOpen,
    canPlay: Boolean(userId && playerFortress && buildOpen),
    bestScore: bestRun?.score ?? 0,
    bestRewardVariant: bestRun?.rewardVariant ?? null,
    nextRewardLabel: getRewardVariant((bestRun?.score ?? 0) + 1),
    currentRewardVariant: bestRun?.rewardVariant ?? null,
    submissionHint: buildOpen
      ? "Play during the build phase. Higher scores unlock fortress and unit skins."
      : "The arcade opens during build phase between seasons.",
  };
}

export async function submitBuildArcadeScore({
  cycleId,
  userId,
  score,
  now = new Date(),
  db = prisma,
}: {
  cycleId: string;
  userId: string;
  score: number;
  now?: Date;
  db?: PrismaClient;
}) {
  const normalizedScore = normalizeScore(score);
  const rewardVariant = getRewardVariant(normalizedScore);

  return db.$transaction(async (tx) => {
    const cycle = await tx.cycle.findUnique({
      where: {
        id: cycleId,
      },
      select: {
        id: true,
        status: true,
        registrationEndsAt: true,
        fortresses: {
          where: {
            ownerId: userId,
          },
          take: 1,
          select: {
            id: true,
          },
        },
      },
    });

    if (
      !cycle ||
      cycle.status !== CycleStatus.REGISTRATION ||
      cycle.registrationEndsAt <= now
    ) {
      throw new GameError("The build arcade is only open during the build phase.");
    }

    if (cycle.fortresses.length === 0) {
      throw new GameError("Only build phase players can submit arcade scores.");
    }

    const existing = await tx.buildArcadeRun.findUnique({
      where: {
        cycleId_userId: {
          cycleId,
          userId,
        },
      },
    });

    if (existing && existing.score >= normalizedScore) {
      return existing;
    }

    const run = await tx.buildArcadeRun.upsert({
      where: {
        cycleId_userId: {
          cycleId,
          userId,
        },
      },
      create: {
        cycleId,
        userId,
        score: normalizedScore,
        rewardVariant,
      },
      update: {
        score: normalizedScore,
        rewardVariant,
      },
    });

    if (rewardVariant) {
      await tx.user.update({
        where: {
          id: userId,
        },
        data: {
          unitCosmeticVariant: rewardVariant,
          fortressCosmeticVariant: rewardVariant,
          cosmeticUnlockedAt: now,
        },
      });
    }

    return run;
  });
}

export { getRewardVariant as getBuildArcadeRewardVariant };
