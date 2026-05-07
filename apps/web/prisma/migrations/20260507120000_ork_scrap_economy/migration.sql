CREATE TYPE "OrkScrapEventReason" AS ENUM ('DIRECT_RAID', 'TILE_BATTLE', 'HOME_OF_A_BATTLE', 'LOOT_CAMP', 'BOSS_ORDER', 'WAAAGH_INVESTMENT');
CREATE TYPE "OrkBossOrderKind" AS ENUM ('MORE_DAKKA', 'LOOT_WAGONS', 'PATCH_DA_FORT');
CREATE TYPE "OrkWaaaghInvestmentKind" AS ENUM ('KEEP_IT_LOUD', 'BIGGER_SHOUTIN', 'DA_GREEN_TIDE');

CREATE TABLE "OrkScrapBank" (
    "id" TEXT NOT NULL,
    "cycleId" TEXT NOT NULL,
    "fortressId" TEXT NOT NULL,
    "scrap" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrkScrapBank_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "OrkScrapEvent" (
    "id" TEXT NOT NULL,
    "cycleId" TEXT NOT NULL,
    "fortressId" TEXT NOT NULL,
    "reason" "OrkScrapEventReason" NOT NULL,
    "delta" INTEGER NOT NULL,
    "balanceAfter" INTEGER NOT NULL,
    "targetFortressId" TEXT,
    "tileId" TEXT,
    "battlefieldId" TEXT,
    "attackUnitId" TEXT,
    "bossOrderId" TEXT,
    "waaaghInvestmentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrkScrapEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "OrkBossOrder" (
    "id" TEXT NOT NULL,
    "cycleId" TEXT NOT NULL,
    "fortressId" TEXT NOT NULL,
    "kind" "OrkBossOrderKind" NOT NULL,
    "scrapCost" INTEGER NOT NULL,
    "goldCost" INTEGER NOT NULL,
    "activeFrom" TIMESTAMP(3) NOT NULL,
    "activeUntil" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrkBossOrder_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "OrkWaaaghInvestment" (
    "id" TEXT NOT NULL,
    "cycleId" TEXT NOT NULL,
    "fortressId" TEXT NOT NULL,
    "waaaghActivationId" TEXT NOT NULL,
    "kind" "OrkWaaaghInvestmentKind" NOT NULL,
    "scrapCost" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrkWaaaghInvestment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "OrkScrapBank_fortressId_key" ON "OrkScrapBank"("fortressId");
CREATE UNIQUE INDEX "OrkScrapBank_cycleId_fortressId_key" ON "OrkScrapBank"("cycleId", "fortressId");
CREATE INDEX "OrkScrapBank_cycleId_idx" ON "OrkScrapBank"("cycleId");
CREATE INDEX "OrkScrapEvent_cycleId_fortressId_createdAt_idx" ON "OrkScrapEvent"("cycleId", "fortressId", "createdAt");
CREATE INDEX "OrkScrapEvent_targetFortressId_idx" ON "OrkScrapEvent"("targetFortressId");
CREATE INDEX "OrkScrapEvent_battlefieldId_idx" ON "OrkScrapEvent"("battlefieldId");
CREATE INDEX "OrkScrapEvent_attackUnitId_idx" ON "OrkScrapEvent"("attackUnitId");
CREATE INDEX "OrkBossOrder_cycleId_fortressId_activeUntil_idx" ON "OrkBossOrder"("cycleId", "fortressId", "activeUntil");
CREATE INDEX "OrkBossOrder_fortressId_kind_usedAt_idx" ON "OrkBossOrder"("fortressId", "kind", "usedAt");
CREATE UNIQUE INDEX "OrkWaaaghInvestment_waaaghActivationId_kind_key" ON "OrkWaaaghInvestment"("waaaghActivationId", "kind");
CREATE INDEX "OrkWaaaghInvestment_cycleId_fortressId_createdAt_idx" ON "OrkWaaaghInvestment"("cycleId", "fortressId", "createdAt");

ALTER TABLE "OrkScrapBank" ADD CONSTRAINT "OrkScrapBank_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "Cycle"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OrkScrapBank" ADD CONSTRAINT "OrkScrapBank_fortressId_fkey" FOREIGN KEY ("fortressId") REFERENCES "Fortress"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OrkScrapEvent" ADD CONSTRAINT "OrkScrapEvent_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "Cycle"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OrkScrapEvent" ADD CONSTRAINT "OrkScrapEvent_fortressId_fkey" FOREIGN KEY ("fortressId") REFERENCES "Fortress"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OrkScrapEvent" ADD CONSTRAINT "OrkScrapEvent_targetFortressId_fkey" FOREIGN KEY ("targetFortressId") REFERENCES "Fortress"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "OrkScrapEvent" ADD CONSTRAINT "OrkScrapEvent_bossOrderId_fkey" FOREIGN KEY ("bossOrderId") REFERENCES "OrkBossOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "OrkScrapEvent" ADD CONSTRAINT "OrkScrapEvent_waaaghInvestmentId_fkey" FOREIGN KEY ("waaaghInvestmentId") REFERENCES "OrkWaaaghInvestment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "OrkBossOrder" ADD CONSTRAINT "OrkBossOrder_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "Cycle"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OrkBossOrder" ADD CONSTRAINT "OrkBossOrder_fortressId_fkey" FOREIGN KEY ("fortressId") REFERENCES "Fortress"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OrkWaaaghInvestment" ADD CONSTRAINT "OrkWaaaghInvestment_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "Cycle"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OrkWaaaghInvestment" ADD CONSTRAINT "OrkWaaaghInvestment_fortressId_fkey" FOREIGN KEY ("fortressId") REFERENCES "Fortress"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OrkWaaaghInvestment" ADD CONSTRAINT "OrkWaaaghInvestment_waaaghActivationId_fkey" FOREIGN KEY ("waaaghActivationId") REFERENCES "RaceAbilityActivation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
