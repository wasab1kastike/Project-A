import assert from "node:assert/strict";
import test from "node:test";

import { DiplomacyRelationStatus } from "@/lib/prisma-client";
import {
  ALLIANCE_TRUST_TERMS,
  WAR_DECLARATION_DELAY_HOURS,
  canAttackByDiplomacy,
  canPressureByDiplomacy,
  canProposePeace,
  getCanonicalDiplomacyPair,
  getDiplomacyAttackBlockedReason,
  getDiplomacyPressureBlockedReason,
  getEffectiveDiplomacyStatus,
  getAllianceTrustUpgradeDeposit,
  getPoliticsRelationPresentation,
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
  assert.equal(
    canAttackByDiplomacy({
      relation: {
        status: DiplomacyRelationStatus.WAR_PENDING,
        warStartsAt: now,
      },
      now,
      isBorderTarget: true,
    }),
    true
  );
});

test("diplomacy pressure permissions block allies but allow neutral land", () => {
  const now = new Date("2026-04-20T12:00:00.000Z");

  assert.equal(
    getDiplomacyPressureBlockedReason({
      relation: { status: DiplomacyRelationStatus.ALLIED },
      now,
    }),
    "Allies cannot pressure each other's territory."
  );
  assert.equal(
    canPressureByDiplomacy({
      relation: null,
      now,
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

test("alliance trust tiers charge only incremental resource escrow", () => {
  assert.deepEqual(ALLIANCE_TRUST_TERMS[1], {
    escrowGold: 2_000,
    escrowFood: 2_000,
    deliveryBonusPercent: 10,
  });
  assert.deepEqual(
    getAllianceTrustUpgradeDeposit({ currentTier: 1, requestedTier: 2 }),
    { gold: 8_000, food: 8_000 }
  );
  assert.deepEqual(
    getAllianceTrustUpgradeDeposit({ currentTier: 2, requestedTier: 3 }),
    { gold: 20_000, food: 20_000 }
  );
  assert.throws(
    () =>
      getAllianceTrustUpgradeDeposit({ currentTier: 2, requestedTier: 2 }),
    /increase/
  );
});

test("politics relation presentation derives alliance and peace actions", () => {
  const now = new Date("2026-04-20T12:00:00.000Z");

  assert.deepEqual(
    getPoliticsRelationPresentation({
      relation: null,
      now,
      currentFortressId: "alpha",
    }).availableActions,
    ["DECLARE_WAR", "PROPOSE_ALLIANCE"]
  );

  assert.deepEqual(
    getPoliticsRelationPresentation({
      relation: {
        status: DiplomacyRelationStatus.ALLIANCE_PENDING,
        allianceProposedById: "beta",
      },
      now,
      currentFortressId: "alpha",
    }).availableActions,
    ["ACCEPT_ALLIANCE"]
  );

  const pending = getPoliticsRelationPresentation({
    relation: {
      status: DiplomacyRelationStatus.WAR_PENDING,
      warStartsAt: new Date("2026-04-21T12:00:00.000Z"),
    },
    now,
    currentFortressId: "alpha",
  });

  assert.equal(pending.effectiveStatus, DiplomacyRelationStatus.WAR_PENDING);
  assert.deepEqual(pending.availableActions, ["PROPOSE_PEACE"]);

  const matured = getPoliticsRelationPresentation({
    relation: {
      status: DiplomacyRelationStatus.WAR_PENDING,
      warStartsAt: now,
    },
    now,
    currentFortressId: "alpha",
  });

  assert.equal(matured.effectiveStatus, DiplomacyRelationStatus.WAR);
  assert.deepEqual(matured.availableActions, ["PROPOSE_PEACE"]);

  assert.deepEqual(
    getPoliticsRelationPresentation({
      relation: {
        status: DiplomacyRelationStatus.PEACE_PENDING,
        peaceProposedById: "beta",
      },
      now,
      currentFortressId: "alpha",
    }).availableActions,
    ["ACCEPT_PEACE"]
  );

  const ownPeace = getPoliticsRelationPresentation({
    relation: {
      status: DiplomacyRelationStatus.PEACE_PENDING,
      peaceProposedById: "alpha",
    },
    now,
    currentFortressId: "alpha",
  });

  assert.equal(ownPeace.availableAction, null);
  assert.match(ownPeace.disabledReason ?? "", /waiting/);

  const allied = getPoliticsRelationPresentation({
    relation: { status: DiplomacyRelationStatus.ALLIED, allianceTrustTier: 1 },
    now,
    currentFortressId: "alpha",
  });

  assert.deepEqual(allied.availableActions, [
    "PROPOSE_TRUST_UPGRADE",
    "BETRAY_ALLIANCE",
  ]);

  const trustOffer = getPoliticsRelationPresentation({
    relation: {
      status: DiplomacyRelationStatus.ALLIED,
      allianceTrustTier: 1,
      trustUpgradeTier: 2,
      trustUpgradeProposedById: "beta",
    },
    now,
    currentFortressId: "alpha",
  });

  assert.deepEqual(trustOffer.availableActions, [
    "ACCEPT_TRUST_UPGRADE",
    "BETRAY_ALLIANCE",
  ]);
});
