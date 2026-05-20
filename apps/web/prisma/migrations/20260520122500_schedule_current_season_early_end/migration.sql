-- One-time production data migration for the current active season.
-- Helsinki times:
--   season end: 2026-05-22 12:00
--   community proposal end: 2026-05-25 12:00
--   community voting end: 2026-05-26 12:00

WITH current_cycle AS (
  SELECT "id"
  FROM "Cycle"
  WHERE "resolvedAt" IS NULL
    AND "status" = 'ACTIVE'
  ORDER BY "createdAt" DESC
  LIMIT 1
)
UPDATE "Cycle"
SET "activeEndsAt" = TIMESTAMP '2026-05-22 09:00:00'
WHERE "id" IN (SELECT "id" FROM current_cycle);

WITH current_cycle AS (
  SELECT "id"
  FROM "Cycle"
  WHERE "resolvedAt" IS NULL
    AND "status" = 'ACTIVE'
  ORDER BY "createdAt" DESC
  LIMIT 1
)
UPDATE "CycleHistory"
SET
  "communityWishProposalEndsAt" = TIMESTAMP '2026-05-25 09:00:00',
  "communityWishVotingEndsAt" = TIMESTAMP '2026-05-26 09:00:00'
WHERE "cycleId" IN (SELECT "id" FROM current_cycle);
