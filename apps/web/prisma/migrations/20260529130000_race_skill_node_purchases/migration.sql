DELETE FROM "RaceSkillPurchase";

DROP INDEX IF EXISTS "RaceSkillPurchase_fortressId_path_key";

ALTER TABLE "RaceSkillPurchase"
  DROP COLUMN IF EXISTS "path",
  DROP COLUMN IF EXISTS "tier",
  ADD COLUMN "nodeKey" TEXT NOT NULL;

CREATE UNIQUE INDEX "RaceSkillPurchase_fortressId_nodeKey_key" ON "RaceSkillPurchase"("fortressId", "nodeKey");
