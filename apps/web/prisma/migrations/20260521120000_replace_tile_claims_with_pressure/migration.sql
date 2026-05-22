-- Season 4 replaces manual, gold-paid tile claim projects with pressure-based expansion.
DROP TABLE IF EXISTS "MapHexClaimProject";

CREATE TABLE "TilePressurePriority" (
    "id" TEXT NOT NULL,
    "cycleId" TEXT NOT NULL,
    "fortressId" TEXT NOT NULL,
    "tileId" TEXT NOT NULL,
    "weight" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TilePressurePriority_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TilePressureState" (
    "id" TEXT NOT NULL,
    "cycleId" TEXT NOT NULL,
    "tileId" TEXT NOT NULL,
    "fortressId" TEXT NOT NULL,
    "pressure" INTEGER NOT NULL DEFAULT 0,
    "lastPressuredAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TilePressureState_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TilePressurePriority_cycleId_fortressId_tileId_key" ON "TilePressurePriority"("cycleId", "fortressId", "tileId");
CREATE INDEX "TilePressurePriority_cycleId_fortressId_idx" ON "TilePressurePriority"("cycleId", "fortressId");
CREATE INDEX "TilePressurePriority_cycleId_tileId_idx" ON "TilePressurePriority"("cycleId", "tileId");

CREATE UNIQUE INDEX "TilePressureState_cycleId_tileId_fortressId_key" ON "TilePressureState"("cycleId", "tileId", "fortressId");
CREATE INDEX "TilePressureState_cycleId_tileId_idx" ON "TilePressureState"("cycleId", "tileId");
CREATE INDEX "TilePressureState_cycleId_fortressId_idx" ON "TilePressureState"("cycleId", "fortressId");

ALTER TABLE "TilePressurePriority" ADD CONSTRAINT "TilePressurePriority_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "Cycle"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TilePressurePriority" ADD CONSTRAINT "TilePressurePriority_fortressId_fkey" FOREIGN KEY ("fortressId") REFERENCES "Fortress"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TilePressureState" ADD CONSTRAINT "TilePressureState_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "Cycle"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TilePressureState" ADD CONSTRAINT "TilePressureState_fortressId_fkey" FOREIGN KEY ("fortressId") REFERENCES "Fortress"("id") ON DELETE CASCADE ON UPDATE CASCADE;
