ALTER TYPE "CycleStatus" ADD VALUE 'TESTING';

ALTER TABLE "Cycle"
  ADD COLUMN "testingStartedAt" TIMESTAMP(3),
  ADD COLUMN "testingEndsAt" TIMESTAMP(3);

UPDATE "Cycle"
SET
  "testingStartedAt" = "registrationEndsAt" - INTERVAL '24 hours',
  "testingEndsAt" = "registrationEndsAt"
WHERE "testingStartedAt" IS NULL
  AND "testingEndsAt" IS NULL;
