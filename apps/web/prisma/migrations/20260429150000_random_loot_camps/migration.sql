-- AlterEnum
ALTER TYPE "FortressKind" ADD VALUE IF NOT EXISTS 'LOOT_CAMP';

-- CreateEnum
CREATE TYPE "LootCampVariant" AS ENUM ('CLASSIC', 'RICH', 'CHAOS');

-- AlterEnum
ALTER TYPE "ScoreEventType" ADD VALUE IF NOT EXISTS 'LOOT_CAMP_REWARD';

-- AlterTable
ALTER TABLE "Fortress"
ADD COLUMN "lootCampVariant" "LootCampVariant",
ADD COLUMN "expiresAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "AttackUnit"
ADD COLUMN "armyLooted" INTEGER;

-- CreateIndex
CREATE INDEX "Fortress_cycleId_fortressKind_expiresAt_idx" ON "Fortress"("cycleId", "fortressKind", "expiresAt");
