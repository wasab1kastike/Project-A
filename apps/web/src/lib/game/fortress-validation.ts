/**
 * Fortress Validation Utilities
 *
 * Consolidated validation helpers for fortress actions and state transitions.
 * These functions combine multiple balance calculations to provide high-level
 * validation for common game operations.
 */

import {
  assertWorkerAssignments,
  calculateTickProduction,
  type WorkerAssignmentLike,
  type FortressEconomyLike,
} from "./balance";
import {
  getFortressUpgradeCost,
  getFortressUpgradeDurationMinutes,
  canFortressLevelUp,
  getMaxSimultaneousAttacks,
} from "./upgrades";
import type { FortressRace } from "./races";

// ============================================================================
// UPGRADE VALIDATION
// ============================================================================

export type FortressUpgradeValidation = {
  isValid: boolean;
  currentLevel: number;
  nextLevel: number;
  upgradeCost: number | null;
  upgradeDurationMinutes: number | null;
  canUpgrade: boolean;
  reason?: string;
};

/**
 * Validates whether a fortress can upgrade to the next level.
 *
 * Checks:
 * - Fortress is not already at max level
 * - Sufficient gold/points available
 *
 * @param fortress - Current fortress state
 * @param availableGold - Gold/points available in fortress
 * @returns Validation result with reasons if invalid
 */
export function validateFortressUpgrade(
  fortress: { level: number },
  availableGold: number
): FortressUpgradeValidation {
  const currentLevel = fortress.level;
  const nextLevel = currentLevel + 1;
  const canUpgradeLevel = canFortressLevelUp(currentLevel);

  if (!canUpgradeLevel) {
    return {
      isValid: false,
      currentLevel,
      nextLevel,
      upgradeCost: null,
      upgradeDurationMinutes: null,
      canUpgrade: false,
      reason: "Fortress is already at maximum level",
    };
  }

  const upgradeCost = getFortressUpgradeCost(currentLevel);
  if (upgradeCost === null) {
    return {
      isValid: false,
      currentLevel,
      nextLevel,
      upgradeCost: null,
      upgradeDurationMinutes: null,
      canUpgrade: false,
      reason: "Upgrade cost not found for this level",
    };
  }

  const hasEnoughGold = availableGold >= upgradeCost;
  if (!hasEnoughGold) {
    const deficit = upgradeCost - availableGold;
    return {
      isValid: false,
      currentLevel,
      nextLevel,
      upgradeCost,
      upgradeDurationMinutes: getFortressUpgradeDurationMinutes(currentLevel),
      canUpgrade: false,
      reason: `Insufficient gold. Need ${upgradeCost}, have ${availableGold} (deficit: ${deficit})`,
    };
  }

  return {
    isValid: true,
    currentLevel,
    nextLevel,
    upgradeCost,
    upgradeDurationMinutes: getFortressUpgradeDurationMinutes(currentLevel),
    canUpgrade: true,
  };
}

// ============================================================================
// WORKER ASSIGNMENT VALIDATION
// ============================================================================

export type WorkerAssignmentValidation = {
  isValid: boolean;
  population: number;
  totalAssigned: number;
  availablePopulation: number;
  reason?: string;
};

/**
 * Validates and returns detailed information about worker assignments.
 * Wraps validateWorkerAssignments for a clearer error message interface.
 *
 * @param fortress - Fortress with worker assignment and level info
 * @returns Validation result with population details
 */
export function validateAndDescribeWorkerAssignment(
  fortress: WorkerAssignmentLike
): WorkerAssignmentValidation {
  const validation = assertWorkerAssignments(fortress);

  return {
    isValid: true,
    population: validation.population,
    totalAssigned: validation.totalAssigned,
    availablePopulation: validation.population - validation.totalAssigned,
  };
}

// ============================================================================
// PRODUCTION VALIDATION
// ============================================================================

export type ProductionHealthStatus = "healthy" | "food_deficit" | "zero_production";

export type ProductionValidation = {
  status: ProductionHealthStatus;
  goldPerTick: number;
  foodPerTick: number;
  armyPerTick: number;
  foodAfterThisTick: number;
  sustainableFoodAfterTicks: number; // How many ticks until food runs out at current production
  reason?: string;
};

/**
 * Validates current production and returns health status.
 *
 * Identifies potential issues:
 * - Food deficit: Current food would go negative
 * - Zero production: No gold, food, or army being produced
 * - Healthy: Production is sustainable
 *
 * @param fortress - Current fortress state with workers and food
 * @returns Validation result with production metrics and health status
 */
export function validateProduction(
  fortress: FortressEconomyLike
): ProductionValidation {
  const production = calculateTickProduction(fortress);

  let status: ProductionHealthStatus = "healthy";
  let reason: string | undefined;

  // Check for zero production
  if (production.goldProduced === 0 && production.foodProduced === 0 && production.armyProduced === 0) {
    status = "zero_production";
    reason = "Fortress is producing nothing. Consider assigning workers.";
  }

  // Check for food deficit
  if (production.foodAfterProduction < 0) {
    status = "food_deficit";
    reason = `Food will be negative after this tick (${production.foodAfterProduction} remaining)`;
  }

  // Calculate sustainable ticks
  let sustainableFoodAfterTicks = Infinity;
  if (production.foodProduced < production.foodConsumed) {
    const foodDelta = production.foodConsumed - production.foodProduced;
    if (foodDelta > 0) {
      sustainableFoodAfterTicks = Math.floor(production.foodAfterProduction / foodDelta);
    }
  } else {
    sustainableFoodAfterTicks = Infinity;
  }

  return {
    status,
    goldPerTick: production.goldProduced,
    foodPerTick: production.foodProduced,
    armyPerTick: production.armyProduced,
    foodAfterThisTick: production.foodAfterProduction,
    sustainableFoodAfterTicks,
    reason,
  };
}

// ============================================================================
// ATTACK VALIDATION
// ============================================================================

export type AttackValidation = {
  isValid: boolean;
  currentAttackCount: number;
  maxSimultaneousAttacks: number;
  canAttack: boolean;
  reason?: string;
};

/**
 * Validates whether a fortress can launch another attack.
 *
 * Checks:
 * - Not at maximum simultaneous attack limit
 *
 * @param fortress - Fortress initiating attack
 * @param currentOutboundAttackCount - Number of attacks already in transit
 * @returns Validation result indicating if attack is allowed
 */
export function validateCanAttack(
  fortress: { level: number; race?: FortressRace | null },
  currentOutboundAttackCount: number
): AttackValidation {
  const maxAttacks = getMaxSimultaneousAttacks(fortress.level, fortress.race);
  const canAttack = currentOutboundAttackCount < maxAttacks;

  if (!canAttack) {
    return {
      isValid: false,
      currentAttackCount: currentOutboundAttackCount,
      maxSimultaneousAttacks: maxAttacks,
      canAttack: false,
      reason: `Maximum simultaneous attacks reached (${currentOutboundAttackCount}/${maxAttacks})`,
    };
  }

  return {
    isValid: true,
    currentAttackCount: currentOutboundAttackCount,
    maxSimultaneousAttacks: maxAttacks,
    canAttack: true,
  };
}

// ============================================================================
// COMPOSITE VALIDATIONS
// ============================================================================

export type FortressHealthCheck = {
  upgrade: FortressUpgradeValidation;
  workers: WorkerAssignmentValidation;
  production: ProductionValidation;
  attacks: AttackValidation;
  overallHealthy: boolean;
};

/**
 * Performs a comprehensive health check on a fortress.
 * Useful for debugging or admin operations.
 *
 * @param fortress - Full fortress state
 * @param availableGold - Gold available for upgrade
 * @param currentOutboundAttackCount - Number of in-flight attacks
 * @returns Comprehensive health report
 */
export function performFortressHealthCheck(
  fortress: FortressEconomyLike & {
    level: number;
    race?: FortressRace | null;
  },
  availableGold: number,
  currentOutboundAttackCount: number
): FortressHealthCheck {
  const upgrade = validateFortressUpgrade(fortress, availableGold);
  const workers = validateAndDescribeWorkerAssignment(fortress);
  const production = validateProduction(fortress);
  const attacks = validateCanAttack(fortress, currentOutboundAttackCount);

  const overallHealthy =
    production.status === "healthy" &&
    workers.availablePopulation > 0 &&
    attacks.canAttack;

  return {
    upgrade,
    workers,
    production,
    attacks,
    overallHealthy,
  };
}
