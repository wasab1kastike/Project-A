-- Add delta columns required by the dwarf deep mining revamp.
-- The previous revamp migration renamed/dropped legacy columns but did not
-- create every column used by the updated Prisma model.

ALTER TABLE "DwarfDeepMiningRoll"
  ADD COLUMN IF NOT EXISTS "goldDelta" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "recruitmentQueueDelta" INTEGER NOT NULL DEFAULT 0;
