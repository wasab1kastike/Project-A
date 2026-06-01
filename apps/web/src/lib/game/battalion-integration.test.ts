// =============================================================================
// Battalion Integration Tests — node:test
// =============================================================================
// Tests for battalion creation, recruiting, guard, upkeep, XP, and combat.
// Run: npm run test:game --workspace web
// =============================================================================

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  BattalionTier,
  BATTALION_TIER_NAMES,
  TIER_MULTIPLIERS,
  generateBattalionName,
  getBattalionSlots,
  TIER_MAX_SIZES,
} from "./battalion-types";
import {
  calculateRecruitment,
} from "./recruitment";
import { processOwnershipPressure } from "./tile-pressure";

// ═════════════════════════════════════════════════════════════════════════════
// Battalion Types — tiers, slots, naming
// ═════════════════════════════════════════════════════════════════════════════

describe("Battalion Tier Multipliers", () => {
  it("Recruit has 1.0× damage and defense", () => {
    const mult = TIER_MULTIPLIERS[BattalionTier.RECRUIT];
    assert.equal(mult.damage, 1.0);
    assert.equal(mult.defense, 1.0);
  });

  it("Elite has 1.60× damage and 1.45× defense", () => {
    const mult = TIER_MULTIPLIERS[BattalionTier.ELITE];
    assert.equal(mult.damage, 1.60);
    assert.equal(mult.defense, 1.45);
  });

  it("Tier names are descriptive", () => {
    assert.equal(BATTALION_TIER_NAMES[BattalionTier.RECRUIT], "Recruit");
    assert.equal(BATTALION_TIER_NAMES[BattalionTier.REGULAR], "Regular");
    assert.equal(BATTALION_TIER_NAMES[BattalionTier.VETERAN], "Veteran");
    assert.equal(BATTALION_TIER_NAMES[BattalionTier.ELITE], "Elite");
  });
});

describe("Battalion Slots", () => {
  it("Level 1 fortress has 3 base slots", () => {
    assert.equal(getBattalionSlots(1, 0), 3);
  });

  it("Level 5 fortress has 5 base slots", () => {
    assert.equal(getBattalionSlots(5, 0), 5);
  });

  it("Level 9 fortress has 7 base slots", () => {
    assert.equal(getBattalionSlots(9, 0), 7);
  });

  it("Extra slots add to natural count", () => {
    assert.equal(getBattalionSlots(1, 2), 5);
  });

  it("Skill bonus adds to slots", () => {
    assert.equal(getBattalionSlots(1, 0, 1), 4);
  });

  it("Slot count never exceeds max", () => {
    assert.ok(getBattalionSlots(15, 10, 5) <= 13);
  });
});

describe("Tier Max Sizes", () => {
  it("Recruit max is 500", () => {
    assert.equal(TIER_MAX_SIZES[BattalionTier.RECRUIT], 500);
  });

  it("Regular max is 5000", () => {
    assert.equal(TIER_MAX_SIZES[BattalionTier.REGULAR], 5_000);
  });

  it("Veteran max is 15000", () => {
    assert.equal(TIER_MAX_SIZES[BattalionTier.VETERAN], 15_000);
  });

  it("Elite max is 50000", () => {
    assert.equal(TIER_MAX_SIZES[BattalionTier.ELITE], 50_000);
  });
});

describe("Battalion Naming", () => {
  it("Generates a name for each race", () => {
    for (const race of ["DWARFS", "ORKS", "SPACE_MURINES", "UNSTABLE_UNICORNS"] as const) {
      const name = generateBattalionName(race);
      assert.ok(typeof name === "string" && name.length > 0, `Expected non-empty name for ${race}, got: ${name}`);
    }
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Recruitment — passive army growth
// ═════════════════════════════════════════════════════════════════════════════

describe("Recruitment Math", () => {
  it("Calculates base recruitment from recruiters", () => {
    const result = calculateRecruitment(10, 0, 1.0);
    assert.equal(result, 30); // 10 recruiters * 3 units * 1.0
  });

  it("Barracks level increases recruitment", () => {
    const base = calculateRecruitment(10, 0, 1.0);
    const boosted = calculateRecruitment(10, 2, 1.0);
    assert.ok(boosted > base, `Barracks boost should increase output: ${base} vs ${boosted}`);
  });

  it("Race bonus affects output", () => {
    const base = calculateRecruitment(10, 0, 1.0);
    const ork = calculateRecruitment(10, 0, 1.2);
    assert.ok(ork > base, `Race bonus should increase output: ${base} vs ${ork}`);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Ownership Pressure — dynamic territory
// ═════════════════════════════════════════════════════════════════════════════

describe("Ownership Pressure", () => {
  it("Decays by 2 per tick without maintenance", () => {
    const result = processOwnershipPressure({
      tileId: "a",
      ownerFortressId: "x",
      currentPressure: 600,
      maintenanceWorkers: 0,
      enemyPressureOnTile: 0,
      hasGuard: false,
    });
    assert.equal(result.newPressure, 598);
    assert.ok(!result.becameNeutral);
  });

  it("Guard reduces decay by 50%", () => {
    const result = processOwnershipPressure({
      tileId: "a",
      ownerFortressId: "x",
      currentPressure: 600,
      maintenanceWorkers: 0,
      enemyPressureOnTile: 0,
      hasGuard: true,
    });
    assert.equal(result.newPressure, 599); // 2 * 0.5 = 1 decay
  });

  it("Maintenance workers offset decay", () => {
    const result = processOwnershipPressure({
      tileId: "a",
      ownerFortressId: "x",
      currentPressure: 300,
      maintenanceWorkers: 2,
      enemyPressureOnTile: 0,
      hasGuard: false,
    });
    assert.equal(result.newPressure, 306); // 300 - 2 + 8 = 306
  });

  it("Enemy pressure accelerates decay", () => {
    const noEnemy = processOwnershipPressure({
      tileId: "a",
      ownerFortressId: "x",
      currentPressure: 600,
      maintenanceWorkers: 0,
      enemyPressureOnTile: 0,
      hasGuard: false,
    });
    const withEnemy = processOwnershipPressure({
      tileId: "a",
      ownerFortressId: "x",
      currentPressure: 600,
      maintenanceWorkers: 0,
      enemyPressureOnTile: 100,
      hasGuard: false,
    });
    assert.ok(withEnemy.newPressure < noEnemy.newPressure);
  });

  it("Tiles become neutral at 0 pressure", () => {
    const result = processOwnershipPressure({
      tileId: "a",
      ownerFortressId: "x",
      currentPressure: 1,
      maintenanceWorkers: 0,
      enemyPressureOnTile: 10,
      hasGuard: false,
    });
    assert.equal(result.newPressure, 0);
    assert.ok(result.becameNeutral);
  });

  it("Pressure caps at 600", () => {
    const result = processOwnershipPressure({
      tileId: "a",
      ownerFortressId: "x",
      currentPressure: 600,
      maintenanceWorkers: 10,
      enemyPressureOnTile: 0,
      hasGuard: false,
    });
    assert.equal(result.newPressure, 600);
  });
});
