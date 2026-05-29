import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  getAvailableSkillPoints,
  getEarnedSkillPoints,
  getMaxSkillPoints,
} from "./race-skill-service";

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

test("race skill reset migration only clears skill purchases", () => {
  const currentDir = dirname(fileURLToPath(import.meta.url));
  const migration = readFileSync(
    resolve(
      currentDir,
      "../../../prisma/migrations/20260529090000_reset_race_skill_purchases/migration.sql"
    ),
    "utf8"
  ).trim();

  assert.equal(migration, 'DELETE FROM "RaceSkillPurchase";');
});
