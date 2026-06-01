ALTER TABLE "AttackUnit"
  ADD COLUMN IF NOT EXISTS "reinforcementBattalionId" TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'AttackUnit_reinforcementBattalionId_fkey'
  ) THEN
    ALTER TABLE "AttackUnit"
      ADD CONSTRAINT "AttackUnit_reinforcementBattalionId_fkey"
      FOREIGN KEY ("reinforcementBattalionId") REFERENCES "Battalion"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "AttackUnit_reinforcementBattalionId_arrivesAt_idx"
  ON "AttackUnit"("reinforcementBattalionId", "arrivesAt");
