ALTER TYPE "DiplomacyRelationStatus" ADD VALUE IF NOT EXISTS 'ALLIANCE_PENDING';

ALTER TABLE "DiplomacyRelation"
  ADD COLUMN "allianceProposedById" TEXT,
  ADD COLUMN "allianceProposedAt" TIMESTAMP(3),
  ADD COLUMN "allianceTrustTier" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "allianceEscrowGoldEach" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "allianceEscrowFoodEach" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "trustUpgradeProposedById" TEXT,
  ADD COLUMN "trustUpgradeProposedAt" TIMESTAMP(3),
  ADD COLUMN "trustUpgradeTier" INTEGER,
  ADD COLUMN "betrayedById" TEXT,
  ADD COLUMN "betrayedAt" TIMESTAMP(3),
  ADD COLUMN "casusBelliFortressId" TEXT,
  ADD COLUMN "casusBelliExpiresAt" TIMESTAMP(3);
