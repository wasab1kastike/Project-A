import assert from "node:assert/strict";
import test from "node:test";

import { applyFieldPromotion, applyTrainingXp } from "./army-xp";
import { BattalionTier, getBattalionSlots, type Battalion } from "./battalion-types";
import { processRecruitmentTick } from "./recruitment";
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
    gold: 0,
  });
  const skilled = processRecruitmentTick({
    battalions: [battalion({ size: 0 })],
    recruiters: 10,
    barracksLevel: 0,
    raceBonus: 2.2,
    totalSlots: 3,
    gold: 0,
  });

  assert.equal(baseline.unitsProduced, 30);
  assert.equal(skilled.unitsProduced, 66);
});

test("battalion slot skill bonus expands available slots", () => {
  assert.equal(getBattalionSlots(1, 0, 3), 6);
});

test("skill-sized auto-created battalions use the larger max size", () => {
  const result = processRecruitmentTick({
    battalions: [battalion({ size: 500, maxSize: 500 })],
    recruiters: 100,
    barracksLevel: 0,
    raceBonus: 1,
    totalSlots: 2,
    gold: 2_000,
    defaultBattalionMaxSize: 725,
  });

  const created = result.battalions.find((candidate) => candidate.id !== "b1");
  assert.equal(result.battalionCreated, true);
  assert.equal(created?.maxSize, 725);
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
