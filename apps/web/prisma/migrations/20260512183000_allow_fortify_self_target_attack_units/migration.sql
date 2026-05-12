-- Fortify movements intentionally use the owning fortress as the AttackUnit
-- target while fortifyTargetTileId points at the actual map tile.
ALTER TABLE "AttackUnit"
DROP CONSTRAINT IF EXISTS "AttackUnit_attacker_not_target_check";

ALTER TABLE "AttackUnit"
ADD CONSTRAINT "AttackUnit_attacker_not_target_check"
CHECK (
  "attackerFortressId" <> "targetFortressId"
  OR "fortifyTargetTileId" IS NOT NULL
)
NOT VALID;
