import type { SeasonFiveFishRarity } from "@/lib/prisma-client";
import { addMinutes, floorToMinute } from "./time";

export type SeasonFivePlannedCatch = {
  speciesKey: string;
  speciesName: string;
  rarity: SeasonFiveFishRarity;
  weightGrams: number;
  inventorySlots: number;
};

export function formatSeasonFiveFishWeight(weightGrams: number) {
  const grams = Math.max(0, Math.round(weightGrams));
  const kilograms = grams / 1000;

  if (grams === 0) return "0 kg";
  if (kilograms < 20) return `${kilograms.toFixed(1)} kg`;
  return `${Math.round(kilograms)} kg`;
}

export function getSeasonFiveInventoryPressure(input: {
  inventoryUsed: number;
  inventoryCapacity: number;
}) {
  const capacity = Math.max(1, input.inventoryCapacity);
  const used = Math.max(0, input.inventoryUsed);
  const remaining = Math.max(0, capacity - used);
  const percent = Math.min(100, Math.round((used / capacity) * 100));
  const full = used >= capacity;
  const closeToFull = !full && percent >= 75;
  const label = full
    ? "Full"
    : closeToFull
      ? "Tight"
      : percent === 0
        ? "Empty"
        : "Roomy";

  return {
    used,
    capacity,
    remaining,
    percent,
    full,
    closeToFull,
    label,
  };
}

export function planSeasonFivePassiveCatches<
  TCatch extends SeasonFivePlannedCatch,
>(input: {
  lastResolvedAt: Date;
  resolvedAt: Date;
  catchIntervalMinutes: number;
  inventoryUsed: number;
  inventoryCapacity: number;
  stockAvailable?: number;
  createCatch: (tickAt: Date) => TCatch | readonly TCatch[] | null;
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
  const stockAvailable =
    input.stockAvailable === undefined
      ? Number.POSITIVE_INFINITY
      : Math.max(0, input.stockAvailable);
  let stockUsed = 0;

  for (let offset = 1; offset <= minutesDue; offset += 1) {
    const tickAt = addMinutes(start, offset);
    const minuteIndex = Math.floor(tickAt.getTime() / 60_000);
    if (minuteIndex % catchIntervalMinutes !== 0) {
      continue;
    }

    const created = input.createCatch(tickAt);
    const fishForTick = Array.isArray(created)
      ? created
      : created
        ? [created]
        : [];
    if (fishForTick.length === 0) {
      continue;
    }

    const tickSlots = fishForTick.reduce(
      (sum, fish) => sum + fish.inventorySlots,
      0
    );
    if (inventoryUsed + tickSlots > inventoryCapacity) {
      break;
    }
    if (stockUsed + tickSlots > stockAvailable) {
      break;
    }

    inventoryUsed += tickSlots;
    stockUsed += tickSlots;
    for (const fish of fishForTick) {
      catches.push({ tickAt, fish });
    }
  }

  return {
    catches,
    inventoryUsed,
    inventoryCapacity,
    inventoryFull: inventoryUsed >= inventoryCapacity,
    stockUsed,
    stockAvailable,
    stockDepleted: stockUsed >= stockAvailable,
    nextResolvedAt: resolvedAt,
  };
}
