import assert from "node:assert/strict";
import test from "node:test";

import {
  isSeasonFourActivationEnabled,
  isSeasonFourPretestingCycle,
  SEASON_4_WISH_VOTING_ENDS_AT,
} from "./season-schedule";

test("season four activation remains held until explicitly enabled", () => {
  assert.equal(isSeasonFourActivationEnabled(undefined), false);
  assert.equal(isSeasonFourActivationEnabled("false"), false);
  assert.equal(isSeasonFourActivationEnabled("true"), true);
});

test("season four activation hold recognizes the persisted pretesting cycle", () => {
  assert.equal(
    isSeasonFourPretestingCycle({
      testingStartedAt: SEASON_4_WISH_VOTING_ENDS_AT,
    }),
    true
  );
  assert.equal(
    isSeasonFourPretestingCycle({
      testingStartedAt: new Date("2026-05-24T09:00:00.000Z"),
    }),
    false
  );
});
