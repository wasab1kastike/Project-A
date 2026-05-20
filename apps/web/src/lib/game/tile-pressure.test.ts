import assert from "node:assert/strict";
import test from "node:test";

import {
  calculatePressureOutput,
  getPressureWorkerDescription,
  getPressureWorkerLabel,
} from "./tile-pressure";

test("pressure worker labels are race-flavored", () => {
  assert.equal(getPressureWorkerLabel("DWARFS"), "Beer Culture");
  assert.equal(getPressureWorkerLabel("ORKS"), "Scavenge Mob");
  assert.equal(getPressureWorkerLabel("SPACE_MURINES"), "Imperial Faith");
  assert.equal(getPressureWorkerLabel("UNSTABLE_UNICORNS"), "Magic Pressure");
});

test("pressure worker labels and descriptions fall back before race selection", () => {
  assert.equal(getPressureWorkerLabel(null), "Pressure");
  assert.match(getPressureWorkerDescription(undefined), /idle expansion/);
});

test("pressure output matches assigned pressure workers", () => {
  assert.equal(
    calculatePressureOutput({
      pressureWorkersAssigned: 12,
      race: "DWARFS",
    }),
    12
  );
  assert.equal(
    calculatePressureOutput({
      pressureWorkersAssigned: 12.8,
      race: "UNSTABLE_UNICORNS",
    }),
    12
  );
  assert.equal(
    calculatePressureOutput({
      pressureWorkersAssigned: -5,
      race: "ORKS",
    }),
    0
  );
});
