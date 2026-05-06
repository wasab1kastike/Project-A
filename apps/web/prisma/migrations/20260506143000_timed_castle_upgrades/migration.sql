CREATE TABLE "CastleUpgradeProject" (
  "id" TEXT NOT NULL,
  "cycleId" TEXT NOT NULL,
  "fortressId" TEXT NOT NULL,
  "level" INTEGER NOT NULL,
  "specialization" "CastleUpgradeSpecialization" NOT NULL,
  "goldCost" INTEGER NOT NULL,
  "startedAt" TIMESTAMP(3) NOT NULL,
  "completesAt" TIMESTAMP(3) NOT NULL,
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "CastleUpgradeProject_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CastleUpgradeProject_cycleId_completesAt_completedAt_idx"
  ON "CastleUpgradeProject"("cycleId", "completesAt", "completedAt");

CREATE INDEX "CastleUpgradeProject_fortressId_completedAt_idx"
  ON "CastleUpgradeProject"("fortressId", "completedAt");

ALTER TABLE "CastleUpgradeProject"
  ADD CONSTRAINT "CastleUpgradeProject_cycleId_fkey"
  FOREIGN KEY ("cycleId") REFERENCES "Cycle"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CastleUpgradeProject"
  ADD CONSTRAINT "CastleUpgradeProject_fortressId_fkey"
  FOREIGN KEY ("fortressId") REFERENCES "Fortress"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
