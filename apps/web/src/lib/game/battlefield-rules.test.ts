import assert from "node:assert/strict";
import { test } from "node:test";
import {
  getBattlefieldAttrition,
  getBattlefieldCasualtyBudget,
  getBattlefieldProgressDelta,
  getHomeOfABossBattleDamage,
} from "./battlefield-rules";

test("battlefield rules preserve progress, casualty, and boss damage formulas", () => {
  const tickAt = new Date("2026-05-18T12:00:00.000Z");

  assert.equal(
    getBattlefieldProgressDelta({ battlefieldId: "battlefield-test", tickAt }),
    2
  );
  assert.equal(getBattlefieldCasualtyBudget(0), 100);
  assert.equal(getBattlefieldCasualtyBudget(30), 550);
  assert.equal(getBattlefieldCasualtyBudget(90), 1000);
  assert.deepEqual(
    getBattlefieldAttrition({
      battleAgeMinutes: 30,
      attackerArmy: 1000,
      defenderArmy: 1000,
    }),
    {
      attackerLosses: 275,
      defenderLosses: 275,
    }
  );
  assert.equal(
    getHomeOfABossBattleDamage({
      attackerArmy: 1000,
      bossHealth: 5000,
    }),
    30
  );
});
