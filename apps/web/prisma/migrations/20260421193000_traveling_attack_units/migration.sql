-- AlterTable
ALTER TABLE "Fortress" ADD COLUMN "unitSpriteVariant" TEXT NOT NULL DEFAULT 'unit-1';

WITH ranked_fortresses AS (
  SELECT
    "id",
    ('unit-' || (((ROW_NUMBER() OVER (ORDER BY "createdAt", "id") - 1) % 6) + 1)) AS "variant"
  FROM "Fortress"
)
UPDATE "Fortress"
SET "unitSpriteVariant" = ranked_fortresses."variant"
FROM ranked_fortresses
WHERE "Fortress"."id" = ranked_fortresses."id";

-- CreateTable
CREATE TABLE "AttackUnit" (
    "id" TEXT NOT NULL,
    "cycleId" TEXT NOT NULL,
    "attackerFortressId" TEXT NOT NULL,
    "targetFortressId" TEXT NOT NULL,
    "launchedAt" TIMESTAMP(3) NOT NULL,
    "arrivesAt" TIMESTAMP(3) NOT NULL,
    "resolvedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AttackUnit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AttackUnit_cycleId_arrivesAt_idx" ON "AttackUnit"("cycleId", "arrivesAt");

-- CreateIndex
CREATE INDEX "AttackUnit_attackerFortressId_resolvedAt_cancelledAt_idx" ON "AttackUnit"("attackerFortressId", "resolvedAt", "cancelledAt");

-- CreateIndex
CREATE INDEX "AttackUnit_targetFortressId_idx" ON "AttackUnit"("targetFortressId");

-- CreateIndex
CREATE UNIQUE INDEX "AttackUnit_active_attacker_key" ON "AttackUnit"("attackerFortressId")
WHERE "resolvedAt" IS NULL AND "cancelledAt" IS NULL;

-- AddForeignKey
ALTER TABLE "AttackUnit" ADD CONSTRAINT "AttackUnit_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "Cycle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttackUnit" ADD CONSTRAINT "AttackUnit_attackerFortressId_fkey" FOREIGN KEY ("attackerFortressId") REFERENCES "Fortress"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttackUnit" ADD CONSTRAINT "AttackUnit_targetFortressId_fkey" FOREIGN KEY ("targetFortressId") REFERENCES "Fortress"("id") ON DELETE CASCADE ON UPDATE CASCADE;
