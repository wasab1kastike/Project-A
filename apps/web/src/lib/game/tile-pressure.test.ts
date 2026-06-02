import assert from "node:assert/strict";
import test from "node:test";

import {
  applyUnsupportedPressureDecay,
  allocatePressureAcrossTargets,
  calculateOwnershipMaintenanceWorkers,
  calculatePressureOutput,
  canPressureTarget,
  chooseAutoTilePressurePriorityCandidates,
  findCastleAnchorTile,
  getDistanceAdjustedTilePressureClaimThreshold,
  getDistanceAdjustedTilePressureDecayPercent,
  getExpansionTileCapacity,
  getHexRingDistance,
  getNeutralPressureClaimWinner,
  getPressureTargetBlockedReason,
  getTilePressureClaimThreshold,
  getTilePressurePriorityLimit,
  getTilePressurePrioritySlot,
  getTilePressurePriorityWeightForSlot,
  getPressureWorkerDescription,
  getPressureWorkerLabel,
  sortTilePressureQueue,
  TILE_PRESSURE_CLAIM_THRESHOLD,
} from "./tile-pressure";

test("pressure worker labels are race-flavored", () => {
  assert.equal(getPressureWorkerLabel("DWARFS"), "Beer Culture");
  assert.equal(getPressureWorkerLabel("ORKS"), "Scavenge Mob");
  assert.equal(getPressureWorkerLabel("SPACE_MURINES"), "Imperial Faith");
  assert.equal(getPressureWorkerLabel("UNSTABLE_UNICORNS"), "Glitter Distribution");
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

test("expansion tile capacity follows assigned pressure workers", () => {
  assert.equal(getExpansionTileCapacity({ pressureWorkersAssigned: 0 }), 8);
  assert.equal(getExpansionTileCapacity({ pressureWorkersAssigned: 4 }), 16);
  assert.equal(getExpansionTileCapacity({ pressureWorkersAssigned: 4.9 }), 16);
  assert.equal(getExpansionTileCapacity({ pressureWorkersAssigned: -2 }), 8);
  assert.equal(
    getExpansionTileCapacity({
      pressureWorkersAssigned: 4,
      race: "DWARFS",
    }),
    18
  );
  assert.equal(
    getExpansionTileCapacity({
      pressureWorkersAssigned: 4,
      race: "ORKS",
      skillPurchases: [{ nodeKey: "territory-1" }],
    }),
    16
  );
  assert.equal(
    getExpansionTileCapacity({
      pressureWorkersAssigned: 4,
      race: "ORKS",
      skillPurchases: [
        { nodeKey: "territory-1" },
        { nodeKey: "territory-2" },
        { nodeKey: "territory-3" },
      ],
    }),
    17
  );
});

test("ownership maintenance stops when held tiles exceed tile capacity", () => {
  assert.equal(
    calculateOwnershipMaintenanceWorkers({
      pressureWorkersAssigned: 4,
      ownedTileCount: 2,
    }),
    8
  );
  assert.equal(
    calculateOwnershipMaintenanceWorkers({
      pressureWorkersAssigned: 2,
      ownedTileCount: 12,
    }),
    1
  );
  assert.equal(
    calculateOwnershipMaintenanceWorkers({
      pressureWorkersAssigned: 2,
      ownedTileCount: 13,
    }),
    0
  );
  assert.equal(
    calculateOwnershipMaintenanceWorkers({
      pressureWorkersAssigned: 2,
      ownedTileCount: 13,
      race: "DWARFS",
    }),
    1
  );
  assert.equal(
    calculateOwnershipMaintenanceWorkers({
      pressureWorkersAssigned: 0,
      ownedTileCount: 8,
    }),
    1
  );
  assert.equal(
    calculateOwnershipMaintenanceWorkers({
      pressureWorkersAssigned: 0,
      ownedTileCount: 9,
    }),
    0
  );
});

test("unsupported pressure decays ten percent per completed hour", () => {
  assert.equal(
    applyUnsupportedPressureDecay({ pressure: 600, elapsedHours: 0 }),
    600
  );
  assert.equal(
    applyUnsupportedPressureDecay({ pressure: 600, elapsedHours: 1 }),
    540
  );
  assert.equal(
    applyUnsupportedPressureDecay({ pressure: 600, elapsedHours: 2 }),
    486
  );
});

test("unsupported pressure can decay faster for distant tiles", () => {
  assert.equal(
    applyUnsupportedPressureDecay({
      pressure: 600,
      elapsedHours: 1,
      decayPercentPerHour: 14,
    }),
    516
  );
});

test("castle anchor and hex ring distance use map tiles", () => {
  const tiles = [
    {
      id: "0:0",
      col: 0,
      row: 0,
      x: 0,
      y: 0,
      xPercent: 10,
      yPercent: 10,
      biome: "plains" as const,
      spawnable: true,
      claimable: true,
    },
    {
      id: "1:0",
      col: 1,
      row: 0,
      x: 0,
      y: 0,
      xPercent: 20,
      yPercent: 10,
      biome: "plains" as const,
      spawnable: true,
      claimable: true,
    },
    {
      id: "2:0",
      col: 2,
      row: 0,
      x: 0,
      y: 0,
      xPercent: 30,
      yPercent: 10,
      biome: "plains" as const,
      spawnable: true,
      claimable: true,
    },
  ];

  assert.equal(
    findCastleAnchorTile({ fortress: { mapX: 11, mapY: 10 }, tiles })?.id,
    "0:0"
  );
  assert.equal(
    getHexRingDistance({ fromTileId: "0:0", toTileId: "2:0", tiles }),
    2
  );
});

test("distance adjusted pressure thresholds and decay use gentle capped tiers", () => {
  const tiles = Array.from({ length: 12 }, (_, index) => ({
    id: `${index}:0`,
    col: index,
    row: 0,
    x: 0,
    y: 0,
    xPercent: index * 5,
    yPercent: 0,
    biome: "plains" as const,
    spawnable: true,
    claimable: true,
  }));
  const fortress = { mapX: 0, mapY: 0 };

  assert.equal(
    getDistanceAdjustedTilePressureClaimThreshold({
      isSeasonFour: true,
      fortress,
      tileId: "1:0",
      tiles,
    }),
    600
  );
  assert.equal(
    getDistanceAdjustedTilePressureClaimThreshold({
      isSeasonFour: true,
      fortress,
      tileId: "3:0",
      tiles,
    }),
    720
  );
  assert.equal(
    getDistanceAdjustedTilePressureClaimThreshold({
      isSeasonFour: true,
      fortress,
      tileId: "11:0",
      tiles,
    }),
    1200
  );
  assert.equal(
    getDistanceAdjustedTilePressureDecayPercent({
      fortress,
      tileId: "3:0",
      tiles,
    }),
    14
  );
  assert.equal(
    getDistanceAdjustedTilePressureDecayPercent({
      fortress,
      tileId: "11:0",
      tiles,
    }),
    30
  );
});

test("auto pressure candidates prefer nearest legal neutral tiles", () => {
  const tiles = [
    {
      id: "0:0",
      col: 0,
      row: 0,
      x: 0,
      y: 0,
      xPercent: 0,
      yPercent: 0,
      biome: "plains" as const,
      spawnable: true,
      claimable: true,
    },
    {
      id: "1:0",
      col: 1,
      row: 0,
      x: 0,
      y: 0,
      xPercent: 10,
      yPercent: 0,
      biome: "plains" as const,
      spawnable: true,
      claimable: true,
    },
    {
      id: "2:0",
      col: 2,
      row: 0,
      x: 0,
      y: 0,
      xPercent: 20,
      yPercent: 0,
      biome: "plains" as const,
      spawnable: true,
      claimable: true,
    },
    {
      id: "3:0",
      col: 3,
      row: 0,
      x: 0,
      y: 0,
      xPercent: 30,
      yPercent: 0,
      biome: "plains" as const,
      spawnable: true,
      claimable: true,
    },
  ];

  assert.deepEqual(
    chooseAutoTilePressurePriorityCandidates({
      fortress: { mapX: 0, mapY: 0 },
      tiles,
      distanceTiles: tiles,
      limit: 2,
      existingTileIds: ["1:0"],
      isLegalNeutralPressureTile: (tileId) => tileId !== "0:0",
    }),
    [{ tileId: "2:0" }, { tileId: "3:0" }]
  );
});

test("season four pressure pacing does not alter legacy cycle threshold", () => {
  assert.equal(getTilePressureClaimThreshold(true), 600);
  assert.equal(getTilePressureClaimThreshold(false), 100);
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

test("pressure target legality rejects enemy-owned tiles", () => {
  assert.match(
    getPressureTargetBlockedReason({
      ...baseTargetInput,
      ownerFortressId: "fortress-b",
    }) ?? "",
    /Enemy-owned/
  );
});

test("pressure target legality allows enemy-owned tiles only when explicitly enabled", () => {
  assert.equal(
    getPressureTargetBlockedReason({
      ...baseTargetInput,
      ownerFortressId: "fortress-b",
      allowEnemyOwned: true,
    }),
    null
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

test("pressure priority queue defaults to three ordered slots", () => {
  assert.equal(getTilePressurePriorityLimit(), 3);
  assert.equal(getTilePressurePriorityWeightForSlot({ slot: 1 }), 3);
  assert.equal(getTilePressurePriorityWeightForSlot({ slot: 2 }), 2);
  assert.equal(getTilePressurePriorityWeightForSlot({ slot: 3 }), 1);
  assert.equal(getTilePressurePrioritySlot({ weight: 3 }), 1);
  assert.equal(getTilePressurePrioritySlot({ weight: 2 }), 2);
  assert.equal(getTilePressurePrioritySlot({ weight: 1 }), 3);
  assert.deepEqual(
    sortTilePressureQueue([
      { tileId: "b", weight: 1 },
      { tileId: "a", weight: 3 },
      { tileId: "c", weight: 2 },
    ]).map((priority) => priority.tileId),
    ["a", "c", "b"]
  );
});

test("pressure priority limit expands from skill slots", () => {
  const fortress = {
    race: "DWARFS" as const,
    skillPurchases: [
      { nodeKey: "economy-1" },
      { nodeKey: "economy-2" },
      { nodeKey: "economy-3" },
      { nodeKey: "economy-4" },
      { nodeKey: "economy-5" },
      { nodeKey: "economy-6" },
      { nodeKey: "economy-7" },
      { nodeKey: "economy-8" },
    ],
  };

  assert.equal(getTilePressurePriorityLimit(fortress), 6);
  assert.equal(getTilePressurePriorityWeightForSlot({ slot: 1, limit: 6 }), 6);
  assert.equal(getTilePressurePriorityWeightForSlot({ slot: 6, limit: 6 }), 1);
  assert.equal(getTilePressurePrioritySlot({ weight: 6, limit: 6 }), 1);
  assert.equal(getTilePressurePrioritySlot({ weight: 1, limit: 6 }), 6);
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
