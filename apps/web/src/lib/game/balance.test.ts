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

test("race modifiers adjust population, defense, production, and carry capacity", () => {
  assert.equal(getFortressPopulation(0, "UNSTABLE_UNICORNS"), 27);
  assert.equal(getDefenseBonusPercent(0, "DWARFS"), 0.2);
  assert.equal(getFortressDefenseMultiplier(0, "SPACE_MURINES"), 1.15);
  assert.equal(getEffectiveDefendingArmy(100, 0, "DWARFS"), 120);

  const dwarfProduction = calculateTickProduction({
    level: 0,
    race: "DWARFS",
    food: 0,
    minersAssigned: 20,
    farmersAssigned: 0,
    recruitersAssigned: 0,
  });
  const unicornProduction = calculateTickProduction({
    level: 0,
    race: "UNSTABLE_UNICORNS",
    food: 0,
    minersAssigned: 0,
    farmersAssigned: 20,
    recruitersAssigned: 0,
  });
  const murineProduction = calculateTickProduction({
    level: 0,
    race: "SPACE_MURINES",
    food: 50,
    minersAssigned: 0,
    farmersAssigned: 0,
    recruitersAssigned: 20,
  });

  assert.equal(dwarfProduction.goldProduced, 22);
  assert.equal(unicornProduction.foodProduced, 22);
  assert.equal(murineProduction.armyRequested, 22);

  const baseRaid = calculateRaidOutcome({
    attackArmy: 20,
    defenderArmy: 4,
    defenderDbLevel: 0,
    defenderPoints: 2000,
    defenderFood: 2000,
  });
  const orkRaid = calculateRaidOutcome({
    attackArmy: 20,
    attackerRace: "ORKS",
    defenderArmy: 4,
    defenderDbLevel: 0,
    defenderPoints: 2000,
    defenderFood: 2000,
  });

  assert.equal(baseRaid.pointsLooted + baseRaid.foodLooted, 128);
  assert.equal(orkRaid.pointsLooted + orkRaid.foodLooted, 224);
});

test("null legacy race uses base economy and combat safely", () => {
  assert.equal(getFortressPopulation(0, null), 25);
  assert.equal(getFortressDefenseMultiplier(0, null), 1.1);

  const production = calculateTickProduction({
    level: 0,
    race: null,
    food: 0,
    minersAssigned: 10,
    farmersAssigned: 10,
    recruitersAssigned: 5,
  });

  assert.equal(production.goldProduced, 10);
  assert.equal(production.foodProduced, 10);
  assert.equal(production.armyRequested, 5);
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

test("tick production converts workers into gold, food, and food-limited army", () => {
  const production = calculateTickProduction({
    level: 0,
    food: 1,
    minersAssigned: 2,
    farmersAssigned: 3,
    recruitersAssigned: 5,
  });

  assert.equal(production.population, 25);
  assert.equal(production.goldProduced, 2);
  assert.equal(production.foodProduced, 3);
  assert.equal(production.armyRequested, 5);
  assert.equal(production.armyProduced, 4);
  assert.equal(production.foodConsumed, 4);
  assert.equal(production.foodAfterProduction, 0);
});

test("castle specializations stack production and defense bonuses", () => {
  const production = calculateTickProduction({
    level: 0,
    food: 100,
    minersAssigned: 20,
    farmersAssigned: 20,
    recruitersAssigned: 20,
    castleSpecializations: {
      POINTS: 2,
      FOOD: 1,
      MILITARY: 3,
      DEFENSE: 0,
    },
  });

  assert.equal(production.goldProduced, 24);
  assert.equal(production.foodProduced, 22);
  assert.equal(production.armyRequested, 26);
  assert.equal(
    getDefenseBonusPercent(0, null, {
      POINTS: 0,
      FOOD: 0,
      MILITARY: 0,
      DEFENSE: 2,
    }),
    0.30000000000000004
  );
  assert.equal(
    getFortressDefenseMultiplier(0, null, {
      POINTS: 0,
      FOOD: 0,
      MILITARY: 0,
      DEFENSE: 2,
    }),
    1.3
  );

  const specializedDefense = calculateRaidOutcome({
    attackArmy: 12,
    defenderArmy: 10,
    defenderDbLevel: 0,
    defenderCastleSpecializations: {
      POINTS: 0,
      FOOD: 0,
      MILITARY: 0,
      DEFENSE: 2,
    },
    defenderPoints: 20,
    defenderFood: 20,
  });

  assert.equal(specializedDefense.outcome, "DEFENDER_WIN");
  assert.equal(specializedDefense.defenseMultiplier, 1.3);
  assert.equal(specializedDefense.defensePower, 13);
});

test("race combat buffs can adjust power and casualty handling", () => {
  const dwarfAttack = calculateRaidOutcome({
    attackArmy: 100,
    attackPowerMultiplier: 1.25,
    defenderArmy: 100,
    defenderDbLevel: 0,
    defenderPoints: 100,
    defenderFood: 100,
  });
  const stimDefense = calculateRaidOutcome({
    attackArmy: 100,
    defenderArmy: 10,
    defenderDbLevel: 0,
    preventDefenderLosses: true,
    defenderPoints: 100,
    defenderFood: 100,
  });
  const stimAttack = calculateRaidOutcome({
    attackArmy: 10,
    defenderArmy: 100,
    defenderDbLevel: 0,
    preventAttackerCasualties: true,
    defenderPoints: 100,
    defenderFood: 100,
  });

  assert.equal(dwarfAttack.attackPower, 125);
  assert.equal(dwarfAttack.outcome, "ATTACKER_WIN");
  assert.equal(stimDefense.defenderLosses, 0);
  assert.equal(stimAttack.attackerReturned, 10);
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
  assert.equal(outcome.attackerReturned, 9);
  assert.equal(outcome.defenderLosses, 4);
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
  assert.equal(outcome.defenderLosses, 2);
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
  assert.equal(outcome.attackerRetired, 0);
  assert.equal(outcome.attackerReturned, 28);
  assert.equal(outcome.defenderLosses, 70);
  assert.equal(outcome.pointsLooted, 112);
  assert.equal(outcome.foodLooted, 112);
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
  assert.equal(outcome.pointsLooted, 14);
  assert.equal(outcome.foodLooted, 8);
});

test("loot splits by carry capacity when resource caps do not bind", () => {
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
  assert.equal(outcome.pointsLooted, 64);
  assert.equal(outcome.foodLooted, 64);
});

test("attacker win wipes defender when target has no castle defenses", () => {
  const outcome = calculateRaidOutcome({
    attackArmy: 25,
    defenderArmy: 10,
    defenderDbLevel: 0,
    defenderHasCastle: false,
    defenderRace: null,
    defenderPoints: 100,
    defenderFood: 100,
  });

  assert.equal(outcome.outcome, "ATTACKER_WIN");
  assert.equal(outcome.defenderLosses, 10);
});
