-- CreateTable
CREATE TABLE "MapHexRoad" (
    "id" TEXT NOT NULL,
    "cycleId" TEXT NOT NULL,
    "tileId" TEXT NOT NULL,
    "crossings" INTEGER NOT NULL DEFAULT 0,
    "level" INTEGER NOT NULL DEFAULT 0,
    "lastUsedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MapHexRoad_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MapHexRoad_cycleId_tileId_key" ON "MapHexRoad"("cycleId", "tileId");

-- CreateIndex
CREATE INDEX "MapHexRoad_cycleId_idx" ON "MapHexRoad"("cycleId");

-- AddForeignKey
ALTER TABLE "MapHexRoad" ADD CONSTRAINT "MapHexRoad_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "Cycle"("id") ON DELETE CASCADE ON UPDATE CASCADE;
