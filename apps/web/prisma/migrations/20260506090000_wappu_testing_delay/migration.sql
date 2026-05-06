WITH current_cycle AS (
  SELECT "id"
  FROM "Cycle"
  WHERE "resolvedAt" IS NULL
    AND "status" IN ('REGISTRATION', 'TESTING', 'ACTIVE')
  ORDER BY "createdAt" DESC
  LIMIT 1
)
UPDATE "Cycle"
SET
  "status" = 'TESTING',
  "registrationEndsAt" = TIMESTAMP '2026-05-11 09:00:00.000',
  "testingStartedAt" = TIMESTAMP '2026-05-06 09:00:00.000',
  "testingEndsAt" = TIMESTAMP '2026-05-11 09:00:00.000',
  "activeStartedAt" = TIMESTAMP '2026-05-11 09:00:00.000',
  "activeEndsAt" = TIMESTAMP '2026-05-18 09:00:00.000',
  "joiningLockedAt" = NULL,
  "updatedAt" = NOW()
WHERE "id" IN (SELECT "id" FROM current_cycle);
