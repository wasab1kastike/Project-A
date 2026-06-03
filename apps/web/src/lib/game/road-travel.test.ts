import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { HEX_TILES } from "./map-hex";
import {
  calculateRoadAdjustedTravel,
  getRoadWeightsFromSegments,
} from "./road-travel";
import {
  getIdleBattalionRoadCrossingPlan,
  getIdleBattalionRoadCrossings,
} from "./tick-road-integration";

describe("road-travel", () => {
  it("keeps baseline travel when no road exists", () => {
    const [originTile, targetTile] = [HEX_TILES[0], HEX_TILES[10]];
    assert.ok(originTile);
    assert.ok(targetTile);

    const result = calculateRoadAdjustedTravel({
      origin: { mapX: originTile.xPercent, mapY: originTile.yPercent },
      target: { mapX: targetTile.xPercent, mapY: targetTile.yPercent },
      baseMinutes: 20,
      roadSegments: [],
    });

    assert.equal(result.baseMinutes, 20);
    assert.equal(result.adjustedMinutes, 20);
    assert.equal(result.savedMinutes, 0);
  });

  it("reduces travel time when a highway path is available", () => {
    const [originTile, targetTile] = [HEX_TILES[0], HEX_TILES[12]];
    assert.ok(originTile);
    assert.ok(targetTile);

    const baseline = calculateRoadAdjustedTravel({
      origin: { mapX: originTile.xPercent, mapY: originTile.yPercent },
      target: { mapX: targetTile.xPercent, mapY: targetTile.yPercent },
      baseMinutes: 30,
      roadSegments: [],
    });
    const highway = calculateRoadAdjustedTravel({
      origin: { mapX: originTile.xPercent, mapY: originTile.yPercent },
      target: { mapX: targetTile.xPercent, mapY: targetTile.yPercent },
      baseMinutes: 30,
      roadSegments: baseline.routeTileIds.map((tileId) => ({
        tileId,
        level: 3,
        crossings: 500,
      })),
    });

    assert.ok(highway.adjustedMinutes < baseline.adjustedMinutes);
    assert.ok(highway.savedMinutes > 0);
    assert.ok(highway.speedMultiplier > 1);
  });

  it("only exposes speed weights for real roads", () => {
    const weights = getRoadWeightsFromSegments([
      { tileId: "1:1", level: 0 },
      { tileId: "1:2", level: 2 },
    ]);

    assert.equal(weights.has("1:1"), false);
    assert.equal(weights.get("1:2"), 1.3);
  });

  it("scales idle battalion road crossings by patrol footprint", () => {
    assert.equal(getIdleBattalionRoadCrossings(0), 0);
    assert.equal(getIdleBattalionRoadCrossings(1), 1);
    assert.equal(getIdleBattalionRoadCrossings(500), 5);
    assert.equal(getIdleBattalionRoadCrossings(50_000), 25);
  });

  it("records idle battalion road progress only on owned stationed tiles", () => {
    const plan = getIdleBattalionRoadCrossingPlan({
      ownedTilesByFortress: new Map([
        ["fort_1", new Set(["20:15", "21:15"])],
        ["fort_2", new Set(["10:10"])],
      ]),
      battalions: [
        {
          id: "idle_owned",
          fortressId: "fort_1",
          size: 500,
          garrisonedAt: "20:15",
          assignmentCount: 0,
          pendingReinforcementCount: 0,
        },
        {
          id: "second_idle_owned",
          fortressId: "fort_1",
          size: 120,
          garrisonedAt: "20:15",
          assignmentCount: 0,
          pendingReinforcementCount: 0,
        },
        {
          id: "front_assigned",
          fortressId: "fort_1",
          size: 500,
          garrisonedAt: "21:15",
          assignmentCount: 1,
          pendingReinforcementCount: 0,
        },
        {
          id: "reinforcing",
          fortressId: "fort_2",
          size: 500,
          garrisonedAt: "10:10",
          assignmentCount: 0,
          pendingReinforcementCount: 1,
        },
        {
          id: "not_owned",
          fortressId: "fort_1",
          size: 500,
          garrisonedAt: "30:15",
          assignmentCount: 0,
          pendingReinforcementCount: 0,
        },
      ],
    });

    assert.deepEqual(plan, [{ tileId: "20:15", crossings: 7 }]);
  });
});
