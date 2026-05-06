/**
 * Castle Production System
 *
 * This module manages fortress economic production calculations:
 * - Gold production from miners (1 per miner + race bonuses)
 * - Food production from farmers (1 per farmer + race bonuses)
 * - Army production from recruiters (limited by food availability)
 *
 * Production formulas use worker assignments and specialization multipliers.
 * All calculations are pure functions that return deterministic results.
 *
 * Formula Summary:
 * ===============
 * Population = 25 + level*10 + race_bonus
 *
 * Base Gold = miners + floor(miners/10)*race_gold_bonus
 * Gold Produced = floor(Base Gold * specialization_multiplier)
 *
 * Base Food = farmers + floor(farmers/10)*race_food_bonus
 * Food Produced = floor(Base Food * specialization_multiplier)
 *
 * Base Army Requested = recruiters + floor(recruiters/10)*race_army_bonus
 * Army Requested = floor(Base Army * specialization_multiplier)
 * Army Produced = min(Army Requested, floor((current_food + food_produced) / food_cost))
 *
 * Race Modifiers:
 * ===============
 * DWARFS: +10% defense, +1 gold per 10 miners
 * UNSTABLE_UNICORNS: +2 population, +1 food per 10 farmers
 * SPACE_MURINES: +5% defense, +1 army per 10 recruiters
 * ORKS: +1 army per 10 recruiters, +6 carry capacity per survivor
 *
 * Specialization Multipliers:
 * ===========================
 * Each specialization level adds +10%
 * - POINTS: multiplies gold production
 * - FOOD: multiplies food production
 * - MILITARY: multiplies army production
 * - DEFENSE: adds to defense percentage directly
 *
 * Usage:
 * ======
 * For production calculations, use calculateTickProduction() from balance.ts
 * This module re-exports relevant types and provides documentation.
 */

export {
  calculateTickProduction,
  getFortressPopulation,
  getDefenseBonusPercent,
  getFortressDefenseMultiplier,
  getEffectiveDefendingArmy,
  validateWorkerAssignments,
  assertWorkerAssignments,
  type WorkerAssignmentLike,
  type FortressEconomyLike,
  type TickProductionResult,
  // Constants
  BASE_POPULATION,
  POPULATION_PER_DB_LEVEL,
  GOLD_PER_MINER,
  FOOD_PER_FARMER,
  ARMY_PER_RECRUITER,
  FOOD_COST_PER_ARMY,
  DEFENSE_BONUS_PER_DISPLAYED_LEVEL,
} from "./balance";
