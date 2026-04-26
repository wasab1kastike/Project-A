ALTER TABLE "User"
  ADD COLUMN "unitCosmeticVariant" TEXT,
  ADD COLUMN "fortressCosmeticVariant" TEXT,
  ADD COLUMN "cosmeticUnlockedAt" TIMESTAMP(3);

CREATE TABLE "BuildArcadeRun" (
  "id" TEXT NOT NULL,
  "cycleId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "score" INTEGER NOT NULL DEFAULT 0,
  "rewardVariant" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "BuildArcadeRun_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BuildArcadeRun_cycleId_userId_key"
  ON "BuildArcadeRun"("cycleId", "userId");

CREATE INDEX "BuildArcadeRun_cycleId_score_idx"
  ON "BuildArcadeRun"("cycleId", "score");

CREATE INDEX "BuildArcadeRun_userId_idx"
  ON "BuildArcadeRun"("userId");

ALTER TABLE "BuildArcadeRun"
  ADD CONSTRAINT "BuildArcadeRun_cycleId_fkey"
  FOREIGN KEY ("cycleId") REFERENCES "Cycle"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "BuildArcadeRun"
  ADD CONSTRAINT "BuildArcadeRun_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
