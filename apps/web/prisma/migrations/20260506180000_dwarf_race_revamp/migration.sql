-- Dwarf race revamp: queued mining rewards, rune suppression, and rune upkeep state

ALTER TYPE "RaceAbilityKind" ADD VALUE IF NOT EXISTS 'DWARF_RUNE_GRUDGES';

ALTER TABLE "DwarfDeepMiningRoll"
  RENAME COLUMN "committedArmy" TO "committedGold";

ALTER TABLE "DwarfDeepMiningRoll"
  DROP COLUMN IF EXISTS "pointDelta";

ALTER TABLE "RaceAbilityActivation"
  ADD COLUMN "targetFortressId" TEXT,
  ADD COLUMN "runeFortressId" TEXT,
  ADD COLUMN "goldCost" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "maintenanceGoldPerTick" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "RaceAbilityActivation"
  ADD CONSTRAINT "RaceAbilityActivation_targetFortressId_fkey"
  FOREIGN KEY ("targetFortressId") REFERENCES "Fortress"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "RaceAbilityActivation"
  ADD CONSTRAINT "RaceAbilityActivation_runeFortressId_fkey"
  FOREIGN KEY ("runeFortressId") REFERENCES "Fortress"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "RaceAbilityActivation_targetFortressId_kind_activeUntil_idx"
  ON "RaceAbilityActivation"("targetFortressId", "kind", "activeUntil");

CREATE INDEX "RaceAbilityActivation_runeFortressId_kind_activeUntil_idx"
  ON "RaceAbilityActivation"("runeFortressId", "kind", "activeUntil");
