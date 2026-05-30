// =============================================================================
// Unit tests for balance.ts, army-recruitment.ts, fortress-validation.ts
// Uses node:test (project's native test runner via tsx --test)
// =============================================================================

import { describe, it } from "node:test";
import assert from "node:assert/strict";

// ── balance.ts ───────────────────────────────────────────────────────────────

import {
  getDisplayedCastleLevel,
  getFortressPopulation,
  getDefenseBonusPercent,
  getFortressDefenseMultiplier,
  getEffectiveDefendingArmy,
  validateWorkerAssignments,
  calculateTickProduction,
  calculateRaidOutcome,
  BASE_POPULATION,
  POPULATION_PER_DB_LEVEL,
  GOLD_PER_MINER,
  FOOD_PER_FARMER,
  ARMY_PER_RECRUITER,
  DEFENSE_BONUS_PER_DISPLAYED_LEVEL,
  FAILED_ATTACK_DEFENDER_CASUALTY_FACTOR,
  WINNING_ATTACKER_BASE_SURVIVAL_FACTOR,
  DEFENDER_LOSS_RATE_ON_ATTACKER_WIN,
  CARRY_CAPACITY_PER_SURVIVOR,
  MAX_POINT_LOOT_PERCENT,
  MAX_FOOD_LOOT_PERCENT,
  getTotalDefenderArmy,
  distributeDefenderCasualties,
} from "./balance";

describe("balance", () => {
  describe("constants", () => {
    it("BASE_POPULATION is 25", () => {
      assert.equal(BASE_POPULATION, 25);
    });
    it("POPULATION_PER_DB_LEVEL is 10", () => {
      assert.equal(POPULATION_PER_DB_LEVEL, 10);
    });
    it("production rates are 1", () => {
      assert.equal(GOLD_PER_MINER, 1);
      assert.equal(FOOD_PER_FARMER, 1);
      assert.equal(ARMY_PER_RECRUITER, 1);
    });
    it("defense bonus per level is 10%", () => {
      assert.equal(DEFENSE_BONUS_PER_DISPLAYED_LEVEL, 0.1);
    });
    it("defender casualty rate on attacker loss is 35%", () => {
      assert.equal(FAILED_ATTACK_DEFENDER_CASUALTY_FACTOR, 0.35);
    });
    it("attacker base survival is 15%", () => {
      assert.equal(WINNING_ATTACKER_BASE_SURVIVAL_FACTOR, 0.15);
    });
    it("defender loss rate on attacker win is 70%", () => {
      assert.equal(DEFENDER_LOSS_RATE_ON_ATTACKER_WIN, 0.7);
    });
    it("carry capacity per survivor is 8", () => {
      assert.equal(CARRY_CAPACITY_PER_SURVIVOR, 8);
    });
    it("max loot percentages are 70%", () => {
      assert.equal(MAX_POINT_LOOT_PERCENT, 0.7);
      assert.equal(MAX_FOOD_LOOT_PERCENT, 0.7);
    });
  });

  describe("getDisplayedCastleLevel", () => {
    it("adds 1 to dbLevel", () => {
      assert.equal(getDisplayedCastleLevel(0), 1);
      assert.equal(getDisplayedCastleLevel(5), 6);
      assert.equal(getDisplayedCastleLevel(9), 10);
    });
  });

  describe("getFortressPopulation", () => {
    it("base population with no race", () => {
      assert.equal(getFortressPopulation(0), 25);
      assert.equal(getFortressPopulation(3), 55);
      assert.equal(getFortressPopulation(10), 125);
    });
    it("unicorns get +2 population", () => {
      const unicornPop = getFortressPopulation(0, "UNSTABLE_UNICORNS");
      assert.equal(unicornPop, 27);
    });
    it("dwarfs get base population", () => {
      assert.equal(getFortressPopulation(0, "DWARFS"), 25);
    });
  });

  describe("getDefenseBonusPercent", () => {
    it("scales with level", () => {
      const bonus = getDefenseBonusPercent(0); // displayed = 1, bonus = 0.1
      assert.ok(bonus > 0);
    });
    it("dwarfs get +10% defense", () => {
      const base = getDefenseBonusPercent(0);
      const dwarf = getDefenseBonusPercent(0, "DWARFS");
      assert.ok(dwarf > base);
      assert.equal(Math.round((dwarf - base) * 100), 10);
    });
    it("space murines get +5% defense", () => {
      const base = getDefenseBonusPercent(0);
      const murine = getDefenseBonusPercent(0, "SPACE_MURINES");
      assert.ok(murine > base);
      assert.equal(Math.round((murine - base) * 100), 5);
    });
  });

  describe("getFortressDefenseMultiplier", () => {
    it("is 1 + defense bonus", () => {
      const mult = getFortressDefenseMultiplier(0);
      assert.ok(mult > 1);
    });
    it("scales with dwarf defense", () => {
      const dwarf = getFortressDefenseMultiplier(5, "DWARFS");
      assert.ok(dwarf > 1.5);
    });
  });

  describe("getEffectiveDefendingArmy", () => {
    it("multiplies army by defense multiplier", () => {
      const effective = getEffectiveDefendingArmy(100, 0);
      assert.ok(effective > 100);
    });
    it("higher level = stronger defense", () => {
      const low = getEffectiveDefendingArmy(100, 0);
      const high = getEffectiveDefendingArmy(100, 5);
      assert.ok(high > low);
    });
  });

  describe("validateWorkerAssignments", () => {
    it("valid within population", () => {
      const result = validateWorkerAssignments({
        level: 0,
        minersAssigned: 10,
        farmersAssigned: 10,
        recruitersAssigned: 5,
      });
      assert.equal(result.isValid, true);
      assert.equal(result.population, 25);
      assert.equal(result.totalAssigned, 25);
    });
    it("invalid when exceeding population", () => {
      const result = validateWorkerAssignments({
        level: 0,
        minersAssigned: 20,
        farmersAssigned: 20,
        recruitersAssigned: 5,
      });
      assert.equal(result.isValid, false);
    });
    it("invalid with negative workers", () => {
      const result = validateWorkerAssignments({
        level: 0,
        minersAssigned: -1,
        farmersAssigned: 10,
        recruitersAssigned: 5,
      });
      assert.equal(result.isValid, false);
    });
    it("includes pressure workers in total", () => {
      const result = validateWorkerAssignments({
        level: 0,
        minersAssigned: 5,
        farmersAssigned: 5,
        recruitersAssigned: 5,
        pressureWorkersAssigned: 10,
      });
      assert.equal(result.totalAssigned, 25);
      assert.equal(result.isValid, true);
    });
  });

  describe("calculateTickProduction", () => {
    it("produces gold from miners", () => {
      const result = calculateTickProduction({
        level: 0,
        minersAssigned: 10,
        farmersAssigned: 5,
        recruitersAssigned: 5,
        food: 100,
      });
      assert.ok(result.goldProduced >= 10);
      assert.ok(result.foodProduced >= 5);
    });
    it("army production limited by food", () => {
      const result = calculateTickProduction({
        level: 0,
        minersAssigned: 0,
        farmersAssigned: 0,
        recruitersAssigned: 50,
        food: 0,
      });
      assert.equal(result.armyProduced, 0);
    });
    it("food decreases when army is produced", () => {
      const result = calculateTickProduction({
        level: 0,
        minersAssigned: 0,
        farmersAssigned: 0,
        recruitersAssigned: 10,
        food: 20,
      });
      assert.ok(result.foodConsumed > 0);
      assert.ok(result.foodAfterProduction < 20 + result.foodProduced);
    });
    it("population matches getFortressPopulation", () => {
      const result = calculateTickProduction({
        level: 3,
        minersAssigned: 10,
        farmersAssigned: 10,
        recruitersAssigned: 5,
        food: 100,
      });
      assert.equal(result.population, getFortressPopulation(3));
    });
  });

  describe("calculateRaidOutcome", () => {
    it("defender wins when equal power", () => {
      // 100 army vs 100 army, no level/race bonuses → defense multiplier = 1.1 (level 0 displayed = 1)
      // defense power = 100 * 1.1 = 110, attack power = 100 → defender wins
      const result = calculateRaidOutcome({
        attackArmy: 100,
        defenderArmy: 100,
        defenderDbLevel: 0,
        defenderFood: 0,
      });
      assert.equal(result.outcome, "DEFENDER_WIN");
    });
    it("attacker wins with overwhelming force", () => {
      const result = calculateRaidOutcome({
        attackArmy: 500,
        defenderArmy: 50,
        defenderDbLevel: 0,
        defenderFood: 0,
      });
      assert.equal(result.outcome, "ATTACKER_WIN");
    });
    it("attacker loses all units on loss", () => {
      const result = calculateRaidOutcome({
        attackArmy: 10,
        defenderArmy: 200,
        defenderDbLevel: 5,
        defenderFood: 0,
      });
      assert.equal(result.outcome, "DEFENDER_WIN");
      assert.equal(result.attackerSurvivors, 0);
      assert.equal(result.attackerReturned, 0);
    });
    it("loot is proportional to survivor count", () => {
      const result = calculateRaidOutcome({
        attackArmy: 200,
        defenderArmy: 10,
        defenderDbLevel: 0,
        defenderGold: 1000,
        defenderFood: 1000,
      });
      assert.equal(result.outcome, "ATTACKER_WIN");
      assert.ok(result.goldLooted > 0);
      assert.ok(result.foodLooted > 0);
    });
    it("loot respects carry capacity", () => {
      const result = calculateRaidOutcome({
        attackArmy: 100,
        defenderArmy: 5,
        defenderDbLevel: 0,
        defenderGold: 10000,
        defenderFood: 10000,
      });
      const totalLooted = result.goldLooted + result.foodLooted;
      const maxLoot = result.attackerSurvivors * CARRY_CAPACITY_PER_SURVIVOR;
      assert.ok(totalLooted <= maxLoot);
    });
    it("loot capped at 70% of defender resources", () => {
      const result = calculateRaidOutcome({
        attackArmy: 1000,
        defenderArmy: 5,
        defenderDbLevel: 0,
        defenderGold: 100,
        defenderFood: 100,
      });
      assert.ok(result.goldLooted <= 70);
      assert.ok(result.foodLooted <= 70);
    });
    it("defender takes casualties on attacker loss", () => {
      const result = calculateRaidOutcome({
        attackArmy: 80,
        defenderArmy: 200,
        defenderDbLevel: 0,
        defenderFood: 0,
      });
      assert.equal(result.outcome, "DEFENDER_WIN");
      // Defender should take some casualties even when winning
      assert.ok(result.defenderLosses > 0);
    });
    it("attack power multiplier increases damage", () => {
      const normal = calculateRaidOutcome({
        attackArmy: 100,
        defenderArmy: 50,
        defenderDbLevel: 0,
        defenderFood: 0,
      });
      const boosted = calculateRaidOutcome({
        attackArmy: 100,
        defenderArmy: 50,
        defenderDbLevel: 0,
        defenderFood: 0,
        attackPowerMultiplier: 2.0,
      });
      assert.ok(boosted.attackPower > normal.attackPower);
    });
    it("dwarf defenders are harder to beat", () => {
      const vsNeutral = calculateRaidOutcome({
        attackArmy: 150,
        defenderArmy: 100,
        defenderDbLevel: 2,
        defenderFood: 0,
      });
      const vsDwarf = calculateRaidOutcome({
        attackArmy: 150,
        defenderArmy: 100,
        defenderDbLevel: 2,
        defenderRace: "DWARFS",
        defenderFood: 0,
      });
      assert.ok(vsDwarf.defensePower > vsNeutral.defensePower);
    });
  });

  describe("getTotalDefenderArmy", () => {
    it("sums fortress, guard, and garrison army", () => {
      const total = getTotalDefenderArmy({
        fortressArmy: 100,
        guardArmy: 50,
        garrisonArmy: 30,
      });
      assert.equal(total, 180);
    });
    it("handles zero values", () => {
      assert.equal(getTotalDefenderArmy({ fortressArmy: 0, guardArmy: 0, garrisonArmy: 0 }), 0);
      assert.equal(getTotalDefenderArmy({ fortressArmy: 100, guardArmy: 0, garrisonArmy: 0 }), 100);
    });
    it("floors non-integer inputs", () => {
      const total = getTotalDefenderArmy({
        fortressArmy: 100.7,
        guardArmy: 50.2,
        garrisonArmy: 30.9,
      });
      assert.equal(total, 180);
    });
  });

  describe("distributeDefenderCasualties", () => {
    it("guards take casualties first, then garrisons, then fortress", () => {
      const result = distributeDefenderCasualties({
        fortressArmy: 100,
        guardArmy: 50,
        garrisonArmy: 30,
        totalLosses: 60,
      });
      assert.equal(result.guardLosses, 50);
      assert.equal(result.garrisonLosses, 10);
      assert.equal(result.fortressLosses, 0);
    });
    it("all losses contained within guards when small", () => {
      const result = distributeDefenderCasualties({
        fortressArmy: 100,
        guardArmy: 50,
        garrisonArmy: 0,
        totalLosses: 30,
      });
      assert.equal(result.guardLosses, 30);
      assert.equal(result.garrisonLosses, 0);
      assert.equal(result.fortressLosses, 0);
    });
    it("losses capped at total defender army", () => {
      const result = distributeDefenderCasualties({
        fortressArmy: 10,
        guardArmy: 5,
        garrisonArmy: 2,
        totalLosses: 100,
      });
      assert.equal(result.guardLosses + result.garrisonLosses + result.fortressLosses, 17);
    });
    it("zero losses returns all zeros", () => {
      const result = distributeDefenderCasualties({
        fortressArmy: 100,
        guardArmy: 50,
        garrisonArmy: 30,
        totalLosses: 0,
      });
      assert.equal(result.guardLosses, 0);
      assert.equal(result.garrisonLosses, 0);
      assert.equal(result.fortressLosses, 0);
    });
  });
});

// ── army-recruitment.ts ──────────────────────────────────────────────────────

import {
  RECRUITMENT_COST_PER_UNIT,
  ARMY_UPKEEP_PER_UNIT,
  STARVATION_ATTRITION_RATE,
  getRecruitmentCost,
  canAffordRecruitment,
  calculateRecruitmentProgress,
  processRecruitmentQueue,
  getArmyUpkeepCost,
  getStarvationArmyLoss,
  calculateArmyUpkeep,
  canSustainArmy,
} from "./army-recruitment";

describe("army-recruitment", () => {
  describe("constants", () => {
    it("RECRUITMENT_COST_PER_UNIT is 1", () => {
      assert.equal(RECRUITMENT_COST_PER_UNIT, 1);
    });
    it("ARMY_UPKEEP_PER_UNIT is 0.01", () => {
      assert.equal(ARMY_UPKEEP_PER_UNIT, 0.01);
    });
    it("STARVATION_ATTRITION_RATE is 2%", () => {
      assert.equal(STARVATION_ATTRITION_RATE, 0.02);
    });
  });

  describe("getRecruitmentCost", () => {
    it("costs 1 gold per unit", () => {
      assert.equal(getRecruitmentCost(100), 100);
      assert.equal(getRecruitmentCost(1), 1);
      assert.equal(getRecruitmentCost(0), 0);
    });
    it("floors non-integer input", () => {
      assert.equal(getRecruitmentCost(10.9), 10);
    });
    it("returns 0 for negative input", () => {
      assert.equal(getRecruitmentCost(-5), 0);
    });
  });

  describe("canAffordRecruitment", () => {
    it("returns affordable when gold >= cost", () => {
      const result = canAffordRecruitment(50, 100);
      assert.equal(result.isAffordable, true);
      assert.equal(result.deficit, 0);
    });
    it("returns unaffordable with deficit", () => {
      const result = canAffordRecruitment(100, 30);
      assert.equal(result.isAffordable, false);
      assert.equal(result.deficit, 70);
    });
  });

  describe("calculateRecruitmentProgress", () => {
    it("1 recruiter = 1 unit/tick baseline", () => {
      const progress = calculateRecruitmentProgress(100, 10);
      assert.equal(progress.recruiterCapacityPerTick, 10);
      assert.equal(progress.ticksToComplete, 10);
    });
    it("returns Infinity when no recruiters", () => {
      const progress = calculateRecruitmentProgress(100, 0);
      assert.equal(progress.recruiterCapacityPerTick, 0);
      assert.equal(progress.ticksToComplete, Infinity);
    });
    it("space murines recruit faster", () => {
      const neutral = calculateRecruitmentProgress(100, 20);
      const murine = calculateRecruitmentProgress(100, 20, "SPACE_MURINES");
      assert.ok(murine.recruiterCapacityPerTick >= neutral.recruiterCapacityPerTick);
    });
  });

  describe("processRecruitmentQueue", () => {
    it("creates units up to capacity", () => {
      const result = processRecruitmentQueue(100, 10);
      assert.equal(result.unitsCreated, 10);
      assert.equal(result.newQueue, 90);
    });
    it("does not over-process", () => {
      const result = processRecruitmentQueue(5, 20);
      assert.equal(result.unitsCreated, 5);
      assert.equal(result.newQueue, 0);
    });
  });

  describe("getArmyUpkeepCost", () => {
    it("500 army = 5 food/tick", () => {
      assert.equal(getArmyUpkeepCost(500), 5);
    });
    it("0 army = 0 food", () => {
      assert.equal(getArmyUpkeepCost(0), 0);
    });
  });

  describe("getStarvationArmyLoss", () => {
    it("loses at least 1 unit when positive", () => {
      assert.equal(getStarvationArmyLoss(1), 1);
      assert.equal(getStarvationArmyLoss(10), 1);
    });
    it("loses 2% rounded up for large armies", () => {
      const loss = getStarvationArmyLoss(1000);
      assert.equal(loss, 20); // 2% of 1000
    });
    it("returns 0 for 0 army", () => {
      assert.equal(getStarvationArmyLoss(0), 0);
    });
  });

  describe("canSustainArmy", () => {
    it("sustainable with enough food", () => {
      const result = canSustainArmy(500, 20);
      assert.equal(result.isSustainable, true);
      assert.equal(result.upkeepPerTick, 5);
    });
    it("unsustainable with low food", () => {
      const result = canSustainArmy(500, 2);
      assert.equal(result.isSustainable, false);
    });
    it("calculates ticks until starving", () => {
      // 500 army = 5 food/tick, 20 food → 4 ticks
      const result = canSustainArmy(500, 20);
      assert.equal(result.ticksUntilStarving, 4);
    });
    it("Infinite ticks when no upkeep", () => {
      const result = canSustainArmy(0, 0);
      assert.equal(result.ticksUntilStarving, Infinity);
    });
  });
});

// ── fortress-validation.ts ───────────────────────────────────────────────────

import {
  validateFortressUpgrade,
  validateAndDescribeWorkerAssignment,
  validateProduction,
  validateCanAttack,
  performFortressHealthCheck,
} from "./fortress-validation";

describe("fortress-validation", () => {
  describe("validateFortressUpgrade", () => {
    it("valid when enough gold", () => {
      const result = validateFortressUpgrade({ level: 0 }, 10000);
      assert.equal(result.isValid, true);
      assert.equal(result.canUpgrade, true);
    });
    it("invalid with insufficient gold", () => {
      const result = validateFortressUpgrade({ level: 5 }, 1);
      assert.equal(result.isValid, false);
      assert.ok(result.reason?.includes("Insufficient"));
    });
    it("invalid at max level", () => {
      const result = validateFortressUpgrade({ level: 9 }, 999999);
      assert.equal(result.isValid, false);
      assert.ok(result.reason?.includes("maximum"));
    });
  });

  describe("validateAndDescribeWorkerAssignment", () => {
    it("returns available population", () => {
      const result = validateAndDescribeWorkerAssignment({
        level: 0,
        minersAssigned: 5,
        farmersAssigned: 5,
        recruitersAssigned: 5,
      });
      assert.equal(result.isValid, true);
      assert.ok(result.availablePopulation > 0);
    });
  });

  describe("validateProduction", () => {
    it("healthy with workers assigned", () => {
      const result = validateProduction({
        level: 0,
        minersAssigned: 5,
        farmersAssigned: 5,
        recruitersAssigned: 5,
        food: 100,
      });
      assert.equal(result.status, "healthy");
    });
    it("zero production with no workers", () => {
      const result = validateProduction({
        level: 0,
        minersAssigned: 0,
        farmersAssigned: 0,
        recruitersAssigned: 0,
        food: 100,
      });
      assert.equal(result.status, "zero_production");
    });
  });

  describe("validateCanAttack", () => {
    it("can attack under limit", () => {
      const result = validateCanAttack({ level: 2 }, 2);
      assert.equal(result.canAttack, true);
    });
    it("cannot attack at limit", () => {
      // Base max = 2 + level = 4 at level 2
      const result = validateCanAttack({ level: 2 }, 4);
      assert.equal(result.canAttack, false);
    });
  });

  describe("performFortressHealthCheck", () => {
    it("returns comprehensive health report", () => {
      const report = performFortressHealthCheck(
        { level: 2, minersAssigned: 5, farmersAssigned: 5, recruitersAssigned: 5, food: 100 },
        5000,
        0,
      );
      assert.ok("upgrade" in report);
      assert.ok("workers" in report);
      assert.ok("production" in report);
      assert.ok("attacks" in report);
      assert.equal(typeof report.overallHealthy, "boolean");
    });
    it("flags zero production as unhealthy", () => {
      const report = performFortressHealthCheck(
        { level: 2, minersAssigned: 0, farmersAssigned: 0, recruitersAssigned: 0, food: 100 },
        5000,
        0,
      );
      assert.equal(report.overallHealthy, false);
    });
  });
});
