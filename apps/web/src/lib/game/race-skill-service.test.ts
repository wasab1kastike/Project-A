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

test("race skill earned points start later and use slower milestones", () => {
  assert.equal(getEarnedSkillPoints({ level: 1, ownedTileCount: 0 }), 0);
  assert.equal(getEarnedSkillPoints({ level: 2, ownedTileCount: 0 }), 0);
  assert.equal(getEarnedSkillPoints({ level: 3, ownedTileCount: 0 }), 1);
  assert.equal(getEarnedSkillPoints({ level: 4, ownedTileCount: 0 }), 1);
  assert.equal(getEarnedSkillPoints({ level: 5, ownedTileCount: 0 }), 2);
  assert.equal(getEarnedSkillPoints({ level: 3, ownedTileCount: 4 }), 1);
  assert.equal(getEarnedSkillPoints({ level: 3, ownedTileCount: 5 }), 2);
  assert.equal(getEarnedSkillPoints({ level: 7, ownedTileCount: 10 }), 5);
});

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
        nodeKey: "economy-3",
        purchases: [{ nodeKey: "economy-1" }],
        availablePoints: 4,
      }),
    /previous node/
  );

  assert.equal(
      assertSkillNodeCanBePurchased({
        race: "DWARFS",
        nodeKey: "economy-2",
        purchases: [{ nodeKey: "economy-1" }],
        availablePoints: 4,
      }).key,
    "economy-2"
  );
});

test("race skill rewards aggregate from purchased nodes", () => {
  const rewards = getActiveSkillRewards({
    race: "ORKS",
    purchases: [{ nodeKey: "military-1" }, { nodeKey: "military-2" }],
  });

  assert.deepEqual(
    rewards.map((reward) => reward.effect),
    ["recruitmentRate", "battalionXpRate"]
  );
});

test("race skill modifiers add rewards from every purchased node", () => {
  const modifiers = getSkillModifiers({
    race: "SPACE_MURINES",
    purchases: [
      { nodeKey: "military-1" },
      { nodeKey: "military-2" },
      { nodeKey: "military-3" },
      { nodeKey: "military-4" },
      { nodeKey: "military-5" },
      { nodeKey: "military-6" },
      { nodeKey: "military-7" },
      { nodeKey: "military-8" },
    ],
  });

  assert.equal(modifiers.recruitmentRateMultiplier, 2.2);
  assert.equal(modifiers.battalionSlotBonus, 3);
  assert.equal(modifiers.battalionMaxSizePercent, 45);
  assert.equal(modifiers.battalionXpMultiplier, 1.15);
  assert.equal(modifiers.promotionDiscountPercent, 25);
});

test("every declared race skill reward effect is handled by modifiers", () => {
  const allPurchases = RACE_SKILL_TREES.DWARFS.paths.flatMap((path) =>
    path.nodes.map((node) => ({ nodeKey: node.key }))
  );
  const modifiers = getSkillModifiers({
    race: "DWARFS",
    purchases: allPurchases,
  });

  assert.equal(modifiers.foodPerTenFarmersBonus, 8);
  assert.equal(modifiers.goldPerTenMinersBonus, 8);
  assert.equal(modifiers.upkeepDiscountPercent, 30);
  assert.equal(modifiers.pressurePriorityLimitBonus, 4);
  assert.ok(modifiers.pressureMultiplier > 1);
  assert.equal(modifiers.tileDefensePercent, 30);
  assert.equal(modifiers.claimThreshold, 500);
  assert.equal(modifiers.recruitmentRateMultiplier, 2.2);
  assert.equal(modifiers.battalionSlotBonus, 3);
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

test("role tree respec migration clears old purchases", () => {
  const currentDir = dirname(fileURLToPath(import.meta.url));
  const migration = readFileSync(
    resolve(
      currentDir,
      "../../../prisma/migrations/20260601210000_reset_race_skill_purchases_for_role_trees/migration.sql"
    ),
    "utf8"
  );

  assert.match(migration, /DELETE FROM "RaceSkillPurchase";/);
});
