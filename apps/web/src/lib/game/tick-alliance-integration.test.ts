import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { processAllianceReinforcements } from "./tick-alliance-integration";

function createMockDb(options?: {
  supportAttack?: boolean;
  supportDefense?: boolean;
}) {
  let battalionSize = 100;
  const createdAttackUnits: Array<{
    data: {
      reinforcementSide: "ATTACKER" | "DEFENDER";
      armyAmount: number;
      targetFortressId: string;
    };
  }> = [];

  return {
    createdAttackUnits,
    db: {
      warPolicy: {
        findUnique: async () => ({
          allianceSupportAttack: options?.supportAttack ?? true,
          allianceSupportDefense: options?.supportDefense ?? true,
        }),
      },
      attackUnit: {
        findFirst: async () => null,
        create: async (args: (typeof createdAttackUnits)[number]) => {
          createdAttackUnits.push(args);
          return args;
        },
      },
      battalion: {
        findMany: async () =>
          battalionSize > 0 ? [{ id: "bn_support", size: battalionSize }] : [],
        update: async (args: { data: { size: { decrement: number } } }) => {
          battalionSize -= args.data.size.decrement;
          return args;
        },
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
    },
  };
}

describe("processAllianceReinforcements", () => {
  it("uses ALLIANCE battalions to support allied attacks", async () => {
    const { db, createdAttackUnits } = createMockDb();

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
});
