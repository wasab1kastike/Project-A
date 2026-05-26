ALTER TYPE "ScoreEventType" ADD VALUE 'CONVOY_INTERCEPTION';
ALTER TYPE "ConvoyLegStatus" ADD VALUE 'INTERCEPTED';

ALTER TABLE "Fortress"
ADD COLUMN "interceptedCargoValue" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "ArmyOrder"
ADD COLUMN "convoyLegId" TEXT;

ALTER TABLE "ConvoyLeg"
ADD COLUMN "interceptedByOrderId" TEXT,
ADD COLUMN "encounterResolvedAt" TIMESTAMP(3),
ADD COLUMN "encounterSucceeded" BOOLEAN,
ADD COLUMN "interceptedAt" TIMESTAMP(3),
ADD COLUMN "stolenGold" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "stolenFood" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "stolenArmy" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "stolenCargoValue" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "raidDetected" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "CovertIncident" (
  "id" TEXT NOT NULL,
  "cycleId" TEXT NOT NULL,
  "convoyLegId" TEXT NOT NULL,
  "raidOrderId" TEXT NOT NULL,
  "raiderFortressId" TEXT NOT NULL,
  "detectingFortressId" TEXT NOT NULL,
  "detectedAt" TIMESTAMP(3) NOT NULL,
  "casusBelliExpiresAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CovertIncident_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ArmyOrder_convoyLegId_key" ON "ArmyOrder"("convoyLegId");
CREATE INDEX "ArmyOrder_cycleId_convoyLegId_status_idx" ON "ArmyOrder"("cycleId", "convoyLegId", "status");
CREATE INDEX "ConvoyLeg_cycleId_status_encounterResolvedAt_arrivesAt_idx" ON "ConvoyLeg"("cycleId", "status", "encounterResolvedAt", "arrivesAt");
CREATE INDEX "ConvoyLeg_interceptedByOrderId_idx" ON "ConvoyLeg"("interceptedByOrderId");
CREATE UNIQUE INDEX "CovertIncident_convoyLegId_detectingFortressId_key" ON "CovertIncident"("convoyLegId", "detectingFortressId");
CREATE INDEX "CovertIncident_cycleId_detectedAt_idx" ON "CovertIncident"("cycleId", "detectedAt");
CREATE INDEX "CovertIncident_detectingFortressId_detectedAt_idx" ON "CovertIncident"("detectingFortressId", "detectedAt");
CREATE INDEX "CovertIncident_raiderFortressId_detectedAt_idx" ON "CovertIncident"("raiderFortressId", "detectedAt");

ALTER TABLE "ArmyOrder"
ADD CONSTRAINT "ArmyOrder_convoyLegId_fkey"
FOREIGN KEY ("convoyLegId") REFERENCES "ConvoyLeg"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ConvoyLeg"
ADD CONSTRAINT "ConvoyLeg_interceptedByOrderId_fkey"
FOREIGN KEY ("interceptedByOrderId") REFERENCES "ArmyOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "CovertIncident"
ADD CONSTRAINT "CovertIncident_cycleId_fkey"
FOREIGN KEY ("cycleId") REFERENCES "Cycle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CovertIncident"
ADD CONSTRAINT "CovertIncident_convoyLegId_fkey"
FOREIGN KEY ("convoyLegId") REFERENCES "ConvoyLeg"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CovertIncident"
ADD CONSTRAINT "CovertIncident_raidOrderId_fkey"
FOREIGN KEY ("raidOrderId") REFERENCES "ArmyOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CovertIncident"
ADD CONSTRAINT "CovertIncident_raiderFortressId_fkey"
FOREIGN KEY ("raiderFortressId") REFERENCES "Fortress"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CovertIncident"
ADD CONSTRAINT "CovertIncident_detectingFortressId_fkey"
FOREIGN KEY ("detectingFortressId") REFERENCES "Fortress"("id") ON DELETE CASCADE ON UPDATE CASCADE;
