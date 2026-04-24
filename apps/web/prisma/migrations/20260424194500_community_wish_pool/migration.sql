CREATE TYPE "CommunityWishStatus" AS ENUM ('OPEN', 'RESOLVED', 'TIE_REQUIRES_ADMIN', 'NO_PROPOSALS');

CREATE TABLE "CommunityWishProposal" (
  "id" TEXT NOT NULL,
  "cycleId" TEXT NOT NULL,
  "authorId" TEXT NOT NULL,
  "requestText" TEXT NOT NULL,
  "status" "WinnerRequestStatus" NOT NULL DEFAULT 'SUBMITTED',
  "reviewNotes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "CommunityWishProposal_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CommunityWishVote" (
  "id" TEXT NOT NULL,
  "proposalId" TEXT NOT NULL,
  "voterId" TEXT NOT NULL,
  "votes" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "CommunityWishVote_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CommunityWishVoteEntitlement" (
  "id" TEXT NOT NULL,
  "cycleId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "rank" INTEGER NOT NULL,
  "voteBudget" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "CommunityWishVoteEntitlement_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "CycleHistory"
ADD COLUMN "communityWishProposalId" TEXT,
ADD COLUMN "communityWishSnapshot" TEXT,
ADD COLUMN "communityWishVoteCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "communityWishStatus" "CommunityWishStatus" NOT NULL DEFAULT 'NO_PROPOSALS',
ADD COLUMN "communityWishVotingEndsAt" TIMESTAMP(3),
ADD COLUMN "communityWishResolvedAt" TIMESTAMP(3),
ADD COLUMN "communityWishResolvedById" TEXT;

UPDATE "CycleHistory"
SET "communityWishStatus" = 'NO_PROPOSALS',
    "communityWishResolvedAt" = COALESCE("createdAt", "endedAt")
WHERE "communityWishVotingEndsAt" IS NULL;

CREATE UNIQUE INDEX "CommunityWishProposal_cycleId_authorId_key" ON "CommunityWishProposal"("cycleId", "authorId");
CREATE INDEX "CommunityWishProposal_cycleId_createdAt_idx" ON "CommunityWishProposal"("cycleId", "createdAt");
CREATE UNIQUE INDEX "CommunityWishVote_proposalId_voterId_key" ON "CommunityWishVote"("proposalId", "voterId");
CREATE INDEX "CommunityWishVote_voterId_idx" ON "CommunityWishVote"("voterId");
CREATE UNIQUE INDEX "CommunityWishVoteEntitlement_cycleId_userId_key" ON "CommunityWishVoteEntitlement"("cycleId", "userId");
CREATE INDEX "CommunityWishVoteEntitlement_userId_idx" ON "CommunityWishVoteEntitlement"("userId");
CREATE UNIQUE INDEX "CycleHistory_communityWishProposalId_key" ON "CycleHistory"("communityWishProposalId");
CREATE INDEX "CycleHistory_communityWishStatus_communityWishVotingEndsAt_idx" ON "CycleHistory"("communityWishStatus", "communityWishVotingEndsAt");
CREATE INDEX "CycleHistory_communityWishResolvedById_idx" ON "CycleHistory"("communityWishResolvedById");

ALTER TABLE "CommunityWishProposal" ADD CONSTRAINT "CommunityWishProposal_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "Cycle"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CommunityWishProposal" ADD CONSTRAINT "CommunityWishProposal_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CommunityWishVote" ADD CONSTRAINT "CommunityWishVote_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "CommunityWishProposal"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CommunityWishVote" ADD CONSTRAINT "CommunityWishVote_voterId_fkey" FOREIGN KEY ("voterId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CommunityWishVoteEntitlement" ADD CONSTRAINT "CommunityWishVoteEntitlement_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "Cycle"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CommunityWishVoteEntitlement" ADD CONSTRAINT "CommunityWishVoteEntitlement_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CycleHistory" ADD CONSTRAINT "CycleHistory_communityWishProposalId_fkey" FOREIGN KEY ("communityWishProposalId") REFERENCES "CommunityWishProposal"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CycleHistory" ADD CONSTRAINT "CycleHistory_communityWishResolvedById_fkey" FOREIGN KEY ("communityWishResolvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
