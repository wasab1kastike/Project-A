import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { HEX_TILES } from "./map-hex";
import {
  calculateRoadAdjustedTravel,
  getRoadWeightsFromSegments,
} from "./road-travel";

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
});
