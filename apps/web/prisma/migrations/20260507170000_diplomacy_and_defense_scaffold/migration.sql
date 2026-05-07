-- Create enums for diplomacy and defensive attack-unit missions.
CREATE TYPE "DiplomacyStatus" AS ENUM ('WAR', 'PEACE');
CREATE TYPE "AttackUnitMissionKind" AS ENUM ('RAID', 'BATTLEFIELD_REINFORCEMENT', 'CASTLE_DEFENSE');

-- Add diplomacy relations between players per cycle.
CREATE TABLE "DiplomacyRelation" (
    "id" TEXT NOT NULL,
    "cycleId" TEXT NOT NULL,
    "fromUserId" TEXT NOT NULL,
    "toUserId" TEXT NOT NULL,
    "status" "DiplomacyStatus" NOT NULL DEFAULT 'WAR',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "DiplomacyRelation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DiplomacyRelation_cycleId_fromUserId_toUserId_key"
    ON "DiplomacyRelation"("cycleId", "fromUserId", "toUserId");
CREATE INDEX "DiplomacyRelation_cycleId_status_idx"
    ON "DiplomacyRelation"("cycleId", "status");
CREATE INDEX "DiplomacyRelation_fromUserId_status_idx"
    ON "DiplomacyRelation"("fromUserId", "status");
CREATE INDEX "DiplomacyRelation_toUserId_status_idx"
    ON "DiplomacyRelation"("toUserId", "status");

ALTER TABLE "DiplomacyRelation"
    ADD CONSTRAINT "DiplomacyRelation_cycleId_fkey"
    FOREIGN KEY ("cycleId") REFERENCES "Cycle"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DiplomacyRelation"
    ADD CONSTRAINT "DiplomacyRelation_fromUserId_fkey"
    FOREIGN KEY ("fromUserId") REFERENCES "User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DiplomacyRelation"
    ADD CONSTRAINT "DiplomacyRelation_toUserId_fkey"
    FOREIGN KEY ("toUserId") REFERENCES "User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DiplomacyRelation"
    ADD CONSTRAINT "DiplomacyRelation_fromUserId_toUserId_check"
    CHECK ("fromUserId" <> "toUserId");

-- Extend attack units for persistent defense missions.
ALTER TABLE "AttackUnit"
    ADD COLUMN "defenseTargetFortressId" TEXT,
    ADD COLUMN "missionKind" "AttackUnitMissionKind" NOT NULL DEFAULT 'RAID',
    ADD COLUMN "defenseStationedAt" TIMESTAMP(3),
    ADD COLUMN "defenseReleasedAt" TIMESTAMP(3);

CREATE INDEX "AttackUnit_defenseTargetFortressId_defenseReleasedAt_idx"
    ON "AttackUnit"("defenseTargetFortressId", "defenseReleasedAt");

ALTER TABLE "AttackUnit"
    ADD CONSTRAINT "AttackUnit_defenseTargetFortressId_fkey"
    FOREIGN KEY ("defenseTargetFortressId") REFERENCES "Fortress"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
