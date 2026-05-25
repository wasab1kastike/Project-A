import assert from "node:assert/strict";
import test from "node:test";

import {
  isSeasonFourActivationEnabled,
} from "./season-schedule";

test("season four activation remains held until explicitly enabled", () => {
  assert.equal(isSeasonFourActivationEnabled(undefined), false);
  assert.equal(isSeasonFourActivationEnabled("false"), false);
  assert.equal(isSeasonFourActivationEnabled("true"), true);
});
