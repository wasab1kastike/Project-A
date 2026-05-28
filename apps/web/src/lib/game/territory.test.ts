import assert from "node:assert/strict";
import test from "node:test";

import { HEX_SPAWN_TILES, HEX_TILES } from "./map-hex";
import {
  getAdjacentTileIds,
  getTileBonus,
  getTileById,
  isTileConnectedToFortressOrOwnedTiles,
  isHomeOfATile,
} from "./territory";

test("spawnable land tiles always provide economic value", () => {
  for (const tile of HEX_SPAWN_TILES) {
    if (isHomeOfATile(tile.id)) {
      continue;
    }

    const bonus = getTileBonus(tile);

    assert.ok(
      bonus.gold > 0 || bonus.food > 0,
      `Expected ${tile.id} (${tile.biome}) to provide gold or food`
    );
    assert.equal(bonus.points, 0);
  }
});

test("lake tiles stay non-spawnable but are claimable", () => {
  const lakeTile = HEX_TILES.find((candidate) => candidate.biome === "lake");

  assert.ok(lakeTile && lakeTile.biome === "lake");
  assert.equal(lakeTile.spawnable, false);
  assert.equal(lakeTile.claimable, true);
});

test("adjacent tile detection follows even and odd row offsets", () => {
  const evenTile = getTileById("5:4");
  const oddTile = getTileById("5:5");

  assert.ok(evenTile);
  assert.ok(oddTile);

  assert.deepEqual(new Set(getAdjacentTileIds(evenTile.id)), new Set([
    "4:3",
    "5:3",
    "4:4",
    "6:4",
    "4:5",
    "5:5",
  ]));
  assert.deepEqual(new Set(getAdjacentTileIds(oddTile.id)), new Set([
    "5:4",
    "6:4",
    "4:5",
    "6:5",
    "5:6",
    "6:6",
  ]));
});

test("tile connectivity accepts castle-adjacent and owned frontier tiles", () => {
  const ownedTileIds = [
    "9:7",
    "9:6",
    "10:5",
    "12:8",
  ];

  assert.equal(
    isTileConnectedToFortressOrOwnedTiles({
      tileId: "10:8",
      fortress: { mapX: 50, mapY: 50 },
      ownedTileIds,
    }),
    true
  );
  assert.equal(
    isTileConnectedToFortressOrOwnedTiles({
      tileId: "10:8",
      fortress: { mapX: 0, mapY: 0 },
      ownedTileIds: [],
    }),
    false
  );
});

test("lakes provide a unique small bonus", () => {
  const lakeTile = HEX_TILES.find((candidate) => candidate.biome === "lake");

  assert.ok(lakeTile);

  const lakeBonus = getTileBonus(lakeTile);

  assert.deepEqual(
    {
      gold: lakeBonus.gold,
      food: lakeBonus.food,
      points: lakeBonus.points,
      army: lakeBonus.army,
      defensePercent: lakeBonus.defensePercent,
    },
    {
      gold: 2,
      food: 2,
      points: 0,
      army: 0,
      defensePercent: 0,
    }
  );
});
