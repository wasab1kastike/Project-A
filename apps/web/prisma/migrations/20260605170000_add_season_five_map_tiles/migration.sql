CREATE TYPE "SeasonFiveMapTerrain" AS ENUM (
    'GRASS',
    'FOREST',
    'WATER',
    'COAST',
    'SWAMP',
    'HILL',
    'MOUNTAIN',
    'ROAD'
);

CREATE TYPE "SeasonFiveMapRole" AS ENUM (
    'NONE',
    'HOME',
    'FISHING_SPOT',
    'SHOP',
    'EVENT',
    'SECRET_LAKE'
);

CREATE TABLE "SeasonFiveMapTile" (
    "id" TEXT NOT NULL,
    "cycleId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "row" INTEGER NOT NULL,
    "col" INTEGER NOT NULL,
    "xPercent" DOUBLE PRECISION NOT NULL,
    "yPercent" DOUBLE PRECISION NOT NULL,
    "terrain" "SeasonFiveMapTerrain" NOT NULL,
    "visualVariant" INTEGER NOT NULL DEFAULT 0,
    "role" "SeasonFiveMapRole" NOT NULL DEFAULT 'NONE',
    "roleLabel" TEXT,
    "hidden" BOOLEAN NOT NULL DEFAULT false,
    "discoveredAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "requiredKey" TEXT,
    "roleSeedKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SeasonFiveMapTile_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SeasonFiveKeyItem" (
    "id" TEXT NOT NULL,
    "characterId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SeasonFiveKeyItem_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "SeasonFiveFishingLocation" ADD COLUMN "tileId" TEXT;

CREATE UNIQUE INDEX "SeasonFiveMapTile_cycleId_key_key" ON "SeasonFiveMapTile"("cycleId", "key");
CREATE UNIQUE INDEX "SeasonFiveMapTile_cycleId_row_col_key" ON "SeasonFiveMapTile"("cycleId", "row", "col");
CREATE INDEX "SeasonFiveMapTile_cycleId_role_idx" ON "SeasonFiveMapTile"("cycleId", "role");
CREATE INDEX "SeasonFiveMapTile_cycleId_hidden_idx" ON "SeasonFiveMapTile"("cycleId", "hidden");
CREATE INDEX "SeasonFiveMapTile_cycleId_expiresAt_idx" ON "SeasonFiveMapTile"("cycleId", "expiresAt");

CREATE UNIQUE INDEX "SeasonFiveKeyItem_characterId_key_key" ON "SeasonFiveKeyItem"("characterId", "key");
CREATE INDEX "SeasonFiveKeyItem_characterId_idx" ON "SeasonFiveKeyItem"("characterId");
CREATE INDEX "SeasonFiveFishingLocation_tileId_idx" ON "SeasonFiveFishingLocation"("tileId");

ALTER TABLE "SeasonFiveMapTile" ADD CONSTRAINT "SeasonFiveMapTile_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "Cycle"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SeasonFiveKeyItem" ADD CONSTRAINT "SeasonFiveKeyItem_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "SeasonFiveCharacter"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SeasonFiveFishingLocation" ADD CONSTRAINT "SeasonFiveFishingLocation_tileId_fkey" FOREIGN KEY ("tileId") REFERENCES "SeasonFiveMapTile"("id") ON DELETE SET NULL ON UPDATE CASCADE;
