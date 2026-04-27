import { GameError } from "./errors";

export const BASE_POPULATION = 25;
export const POPULATION_PER_DB_LEVEL = 10;
export const POINTS_PER_MINER = 1;
export const FOOD_PER_FARMER = 1;
export const ARMY_PER_RECRUITER = 1;
export const FOOD_COST_PER_ARMY = 1;

export const DEFENSE_BONUS_PER_DISPLAYED_LEVEL = 0.1;

export const FAILED_ATTACK_DEFENDER_CASUALTY_FACTOR = 0.65;
export const WINNING_ATTACKER_BASE_SURVIVAL_FACTOR = 0.15;
export const WINNING_ATTACKER_MARGIN_SURVIVAL_FACTOR = 0.85;
export const ATTACKER_RETIREMENT_RATE = 0.5;
export const DEFENDER_LOSS_RATE_ON_ATTACKER_WIN = 0.7;
export const CARRY_CAPACITY_PER_SURVIVOR = 2;
export const MAX_POINT_LOOT_PERCENT = 0.15;
export const MAX_FOOD_LOOT_PERCENT = 0.25;

export type WorkerAssignmentLike = {
  level: number;
  minersAssigned: number;
  farmersAssigned: number;
  recruitersAssigned: number;
};

export type FortressEconomyLike = WorkerAssignmentLike & {
  food: number;
};

export type RaidOutcomeInput = {
  attackArmy: number;
  defenderArmy: number;
  defenderDbLevel: number;
  defenderPoints: number;
  defenderFood: number;
};

export type RaidOutcome = {
  outcome: "ATTACKER_WIN" | "DEFENDER_WIN";
  attackPower: number;
  defensePower: number;
  defenseMultiplier: number;
  attackerSurvivors: number;
  attackerRetired: number;
  attackerReturned: number;
  defenderLosses: number;
  pointsLooted: number;
  foodLooted: number;
};

export type TickProductionResult = {
  population: number;
  pointsProduced: number;
  foodProduced: number;
  armyRequested: number;
  armyProduced: number;
  foodConsumed: number;
  foodAfterProduction: number;
};

function clampNonNegative(value: number) {
  return Math.max(0, value);
}

function clampInteger(value: number) {
  return Math.max(0, Math.floor(value));
}

function splitRaidLoot({
  lootCapacity,
  pointLootCap,
  foodLootCap,
}: {
  lootCapacity: number;
  pointLootCap: number;
  foodLootCap: number;
}) {
  const halfPointTarget = Math.ceil(lootCapacity / 2);
  const halfFoodTarget = Math.floor(lootCapacity / 2);

  let pointsLooted = Math.min(pointLootCap, halfPointTarget);
  let foodLooted = Math.min(foodLootCap, halfFoodTarget);
  let remainingCapacity = lootCapacity - pointsLooted - foodLooted;

  while (remainingCapacity > 0) {
    const pointRemaining = pointLootCap - pointsLooted;
    const foodRemaining = foodLootCap - foodLooted;

    if (pointRemaining <= 0 && foodRemaining <= 0) {
      break;
    }

    if (pointRemaining >= foodRemaining) {
      const extraPoints = Math.min(remainingCapacity, Math.max(0, pointRemaining));
      pointsLooted += extraPoints;
      remainingCapacity -= extraPoints;
      continue;
    }

    const extraFood = Math.min(remainingCapacity, Math.max(0, foodRemaining));
    foodLooted += extraFood;
    remainingCapacity -= extraFood;
  }

  return {
    pointsLooted,
    foodLooted,
  };
}

/**
 * Future buffs and races should adjust inputs or these balance constants in one
 * place instead of reimplementing the same formulas in combat or UI code.
 */
export function getDisplayedCastleLevel(dbLevel: number) {
  return dbLevel + 1;
}

export function getFortressPopulation(dbLevel: number) {
  return BASE_POPULATION + dbLevel * POPULATION_PER_DB_LEVEL;
}

export function getDefenseBonusPercent(dbLevel: number) {
  return getDisplayedCastleLevel(dbLevel) * DEFENSE_BONUS_PER_DISPLAYED_LEVEL;
}

export function getFortressDefenseMultiplier(dbLevel: number) {
  return 1 + getDefenseBonusPercent(dbLevel);
}

export function getEffectiveDefendingArmy(army: number, dbLevel: number) {
  return army * getFortressDefenseMultiplier(dbLevel);
}

export function validateWorkerAssignments(input: WorkerAssignmentLike) {
  const population = getFortressPopulation(input.level);
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

export function assertWorkerAssignments(input: WorkerAssignmentLike) {
  const validation = validateWorkerAssignments(input);

  if (!validation.isValid) {
    throw new GameError("Worker assignments must fit within the fortress population.");
  }

  return validation;
}

export function calculateTickProduction(fortressLike: FortressEconomyLike) {
  const population = getFortressPopulation(fortressLike.level);
  const pointsProduced = clampNonNegative(fortressLike.minersAssigned) * POINTS_PER_MINER;
  const foodProduced = clampNonNegative(fortressLike.farmersAssigned) * FOOD_PER_FARMER;
  const armyRequested = clampNonNegative(fortressLike.recruitersAssigned) * ARMY_PER_RECRUITER;
  const availableFood = clampNonNegative(fortressLike.food) + foodProduced;
  const armyProduced = Math.min(
    armyRequested,
    Math.floor(availableFood / FOOD_COST_PER_ARMY)
  );
  const foodConsumed = armyProduced * FOOD_COST_PER_ARMY;
  const foodAfterProduction = availableFood - foodConsumed;

  return {
    population,
    pointsProduced,
    foodProduced,
    armyRequested,
    armyProduced,
    foodConsumed,
    foodAfterProduction,
  } satisfies TickProductionResult;
}

export function calculateRaidOutcome(input: RaidOutcomeInput): RaidOutcome {
  const attackArmy = clampInteger(input.attackArmy);
  const defenderArmy = clampInteger(input.defenderArmy);
  const defenderPoints = clampInteger(input.defenderPoints);
  const defenderFood = clampInteger(input.defenderFood);
  const attackPower = attackArmy;
  const defenseMultiplier = getFortressDefenseMultiplier(input.defenderDbLevel);
  const defensePower = Math.floor(
    getEffectiveDefendingArmy(defenderArmy, input.defenderDbLevel)
  );
  const attackerWon = attackPower > defensePower;
  const outcome: RaidOutcome["outcome"] = attackerWon
    ? "ATTACKER_WIN"
    : "DEFENDER_WIN";

  const attackerSurvivors = attackerWon
    ? Math.max(
        0,
        Math.floor(
          attackPower * WINNING_ATTACKER_BASE_SURVIVAL_FACTOR +
            (attackPower - defensePower) * WINNING_ATTACKER_MARGIN_SURVIVAL_FACTOR
        )
      )
    : 0;
  const attackerRetired = attackerWon
    ? Math.ceil(attackerSurvivors * ATTACKER_RETIREMENT_RATE)
    : 0;
  const attackerReturned = Math.max(0, attackerSurvivors - attackerRetired);
  const defenderLosses = attackerWon
    ? Math.min(
        defenderArmy,
        Math.ceil(defenderArmy * DEFENDER_LOSS_RATE_ON_ATTACKER_WIN)
      )
    : Math.min(
        defenderArmy,
        Math.ceil(
          (attackPower / Math.max(defenseMultiplier, 1)) *
            FAILED_ATTACK_DEFENDER_CASUALTY_FACTOR
        )
      );

  let pointsLooted = 0;
  let foodLooted = 0;

  if (attackerWon) {
    const carryCapacity = attackerSurvivors * CARRY_CAPACITY_PER_SURVIVOR;
    const pointLootCap = Math.floor(defenderPoints * MAX_POINT_LOOT_PERCENT);
    const foodLootCap = Math.floor(defenderFood * MAX_FOOD_LOOT_PERCENT);

    const looted = splitRaidLoot({
      lootCapacity: carryCapacity,
      pointLootCap,
      foodLootCap,
    });

    pointsLooted = looted.pointsLooted;
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
    pointsLooted,
    foodLooted,
  };
}
