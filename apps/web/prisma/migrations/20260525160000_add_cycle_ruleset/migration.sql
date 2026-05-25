CREATE TYPE "CycleRuleset" AS ENUM ('LEGACY', 'SEASON_4');

ALTER TABLE "Cycle"
  ADD COLUMN "ruleset" "CycleRuleset" NOT NULL DEFAULT 'LEGACY';

-- The unfinished active/test sandbox is the Season 4 pretesting environment.
-- Resolved seasons retain legacy behavior for history and regression reads.
UPDATE "Cycle"
SET "ruleset" = 'SEASON_4'
WHERE "resolvedAt" IS NULL
  AND "status" IN ('REGISTRATION', 'TESTING');
