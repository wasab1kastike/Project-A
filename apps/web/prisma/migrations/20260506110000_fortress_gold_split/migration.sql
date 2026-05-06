ALTER TABLE "Fortress"
ADD COLUMN "gold" INTEGER NOT NULL DEFAULT 0;

WITH current_cycle AS (
  SELECT "id"
  FROM "Cycle"
  WHERE "resolvedAt" IS NULL
  ORDER BY "createdAt" DESC
  LIMIT 1
)
UPDATE "Fortress"
SET
  "gold" = "points",
  "points" = 0,
  "updatedAt" = NOW()
WHERE "cycleId" IN (SELECT "id" FROM current_cycle)
  AND "isNpc" = false;
