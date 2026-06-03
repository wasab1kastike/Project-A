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

  it("records idle battalion road progress on mode patrol tiles", () => {
    const homeTile = HEX_TILES.find((tile) => tile.id === "20:15");
    const borderTile = HEX_TILES.find((tile) => tile.id === "21:15");
    const enemyTile = HEX_TILES.find((tile) => tile.id === "30:15");
    const allyTile = HEX_TILES.find((tile) => tile.id === "10:10");
    assert.ok(homeTile);
    assert.ok(borderTile);
    assert.ok(enemyTile);
    assert.ok(allyTile);

    const plan = getIdleBattalionRoadCrossingPlan({
      ownedTilesByFortress: new Map([
        ["fort_1", new Set([homeTile.id, borderTile.id])],
        ["fort_2", new Set([allyTile.id])],
      ]),
      fortressPositionsById: new Map([
        ["fort_1", { mapX: homeTile.xPercent, mapY: homeTile.yPercent }],
        ["fort_2", { mapX: allyTile.xPercent, mapY: allyTile.yPercent }],
        ["enemy", { mapX: enemyTile.xPercent, mapY: enemyTile.yPercent }],
      ]),
      warFronts: [
        {
          attackerFortressId: "fort_1",
          enemyFortressId: "enemy",
          status: "ADVANCING",
        },
      ],
      alliedFortressIdsByFortress: new Map([["fort_1", new Set(["fort_2"])]]),
      battalions: [
        {
          id: "reserve_patrol",
          fortressId: "fort_1",
          size: 500,
          mode: "RESERVE",
          assignmentCount: 0,
          pendingReinforcementCount: 0,
        },
        {
          id: "guard_patrol",
          fortressId: "fort_1",
          size: 120,
          mode: "GUARD",
          assignmentCount: 0,
          pendingReinforcementCount: 0,
        },
        {
          id: "attack_patrol",
          fortressId: "fort_1",
          size: 500,
          mode: "ATTACK",
          assignmentCount: 0,
          pendingReinforcementCount: 0,
        },
        {
          id: "alliance_patrol",
          fortressId: "fort_1",
          size: 500,
          mode: "ALLIANCE",
          assignmentCount: 0,
          pendingReinforcementCount: 0,
        },
        {
          id: "front_assigned",
          fortressId: "fort_1",
          size: 500,
          mode: "ATTACK",
          assignmentCount: 1,
          pendingReinforcementCount: 0,
        },
        {
          id: "reinforcing",
          fortressId: "fort_2",
          size: 500,
          mode: "ALLIANCE",
          assignmentCount: 0,
          pendingReinforcementCount: 1,
        },
        {
          id: "no_owned_tiles",
          fortressId: "fort_1",
          size: 0,
          mode: "GUARD",
          assignmentCount: 0,
          pendingReinforcementCount: 0,
        },
      ],
    });

    assert.equal(
      plan.reduce((sum, crossing) => sum + crossing.crossings, 0),
      17
    );
    assert.ok(
      plan.every(
        (crossing) =>
          crossing.tileId === homeTile.id || crossing.tileId === borderTile.id
      )
    );
  });
});
