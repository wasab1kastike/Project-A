/**
 * Army Recruitment System (Order-Based)
 *
 * DESIGN OVERVIEW:
 * ================
 * Players order armies upfront with gold, then recruiters process the queue
 * at a rate of 1 unit/recruiter/tick. This replaces the current passive
 * production system with explicit player orders and clear recruitment timelines.
 *
 * FLOW:
 * =====
 * 1. Player orders 100 units → pays 100 gold upfront
 * 2. Recruiters start processing order (1 unit/recruiter/tick)
 *    - 10 recruiters = 10 units/tick → 100 units in 10 ticks
 *    - 5 recruiters = 5 units/tick → 100 units in 20 ticks
 * 3. As units complete, they enter active army
 * 4. Upkeep cost applies to active units only (0.01 food/unit/tick)
 *    and unpaid upkeep causes starvation attrition
 *
 * BENEFITS vs CURRENT SYSTEM:
 * ============================
 * - Strategic: Player controls when to invest in army growth
 * - Visible: Queue shows exact completion time
 * - Scalable: Upkeep is 100x cheaper (0.01 vs 1 food/tick), enables large armies
 * - Balanced: Gold cost upfront controls spending
 * - Race-differentiated: Recruiter speed varies by race
 *
 * CONSTANTS:
 * ==========
 * RECRUITMENT_COST_PER_UNIT: 1 gold per unit (player pays when ordering)
 * ARMY_UPKEEP_PER_UNIT: 0.01 food per unit per tick (1 food sustains 100 units)
 * RECRUITMENT_RATE_PER_RECRUITER: 1 unit per recruiter per tick
 *
 * FORMULA EXAMPLES:
 * =================
 *
 * Example 1: How long to recruit 100 units with 10 recruiters?
 *   recruitersTick = 10 + floor(10/10) * space_murine_bonus (assume 0)
 *   recruitmentRate = 10 units/tick
 *   ticksNeeded = ceil(100 / 10) = 10 ticks
 *
 * Example 2: What's the cost to order 100 units?
 *   goldCost = 100 * RECRUITMENT_COST_PER_UNIT = 100 gold
 *
 * Example 3: What's the upkeep for 500 army units per tick?
 *   foodCost = 500 * ARMY_UPKEEP_PER_UNIT = 5 food/tick
 *   Compare to old system: 500 * 1 = 500 food/tick (100x more expensive!)
 *
 * TRANSITION STRATEGY (Phase 2):
 * ==============================
 * 1. Add `Fortress.recruitmentQueue` integer field (units pending)
 * 2. Update production calculation to process queue at recruiter rate
 * 3. Add `recruitArmy(unitCount)` action that checks gold and adds to queue
 * 4. Update UI to show queue status and estimated completion
 * 5. Tests verify recruitment timing and upkeep calculations
 */

import { getRaceModifiers, type FortressRace } from "./races";

// ============================================================================
// RECRUITMENT COST & UPKEEP CONSTANTS
// ============================================================================

/** Gold cost to order one army unit (upfront payment) */
export const RECRUITMENT_COST_PER_UNIT = 1;

/** Food cost per unit per tick (upkeep for existing armies) */
export const ARMY_UPKEEP_PER_UNIT = 0.01;

/** Active army lost per tick when food cannot cover upkeep */
export const STARVATION_ATTRITION_RATE = 0.02;

/** Base recruitment rate (units per recruiter per tick) */
export const RECRUITMENT_RATE_PER_RECRUITER = 1;

// ============================================================================
// TYPES
// ============================================================================

export type RecruitmentOrder = {
  unitCount: number;
  goldCostTotal: number;
  estimatedTicksToComplete: number;
};

export type RecruitmentProgress = {
  queueRemaining: number;
  recruiterCapacityPerTick: number;
  ticksToComplete: number;
};

export type ArmyUpkeepCalculation = {
  activeArmyCount: number;
  foodCostPerTick: number;
  goldCostPerTick?: number;
};

// ============================================================================
// RECRUITMENT ORDER CALCULATION
// ============================================================================

/**
 * Calculate the cost to recruit a specified number of units.
 *
 * Formula: unitCount * RECRUITMENT_COST_PER_UNIT
 *
 * @param unitCount - Number of units to order
 * @returns Total gold cost
 *
 * Example: getRecruitmentCost(100) => 100 gold
 */
export function getRecruitmentCost(unitCount: number): number {
  return Math.max(0, Math.floor(unitCount)) * RECRUITMENT_COST_PER_UNIT;
}

/**
 * Validates that a fortress can afford to recruit the requested units.
 *
 * @param unitCount - Units being ordered
 * @param availableGold - Current fortress gold
 * @returns Object with isAffordable and costNeeded
 */
export function canAffordRecruitment(
  unitCount: number,
  availableGold: number
): { isAffordable: boolean; costNeeded: number; deficit: number } {
  const cost = getRecruitmentCost(unitCount);
  return {
    isAffordable: availableGold >= cost,
    costNeeded: cost,
    deficit: Math.max(0, cost - availableGold),
  };
}

/**
 * Calculate recruitment progress and estimated completion time.
 *
 * Formula:
 * - recruiterCapacity = recruiters + floor(recruiters/10) * race_bonus
 * - ticksToComplete = ceil(queueRemaining / recruiterCapacity)
 *
 * @param queueRemaining - Units still in recruitment queue
 * @param recruitersAssigned - Active recruiters
 * @param race - Fortress race (affects recruitment speed)
 * @returns Progress info including estimated ticks to completion
 *
 * Example:
 *   - Queue: 100 units
 *   - Recruiters: 10
 *   - Rate: 10 units/tick
 *   - Result: 10 ticks to complete
 */
export function calculateRecruitmentProgress(
  queueRemaining: number,
  recruitersAssigned: number,
  race?: FortressRace | null
): RecruitmentProgress {
  const raceModifiers = getRaceModifiers(race);
  const baseCapacity = recruitersAssigned * RECRUITMENT_RATE_PER_RECRUITER;
  const bonusCapacity =
    Math.floor(recruitersAssigned / 10) *
    raceModifiers.armyPerTenRecruiters;
  const recruiterCapacityPerTick = baseCapacity + bonusCapacity;

  if (recruiterCapacityPerTick <= 0) {
    return {
      queueRemaining,
      recruiterCapacityPerTick: 0,
      ticksToComplete: Infinity,
    };
  }

  const ticksToComplete = Math.ceil(
    queueRemaining / recruiterCapacityPerTick
  );

  return {
    queueRemaining,
    recruiterCapacityPerTick,
    ticksToComplete,
  };
}

/**
 * Process recruitment queue for one game tick.
 *
 * Recruiters pull units from the queue at their capacity rate.
 *
 * Formula:
 *   unitsCreatedThisTick = min(queueRemaining, recruiterCapacity)
 *   newQueueRemaining = queueRemaining - unitsCreatedThisTick
 *
 * @param queueRemaining - Current queue size
 * @param recruitersAssigned - Active recruiters
 * @param race - Fortress race
 * @returns Object with unitsCreated and newQueue
 *
 * Example:
 *   - Queue: 100, Recruiters: 15 (capacity 15/tick)
 *   - Result: Creates 15, Queue becomes 85
 */
export function processRecruitmentQueue(
  queueRemaining: number,
  recruitersAssigned: number,
  race?: FortressRace | null
): { unitsCreated: number; newQueue: number } {
  const progress = calculateRecruitmentProgress(
    queueRemaining,
    recruitersAssigned,
    race
  );
  const unitsCreated = Math.min(
    queueRemaining,
    progress.recruiterCapacityPerTick
  );

  return {
    unitsCreated,
    newQueue: Math.max(0, queueRemaining - unitsCreated),
  };
}

// ============================================================================
// ARMY UPKEEP CALCULATION
// ============================================================================

/**
 * Calculate upkeep cost for maintaining an army.
 *
 * Formula: activeArmyCount * ARMY_UPKEEP_PER_UNIT
 *
 * @param activeArmyCount - Number of units in active army
 * @returns Food cost per tick (upkeep)
 *
 * Example:
 *   - Army: 500 units
 *   - Upkeep: 500 * 0.01 = 5 food/tick
 *   - Compare to old system: 500 * 1 = 500 food/tick (100x cheaper!)
 */
export function getArmyUpkeepCost(activeArmyCount: number): number {
  return Math.max(0, Math.floor(activeArmyCount)) * ARMY_UPKEEP_PER_UNIT;
}

/**
 * Calculate active army lost when a fortress cannot cover food upkeep.
 *
 * Starvation always removes at least 1 unit from a positive active army and is
 * capped at the current army size.
 */
export function getStarvationArmyLoss(activeArmyCount: number): number {
  const normalizedArmy = Math.max(0, Math.floor(activeArmyCount));

  if (normalizedArmy <= 0) {
    return 0;
  }

  return Math.min(
    normalizedArmy,
    Math.max(1, Math.ceil(normalizedArmy * STARVATION_ATTRITION_RATE))
  );
}

/**
 * Calculate full upkeep including pending queue and active army.
 *
 * When armies are in recruitment queue, they don't consume upkeep yet.
 * Only active units consume upkeep.
 *
 * @param activeArmyCount - Units already created (consuming upkeep)
 * @returns Upkeep details
 */
export function calculateArmyUpkeep(
  activeArmyCount: number
): ArmyUpkeepCalculation {
  return {
    activeArmyCount,
    foodCostPerTick: getArmyUpkeepCost(activeArmyCount),
  };
}

/**
 * Check if fortress can sustain current army with available food.
 *
 * @param activeArmyCount - Units needing upkeep
 * @param availableFood - Current food reserves
 * @returns Sustainability info
 */
export function canSustainArmy(
  activeArmyCount: number,
  availableFood: number
): {
  isSustainable: boolean;
  upkeepPerTick: number;
  foodRemaining: number;
  ticksUntilStarving: number;
} {
  const upkeepPerTick = getArmyUpkeepCost(activeArmyCount);
  const foodRemaining = availableFood - upkeepPerTick;
  const ticksUntilStarving =
    upkeepPerTick > 0
      ? Math.floor(availableFood / upkeepPerTick)
      : Infinity;

  return {
    isSustainable: availableFood >= upkeepPerTick,
    upkeepPerTick,
    foodRemaining: Math.max(0, foodRemaining),
    ticksUntilStarving,
  };
}

// ============================================================================
// COMPARISON: OLD vs NEW SYSTEM
// ============================================================================

/**
 * Compare recruitment costs between old (passive) and new (order-based) systems.
 *
 * OLD SYSTEM:
 * - 10 recruiters produce 10 army/tick (limited by food: 1 food/unit)
 * - To get 100 army takes 10 ticks + 100 food consumed
 * - Passive (no player action)
 *
 * NEW SYSTEM:
 * - Player orders 100 army, pays 100 gold upfront
 * - 10 recruiters create 100 army in 10 ticks
 * - Upkeep: 1 food/tick (0.01 per unit * 100)
 * - Active (player controls timing)
 *
 * This function helps visualize the tradeoff:
 */
export function compareRecruitmentSystems(unitCount: number): {
  oldSystemFoodCost: number;
  newSystemGoldUpfront: number;
  newSystemFoodUpkeepPerTick: number;
  oldVsNewUptimeRatio: number;
} {
  const oldSystemFoodCost = unitCount * 1; // Old: 1 food per unit
  const newSystemGoldUpfront = getRecruitmentCost(unitCount); // New: 1 gold per unit
  const newSystemFoodUpkeepPerTick = getArmyUpkeepCost(unitCount); // New: 0.01 food per unit

  return {
    oldSystemFoodCost,
    newSystemGoldUpfront,
    newSystemFoodUpkeepPerTick,
    oldVsNewUptimeRatio: oldSystemFoodCost / newSystemFoodUpkeepPerTick,
  };
}
