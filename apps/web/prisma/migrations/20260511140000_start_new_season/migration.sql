-- Start new season at 13:00 on May 11, 2026
-- Close current testing cycle and create new registration cycle

-- Archive the current cycle
UPDATE "Cycle"
SET status = 'RESOLUTION', "resolvedAt" = NOW(), "winnerId" = NULL, "joiningLockedAt" = NULL
WHERE "resolvedAt" IS NULL;

-- Create new cycle with active start at 13:00 today
INSERT INTO "Cycle" (
  id,
  status,
  "registrationStartedAt",
  "registrationEndsAt",
  "testingStartedAt",
  "testingEndsAt",
  "activeStartedAt",
  "activeEndsAt",
  "createdAt",
  "updatedAt"
) VALUES (
  gen_random_uuid()::text,
  'REGISTRATION',
  NOW(),
  CURRENT_DATE AT TIME ZONE 'UTC' + INTERVAL '13 hours',
  CURRENT_DATE AT TIME ZONE 'UTC' + INTERVAL '-11 hours',
  CURRENT_DATE AT TIME ZONE 'UTC' + INTERVAL '12 hours',
  CURRENT_DATE AT TIME ZONE 'UTC' + INTERVAL '13 hours',
  CURRENT_DATE AT TIME ZONE 'UTC' + INTERVAL '13 days 13 hours',
  NOW(),
  NOW()
);
