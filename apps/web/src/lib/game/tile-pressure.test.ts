import assert from "node:assert/strict";
import test from "node:test";

import {
  allocatePressureAcrossTargets,
  calculatePressureOutput,
  canPressureTarget,
  getNeutralPressureClaimWinner,
  getPressureTargetBlockedReason,
  getPressureWorkerDescription,
  getPressureWorkerLabel,
  TILE_PRESSURE_CLAIM_THRESHOLD,
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

const baseTargetInput = {
  tile: { claimable: true },
  tileId: "1:1",
  ownerFortressId: null,
  fortress: { id: "fortress-a" },
  ownedTileIds: [],
  isHomeOfA: () => false,
  isConnected: () => true,
};

test("pressure target legality accepts connected normal tiles", () => {
  assert.equal(canPressureTarget(baseTargetInput), true);
});

test("pressure target legality rejects Home of A and own tiles", () => {
  assert.match(
    getPressureTargetBlockedReason({
      ...baseTargetInput,
      isHomeOfA: () => true,
    }) ?? "",
    /Home of A/
  );
  assert.match(
    getPressureTargetBlockedReason({
      ...baseTargetInput,
      ownerFortressId: "fortress-a",
    }) ?? "",
    /already own/
  );
});

test("pressure target legality rejects disconnected and unclaimable tiles", () => {
  assert.match(
    getPressureTargetBlockedReason({
      ...baseTargetInput,
      isConnected: () => false,
    }) ?? "",
    /not connected/
  );
  assert.match(
    getPressureTargetBlockedReason({
      ...baseTargetInput,
      tile: { claimable: false },
    }) ?? "",
    /cannot receive pressure/
  );
});

test("pressure allocation splits output across weighted targets", () => {
  assert.deepEqual(
    allocatePressureAcrossTargets({
      pressure: 5,
      targets: [
        { tileId: "b", weight: 1 },
        { tileId: "a", weight: 1 },
      ],
    }),
    [
      { tileId: "a", pressure: 3 },
      { tileId: "b", pressure: 2 },
    ]
  );
});

test("neutral pressure claim requires threshold and no tie", () => {
  assert.equal(
    getNeutralPressureClaimWinner({
      states: [{ fortressId: "a", pressure: TILE_PRESSURE_CLAIM_THRESHOLD - 1 }],
    }),
    null
  );
  assert.equal(
    getNeutralPressureClaimWinner({
      states: [
        { fortressId: "a", pressure: TILE_PRESSURE_CLAIM_THRESHOLD },
        { fortressId: "b", pressure: TILE_PRESSURE_CLAIM_THRESHOLD },
      ],
    }),
    null
  );
  assert.equal(
    getNeutralPressureClaimWinner({
      states: [
        { fortressId: "a", pressure: TILE_PRESSURE_CLAIM_THRESHOLD + 1 },
        { fortressId: "b", pressure: TILE_PRESSURE_CLAIM_THRESHOLD },
      ],
    }),
    "a"
  );
});
