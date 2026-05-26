-- AlterEnum
ALTER TYPE "ScoreEventType" ADD VALUE 'TRADE_DELIVERY';

-- AlterTable
ALTER TABLE "Fortress" ADD COLUMN "deliveredCargoValue" INTEGER NOT NULL DEFAULT 0;

-- CreateEnum
CREATE TYPE "TradeOfferStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED', 'CANCELED', 'EXPIRED', 'COMPLETED');

-- CreateEnum
CREATE TYPE "TradeLineItemKind" AS ENUM ('GOLD', 'FOOD', 'ARMY');

-- CreateEnum
CREATE TYPE "ConvoyLegStatus" AS ENUM ('IN_TRANSIT', 'DELIVERED', 'SEIZED', 'CANCELED');

-- CreateTable
CREATE TABLE "TradeOffer" (
    "id" TEXT NOT NULL,
    "cycleId" TEXT NOT NULL,
    "senderFortressId" TEXT NOT NULL,
    "receiverFortressId" TEXT NOT NULL,
    "status" "TradeOfferStatus" NOT NULL DEFAULT 'PENDING',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "rejectedAt" TIMESTAMP(3),
    "canceledAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TradeOffer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TradeLineItem" (
    "id" TEXT NOT NULL,
    "tradeOfferId" TEXT NOT NULL,
    "fromFortressId" TEXT NOT NULL,
    "toFortressId" TEXT NOT NULL,
    "kind" "TradeLineItemKind" NOT NULL,
    "amount" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TradeLineItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConvoyLeg" (
    "id" TEXT NOT NULL,
    "cycleId" TEXT NOT NULL,
    "tradeOfferId" TEXT NOT NULL,
    "fromFortressId" TEXT NOT NULL,
    "toFortressId" TEXT NOT NULL,
    "status" "ConvoyLegStatus" NOT NULL DEFAULT 'IN_TRANSIT',
    "gold" INTEGER NOT NULL DEFAULT 0,
    "food" INTEGER NOT NULL DEFAULT 0,
    "army" INTEGER NOT NULL DEFAULT 0,
    "baseCargoValue" INTEGER NOT NULL,
    "bonusGold" INTEGER NOT NULL DEFAULT 0,
    "bonusFood" INTEGER NOT NULL DEFAULT 0,
    "pointsAwarded" INTEGER NOT NULL DEFAULT 0,
    "departedAt" TIMESTAMP(3) NOT NULL,
    "arrivesAt" TIMESTAMP(3) NOT NULL,
    "settledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConvoyLeg_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TradeOffer_cycleId_status_expiresAt_idx" ON "TradeOffer"("cycleId", "status", "expiresAt");
CREATE INDEX "TradeOffer_senderFortressId_status_idx" ON "TradeOffer"("senderFortressId", "status");
CREATE INDEX "TradeOffer_receiverFortressId_status_idx" ON "TradeOffer"("receiverFortressId", "status");
CREATE INDEX "TradeLineItem_tradeOfferId_idx" ON "TradeLineItem"("tradeOfferId");
CREATE INDEX "ConvoyLeg_cycleId_status_arrivesAt_idx" ON "ConvoyLeg"("cycleId", "status", "arrivesAt");
CREATE INDEX "ConvoyLeg_tradeOfferId_status_idx" ON "ConvoyLeg"("tradeOfferId", "status");
CREATE INDEX "ConvoyLeg_fromFortressId_status_idx" ON "ConvoyLeg"("fromFortressId", "status");
CREATE INDEX "ConvoyLeg_toFortressId_status_idx" ON "ConvoyLeg"("toFortressId", "status");

-- AddForeignKey
ALTER TABLE "TradeOffer" ADD CONSTRAINT "TradeOffer_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "Cycle"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TradeOffer" ADD CONSTRAINT "TradeOffer_senderFortressId_fkey" FOREIGN KEY ("senderFortressId") REFERENCES "Fortress"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TradeOffer" ADD CONSTRAINT "TradeOffer_receiverFortressId_fkey" FOREIGN KEY ("receiverFortressId") REFERENCES "Fortress"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TradeLineItem" ADD CONSTRAINT "TradeLineItem_tradeOfferId_fkey" FOREIGN KEY ("tradeOfferId") REFERENCES "TradeOffer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ConvoyLeg" ADD CONSTRAINT "ConvoyLeg_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "Cycle"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ConvoyLeg" ADD CONSTRAINT "ConvoyLeg_tradeOfferId_fkey" FOREIGN KEY ("tradeOfferId") REFERENCES "TradeOffer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ConvoyLeg" ADD CONSTRAINT "ConvoyLeg_fromFortressId_fkey" FOREIGN KEY ("fromFortressId") REFERENCES "Fortress"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ConvoyLeg" ADD CONSTRAINT "ConvoyLeg_toFortressId_fkey" FOREIGN KEY ("toFortressId") REFERENCES "Fortress"("id") ON DELETE CASCADE ON UPDATE CASCADE;
