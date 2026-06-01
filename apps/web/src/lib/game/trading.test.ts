import assert from "node:assert/strict";
import test from "node:test";

import { DiplomacyRelationStatus } from "@/lib/prisma-client";
import { getAttackTravelMinutes } from "./attacks";
import {
  assertTradeCargoWithinWagonLimit,
  calculateTradeCargoValue,
  canTradeWithRelation,
  getAllianceDeliveryBonus,
  getConvoyArrivalAt,
  getTradeBlockedReason,
  getTradeOfferExpiresAt,
  hasTradeCargo,
  normalizeTradeCargo,
  splitTradeDeliveryPoints,
  TRADE_WAGON_RESOURCE_LIMIT,
} from "./trading";

test("trade allows neutral and allied relations only", () => {
  assert.equal(canTradeWithRelation(DiplomacyRelationStatus.NEUTRAL), true);
  assert.equal(canTradeWithRelation(DiplomacyRelationStatus.ALLIED), true);
  assert.equal(canTradeWithRelation(DiplomacyRelationStatus.ENEMY), false);
  assert.equal(canTradeWithRelation(DiplomacyRelationStatus.WAR_PENDING), false);
  assert.equal(canTradeWithRelation(DiplomacyRelationStatus.WAR), false);
  assert.equal(canTradeWithRelation(DiplomacyRelationStatus.PEACE_PENDING), false);
  assert.equal(
    canTradeWithRelation(DiplomacyRelationStatus.ALLIANCE_PENDING),
    false
  );
  assert.match(
    getTradeBlockedReason(DiplomacyRelationStatus.WAR) ?? "",
    /Hostile/
  );
});

test("trade cargo must be whole non-negative values and cannot be empty", () => {
  assert.deepEqual(normalizeTradeCargo({ gold: 1, food: 2, army: 3, points: 4 }), {
    gold: 1,
    food: 2,
    army: 3,
    points: 4,
  });
  assert.throws(
    () => normalizeTradeCargo({ gold: -1, food: 0, army: 0, points: 0 }),
    /non-negative/
  );
  assert.throws(
    () => normalizeTradeCargo({ gold: 0.5, food: 0, army: 0, points: 0 }),
    /whole number/
  );
  assert.equal(hasTradeCargo({ gold: 0, food: 0, army: 0, points: 0 }), false);
  assert.equal(hasTradeCargo({ gold: 0, food: 0, army: 0, points: 1 }), true);
});

test("trade wagons cap total transported resources", () => {
  assert.doesNotThrow(() =>
    assertTradeCargoWithinWagonLimit({
      gold: 600,
      food: 400,
      army: 5_000,
      points: 500,
    })
  );
  assert.throws(
    () =>
      assertTradeCargoWithinWagonLimit({
        gold: TRADE_WAGON_RESOURCE_LIMIT,
        food: 1,
        army: 0,
        points: 0,
      }),
    /at most 1,000 total gold and food/
  );
});

test("offers expire after one day and convoys add six hours to base travel", () => {
  const now = new Date("2026-06-01T12:00:00.000Z");
  const from = { mapX: 0, mapY: 0 };
  const to = { mapX: 100, mapY: 0 };
  const arrival = getConvoyArrivalAt({ acceptedAt: now, from, to });

  assert.equal(
    getTradeOfferExpiresAt(now).getTime(),
    now.getTime() + 24 * 60 * 60 * 1000
  );
  assert.equal(
    arrival.getTime(),
    now.getTime() +
      (360 + getAttackTravelMinutes(from, to)) * 60 * 1000
  );
});

test("delivery scores base cargo and gives the sender the odd point", () => {
  assert.equal(
    calculateTradeCargoValue({ gold: 1_000, food: 500, army: 250, points: 50 }),
    2_550
  );
  assert.deepEqual(splitTradeDeliveryPoints(3_999), {
    total: 7,
    sender: 4,
    receiver: 3,
  });
});

test("delivery bonuses apply to resources and alliances add a larger bonus", () => {
  assert.deepEqual(
    getAllianceDeliveryBonus({
      cargo: { gold: 101, food: 99, army: 100, points: 50 },
      isAllied: true,
      trustTier: 2,
    }),
    { percent: 20, gold: 20, food: 19, army: 0, points: 0 }
  );
  assert.deepEqual(
    getAllianceDeliveryBonus({
      cargo: { gold: 101, food: 99, army: 100, points: 50 },
      isAllied: false,
      trustTier: 2,
    }),
    { percent: 5, gold: 5, food: 4, army: 0, points: 0 }
  );
});
