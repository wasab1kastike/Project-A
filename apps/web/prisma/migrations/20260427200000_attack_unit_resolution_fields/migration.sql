-- AlterTable
ALTER TABLE "AttackUnit"
ADD COLUMN "resolvedAttackPower" INTEGER,
ADD COLUMN "resolvedDefensePower" INTEGER,
ADD COLUMN "attackerSurvivors" INTEGER,
ADD COLUMN "attackerRetired" INTEGER,
ADD COLUMN "attackerReturned" INTEGER,
ADD COLUMN "defenderLosses" INTEGER,
ADD COLUMN "pointsLooted" INTEGER,
ADD COLUMN "foodLooted" INTEGER;
