-- Add score points as first-class convoy cargo.
ALTER TYPE "TradeLineItemKind" ADD VALUE 'POINTS';

ALTER TABLE "ConvoyLeg"
  ADD COLUMN "points" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "stolenPoints" INTEGER NOT NULL DEFAULT 0;
