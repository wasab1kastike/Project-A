import { prisma } from "@/lib/prisma";
import { type Prisma, type PrismaClient } from "@/lib/prisma-client";

type DatabaseClient = PrismaClient | Prisma.TransactionClient;

let commanderRegistrationColumnPromise: Promise<void> | null = null;

async function addCommanderRegistrationColumn(db: DatabaseClient) {
  await db.$executeRawUnsafe(
    'ALTER TABLE "Fortress" ADD COLUMN IF NOT EXISTS "commanderNameRegisteredAt" TIMESTAMP(3)'
  );
  await db.$executeRawUnsafe(
    'UPDATE "Fortress" SET "commanderNameRegisteredAt" = CURRENT_TIMESTAMP WHERE "isNpc" = true AND "commanderNameRegisteredAt" IS NULL'
  );
}

export async function ensureCommanderRegistrationColumn(
  db: DatabaseClient = prisma
) {
  if (db !== prisma) {
    await addCommanderRegistrationColumn(db);
    return;
  }

  commanderRegistrationColumnPromise ??= addCommanderRegistrationColumn(db);
  await commanderRegistrationColumnPromise;
}
