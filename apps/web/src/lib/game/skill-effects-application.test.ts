import assert from "node:assert/strict";
import test from "node:test";

import { applyFieldPromotion, applyTrainingXp } from "./army-xp";
import { BattalionTier, getBattalionSlots, type Battalion } from "./battalion-types";
import {
  RECRUITMENT_COST_PER_UNIT,
  expandBattalion,
  processRecruitmentTick,
} from "./recruitment";
import { calculateUpkeep } from "./upkeep";

function battalion(overrides: Partial<Battalion> = {}): Battalion {
  return {
    id: "b1",
    name: "Test Battalion",
    size: 500,
    maxSize: 500,
    tier: BattalionTier.RECRUIT,
    xp: 0,
    readyAt: null,
    stance: "REST",
    mode: "GUARD",
    garrisonedAt: null,
    stanceLockedUntil: null,
    ...overrides,
  };
}

test("recruitment skill multiplier increases battalion production", () => {
  const baseline = processRecruitmentTick({
    battalions: [battalion({ size: 0 })],
    recruiters: 10,
    barracksLevel: 0,
    raceBonus: 1,
    totalSlots: 3,
    gold: 1_000,
  });
  const skilled = processRecruitmentTick({
    battalions: [battalion({ size: 0 })],
    recruiters: 10,
    barracksLevel: 0,
    raceBonus: 2.2,
    totalSlots: 3,
    gold: 1_000,
  });

  assert.equal(baseline.unitsProduced, 30);
  assert.equal(skilled.unitsProduced, 66);
});

test("battalion slot skill bonus expands available slots", () => {
  assert.equal(getBattalionSlots(1, 0, 3), 6);
});

test("full battalions do not auto-create new battalions", () => {
  const result = processRecruitmentTick({
    battalions: [battalion({ size: 500, maxSize: 500 })],
    recruiters: 100,
    barracksLevel: 0,
    raceBonus: 1,
    totalSlots: 2,
    gold: 2_000,
    defaultBattalionMaxSize: 725,
  });

  assert.equal(result.battalions.length, 1);
  assert.equal(result.battalionCreated, false);
  assert.equal(result.goldSpent, 0);
  assert.equal(result.unitsProduced, 0);
  assert.equal(result.unitsWasted, 0);
});

test("battalion max-size expansion is free capacity only", () => {
  const result = expandBattalion({
    battalion: battalion({ maxSize: 500 }),
    maxBattalionSize: 5_000,
  });

  assert.ok("battalion" in result);
  assert.equal(result.battalion.maxSize, 550);
  assert.equal(result.goldCost, 0);
});

test("battalion recruitment spends gold for units actually produced", () => {
  const result = processRecruitmentTick({
    battalions: [battalion({ size: 0 })],
    recruiters: 10,
    barracksLevel: 0,
    raceBonus: 1,
    totalSlots: 3,
    gold: 1_000,
  });

  assert.equal(result.unitsProduced, 30);
  assert.equal(result.goldSpent, 30 * RECRUITMENT_COST_PER_UNIT);
});

test("battalion recruitment is limited by available gold", () => {
  const result = processRecruitmentTick({
    battalions: [battalion({ size: 0 })],
    recruiters: 10,
    barracksLevel: 0,
    raceBonus: 1,
    totalSlots: 3,
    gold: 11,
  });

  assert.equal(result.unitsProduced, 5);
  assert.equal(result.goldSpent, 10);
  assert.equal(result.battalions[0].size, 5);
});

test("battalion recruitment produces no units with zero gold", () => {
  const result = processRecruitmentTick({
    battalions: [battalion({ size: 0 })],
    recruiters: 10,
    barracksLevel: 0,
    raceBonus: 1,
    totalSlots: 3,
    gold: 0,
  });

  assert.equal(result.unitsProduced, 0);
  assert.equal(result.goldSpent, 0);
  assert.equal(result.battalions[0].size, 0);
});

test("max army size caps new recruitment without trimming existing battalions", () => {
  const result = processRecruitmentTick({
    battalions: [battalion({ size: 490, maxSize: 600 })],
    recruiters: 10,
    barracksLevel: 0,
    raceBonus: 1,
    totalSlots: 3,
    gold: 1_000,
    maxArmySize: 500,
  });

  assert.equal(result.unitsProduced, 10);
  assert.equal(result.battalions[0].size, 500);
  assert.equal(result.unitsWasted, 0);

  const oversized = processRecruitmentTick({
    battalions: [battalion({ size: 550, maxSize: 600 })],
    recruiters: 10,
    barracksLevel: 0,
    raceBonus: 1,
    totalSlots: 3,
    gold: 1_000,
    maxArmySize: 500,
  });

  assert.equal(oversized.unitsProduced, 0);
  assert.equal(oversized.battalions[0].size, 550);
});

test("upkeep and promotion discounts apply to battalion systems", () => {
  const bill = calculateUpkeep([battalion()], 30);
  assert.equal(bill.totalFood, 7);

  const promotion = applyFieldPromotion(battalion({ size: 100 }), 25);
  assert.equal(promotion?.goldCost, 2100);
});

test("training XP multiplier applies to eligible battalions", () => {
  const [updated] = applyTrainingXp(
    [battalion({ stance: "TRAINING" })],
    2.2,
  );

  assert.equal(updated.xp, 2);
});
