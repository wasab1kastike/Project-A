-- Rename Season 5 fish measurements from centimeters to gram-backed weights.
ALTER TABLE "SeasonFiveCharacter" RENAME COLUMN "biggestFishCm" TO "biggestFishGrams";
ALTER TABLE "SeasonFiveFishingLocation" RENAME COLUMN "minFishCm" TO "minWeightGrams";
ALTER TABLE "SeasonFiveFishingLocation" RENAME COLUMN "maxFishCm" TO "maxWeightGrams";
ALTER TABLE "SeasonFiveFishCatch" RENAME COLUMN "sizeCm" TO "weightGrams";
ALTER TABLE "SeasonFiveFishingWaterBody" RENAME COLUMN "minFishCm" TO "minWeightGrams";
ALTER TABLE "SeasonFiveFishingWaterBody" RENAME COLUMN "maxFishCm" TO "maxWeightGrams";

ALTER INDEX IF EXISTS "SeasonFiveCharacter_cycleId_biggestFishCm_idx" RENAME TO "SeasonFiveCharacter_cycleId_biggestFishGrams_idx";
ALTER INDEX IF EXISTS "SeasonFiveFishCatch_cycleId_sizeCm_idx" RENAME TO "SeasonFiveFishCatch_cycleId_weightGrams_idx";

UPDATE "SeasonFiveCharacter"
SET "biggestFishGrams" = "biggestFishGrams" * 100
WHERE "biggestFishGrams" > 0;

UPDATE "SeasonFiveFishingLocation"
SET
  "minWeightGrams" = "minWeightGrams" * 100,
  "maxWeightGrams" = "maxWeightGrams" * 100;

UPDATE "SeasonFiveFishingWaterBody"
SET
  "minWeightGrams" = "minWeightGrams" * 100,
  "maxWeightGrams" = "maxWeightGrams" * 100;

UPDATE "SeasonFiveFishCatch"
SET "weightGrams" = "weightGrams" * 100
WHERE "weightGrams" > 0;
