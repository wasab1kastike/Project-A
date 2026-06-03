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
  getBattalionModeUpdate,
  getBattalionSlots,
  TIER_MAX_SIZES,
} from "./battalion-types";
import {
  calculateRecruitment,
} from "./recruitment";
import {
  applyFieldPromotion,
  calculateFieldPromotionCost,
  FIELD_PROMOTION_BASE_COST,
} from "./army-xp";
import {
  processBattalionGuard,
  processBattalionRecruitment,
} from "./tick-battalion-integration";
import { processOwnershipPressure } from "./tile-pressure";
import { processGuardTick } from "./guard-system";

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
  it("Military building level 1 has 3 base slots", () => {
    assert.equal(getBattalionSlots(1, 0), 3);
  });

  it("Military building level 5 has 5 base slots", () => {
    assert.equal(getBattalionSlots(5, 0), 5);
  });

  it("Military building level 9 has 7 base slots", () => {
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

describe("Battalion mode jobs", () => {
  it("normalizes each public job to its hidden stance", () => {
    assert.deepEqual(getBattalionModeUpdate("RESERVE"), {
      mode: "RESERVE",
      stance: "REST",
      garrisonedAt: null,
      stanceLockedUntil: null,
    });
    assert.deepEqual(getBattalionModeUpdate("GUARD"), {
      mode: "GUARD",
      stance: "FORTIFY",
      stanceLockedUntil: null,
    });
    assert.deepEqual(getBattalionModeUpdate("ATTACK"), {
      mode: "ATTACK",
      stance: "MOBILE",
      garrisonedAt: null,
      stanceLockedUntil: null,
    });
    assert.deepEqual(getBattalionModeUpdate("ALLIANCE"), {
      mode: "ALLIANCE",
      stance: "MOBILE",
      garrisonedAt: null,
      stanceLockedUntil: null,
    });
  });

  it("guard assignment uses the hidden guard stance", () => {
    const result = processGuardTick({
      battalions: [
        {
          id: "bn_guard",
          name: "Border Guard",
          size: 50,
          maxSize: 100,
          tier: BattalionTier.RECRUIT,
          xp: 0,
          readyAt: null,
          stance: "REST",
          mode: "GUARD",
          garrisonedAt: null,
          stanceLockedUntil: null,
        },
      ],
      ownedTiles: [
        {
          tileId: "20:15",
          priority: 3,
          isBorder: true,
          enemyProximity: 1,
          productionValue: 0,
          currentGuardStrength: 0,
        },
      ],
      config: { guardPercent: 100, defaultStance: "FORTIFY" },
    });

    assert.equal(result.assignments.length, 1);
    assert.equal(result.battalions[0]?.garrisonedAt, "20:15");
    assert.equal(result.battalions[0]?.stance, "FORTIFY");
  });

  it("does not split one guard battalion across several tiles", () => {
    const result = processGuardTick({
      battalions: [
        {
          id: "bn_guard",
          name: "Border Guard",
          size: 100,
          maxSize: 100,
          tier: BattalionTier.RECRUIT,
          xp: 0,
          readyAt: null,
          stance: "REST",
          mode: "GUARD",
          garrisonedAt: null,
          stanceLockedUntil: null,
        },
      ],
      ownedTiles: [
        {
          tileId: "20:15",
          priority: 3,
          isBorder: true,
          enemyProximity: 1,
          productionValue: 0,
          currentGuardStrength: 0,
        },
        {
          tileId: "21:15",
          priority: 3,
          isBorder: true,
          enemyProximity: 1,
          productionValue: 0,
          currentGuardStrength: 0,
        },
      ],
      config: { guardPercent: 100, defaultStance: "FORTIFY" },
    });

    assert.equal(result.assignments.length, 1);
    assert.equal(result.assignments[0]?.battalionId, "bn_guard");
    assert.equal(result.assignments[0]?.unitsAssigned, 100);
    assert.equal(result.battalions[0]?.size, 100);
  });

  it("guard tick does not create legacy fortify attack units", async () => {
    const battalionUpdates: Array<{
      where: { id: string };
      data: { stance: string; garrisonedAt: string | null };
    }> = [];
    const attackUnitCreates: unknown[] = [];
    const db = {
      battalion: {
        findMany: async () => [
          {
            id: "bn_guard",
            cycleId: "cycle_1",
            fortressId: "fort_1",
            name: "Border Guard",
            size: 100,
            maxSize: 100,
            tier: 0,
            xp: 0,
            readyAt: null,
            stance: "REST",
            mode: "GUARD",
            garrisonedAt: null,
            stanceLockedUntil: null,
          },
        ],
        update: async (args: (typeof battalionUpdates)[number]) => {
          battalionUpdates.push(args);
          return args;
        },
      },
      attackUnit: {
        create: async (args: unknown) => {
          attackUnitCreates.push(args);
          return args;
        },
      },
    };

    await processBattalionGuard({
      ctx: {
        db: db as any,
        cycleId: "cycle_1",
        now: new Date("2026-06-01T12:00:00.000Z"),
      },
      guardPercentByFortress: new Map([["fort_1", 100]]),
      ownedTilesByFortress: new Map([["fort_1", ["20:15", "21:15"]]]),
      fortressPositionsById: new Map([["fort_1", { mapX: 50, mapY: 50 }]]),
    });

    assert.equal(battalionUpdates.length, 1);
    assert.equal(battalionUpdates[0]?.data.stance, "FORTIFY");
    assert.ok(battalionUpdates[0]?.data.garrisonedAt);
    assert.equal(attackUnitCreates.length, 0);
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

  it("field promotion advances one tier and unlocks the next expansion cap", () => {
    const promotion = applyFieldPromotion({
      id: "bn_regular",
      name: "Iron Hammers",
      size: 400,
      maxSize: 500,
      tier: BattalionTier.RECRUIT,
      xp: 90,
      readyAt: null,
      stance: "REST",
      mode: "RESERVE",
      garrisonedAt: null,
      stanceLockedUntil: null,
    });

    assert.ok(promotion);
    assert.equal(promotion.newTier, BattalionTier.REGULAR);
    assert.equal(promotion.battalion.tier, BattalionTier.REGULAR);
    assert.equal(promotion.battalion.xp, 0);
    assert.equal(promotion.battalion.size, 400);
    assert.equal(promotion.battalion.maxSize, 500);
    assert.equal(TIER_MAX_SIZES[promotion.newTier], 5_000);
  });

  it("field promotion cost is flat per tier, regardless of battalion size", () => {
    const baseRecruitBattalion = {
      id: "bn_small",
      name: "Small Company",
      size: 50,
      maxSize: 500,
      tier: BattalionTier.RECRUIT,
      xp: 0,
      readyAt: null,
      stance: "REST" as const,
      mode: "RESERVE" as const,
      garrisonedAt: null,
      stanceLockedUntil: null,
    };
    const largeRecruitBattalion = {
      ...baseRecruitBattalion,
      id: "bn_large",
      name: "Large Company",
      size: 500,
    };

    assert.equal(
      calculateFieldPromotionCost(baseRecruitBattalion),
      FIELD_PROMOTION_BASE_COST[BattalionTier.RECRUIT],
    );
    assert.equal(
      calculateFieldPromotionCost(largeRecruitBattalion),
      FIELD_PROMOTION_BASE_COST[BattalionTier.RECRUIT],
    );
    assert.equal(
      calculateFieldPromotionCost(largeRecruitBattalion, 25),
      Math.ceil(FIELD_PROMOTION_BASE_COST[BattalionTier.RECRUIT] * 0.75),
    );
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

describe("Battalion reinforcement travel", () => {
  it("sends new remote battalion recruits as pending map reinforcements", async () => {
    const battalionUpdates: Array<{ where: { id: string }; data: { size: number } }> = [];
    const attackUnitCreates: Array<{
      data: {
        attackerFortressId: string;
        targetFortressId: string;
        fortifyTargetTileId?: string | null;
        reinforcementBattalionId?: string | null;
        armyAmount: number;
      };
    }> = [];
    const db = {
      battalion: {
        findMany: async () => [
          {
            id: "bn_1",
            fortressId: "fort_1",
            name: "Iron Hammers",
            size: 10,
            maxSize: 20,
            tier: 0,
            xp: 0,
            readyAt: null,
            stance: "FORTIFY",
            garrisonedAt: "20:15",
            stanceLockedUntil: null,
          },
        ],
        update: async (args: { where: { id: string }; data: { size: number } }) => {
          battalionUpdates.push(args);
          return args;
        },
        createMany: async () => ({ count: 0 }),
      },
      attackUnit: {
        findMany: async () => [],
        create: async (args: (typeof attackUnitCreates)[number]) => {
          attackUnitCreates.push(args);
          return args;
        },
      },
      mapHexRoad: {
        findMany: async () => [],
      },
    };

    await processBattalionRecruitment({
      ctx: { db: db as any, cycleId: "cycle_1", now: new Date("2026-06-01T12:00:00.000Z") },
      recruitersByFortress: new Map([["fort_1", 1]]),
      raceByFortress: new Map([["fort_1", "DWARFS"]]),
      levelByFortress: new Map([["fort_1", 1]]),
      barracksLevelByFortress: new Map([["fort_1", 0]]),
      goldByFortress: new Map([["fort_1", 1000]]),
      maxArmyByFortress: new Map([["fort_1", 500]]),
      fortressPositionsById: new Map([["fort_1", { mapX: 50, mapY: 50 }]]),
    });

    assert.equal(battalionUpdates[0]?.data.size, 10);
    assert.equal(attackUnitCreates.length, 1);
    assert.equal(attackUnitCreates[0]?.data.attackerFortressId, "fort_1");
    assert.equal(attackUnitCreates[0]?.data.targetFortressId, "fort_1");
    assert.equal(attackUnitCreates[0]?.data.fortifyTargetTileId, "20:15");
    assert.equal(attackUnitCreates[0]?.data.reinforcementBattalionId, "bn_1");
    assert.equal(attackUnitCreates[0]?.data.armyAmount, 3);
  });

  it("counts pending battalion reinforcements against capacity", async () => {
    const battalionUpdates: Array<{ where: { id: string }; data: { size: number } }> = [];
    const attackUnitCreates: Array<{ data: { armyAmount: number } }> = [];
    const db = {
      battalion: {
        findMany: async () => [
          {
            id: "bn_1",
            fortressId: "fort_1",
            name: "Iron Hammers",
            size: 10,
            maxSize: 12,
            tier: 0,
            xp: 0,
            readyAt: null,
            stance: "FORTIFY",
            garrisonedAt: "20:15",
            stanceLockedUntil: null,
          },
        ],
        update: async (args: { where: { id: string }; data: { size: number } }) => {
          battalionUpdates.push(args);
          return args;
        },
        createMany: async () => ({ count: 0 }),
      },
      attackUnit: {
        findMany: async () => [
          {
            reinforcementBattalionId: "bn_1",
            armyAmount: 2,
          },
        ],
        create: async (args: { data: { armyAmount: number } }) => {
          attackUnitCreates.push(args);
          return args;
        },
      },
      mapHexRoad: {
        findMany: async () => [],
      },
    };

    await processBattalionRecruitment({
      ctx: { db: db as any, cycleId: "cycle_1", now: new Date("2026-06-01T12:00:00.000Z") },
      recruitersByFortress: new Map([["fort_1", 1]]),
      raceByFortress: new Map([["fort_1", "DWARFS"]]),
      levelByFortress: new Map([["fort_1", 1]]),
      barracksLevelByFortress: new Map([["fort_1", 0]]),
      goldByFortress: new Map([["fort_1", 1000]]),
      maxArmyByFortress: new Map([["fort_1", 500]]),
      fortressPositionsById: new Map([["fort_1", { mapX: 50, mapY: 50 }]]),
    });

    assert.equal(battalionUpdates[0]?.data.size, 10);
    assert.equal(attackUnitCreates.length, 0);
  });

  it("does not auto-create battalions when recruitment overflows capacity", async () => {
    const battalionUpdates: Array<{ where: { id: string }; data: { size: number } }> = [];
    const battalionCreateMany: Array<{ data: unknown[] }> = [];
    const db = {
      battalion: {
        findMany: async () => [
          {
            id: "bn_1",
            fortressId: "fort_1",
            name: "Iron Hammers",
            size: 500,
            maxSize: 500,
            tier: 0,
            xp: 0,
            readyAt: null,
            stance: "REST",
            garrisonedAt: null,
            stanceLockedUntil: null,
          },
        ],
        update: async (args: { where: { id: string }; data: { size: number } }) => {
          battalionUpdates.push(args);
          return args;
        },
        createMany: async (args: { data: unknown[] }) => {
          battalionCreateMany.push(args);
          return { count: args.data.length };
        },
      },
      attackUnit: {
        findMany: async () => [],
        create: async (args: unknown) => args,
      },
      mapHexRoad: {
        findMany: async () => [],
      },
    };

    const recruitedArmyByFortress = await processBattalionRecruitment({
      ctx: { db: db as any, cycleId: "cycle_1", now: new Date("2026-06-01T12:00:00.000Z") },
      recruitersByFortress: new Map([["fort_1", 100]]),
      raceByFortress: new Map([["fort_1", "DWARFS"]]),
      levelByFortress: new Map([["fort_1", 5]]),
      barracksLevelByFortress: new Map([["fort_1", 0]]),
      goldByFortress: new Map([["fort_1", 10_000]]),
      maxArmyByFortress: new Map([["fort_1", 1_000]]),
      fortressPositionsById: new Map([["fort_1", { mapX: 50, mapY: 50 }]]),
    });

    assert.equal(battalionUpdates[0]?.data.size, 500);
    assert.equal(battalionCreateMany.length, 0);
    assert.equal(recruitedArmyByFortress.get("fort_1"), 500);
  });

  it("caps new recruitment at max army size without trimming oversized battalions", async () => {
    const battalionUpdates: Array<{ where: { id: string }; data: { size: number } }> = [];
    const db = {
      battalion: {
        findMany: async () => [
          {
            id: "bn_1",
            fortressId: "fort_1",
            name: "Iron Hammers",
            size: 495,
            maxSize: 600,
            tier: 0,
            xp: 0,
            readyAt: null,
            stance: "REST",
            garrisonedAt: null,
            stanceLockedUntil: null,
          },
          {
            id: "bn_2",
            fortressId: "fort_2",
            name: "Stone Shields",
            size: 550,
            maxSize: 600,
            tier: 0,
            xp: 0,
            readyAt: null,
            stance: "REST",
            garrisonedAt: null,
            stanceLockedUntil: null,
          },
        ],
        update: async (args: { where: { id: string }; data: { size: number } }) => {
          battalionUpdates.push(args);
          return args;
        },
        createMany: async () => ({ count: 0 }),
      },
      attackUnit: {
        findMany: async () => [],
        create: async (args: unknown) => args,
      },
      mapHexRoad: {
        findMany: async () => [],
      },
    };

    const recruitedArmyByFortress = await processBattalionRecruitment({
      ctx: { db: db as any, cycleId: "cycle_1", now: new Date("2026-06-01T12:00:00.000Z") },
      recruitersByFortress: new Map([
        ["fort_1", 10],
        ["fort_2", 10],
      ]),
      raceByFortress: new Map([
        ["fort_1", "DWARFS"],
        ["fort_2", "DWARFS"],
      ]),
      levelByFortress: new Map([
        ["fort_1", 1],
        ["fort_2", 1],
      ]),
      barracksLevelByFortress: new Map([
        ["fort_1", 0],
        ["fort_2", 0],
      ]),
      goldByFortress: new Map([
        ["fort_1", 1_000],
        ["fort_2", 1_000],
      ]),
      maxArmyByFortress: new Map([
        ["fort_1", 500],
        ["fort_2", 500],
      ]),
      fortressPositionsById: new Map([
        ["fort_1", { mapX: 50, mapY: 50 }],
        ["fort_2", { mapX: 55, mapY: 55 }],
      ]),
    });

    const fort1Update = battalionUpdates.find((update) => update.where.id === "bn_1");
    const fort2Update = battalionUpdates.find((update) => update.where.id === "bn_2");
    assert.equal(fort1Update?.data.size, 500);
    assert.equal(fort2Update?.data.size, 550);
    assert.equal(recruitedArmyByFortress.get("fort_1"), 500);
    assert.equal(recruitedArmyByFortress.get("fort_2"), 550);
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
