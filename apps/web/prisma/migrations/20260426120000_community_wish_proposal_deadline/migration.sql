ALTER TYPE "CommunityWishStatus" ADD VALUE IF NOT EXISTS 'PROPOSALS_OPEN';

ALTER TABLE "CycleHistory"
  ADD COLUMN "communityWishProposalEndsAt" TIMESTAMP(3);

CREATE INDEX "CycleHistory_communityWishStatus_communityWishProposalEndsAt_idx"
  ON "CycleHistory"("communityWishStatus", "communityWishProposalEndsAt");
