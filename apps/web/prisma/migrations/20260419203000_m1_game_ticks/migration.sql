-- CreateTable
CREATE TABLE "GameTick" (
    "id" TEXT NOT NULL,
    "cycleId" TEXT NOT NULL,
    "tickAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GameTick_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "GameTick_cycleId_tickAt_key" ON "GameTick"("cycleId", "tickAt");

-- CreateIndex
CREATE INDEX "GameTick_tickAt_idx" ON "GameTick"("tickAt");

-- AddForeignKey
ALTER TABLE "GameTick" ADD CONSTRAINT "GameTick_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "Cycle"("id") ON DELETE CASCADE ON UPDATE CASCADE;
