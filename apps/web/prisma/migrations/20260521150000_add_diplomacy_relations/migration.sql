CREATE TYPE "DiplomacyRelationStatus" AS ENUM (
  'NEUTRAL',
  'ALLIED',
  'ENEMY',
  'WAR_PENDING',
  'WAR',
  'PEACE_PENDING'
);

CREATE TABLE "DiplomacyRelation" (
  "id" TEXT NOT NULL,
  "cycleId" TEXT NOT NULL,
  "fortressAId" TEXT NOT NULL,
  "fortressBId" TEXT NOT NULL,
  "status" "DiplomacyRelationStatus" NOT NULL DEFAULT 'NEUTRAL',
  "warDeclaredById" TEXT,
  "warDeclaredAt" TIMESTAMP(3),
  "warStartsAt" TIMESTAMP(3),
  "peaceProposedById" TEXT,
  "peaceProposedAt" TIMESTAMP(3),
  "collateralGold" INTEGER NOT NULL DEFAULT 0,
  "collateralFood" INTEGER NOT NULL DEFAULT 0,
  "collateralArmy" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "DiplomacyRelation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DiplomacyRelation_cycleId_fortressAId_fortressBId_key" ON "DiplomacyRelation"("cycleId", "fortressAId", "fortressBId");
CREATE INDEX "DiplomacyRelation_cycleId_status_idx" ON "DiplomacyRelation"("cycleId", "status");
CREATE INDEX "DiplomacyRelation_fortressAId_idx" ON "DiplomacyRelation"("fortressAId");
CREATE INDEX "DiplomacyRelation_fortressBId_idx" ON "DiplomacyRelation"("fortressBId");

ALTER TABLE "DiplomacyRelation" ADD CONSTRAINT "DiplomacyRelation_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "Cycle"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DiplomacyRelation" ADD CONSTRAINT "DiplomacyRelation_fortressAId_fkey" FOREIGN KEY ("fortressAId") REFERENCES "Fortress"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DiplomacyRelation" ADD CONSTRAINT "DiplomacyRelation_fortressBId_fkey" FOREIGN KEY ("fortressBId") REFERENCES "Fortress"("id") ON DELETE CASCADE ON UPDATE CASCADE;
