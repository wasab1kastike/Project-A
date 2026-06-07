-- Rework Season 5 preview gear into visible avatar equipment, bait stacks, and fish coins.
-- Season 5 is still preview-only here; reset preview characters so old gear slot enum values do not survive.
DELETE FROM "SeasonFiveCharacter";

ALTER TYPE "SeasonFiveGearSlot" RENAME TO "SeasonFiveGearSlot_old";
CREATE TYPE "SeasonFiveGearSlot" AS ENUM (
    'BODY',
    'OUTFIT',
    'HAT',
    'ROD'
);
ALTER TABLE "SeasonFiveGear"
    ALTER COLUMN "slot" TYPE "SeasonFiveGearSlot"
    USING "slot"::text::"SeasonFiveGearSlot";
DROP TYPE "SeasonFiveGearSlot_old";

CREATE TYPE "SeasonFiveCatchKind" AS ENUM (
    'FISH',
    'ITEM'
);

ALTER TABLE "SeasonFiveCharacter"
    ADD COLUMN "fishCoins" INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN "activeBaitKey" TEXT,
    ADD COLUMN "activeBaitExpiresAt" TIMESTAMP(3);

ALTER TABLE "SeasonFiveFishCatch"
    ADD COLUMN "kind" "SeasonFiveCatchKind" NOT NULL DEFAULT 'FISH',
    ADD COLUMN "itemKey" TEXT,
    ADD COLUMN "itemName" TEXT;

CREATE TABLE "SeasonFiveBaitStack" (
    "id" TEXT NOT NULL,
    "characterId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SeasonFiveBaitStack_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SeasonFiveBaitStack_characterId_key_key" ON "SeasonFiveBaitStack"("characterId", "key");
CREATE INDEX "SeasonFiveBaitStack_characterId_idx" ON "SeasonFiveBaitStack"("characterId");
CREATE INDEX "SeasonFiveCharacter_cycleId_fishCoins_idx" ON "SeasonFiveCharacter"("cycleId", "fishCoins");

ALTER TABLE "SeasonFiveBaitStack"
    ADD CONSTRAINT "SeasonFiveBaitStack_characterId_fkey"
    FOREIGN KEY ("characterId") REFERENCES "SeasonFiveCharacter"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
