import assert from "node:assert/strict";
import test from "node:test";
import { FortressDoctrine } from "@/lib/prisma-client";
import {
  getCampaignArmyDoctrineMultiplier,
  getDoctrineChangeBlockedReason,
  getDoctrineEffectPercent,
  getEscortDoctrineMultiplier,
  getGuardDefenseDoctrineMultiplier,
  getGuardDetectionDoctrineMultiplier,
  getNeutralPressureDoctrineMultiplier,
  getRaidEvasionDoctrineMultiplier,
  getRaidPowerDoctrineMultiplier,
} from "./doctrines";

test("doctrine choices are race-legal and change only after twelve hours", () => {
  const changedAt = new Date("2026-06-01T00:00:00.000Z");
  assert.match(
    getDoctrineChangeBlockedReason({
      doctrine: FortressDoctrine.DWARF_HOLDFAST,
      race: "ORKS",
      changedAt: null,
      now: changedAt,
    }) ?? "",
    /available to your race/
  );
  assert.match(
    getDoctrineChangeBlockedReason({
      doctrine: FortressDoctrine.DWARF_HOLDFAST,
      race: "DWARFS",
      changedAt,
      now: new Date("2026-06-01T11:59:00.000Z"),
    }) ?? "",
    /12-hour cooldown/
  );
  assert.equal(
    getDoctrineChangeBlockedReason({
      doctrine: FortressDoctrine.DWARF_HOLDFAST,
      race: "DWARFS",
      changedAt,
      now: new Date("2026-06-01T12:00:00.000Z"),
    }),
    null
  );
});

test("doctrine effects scale at ten, twenty, and thirty percent", () => {
  assert.equal(getDoctrineEffectPercent(0), 0);
  assert.equal(getDoctrineEffectPercent(1), 10);
  assert.equal(getDoctrineEffectPercent(2), 20);
  assert.equal(getDoctrineEffectPercent(3), 30);
  assert.equal(
    getGuardDefenseDoctrineMultiplier(FortressDoctrine.DWARF_HOLDFAST, 3),
    1.3
  );
  assert.equal(
    getGuardDetectionDoctrineMultiplier(FortressDoctrine.DWARF_WATCHKEEPERS, 2),
    1.2
  );
  assert.equal(
    getRaidPowerDoctrineMultiplier(FortressDoctrine.ORK_MARAUDERS, 1),
    1.1
  );
  assert.equal(
    getCampaignArmyDoctrineMultiplier(FortressDoctrine.ORK_SIEGEBREAKERS, 3),
    1.3
  );
  assert.equal(
    getEscortDoctrineMultiplier(FortressDoctrine.MURINE_CONVOY_COMMAND, 2),
    1.2
  );
  assert.equal(
    getRaidEvasionDoctrineMultiplier(FortressDoctrine.UNICORN_VEILED_NETWORK, 1),
    1.1
  );
});

test("Glitter Frontier affects only favored neutral terrain pressure", () => {
  assert.equal(
    getNeutralPressureDoctrineMultiplier({
      doctrine: FortressDoctrine.UNICORN_GLITTER_FRONTIER,
      tier: 3,
      targetBiome: "forest",
    }),
    1.3
  );
  assert.equal(
    getNeutralPressureDoctrineMultiplier({
      doctrine: FortressDoctrine.UNICORN_GLITTER_FRONTIER,
      tier: 3,
      targetBiome: "mountains",
    }),
    1
  );
});
