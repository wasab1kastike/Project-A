-- CreateTable
CREATE TABLE "Battalion" (
    "id" TEXT NOT NULL,
    "cycleId" TEXT NOT NULL,
    "fortressId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "size" INTEGER NOT NULL DEFAULT 0,
    "maxSize" INTEGER NOT NULL DEFAULT 100,
    "tier" INTEGER NOT NULL DEFAULT 0,
    "xp" INTEGER NOT NULL DEFAULT 0,
    "readyAt" TIMESTAMP(3),
    "stance" TEXT NOT NULL DEFAULT 'REST',
    "garrisonedAt" TEXT,
    "stanceLockedUntil" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Battalion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WarFront" (
    "id" TEXT NOT NULL,
    "cycleId" TEXT NOT NULL,
    "attackerFortressId" TEXT NOT NULL,
    "enemyFortressId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ADVANCING',
    "aggression" TEXT NOT NULL DEFAULT 'BALANCED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WarFront_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BattalionAssignment" (
    "id" TEXT NOT NULL,
    "battalionId" TEXT NOT NULL,
    "frontId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BattalionAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WarPolicy" (
    "id" TEXT NOT NULL,
    "cycleId" TEXT NOT NULL,
    "fortressId" TEXT NOT NULL,
    "maxArmySize" INTEGER NOT NULL DEFAULT 500,
    "guardPercent" INTEGER NOT NULL DEFAULT 30,
    "defaultAggression" TEXT NOT NULL DEFAULT 'BALANCED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WarPolicy_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Battalion_cycleId_fortressId_name_key" ON "Battalion"("cycleId", "fortressId", "name");

-- CreateIndex
CREATE INDEX "Battalion_cycleId_fortressId_idx" ON "Battalion"("cycleId", "fortressId");

-- CreateIndex
CREATE INDEX "Battalion_garrisonedAt_idx" ON "Battalion"("garrisonedAt");

-- CreateIndex
CREATE UNIQUE INDEX "WarFront_cycleId_attackerFortressId_enemyFortressId_key" ON "WarFront"("cycleId", "attackerFortressId", "enemyFortressId");

-- CreateIndex
CREATE INDEX "WarFront_cycleId_attackerFortressId_idx" ON "WarFront"("cycleId", "attackerFortressId");

-- CreateIndex
CREATE UNIQUE INDEX "BattalionAssignment_battalionId_key" ON "BattalionAssignment"("battalionId");

-- CreateIndex
CREATE UNIQUE INDEX "BattalionAssignment_battalionId_frontId_key" ON "BattalionAssignment"("battalionId", "frontId");

-- CreateIndex
CREATE INDEX "BattalionAssignment_frontId_idx" ON "BattalionAssignment"("frontId");

-- CreateIndex
CREATE UNIQUE INDEX "WarPolicy_cycleId_fortressId_key" ON "WarPolicy"("cycleId", "fortressId");

-- CreateIndex
CREATE INDEX "WarPolicy_cycleId_idx" ON "WarPolicy"("cycleId");

-- AddForeignKey
ALTER TABLE "Battalion" ADD CONSTRAINT "Battalion_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "Cycle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Battalion" ADD CONSTRAINT "Battalion_fortressId_fkey" FOREIGN KEY ("fortressId") REFERENCES "Fortress"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WarFront" ADD CONSTRAINT "WarFront_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "Cycle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WarFront" ADD CONSTRAINT "WarFront_attackerFortressId_fkey" FOREIGN KEY ("attackerFortressId") REFERENCES "Fortress"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BattalionAssignment" ADD CONSTRAINT "BattalionAssignment_battalionId_fkey" FOREIGN KEY ("battalionId") REFERENCES "Battalion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BattalionAssignment" ADD CONSTRAINT "BattalionAssignment_frontId_fkey" FOREIGN KEY ("frontId") REFERENCES "WarFront"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WarPolicy" ADD CONSTRAINT "WarPolicy_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "Cycle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WarPolicy" ADD CONSTRAINT "WarPolicy_fortressId_fkey" FOREIGN KEY ("fortressId") REFERENCES "Fortress"("id") ON DELETE CASCADE ON UPDATE CASCADE;
