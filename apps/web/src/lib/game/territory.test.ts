import assert from "node:assert/strict";
import test from "node:test";

import {
  TEMPORARY_MAP_OBJECTIVE_INTERVAL_HOURS,
  TEMPORARY_MAP_OBJECTIVE_POINT_VALUES,
} from "./constants";
import { HEX_SPAWN_TILES } from "./map-hex";
import {
  getTemporaryMapObjectives,
  getTileBonus,
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