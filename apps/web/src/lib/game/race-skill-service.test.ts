import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  assertSkillNodeCanBePurchased,
  getAvailableSkillPoints,
  getActiveSkillRewards,
  getEarnedSkillPoints,
  getMaxSkillPoints,
} from "./race-skill-service";
import { getSkillModifiers } from "./race-skill-effects";
import { RACE_SKILL_TREES, SKILL_NODES_PER_PATH } from "./race-skill-tree";

test("race skill earned points are capped at twelve", () => {
  assert.equal(getMaxSkillPoints(), 12);
  assert.equal(
    getEarnedSkillPoints({
      level: 20,
      ownedTileCount: 60,
    }),
    12
  );
});

test("race skill availability blocks purchases beyond the cap", () => {
  assert.equal(
    getAvailableSkillPoints({
      earnedPoints: 20,
      totalPurchased: 12,
    }),
    0
  );
  assert.equal(
    getAvailableSkillPoints({
      earnedPoints: 20,
      totalPurchased: 11,
    }),
    1
  );
});

test("race skill branches contain eight nodes", () => {
  for (const tree of Object.values(RACE_SKILL_TREES)) {
    for (const path of tree.paths) {
      assert.equal(path.nodes.length, SKILL_NODES_PER_PATH);
    }
  }
});

test("a full branch costs eight points and leaves four", () => {
  const path = RACE_SKILL_TREES.DWARFS.paths[0];
  assert.equal(path.nodes.length, 8);
  assert.equal(
    getAvailableSkillPoints({
      earnedPoints: 12,
      totalPurchased: path.nodes.length,
    }),
    4
  );
});

test("race skill node purchases require previous branch nodes", () => {
  assert.throws(
    () =>
      assertSkillNodeCanBePurchased({
        race: "DWARFS",
        nodeKey: "bastion-3",
        purchases: [{ nodeKey: "bastion-1" }],
        availablePoints: 4,
      }),
    /previous node/
  );

  assert.equal(
    assertSkillNodeCanBePurchased({
      race: "DWARFS",
      nodeKey: "bastion-2",
      purchases: [{ nodeKey: "bastion-1" }],
      availablePoints: 4,
    }).key,
    "bastion-2"
  );
});

test("race skill rewards aggregate from purchased nodes", () => {
  const rewards = getActiveSkillRewards({
    race: "ORKS",
    purchases: [{ nodeKey: "waaagh-1" }, { nodeKey: "waaagh-2" }],
  });

  assert.deepEqual(
    rewards.map((reward) => reward.effect),
    ["armyPerTenRecruiters", "population"]
  );
});

test("race skill modifiers add rewards from every purchased node", () => {
  const modifiers = getSkillModifiers({
    race: "SPACE_MURINES",
    purchases: [
      { nodeKey: "convoy-1" },
      { nodeKey: "convoy-2" },
      { nodeKey: "convoy-3" },
      { nodeKey: "convoy-4" },
      { nodeKey: "convoy-5" },
      { nodeKey: "convoy-6" },
      { nodeKey: "convoy-7" },
      { nodeKey: "convoy-8" },
    ],
  });

  assert.equal(modifiers.goldPerTenMinersBonus, 10);
  assert.equal(modifiers.foodPerTenFarmersBonus, 11);
});

test("race skill reset migration moves purchases to node keys only", () => {
  const currentDir = dirname(fileURLToPath(import.meta.url));
  const migration = readFileSync(
    resolve(
      currentDir,
      "../../../prisma/migrations/20260529130000_race_skill_node_purchases/migration.sql"
    ),
    "utf8"
  );

  assert.match(migration, /DELETE FROM "RaceSkillPurchase";/);
  assert.match(migration, /ADD COLUMN "nodeKey"/);
  assert.match(migration, /DROP COLUMN IF EXISTS "path"/);
  assert.match(migration, /DROP COLUMN IF EXISTS "tier"/);
});
