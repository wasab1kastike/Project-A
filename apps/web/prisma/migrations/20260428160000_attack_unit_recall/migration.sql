ALTER TABLE "AttackUnit" ADD COLUMN "recalledAt" TIMESTAMP(3);
ALTER TABLE "AttackUnit" ADD COLUMN "returnOriginMapX" INTEGER;
ALTER TABLE "AttackUnit" ADD COLUMN "returnOriginMapY" INTEGER;

CREATE INDEX "AttackUnit_attackerFortressId_recalledAt_idx" ON "AttackUnit"("attackerFortressId", "recalledAt");
