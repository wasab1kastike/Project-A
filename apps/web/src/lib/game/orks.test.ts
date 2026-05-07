import assert from "node:assert/strict";
import test from "node:test";

import {
  LootCampVariant,
  OrkBossOrderKind,
  OrkWaaaghInvestmentKind,
} from "@/lib/prisma-client";
import {
  ORK_BOSS_ORDER_CONFIG,
  ORK_DIRECT_RAID_SCRAP_CAP,
  ORK_STRONGER_TOGETHER_BASE_RATE,
  ORK_STRONGER_TOGETHER_GREEN_TIDE_RATE,
  getOrkBossOrderAttackMultiplier,
  getOrkBossOrderCarryMultiplier,
  getOrkBossOrderDefenseMultiplier,
  getOrkDirectRaidScrap,
  getOrkLootCampScrap,
  getOrkStrongerTogetherRate,
  getOrkTileBattleScrap,
  getOrkWaaaghAttackInvestmentMultiplier,
  isRealOrkPlayerFortress,
} from "./orks";

test("ork scrap gain formulas are capped and variant-aware", () => {
  assert.equal(
    getOrkDirectRaidScrap({
      defenderLosses: 10,
      goldLooted: 150,
      foodLooted: 50,
    }),
    5
  );
  assert.equal(
    getOrkDirectRaidScrap({
      defenderLosses: 1000,
      goldLooted: 10000,
      foodLooted: 10000,
    }),
    ORK_DIRECT_RAID_SCRAP_CAP
  );
  assert.equal(getOrkTileBattleScrap(false), 15);
  assert.equal(getOrkTileBattleScrap(true), 30);
  assert.equal(getOrkLootCampScrap(LootCampVariant.CLASSIC), 10);
  assert.equal(getOrkLootCampScrap(LootCampVariant.RICH), 15);
  assert.equal(getOrkLootCampScrap(LootCampVariant.CHAOS), 20);
});

test("real ork player fortress excludes NPCs and non-orks", () => {
  assert.equal(
    isRealOrkPlayerFortress({
      race: "ORKS",
      isNpc: false,
      fortressKind: "PLAYER",
    }),
    true
  );
  assert.equal(
    isRealOrkPlayerFortress({
      race: "ORKS",
      isNpc: true,
      fortressKind: "LOOT_CAMP",
    }),
    false
  );
  assert.equal(
    isRealOrkPlayerFortress({
      race: "DWARFS",
      isNpc: false,
      fortressKind: "PLAYER",
    }),
    false
  );
});

test("boss order and waaagh investment modifiers are deterministic", () => {
  const now = new Date("2026-05-07T12:00:00.000Z");
  const activeOrders = [
    {
      kind: OrkBossOrderKind.MORE_DAKKA,
      activeFrom: new Date("2026-05-07T11:59:00.000Z"),
      activeUntil: new Date("2026-05-07T12:30:00.000Z"),
    },
    {
      kind: OrkBossOrderKind.LOOT_WAGONS,
      activeFrom: new Date("2026-05-07T11:00:00.000Z"),
      activeUntil: new Date("2026-05-07T13:00:00.000Z"),
    },
    {
      kind: OrkBossOrderKind.PATCH_DA_FORT,
      activeFrom: new Date("2026-05-07T11:00:00.000Z"),
      activeUntil: new Date("2026-05-07T11:59:00.000Z"),
    },
  ];

  assert.equal(ORK_BOSS_ORDER_CONFIG[OrkBossOrderKind.MORE_DAKKA].scrapCost, 40);
  assert.equal(getOrkBossOrderAttackMultiplier(activeOrders, now), 1.25);
  assert.equal(getOrkBossOrderCarryMultiplier(activeOrders, now), 1.5);
  assert.equal(getOrkBossOrderDefenseMultiplier(activeOrders, now), 1);
  assert.equal(
    getOrkWaaaghAttackInvestmentMultiplier({
      waaaghActive: true,
      investments: [{ kind: OrkWaaaghInvestmentKind.BIGGER_SHOUTIN }],
    }),
    1.2
  );
  assert.equal(
    getOrkStrongerTogetherRate({
      waaaghActive: true,
      investments: [{ kind: OrkWaaaghInvestmentKind.DA_GREEN_TIDE }],
    }),
    ORK_STRONGER_TOGETHER_GREEN_TIDE_RATE
  );
  assert.equal(
    getOrkStrongerTogetherRate({
      waaaghActive: false,
      investments: [{ kind: OrkWaaaghInvestmentKind.DA_GREEN_TIDE }],
    }),
    ORK_STRONGER_TOGETHER_BASE_RATE
  );
});
