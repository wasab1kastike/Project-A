CREATE TYPE "ArcadeGameType" AS ENUM ('SLOTS', 'DICE', 'WHEEL');
CREATE TYPE "ArcadeTransactionKind" AS ENUM (
  'SEASON_PAYOUT',
  'GAME_RESULT',
  'LOOT_BOX_PURCHASE',
  'LOOT_BOX_OPEN',
  'LOOT_BOX_DUPLICATE_REFUND'
);
CREATE TYPE "ArcadeLootBoxType" AS ENUM ('UNIT', 'FORTRESS');
CREATE TYPE "ArcadeCosmeticSlot" AS ENUM ('UNIT', 'FORTRESS');

CREATE TABLE "ArcadeWallet" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "balance" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ArcadeWallet_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ArcadeWallet_userId_key" ON "ArcadeWallet"("userId");
CREATE INDEX "ArcadeWallet_balance_idx" ON "ArcadeWallet"("balance");

ALTER TABLE "ArcadeWallet"
  ADD CONSTRAINT "ArcadeWallet_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "ArcadeTransaction" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "cycleId" TEXT,
  "kind" "ArcadeTransactionKind" NOT NULL,
  "gameType" "ArcadeGameType",
  "amount" INTEGER NOT NULL,
  "balanceAfter" INTEGER NOT NULL,
  "summary" TEXT NOT NULL,
  "details" TEXT,
  "dedupeKey" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ArcadeTransaction_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ArcadeTransaction_dedupeKey_key"
  ON "ArcadeTransaction"("dedupeKey");
CREATE INDEX "ArcadeTransaction_userId_createdAt_idx"
  ON "ArcadeTransaction"("userId", "createdAt");
CREATE INDEX "ArcadeTransaction_cycleId_createdAt_idx"
  ON "ArcadeTransaction"("cycleId", "createdAt");

ALTER TABLE "ArcadeTransaction"
  ADD CONSTRAINT "ArcadeTransaction_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ArcadeTransaction"
  ADD CONSTRAINT "ArcadeTransaction_cycleId_fkey"
  FOREIGN KEY ("cycleId") REFERENCES "Cycle"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "ArcadeLootBoxPurchase" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "crateType" "ArcadeLootBoxType" NOT NULL,
  "price" INTEGER NOT NULL,
  "openedAt" TIMESTAMP(3),
  "rewardSlot" "ArcadeCosmeticSlot",
  "rewardVariant" TEXT,
  "duplicatePayout" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ArcadeLootBoxPurchase_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ArcadeLootBoxPurchase_userId_createdAt_idx"
  ON "ArcadeLootBoxPurchase"("userId", "createdAt");
CREATE INDEX "ArcadeLootBoxPurchase_userId_openedAt_idx"
  ON "ArcadeLootBoxPurchase"("userId", "openedAt");

ALTER TABLE "ArcadeLootBoxPurchase"
  ADD CONSTRAINT "ArcadeLootBoxPurchase_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "ArcadeCosmeticUnlock" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "slot" "ArcadeCosmeticSlot" NOT NULL,
  "variant" TEXT NOT NULL,
  "sourcePurchaseId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ArcadeCosmeticUnlock_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ArcadeCosmeticUnlock_sourcePurchaseId_key"
  ON "ArcadeCosmeticUnlock"("sourcePurchaseId");
CREATE UNIQUE INDEX "ArcadeCosmeticUnlock_userId_slot_variant_key"
  ON "ArcadeCosmeticUnlock"("userId", "slot", "variant");
CREATE INDEX "ArcadeCosmeticUnlock_userId_slot_idx"
  ON "ArcadeCosmeticUnlock"("userId", "slot");

ALTER TABLE "ArcadeCosmeticUnlock"
  ADD CONSTRAINT "ArcadeCosmeticUnlock_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ArcadeCosmeticUnlock"
  ADD CONSTRAINT "ArcadeCosmeticUnlock_sourcePurchaseId_fkey"
  FOREIGN KEY ("sourcePurchaseId") REFERENCES "ArcadeLootBoxPurchase"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
