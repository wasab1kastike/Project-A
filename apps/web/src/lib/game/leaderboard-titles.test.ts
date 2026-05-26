import assert from "node:assert/strict";
import { test } from "node:test";
import { CycleRuleset, CycleStatus, FortressKind } from "@/lib/prisma-client";
import {
  getLeaderboardTitleConfigs,
  getLeaderboardTitleAttackMultiplier,
  getLeaderboardTitleCastleLootMultiplier,
  getLeaderboardTitleHolders,
  getLeaderboardTitleLootCampRewardMultiplier,
  getLeaderboardTitleTileIncomeMultipliers,
  type LeaderboardFortress,
} from "./leaderboard-titles";

function fortress(
  id: string,
  overrides: Partial<LeaderboardFortress> = {}
): LeaderboardFortress {
  return {
    id,
    name: id,
    points: 0,
    unitsKilled: 0,
    goblinsKilled: 0,
    resourcesStolen: 0,
    deliveredCargoValue: 0,
    interceptedCargoValue: 0,
    joinedAt: new Date("2026-05-15T00:00:00.000Z"),
    isNpc: false,
    fortressKind: FortressKind.PLAYER,
    ...overrides,
  };
}

test("leaderboard title holders are active-season category leaders", () => {
  const fortresses = [
    fortress("points", { points: 100 }),
    fortress("kills", { points: 10, unitsKilled: 20 }),
    fortress("tiles", { points: 20 }),
    fortress("goblins", { points: 30, goblinsKilled: 3 }),
    fortress("loot", { points: 40, resourcesStolen: 200 }),
  ];
  const tileCounts = new Map([
    ["points", 1],
    ["kills", 2],
    ["tiles", 8],
    ["goblins", 3],
    ["loot", 4],
  ]);

  assert.deepEqual(
    getLeaderboardTitleHolders({
      fortresses,
      tileCountsByFortressId: tileCounts,
      cycleStatus: CycleStatus.ACTIVE,
    }),
    {
      points: "points",
      unitsKilled: "kills",
      tilesOwned: "tiles",
      goblinsKilled: "goblins",
      resourcesStolen: "loot",
    }
  );
});

test("zero non-point categories do not award live title holders", () => {
  const fortresses = [fortress("leader", { points: 10 })];

  assert.deepEqual(
    getLeaderboardTitleHolders({
      fortresses,
      tileCountsByFortressId: new Map(),
      cycleStatus: CycleStatus.ACTIVE,
    }),
    {
      points: "leader",
    }
  );
});

test("title buffs stack by category holder", () => {
  const holders = {
    points: "leader",
    unitsKilled: "leader",
    tilesOwned: "leader",
    goblinsKilled: "leader",
    resourcesStolen: "leader",
  } as const;

  assert.equal(getLeaderboardTitleAttackMultiplier(holders, "leader"), 1.1);
  assert.equal(
    getLeaderboardTitleLootCampRewardMultiplier(holders, "leader"),
    1.25
  );
  assert.equal(getLeaderboardTitleCastleLootMultiplier(holders, "leader"), 1.1);
  assert.deepEqual(getLeaderboardTitleTileIncomeMultipliers(holders, "leader"), {
    resource: 1.1,
    points: 1.1,
  });
});

test("season four exposes prestige logistics rankings without buffs", () => {
  const fortresses = [
    fortress("courier", { deliveredCargoValue: 4_000 }),
    fortress("privateer", { interceptedCargoValue: 2_000 }),
  ];

  assert.deepEqual(
    getLeaderboardTitleConfigs(CycleRuleset.SEASON_4).map(
      (config) => config.category
    ),
    [
      "points",
      "tilesOwned",
      "unitsKilled",
      "deliveredCargoValue",
      "interceptedCargoValue",
    ]
  );
  assert.deepEqual(
    getLeaderboardTitleHolders({
      fortresses,
      tileCountsByFortressId: new Map(),
      cycleStatus: CycleStatus.ACTIVE,
      ruleset: CycleRuleset.SEASON_4,
    }),
    {
      points: "courier",
      deliveredCargoValue: "courier",
      interceptedCargoValue: "privateer",
    }
  );
  assert.equal(
    getLeaderboardTitleAttackMultiplier(
      { unitsKilled: "courier" },
      "courier",
      CycleRuleset.SEASON_4
    ),
    1
  );
  assert.deepEqual(
    getLeaderboardTitleTileIncomeMultipliers(
      { points: "courier", tilesOwned: "courier" },
      "courier",
      CycleRuleset.SEASON_4
    ),
    { resource: 1, points: 1 }
  );
});
