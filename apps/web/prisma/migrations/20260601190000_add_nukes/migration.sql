CREATE TYPE "NukeComponentKind" AS ENUM ('FUEL', 'ROCKET', 'WRATH_OF_A');
CREATE TYPE "NukeComponentRoundStatus" AS ENUM ('OPEN', 'RESOLVED');

ALTER TYPE "ScoreEventType" ADD VALUE 'NUKE_COMPONENT_AWARDED';
ALTER TYPE "ScoreEventType" ADD VALUE 'NUKE_LAUNCH';
ALTER TYPE "TradeLineItemKind" ADD VALUE 'NUKE_COMPONENT';

CREATE TABLE "NukeComponentRound" (
  "id" TEXT NOT NULL,
  "cycleId" TEXT NOT NULL,
  "startsAt" TIMESTAMP(3) NOT NULL,
  "endsAt" TIMESTAMP(3) NOT NULL,
  "status" "NukeComponentRoundStatus" NOT NULL DEFAULT 'OPEN',
  "resolvedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "NukeComponentRound_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "NukeComponentBid" (
  "id" TEXT NOT NULL,
  "cycleId" TEXT NOT NULL,
  "roundId" TEXT NOT NULL,
  "fortressId" TEXT NOT NULL,
  "componentKind" "NukeComponentKind" NOT NULL,
  "amount" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "NukeComponentBid_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "NukeComponentInventory" (
  "id" TEXT NOT NULL,
  "cycleId" TEXT NOT NULL,
  "fortressId" TEXT NOT NULL,
  "componentKind" "NukeComponentKind" NOT NULL,
  "quantity" INTEGER NOT NULL DEFAULT 0,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "NukeComponentInventory_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "NukeLaunch" (
  "id" TEXT NOT NULL,
  "cycleId" TEXT NOT NULL,
  "launcherFortressId" TEXT NOT NULL,
  "targetFortressId" TEXT NOT NULL,
  "goldCost" INTEGER NOT NULL,
  "targetLevelBefore" INTEGER NOT NULL,
  "targetLevelAfter" INTEGER NOT NULL,
  "armyRemoved" INTEGER NOT NULL,
  "idleArmyRemoved" INTEGER NOT NULL DEFAULT 0,
  "garrisonArmyRemoved" INTEGER NOT NULL DEFAULT 0,
  "armyOrderRemoved" INTEGER NOT NULL DEFAULT 0,
  "attackUnitArmyRemoved" INTEGER NOT NULL DEFAULT 0,
  "battlefieldArmyRemoved" INTEGER NOT NULL DEFAULT 0,
  "battalionArmyRemoved" INTEGER NOT NULL DEFAULT 0,
  "convoyArmyRemoved" INTEGER NOT NULL DEFAULT 0,
  "launchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "NukeLaunch_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "TradeLineItem"
  ADD COLUMN "nukeComponentKind" "NukeComponentKind";

ALTER TABLE "ConvoyLeg"
  ADD COLUMN "nukeFuel" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "nukeRocket" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "nukeWrathOfA" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "stolenNukeFuel" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "stolenNukeRocket" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "stolenNukeWrathOfA" INTEGER NOT NULL DEFAULT 0;

CREATE UNIQUE INDEX "NukeComponentRound_cycleId_startsAt_key"
  ON "NukeComponentRound"("cycleId", "startsAt");
CREATE INDEX "NukeComponentRound_cycleId_status_endsAt_idx"
  ON "NukeComponentRound"("cycleId", "status", "endsAt");
CREATE INDEX "NukeComponentBid_cycleId_roundId_componentKind_amount_idx"
  ON "NukeComponentBid"("cycleId", "roundId", "componentKind", "amount");
CREATE INDEX "NukeComponentBid_fortressId_createdAt_idx"
  ON "NukeComponentBid"("fortressId", "createdAt");
CREATE UNIQUE INDEX "NukeComponentInventory_cycleId_fortressId_componentKind_key"
  ON "NukeComponentInventory"("cycleId", "fortressId", "componentKind");
CREATE INDEX "NukeComponentInventory_fortressId_idx"
  ON "NukeComponentInventory"("fortressId");
CREATE INDEX "NukeLaunch_cycleId_launchedAt_idx"
  ON "NukeLaunch"("cycleId", "launchedAt");
CREATE INDEX "NukeLaunch_launcherFortressId_launchedAt_idx"
  ON "NukeLaunch"("launcherFortressId", "launchedAt");
CREATE INDEX "NukeLaunch_targetFortressId_launchedAt_idx"
  ON "NukeLaunch"("targetFortressId", "launchedAt");

ALTER TABLE "NukeComponentRound"
  ADD CONSTRAINT "NukeComponentRound_cycleId_fkey"
  FOREIGN KEY ("cycleId") REFERENCES "Cycle"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "NukeComponentBid"
  ADD CONSTRAINT "NukeComponentBid_cycleId_fkey"
  FOREIGN KEY ("cycleId") REFERENCES "Cycle"("id")
  ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "NukeComponentBid_roundId_fkey"
  FOREIGN KEY ("roundId") REFERENCES "NukeComponentRound"("id")
  ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "NukeComponentBid_fortressId_fkey"
  FOREIGN KEY ("fortressId") REFERENCES "Fortress"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "NukeComponentInventory"
  ADD CONSTRAINT "NukeComponentInventory_cycleId_fkey"
  FOREIGN KEY ("cycleId") REFERENCES "Cycle"("id")
  ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "NukeComponentInventory_fortressId_fkey"
  FOREIGN KEY ("fortressId") REFERENCES "Fortress"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "NukeLaunch"
  ADD CONSTRAINT "NukeLaunch_cycleId_fkey"
  FOREIGN KEY ("cycleId") REFERENCES "Cycle"("id")
  ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "NukeLaunch_launcherFortressId_fkey"
  FOREIGN KEY ("launcherFortressId") REFERENCES "Fortress"("id")
  ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "NukeLaunch_targetFortressId_fkey"
  FOREIGN KEY ("targetFortressId") REFERENCES "Fortress"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
