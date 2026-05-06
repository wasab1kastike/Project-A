DROP INDEX IF EXISTS "CastleUpgradeSpecializationChoice_fortressId_level_key";

CREATE UNIQUE INDEX "CastleUpgradeSpecializationChoice_fortressId_specialization_level_key"
  ON "CastleUpgradeSpecializationChoice"("fortressId", "specialization", "level");
