import type { SeasonFiveFishRarity } from "@/lib/prisma-client";
import { addMinutes, floorToMinute } from "./time";

export type SeasonFivePlannedCatch = {
  speciesKey: string;
  speciesName: string;
  rarity: SeasonFiveFishRarity;
  sizeCm: number;
  inventorySlots: number;
};

export function planSeasonFivePassiveCatches<
  TCatch extends SeasonFivePlannedCatch,
>(input: {
  lastResolvedAt: Date;
  resolvedAt: Date;
  catchIntervalMinutes: number;
  inventoryUsed: number;
  inventoryCapacity: number;
  createCatch: (tickAt: Date) => TCatch;
}) {
  const start = floorToMinute(input.lastResolvedAt);
  const resolvedAt = floorToMinute(input.resolvedAt);
  const catchIntervalMinutes = Math.max(1, input.catchIntervalMinutes);
  const inventoryCapacity = Math.max(0, input.inventoryCapacity);
  let inventoryUsed = Math.max(0, input.inventoryUsed);
  const minutesDue = Math.min(
    180,
    Math.max(0, Math.floor((resolvedAt.getTime() - start.getTime()) / 60_000))
  );
  const catches: Array<{ tickAt: Date; fish: TCatch }> = [];

  for (let offset = 1; offset <= minutesDue; offset += 1) {
    const tickAt = addMinutes(start, offset);
    const minuteIndex = Math.floor(tickAt.getTime() / 60_000);
    if (minuteIndex % catchIntervalMinutes !== 0) {
      continue;
    }

    const fish = input.createCatch(tickAt);
    if (inventoryUsed + fish.inventorySlots > inventoryCapacity) {
      break;
    }

    inventoryUsed += fish.inventorySlots;
    catches.push({ tickAt, fish });
  }

  return {
    catches,
    inventoryUsed,
    inventoryCapacity,
    inventoryFull: inventoryUsed >= inventoryCapacity,
    nextResolvedAt: resolvedAt,
  };
}
