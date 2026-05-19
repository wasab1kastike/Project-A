ALTER TYPE "RaceAbilityKind" ADD VALUE IF NOT EXISTS 'UNICORN_COMBAT_SURGE';
ALTER TYPE "RaceAbilityKind" ADD VALUE IF NOT EXISTS 'UNICORN_ECONOMY_SURGE';

CREATE TYPE "UnicornShatteredRealityOutcome" AS ENUM (
  'MIRROR_HOST',
  'PRISMATIC_SURGE',
  'LUCKY_GALLOP'
);

CREATE TABLE "UnicornShatteredRealityRoll" (
  "id" TEXT NOT NULL,
  "fortressId" TEXT NOT NULL,
  "outcome" "UnicornShatteredRealityOutcome" NOT NULL,
  "summary" TEXT NOT NULL,
  "armyDelta" INTEGER NOT NULL DEFAULT 0,
  "garrisonArmyDelta" INTEGER NOT NULL DEFAULT 0,
  "goldDelta" INTEGER NOT NULL DEFAULT 0,
  "foodDelta" INTEGER NOT NULL DEFAULT 0,
  "activeUntil" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "UnicornShatteredRealityRoll_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "UnicornShatteredRealityRoll_fortressId_createdAt_idx"
ON "UnicornShatteredRealityRoll"("fortressId", "createdAt");

CREATE INDEX "UnicornShatteredRealityRoll_outcome_createdAt_idx"
ON "UnicornShatteredRealityRoll"("outcome", "createdAt");

ALTER TABLE "UnicornShatteredRealityRoll"
ADD CONSTRAINT "UnicornShatteredRealityRoll_fortressId_fkey"
FOREIGN KEY ("fortressId") REFERENCES "Fortress"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
