-- Align existing DwarfDeepMiningRoll tables with the current Prisma model.
-- Some deployed databases were created before the delayed-resolution roll state
-- was added, so the cron tick can fail as soon as Prisma selects those fields.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'DwarfDeepMiningRoll'
      AND column_name = 'committedArmy'
  ) AND NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'DwarfDeepMiningRoll'
      AND column_name = 'committedGold'
  ) THEN
    ALTER TABLE "DwarfDeepMiningRoll"
      RENAME COLUMN "committedArmy" TO "committedGold";
  END IF;
END $$;

ALTER TABLE "DwarfDeepMiningRoll"
  ADD COLUMN IF NOT EXISTS "committedGold" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "goldDelta" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "armyDelta" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "recruitmentQueueDelta" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "resolvedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "activeUntil" TIMESTAMP(3);
