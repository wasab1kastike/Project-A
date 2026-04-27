import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateRaidOutcome,
  calculateTickProduction,
  getDefenseBonusPercent,
  getDisplayedCastleLevel,
  getEffectiveDefendingArmy,
  getFortressDefenseMultiplier,
  getFortressPopulation,
  validateWorkerAssignments,
} from "./balance";

test("balance helpers derive castle level, population, and defense from db level", () => {
  assert.equal(getDisplayedCastleLevel(0), 1);
  assert.equal(getDisplayedCastleLevel(1), 2);
  assert.equal(getFortressPopulation(0), 25);
  assert.equal(getFortressPopulation(2), 45);
  assert.equal(getDefenseBonusPercent(0), 0.1);
  assert.equal(getFortressDefenseMultiplier(0), 1.1);
  assert.equal(getFortressDefenseMultiplier(2), 1.3);
  assert.equal(getEffectiveDefendingArmy(10, 2), 13);
});

test("worker assignment validation allows idle population and rejects overflow", () => {
  const valid = validateWorkerAssignments({
    level: 0,
    minersAssigned: 10,
    farmersAssigned: 10,
    recruitersAssigned: 5,
  });
  const idle = validateWorkerAssignments({
    level: 1,
    minersAssigned: 0,
    farmersAssigned: 0,
    recruitersAssigned: 0,
  });
  const overflow = validateWorkerAssignments({
    level: 0,
    minersAssigned: 11,
    farmersAssigned: 10,
    recruitersAssigned: 5,
  });
  const negative = validateWorkerAssignments({
    level: 0,
    minersAssigned: -1,
    farmersAssigned: 10,
    recruitersAssigned: 5,
  });

  assert.equal(valid.isValid, true);
  assert.equal(idle.isValid, true);
  assert.equal(overflow.isValid, false);
  assert.equal(negative.isValid, false);
  assert.equal(valid.totalAssigned, 25);
  assert.equal(idle.totalAssigned, 0);
});

test("tick production converts workers into points, food, and food-limited army", () => {
  const production = calculateTickProduction({
    level: 0,
    food: 1,
    minersAssigned: 2,
    farmersAssigned: 3,
    recruitersAssigned: 5,
  });

  assert.equal(production.population, 25);
  assert.equal(production.pointsProduced, 2);
  assert.equal(production.foodProduced, 3);
  assert.equal(production.armyRequested, 5);
  assert.equal(production.armyProduced, 4);
  assert.equal(production.foodConsumed, 4);
  assert.equal(production.foodAfterProduction, 0);
});

test("tie goes to the defender and the attacker loses all sent army", () => {
  const outcome = calculateRaidOutcome({
    attackArmy: 11,
    defenderArmy: 10,
    defenderDbLevel: 0,
    defenderPoints: 20,
    defenderFood: 20,
  });

  assert.equal(outcome.outcome, "DEFENDER_WIN");
  assert.equal(outcome.attackPower, 11);
  assert.equal(outcome.defenseMultiplier, 1.1);
  assert.equal(outcome.defensePower, 11);
  assert.equal(outcome.attackerSurvivors, 0);
  assert.equal(outcome.attackerRetired, 0);
  assert.equal(outcome.attackerReturned, 0);
  assert.equal(outcome.defenderLosses, 7);
  assert.equal(outcome.pointsLooted, 0);
  assert.equal(outcome.foodLooted, 0);
});

test("attacker loses all sent army when attack power does not beat defense power", () => {
  const outcome = calculateRaidOutcome({
    attackArmy: 5,
    defenderArmy: 10,
    defenderDbLevel: 0,
    defenderPoints: 20,
    defenderFood: 20,
  });

  assert.equal(outcome.outcome, "DEFENDER_WIN");
  assert.equal(outcome.attackPower, 5);
  assert.equal(outcome.defenseMultiplier, 1.1);
  assert.equal(outcome.defensePower, 11);
  assert.equal(outcome.attackerSurvivors, 0);
  assert.equal(outcome.attackerRetired, 0);
  assert.equal(outcome.attackerReturned, 0);
  assert.equal(outcome.defenderLosses, 3);
  assert.equal(outcome.pointsLooted, 0);
  assert.equal(outcome.foodLooted, 0);
});

test("successful raid outcome applies retirement, losses, and balanced loot", () => {
  const outcome = calculateRaidOutcome({
    attackArmy: 130,
    defenderArmy: 100,
    defenderDbLevel: 1,
    defenderPoints: 200,
    defenderFood: 200,
  });

  assert.equal(outcome.outcome, "ATTACKER_WIN");
  assert.equal(outcome.attackPower, 130);
  assert.equal(outcome.defenseMultiplier, 1.2);
  assert.equal(outcome.defensePower, 120);
  assert.equal(outcome.attackerSurvivors, 28);
  assert.equal(outcome.attackerRetired, 14);
  assert.equal(outcome.attackerReturned, 14);
  assert.equal(outcome.defenderLosses, 70);
  assert.equal(outcome.pointsLooted, 28);
  assert.equal(outcome.foodLooted, 28);
});

test("loot is capped by carry capacity and by point and food caps", () => {
  const outcome = calculateRaidOutcome({
    attackArmy: 10,
    defenderArmy: 1,
    defenderDbLevel: 0,
    defenderPoints: 20,
    defenderFood: 12,
  });

  assert.equal(outcome.outcome, "ATTACKER_WIN");
  assert.equal(outcome.attackerSurvivors, 9);
  assert.equal(outcome.attackerRetired, 5);
  assert.equal(outcome.attackerReturned, 4);
  assert.equal(outcome.pointsLooted, 3);
  assert.equal(outcome.foodLooted, 3);
});

test("loot uses remaining capacity when one resource is capped earlier", () => {
  const outcome = calculateRaidOutcome({
    attackArmy: 20,
    defenderArmy: 4,
    defenderDbLevel: 0,
    defenderPoints: 100,
    defenderFood: 100,
  });

  assert.equal(outcome.outcome, "ATTACKER_WIN");
  assert.equal(outcome.attackerSurvivors, 16);
  assert.equal(outcome.attackerRetired, 8);
  assert.equal(outcome.attackerReturned, 8);
  assert.equal(outcome.defenderLosses, 3);
  assert.equal(outcome.pointsLooted, 15);
  assert.equal(outcome.foodLooted, 17);
});
