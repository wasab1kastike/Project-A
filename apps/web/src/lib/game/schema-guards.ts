import { prisma } from "@/lib/prisma";
import { type Prisma, type PrismaClient } from "@/lib/prisma-client";

type DatabaseClient = PrismaClient | Prisma.TransactionClient;

let commanderRegistrationColumnPromise: Promise<void> | null = null;
let lastReadChatColumnPromise: Promise<void> | null = null;
let homeOfABossSchemaPromise: Promise<void> | null = null;
let battlefieldPointRewardColumnPromise: Promise<void> | null = null;
let battalionWarSchemaPromise: Promise<void> | null = null;

const REQUIRED_DWARF_DEEP_MINING_ROLL_COLUMNS = [
  "committedGold",
  "goldDelta",
  "armyDelta",
  "recruitmentQueueDelta",
  "resolvedAt",
  "activeUntil",
] as const;

const REQUIRED_RACE_ABILITY_ACTIVATION_COLUMNS = [
  "targetFortressId",
  "runeFortressId",
  "goldCost",
  "maintenanceGoldPerTick",
] as const;

const REQUIRED_RACE_TABLES = [
  "DwarfDeepMiningRoll",
  "DwarfGrudge",
  "OrkScrapBank",
  "OrkScrapEvent",
  "OrkBossOrder",
  "OrkWaaaghInvestment",
  "RaceAbilityActivation",
  "UnicornShatteredRealityRoll",
  "UnicornTemporaryTeleport",
] as const;

const REQUIRED_ORK_ENUM_TYPES = [
  "OrkScrapEventReason",
  "OrkBossOrderKind",
  "OrkWaaaghInvestmentKind",
] as const;

export type RaceSchemaReadinessResult = {
  ready: boolean;
  missingObjects: string[];
  message: string | null;
};

export class RaceSchemaReadinessError extends Error {
  readonly missingObjects: string[];

  constructor(missingObjects: string[]) {
    const missingCount = missingObjects.length;
    const preview = missingObjects.join(", ");

    super(
      `Race schema preflight failed: missing ${missingCount} required object${missingCount === 1 ? "" : "s"} (${preview}). Run Prisma migrations before cron ticks (for example: npx prisma migrate deploy).`
    );

    this.name = "RaceSchemaReadinessError";
    this.missingObjects = missingObjects;
  }
}

function getMissingColumns({
  table,
  required,
  presentColumns,
}: {
  table: string;
  required: readonly string[];
  presentColumns: Set<string>;
}) {
  return required
    .filter((column) => !presentColumns.has(`${table}.${column}`))
    .map((column) => `column ${table}.${column}`);
}

export async function getRaceSchemaReadiness(
  db: DatabaseClient = prisma
): Promise<RaceSchemaReadinessResult> {
  const [tableRows, columnRows, enumRows] = await Promise.all([
    db.$queryRawUnsafe<Array<{ tableName: string }>>(`
      SELECT "table_name" AS "tableName"
      FROM "information_schema"."tables"
      WHERE "table_schema" = current_schema()
    `),
    db.$queryRawUnsafe<Array<{ tableName: string; columnName: string }>>(`
      SELECT "table_name" AS "tableName", "column_name" AS "columnName"
      FROM "information_schema"."columns"
      WHERE "table_schema" = current_schema()
        AND "table_name" IN ('DwarfDeepMiningRoll', 'RaceAbilityActivation')
    `),
    db.$queryRawUnsafe<Array<{ typeName: string }>>(`
      SELECT t.typname AS "typeName"
      FROM pg_type t
      INNER JOIN pg_namespace n ON n.oid = t.typnamespace
      WHERE n.nspname = current_schema()
        AND t.typtype = 'e'
    `),
  ]);

  const presentTables = new Set(tableRows.map((row) => row.tableName));
  const presentColumns = new Set(
    columnRows.map((row) => `${row.tableName}.${row.columnName}`)
  );
  const presentEnumTypes = new Set(enumRows.map((row) => row.typeName));

  const missingObjects = [
    ...REQUIRED_RACE_TABLES.filter((table) => !presentTables.has(table)).map(
      (table) => `table ${table}`
    ),
    ...getMissingColumns({
      table: "DwarfDeepMiningRoll",
      required: REQUIRED_DWARF_DEEP_MINING_ROLL_COLUMNS,
      presentColumns,
    }),
    ...getMissingColumns({
      table: "RaceAbilityActivation",
      required: REQUIRED_RACE_ABILITY_ACTIVATION_COLUMNS,
      presentColumns,
    }),
    ...REQUIRED_ORK_ENUM_TYPES.filter((enumType) => !presentEnumTypes.has(enumType)).map(
      (enumType) => `enum ${enumType}`
    ),
  ];

  return {
    ready: missingObjects.length === 0,
    missingObjects,
    message:
      missingObjects.length === 0
        ? null
        : new RaceSchemaReadinessError(missingObjects).message,
  };
}

export async function ensureRaceSchemaReadiness(
  db: DatabaseClient = prisma
) {
  const readiness = await getRaceSchemaReadiness(db);

  if (!readiness.ready) {
    throw new RaceSchemaReadinessError(readiness.missingObjects);
  }
}

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

async function addBattlefieldPointRewardColumn(db: DatabaseClient) {
  await db.$executeRawUnsafe(
    'ALTER TABLE "Battlefield" ADD COLUMN IF NOT EXISTS "pointReward" INTEGER NOT NULL DEFAULT 0'
  );
}

async function ensureHomeOfABossSchemaObjects(db: DatabaseClient) {
  await db.$executeRawUnsafe(
    `ALTER TYPE "RaceAbilityKind" ADD VALUE IF NOT EXISTS 'HOME_OF_A_BOSS_BUFF'`
  );
  await db.$executeRawUnsafe(
    'ALTER TABLE "Cycle" ADD COLUMN IF NOT EXISTS "homeOfABossRespawnsAt" TIMESTAMP(3)'
  );
  await db.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "HomeOfABossDamageContribution" (
      "id" TEXT NOT NULL,
      "cycleId" TEXT NOT NULL,
      "bossGeneration" INTEGER NOT NULL,
      "fortressId" TEXT NOT NULL,
      "damage" INTEGER NOT NULL DEFAULT 0,
      "firstDamagedAt" TIMESTAMP(3) NOT NULL,
      "lastDamagedAt" TIMESTAMP(3) NOT NULL,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL,
      CONSTRAINT "HomeOfABossDamageContribution_pkey" PRIMARY KEY ("id")
    )
  `);
  await db.$executeRawUnsafe(`
    CREATE UNIQUE INDEX IF NOT EXISTS "HomeOfABossDamageContribution_cycleId_bossGeneration_fortressId_key"
    ON "HomeOfABossDamageContribution"("cycleId", "bossGeneration", "fortressId")
  `);
  await db.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "HomeOfABossDamageContribution_cycleId_bossGeneration_damage_firstDamagedAt_idx"
    ON "HomeOfABossDamageContribution"("cycleId", "bossGeneration", "damage", "firstDamagedAt")
  `);
  await db.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "HomeOfABossDamageContribution_fortressId_cycleId_idx"
    ON "HomeOfABossDamageContribution"("fortressId", "cycleId")
  `);
  await db.$executeRawUnsafe(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'HomeOfABossDamageContribution_cycleId_fkey'
      ) THEN
        ALTER TABLE "HomeOfABossDamageContribution"
        ADD CONSTRAINT "HomeOfABossDamageContribution_cycleId_fkey"
        FOREIGN KEY ("cycleId") REFERENCES "Cycle"("id") ON DELETE CASCADE ON UPDATE CASCADE;
      END IF;
    END $$;
  `);
  await db.$executeRawUnsafe(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'HomeOfABossDamageContribution_fortressId_fkey'
      ) THEN
        ALTER TABLE "HomeOfABossDamageContribution"
        ADD CONSTRAINT "HomeOfABossDamageContribution_fortressId_fkey"
        FOREIGN KEY ("fortressId") REFERENCES "Fortress"("id") ON DELETE CASCADE ON UPDATE CASCADE;
      END IF;
    END $$;
  `);
}

async function ensureBattalionWarSchemaObjects(db: DatabaseClient) {
  await db.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "Battalion" (
      "id" TEXT NOT NULL,
      "cycleId" TEXT NOT NULL,
      "fortressId" TEXT NOT NULL,
      "name" TEXT NOT NULL,
      "size" INTEGER NOT NULL DEFAULT 0,
      "maxSize" INTEGER NOT NULL DEFAULT 100,
      "tier" INTEGER NOT NULL DEFAULT 0,
      "xp" INTEGER NOT NULL DEFAULT 0,
      "readyAt" TIMESTAMP(3),
      "stance" TEXT NOT NULL DEFAULT 'REST',
      "mode" TEXT NOT NULL DEFAULT 'GUARD',
      "garrisonedAt" TEXT,
      "stanceLockedUntil" TIMESTAMP(3),
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL,
      CONSTRAINT "Battalion_pkey" PRIMARY KEY ("id")
    )
  `);
  await db.$executeRawUnsafe(
    `ALTER TABLE "Battalion" ADD COLUMN IF NOT EXISTS "mode" TEXT NOT NULL DEFAULT 'GUARD'`
  );
  await db.$executeRawUnsafe(
    `ALTER TABLE "AttackUnit" ADD COLUMN IF NOT EXISTS "reinforcementBattalionId" TEXT`
  );
  await db.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "WarFront" (
      "id" TEXT NOT NULL,
      "cycleId" TEXT NOT NULL,
      "attackerFortressId" TEXT NOT NULL,
      "enemyFortressId" TEXT NOT NULL,
      "status" TEXT NOT NULL DEFAULT 'ADVANCING',
      "aggression" TEXT NOT NULL DEFAULT 'BALANCED',
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL,
      CONSTRAINT "WarFront_pkey" PRIMARY KEY ("id")
    )
  `);
  await db.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "BattalionAssignment" (
      "id" TEXT NOT NULL,
      "battalionId" TEXT NOT NULL,
      "frontId" TEXT NOT NULL,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "BattalionAssignment_pkey" PRIMARY KEY ("id")
    )
  `);
  await db.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "WarPolicy" (
      "id" TEXT NOT NULL,
      "cycleId" TEXT NOT NULL,
      "fortressId" TEXT NOT NULL,
      "maxArmySize" INTEGER NOT NULL DEFAULT 500,
      "guardPercent" INTEGER NOT NULL DEFAULT 30,
      "defaultAggression" TEXT NOT NULL DEFAULT 'BALANCED',
      "allianceSupportAttack" BOOLEAN NOT NULL DEFAULT true,
      "allianceSupportDefense" BOOLEAN NOT NULL DEFAULT true,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL,
      CONSTRAINT "WarPolicy_pkey" PRIMARY KEY ("id")
    )
  `);
  await db.$executeRawUnsafe(
    `ALTER TABLE "WarPolicy" ADD COLUMN IF NOT EXISTS "allianceSupportAttack" BOOLEAN NOT NULL DEFAULT true`
  );
  await db.$executeRawUnsafe(
    `ALTER TABLE "WarPolicy" ADD COLUMN IF NOT EXISTS "allianceSupportDefense" BOOLEAN NOT NULL DEFAULT true`
  );
  await db.$executeRawUnsafe(
    `CREATE UNIQUE INDEX IF NOT EXISTS "Battalion_cycleId_fortressId_name_key" ON "Battalion"("cycleId", "fortressId", "name")`
  );
  await db.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "Battalion_cycleId_fortressId_idx" ON "Battalion"("cycleId", "fortressId")`
  );
  await db.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "Battalion_garrisonedAt_idx" ON "Battalion"("garrisonedAt")`
  );
  await db.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "AttackUnit_reinforcementBattalionId_arrivesAt_idx" ON "AttackUnit"("reinforcementBattalionId", "arrivesAt")`
  );
  await db.$executeRawUnsafe(
    `CREATE UNIQUE INDEX IF NOT EXISTS "WarFront_cycleId_attackerFortressId_enemyFortressId_key" ON "WarFront"("cycleId", "attackerFortressId", "enemyFortressId")`
  );
  await db.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "WarFront_cycleId_attackerFortressId_idx" ON "WarFront"("cycleId", "attackerFortressId")`
  );
  await db.$executeRawUnsafe(
    `CREATE UNIQUE INDEX IF NOT EXISTS "BattalionAssignment_battalionId_key" ON "BattalionAssignment"("battalionId")`
  );
  await db.$executeRawUnsafe(
    `CREATE UNIQUE INDEX IF NOT EXISTS "BattalionAssignment_battalionId_frontId_key" ON "BattalionAssignment"("battalionId", "frontId")`
  );
  await db.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "BattalionAssignment_frontId_idx" ON "BattalionAssignment"("frontId")`
  );
  await db.$executeRawUnsafe(
    `CREATE UNIQUE INDEX IF NOT EXISTS "WarPolicy_cycleId_fortressId_key" ON "WarPolicy"("cycleId", "fortressId")`
  );
  await db.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "WarPolicy_cycleId_idx" ON "WarPolicy"("cycleId")`
  );

  const constraints = [
    {
      name: "Battalion_cycleId_fkey",
      sql: `ALTER TABLE "Battalion" ADD CONSTRAINT "Battalion_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "Cycle"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
    },
    {
      name: "Battalion_fortressId_fkey",
      sql: `ALTER TABLE "Battalion" ADD CONSTRAINT "Battalion_fortressId_fkey" FOREIGN KEY ("fortressId") REFERENCES "Fortress"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
    },
    {
      name: "AttackUnit_reinforcementBattalionId_fkey",
      sql: `ALTER TABLE "AttackUnit" ADD CONSTRAINT "AttackUnit_reinforcementBattalionId_fkey" FOREIGN KEY ("reinforcementBattalionId") REFERENCES "Battalion"("id") ON DELETE SET NULL ON UPDATE CASCADE`,
    },
    {
      name: "WarFront_cycleId_fkey",
      sql: `ALTER TABLE "WarFront" ADD CONSTRAINT "WarFront_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "Cycle"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
    },
    {
      name: "WarFront_attackerFortressId_fkey",
      sql: `ALTER TABLE "WarFront" ADD CONSTRAINT "WarFront_attackerFortressId_fkey" FOREIGN KEY ("attackerFortressId") REFERENCES "Fortress"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
    },
    {
      name: "BattalionAssignment_battalionId_fkey",
      sql: `ALTER TABLE "BattalionAssignment" ADD CONSTRAINT "BattalionAssignment_battalionId_fkey" FOREIGN KEY ("battalionId") REFERENCES "Battalion"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
    },
    {
      name: "BattalionAssignment_frontId_fkey",
      sql: `ALTER TABLE "BattalionAssignment" ADD CONSTRAINT "BattalionAssignment_frontId_fkey" FOREIGN KEY ("frontId") REFERENCES "WarFront"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
    },
    {
      name: "WarPolicy_cycleId_fkey",
      sql: `ALTER TABLE "WarPolicy" ADD CONSTRAINT "WarPolicy_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "Cycle"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
    },
    {
      name: "WarPolicy_fortressId_fkey",
      sql: `ALTER TABLE "WarPolicy" ADD CONSTRAINT "WarPolicy_fortressId_fkey" FOREIGN KEY ("fortressId") REFERENCES "Fortress"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
    },
  ];

  for (const constraint of constraints) {
    await db.$executeRawUnsafe(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_constraint
          WHERE conname = '${constraint.name}'
        ) THEN
          ${constraint.sql};
        END IF;
      END $$;
    `);
  }
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

export async function ensureHomeOfABossSchema(db: DatabaseClient = prisma) {
  if (db !== prisma) {
    await ensureHomeOfABossSchemaObjects(db);
    return;
  }

  homeOfABossSchemaPromise ??= ensureHomeOfABossSchemaObjects(db);
  await homeOfABossSchemaPromise;
}

export async function ensureBattlefieldPointRewardColumn(
  db: DatabaseClient = prisma
) {
  if (db !== prisma) {
    await addBattlefieldPointRewardColumn(db);
    return;
  }

  battlefieldPointRewardColumnPromise ??= addBattlefieldPointRewardColumn(db);
  await battlefieldPointRewardColumnPromise;
}

export async function ensureBattalionWarSchema(db: DatabaseClient = prisma) {
  if (db !== prisma) {
    await ensureBattalionWarSchemaObjects(db);
    return;
  }

  battalionWarSchemaPromise ??= ensureBattalionWarSchemaObjects(db);
  await battalionWarSchemaPromise;
}
