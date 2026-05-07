CREATE TABLE "MapHexClaimProject" (
    "id" TEXT NOT NULL,
    "cycleId" TEXT NOT NULL,
    "fortressId" TEXT NOT NULL,
    "tileId" TEXT NOT NULL,
    "goldCost" INTEGER NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "completesAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MapHexClaimProject_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "MapHexClaimProject_cycleId_completedAt_completesAt_idx" ON "MapHexClaimProject"("cycleId", "completedAt", "completesAt");
CREATE INDEX "MapHexClaimProject_fortressId_completedAt_idx" ON "MapHexClaimProject"("fortressId", "completedAt");
CREATE INDEX "MapHexClaimProject_cycleId_tileId_completedAt_idx" ON "MapHexClaimProject"("cycleId", "tileId", "completedAt");
CREATE UNIQUE INDEX "MapHexClaimProject_cycleId_tileId_active_key" ON "MapHexClaimProject"("cycleId", "tileId") WHERE "completedAt" IS NULL;
CREATE UNIQUE INDEX "MapHexClaimProject_fortressId_active_key" ON "MapHexClaimProject"("fortressId") WHERE "completedAt" IS NULL;

ALTER TABLE "MapHexClaimProject" ADD CONSTRAINT "MapHexClaimProject_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "Cycle"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MapHexClaimProject" ADD CONSTRAINT "MapHexClaimProject_fortressId_fkey" FOREIGN KEY ("fortressId") REFERENCES "Fortress"("id") ON DELETE CASCADE ON UPDATE CASCADE;
