import assert from "node:assert/strict";
import test from "node:test";

import {
  TEMPORARY_MAP_OBJECTIVE_INTERVAL_HOURS,
  TEMPORARY_MAP_OBJECTIVE_POINT_VALUES,
} from "./constants";
import { HEX_SPAWN_TILES } from "./map-hex";
import {
  TILE_CLAIM_OWNED_TILE_COST_STEP,
  getAdjacentTileIds,
  getTemporaryMapObjectives,
  getTileBonus,
  getTileById,
  getTileClaimCost,
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

test("temporary map objectives are deterministic per cycle and window", () => {
  const at = new Date("2026-05-06T12:15:00.000Z");
  const first = getTemporaryMapObjectives({
    cycleId: "cycle-alpha",
    at,
  });
  const second = getTemporaryMapObjectives({
    cycleId: "cycle-alpha",
    at,
  });

  assert.deepEqual(first, second);
  assert.equal(first.length, TEMPORARY_MAP_OBJECTIVE_POINT_VALUES.length);
  assert.equal(new Set(first.map((objective) => objective.tileId)).size, first.length);
  assert.deepEqual(
    first.map((objective) => objective.points),
    [...TEMPORARY_MAP_OBJECTIVE_POINT_VALUES]
  );

  const intervalMs = TEMPORARY_MAP_OBJECTIVE_INTERVAL_HOURS * 60 * 60 * 1000;
  assert.equal(first[0]?.activeUntil.getTime() - first[0]?.activeFrom.getTime(), intervalMs);
});

test("objective tiles gain point income while active", () => {
  const at = new Date("2026-05-06T12:15:00.000Z");
  const [objective] = getTemporaryMapObjectives({
    cycleId: "cycle-alpha",
    at,
  });
  const tile = HEX_SPAWN_TILES.find((candidate) => candidate.id === objective.tileId);

  assert.ok(tile);

  const bonus = getTileBonus(tile, {
    tileId: tile.id,
    cycleId: "cycle-alpha",
    at,
  });

  assert.equal(bonus.points, objective.points);
  assert.match(bonus.label, new RegExp(objective.name));
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
  const castleTile = HEX_SPAWN_TILES.find((tile) => tile.spawnable);

  assert.ok(castleTile);

  const fortress = {
    mapX: castleTile.xPercent,
    mapY: castleTile.yPercent,
  };
  const castleAdjacentTile = getAdjacentTileIds(castleTile.id)
    .map((tileId) => getTileById(tileId))
    .find((tile) => tile?.spawnable);

  assert.ok(castleAdjacentTile);
  assert.equal(
    isTileConnectedToFortressOrOwnedTiles({
      tileId: castleAdjacentTile.id,
      fortress,
      ownedTileIds: [],
    }),
    true
  );

  const frontierTile = getAdjacentTileIds(castleAdjacentTile.id)
    .map((tileId) => getTileById(tileId))
    .find(
      (tile) =>
        tile?.spawnable &&
        tile.id !== castleTile.id &&
        !getAdjacentTileIds(tile.id).includes(castleTile.id)
    );

  assert.ok(frontierTile);
  assert.equal(
    isTileConnectedToFortressOrOwnedTiles({
      tileId: frontierTile.id,
      fortress,
      ownedTileIds: [castleAdjacentTile.id],
    }),
    true
  );
  assert.equal(
    isTileConnectedToFortressOrOwnedTiles({
      tileId: frontierTile.id,
      fortress,
      ownedTileIds: [],
    }),
    false
  );
});

test("tile claim cost increases with distance and owned or pending count", () => {
  const tile = HEX_SPAWN_TILES.find((candidate) => candidate.biome === "plains");

  assert.ok(tile);

  const nearCost = getTileClaimCost({
    tile,
    origin: {
      mapX: tile.xPercent,
      mapY: tile.yPercent,
    },
  });
  const farCost = getTileClaimCost({
    tile,
    origin: {
      mapX: tile.xPercent + 30,
      mapY: tile.yPercent + 30,
    },
  });

  assert.ok(farCost > nearCost);
  assert.equal(
    getTileClaimCost({
      tile,
      origin: {
        mapX: tile.xPercent,
        mapY: tile.yPercent,
      },
      ownedTileCount: 2,
      pendingClaimCount: 1,
    }) - nearCost,
    3 * TILE_CLAIM_OWNED_TILE_COST_STEP
  );
});
