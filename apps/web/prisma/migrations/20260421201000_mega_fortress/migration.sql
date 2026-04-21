-- AlterEnum
ALTER TYPE "ScoreEventType" ADD VALUE 'MEGA_DAMAGE';
ALTER TYPE "ScoreEventType" ADD VALUE 'MEGA_DESTROY_BONUS';

-- AlterTable
ALTER TABLE "Cycle" ADD COLUMN "crownedFortressId" TEXT;

-- AlterTable
ALTER TABLE "Fortress"
ADD COLUMN "health" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "iconLabel" TEXT,
ADD COLUMN "isNpc" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "maxHealth" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "sizeTiles" INTEGER NOT NULL DEFAULT 1;

-- CreateIndex
CREATE INDEX "Cycle_crownedFortressId_idx" ON "Cycle"("crownedFortressId");

-- CreateIndex
CREATE INDEX "Fortress_cycleId_isNpc_idx" ON "Fortress"("cycleId", "isNpc");

-- AddForeignKey
ALTER TABLE "Cycle" ADD CONSTRAINT "Cycle_crownedFortressId_fkey" FOREIGN KEY ("crownedFortressId") REFERENCES "Fortress"("id") ON DELETE SET NULL ON UPDATE CASCADE;
