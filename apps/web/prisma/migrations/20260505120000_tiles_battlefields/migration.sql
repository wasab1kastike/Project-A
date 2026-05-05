-- AlterEnum
ALTER TYPE "ScoreEventType" ADD VALUE 'TILE_CLAIM';
ALTER TYPE "ScoreEventType" ADD VALUE 'TILE_BATTLE_REWARD';
ALTER TYPE "ScoreEventType" ADD VALUE 'BATTLEFIELD_REWARD';

-- CreateEnum
CREATE TYPE "BattlefieldStatus" AS ENUM ('ACTIVE', 'RESOLVED');

-- CreateEnum
CREATE TYPE "BattlefieldSide" AS ENUM ('ATTACKER', 'DEFENDER');

-- CreateTable
CREATE TABLE "MapHexOwnership" (
  "id" TEXT NOT NULL,
  "cycleId" TEXT NOT NULL,
  "tileId" TEXT NOT NULL,
  "ownerFortressId" TEXT NOT NULL,
  "claimedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "MapHexOwnership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Battlefield" (
  "id" TEXT NOT NULL,
  "cycleId" TEXT NOT NULL,
  "targetFortressId" TEXT,
  "targetTileId" TEXT,
  "attackerBannerFortressId" TEXT NOT NULL,
  "defenderBannerFortressId" TEXT,
  "status" "BattlefieldStatus" NOT NULL DEFAULT 'ACTIVE',
  "progress" INTEGER NOT NULL DEFAULT 0,
  "attackerArmyRemaining" INTEGER NOT NULL DEFAULT 0,
  "defenderArmyRemaining" INTEGER NOT NULL DEFAULT 0,
  "pointsReward" INTEGER NOT NULL DEFAULT 0,
  "foodReward" INTEGER NOT NULL DEFAULT 0,
  "resolvedWinnerSide" "BattlefieldSide",
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "resolvedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "Battlefield_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BattlefieldParticipant" (
  "id" TEXT NOT NULL,
  "battlefieldId" TEXT NOT NULL,
  "fortressId" TEXT NOT NULL,
  "side" "BattlefieldSide" NOT NULL,
  "armyCommitted" INTEGER NOT NULL,
  "armyRemaining" INTEGER NOT NULL,
  "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "BattlefieldParticipant_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MapHexOwnership_cycleId_tileId_key" ON "MapHexOwnership"("cycleId", "tileId");

-- CreateIndex
CREATE INDEX "MapHexOwnership_ownerFortressId_idx" ON "MapHexOwnership"("ownerFortressId");

-- CreateIndex
CREATE INDEX "MapHexOwnership_cycleId_ownerFortressId_idx" ON "MapHexOwnership"("cycleId", "ownerFortressId");

-- CreateIndex
CREATE INDEX "Battlefield_cycleId_status_idx" ON "Battlefield"("cycleId", "status");

-- CreateIndex
CREATE INDEX "Battlefield_targetFortressId_status_idx" ON "Battlefield"("targetFortressId", "status");

-- CreateIndex
CREATE INDEX "Battlefield_targetTileId_status_idx" ON "Battlefield"("targetTileId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "BattlefieldParticipant_battlefieldId_fortressId_key" ON "BattlefieldParticipant"("battlefieldId", "fortressId");

-- CreateIndex
CREATE INDEX "BattlefieldParticipant_fortressId_idx" ON "BattlefieldParticipant"("fortressId");

-- CreateIndex
CREATE INDEX "BattlefieldParticipant_battlefieldId_side_idx" ON "BattlefieldParticipant"("battlefieldId", "side");

-- AddForeignKey
ALTER TABLE "MapHexOwnership" ADD CONSTRAINT "MapHexOwnership_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "Cycle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MapHexOwnership" ADD CONSTRAINT "MapHexOwnership_ownerFortressId_fkey" FOREIGN KEY ("ownerFortressId") REFERENCES "Fortress"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Battlefield" ADD CONSTRAINT "Battlefield_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "Cycle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Battlefield" ADD CONSTRAINT "Battlefield_targetFortressId_fkey" FOREIGN KEY ("targetFortressId") REFERENCES "Fortress"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Battlefield" ADD CONSTRAINT "Battlefield_attackerBannerFortressId_fkey" FOREIGN KEY ("attackerBannerFortressId") REFERENCES "Fortress"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Battlefield" ADD CONSTRAINT "Battlefield_defenderBannerFortressId_fkey" FOREIGN KEY ("defenderBannerFortressId") REFERENCES "Fortress"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BattlefieldParticipant" ADD CONSTRAINT "BattlefieldParticipant_battlefieldId_fkey" FOREIGN KEY ("battlefieldId") REFERENCES "Battlefield"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BattlefieldParticipant" ADD CONSTRAINT "BattlefieldParticipant_fortressId_fkey" FOREIGN KEY ("fortressId") REFERENCES "Fortress"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "AttackUnit" ADD COLUMN "reinforcementBattlefieldId" TEXT;
ALTER TABLE "AttackUnit" ADD COLUMN "reinforcementSide" "BattlefieldSide";

-- CreateIndex
CREATE INDEX "AttackUnit_reinforcementBattlefieldId_arrivesAt_idx" ON "AttackUnit"("reinforcementBattlefieldId", "arrivesAt");

-- AddForeignKey
ALTER TABLE "AttackUnit" ADD CONSTRAINT "AttackUnit_reinforcementBattlefieldId_fkey" FOREIGN KEY ("reinforcementBattlefieldId") REFERENCES "Battlefield"("id") ON DELETE SET NULL ON UPDATE CASCADE;
