-- Add season-scoped public commander names without exposing auth profile names.
ALTER TABLE "Fortress" ADD COLUMN "commanderName" TEXT;

UPDATE "Fortress"
SET "commanderName" = CASE
    WHEN "isNpc" THEN CONCAT('NPC ', "id")
    ELSE "name"
END;

ALTER TABLE "Fortress" ALTER COLUMN "commanderName" SET NOT NULL;

CREATE UNIQUE INDEX "Fortress_cycleId_commanderName_key" ON "Fortress"("cycleId", "commanderName");
