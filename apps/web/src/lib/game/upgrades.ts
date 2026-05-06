/**
 * Fortress Upgrade System
 *
 * This module manages fortress level-up mechanics:
 * - Upgrade cost calculations (points required)
 * - Upgrade duration calculations (time required)
 * - Growth rate calculations (points per tick)
 * - Attack damage calculations (power per attack)
 * - Simultaneous attack limits (varies by race)
 *
 * FORTRESS LEVELS: 0-8 (9 levels total, displayed as 1-9)
 *
 * UPGRADE PROGRESSION:
 * ===================
 * Level 0->1: 500 points, 15 minutes
 * Level 1->2: 1500 points, 30 minutes
 * Level 2->3: 3000 points, 45 minutes
 * Level 3->4: 5000 points, 60 minutes
 * Level 4->5: 7500 points, 75 minutes
 * Level 5->6: 10500 points, 90 minutes
 * Level 6->7: 14000 points, 105 minutes
 * Level 7->8: 18000 points, 120 minutes
 * Level 8->9: 22500 points, 135 minutes
 *
 * Total to Max: 82,000 points (max level is 9)
 *
 * GROWTH RATE (points per tick):
 * ==============================
 * Fortresses produce "growth" points each tick when in GROW mode.
 * Growth = 1 (base) + level (scaling)
 *
 * Level 0: 1 point/tick
 * Level 1: 2 points/tick
 * Level 8: 9 points/tick
 * Level 9: 10 points/tick
 *
 * ATTACK DAMAGE (power per attack):
 * ==================================
 * Each attack deals damage proportional to fortress level.
 * Damage = 2 (base) + level * 2 (scaling)
 *
 * Level 0: 2 damage/attack
 * Level 1: 4 damage/attack
 * Level 8: 18 damage/attack
 * Level 9: 20 damage/attack
 *
 * SIMULTANEOUS ATTACKS LIMIT:
 * ============================
 * Maximum concurrent outbound attacks scales with level and race:
 *
 * Default (DWARFS, UNSTABLE_UNICORNS, ORKS):
 *   Limit = 2 (base) + level
 *   Level 0: 2 attacks
 *   Level 5: 7 attacks
 *   Level 9: 11 attacks
 *
 * SPACE_MURINES (race-specific buff):
 *   Limit = 2 (base) + level * 2
 *   Level 0: 2 attacks
 *   Level 5: 12 attacks
 *   Level 9: 20 attacks
 *
 * All calculations use pure functions and return deterministic results.
 */

import {
  BASE_FORTRESS_ATTACK_DAMAGE,
  BASE_FORTRESS_GROWTH,
  FORTRESS_ATTACK_DAMAGE_PER_LEVEL,
  FORTRESS_GROWTH_PER_LEVEL,
  FORTRESS_LEVEL_UP_COSTS,
  FORTRESS_UPGRADE_BASE_MINUTES,
  MAX_FORTRESS_LEVEL,
  MAX_SIMULTANEOUS_ATTACKS_BASE,
} from "./constants";
import type { FortressRace } from "./races";

/**
 * Get the gold/points cost to upgrade a fortress from the given level to the next level.
 *
 * @param level - Current fortress database level (0-8)
 * @returns Points cost, or null if already at max level
 *
 * Example: getFortressUpgradeCost(0) => 500 (to go from level 0 to 1)
 */
export function getFortressUpgradeCost(level: number) {
  return FORTRESS_LEVEL_UP_COSTS[level] ?? null;
}

/**
 * Get the duration in minutes to upgrade a fortress from the given level.
 *
 * Formula: (level + 1) * 15 minutes
 *
 * @param level - Current fortress database level (0-8)
 * @returns Upgrade duration in minutes
 *
 * Example: getFortressUpgradeDurationMinutes(0) => 15 (0+1)*15
 * Example: getFortressUpgradeDurationMinutes(8) => 135 (8+1)*15
 */
export function getFortressUpgradeDurationMinutes(level: number) {
  return (level + 1) * FORTRESS_UPGRADE_BASE_MINUTES;
}

/**
 * Get the growth points produced per tick when fortress is in GROW mode.
 *
 * Formula: 1 (base) + level * 1
 *
 * @param level - Current fortress database level (0-8)
 * @returns Growth points per tick
 *
 * Example: getFortressGrowGain(0) => 1
 * Example: getFortressGrowGain(8) => 9
 */
export function getFortressGrowGain(level: number) {
  return BASE_FORTRESS_GROWTH + level * FORTRESS_GROWTH_PER_LEVEL;
}

/**
 * Get the attack damage dealt by a fortress at the given level.
 *
 * Formula: 2 (base) + level * 2
 *
 * Used for calculating attack unit strength in combat.
 *
 * @param level - Current fortress database level (0-8)
 * @returns Attack damage per unit
 *
 * Example: getFortressAttackDamage(0) => 2
 * Example: getFortressAttackDamage(8) => 18
 */
export function getFortressAttackDamage(level: number) {
  return BASE_FORTRESS_ATTACK_DAMAGE + level * FORTRESS_ATTACK_DAMAGE_PER_LEVEL;
}

/**
 * Check if a fortress can level up from the given level.
 *
 * @param level - Current fortress database level
 * @returns true if level < MAX_FORTRESS_LEVEL (9)
 */
export function canFortressLevelUp(level: number) {
  return level < MAX_FORTRESS_LEVEL;
}

/**
 * Get the maximum number of simultaneous outbound attacks for a fortress.
 *
 * Formula (default races):
 *   2 (base) + level
 *
 * Formula (SPACE_MURINES):
 *   2 (base) + level * 2
 *
 * @param level - Current fortress database level (0-8)
 * @param race - Fortress race (affects multiplier for SPACE_MURINES)
 * @returns Maximum simultaneous attacks
 *
 * Example: getMaxSimultaneousAttacks(0, null) => 2
 * Example: getMaxSimultaneousAttacks(5, null) => 7
 * Example: getMaxSimultaneousAttacks(5, "SPACE_MURINES") => 12
 */
export function getMaxSimultaneousAttacks(
  level: number,
  race?: FortressRace | null
): number {
  if (race === "SPACE_MURINES") {
    return MAX_SIMULTANEOUS_ATTACKS_BASE + 2 * level;
  }

  return MAX_SIMULTANEOUS_ATTACKS_BASE + level;
}
