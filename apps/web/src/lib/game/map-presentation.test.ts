import assert from "node:assert/strict";
import test from "node:test";

import { getMapTilePresentation } from "./map-presentation";

const baseTile = {
  tileId: "10:10",
  biomeLabel: "Plains",
  bonusLabel: "+1 food",
};

test("selected tile tone overrides battle, attackable, and priority states", () => {
  const presentation = getMapTilePresentation({
    ...baseTile,
    isSelected: true,
    hasActiveBattle: true,
    canAttack: true,
    pressurePriorityRank: 1,
  });

  assert.equal(presentation.tone, "selected");
  assert.equal(presentation.stateLabel, "Battle active");
  assert.match(presentation.accessibleLabel, /Battle active/);
});

test("battle tone overrides attackable and pressure priority states", () => {
  const presentation = getMapTilePresentation({
    ...baseTile,
    hasActiveBattle: true,
    canAttack: true,
    pressurePriorityRank: 2,
  });

  assert.equal(presentation.tone, "battle");
  assert.equal(presentation.actionLabel, "Open battle details");
});

test("attackable tone overrides ordinary ownership", () => {
  const presentation = getMapTilePresentation({
    ...baseTile,
    isOwned: true,
    ownerName: "Spitehold",
    canAttack: true,
  });

  assert.equal(presentation.tone, "attackable");
  assert.equal(presentation.ownerLabel, "Owned by Spitehold");
  assert.equal(presentation.stateLabel, "Attackable");
});

test("pressure priority keeps rank and action labels", () => {
  const presentation = getMapTilePresentation({
    ...baseTile,
    pressurePriority: true,
    pressurePriorityRank: 3,
  });

  assert.equal(presentation.tone, "priority");
  assert.equal(presentation.stateLabel, "Priority #3");
  assert.equal(presentation.actionLabel, "Reorder or clear priority");
});

test("neutral pressure reports player and leader progress", () => {
  const presentation = getMapTilePresentation({
    ...baseTile,
    pressurePlayerProgress: 120,
    pressureProgress: 300,
    pressureThreshold: 600,
    pressureLeaderLabel: "Bog Bank",
  });

  assert.equal(presentation.tone, "neutral");
  assert.equal(
    presentation.pressureLabel,
    "You 120/600; leader Bog Bank 300/600",
  );
});

test("current user ownership gets a distinct own tone", () => {
  const presentation = getMapTilePresentation({
    ...baseTile,
    isOwned: true,
    isCurrentUser: true,
    ownerName: "Mine",
  });

  assert.equal(presentation.tone, "own");
  assert.equal(presentation.ownerLabel, "Owned by you");
});
