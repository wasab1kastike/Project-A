-- CreateTable
CREATE TABLE "HomeOfAHolder" (
  "id" TEXT NOT NULL,
  "cycleId" TEXT NOT NULL,
  "fortressId" TEXT NOT NULL,
  "bannerFortressId" TEXT NOT NULL,
  "contributionWeight" INTEGER NOT NULL,
  "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "HomeOfAHolder_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "HomeOfAHolder_cycleId_fortressId_key" ON "HomeOfAHolder"("cycleId", "fortressId");

-- CreateIndex
CREATE INDEX "HomeOfAHolder_cycleId_bannerFortressId_idx" ON "HomeOfAHolder"("cycleId", "bannerFortressId");

-- CreateIndex
CREATE INDEX "HomeOfAHolder_fortressId_idx" ON "HomeOfAHolder"("fortressId");

-- AddForeignKey
ALTER TABLE "HomeOfAHolder" ADD CONSTRAINT "HomeOfAHolder_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "Cycle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HomeOfAHolder" ADD CONSTRAINT "HomeOfAHolder_fortressId_fkey" FOREIGN KEY ("fortressId") REFERENCES "Fortress"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HomeOfAHolder" ADD CONSTRAINT "HomeOfAHolder_bannerFortressId_fkey" FOREIGN KEY ("bannerFortressId") REFERENCES "Fortress"("id") ON DELETE CASCADE ON UPDATE CASCADE;
