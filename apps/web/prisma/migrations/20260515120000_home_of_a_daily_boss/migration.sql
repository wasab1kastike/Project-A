-- Home of A daily boss state and per-life damage attribution.
ALTER TYPE "RaceAbilityKind" ADD VALUE IF NOT EXISTS 'HOME_OF_A_BOSS_BUFF';

ALTER TABLE "Cycle"
ADD COLUMN "homeOfABossRespawnsAt" TIMESTAMP(3);

CREATE TABLE "HomeOfABossDamageContribution" (
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
);

CREATE UNIQUE INDEX "HomeOfABossDamageContribution_cycleId_bossGeneration_fortressId_key"
ON "HomeOfABossDamageContribution"("cycleId", "bossGeneration", "fortressId");

CREATE INDEX "HomeOfABossDamageContribution_cycleId_bossGeneration_damage_firstDamagedAt_idx"
ON "HomeOfABossDamageContribution"("cycleId", "bossGeneration", "damage", "firstDamagedAt");

CREATE INDEX "HomeOfABossDamageContribution_fortressId_cycleId_idx"
ON "HomeOfABossDamageContribution"("fortressId", "cycleId");

ALTER TABLE "HomeOfABossDamageContribution"
ADD CONSTRAINT "HomeOfABossDamageContribution_cycleId_fkey"
FOREIGN KEY ("cycleId") REFERENCES "Cycle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "HomeOfABossDamageContribution"
ADD CONSTRAINT "HomeOfABossDamageContribution_fortressId_fkey"
FOREIGN KEY ("fortressId") REFERENCES "Fortress"("id") ON DELETE CASCADE ON UPDATE CASCADE;
