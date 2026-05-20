import { CycleStatus, PrismaClient } from "../src/lib/prisma-client";
import { createPrismaClientOptions } from "../src/lib/prisma-options";

const prisma = new PrismaClient(createPrismaClientOptions());

const ACTIVE_ENDS_AT = new Date("2026-05-22T09:00:00.000Z");
const COMMUNITY_WISH_PROPOSAL_ENDS_AT = new Date("2026-05-25T09:00:00.000Z");
const COMMUNITY_WISH_VOTING_ENDS_AT = new Date("2026-05-26T09:00:00.000Z");

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required.");
  }

  const result = await prisma.$transaction(async (tx) => {
    const cycle = await tx.cycle.findFirst({
      where: {
        resolvedAt: null,
      },
      orderBy: {
        createdAt: "desc",
      },
      select: {
        id: true,
        status: true,
        activeEndsAt: true,
      },
    });

    if (!cycle) {
      throw new Error("No unresolved cycle found.");
    }

    if (cycle.status !== CycleStatus.ACTIVE) {
      throw new Error(
        `Expected current cycle to be ACTIVE, got ${cycle.status}.`
      );
    }

    const updatedCycle = await tx.cycle.update({
      where: {
        id: cycle.id,
      },
      data: {
        activeEndsAt: ACTIVE_ENDS_AT,
      },
      select: {
        id: true,
        status: true,
        activeEndsAt: true,
      },
    });

    const updatedHistory = await tx.cycleHistory.updateMany({
      where: {
        cycleId: cycle.id,
      },
      data: {
        communityWishProposalEndsAt: COMMUNITY_WISH_PROPOSAL_ENDS_AT,
        communityWishVotingEndsAt: COMMUNITY_WISH_VOTING_ENDS_AT,
      },
    });

    return {
      cycleId: updatedCycle.id,
      status: updatedCycle.status,
      previousActiveEndsAt: cycle.activeEndsAt,
      activeEndsAt: updatedCycle.activeEndsAt,
      communityWishProposalEndsAt: COMMUNITY_WISH_PROPOSAL_ENDS_AT,
      communityWishVotingEndsAt: COMMUNITY_WISH_VOTING_ENDS_AT,
      existingHistoryRowsUpdated: updatedHistory.count,
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
