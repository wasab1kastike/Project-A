import type {
  SeasonFiveCharacterClass,
  SeasonFiveFishRarity,
} from "@/lib/prisma-client";

export type SeasonFiveMostFishCandidate = {
  id: string;
  name: string;
  class: SeasonFiveCharacterClass;
  totalFishCaught: number;
  biggestFishGrams: number;
  createdAt?: Date;
};

export type SeasonFiveBiggestCatchCandidate = {
  id: string;
  speciesName: string;
  rarity: SeasonFiveFishRarity;
  weightGrams: number;
  caughtAt: Date;
  character: SeasonFiveMostFishCandidate;
  location?: {
    name: string;
  } | null;
};

export function rankSeasonFiveMostFish(
  rows: SeasonFiveMostFishCandidate[],
  limit = 10
) {
  return rows
    .toSorted((left, right) => {
      const fishDelta = right.totalFishCaught - left.totalFishCaught;
      if (fishDelta !== 0) return fishDelta;

      const weightDelta = right.biggestFishGrams - left.biggestFishGrams;
      if (weightDelta !== 0) return weightDelta;

      const joinedDelta =
        (left.createdAt?.getTime() ?? 0) - (right.createdAt?.getTime() ?? 0);
      if (joinedDelta !== 0) return joinedDelta;

      const nameDelta = left.name.localeCompare(right.name);
      if (nameDelta !== 0) return nameDelta;

      return left.id.localeCompare(right.id);
    })
    .slice(0, limit);
}

export function rankSeasonFiveBiggestFish(
  catches: SeasonFiveBiggestCatchCandidate[],
  limit = 10
) {
  const rankedCatches = catches.toSorted((left, right) => {
    const weightDelta = right.weightGrams - left.weightGrams;
    if (weightDelta !== 0) return weightDelta;

    const caughtDelta = left.caughtAt.getTime() - right.caughtAt.getTime();
    if (caughtDelta !== 0) return caughtDelta;

    const fishDelta =
      right.character.totalFishCaught - left.character.totalFishCaught;
    if (fishDelta !== 0) return fishDelta;

    const nameDelta = left.character.name.localeCompare(right.character.name);
    if (nameDelta !== 0) return nameDelta;

    return left.id.localeCompare(right.id);
  });
  const seenCharacters = new Set<string>();
  const winners: SeasonFiveBiggestCatchCandidate[] = [];

  for (const fishCatch of rankedCatches) {
    if (seenCharacters.has(fishCatch.character.id)) {
      continue;
    }

    seenCharacters.add(fishCatch.character.id);
    winners.push(fishCatch);

    if (winners.length >= limit) {
      break;
    }
  }

  return winners.map((fishCatch) => ({
    id: fishCatch.character.id,
    name: fishCatch.character.name,
    class: fishCatch.character.class,
    totalFishCaught: fishCatch.character.totalFishCaught,
    biggestFishGrams: fishCatch.weightGrams,
    catchId: fishCatch.id,
    speciesName: fishCatch.speciesName,
    rarity: fishCatch.rarity,
    caughtAt: fishCatch.caughtAt,
    locationName: fishCatch.location?.name ?? null,
  }));
}
