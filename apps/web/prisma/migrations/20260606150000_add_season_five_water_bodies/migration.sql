-- CreateTable
CREATE TABLE "SeasonFiveFishingWaterBody" (
    "id" TEXT NOT NULL,
    "cycleId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "profileKey" TEXT NOT NULL,
    "maxStock" INTEGER NOT NULL,
    "currentStock" INTEGER NOT NULL,
    "regenPerHour" INTEGER NOT NULL,
    "lastRegeneratedAt" TIMESTAMP(3) NOT NULL,
    "levelRequired" INTEGER NOT NULL DEFAULT 1,
    "requiredGearKey" TEXT,
    "hidden" BOOLEAN NOT NULL DEFAULT false,
    "catchDifficulty" INTEGER NOT NULL DEFAULT 1,
    "minFishCm" INTEGER NOT NULL,
    "maxFishCm" INTEGER NOT NULL,
    "inventoryPressure" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SeasonFiveFishingWaterBody_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SeasonFiveWaterBodyDiscovery" (
    "id" TEXT NOT NULL,
    "characterId" TEXT NOT NULL,
    "waterBodyId" TEXT NOT NULL,
    "discoveredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SeasonFiveWaterBodyDiscovery_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "SeasonFiveFishingLocation" ADD COLUMN "waterBodyId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "SeasonFiveFishingWaterBody_cycleId_key_key" ON "SeasonFiveFishingWaterBody"("cycleId", "key");

-- CreateIndex
CREATE INDEX "SeasonFiveFishingWaterBody_cycleId_profileKey_idx" ON "SeasonFiveFishingWaterBody"("cycleId", "profileKey");

-- CreateIndex
CREATE INDEX "SeasonFiveFishingWaterBody_cycleId_hidden_idx" ON "SeasonFiveFishingWaterBody"("cycleId", "hidden");

-- CreateIndex
CREATE INDEX "SeasonFiveFishingWaterBody_cycleId_lastRegeneratedAt_idx" ON "SeasonFiveFishingWaterBody"("cycleId", "lastRegeneratedAt");

-- CreateIndex
CREATE UNIQUE INDEX "SeasonFiveWaterBodyDiscovery_characterId_waterBodyId_key" ON "SeasonFiveWaterBodyDiscovery"("characterId", "waterBodyId");

-- CreateIndex
CREATE INDEX "SeasonFiveWaterBodyDiscovery_characterId_expiresAt_idx" ON "SeasonFiveWaterBodyDiscovery"("characterId", "expiresAt");

-- CreateIndex
CREATE INDEX "SeasonFiveWaterBodyDiscovery_waterBodyId_expiresAt_idx" ON "SeasonFiveWaterBodyDiscovery"("waterBodyId", "expiresAt");

-- CreateIndex
CREATE INDEX "SeasonFiveFishingLocation_waterBodyId_idx" ON "SeasonFiveFishingLocation"("waterBodyId");

-- AddForeignKey
ALTER TABLE "SeasonFiveFishingWaterBody" ADD CONSTRAINT "SeasonFiveFishingWaterBody_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "Cycle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SeasonFiveWaterBodyDiscovery" ADD CONSTRAINT "SeasonFiveWaterBodyDiscovery_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "SeasonFiveCharacter"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SeasonFiveWaterBodyDiscovery" ADD CONSTRAINT "SeasonFiveWaterBodyDiscovery_waterBodyId_fkey" FOREIGN KEY ("waterBodyId") REFERENCES "SeasonFiveFishingWaterBody"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SeasonFiveFishingLocation" ADD CONSTRAINT "SeasonFiveFishingLocation_waterBodyId_fkey" FOREIGN KEY ("waterBodyId") REFERENCES "SeasonFiveFishingWaterBody"("id") ON DELETE SET NULL ON UPDATE CASCADE;
