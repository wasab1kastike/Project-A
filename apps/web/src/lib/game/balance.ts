/**
 * Balance Module - Core Game Calculation Engine
 *
 * This module contains all deterministic calculations for fortress gameplay:
 * - Economic production (gold, food, army)
 * - Population management and worker assignments
 * - Defense bonuses and fortress strength
 * - Combat outcomes and raid calculations
 * - Casualty rates and loot distribution
 *
 * All functions are pure (no side effects) and return the same result for identical inputs.
 * This allows calculations to be used consistently across the game loop, UI, and tests.
 *
 * The balance module is intentionally separate from:
 * - Database models (Prisma schema)
 * - Game loop logic (tick.ts)
 * - Network operations (service.ts)
 *
 * This separation ensures balance calculations can be tested independently
 * and reused across server and client code.
 */

import { GameError } from "./errors";
import { getRaceModifiers, type FortressRace } from "./races";
import {
  EMPTY_CASTLE_SPECIALIZATION_COUNTS,
  getCastleSpecializationMultiplier,
  type CastleSpecializationCounts,
} from "./specializations";
import { CastleUpgradeSpecialization } from "@/lib/prisma-client";

// ============================================================================
// PRODUCTION CONSTANTS
// ============================================================================
// These constants define the base rates for fortress economic production.
// They are the foundation for all gold, food, and army production calculations.

/** Base population available for worker assignment */
export const BASE_POPULATION = 25;
/** Population bonus per fortress database level */
export const POPULATION_PER_DB_LEVEL = 10;
/** Gold produced per miner (before race/specialization bonuses) */
export const GOLD_PER_MINER = 1;
/** Food produced per farmer (before race/specialization bonuses) */
export const FOOD_PER_FARMER = 1;
/** Army produced per recruiter (before race/specialization bonuses) */
export const ARMY_PER_RECRUITER = 1;
/** Food cost to produce and maintain one army unit */
export const FOOD_COST_PER_ARMY = 1;

// ============================================================================
// DEFENSE CONSTANTS
// ============================================================================

/** Defense bonus per displayed fortress level (0.1 = 10% per level) */
export const DEFENSE_BONUS_PER_DISPLAYED_LEVEL = 0.1;

// ============================================================================
// COMBAT CONSTANTS
// ============================================================================
// These constants define casualty rates and loot mechanics in combat.

/** Casualty rate when defender wins: 35% (65% survive) */
export const FAILED_ATTACK_DEFENDER_CASUALTY_FACTOR = 0.35;
/** Base survival rate for attacker when winning (15% base) */
export const WINNING_ATTACKER_BASE_SURVIVAL_FACTOR = 0.15;
/** Survival bonus per point of attack power margin (85% of margin survives) */
export const WINNING_ATTACKER_MARGIN_SURVIVAL_FACTOR = 0.85;
/** Rate at which victorious attackers retire (50%) instead of returning home */
// Retirement rate removed - all survivors now return home
/** Loss rate for defender when attacker wins (70%) */
export const DEFENDER_LOSS_RATE_ON_ATTACKER_WIN = 0.7;
/** Loot carrying capacity per surviving attacker (before race bonuses) */
export const CARRY_CAPACITY_PER_SURVIVOR = 8;
/** Ork-specific bonus: extra carry capacity for "Stronger Together" ability */
export const ORK_STRONGER_TOGETHER_RATE = 0.15;
/** Maximum loot percentage: 70% of defender's gold can be looted */
export const MAX_POINT_LOOT_PERCENT = 0.7;
/** Maximum loot percentage: 70% of defender's food can be looted */
export const MAX_FOOD_LOOT_PERCENT = 0.7;

// ============================================================================
// PRODUCTION & FORTRESS STATE TYPES
// ============================================================================

/** Fortress-like object with enough data to calculate production */
export type WorkerAssignmentLike = {
  level: number;
  race?: FortressRace | null;
  castleSpecializations?: Partial<CastleSpecializationCounts>;
  minersAssigned: number;
  farmersAssigned: number;
  recruitersAssigned: number;
};

/** Extended fortress state including current food for production calculations */
export type FortressEconomyLike = WorkerAssignmentLike & {
  food: number;
};

// ============================================================================
// COMBAT INPUT & OUTPUT TYPES
// ============================================================================

/** Input parameters for calculating raid/attack outcomes */
export type RaidOutcomeInput = {
  attackArmy: number;
  attackerRace?: FortressRace | null;
  defenderArmy: number;
  defenderDbLevel: number;
  defenderHasCastle?: boolean;
  defenderRace?: FortressRace | null;
  defenderCastleSpecializations?: Partial<CastleSpecializationCounts>;
  attackPowerMultiplier?: number;
  defensePowerMultiplier?: number;
  preventAttackerCasualties?: boolean;
  preventDefenderLosses?: boolean;
  carryCapacityMultiplier?: number;
  defenderGold?: number;
  /** @deprecated Use defenderGold. Kept for legacy tests and callers. */
  defenderPoints?: number;
  defenderFood: number;
};

/** Calculated outcome of a raid/attack */
export type RaidOutcome = {
  outcome: "ATTACKER_WIN" | "DEFENDER_WIN";
  attackPower: number;
  defensePower: number;
  defenseMultiplier: number;
  attackerSurvivors: number;
  attackerRetired: number;
  attackerReturned: number;
  defenderLosses: number;
  goldLooted: number;
  /** @deprecated AttackUnit still stores legacy pointsLooted for gold loot. */
  pointsLooted: number;
  foodLooted: number;
};

// ============================================================================
// PRODUCTION RESULT TYPE
// ============================================================================

/** Result of calculating fortress production for one game tick */
export type TickProductionResult = {
  /** Current fortress population available for worker assignment */
  population: number;
  /** Gold produced this tick (before race ability modifiers) */
  goldProduced: number;
  /** Food produced this tick (before race ability modifiers) */
  foodProduced: number;
  /** Army units requested based on recruiter assignments */
  armyRequested: number;
  /** Army units actually produced (limited by available food) */
  armyProduced: number;
  /** Food consumed by army production */
  foodConsumed: number;
  /** Food remaining after production and consumption */
  foodAfterProduction: number;
};

// ============================================================================
// HELPER FUNCTIONS - INTERNAL UTILITIES
// ============================================================================

function clampNonNegative(value: number) {
  return Math.max(0, value);
}

function clampInteger(value: number) {
  return Math.max(0, Math.floor(value));
}

function getSpecializationCount(
  counts: Partial<CastleSpecializationCounts> | undefined,
  specialization: CastleUpgradeSpecialization
) {
  return counts?.[specialization] ?? EMPTY_CASTLE_SPECIALIZATION_COUNTS[specialization];
}

// ============================================================================
// LOOT DISTRIBUTION
// ============================================================================

/**
 * Splits raid loot between gold and food based on available capacity.
 * Attempts to reach a 50/50 split but distributes excess capacity to
 * whichever resource has more available to loot.
 */
function splitRaidLoot({
  lootCapacity,
  goldLootCap,
  foodLootCap,
}: {
  lootCapacity: number;
  goldLootCap: number;
  foodLootCap: number;
}) {
  const halfGoldTarget = Math.ceil(lootCapacity / 2);
  const halfFoodTarget = Math.floor(lootCapacity / 2);

  let goldLooted = Math.min(goldLootCap, halfGoldTarget);
  let foodLooted = Math.min(foodLootCap, halfFoodTarget);
  let remainingCapacity = lootCapacity - goldLooted - foodLooted;

  while (remainingCapacity > 0) {
    const goldRemaining = goldLootCap - goldLooted;
    const foodRemaining = foodLootCap - foodLooted;

    if (goldRemaining <= 0 && foodRemaining <= 0) {
      break;
    }

    if (goldRemaining >= foodRemaining) {
      const extraGold = Math.min(remainingCapacity, Math.max(0, goldRemaining));
      goldLooted += extraGold;
      remainingCapacity -= extraGold;
      continue;
    }

    const extraFood = Math.min(remainingCapacity, Math.max(0, foodRemaining));
    foodLooted += extraFood;
    remainingCapacity -= extraFood;
  }

  return {
    goldLooted,
    foodLooted,
  };
}

// ============================================================================
// POPULATION & WORKFORCE CALCULATIONS
// ============================================================================

/**
 * Future buffs should adjust inputs or controlled modifiers in this module
 * instead of reimplementing the same formulas in combat, tick, or UI code.
 */
export function getDisplayedCastleLevel(dbLevel: number) {
  return dbLevel + 1;
}

/**
 * Calculates total fortress population available for worker assignment.
 *
 * Formula: BASE_POPULATION (25) + level*10 + race_population_bonus
 *
 * Race bonuses:
 * - DWARFS: +0
 * - UNSTABLE_UNICORNS: +2
 * - SPACE_MURINES: +0
 * - ORKS: +0
 */
export function getFortressPopulation(
  dbLevel: number,
  race?: FortressRace | null
) {
  return (
    BASE_POPULATION +
    dbLevel * POPULATION_PER_DB_LEVEL +
    getRaceModifiers(race).populationBonus
  );
}

// ============================================================================
// DEFENSE CALCULATIONS
// ============================================================================

/**
 * Calculates total defense bonus as a percentage.
 *
 * Formula: displayedLevel*0.1 + race_defense_bonus + defense_specializations*0.1
 *
 * Race bonuses:
 * - DWARFS: +10% (0.1)
 * - UNSTABLE_UNICORNS: +0%
 * - SPACE_MURINES: +5% (0.05)
 * - ORKS: +0%
 */
export function getDefenseBonusPercent(
  dbLevel: number,
  race?: FortressRace | null,
  castleSpecializations?: Partial<CastleSpecializationCounts>
) {
  return (
    getDisplayedCastleLevel(dbLevel) * DEFENSE_BONUS_PER_DISPLAYED_LEVEL +
    getRaceModifiers(race).defenseBonus +
    getSpecializationCount(
      castleSpecializations,
      CastleUpgradeSpecialization.DEFENSE
    ) *
      0.1
  );
}

/**
 * Calculates the defense multiplier applied to defending army strength.
 * Used to calculate effective defense power in combat.
 *
 * Multiplier = 1 + defense_bonus_percent
 */
export function getFortressDefenseMultiplier(
  dbLevel: number,
  race?: FortressRace | null,
  castleSpecializations?: Partial<CastleSpecializationCounts>
) {
  return 1 + getDefenseBonusPercent(dbLevel, race, castleSpecializations);
}

/**
 * Calculates the effective defending army strength after applying defense multiplier.
 *
 * Effective Defense = army * defense_multiplier
 */
export function getEffectiveDefendingArmy(
  army: number,
  dbLevel: number,
  race?: FortressRace | null,
  castleSpecializations?: Partial<CastleSpecializationCounts>
) {
  return army * getFortressDefenseMultiplier(
    dbLevel,
    race,
    castleSpecializations
  );
}

// ============================================================================
// WORKER ASSIGNMENT VALIDATION
// ============================================================================

/**
 * Validates that worker assignments fit within the fortress population.
 *
 * Returns validation result including whether assignments are valid,
 * current population, and total assigned workers.
 */
export function validateWorkerAssignments(input: WorkerAssignmentLike) {
  const population = getFortressPopulation(input.level, input.race);
  const totalAssigned =
    input.minersAssigned + input.farmersAssigned + input.recruitersAssigned;
  const isValid =
    Number.isInteger(input.minersAssigned) &&
    Number.isInteger(input.farmersAssigned) &&
    Number.isInteger(input.recruitersAssigned) &&
    input.minersAssigned >= 0 &&
    input.farmersAssigned >= 0 &&
    input.recruitersAssigned >= 0 &&
    totalAssigned <= population;

  return {
    isValid,
    population,
    totalAssigned,
  };
}

/**
 * Validates worker assignments and throws GameError if invalid.
 * Use this when you need to fail fast on invalid assignments.
 */
export function assertWorkerAssignments(input: WorkerAssignmentLike) {
  const validation = validateWorkerAssignments(input);

  if (!validation.isValid) {
    throw new GameError("Worker assignments must fit within the fortress population.");
  }

  return validation;
}

// ============================================================================
// FORTRESS PRODUCTION SYSTEM
// ============================================================================

/**
 * FORTRESS PRODUCTION CALCULATION
 *
 * This is the primary function for calculating fortress economic production.
 * Called once per fortress per game tick to determine:
 * - Gold production
 * - Food production
 * - Army production (limited by food)
 * - Food consumption
 * - Resulting fortress state after production
 *
 * INPUT PARAMETERS:
 * ==================
 * - level: fortress upgrade level (0-9)
 * - race: fortress race (affects worker bonuses)
 * - minersAssigned, farmersAssigned, recruitersAssigned: worker counts
 * - castleSpecializations: specialization multiplier counts
 * - food: current food available at start of tick
 *
 * CALCULATION FLOW:
 * ==================
 * 1. Base Production Calculation
 *    - Gold Base = miners + floor(miners/10) * race_gold_bonus
 *    - Food Base = farmers + floor(farmers/10) * race_food_bonus
 *    - Army Base = recruiters + floor(recruiters/10) * race_army_bonus
 *
 * 2. Apply Specialization Multipliers
 *    - Each specialization level adds +10%
 *    - goldProduced = floor(Gold Base * (1 + POINTS_specializations * 0.1))
 *    - foodProduced = floor(Food Base * (1 + FOOD_specializations * 0.1))
 *    - armyRequested = floor(Army Base * (1 + MILITARY_specializations * 0.1))
 *
 * 3. Army Production (Food-Limited)
 *    - Available Food = current_food + food_produced
 *    - armyProduced = min(armyRequested, floor(available_food / FOOD_COST_PER_ARMY))
 *    - foodConsumed = armyProduced * FOOD_COST_PER_ARMY
 *
 * 4. Final Food State
 *    - foodAfterProduction = available_food - foodConsumed
 *
 * EXAMPLE:
 * =========
 * Fortress: Level 3, DWARFS race, 10 miners, 8 farmers, 6 recruiters, 50 food
 * POINTS specializations: 2 (multiplier = 1.2)
 * FOOD specializations: 1 (multiplier = 1.1)
 * MILITARY specializations: 0 (multiplier = 1.0)
 *
 * - Population = 25 + 3*10 + 0 = 55
 * - Gold Base = 10 + floor(10/10)*1 = 10 + 1 = 11
 *   Gold Produced = floor(11 * 1.2) = floor(13.2) = 13
 * - Food Base = 8 + floor(8/10)*0 = 8
 *   Food Produced = floor(8 * 1.1) = floor(8.8) = 8
 * - Army Base = 6 + floor(6/10)*0 = 6
 *   Army Requested = floor(6 * 1.0) = 6
 * - Available Food = 50 + 8 = 58
 *   Army Produced = min(6, floor(58/1)) = 6
 *   Food Consumed = 6 * 1 = 6
 *   Food After = 58 - 6 = 52
 *
 * RETURNS: TickProductionResult with all calculated values
 */
export function calculateTickProduction(fortressLike: FortressEconomyLike) {
  const raceModifiers = getRaceModifiers(fortressLike.race);
  const minersAssigned = clampNonNegative(fortressLike.minersAssigned);
  const farmersAssigned = clampNonNegative(fortressLike.farmersAssigned);
  const recruitersAssigned = clampNonNegative(fortressLike.recruitersAssigned);
  const goldMultiplier = getCastleSpecializationMultiplier(
    getSpecializationCount(
      fortressLike.castleSpecializations,
      CastleUpgradeSpecialization.POINTS
    )
  );
  const foodMultiplier = getCastleSpecializationMultiplier(
    getSpecializationCount(
      fortressLike.castleSpecializations,
      CastleUpgradeSpecialization.FOOD
    )
  );
  const armyMultiplier = getCastleSpecializationMultiplier(
    getSpecializationCount(
      fortressLike.castleSpecializations,
      CastleUpgradeSpecialization.MILITARY
    )
  );
  const population = getFortressPopulation(
    fortressLike.level,
    fortressLike.race
  );
  const baseGoldProduced =
    minersAssigned * GOLD_PER_MINER +
    Math.floor(minersAssigned / 10) * raceModifiers.goldPerTenMiners;
  const baseFoodProduced =
    farmersAssigned * FOOD_PER_FARMER +
    Math.floor(farmersAssigned / 10) * raceModifiers.foodPerTenFarmers;
  const baseArmyRequested =
    recruitersAssigned * ARMY_PER_RECRUITER +
    Math.floor(recruitersAssigned / 10) * raceModifiers.armyPerTenRecruiters;
  const goldProduced = Math.floor(baseGoldProduced * goldMultiplier);
  const foodProduced = Math.floor(baseFoodProduced * foodMultiplier);
  const armyRequested = Math.floor(baseArmyRequested * armyMultiplier);
  const availableFood = clampNonNegative(fortressLike.food) + foodProduced;
  const armyProduced = Math.min(
    armyRequested,
    Math.floor(availableFood / FOOD_COST_PER_ARMY)
  );
  const foodConsumed = armyProduced * FOOD_COST_PER_ARMY;
  const foodAfterProduction = availableFood - foodConsumed;

  return {
    population,
    goldProduced,
    foodProduced,
    armyRequested,
    armyProduced,
    foodConsumed,
    foodAfterProduction,
  } satisfies TickProductionResult;
}

// ============================================================================
// COMBAT SYSTEM
// ============================================================================

/**
 * RAID OUTCOME CALCULATION
 *
 * Calculates the complete outcome of a raid/attack between two fortresses.
 * Used for:
 * - Standard 1v1 attacks between players
 * - Loot camp raids
 * - Mega-fortress attacks
 *
 * COMBAT RESOLUTION:
 * ===================
 * 1. Calculate Power Values
 *    - Attack Power = army * attack_power_multiplier (default: 1)
 *    - Defense Power = defender_army * defense_multiplier * defense_power_multiplier
 *    - Defense Multiplier = 1 + defense_bonus_percent (includes level, race, specializations)
 *
 * 2. Determine Winner
 *    - Attacker Wins if: Attack Power > Defense Power
 *    - Defender Wins if: Attack Power <= Defense Power
 *
 * 3. Calculate Attacker Casualties
 *    - If Attacker Wins:
 *      Survivors = Base (15%) + Margin Bonus (85% of excess power)
 *      Retired = floor(survivors * 50%) -> not returning home
 *      Returned = survivors - retired
 *    - If Attacker Loses:
 *      All attackers are lost (survivors = 0, returned = 0)
 *      Exception: preventAttackerCasualties flag returns full army
 *
 * 4. Calculate Defender Casualties
 *    - If Attacker Wins:
 *      Losses = ceil(defender_army * 70%)
 *      Exception: preventDefenderLosses flag (used for loot camps)
 *    - If Attacker Loses:
 *      Losses = ceil((attack_power / defense_multiplier) * 35%)
 *
 * 5. Calculate Loot
 *    - Only when attacker wins
 *    - Loot Capacity = survivors * (8 + race_carry_bonus)
 *      ORKS get +6 carry capacity per survivor
 *    - Gold Loot Cap = 70% of defender's gold
 *    - Food Loot Cap = 70% of defender's food
 *    - Loot = split between gold/food up to capacity (50/50 preference)
 *
 * PARAMETERS:
 * ============
 * attackArmy: number of attacking units
 * attackerRace: attacker race (affects loot capacity)
 * defenderArmy: number of defending units
 * defenderDbLevel: defender's fortress level (affects defense bonus)
 * defenderHasCastle: whether defender has castle fortifications (default: true)
 * defenderRace: defender race (affects defense bonus)
 * defenderCastleSpecializations: defender specialization counts (affects defense)
 * attackPowerMultiplier: multiplier for attack power (default: 1, used for race abilities)
 * defensePowerMultiplier: multiplier for defense power (default: 1, used for race abilities)
 * preventAttackerCasualties: if true, attacker returns full army (used for simulation)
 * preventDefenderLosses: if true, defender suffers no losses (used for loot camps)
 * defenderGold/defenderPoints: gold available to loot
 * defenderFood: food available to loot
 *
 * EXAMPLE (Attacker Win):
 * ========================
 * Attacker: 100 army, no race, default multiplier
 * Defender: 50 army, level 2, DWARFS race (1.2x multiplier), no specializations
 *
 * Attack Power = 100 * 1 = 100
 * Defense Bonus = (2+1)*0.1 + 0.1 + 0*0.1 = 0.4 = 40%
 * Defense Multiplier = 1.4
 * Defense Power = 50 * 1.4 * 1 = 70
 *
 * Attacker Wins! (100 > 70)
 *
 * Survivors = floor(100 * 0.15 + (100-70) * 0.85) = floor(15 + 25.5) = 40
 * Retired = ceil(40 * 0.5) = 20
 * Returned = 40 - 20 = 20
 * Defender Losses = ceil(50 * 0.7) = 35
 * Loot Capacity = 40 * 8 = 320
 * (Loot split between gold and food up to capacity)
 */
export function calculateRaidOutcome(input: RaidOutcomeInput): RaidOutcome {
  const attackArmy = clampInteger(input.attackArmy);
  const defenderArmy = clampInteger(input.defenderArmy);
  const defenderGold = clampInteger(input.defenderGold ?? input.defenderPoints ?? 0);
  const defenderFood = clampInteger(input.defenderFood);
  const attackPower = Math.floor(
    attackArmy * Math.max(0, input.attackPowerMultiplier ?? 1)
  );
  const defenseMultiplier = getFortressDefenseMultiplier(
    input.defenderDbLevel,
    input.defenderRace,
    input.defenderCastleSpecializations
  );
  const defensePower = Math.floor(
    getEffectiveDefendingArmy(
      defenderArmy,
      input.defenderDbLevel,
      input.defenderRace,
      input.defenderCastleSpecializations
    ) * Math.max(0, input.defensePowerMultiplier ?? 1)
  );
  const attackerWon = attackPower > defensePower;
  const outcome: RaidOutcome["outcome"] = attackerWon
    ? "ATTACKER_WIN"
    : "DEFENDER_WIN";

  const hasDefensiveMitigation =
    input.defenderHasCastle !== false ||
    input.defenderRace !== null && input.defenderRace !== undefined ||
    getSpecializationCount(
      input.defenderCastleSpecializations,
      CastleUpgradeSpecialization.DEFENSE
    ) > 0;
  const defenderLossRateOnAttackerWin = hasDefensiveMitigation
    ? DEFENDER_LOSS_RATE_ON_ATTACKER_WIN
    : 1;

  const attackerSurvivors = attackerWon
    ? Math.max(
        0,
        Math.floor(
          attackPower * WINNING_ATTACKER_BASE_SURVIVAL_FACTOR +
            (attackPower - defensePower) * WINNING_ATTACKER_MARGIN_SURVIVAL_FACTOR
        )
      )
    : 0;
  const attackerRetired = 0; // Retirement system removed - all survivors return
  const attackerReturned = input.preventAttackerCasualties
    ? attackArmy
    : attackerSurvivors;
  const defenderLosses = input.preventDefenderLosses
    ? 0
    : attackerWon
      ? Math.min(
          defenderArmy,
          Math.ceil(defenderArmy * defenderLossRateOnAttackerWin)
        )
      : Math.min(
          defenderArmy,
          Math.ceil(
            (attackPower / Math.max(defenseMultiplier, 1)) *
              FAILED_ATTACK_DEFENDER_CASUALTY_FACTOR
          )
        );

  let goldLooted = 0;
  let foodLooted = 0;

  if (attackerWon) {
    const carryCapacity =
      Math.floor(
        attackerSurvivors *
          (CARRY_CAPACITY_PER_SURVIVOR +
            getRaceModifiers(input.attackerRace).carryCapacityPerSurvivorBonus) *
          Math.max(0, input.carryCapacityMultiplier ?? 1)
      );
    const goldLootCap = Math.floor(defenderGold * MAX_POINT_LOOT_PERCENT);
    const foodLootCap = Math.floor(defenderFood * MAX_FOOD_LOOT_PERCENT);

    const looted = splitRaidLoot({
      lootCapacity: carryCapacity,
      goldLootCap,
      foodLootCap,
    });

    goldLooted = looted.goldLooted;
    foodLooted = looted.foodLooted;
  }

  return {
    outcome,
    attackPower,
    defensePower,
    defenseMultiplier,
    attackerSurvivors,
    attackerRetired,
    attackerReturned,
    defenderLosses,
    goldLooted,
    pointsLooted: goldLooted,
    foodLooted,
  };
}
