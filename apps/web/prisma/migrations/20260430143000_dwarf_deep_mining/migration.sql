-- AlterEnum
ALTER TYPE "FortressKind" ADD VALUE 'DWARF_RUNE';

-- AlterEnum
ALTER TYPE "RaceAbilityKind" ADD VALUE 'DWARF_DEEP_MINING_COOLDOWN';
ALTER TYPE "RaceAbilityKind" ADD VALUE 'DWARF_ECONOMY_SURGE';
ALTER TYPE "RaceAbilityKind" ADD VALUE 'DWARF_COMBAT_SURGE';
ALTER TYPE "RaceAbilityKind" ADD VALUE 'DWARF_RUNE_SUPPRESSION';
ALTER TYPE "RaceAbilityKind" ADD VALUE 'DWARF_SLOW_ATTACKS';
ALTER TYPE "RaceAbilityKind" ADD VALUE 'DWARF_ECONOMY_HALT';

-- AlterEnum
ALTER TYPE "ScoreEventType" ADD VALUE 'DWARF_DEEP_MINING_POINTS';
ALTER TYPE "ScoreEventType" ADD VALUE 'DWARF_RUNE_BOUNTY';

-- CreateEnum
CREATE TYPE "DwarfDeepMiningOutcome" AS ENUM (
  'RICH_VEIN',
  'ORE_SURGE',
  'BATTLE_RUNES',
  'FACTION_SEAL',
  'BURIED_WARBAND',
  'CAVE_IN',
  'UNSTABLE_TUNNELS',
  'SHAFT_COLLAPSE'
);

-- CreateTable
CREATE TABLE "DwarfDeepMiningRoll" (
  "id" TEXT NOT NULL,
  "fortressId" TEXT NOT NULL,
  "targetFortressId" TEXT,
  "runeFortressId" TEXT,
  "outcome" "DwarfDeepMiningOutcome" NOT NULL,
  "committedArmy" INTEGER NOT NULL DEFAULT 0,
  "pointDelta" INTEGER NOT NULL DEFAULT 0,
  "armyDelta" INTEGER NOT NULL DEFAULT 0,
  "activeUntil" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "DwarfDeepMiningRoll_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DwarfDeepMiningRoll_runeFortressId_key" ON "DwarfDeepMiningRoll"("runeFortressId");

-- CreateIndex
CREATE INDEX "DwarfDeepMiningRoll_fortressId_createdAt_idx" ON "DwarfDeepMiningRoll"("fortressId", "createdAt");

-- CreateIndex
CREATE INDEX "DwarfDeepMiningRoll_targetFortressId_activeUntil_idx" ON "DwarfDeepMiningRoll"("targetFortressId", "activeUntil");

-- CreateIndex
CREATE INDEX "DwarfDeepMiningRoll_outcome_createdAt_idx" ON "DwarfDeepMiningRoll"("outcome", "createdAt");

-- AddForeignKey
ALTER TABLE "DwarfDeepMiningRoll" ADD CONSTRAINT "DwarfDeepMiningRoll_fortressId_fkey" FOREIGN KEY ("fortressId") REFERENCES "Fortress"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DwarfDeepMiningRoll" ADD CONSTRAINT "DwarfDeepMiningRoll_targetFortressId_fkey" FOREIGN KEY ("targetFortressId") REFERENCES "Fortress"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DwarfDeepMiningRoll" ADD CONSTRAINT "DwarfDeepMiningRoll_runeFortressId_fkey" FOREIGN KEY ("runeFortressId") REFERENCES "Fortress"("id") ON DELETE SET NULL ON UPDATE CASCADE;
