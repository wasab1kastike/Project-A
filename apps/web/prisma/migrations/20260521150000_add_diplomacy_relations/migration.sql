DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type
    WHERE typname = 'DiplomacyRelationStatus'
  ) THEN
    CREATE TYPE "DiplomacyRelationStatus" AS ENUM (
      'NEUTRAL',
      'ALLIED',
      'ENEMY',
      'WAR_PENDING',
      'WAR',
      'PEACE_PENDING'
    );
  END IF;
END $$;

DROP INDEX IF EXISTS "DiplomacyRelation_cycleId_fromUserId_toUserId_key";
DROP INDEX IF EXISTS "DiplomacyRelation_fromUserId_status_idx";
DROP INDEX IF EXISTS "DiplomacyRelation_toUserId_status_idx";
DROP INDEX IF EXISTS "DiplomacyRelation_cycleId_status_idx";

ALTER TABLE "DiplomacyRelation" DROP CONSTRAINT IF EXISTS "DiplomacyRelation_fromUserId_toUserId_check";
ALTER TABLE "DiplomacyRelation" DROP CONSTRAINT IF EXISTS "DiplomacyRelation_fromUserId_fkey";
ALTER TABLE "DiplomacyRelation" DROP CONSTRAINT IF EXISTS "DiplomacyRelation_toUserId_fkey";

ALTER TABLE "DiplomacyRelation" ADD COLUMN IF NOT EXISTS "fortressAId" TEXT;
ALTER TABLE "DiplomacyRelation" ADD COLUMN IF NOT EXISTS "fortressBId" TEXT;
ALTER TABLE "DiplomacyRelation" ADD COLUMN IF NOT EXISTS "statusV2" "DiplomacyRelationStatus" NOT NULL DEFAULT 'NEUTRAL';
ALTER TABLE "DiplomacyRelation" ADD COLUMN IF NOT EXISTS "warDeclaredById" TEXT;
ALTER TABLE "DiplomacyRelation" ADD COLUMN IF NOT EXISTS "warDeclaredAt" TIMESTAMP(3);
ALTER TABLE "DiplomacyRelation" ADD COLUMN IF NOT EXISTS "warStartsAt" TIMESTAMP(3);
ALTER TABLE "DiplomacyRelation" ADD COLUMN IF NOT EXISTS "peaceProposedById" TEXT;
ALTER TABLE "DiplomacyRelation" ADD COLUMN IF NOT EXISTS "peaceProposedAt" TIMESTAMP(3);
ALTER TABLE "DiplomacyRelation" ADD COLUMN IF NOT EXISTS "collateralGold" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "DiplomacyRelation" ADD COLUMN IF NOT EXISTS "collateralFood" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "DiplomacyRelation" ADD COLUMN IF NOT EXISTS "collateralArmy" INTEGER NOT NULL DEFAULT 0;

UPDATE "DiplomacyRelation" relation
SET
  "fortressAId" = LEAST(from_fortress."id", to_fortress."id"),
  "fortressBId" = GREATEST(from_fortress."id", to_fortress."id"),
  "statusV2" = CASE relation."status"::TEXT
    WHEN 'WAR' THEN 'WAR'::"DiplomacyRelationStatus"
    ELSE 'NEUTRAL'::"DiplomacyRelationStatus"
  END
FROM "Fortress" from_fortress, "Fortress" to_fortress
WHERE relation."fromUserId" IS NOT NULL
  AND relation."toUserId" IS NOT NULL
  AND from_fortress."cycleId" = relation."cycleId"
  AND from_fortress."ownerId" = relation."fromUserId"
  AND to_fortress."cycleId" = relation."cycleId"
  AND to_fortress."ownerId" = relation."toUserId";

DELETE FROM "DiplomacyRelation"
WHERE "fortressAId" IS NULL
  OR "fortressBId" IS NULL
  OR "fortressAId" = "fortressBId";

DELETE FROM "DiplomacyRelation" relation
USING "DiplomacyRelation" duplicate
WHERE relation."cycleId" = duplicate."cycleId"
  AND relation."fortressAId" = duplicate."fortressAId"
  AND relation."fortressBId" = duplicate."fortressBId"
  AND relation."id" < duplicate."id";

ALTER TABLE "DiplomacyRelation" DROP COLUMN IF EXISTS "status";
ALTER TABLE "DiplomacyRelation" RENAME COLUMN "statusV2" TO "status";
ALTER TABLE "DiplomacyRelation" DROP COLUMN IF EXISTS "fromUserId";
ALTER TABLE "DiplomacyRelation" DROP COLUMN IF EXISTS "toUserId";

ALTER TABLE "DiplomacyRelation" ALTER COLUMN "fortressAId" SET NOT NULL;
ALTER TABLE "DiplomacyRelation" ALTER COLUMN "fortressBId" SET NOT NULL;

CREATE UNIQUE INDEX "DiplomacyRelation_cycleId_fortressAId_fortressBId_key" ON "DiplomacyRelation"("cycleId", "fortressAId", "fortressBId");
CREATE INDEX "DiplomacyRelation_cycleId_status_idx" ON "DiplomacyRelation"("cycleId", "status");
CREATE INDEX "DiplomacyRelation_fortressAId_idx" ON "DiplomacyRelation"("fortressAId");
CREATE INDEX "DiplomacyRelation_fortressBId_idx" ON "DiplomacyRelation"("fortressBId");

ALTER TABLE "DiplomacyRelation" ADD CONSTRAINT "DiplomacyRelation_fortressAId_fkey" FOREIGN KEY ("fortressAId") REFERENCES "Fortress"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DiplomacyRelation" ADD CONSTRAINT "DiplomacyRelation_fortressBId_fkey" FOREIGN KEY ("fortressBId") REFERENCES "Fortress"("id") ON DELETE CASCADE ON UPDATE CASCADE;
