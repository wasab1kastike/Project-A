-- Fix season times - set active start to May 11 13:00 Finnish time (UTC+3)
UPDATE "Cycle"
SET 
  "testingStartedAt" = TIMESTAMP '2026-05-09 10:00:00 UTC',
  "testingEndsAt" = TIMESTAMP '2026-05-10 10:00:00 UTC',
  "activeStartedAt" = TIMESTAMP '2026-05-11 10:00:00 UTC',
  "activeEndsAt" = TIMESTAMP '2026-05-25 10:00:00 UTC',
  "registrationEndsAt" = TIMESTAMP '2026-05-11 10:00:00 UTC'
WHERE status = 'REGISTRATION' AND "resolvedAt" IS NULL;
