-- Add Season 5 preview ruleset and idle RPG fishing tables.
ALTER TYPE "CycleRuleset" ADD VALUE 'SEASON_5';

CREATE TYPE "SeasonFiveCharacterClass" AS ENUM (
    'DRUNKEN_MONK',
    'RETIRED_WARRIOR',
    'DEMENTED_WIZARD',
    'BURNT_OUT_ROGUE'
);

CREATE TYPE "SeasonFiveLocationKind" AS ENUM (
    'HOME',
    'LAKE',
    'SEA'
);

CREATE TYPE "SeasonFiveActionKind" AS ENUM (
    'AT_HOME',
    'TRAVELING',
    'FISHING'
);

CREATE TYPE "SeasonFiveGearSlot" AS ENUM (
    'ROD',
    'BAIT',
    'PACK',
    'TRINKET'
);

CREATE TYPE "SeasonFiveGearRarity" AS ENUM (
    'COMMON',
    'UNCOMMON',
    'RARE',
    'EPIC'
);

CREATE TYPE "SeasonFiveFishRarity" AS ENUM (
    'COMMON',
    'UNCOMMON',
    'RARE',
    'LEGENDARY'
);

CREATE TABLE "SeasonFiveCharacter" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "cycleId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "class" "SeasonFiveCharacterClass" NOT NULL,
    "level" INTEGER NOT NULL DEFAULT 1,
    "experience" INTEGER NOT NULL DEFAULT 0,
    "skillPoints" INTEGER NOT NULL DEFAULT 0,
    "totalFishCaught" INTEGER NOT NULL DEFAULT 0,
    "biggestFishCm" INTEGER NOT NULL DEFAULT 0,
    "inventoryCapacity" INTEGER NOT NULL DEFAULT 12,
    "actionKind" "SeasonFiveActionKind" NOT NULL DEFAULT 'AT_HOME',
    "currentLocationId" TEXT,
    "destinationLocationId" TEXT,
    "actionStartedAt" TIMESTAMP(3),
    "actionCompletesAt" TIMESTAMP(3),
    "lastResolvedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SeasonFiveCharacter_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SeasonFiveFishingLocation" (
    "id" TEXT NOT NULL,
    "cycleId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "SeasonFiveLocationKind" NOT NULL,
    "xPercent" DOUBLE PRECISION NOT NULL,
    "yPercent" DOUBLE PRECISION NOT NULL,
    "travelMinutes" INTEGER NOT NULL,
    "catchDifficulty" INTEGER NOT NULL DEFAULT 1,
    "minFishCm" INTEGER NOT NULL,
    "maxFishCm" INTEGER NOT NULL,
    "inventoryPressure" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SeasonFiveFishingLocation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SeasonFiveGear" (
    "id" TEXT NOT NULL,
    "characterId" TEXT NOT NULL,
    "slot" "SeasonFiveGearSlot" NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "rarity" "SeasonFiveGearRarity" NOT NULL DEFAULT 'COMMON',
    "power" INTEGER NOT NULL DEFAULT 0,
    "equipped" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SeasonFiveGear_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SeasonFiveFishCatch" (
    "id" TEXT NOT NULL,
    "cycleId" TEXT NOT NULL,
    "characterId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "speciesKey" TEXT NOT NULL,
    "speciesName" TEXT NOT NULL,
    "rarity" "SeasonFiveFishRarity" NOT NULL,
    "sizeCm" INTEGER NOT NULL,
    "inventorySlots" INTEGER NOT NULL DEFAULT 1,
    "caughtAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "unloadedAt" TIMESTAMP(3),
    CONSTRAINT "SeasonFiveFishCatch_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SeasonFiveInventoryItem" (
    "id" TEXT NOT NULL,
    "characterId" TEXT NOT NULL,
    "fishCatchId" TEXT NOT NULL,
    "slots" INTEGER NOT NULL DEFAULT 1,
    "unloadedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SeasonFiveInventoryItem_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SeasonFiveSkillPurchase" (
    "id" TEXT NOT NULL,
    "characterId" TEXT NOT NULL,
    "nodeKey" TEXT NOT NULL,
    "purchasedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SeasonFiveSkillPurchase_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SeasonFiveCharacter_cycleId_userId_key" ON "SeasonFiveCharacter"("cycleId", "userId");
CREATE INDEX "SeasonFiveCharacter_userId_idx" ON "SeasonFiveCharacter"("userId");
CREATE INDEX "SeasonFiveCharacter_cycleId_totalFishCaught_idx" ON "SeasonFiveCharacter"("cycleId", "totalFishCaught");
CREATE INDEX "SeasonFiveCharacter_cycleId_biggestFishCm_idx" ON "SeasonFiveCharacter"("cycleId", "biggestFishCm");
CREATE INDEX "SeasonFiveCharacter_actionKind_actionCompletesAt_idx" ON "SeasonFiveCharacter"("actionKind", "actionCompletesAt");

CREATE UNIQUE INDEX "SeasonFiveFishingLocation_cycleId_key_key" ON "SeasonFiveFishingLocation"("cycleId", "key");
CREATE INDEX "SeasonFiveFishingLocation_cycleId_kind_idx" ON "SeasonFiveFishingLocation"("cycleId", "kind");

CREATE UNIQUE INDEX "SeasonFiveGear_characterId_key_key" ON "SeasonFiveGear"("characterId", "key");
CREATE INDEX "SeasonFiveGear_characterId_slot_equipped_idx" ON "SeasonFiveGear"("characterId", "slot", "equipped");

CREATE INDEX "SeasonFiveFishCatch_cycleId_caughtAt_idx" ON "SeasonFiveFishCatch"("cycleId", "caughtAt");
CREATE INDEX "SeasonFiveFishCatch_cycleId_sizeCm_idx" ON "SeasonFiveFishCatch"("cycleId", "sizeCm");
CREATE INDEX "SeasonFiveFishCatch_characterId_unloadedAt_idx" ON "SeasonFiveFishCatch"("characterId", "unloadedAt");

CREATE UNIQUE INDEX "SeasonFiveInventoryItem_fishCatchId_key" ON "SeasonFiveInventoryItem"("fishCatchId");
CREATE INDEX "SeasonFiveInventoryItem_characterId_unloadedAt_idx" ON "SeasonFiveInventoryItem"("characterId", "unloadedAt");

CREATE UNIQUE INDEX "SeasonFiveSkillPurchase_characterId_nodeKey_key" ON "SeasonFiveSkillPurchase"("characterId", "nodeKey");
CREATE INDEX "SeasonFiveSkillPurchase_characterId_idx" ON "SeasonFiveSkillPurchase"("characterId");

ALTER TABLE "SeasonFiveCharacter" ADD CONSTRAINT "SeasonFiveCharacter_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SeasonFiveCharacter" ADD CONSTRAINT "SeasonFiveCharacter_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "Cycle"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SeasonFiveCharacter" ADD CONSTRAINT "SeasonFiveCharacter_currentLocationId_fkey" FOREIGN KEY ("currentLocationId") REFERENCES "SeasonFiveFishingLocation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SeasonFiveCharacter" ADD CONSTRAINT "SeasonFiveCharacter_destinationLocationId_fkey" FOREIGN KEY ("destinationLocationId") REFERENCES "SeasonFiveFishingLocation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SeasonFiveFishingLocation" ADD CONSTRAINT "SeasonFiveFishingLocation_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "Cycle"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SeasonFiveGear" ADD CONSTRAINT "SeasonFiveGear_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "SeasonFiveCharacter"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SeasonFiveFishCatch" ADD CONSTRAINT "SeasonFiveFishCatch_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "Cycle"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SeasonFiveFishCatch" ADD CONSTRAINT "SeasonFiveFishCatch_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "SeasonFiveCharacter"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SeasonFiveFishCatch" ADD CONSTRAINT "SeasonFiveFishCatch_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "SeasonFiveFishingLocation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SeasonFiveInventoryItem" ADD CONSTRAINT "SeasonFiveInventoryItem_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "SeasonFiveCharacter"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SeasonFiveInventoryItem" ADD CONSTRAINT "SeasonFiveInventoryItem_fishCatchId_fkey" FOREIGN KEY ("fishCatchId") REFERENCES "SeasonFiveFishCatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SeasonFiveSkillPurchase" ADD CONSTRAINT "SeasonFiveSkillPurchase_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "SeasonFiveCharacter"("id") ON DELETE CASCADE ON UPDATE CASCADE;
