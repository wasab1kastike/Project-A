import assert from "node:assert/strict";
import test from "node:test";

import { DiplomacyRelationStatus } from "@/lib/prisma-client";
import { getAttackTravelMinutes } from "./attacks";
import {
  assertTradeCargoWithinWagonLimit,
  assertActiveTradeWagonLimit,
  calculateTradeCargoValue,
  canTradeWithRelation,
  DEFAULT_ACTIVE_TRADE_WAGON_LIMIT,
  getActiveTradeWagonLimit,
  getAllianceDeliveryBonus,
  getConvoyArrivalAt,
  getTradeBlockedReason,
  getTradeOfferExpiresAt,
  getTradeWagonResourceLimit,
  hasTradeCargo,
  normalizeTradeCargo,
  splitTradeCargoIntoWagonRuns,
  splitTradeDeliveryPoints,
  TRADE_WAGON_RESOURCE_LIMIT,
  TRADE_WAGON_RESOURCE_LIMITS,
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

test("trade wagon capacity follows the trade building level ladder", () => {
  assert.equal(TRADE_WAGON_RESOURCE_LIMIT, 100);
  assert.deepEqual([...TRADE_WAGON_RESOURCE_LIMITS], [
    100,
    500,
    1_000,
    2_000,
    3_500,
    5_000,
    7_500,
    10_000,
    15_000,
    20_000,
  ]);
  assert.equal(getTradeWagonResourceLimit(0), 100);
  assert.equal(getTradeWagonResourceLimit(1), 500);
  assert.equal(getTradeWagonResourceLimit(9), 20_000);
  assert.equal(getTradeWagonResourceLimit(99), 20_000);
  assert.equal(getTradeWagonResourceLimit(1, 25), 625);
});

test("trade wagons cap total transported resources", () => {
  assert.doesNotThrow(() =>
    assertTradeCargoWithinWagonLimit({
      gold: 60,
      food: 40,
      army: 5_000,
      points: 500,
    })
  );
  assert.doesNotThrow(() =>
    assertTradeCargoWithinWagonLimit(
      {
        gold: 600,
        food: 400,
        army: 5_000,
        points: 500,
      },
      2
    )
  );
  assert.throws(
    () =>
      assertTradeCargoWithinWagonLimit({
        gold: TRADE_WAGON_RESOURCE_LIMIT,
        food: 1,
        army: 0,
        points: 0,
      }),
    /can carry 100 total gold and food/
  );
  assert.doesNotThrow(() =>
    assertTradeCargoWithinWagonLimit(
      {
        gold: 110,
        food: 15,
        army: 0,
        points: 0,
      },
      0,
      25
    )
  );
});

test("trade cargo splits into sequential wagon runs", () => {
  assert.deepEqual(
    splitTradeCargoIntoWagonRuns({
      gold: 0,
      food: 1_000,
      army: 0,
      points: 0,
    }).map((run) => ({ gold: run.gold, food: run.food })),
    Array.from({ length: 10 }, () => ({ gold: 0, food: 100 }))
  );

  assert.deepEqual(
    splitTradeCargoIntoWagonRuns({
      gold: 250,
      food: 175,
      army: 0,
      points: 0,
    }).map((run) => ({ gold: run.gold, food: run.food })),
    [
      { gold: 100, food: 0 },
      { gold: 100, food: 0 },
      { gold: 50, food: 50 },
      { gold: 0, food: 100 },
      { gold: 0, food: 25 },
    ]
  );

  assert.deepEqual(
    splitTradeCargoIntoWagonRuns({
      gold: 0,
      food: 0,
      army: 50,
      points: 25,
    }),
    [
      {
        gold: 0,
        food: 0,
        army: 50,
        points: 25,
        nukeComponents: { FUEL: 0, ROCKET: 0, WRATH_OF_A: 0 },
      },
    ]
  );
});

test("active outbound wagon limit defaults to three and expands from skills", () => {
  assert.equal(DEFAULT_ACTIVE_TRADE_WAGON_LIMIT, 3);
  assert.equal(getActiveTradeWagonLimit(), 3);
  assert.equal(getActiveTradeWagonLimit(2), 5);
  assert.doesNotThrow(() =>
    assertActiveTradeWagonLimit({
      activeOutboundWagons: 2,
      wagonLimit: 3,
    })
  );
  assert.throws(
    () =>
      assertActiveTradeWagonLimit({
        activeOutboundWagons: 3,
        wagonLimit: 3,
      }),
    /3 active outbound wagons/
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
  assert.deepEqual(splitTradeDeliveryPoints(3_999, 0, 20), {
    total: 8,
    sender: 4,
    receiver: 4,
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
      tradeProfitPercent: 10,
    }),
    { percent: 15, gold: 15, food: 14, army: 0, points: 0 }
  );
});
