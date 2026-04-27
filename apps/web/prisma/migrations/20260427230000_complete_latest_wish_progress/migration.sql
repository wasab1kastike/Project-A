WITH latest_history AS (
  SELECT "id", "winnerRequestId"
  FROM "CycleHistory"
  ORDER BY "endedAt" DESC
  LIMIT 1
)
UPDATE "WinnerRequest"
SET "fulfillmentProgress" = 100
WHERE "id" = (
  SELECT "winnerRequestId"
  FROM latest_history
  WHERE "winnerRequestId" IS NOT NULL
);

WITH latest_history AS (
  SELECT "id", "communityWishProposalId", "communityWishStatus"
  FROM "CycleHistory"
  ORDER BY "endedAt" DESC
  LIMIT 1
)
UPDATE "CycleHistory"
SET "communityWishFulfillmentProgress" = 100
WHERE "id" = (
  SELECT "id"
  FROM latest_history
  WHERE "communityWishProposalId" IS NOT NULL
    AND "communityWishStatus" = 'RESOLVED'
);
