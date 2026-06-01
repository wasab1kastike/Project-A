-- Stop the Season 4 testing cycle and open a clean registration window.
-- Active play starts at 2026-06-01 12:00 Europe/Helsinki / 09:00 UTC
-- and ends at 2026-06-15 12:00 Europe/Helsinki / 09:00 UTC.

WITH current_cycle AS (
  SELECT "id"
  FROM "Cycle"
  WHERE "resolvedAt" IS NULL
  ORDER BY "createdAt" DESC
  LIMIT 1
),
target_registration AS (
  SELECT "id"
  FROM "Cycle"
  WHERE "resolvedAt" IS NULL
    AND "status" = 'REGISTRATION'
    AND "ruleset" = 'SEASON_4'
    AND "registrationEndsAt" = TIMESTAMP '2026-06-01 09:00:00.000'
    AND "testingStartedAt" = TIMESTAMP '2026-06-01 09:00:00.000'
    AND "testingEndsAt" = TIMESTAMP '2026-06-01 09:00:00.000'
    AND "activeStartedAt" IS NULL
    AND "activeEndsAt" = TIMESTAMP '2026-06-15 09:00:00.000'
  LIMIT 1
),
archived_cycle AS (
  UPDATE "Cycle"
  SET
    "status" = 'RESOLUTION',
    "resolvedAt" = date_trunc('minute', NOW()),
    "winnerId" = NULL,
    "crownedFortressId" = NULL,
    "joiningLockedAt" = NULL
  WHERE "id" IN (SELECT "id" FROM current_cycle)
    AND NOT EXISTS (SELECT 1 FROM target_registration)
  RETURNING "id"
)
INSERT INTO "Cycle" (
  "id",
  "status",
  "ruleset",
  "registrationStartedAt",
  "registrationEndsAt",
  "testingStartedAt",
  "testingEndsAt",
  "activeStartedAt",
  "activeEndsAt",
  "createdAt",
  "updatedAt"
)
SELECT
  gen_random_uuid()::text,
  'REGISTRATION',
  'SEASON_4',
  date_trunc('minute', NOW()),
  TIMESTAMP '2026-06-01 09:00:00.000',
  TIMESTAMP '2026-06-01 09:00:00.000',
  TIMESTAMP '2026-06-01 09:00:00.000',
  NULL,
  TIMESTAMP '2026-06-15 09:00:00.000',
  NOW(),
  NOW()
WHERE NOT EXISTS (SELECT 1 FROM target_registration);
