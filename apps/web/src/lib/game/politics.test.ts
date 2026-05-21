import assert from "node:assert/strict";
import test from "node:test";

import { DiplomacyRelationStatus } from "@/lib/prisma-client";
import {
  WAR_DECLARATION_DELAY_HOURS,
  canAttackByDiplomacy,
  canProposePeace,
  getCanonicalDiplomacyPair,
  getDiplomacyAttackBlockedReason,
  getEffectiveDiplomacyStatus,
  getWarStartsAt,
} from "./politics";

test("diplomacy pairs use canonical fortress id order", () => {
  assert.deepEqual(getCanonicalDiplomacyPair("b", "a"), {
    fortressAId: "a",
    fortressBId: "b",
  });
  assert.throws(() => getCanonicalDiplomacyPair("a", "a"), /different/);
});

test("war declaration starts after the 24 hour warning", () => {
  const now = new Date("2026-04-20T12:00:00.000Z");
  const warStartsAt = getWarStartsAt(now);

  assert.equal(
    warStartsAt.getTime(),
    now.getTime() + WAR_DECLARATION_DELAY_HOURS * 60 * 60 * 1000
  );
  assert.equal(
    getEffectiveDiplomacyStatus({
      relation: {
        status: DiplomacyRelationStatus.WAR_PENDING,
        warStartsAt,
      },
      now: new Date("2026-04-21T11:59:59.000Z"),
    }),
    DiplomacyRelationStatus.WAR_PENDING
  );
  assert.equal(
    getEffectiveDiplomacyStatus({
      relation: {
        status: DiplomacyRelationStatus.WAR_PENDING,
        warStartsAt,
      },
      now: warStartsAt,
    }),
    DiplomacyRelationStatus.WAR
  );
});

test("diplomacy attack permissions preserve borders and block allies", () => {
  const now = new Date("2026-04-20T12:00:00.000Z");

  assert.equal(
    getDiplomacyAttackBlockedReason({
      relation: { status: DiplomacyRelationStatus.ALLIED },
      now,
      isBorderTarget: true,
    }),
    "Allies cannot attack each other."
  );
  assert.match(
    getDiplomacyAttackBlockedReason({
      relation: {
        status: DiplomacyRelationStatus.WAR_PENDING,
        warStartsAt: new Date("2026-04-21T12:00:00.000Z"),
      },
      now,
      isBorderTarget: true,
    }) ?? "",
    /24-hour/
  );
  assert.equal(
    canAttackByDiplomacy({
      relation: null,
      now,
      isBorderTarget: true,
    }),
    true
  );
  assert.equal(
    canAttackByDiplomacy({
      relation: null,
      now,
      isBorderTarget: false,
    }),
    false
  );
  assert.equal(
    canAttackByDiplomacy({
      relation: { status: DiplomacyRelationStatus.ALLIED },
      now,
      isHomeOfA: true,
      isBorderTarget: false,
    }),
    true
  );
});

test("peace proposals are limited to hostile relation states", () => {
  assert.equal(canProposePeace(DiplomacyRelationStatus.WAR), true);
  assert.equal(canProposePeace(DiplomacyRelationStatus.WAR_PENDING), true);
  assert.equal(canProposePeace(DiplomacyRelationStatus.ENEMY), true);
  assert.equal(canProposePeace(DiplomacyRelationStatus.NEUTRAL), false);
  assert.equal(canProposePeace(DiplomacyRelationStatus.ALLIED), false);
});
