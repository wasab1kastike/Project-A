import { RaceAbilityKind, UnicornShatteredRealityOutcome } from "@/lib/prisma-client";
import { addHours } from "./time";

export const UNICORN_SHATTERED_REALITY_EFFECT_HOURS = 1;
export const UNICORN_SHATTERED_REALITY_COMBAT_MULTIPLIER = 1.25;
export const UNICORN_SHATTERED_REALITY_ECONOMY_MULTIPLIER = 1.5;

export const UNICORN_SHATTERED_REALITY_OUTCOMES = [
  UnicornShatteredRealityOutcome.MIRROR_HOST,
  UnicornShatteredRealityOutcome.PRISMATIC_SURGE,
  UnicornShatteredRealityOutcome.LUCKY_GALLOP,
] as const;

export function rollUnicornShatteredReality(value = Math.random()) {
  const normalized = Math.min(0.999999, Math.max(0, value));
  const index = Math.floor(
    normalized * UNICORN_SHATTERED_REALITY_OUTCOMES.length
  );

  return UNICORN_SHATTERED_REALITY_OUTCOMES[index];
}

export function getUnicornShatteredRealityActiveUntil(now: Date) {
  return addHours(now, UNICORN_SHATTERED_REALITY_EFFECT_HOURS);
}

export function getUnicornShatteredRealityOutcomeLabel(
  outcome: UnicornShatteredRealityOutcome | string
) {
  if (outcome === UnicornShatteredRealityOutcome.MIRROR_HOST) {
    return "Mirror Host";
  }

  if (outcome === UnicornShatteredRealityOutcome.PRISMATIC_SURGE) {
    return "Prismatic Surge";
  }

  if (outcome === UnicornShatteredRealityOutcome.LUCKY_GALLOP) {
    return "Lucky Gallop";
  }

  return String(outcome).replaceAll("_", " ");
}

export function getUnicornShatteredRealityTimedKind(
  outcome: UnicornShatteredRealityOutcome
) {
  if (outcome === UnicornShatteredRealityOutcome.PRISMATIC_SURGE) {
    return RaceAbilityKind.UNICORN_COMBAT_SURGE;
  }

  if (outcome === UnicornShatteredRealityOutcome.LUCKY_GALLOP) {
    return RaceAbilityKind.UNICORN_ECONOMY_SURGE;
  }

  return null;
}
