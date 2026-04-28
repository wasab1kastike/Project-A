CREATE TYPE "CastleUpgradeSpecialization" AS ENUM ('POINTS', 'FOOD', 'MILITARY', 'DEFENSE');

CREATE TYPE "RaceAbilityKind" AS ENUM ('ORK_WAAAGH', 'SPACE_MURINE_STIM', 'UNICORN_TELEPORT');

CREATE TABLE "CastleUpgradeSpecializationChoice" (
  "id" TEXT NOT NULL,
  "fortressId" TEXT NOT NULL,
  "level" INTEGER NOT NULL,
  "specialization" "CastleUpgradeSpecialization" NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "CastleUpgradeSpecializationChoice_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RaceAbilityActivation" (
  "id" TEXT NOT NULL,
  "fortressId" TEXT NOT NULL,
  "kind" "RaceAbilityKind" NOT NULL,
  "activeFrom" TIMESTAMP(3) NOT NULL,
  "activeUntil" TIMESTAMP(3) NOT NULL,
  "usedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3),
  "consumedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "RaceAbilityActivation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DwarfGrudge" (
  "id" TEXT NOT NULL,
  "fortressId" TEXT NOT NULL,
  "targetFortressId" TEXT NOT NULL,
  "slot" INTEGER NOT NULL,
  "bonusMultiplier" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "DwarfGrudge_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CastleUpgradeSpecializationChoice_fortressId_level_key" ON "CastleUpgradeSpecializationChoice"("fortressId", "level");
CREATE INDEX "CastleUpgradeSpecializationChoice_fortressId_specialization_idx" ON "CastleUpgradeSpecializationChoice"("fortressId", "specialization");

CREATE INDEX "RaceAbilityActivation_fortressId_kind_usedAt_idx" ON "RaceAbilityActivation"("fortressId", "kind", "usedAt");
CREATE INDEX "RaceAbilityActivation_fortressId_kind_activeUntil_idx" ON "RaceAbilityActivation"("fortressId", "kind", "activeUntil");
CREATE INDEX "RaceAbilityActivation_fortressId_kind_expiresAt_consumedAt_idx" ON "RaceAbilityActivation"("fortressId", "kind", "expiresAt", "consumedAt");

CREATE UNIQUE INDEX "DwarfGrudge_fortressId_slot_key" ON "DwarfGrudge"("fortressId", "slot");
CREATE UNIQUE INDEX "DwarfGrudge_fortressId_targetFortressId_key" ON "DwarfGrudge"("fortressId", "targetFortressId");
CREATE INDEX "DwarfGrudge_targetFortressId_idx" ON "DwarfGrudge"("targetFortressId");

ALTER TABLE "CastleUpgradeSpecializationChoice" ADD CONSTRAINT "CastleUpgradeSpecializationChoice_fortressId_fkey" FOREIGN KEY ("fortressId") REFERENCES "Fortress"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RaceAbilityActivation" ADD CONSTRAINT "RaceAbilityActivation_fortressId_fkey" FOREIGN KEY ("fortressId") REFERENCES "Fortress"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DwarfGrudge" ADD CONSTRAINT "DwarfGrudge_fortressId_fkey" FOREIGN KEY ("fortressId") REFERENCES "Fortress"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DwarfGrudge" ADD CONSTRAINT "DwarfGrudge_targetFortressId_fkey" FOREIGN KEY ("targetFortressId") REFERENCES "Fortress"("id") ON DELETE CASCADE ON UPDATE CASCADE;
