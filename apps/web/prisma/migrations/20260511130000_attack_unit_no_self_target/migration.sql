-- Prevent self-target attack rows at the database layer.
-- NOT VALID keeps deploys safe even if historical rows contain bad data.
ALTER TABLE "AttackUnit"
ADD CONSTRAINT "AttackUnit_attacker_not_target_check"
CHECK ("attackerFortressId" <> "targetFortressId") NOT VALID;
