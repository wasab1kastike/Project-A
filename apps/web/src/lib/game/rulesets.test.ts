import assert from "node:assert/strict";
import test from "node:test";

import { CycleRuleset } from "@/lib/prisma-client";
import { isSeasonFourRuleset } from "./rulesets";

test("season four gates use the persisted cycle ruleset", () => {
  assert.equal(isSeasonFourRuleset(CycleRuleset.SEASON_4), true);
  assert.equal(isSeasonFourRuleset(CycleRuleset.LEGACY), false);
  assert.equal(isSeasonFourRuleset(null), false);
});
