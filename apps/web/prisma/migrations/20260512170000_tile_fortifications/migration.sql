-- Allow player-created tile fortifications to travel as attack-unit markers
-- and persist as standalone, non-decaying garrisons.
ALTER TABLE "AttackUnit"
ADD COLUMN "fortifyTargetTileId" TEXT;

ALTER TABLE "BattlefieldParticipant"
ADD COLUMN "maintenanceDrains" BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE "FortressGarrison"
ADD COLUMN "maintenanceDrains" BOOLEAN NOT NULL DEFAULT true,
ALTER COLUMN "battlefieldId" DROP NOT NULL;

CREATE INDEX "AttackUnit_fortifyTargetTileId_arrivesAt_idx"
ON "AttackUnit"("fortifyTargetTileId", "arrivesAt");
