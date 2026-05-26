import assert from "node:assert/strict";
import test from "node:test";
import { ConvoyLegStatus, DiplomacyRelationStatus } from "@/lib/prisma-client";
import {
  calculateConvoyEncounterCasualties,
  calculateDetectionChance,
  calculateRaidSuccessChance,
  calculateStolenConvoyCargo,
  getRaidTargetBlockedReason,
  isConvoyRaidEligible,
  resolveSeededChance,
} from "./convoy-conflict";

test("convoy raids reject allies and permit other relation states", () => {
  assert.match(
    getRaidTargetBlockedReason(DiplomacyRelationStatus.ALLIED) ?? "",
    /Allied/
  );
  assert.equal(getRaidTargetBlockedReason(DiplomacyRelationStatus.NEUTRAL), null);
  assert.equal(getRaidTargetBlockedReason(DiplomacyRelationStatus.ENEMY), null);
  assert.equal(getRaidTargetBlockedReason(DiplomacyRelationStatus.WAR), null);
});

test("only unsettled scored convoy legs are raid eligible", () => {
  assert.equal(
    isConvoyRaidEligible({
      status: ConvoyLegStatus.IN_TRANSIT,
      baseCargoValue: 1_000,
      encounterResolvedAt: null,
    }),
    true
  );
  assert.equal(
    isConvoyRaidEligible({
      status: ConvoyLegStatus.IN_TRANSIT,
      baseCargoValue: 999,
      encounterResolvedAt: null,
    }),
    false
  );
  assert.equal(
    isConvoyRaidEligible({
      status: ConvoyLegStatus.IN_TRANSIT,
      baseCargoValue: 1_000,
      encounterResolvedAt: new Date(),
    }),
    false
  );
});

test("raid and detection rolls are reproducible with bounded odds", () => {
  assert.equal(calculateRaidSuccessChance({ raidArmy: 100, escortArmy: 0 }), 90);
  assert.equal(calculateRaidSuccessChance({ raidArmy: 1, escortArmy: 999 }), 10);
  assert.equal(calculateDetectionChance({ guardArmy: 0, raidArmy: 100 }), null);
  assert.equal(calculateDetectionChance({ guardArmy: 100, raidArmy: 0 }), 90);
  assert.deepEqual(
    resolveSeededChance({ seed: "cycle:leg:raid:tick", chancePercent: 55 }),
    resolveSeededChance({ seed: "cycle:leg:raid:tick", chancePercent: 55 })
  );
});

test("convoy encounters apply bounded casualties and theft from stolen base cargo only", () => {
  assert.deepEqual(
    calculateConvoyEncounterCasualties({
      raidArmy: 101,
      escortArmy: 10,
      raidSucceeded: true,
    }),
    { raidLosses: 16, escortLosses: 4 }
  );
  assert.deepEqual(
    calculateConvoyEncounterCasualties({
      raidArmy: 1,
      escortArmy: 1,
      raidSucceeded: false,
    }),
    { raidLosses: 1, escortLosses: 1 }
  );
  assert.deepEqual(
    calculateStolenConvoyCargo({ gold: 1_501, food: 501, army: 501 }),
    { gold: 750, food: 250, army: 250, baseValue: 1_500, scorePoints: 1 }
  );
});
