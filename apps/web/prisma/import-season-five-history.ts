import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, type Prisma } from "../src/lib/prisma-client";

type ImportMode = "apply" | "dry-run" | "count-only";

type ImportCounts = {
  users: number;
  accounts: number;
  resolvedCycles: number;
  winnerRequests: number;
  communityWishProposals: number;
  communityWishVotes: number;
  communityWishEntitlements: number;
  cycleHistories: number;
  wallets: number;
  lootBoxPurchases: number;
  cosmeticUnlocks: number;
  arcadeTransactions: number;
};

type CreateManyDelegate = {
  createMany: (args: any) => Promise<unknown>;
};

const EMPTY_COUNTS: ImportCounts = {
  users: 0,
  accounts: 0,
  resolvedCycles: 0,
  winnerRequests: 0,
  communityWishProposals: 0,
  communityWishVotes: 0,
  communityWishEntitlements: 0,
  cycleHistories: 0,
  wallets: 0,
  lootBoxPurchases: 0,
  cosmeticUnlocks: 0,
  arcadeTransactions: 0,
};

function parseMode(args = process.argv.slice(2)): ImportMode {
  if (args.includes("--dry-run")) return "dry-run";
  if (args.includes("--count-only")) return "count-only";
  return "apply";
}

function normalizeDatabaseUrl(rawUrl: string, label: string) {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error(`${label} is not a valid database URL.`);
  }

  if (parsed.protocol !== "postgresql:" && parsed.protocol !== "postgres:") {
    throw new Error(`${label} must use postgres:// or postgresql://.`);
  }

  return parsed;
}

function comparableDatabaseIdentity(parsed: URL) {
  return [
    parsed.hostname.toLowerCase(),
    parsed.port || "5432",
    parsed.pathname.replace(/\/+$/, ""),
    parsed.username,
  ].join("|");
}

function redactDatabaseUrl(parsed: URL) {
  const copy = new URL(parsed.toString());
  if (copy.password) copy.password = "REDACTED";
  if (copy.username) copy.username = "REDACTED";
  return copy.toString();
}

function assertDistinctDatabases(sourceUrl: string, targetUrl: string) {
  const source = normalizeDatabaseUrl(sourceUrl, "PRODUCTION_DATABASE_URL");
  const target = normalizeDatabaseUrl(targetUrl, "DATABASE_URL");

  if (
    source.toString() === target.toString() ||
    comparableDatabaseIdentity(source) === comparableDatabaseIdentity(target)
  ) {
    throw new Error(
      "PRODUCTION_DATABASE_URL and DATABASE_URL point to the same database."
    );
  }

  return { source, target };
}

function createClient(connectionString: string) {
  return new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
  });
}

async function createManySkipDuplicates(
  delegate: CreateManyDelegate,
  rows: unknown[],
  mode: ImportMode
) {
  if (rows.length === 0 || mode !== "apply") return;
  await delegate.createMany({
    data: rows,
    skipDuplicates: true,
  });
}

async function upsertUsers(
  target: PrismaClient,
  users: Prisma.UserGetPayload<object>[],
  mode: ImportMode
) {
  if (mode !== "apply") return;
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
}

async function upsertWallets(
  target: PrismaClient,
  wallets: Prisma.ArcadeWalletGetPayload<object>[],
  mode: ImportMode
) {
  if (mode !== "apply") return;
  for (const wallet of wallets) {
    await target.arcadeWallet.upsert({
      where: { userId: wallet.userId },
      create: wallet,
      update: {
        balance: wallet.balance,
        updatedAt: wallet.updatedAt,
      },
    });
  }
}

async function collectImportRows(source: PrismaClient) {
  const users = await source.user.findMany();
  const accounts = await source.account.findMany();
  const resolvedCycles = await source.cycle.findMany({
    where: {
      resolvedAt: {
        not: null,
      },
    },
  });
  const cycleIds = resolvedCycles.map((cycle) => cycle.id);
  const winnerRequests = await source.winnerRequest.findMany({
    where: {
      cycleId: {
        in: cycleIds,
      },
    },
  });
  const communityWishProposals = await source.communityWishProposal.findMany({
    where: {
      cycleId: {
        in: cycleIds,
      },
    },
  });
  const proposalIds = communityWishProposals.map((proposal) => proposal.id);
  const communityWishVotes = await source.communityWishVote.findMany({
    where: {
      proposalId: {
        in: proposalIds,
      },
    },
  });
  const communityWishEntitlements =
    await source.communityWishVoteEntitlement.findMany({
      where: {
        cycleId: {
          in: cycleIds,
        },
      },
    });
  const cycleHistories = await source.cycleHistory.findMany({
    where: {
      cycleId: {
        in: cycleIds,
      },
    },
  });
  const wallets = await source.arcadeWallet.findMany();
  const lootBoxPurchases = await source.arcadeLootBoxPurchase.findMany();
  const cosmeticUnlocks = await source.arcadeCosmeticUnlock.findMany();
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

  return {
    users,
    accounts,
    resolvedCycles,
    winnerRequests,
    communityWishProposals,
    communityWishVotes,
    communityWishEntitlements,
    cycleHistories,
    wallets,
    lootBoxPurchases,
    cosmeticUnlocks,
    arcadeTransactions,
  };
}

function countRows(rows: Awaited<ReturnType<typeof collectImportRows>>) {
  return {
    users: rows.users.length,
    accounts: rows.accounts.length,
    resolvedCycles: rows.resolvedCycles.length,
    winnerRequests: rows.winnerRequests.length,
    communityWishProposals: rows.communityWishProposals.length,
    communityWishVotes: rows.communityWishVotes.length,
    communityWishEntitlements: rows.communityWishEntitlements.length,
    cycleHistories: rows.cycleHistories.length,
    wallets: rows.wallets.length,
    lootBoxPurchases: rows.lootBoxPurchases.length,
    cosmeticUnlocks: rows.cosmeticUnlocks.length,
    arcadeTransactions: rows.arcadeTransactions.length,
  } satisfies ImportCounts;
}

async function applyImport(
  target: PrismaClient,
  rows: Awaited<ReturnType<typeof collectImportRows>>,
  mode: ImportMode
) {
  await upsertUsers(target, rows.users, mode);
  await createManySkipDuplicates(target.account, rows.accounts, mode);
  await createManySkipDuplicates(
    target.cycle,
    rows.resolvedCycles.map((cycle) => ({
      ...cycle,
      crownedFortressId: null,
    })),
    mode
  );
  await createManySkipDuplicates(
    target.winnerRequest,
    rows.winnerRequests,
    mode
  );
  await createManySkipDuplicates(
    target.communityWishProposal,
    rows.communityWishProposals,
    mode
  );
  await createManySkipDuplicates(
    target.communityWishVote,
    rows.communityWishVotes,
    mode
  );
  await createManySkipDuplicates(
    target.communityWishVoteEntitlement,
    rows.communityWishEntitlements,
    mode
  );
  await createManySkipDuplicates(
    target.cycleHistory,
    rows.cycleHistories,
    mode
  );
  await upsertWallets(target, rows.wallets, mode);
  await createManySkipDuplicates(
    target.arcadeLootBoxPurchase,
    rows.lootBoxPurchases,
    mode
  );
  await createManySkipDuplicates(
    target.arcadeCosmeticUnlock,
    rows.cosmeticUnlocks,
    mode
  );
  await createManySkipDuplicates(
    target.arcadeTransaction,
    rows.arcadeTransactions,
    mode
  );
}

function categorizeImportError(error: unknown) {
  if (error instanceof Error) {
    if (
      "code" in error &&
      typeof error.code === "string" &&
      ["ECONNREFUSED", "ETIMEDOUT", "ENOTFOUND", "EAI_AGAIN"].includes(
        error.code
      )
    ) {
      return `database_unreachable: ${error.message}`;
    }

    if (
      /password authentication failed|permission denied|no pg_hba|not authorized|authentication/i.test(
        error.message
      )
    ) {
      return `database_access_denied: ${error.message}`;
    }

    if (
      error.name.includes("PrismaClientKnownRequestError") ||
      /unique constraint|foreign key constraint|constraint failed|violates/i.test(
        error.message
      )
    ) {
      return `database_constraint_error: ${error.message}`;
    }

    return `import_error: ${error.message}`;
  }

  return `import_error: ${String(error)}`;
}

async function main() {
  const sourceUrl = process.env.PRODUCTION_DATABASE_URL;
  const targetUrl = process.env.DATABASE_URL;
  const mode = parseMode();

  if (!sourceUrl) {
    throw new Error("PRODUCTION_DATABASE_URL is required.");
  }

  if (!targetUrl) {
    throw new Error("DATABASE_URL is required.");
  }

  const { source, target } = assertDistinctDatabases(sourceUrl, targetUrl);
  console.log(
    JSON.stringify(
      {
        mode,
        source: redactDatabaseUrl(source),
        target: redactDatabaseUrl(target),
        writesEnabled: mode === "apply",
      },
      null,
      2
    )
  );

  const sourceClient = createClient(sourceUrl);
  const targetClient = createClient(targetUrl);
  let counts: ImportCounts = { ...EMPTY_COUNTS };

  try {
    const rows = await collectImportRows(sourceClient);
    counts = countRows(rows);

    if (mode !== "count-only") {
      await applyImport(targetClient, rows, mode);
    }

    console.log(JSON.stringify({ mode, counts }, null, 2));
  } finally {
    await Promise.all([sourceClient.$disconnect(), targetClient.$disconnect()]);
  }
}

main().catch((error) => {
  console.error(categorizeImportError(error));
  process.exitCode = 1;
});
