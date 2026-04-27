ALTER TABLE "WinnerRequest"
  ADD COLUMN "fulfillmentProgress" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "CycleHistory"
  ADD COLUMN "communityWishFulfillmentProgress" INTEGER NOT NULL DEFAULT 0;
