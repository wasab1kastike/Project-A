-- CreateEnum
CREATE TYPE "FortressKind" AS ENUM ('PLAYER', 'MEGA', 'UNICORN_DECOY');

-- AlterEnum
ALTER TYPE "ScoreEventType" ADD VALUE 'UNICORN_DECOY_DESTROY';

-- AlterTable
ALTER TABLE "Fortress"
ADD COLUMN "fortressKind" "FortressKind" NOT NULL DEFAULT 'PLAYER',
ADD COLUMN "unicornDecoySourceFortressId" TEXT,
ADD COLUMN "unicornDecoyLevel" INTEGER;

UPDATE "Fortress"
SET "fortressKind" = 'MEGA'
WHERE "isNpc" = true;

-- CreateIndex
CREATE INDEX "Fortress_cycleId_fortressKind_idx" ON "Fortress"("cycleId", "fortressKind");

-- CreateIndex
CREATE INDEX "Fortress_unicornDecoySourceFortressId_createdAt_idx" ON "Fortress"("unicornDecoySourceFortressId", "createdAt");

-- AddForeignKey
ALTER TABLE "Fortress" ADD CONSTRAINT "Fortress_unicornDecoySourceFortressId_fkey" FOREIGN KEY ("unicornDecoySourceFortressId") REFERENCES "Fortress"("id") ON DELETE CASCADE ON UPDATE CASCADE;
