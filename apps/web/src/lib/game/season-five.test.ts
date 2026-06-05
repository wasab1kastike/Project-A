import assert from "node:assert/strict";
import test from "node:test";
import {
  SeasonFiveCharacterClass,
  SeasonFiveGearSlot,
} from "@/lib/prisma-client";
import {
  calculateSeasonFiveCatchIntervalMinutes,
  calculateSeasonFiveInventoryCapacity,
  calculateSeasonFiveTravelMinutes,
  createSeasonFiveCatch,
  getSeasonFiveBuildEffects,
  normalizeSeasonFiveClass,
} from "./season-five";

test("Season 5 class selection accepts persisted enum values", () => {
  assert.equal(
    normalizeSeasonFiveClass("DRUNKEN_MONK"),
    SeasonFiveCharacterClass.DRUNKEN_MONK
  );
  assert.throws(() => normalizeSeasonFiveClass("fisher king"), /valid/);
});

test("Season 5 build effects combine class, gear, and skills", () => {
  const effects = getSeasonFiveBuildEffects({
    characterClass: SeasonFiveCharacterClass.BURNT_OUT_ROGUE,
    gear: [
      {
        slot: SeasonFiveGearSlot.BAIT,
        power: 2,
        equipped: true,
      },
      {
        slot: SeasonFiveGearSlot.PACK,
        power: 1,
        equipped: true,
      },
      {
        slot: SeasonFiveGearSlot.ROD,
        power: 9,
        equipped: false,
      },
    ],
    purchasedNodeKeys: ["steady_hands", "deep_pockets", "muddy_shortcuts"],
  });

  assert.equal(effects.catchBonus, 3);
  assert.equal(effects.inventoryBonus, 12);
  assert.equal(effects.travelPercent, -20);
});

test("Season 5 travel, catch interval, and inventory calculations clamp safely", () => {
  assert.equal(
    calculateSeasonFiveTravelMinutes({ baseMinutes: 10, travelPercent: -15 }),
    9
  );
  assert.equal(
    calculateSeasonFiveTravelMinutes({ baseMinutes: 1, travelPercent: -99 }),
    1
  );
  assert.equal(
    calculateSeasonFiveCatchIntervalMinutes({
      catchDifficulty: 4,
      catchBonus: 99,
    }),
    1
  );
  assert.equal(
    calculateSeasonFiveInventoryCapacity({
      baseCapacity: 12,
      inventoryBonus: 8,
    }),
    20
  );
});

test("Season 5 catch generation is deterministic and bounded", () => {
  const first = createSeasonFiveCatch({
    seed: "character:moon-depths:2026-06-05T12:00:00.000Z",
    minFishCm: 50,
    maxFishCm: 320,
    difficulty: 4,
    sizeBonusPercent: 25,
    inventoryPressure: 2,
  });
  const second = createSeasonFiveCatch({
    seed: "character:moon-depths:2026-06-05T12:00:00.000Z",
    minFishCm: 50,
    maxFishCm: 320,
    difficulty: 4,
    sizeBonusPercent: 25,
    inventoryPressure: 2,
  });

  assert.deepEqual(first, second);
  assert.ok(first.sizeCm >= 50);
  assert.ok(first.sizeCm <= 480);
  assert.ok(first.inventorySlots >= 2);
});
