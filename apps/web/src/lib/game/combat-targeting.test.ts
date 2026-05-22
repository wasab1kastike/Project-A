import assert from "node:assert/strict";
import test from "node:test";

import { canAttackTile, getTileAttackBlockedReason } from "./combat-targeting";

const baseTargetInput = {
  tile: { claimable: true },
  tileId: "1:1",
  ownerFortressId: "defender",
  attackerFortress: { id: "attacker" },
  ownedTileIds: [],
  isHomeOfA: () => false,
  isConnected: () => true,
};

test("combat targeting allows adjacent enemy owned border tiles", () => {
  assert.equal(canAttackTile(baseTargetInput), true);
});

test("combat targeting allows enemy tiles adjacent to owned territory", () => {
  assert.equal(
    canAttackTile({
      ...baseTargetInput,
      ownedTileIds: ["owned-frontier"],
      isConnected: ({ ownedTileIds }) =>
        [...ownedTileIds].includes("owned-frontier"),
    }),
    true
  );
});

test("combat targeting rejects distant enemy owned tiles", () => {
  assert.match(
    getTileAttackBlockedReason({
      ...baseTargetInput,
      isConnected: () => false,
    }) ?? "",
    /active border/
  );
});

test("combat targeting rejects own and neutral normal tiles", () => {
  assert.match(
    getTileAttackBlockedReason({
      ...baseTargetInput,
      ownerFortressId: "attacker",
    }) ?? "",
    /already controls/
  );
  assert.match(
    getTileAttackBlockedReason({
      ...baseTargetInput,
      ownerFortressId: null,
    }) ?? "",
    /Neutral tiles/
  );
});

test("combat targeting allows Home of A through its special tile rule", () => {
  assert.equal(
    canAttackTile({
      ...baseTargetInput,
      tileId: "20:15",
      ownerFortressId: null,
      isHomeOfA: () => true,
      isConnected: () => false,
    }),
    true
  );
});

test("combat targeting rejects active non-Home battlefields", () => {
  assert.match(
    getTileAttackBlockedReason({
      ...baseTargetInput,
      hasActiveBattle: true,
    }) ?? "",
    /already contested/
  );
});
