-- Recalled and returning armies intentionally travel back to their own fortress.
-- The row target remains the home fortress while recalledAt marks it as a return.
ALTER TABLE "AttackUnit"
DROP CONSTRAINT IF EXISTS "AttackUnit_attacker_not_target_check";

ALTER TABLE "AttackUnit"
ADD CONSTRAINT "AttackUnit_attacker_not_target_check"
CHECK (
  "attackerFortressId" <> "targetFortressId"
  OR "fortifyTargetTileId" IS NOT NULL
  OR "recalledAt" IS NOT NULL
)
NOT VALID;
