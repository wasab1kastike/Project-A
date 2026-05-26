-- AlterTable
ALTER TABLE "ConvoyLeg" ADD COLUMN "deedTileId" TEXT;
ALTER TABLE "ConvoyLeg" ADD COLUMN "deedSettledAt" TIMESTAMP(3);
ALTER TABLE "ConvoyLeg" ADD COLUMN "deedFailureReason" TEXT;

-- AlterTable
ALTER TABLE "TradeLineItem" ALTER COLUMN "amount" DROP NOT NULL;
ALTER TABLE "TradeLineItem" ADD COLUMN "tileId" TEXT;
