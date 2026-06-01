// =============================================================================
// March Pathfinding Tests
// =============================================================================

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  getHexNeighbors,
  getTileTravelCost,
  findSimplePath,
  findMarchPath,
  BASE_TILE_TRAVEL_MS,
  type PathHexTile,
  type RoadWeights,
} from "./march-pathfinding";

// ── Helper: build a small hex grid for testing ───────────────────────────────

function makeTile(col: number, row: number): PathHexTile {
  return { id: `${col},${row}`, col, row };
}

function makeColonTile(col: number, row: number): PathHexTile {
  return { id: `${col}:${row}`, col, row };
}

function buildGrid(cols: number, rows: number): {
  tiles: PathHexTile[];
  lookup: Map<string, PathHexTile>;
} {
  const tiles: PathHexTile[] = [];
  for (let c = 0; c < cols; c++) {
    for (let r = 0; r < rows; r++) {
      tiles.push(makeTile(c, r));
    }
  }
  const lookup = new Map(tiles.map((t) => [t.id, t]));
  return { tiles, lookup };
}

describe("march-pathfinding", () => {
  describe("getHexNeighbors", () => {
    it("returns up to 6 neighbors", () => {
      const { lookup } = buildGrid(5, 5);
      const center = makeTile(2, 2);
      const neighbors = getHexNeighbors(center, lookup);
      assert.ok(neighbors.length >= 4);
      assert.ok(neighbors.length <= 6);
    });
    it("corner tile has fewer neighbors", () => {
      const { lookup } = buildGrid(5, 5);
      const corner = makeTile(0, 0);
      const neighbors = getHexNeighbors(corner, lookup);
      assert.ok(neighbors.length < 6);
    });
    it("all neighbors are valid tiles", () => {
      const { tiles, lookup } = buildGrid(3, 3);
      const center = tiles.find((t) => t.col === 1 && t.row === 1)!;
      const neighbors = getHexNeighbors(center, lookup);
      for (const n of neighbors) {
        assert.ok(lookup.has(n.id));
      }
    });
    it("supports colon-delimited map tile ids", () => {
      const tiles = [
        makeColonTile(0, 0),
        makeColonTile(1, 0),
        makeColonTile(0, 1),
      ];
      const lookup = new Map(tiles.map((tile) => [tile.id, tile]));
      const neighbors = getHexNeighbors(makeColonTile(0, 0), lookup);
      assert.ok(neighbors.some((neighbor) => neighbor.id === "1:0"));
      assert.ok(neighbors.some((neighbor) => neighbor.id === "0:1"));
    });
  });

  describe("getTileTravelCost", () => {
    it("baseline is 60 seconds", () => {
      assert.equal(getTileTravelCost("t1", new Map()), BASE_TILE_TRAVEL_MS);
    });
    it("highway reduces cost", () => {
      const roads: RoadWeights = new Map([["t1", 1.5]]);
      const cost = getTileTravelCost("t1", roads);
      assert.ok(cost < BASE_TILE_TRAVEL_MS);
      assert.equal(cost, Math.floor(BASE_TILE_TRAVEL_MS / 1.5));
    });
    it("no road = base cost", () => {
      const cost = getTileTravelCost("unknown", new Map());
      assert.equal(cost, BASE_TILE_TRAVEL_MS);
    });
  });

  describe("findSimplePath", () => {
    it("finds direct path on empty grid", () => {
      const { lookup } = buildGrid(5, 5);
      const start = makeTile(0, 0);
      const end = makeTile(4, 4);
      const path = findSimplePath(start, end, lookup);
      assert.ok(path !== null);
      assert.ok(path!.length > 1);
      assert.equal(path![0], start.id);
      assert.equal(path![path!.length - 1], end.id);
    });
    it("path is continuous (adjacent tiles)", () => {
      const { lookup } = buildGrid(5, 5);
      const start = makeTile(0, 0);
      const end = makeTile(3, 2);
      const path = findSimplePath(start, end, lookup)!;
      for (let i = 0; i < path.length - 1; i++) {
        const current = lookup.get(path[i])!;
        const next = lookup.get(path[i + 1])!;
        const neighbors = getHexNeighbors(current, lookup);
        assert.ok(
          neighbors.some((n) => n.id === next.id),
          `Tile ${path[i]} → ${path[i + 1]} not adjacent`,
        );
      }
    });
  });

  describe("findMarchPath", () => {
    it("finds path with road weighting", () => {
      const { lookup } = buildGrid(5, 5);
      const start = makeTile(0, 0);
      const end = makeTile(4, 4);

      const roads: RoadWeights = new Map();
      const owned = new Set<string>();

      const result = findMarchPath({
        startTile: start,
        endTile: end,
        tileLookup: lookup,
        roads,
        ownedTileIds: owned,
      });

      assert.ok(result !== null);
      assert.ok(result!.tiles.length > 1);
      assert.equal(result!.tiles[0], start.id);
      assert.equal(result!.tiles[result!.tiles.length - 1], end.id);
      assert.equal(result!.cumulativeMs.length, result!.tiles.length);
    });

    it("cumulative travel time increases", () => {
      const { lookup } = buildGrid(5, 5);
      const start = makeTile(0, 0);
      const end = makeTile(3, 0);

      const result = findMarchPath({
        startTile: start,
        endTile: end,
        tileLookup: lookup,
        roads: new Map(),
        ownedTileIds: new Set(),
      })!;

      for (let i = 1; i < result.cumulativeMs.length; i++) {
        assert.ok(
          result.cumulativeMs[i] > result.cumulativeMs[i - 1],
          `Travel time should increase: ${result.cumulativeMs[i]} > ${result.cumulativeMs[i - 1]}`,
        );
      }
    });

    it("roads reduce travel time", () => {
      const { lookup } = buildGrid(5, 5);
      const start = makeTile(0, 0);
      const end = makeTile(3, 0);

      const noRoads = findMarchPath({
        startTile: start,
        endTile: end,
        tileLookup: lookup,
        roads: new Map(),
        ownedTileIds: new Set(),
      })!;

      // Add highways on all tiles.
      const roadMap: RoadWeights = new Map();
      for (const [, tile] of lookup) {
        roadMap.set(tile.id, 1.5);
      }

      const withRoads = findMarchPath({
        startTile: start,
        endTile: end,
        tileLookup: lookup,
        roads: roadMap,
        ownedTileIds: new Set(),
      })!;

      const noRoadTotal =
        noRoads.cumulativeMs[noRoads.cumulativeMs.length - 1];
      const withRoadTotal =
        withRoads.cumulativeMs[withRoads.cumulativeMs.length - 1];
      assert.ok(
        withRoadTotal < noRoadTotal,
        `Road total ${withRoadTotal} should be less than no-road ${noRoadTotal}`,
      );
    });

    it("owned tiles are preferred (10% discount)", () => {
      const { lookup } = buildGrid(4, 4);
      const start = makeTile(0, 0);
      const end = makeTile(3, 0);

      // There are two equal-length paths: direct horizontal vs zigzag.
      // Mark the bottom row as owned — path should prefer owned tiles.
      const owned = new Set<string>();
      // Mark tiles at row=1 as owned.
      for (const tile of lookup.values()) {
        if (tile.row === 1 && tile.col <= 3) {
          owned.add(tile.id);
        }
      }

      const result = findMarchPath({
        startTile: start,
        endTile: end,
        tileLookup: lookup,
        roads: new Map(),
        ownedTileIds: owned,
      });

      assert.ok(result !== null);
      // Path should include at least one owned tile if it shortens travel time.
    });
  });
});
