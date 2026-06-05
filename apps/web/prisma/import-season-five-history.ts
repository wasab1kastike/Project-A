import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/lib/prisma-client";

function createClient(connectionString: string) {
  return new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
  });
}

function assertDistinctDatabases(sourceUrl: string, targetUrl: string) {
  if (sourceUrl === targetUrl) {
    throw new Error(
      "PRODUCTION_DATABASE_URL and DATABASE_URL point to the same database."
    );
  }
}

async function createManySkipDuplicates(
  delegate: { createMany: (args: any) => Promise<unknown> },
  rows: unknown[]
) {
  if (rows.length === 0) return;
  await delegate.createMany({
    data: rows,
    skipDuplicates: true,
  });
}

async function main() {
  const sourceUrl = process.env.PRODUCTION_DATABASE_URL;
  const targetUrl = process.env.DATABASE_URL;

  if (!sourceUrl) {
    throw new Error("PRODUCTION_DATABASE_URL is required.");
  }

  if (!targetUrl) {
    throw new Error("DATABASE_URL is required.");
  }

  assertDistinctDatabases(sourceUrl, targetUrl);

  const source = createClient(sourceUrl);
  const target = createClient(targetUrl);

  try {
    const users = await source.user.findMany();
    for (const user of users) {
      await target.user.upsert({
        where: { id: user.id },
        create: user,
        update: {
          name: user.name,
          email: user.email,
          emailVerified: user.emailVerified,
          image: user.image,
          role: user.role,
          lastReadChatAt: user.lastReadChatAt,
          unitCosmeticVariant: user.unitCosmeticVariant,
          fortressCosmeticVariant: user.fortressCosmeticVariant,
          cosmeticUnlockedAt: user.cosmeticUnlockedAt,
          updatedAt: user.updatedAt,
        },
      });
    }

    const accounts = await source.account.findMany();
    await createManySkipDuplicates(target.account, accounts);

    const resolvedCycles = await source.cycle.findMany({
      where: {
        resolvedAt: {
          not: null,
        },
      },
    });
    const cycleIds = resolvedCycles.map((cycle) => cycle.id);
    await createManySkipDuplicates(
      target.cycle,
      resolvedCycles.map((cycle) => ({
        ...cycle,
        crownedFortressId: null,
      }))
    );

    const winnerRequests = await source.winnerRequest.findMany({
      where: {
        cycleId: {
          in: cycleIds,
        },
      },
    });
    await createManySkipDuplicates(target.winnerRequest, winnerRequests);

    const communityWishProposals = await source.communityWishProposal.findMany({
      where: {
        cycleId: {
          in: cycleIds,
        },
      },
    });
    await createManySkipDuplicates(
      target.communityWishProposal,
      communityWishProposals
    );

    const proposalIds = communityWishProposals.map((proposal) => proposal.id);
    const communityWishVotes = await source.communityWishVote.findMany({
      where: {
        proposalId: {
          in: proposalIds,
        },
      },
    });
    await createManySkipDuplicates(
      target.communityWishVote,
      communityWishVotes
    );

    const communityWishEntitlements =
      await source.communityWishVoteEntitlement.findMany({
        where: {
          cycleId: {
            in: cycleIds,
          },
        },
      });
    await createManySkipDuplicates(
      target.communityWishVoteEntitlement,
      communityWishEntitlements
    );

    const cycleHistories = await source.cycleHistory.findMany({
      where: {
        cycleId: {
          in: cycleIds,
        },
      },
    });
    await createManySkipDuplicates(target.cycleHistory, cycleHistories);

    const wallets = await source.arcadeWallet.findMany();
    await createManySkipDuplicates(target.arcadeWallet, wallets);

    const lootBoxPurchases = await source.arcadeLootBoxPurchase.findMany();
    await createManySkipDuplicates(
      target.arcadeLootBoxPurchase,
      lootBoxPurchases
    );

    const cosmeticUnlocks = await source.arcadeCosmeticUnlock.findMany();
    await createManySkipDuplicates(
      target.arcadeCosmeticUnlock,
      cosmeticUnlocks
    );

    const arcadeTransactions = await source.arcadeTransaction.findMany({
      where: {
        OR: [
          {
            cycleId: null,
          },
          {
            cycleId: {
              in: cycleIds,
            },
          },
        ],
      },
    });
    await createManySkipDuplicates(
      target.arcadeTransaction,
      arcadeTransactions
    );

    console.log(
      JSON.stringify(
        {
          users: users.length,
          accounts: accounts.length,
          resolvedCycles: resolvedCycles.length,
          winnerRequests: winnerRequests.length,
          communityWishProposals: communityWishProposals.length,
          communityWishVotes: communityWishVotes.length,
          communityWishEntitlements: communityWishEntitlements.length,
          cycleHistories: cycleHistories.length,
          wallets: wallets.length,
          lootBoxPurchases: lootBoxPurchases.length,
          cosmeticUnlocks: cosmeticUnlocks.length,
          arcadeTransactions: arcadeTransactions.length,
        },
        null,
        2
      )
    );
  } finally {
    await Promise.all([source.$disconnect(), target.$disconnect()]);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
