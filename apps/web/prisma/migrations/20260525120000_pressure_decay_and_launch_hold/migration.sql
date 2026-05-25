-- Persist the last decay boundary so unsupported Season 4 expansion pressure
-- loses progress once per completed hour rather than once per game tick.
ALTER TABLE "TilePressureState"
  ADD COLUMN "lastDecayedAt" TIMESTAMP(3);
