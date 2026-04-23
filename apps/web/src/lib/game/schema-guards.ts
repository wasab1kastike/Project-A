import { prisma } from "@/lib/prisma";
import { type Prisma, type PrismaClient } from "@/lib/prisma-client";

type DatabaseClient = PrismaClient | Prisma.TransactionClient;

let commanderRegistrationColumnPromise: Promise<void> | null = null;
let lastReadChatColumnPromise: Promise<void> | null = null;
let locationShuffleSupportPromise: Promise<void> | null = null;

async function addCommanderRegistrationColumn(db: DatabaseClient) {
  await db.$executeRawUnsafe(
    'ALTER TABLE "Fortress" ADD COLUMN IF NOT EXISTS "commanderNameRegisteredAt" TIMESTAMP(3)'
  );
  await db.$executeRawUnsafe(
    'UPDATE "Fortress" SET "commanderNameRegisteredAt" = CURRENT_TIMESTAMP WHERE "isNpc" = true AND "commanderNameRegisteredAt" IS NULL'
  );
}

async function addLastReadChatColumn(db: DatabaseClient) {
  await db.$executeRawUnsafe(
    'ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "lastReadChatAt" TIMESTAMP(3)'
  );
}

async function addLocationShuffleSupport(db: DatabaseClient) {
  await db.$executeRawUnsafe(
    `ALTER TYPE "ScoreEventType" ADD VALUE IF NOT EXISTS 'FORTRESS_LOCATION_SHUFFLE_COST'`
  );
  await db.$executeRawUnsafe(
    'ALTER TABLE "Fortress" ADD COLUMN IF NOT EXISTS "locationShuffleCount" INTEGER NOT NULL DEFAULT 0'
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

export async function ensureLastReadChatColumn(
  db: DatabaseClient = prisma
) {
  if (db !== prisma) {
    await addLastReadChatColumn(db);
    return;
  }

  lastReadChatColumnPromise ??= addLastReadChatColumn(db);
  await lastReadChatColumnPromise;
}

export async function ensureLocationShuffleSupport(
  db: DatabaseClient = prisma
) {
  if (db !== prisma) {
    await addLocationShuffleSupport(db);
    return;
  }

  locationShuffleSupportPromise ??= addLocationShuffleSupport(db);
  await locationShuffleSupportPromise;
}
