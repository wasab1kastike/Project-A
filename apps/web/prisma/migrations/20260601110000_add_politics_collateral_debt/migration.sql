ALTER TABLE "DiplomacyRelation"
  ADD COLUMN "collateralDebtFortressId" TEXT,
  ADD COLUMN "collateralDebtGold" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "collateralDebtFood" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "collateralDebtArmy" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "collateralDebtRecordedAt" TIMESTAMP(3);

CREATE INDEX "DiplomacyRelation_collateralDebtFortressId_idx"
  ON "DiplomacyRelation"("collateralDebtFortressId");
