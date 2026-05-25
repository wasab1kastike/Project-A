CREATE TYPE "ArmyOrderType" AS ENUM ('GUARD', 'ESCORT', 'RAID', 'CAMPAIGN');
CREATE TYPE "ArmyOrderStatus" AS ENUM ('ACTIVE', 'TRANSFERRED', 'RETURNED', 'CANCELED');
CREATE TYPE "TerritoryCampaignStatus" AS ENUM ('BUILDING', 'SIEGE_WARNING', 'ENGAGED', 'RESOLVED', 'CANCELED');

CREATE TABLE "ArmyOrder" (
  "id" TEXT NOT NULL,
  "cycleId" TEXT NOT NULL,
  "fortressId" TEXT NOT NULL,
  "type" "ArmyOrderType" NOT NULL,
  "status" "ArmyOrderStatus" NOT NULL DEFAULT 'ACTIVE',
  "targetTileId" TEXT,
  "targetFortressId" TEXT,
  "committedArmy" INTEGER NOT NULL,
  "startsAt" TIMESTAMP(3) NOT NULL,
  "transferredAt" TIMESTAMP(3),
  "returnedAt" TIMESTAMP(3),
  "canceledAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ArmyOrder_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TerritoryCampaign" (
  "id" TEXT NOT NULL,
  "cycleId" TEXT NOT NULL,
  "attackerFortressId" TEXT NOT NULL,
  "defenderFortressId" TEXT NOT NULL,
  "armyOrderId" TEXT NOT NULL,
  "targetTileId" TEXT NOT NULL,
  "battlefieldId" TEXT,
  "status" "TerritoryCampaignStatus" NOT NULL DEFAULT 'BUILDING',
  "progress" INTEGER NOT NULL DEFAULT 0,
  "siegeOpenedAt" TIMESTAMP(3),
  "responseEndsAt" TIMESTAMP(3),
  "engagedAt" TIMESTAMP(3),
  "resolvedAt" TIMESTAMP(3),
  "canceledAt" TIMESTAMP(3),
  "cancellationReason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "TerritoryCampaign_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ArmyOrder_cycleId_status_type_idx" ON "ArmyOrder"("cycleId", "status", "type");
CREATE INDEX "ArmyOrder_fortressId_status_idx" ON "ArmyOrder"("fortressId", "status");
CREATE INDEX "ArmyOrder_cycleId_targetTileId_status_idx" ON "ArmyOrder"("cycleId", "targetTileId", "status");
CREATE UNIQUE INDEX "TerritoryCampaign_armyOrderId_key" ON "TerritoryCampaign"("armyOrderId");
CREATE UNIQUE INDEX "TerritoryCampaign_battlefieldId_key" ON "TerritoryCampaign"("battlefieldId");
CREATE INDEX "TerritoryCampaign_cycleId_status_idx" ON "TerritoryCampaign"("cycleId", "status");
CREATE INDEX "TerritoryCampaign_cycleId_targetTileId_status_idx" ON "TerritoryCampaign"("cycleId", "targetTileId", "status");
CREATE INDEX "TerritoryCampaign_attackerFortressId_status_idx" ON "TerritoryCampaign"("attackerFortressId", "status");
CREATE INDEX "TerritoryCampaign_defenderFortressId_status_idx" ON "TerritoryCampaign"("defenderFortressId", "status");

ALTER TABLE "ArmyOrder" ADD CONSTRAINT "ArmyOrder_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "Cycle"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ArmyOrder" ADD CONSTRAINT "ArmyOrder_fortressId_fkey" FOREIGN KEY ("fortressId") REFERENCES "Fortress"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TerritoryCampaign" ADD CONSTRAINT "TerritoryCampaign_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "Cycle"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TerritoryCampaign" ADD CONSTRAINT "TerritoryCampaign_attackerFortressId_fkey" FOREIGN KEY ("attackerFortressId") REFERENCES "Fortress"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TerritoryCampaign" ADD CONSTRAINT "TerritoryCampaign_defenderFortressId_fkey" FOREIGN KEY ("defenderFortressId") REFERENCES "Fortress"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TerritoryCampaign" ADD CONSTRAINT "TerritoryCampaign_armyOrderId_fkey" FOREIGN KEY ("armyOrderId") REFERENCES "ArmyOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TerritoryCampaign" ADD CONSTRAINT "TerritoryCampaign_battlefieldId_fkey" FOREIGN KEY ("battlefieldId") REFERENCES "Battlefield"("id") ON DELETE SET NULL ON UPDATE CASCADE;
