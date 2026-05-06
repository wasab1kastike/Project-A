import assert from "node:assert/strict";
import test from "node:test";
import {
  getRecruitmentCost,
  canAffordRecruitment,
  calculateRecruitmentProgress,
  processRecruitmentQueue,
  getArmyUpkeepCost,
  calculateArmyUpkeep,
  canSustainArmy,
  compareRecruitmentSystems,
  RECRUITMENT_COST_PER_UNIT,
  ARMY_UPKEEP_PER_UNIT,
} from "./army-recruitment";

test("recruitment cost calculation is straightforward", () => {
  assert.equal(getRecruitmentCost(0), 0);
  assert.equal(getRecruitmentCost(1), 1);
  assert.equal(getRecruitmentCost(100), 100);
  assert.equal(getRecruitmentCost(1000), 1000);
  assert.equal(getRecruitmentCost(3.7), 3); // Floors the input
});

test("affordability check validates available gold against recruitment cost", () => {
  const afford100 = canAffordRecruitment(100, 100);
  const afford100_lacking = canAffordRecruitment(100, 50);
  const afford100_exceeding = canAffordRecruitment(100, 150);

  assert.equal(afford100.isAffordable, true);
  assert.equal(afford100.costNeeded, 100);
  assert.equal(afford100.deficit, 0);

  assert.equal(afford100_lacking.isAffordable, false);
  assert.equal(afford100_lacking.costNeeded, 100);
  assert.equal(afford100_lacking.deficit, 50);

  assert.equal(afford100_exceeding.isAffordable, true);
  assert.equal(afford100_exceeding.costNeeded, 100);
  assert.equal(afford100_exceeding.deficit, 0);
});

test("recruitment progress calculates ticks to completion based on recruiter capacity", () => {
  // 100 units, 10 recruiters (10 units/tick) = 10 ticks
  const progress10 = calculateRecruitmentProgress(100, 10);
  assert.equal(progress10.queueRemaining, 100);
  assert.equal(progress10.recruiterCapacityPerTick, 10);
  assert.equal(progress10.ticksToComplete, 10);

  // 100 units, 5 recruiters (5 units/tick) = 20 ticks
  const progress5 = calculateRecruitmentProgress(100, 5);
  assert.equal(progress5.recruiterCapacityPerTick, 5);
  assert.equal(progress5.ticksToComplete, 20);

  // 100 units, 0 recruiters (0 units/tick) = Infinity
  const progress0 = calculateRecruitmentProgress(100, 0);
  assert.equal(progress0.recruiterCapacityPerTick, 0);
  assert.equal(progress0.ticksToComplete, Infinity);

  // 97 units, 10 recruiters = ceil(97/10) = 10 ticks
  const progress97 = calculateRecruitmentProgress(97, 10);
  assert.equal(progress97.ticksToComplete, 10);
});

test("race modifiers increase recruitment speed", () => {
  // SPACE_MURINES: +1 army per 10 recruiters
  const murineProgress = calculateRecruitmentProgress(100, 10, "SPACE_MURINES");
  // Base: 10, Bonus: floor(10/10)*1 = 1, Total: 11
  assert.equal(murineProgress.recruiterCapacityPerTick, 11);
  assert.equal(murineProgress.ticksToComplete, 10); // ceil(100/11) = 10

  // DWARFS: no army bonus
  const dwarfProgress = calculateRecruitmentProgress(100, 10, "DWARFS");
  assert.equal(dwarfProgress.recruiterCapacityPerTick, 10);

  // ORKS: +1 army per 10 recruiters
  const orkProgress = calculateRecruitmentProgress(100, 10, "ORKS");
  assert.equal(orkProgress.recruiterCapacityPerTick, 11);
});

test("recruitment queue processes one tick at a time", () => {
  // Tick 1: 100 queue, 10 recruiters → 10 created, 90 remaining
  const tick1 = processRecruitmentQueue(100, 10);
  assert.equal(tick1.unitsCreated, 10);
  assert.equal(tick1.newQueue, 90);

  // Tick 2: 90 queue, 10 recruiters → 10 created, 80 remaining
  const tick2 = processRecruitmentQueue(90, 10);
  assert.equal(tick2.unitsCreated, 10);
  assert.equal(tick2.newQueue, 80);

  // Tick 10: 10 queue, 10 recruiters → 10 created, 0 remaining (done!)
  const tick10 = processRecruitmentQueue(10, 10);
  assert.equal(tick10.unitsCreated, 10);
  assert.equal(tick10.newQueue, 0);

  // Tick 11: 0 queue → nothing happens
  const tick11 = processRecruitmentQueue(0, 10);
  assert.equal(tick11.unitsCreated, 0);
  assert.equal(tick11.newQueue, 0);
});

test("recruitment queue respects recruiter capacity ceiling", () => {
  // If queue has 5 but capacity is 10, only create 5
  const underCapacity = processRecruitmentQueue(5, 10);
  assert.equal(underCapacity.unitsCreated, 5);
  assert.equal(underCapacity.newQueue, 0);

  // If queue has 100 and capacity is 10, create exactly 10
  const atCapacity = processRecruitmentQueue(100, 10);
  assert.equal(atCapacity.unitsCreated, 10);
  assert.equal(atCapacity.newQueue, 90);
});

test("army upkeep cost is 0.25 food per unit per tick", () => {
  assert.equal(getArmyUpkeepCost(0), 0);
  assert.equal(getArmyUpkeepCost(1), 0.25);
  assert.equal(getArmyUpkeepCost(100), 25);
  assert.equal(getArmyUpkeepCost(500), 125);
  assert.equal(getArmyUpkeepCost(1000), 250);
});

test("army upkeep calculation returns detailed breakdown", () => {
  const upkeep = calculateArmyUpkeep(100);
  assert.equal(upkeep.activeArmyCount, 100);
  assert.equal(upkeep.foodCostPerTick, 25);
});

test("army sustainability check validates food reserves against upkeep", () => {
  // 100 army, 30 food available, upkeep is 25/tick
  const sustainable = canSustainArmy(100, 30);
  assert.equal(sustainable.isSustainable, true);
  assert.equal(sustainable.upkeepPerTick, 25);
  assert.equal(sustainable.foodRemaining, 5);
  assert.equal(sustainable.ticksUntilStarving, 1);

  // 100 army, 10 food available (not enough for one tick)
  const starving = canSustainArmy(100, 10);
  assert.equal(starving.isSustainable, false);
  assert.equal(starving.foodRemaining, 0); // Clamped to 0
  assert.equal(starving.ticksUntilStarving, 0);

  // 100 army, 500 food available (plenty)
  const wealthy = canSustainArmy(100, 500);
  assert.equal(wealthy.isSustainable, true);
  assert.equal(wealthy.foodRemaining, 475);
  assert.equal(wealthy.ticksUntilStarving, 20);

  // 0 army (no upkeep)
  const noArmy = canSustainArmy(0, 0);
  assert.equal(noArmy.isSustainable, true);
  assert.equal(noArmy.ticksUntilStarving, Infinity);
});

test("old vs new system comparison shows 4x upkeep reduction", () => {
  const comparison100 = compareRecruitmentSystems(100);
  assert.equal(comparison100.oldSystemFoodCost, 100);
  assert.equal(comparison100.newSystemGoldUpfront, 100);
  assert.equal(comparison100.newSystemFoodUpkeepPerTick, 25);
  assert.equal(comparison100.oldVsNewUptimeRatio, 4);

  const comparison500 = compareRecruitmentSystems(500);
  assert.equal(comparison500.oldSystemFoodCost, 500);
  assert.equal(comparison500.newSystemGoldUpfront, 500);
  assert.equal(comparison500.newSystemFoodUpkeepPerTick, 125);
  assert.equal(comparison500.oldVsNewUptimeRatio, 4);
});

test("realistic scenario: order 200 units with 8 recruiters", () => {
  // Player wants 200 army, has 200 gold available, 8 recruiters
  const cost = getRecruitmentCost(200);
  const canAfford = canAffordRecruitment(200, 200);
  const progress = calculateRecruitmentProgress(200, 8);

  assert.equal(cost, 200);
  assert.equal(canAfford.isAffordable, true);
  assert.equal(progress.recruiterCapacityPerTick, 8);
  assert.equal(progress.ticksToComplete, 25); // ceil(200/8)

  // Simulate recruitment over several ticks
  let queue = 200;
  const recruiterCount = 8;
  let createdSoFar = 0;
  let tickCount = 0;

  while (queue > 0 && tickCount < 30) {
    const result = processRecruitmentQueue(queue, recruiterCount);
    createdSoFar += result.unitsCreated;
    queue = result.newQueue;
    tickCount++;
  }

  assert.equal(createdSoFar, 200);
  assert.equal(tickCount, 25);
  assert.equal(queue, 0);

  // Check upkeep for completed army
    const upkeep = canSustainArmy(200, 100); // 100 food available
    assert.equal(upkeep.isSustainable, true); // 50 food upkeep, 100 food available = OK
  assert.equal(upkeep.upkeepPerTick, 50);
  assert.equal(upkeep.ticksUntilStarving, 2);
});

test("recruitment with race bonus: SPACE_MURINES 20 recruiters", () => {
  // SPACE_MURINES with 20 recruiters
  // Base: 20 * 1 = 20
  // Bonus: floor(20/10) * 1 = 2
  // Total: 22 units/tick
  const progress = calculateRecruitmentProgress(1000, 20, "SPACE_MURINES");
  assert.equal(progress.recruiterCapacityPerTick, 22);
  assert.equal(progress.ticksToComplete, 46); // ceil(1000/22)

  // vs non-race: 1000/20 = 50 ticks
  const noRaceProgress = calculateRecruitmentProgress(1000, 20);
  assert.equal(noRaceProgress.recruiterCapacityPerTick, 20);
  assert.equal(noRaceProgress.ticksToComplete, 50);

  // SPACE_MURINES saves 4 ticks recruiting 1000 units
  assert.equal(noRaceProgress.ticksToComplete - progress.ticksToComplete, 4);
});

test("constants are correctly defined", () => {
  assert.equal(RECRUITMENT_COST_PER_UNIT, 1);
  assert.equal(ARMY_UPKEEP_PER_UNIT, 0.25);
});
