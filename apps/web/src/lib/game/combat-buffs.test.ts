import assert from "node:assert/strict";
import test from "node:test";
import {
  OrkBossOrderKind,
  OrkWaaaghInvestmentKind,
  RaceAbilityKind,
} from "@/lib/prisma-client";
import {
  getBattlefieldAttrition,
  getHomeOfABossBattleDamage,
} from "./battlefield-rules";
import {
  distributeBattlefieldLosses,
  getBattlefieldTileDefensePowerMultiplier,
} from "./battlefields";
import {
  getCombatAttackPowerMultiplier,
  getCombatDefensePowerMultiplier,
} from "./combat-buffs";
import { HEX_TILES } from "./map-hex";
import { HOME_OF_A_TILE_ID } from "./constants";

const now = new Date("2026-05-19T10:00:00.000Z");
const activeWindow = {
  activeFrom: new Date("2026-05-19T09:00:00.000Z"),
  activeUntil: new Date("2026-05-19T11:00:00.000Z"),
};

test("combat buffs drive battlefield attrition in both directions", () => {
  const attackerMultiplier = getCombatAttackPowerMultiplier({
    fortress: {
      id: "ork-attacker",
      race: "ORKS",
      raceAbilityActivations: [
        { kind: RaceAbilityKind.ORK_WAAAGH, ...activeWindow },
      ],
      orkWaaaghInvestments: [
        { kind: OrkWaaaghInvestmentKind.BIGGER_SHOUTIN },
      ],
      orkBossOrders: [
        { kind: OrkBossOrderKind.MORE_DAKKA, ...activeWindow },
      ],
    },
    now,
    leaderboardTitleHolders: { unitsKilled: "ork-attacker" },
  });
  const defenderMultiplier = getCombatDefensePowerMultiplier({
    fortress: {
      id: "ork-defender",
      race: "ORKS",
      raceAbilityActivations: [
        { kind: RaceAbilityKind.ORK_WAAAGH, ...activeWindow },
      ],
      orkBossOrders: [
        { kind: OrkBossOrderKind.PATCH_DA_FORT, ...activeWindow },
      ],
    },
    now,
    opponentFortressId: "attacker",
  });

  assert.ok(Math.abs(attackerMultiplier - 6.6) < 0.000001);
  assert.equal(defenderMultiplier, 4.8);

  const attackerFavored = getBattlefieldAttrition({
    battleAgeMinutes: 60,
    attackerArmy: 1000,
    defenderArmy: 1000,
    attackerPowerMultiplier: attackerMultiplier,
  });
  const defenderFavored = getBattlefieldAttrition({
    battleAgeMinutes: 60,
    attackerArmy: 1000,
    defenderArmy: 1000,
    defenderPowerMultiplier: defenderMultiplier,
  });

  assert.ok(attackerFavored.defenderLosses > attackerFavored.attackerLosses);
  assert.ok(defenderFavored.attackerLosses > defenderFavored.defenderLosses);
});

test("Butcher title is attack-only and does not boost defender power", () => {
  assert.equal(
    getCombatAttackPowerMultiplier({
      fortress: { id: "butcher", race: null },
      now,
      leaderboardTitleHolders: { unitsKilled: "butcher" },
    }),
    1.1
  );
  assert.equal(
    getCombatDefensePowerMultiplier({
      fortress: { id: "butcher", race: null },
      now,
      opponentFortressId: "attacker",
    }),
    1
  );
});

test("STIM protects only the active participant's battlefield losses", () => {
  const losses = distributeBattlefieldLosses(
    [
      {
        id: "stim",
        armyRemaining: 100,
        armyCommitted: 100,
      },
      {
        id: "ally",
        armyRemaining: 100,
        armyCommitted: 100,
      },
    ],
    80,
    new Set(["stim"])
  );

  assert.equal(losses.lossesByParticipantId.get("stim") ?? 0, 0);
  assert.equal(losses.lossesByParticipantId.get("ally"), 40);
  assert.equal(losses.appliedLosses, 40);
});

test("owned tile defense bonuses contribute to battlefield defender power", () => {
  const mountainTile = HEX_TILES.find(
    (tile) => tile.biome === "mountains" && tile.id !== HOME_OF_A_TILE_ID
  );

  assert.ok(mountainTile);
  assert.equal(
    getBattlefieldTileDefensePowerMultiplier({
      targetTileId: mountainTile.id,
      defenderRace: "ORKS",
      ownedTileDefensePercent: 3,
    }),
    1.03
  );
  assert.equal(
    getBattlefieldTileDefensePowerMultiplier({
      targetTileId: mountainTile.id,
      defenderRace: "DWARFS",
      ownedTileDefensePercent: 3,
    }),
    1.2875
  );
  assert.equal(
    getBattlefieldTileDefensePowerMultiplier({
      targetTileId: mountainTile.id,
      defenderRace: "ORKS",
      ownedTileDefensePercent: 5,
    }),
    1.05
  );
  assert.equal(
    getBattlefieldTileDefensePowerMultiplier({
      targetTileId: mountainTile.id,
      defenderRace: "DWARFS",
      ownedTileDefensePercent: 5,
    }),
    1.3125
  );
  assert.equal(
    getBattlefieldTileDefensePowerMultiplier({
      targetTileId: HOME_OF_A_TILE_ID,
      defenderRace: "DWARFS",
      ownedTileDefensePercent: 5,
    }),
    1
  );
});

test("PvE attack power buffs affect Home of A damage and skip NPC grudges", () => {
  const dwarfMultiplier = getCombatAttackPowerMultiplier({
    fortress: {
      id: "dwarf",
      race: "DWARFS",
      raceAbilityActivations: [
        { kind: RaceAbilityKind.DWARF_COMBAT_SURGE, ...activeWindow },
      ],
      dwarfGrudges: [{ targetFortressId: "npc", bonusMultiplier: 2 }],
    },
    now,
    targetFortressId: "npc",
    targetIsPlayerFortress: false,
    leaderboardTitleHolders: { unitsKilled: "dwarf" },
  });

  assert.equal(dwarfMultiplier, 1.375);
  assert.equal(
    getHomeOfABossBattleDamage({
      attackerArmy: 1000,
      attackPowerMultiplier: dwarfMultiplier,
      bossHealth: 5000,
    }),
    41
  );
  assert.equal(
    getCombatAttackPowerMultiplier({
      fortress: {
        id: "dwarf",
        race: "DWARFS",
        dwarfGrudges: [{ targetFortressId: "player", bonusMultiplier: 2 }],
      },
      now,
      targetFortressId: "player",
      targetIsPlayerFortress: true,
    }),
    1.5
  );
});
