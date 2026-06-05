import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { processAllianceReinforcements } from "./tick-alliance-integration";

function createMockDb(options?: {
  supportAttack?: boolean;
  supportDefense?: boolean;
  existingReinforcement?: boolean;
}) {
  let battalionSize = 100;
  let fortressArmy = 100;
  const createdAttackUnits: Array<{
    data: {
      reinforcementSide: "ATTACKER" | "DEFENDER";
      armyAmount: number;
      targetFortressId: string;
      arrivesAt?: Date;
    };
  }> = [];

  return {
    createdAttackUnits,
    getBattalionSize: () => battalionSize,
    getFortressArmy: () => fortressArmy,
    db: {
      $transaction: async (callback: (tx: any) => Promise<void>) =>
        callback({
          battalion: {
            update: async (args: { data: { size: { decrement: number } } }) => {
              battalionSize -= args.data.size.decrement;
              return args;
            },
          },
          fortress: {
            update: async (args: { data: { army: { decrement: number } } }) => {
              fortressArmy -= args.data.army.decrement;
              return args;
            },
          },
          attackUnit: {
            create: async (args: (typeof createdAttackUnits)[number]) => {
              createdAttackUnits.push(args);
              return args;
            },
          },
        }),
      warPolicy: {
        findUnique: async () => ({
          allianceSupportAttack: options?.supportAttack ?? true,
          allianceSupportDefense: options?.supportDefense ?? true,
        }),
      },
      attackUnit: {
        findFirst: async () =>
          options?.existingReinforcement ? { id: "existing_support" } : null,
      },
      battalion: {
        findMany: async () =>
          battalionSize > 0 ? [{ id: "bn_support", size: battalionSize }] : [],
      },
      fortress: {
        findUnique: async ({ where }: { where: { id: string } }) => {
          const positions: Record<string, { mapX: number; mapY: number }> = {
            ally_a: { mapX: 10, mapY: 10 },
            ally_b: { mapX: 20, mapY: 20 },
            enemy: { mapX: 80, mapY: 80 },
          };
          return positions[where.id] ?? { mapX: 50, mapY: 50 };
        },
      },
      mapHexRoad: {
        findMany: async () => [],
      },
      mapHexRoadCrossing: {
        findMany: async () => [],
      },
    },
  };
}

describe("processAllianceReinforcements", () => {
  it("uses ALLIANCE battalions to support allied attacks", async () => {
    const { db, createdAttackUnits, getBattalionSize, getFortressArmy } =
      createMockDb();

    await processAllianceReinforcements({
      db: db as never,
      cycleId: "cycle_1",
      now: new Date("2026-06-01T12:00:00.000Z"),
      diplomacyRelations: [
        { status: "ALLIED", fortressAId: "ally_a", fortressBId: "ally_b" },
      ],
      activeBattlefields: [
        {
          id: "bf_attack",
          attackerBannerFortressId: "ally_a",
          defenderBannerFortressId: "enemy",
          status: "ACTIVE",
        },
      ],
    });

    assert.equal(createdAttackUnits.length, 1);
    assert.equal(createdAttackUnits[0]?.data.reinforcementSide, "ATTACKER");
    assert.equal(createdAttackUnits[0]?.data.targetFortressId, "enemy");
    assert.equal(createdAttackUnits[0]?.data.armyAmount, 100);
    assert.equal(getBattalionSize(), 0);
    assert.equal(getFortressArmy(), 0);
  });

  it("respects disabled attack support while leaving defense support available", async () => {
    const { db, createdAttackUnits } = createMockDb({ supportAttack: false });

    await processAllianceReinforcements({
      db: db as never,
      cycleId: "cycle_1",
      now: new Date("2026-06-01T12:00:00.000Z"),
      diplomacyRelations: [
        { status: "ALLIED", fortressAId: "ally_a", fortressBId: "ally_b" },
      ],
      activeBattlefields: [
        {
          id: "bf_attack",
          attackerBannerFortressId: "ally_a",
          defenderBannerFortressId: "enemy",
          status: "ACTIVE",
        },
        {
          id: "bf_defense",
          attackerBannerFortressId: "enemy",
          defenderBannerFortressId: "ally_a",
          status: "ACTIVE",
        },
      ],
    });

    assert.equal(createdAttackUnits.length, 1);
    assert.equal(createdAttackUnits[0]?.data.reinforcementSide, "DEFENDER");
    assert.equal(createdAttackUnits[0]?.data.targetFortressId, "ally_a");
  });

  it("holds alliance battalions when the reinforcer is allied with both hostile sides", async () => {
    const { db, createdAttackUnits } = createMockDb();

    await processAllianceReinforcements({
      db: db as never,
      cycleId: "cycle_1",
      now: new Date("2026-06-01T12:00:00.000Z"),
      diplomacyRelations: [
        { status: "ALLIED", fortressAId: "ally_a", fortressBId: "supporter" },
        { status: "ALLIED", fortressAId: "ally_b", fortressBId: "supporter" },
        { status: "WAR", fortressAId: "ally_a", fortressBId: "ally_b" },
      ],
      activeBattlefields: [
        {
          id: "bf_ally_conflict",
          attackerBannerFortressId: "ally_a",
          defenderBannerFortressId: "ally_b",
          status: "ACTIVE",
        },
      ],
    });

    assert.equal(createdAttackUnits.length, 0);
  });

  it("resumes alliance support after one side is no longer allied", async () => {
    const { db, createdAttackUnits } = createMockDb();

    await processAllianceReinforcements({
      db: db as never,
      cycleId: "cycle_1",
      now: new Date("2026-06-01T12:00:00.000Z"),
      diplomacyRelations: [
        { status: "ALLIED", fortressAId: "ally_b", fortressBId: "supporter" },
        { status: "NEUTRAL", fortressAId: "ally_a", fortressBId: "supporter" },
        { status: "WAR", fortressAId: "ally_a", fortressBId: "ally_b" },
      ],
      activeBattlefields: [
        {
          id: "bf_ally_conflict_resolved",
          attackerBannerFortressId: "ally_a",
          defenderBannerFortressId: "ally_b",
          status: "ACTIVE",
        },
      ],
    });

    assert.equal(createdAttackUnits.length, 1);
    assert.equal(createdAttackUnits[0]?.data.reinforcementSide, "DEFENDER");
    assert.equal(createdAttackUnits[0]?.data.targetFortressId, "ally_b");
  });

  it("does not duplicate unresolved reinforcements that are due this tick", async () => {
    const { db, createdAttackUnits } = createMockDb({
      existingReinforcement: true,
    });

    await processAllianceReinforcements({
      db: db as never,
      cycleId: "cycle_1",
      now: new Date("2026-06-01T12:00:00.000Z"),
      diplomacyRelations: [
        { status: "ALLIED", fortressAId: "ally_a", fortressBId: "ally_b" },
      ],
      activeBattlefields: [
        {
          id: "bf_attack",
          attackerBannerFortressId: "ally_a",
          defenderBannerFortressId: "enemy",
          status: "ACTIVE",
        },
      ],
    });

    assert.equal(createdAttackUnits.length, 0);
  });

  it("uses tile position for tile battlefield support travel", async () => {
    const { db, createdAttackUnits } = createMockDb();
    const now = new Date("2026-06-01T12:00:00.000Z");

    await processAllianceReinforcements({
      db: db as never,
      cycleId: "cycle_1",
      now,
      diplomacyRelations: [
        { status: "ALLIED", fortressAId: "ally_a", fortressBId: "ally_b" },
      ],
      activeBattlefields: [
        {
          id: "bf_tile_attack",
          attackerBannerFortressId: "ally_a",
          defenderBannerFortressId: "enemy",
          targetTileId: "1:1",
          status: "ACTIVE",
        },
      ],
    });

    assert.equal(createdAttackUnits.length, 1);
    assert.ok(createdAttackUnits[0]?.data.arrivesAt);
    assert.equal(
      createdAttackUnits[0]?.data.arrivesAt?.toISOString(),
      new Date(now.getTime() + 3 * 60_000).toISOString(),
    );
  });
});
