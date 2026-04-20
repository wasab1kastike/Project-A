-- AlterTable
ALTER TABLE "Cycle"
ADD COLUMN "joiningLockedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "CycleHistory"
ADD COLUMN "tieBreakSummary" TEXT;
