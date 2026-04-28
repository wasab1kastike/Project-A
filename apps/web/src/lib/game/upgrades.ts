import {
  BASE_FORTRESS_ATTACK_DAMAGE,
  BASE_FORTRESS_GROWTH,
  FORTRESS_ATTACK_DAMAGE_PER_LEVEL,
  FORTRESS_GROWTH_PER_LEVEL,
  FORTRESS_LEVEL_UP_COSTS,
  MAX_FORTRESS_LEVEL,
  MAX_SIMULTANEOUS_ATTACKS_BASE,
} from "./constants";
import type { FortressRace } from "./races";

export function getFortressUpgradeCost(level: number) {
  return FORTRESS_LEVEL_UP_COSTS[level] ?? null;
}

export function getFortressGrowGain(level: number) {
  return BASE_FORTRESS_GROWTH + level * FORTRESS_GROWTH_PER_LEVEL;
}

export function getFortressAttackDamage(level: number) {
  return BASE_FORTRESS_ATTACK_DAMAGE + level * FORTRESS_ATTACK_DAMAGE_PER_LEVEL;
}

export function canFortressLevelUp(level: number) {
  return level < MAX_FORTRESS_LEVEL;
}

export function getMaxSimultaneousAttacks(
  level: number,
  race?: FortressRace | null
): number {
  if (race === "SPACE_MURINES") {
    return MAX_SIMULTANEOUS_ATTACKS_BASE + 2 * level;
  }

  return MAX_SIMULTANEOUS_ATTACKS_BASE + level;
}
