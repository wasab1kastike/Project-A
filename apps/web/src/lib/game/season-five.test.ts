import assert from "node:assert/strict";
import test from "node:test";
import {
  CycleRuleset,
  CycleStatus,
  SeasonFiveActionKind,
  SeasonFiveCharacterClass,
  SeasonFiveFishRarity,
  SeasonFiveGearSlot,
  SeasonFiveLocationKind,
  SeasonFiveMapRole,
  SeasonFiveMapTerrain,
} from "@/lib/prisma-client";
import {
  createSeasonFiveHomeState,
  createSeasonFiveTravelState,
  getSeasonFiveActionSummary,
  resolveSeasonFiveCompletedTravel,
} from "./season-five-actions";
import {
  formatSeasonFiveFishWeight,
  getSeasonFiveInventoryPressure,
  planSeasonFivePassiveCatches,
} from "./season-five-fishing";
import {
  rankSeasonFiveBiggestFish,
  rankSeasonFiveMostFish,
} from "./season-five-leaderboards";
import {
  buildSeasonFiveLocationActivity,
  SEASON_FIVE_MAP_MARKER_LIMIT,
} from "./season-five-presence";
import {
  calculateSeasonFiveRoutePreview,
  createSeasonFiveMapTiles,
  getSeasonFiveLocationTileKey,
  planSeasonFiveDailySpecialTiles,
  planSeasonFiveFishingLocations,
  planSeasonFiveWaterBodies,
  regenerateSeasonFiveWaterBodyStock,
  rollSeasonFiveGlobalDiscovery,
  rollSeasonFiveWaterBodyDiscovery,
  SEASON_FIVE_MAP_COLUMNS,
  SEASON_FIVE_MAP_ROWS,
  SEASON_FIVE_SECRET_LAKE_KEY,
} from "./season-five-map";
import {
  calculateSeasonFiveCatchIntervalMinutes,
  calculateSeasonFiveInventoryCapacity,
  calculateSeasonFiveRhythm,
  calculateSeasonFiveTravelMinutes,
  createSeasonFiveCatch,
  createSeasonFiveCharacter,
  ensureSeasonFivePreviewCycle,
  getDegradedSeasonFiveHomeState,
  getSeasonFiveBuildEffects,
  getSeasonFiveProgressionAfterExperience,
  normalizeSeasonFiveClass,
  purchaseSeasonFiveSkill,
  SEASON_FIVE_DURATION_HOURS,
  SEASON_FIVE_MAX_SKILL_POINTS,
  SEASON_FIVE_SKILL_TREES,
} from "./season-five";
import {
  createSeasonFiveCatch as createSeasonFiveCatchFromBalance,
  SEASON_FIVE_BALANCE,
  SEASON_FIVE_FISH_SPECIES_BY_PROFILE,
} from "./season-five-balance";

function createSeasonFiveMapTileRecords() {
  return createSeasonFiveMapTiles().map((tile) => ({
    id: `tile-${tile.key}`,
    ...tile,
  }));
}

function createSeasonFiveFishingWaterBodyDelegate({
  upserts = [],
}: {
  upserts?: unknown[];
} = {}) {
  const bodies = new Map<string, Record<string, unknown>>();

  return {
    findMany: async () => Array.from(bodies.values()),
    upsert: async (args: {
      where: { cycleId_key: { key: string } };
      create: Record<string, unknown> & { key: string };
      update: Record<string, unknown>;
    }) => {
      upserts.push(args);
      const key = args.where.cycleId_key.key;
      const existing = bodies.get(key);
      const next = existing
        ? {
            ...existing,
            ...args.update,
          }
        : {
            id: `water-body-${bodies.size + 1}`,
            ...args.create,
          };

      bodies.set(key, next);
      return next;
    },
  };
}

test("Season 5 class selection accepts persisted enum values", () => {
  assert.equal(
    normalizeSeasonFiveClass("DRUNKEN_MONK"),
    SeasonFiveCharacterClass.DRUNKEN_MONK
  );
  assert.throws(() => normalizeSeasonFiveClass("fisher king"), /valid/);
});

function createCharacterCreationDb() {
  const cycle = {
    id: "s5-cycle",
    ruleset: CycleRuleset.SEASON_5,
    resolvedAt: null,
  };
  const home = { id: "home-location" };
  const createdCharacters: unknown[] = [];
  const mapTiles = createSeasonFiveMapTileRecords();

  return {
    createdCharacters,
    db: {
      cycle: {
        findFirst: async () => cycle,
        create: async () => {
          throw new Error("cycle create should not be called");
        },
      },
      seasonFiveMapTile: {
        upsert: async (args: unknown) => args,
        findMany: async () => mapTiles,
      },
      seasonFiveFishingLocation: {
        upsert: async (args: unknown) => args,
        findUniqueOrThrow: async () => home,
      },
      seasonFiveFishingWaterBody: createSeasonFiveFishingWaterBodyDelegate(),
      seasonFiveCharacter: {
        findUnique: async () => null,
        create: async (args: unknown) => {
          createdCharacters.push(args);
          return args;
        },
      },
    },
  };
}

test("Season 5 character creation uses submitted character name", async () => {
  const setup = createCharacterCreationDb();

  await createSeasonFiveCharacter({
    userId: "user",
    characterClass: SeasonFiveCharacterClass.DRUNKEN_MONK,
    characterName: "  Mai the Fisher  ",
    db: setup.db as never,
  });

  assert.equal(
    (
      setup.createdCharacters[0] as {
        data: { name: string; currentLocationId: string };
      }
    ).data.name,
    "Mai the Fisher"
  );
});

test("Season 5 character creation rejects missing or long names", async () => {
  await assert.rejects(
    createSeasonFiveCharacter({
      userId: "user",
      characterClass: SeasonFiveCharacterClass.DRUNKEN_MONK,
      characterName: " ",
      db: createCharacterCreationDb().db as never,
    }),
    /Name your/
  );
  await assert.rejects(
    createSeasonFiveCharacter({
      userId: "user",
      characterClass: SeasonFiveCharacterClass.DRUNKEN_MONK,
      characterName: "x".repeat(41),
      db: createCharacterCreationDb().db as never,
    }),
    /40 characters/
  );
});

test("Season 5 class skill trees expose three valid passive paths", () => {
  for (const [characterClass, tree] of Object.entries(
    SEASON_FIVE_SKILL_TREES
  )) {
    const pathKeys = new Set(tree.map((skill) => skill.pathKey));
    assert.equal(tree.length, 12, `${characterClass} should have 12 nodes`);
    assert.equal(pathKeys.size, 3, `${characterClass} should have 3 paths`);

    for (const pathKey of pathKeys) {
      const path = tree.filter((skill) => skill.pathKey === pathKey);
      assert.deepEqual(
        path.map((skill) => skill.tier),
        [1, 2, 3, 4]
      );
      assert.equal(path[0]?.requires, undefined);
      assert.deepEqual(path[1]?.requires, [path[0]?.key]);
      assert.deepEqual(path[2]?.requires, [path[1]?.key]);
      assert.deepEqual(path[3]?.requires, [path[2]?.key]);
      assert.equal(path[3]?.cost, 2);
      assert.equal(
        path.reduce((sum, skill) => sum + skill.cost, 0),
        5,
        `${characterClass} ${pathKey} should cost 5 points`
      );
    }
  }
});

function skillKeysForPath(
  characterClass: SeasonFiveCharacterClass,
  pathKey: string
) {
  return SEASON_FIVE_SKILL_TREES[characterClass]
    .filter((skill) => skill.pathKey === pathKey)
    .map((skill) => skill.key);
}

test("Season 5 build effects combine class, gear, and passive skills", () => {
  const effects = getSeasonFiveBuildEffects({
    characterClass: SeasonFiveCharacterClass.BURNT_OUT_ROGUE,
    gear: [
      {
        slot: SeasonFiveGearSlot.BAIT,
        power: 2,
        equipped: true,
      },
      {
        slot: SeasonFiveGearSlot.PACK,
        power: 1,
        equipped: true,
      },
      {
        slot: SeasonFiveGearSlot.ROD,
        power: 9,
        equipped: false,
      },
    ],
    purchasedNodeKeys: [
      "rogue_stolen_lure",
      "rogue_backwater_gossip",
      "rogue_false_bottom",
    ],
  });

  assert.deepEqual(effects.stats, {
    stronk: 6,
    luk: 10,
    smell: 9,
    magik: 4,
    quietness: 9,
  });
  assert.equal(effects.catchBonus, 3);
  assert.equal(effects.inventoryBonus, 4);
  assert.equal(effects.rarityBonus, 19);
  assert.equal(effects.travelPercent, -20);
});

test("Season 5 Drunken Monk passives unlock rhythm bonuses", () => {
  const monk = getSeasonFiveBuildEffects({
    characterClass: SeasonFiveCharacterClass.DRUNKEN_MONK,
    purchasedNodeKeys: [
      "monk_wobble_cast",
      "monk_river_breath",
      "monk_dock_nap",
      "monk_empty_cup",
    ],
  });
  const warrior = getSeasonFiveBuildEffects({
    characterClass: SeasonFiveCharacterClass.RETIRED_WARRIOR,
    purchasedNodeKeys: ["warrior_campaign_grip", "warrior_trophy_drag"],
  });

  assert.equal(monk.rhythmCatchBonus, 2);
  assert.equal(monk.rhythmPressureReduction, 3);
  assert.equal(warrior.rhythmCatchBonus, 0);
  assert.equal(warrior.rhythmPressureReduction, 0);
});

test("Season 5 Drunken Monk rhythm applies only while fishing", () => {
  const startedAt = new Date("2026-06-05T12:00:00.000Z");
  const now = new Date("2026-06-05T13:31:00.000Z");
  const fishingRhythm = calculateSeasonFiveRhythm({
    actionKind: SeasonFiveActionKind.FISHING,
    actionStartedAt: startedAt,
    now,
    rhythmCatchBonus: 2,
    rhythmPressureReduction: 1,
  });
  const travellingRhythm = calculateSeasonFiveRhythm({
    actionKind: SeasonFiveActionKind.TRAVELING,
    actionStartedAt: startedAt,
    now,
    rhythmCatchBonus: 2,
    rhythmPressureReduction: 1,
  });
  const homeRhythm = calculateSeasonFiveRhythm({
    actionKind: SeasonFiveActionKind.AT_HOME,
    actionStartedAt: null,
    now,
    rhythmCatchBonus: 2,
    rhythmPressureReduction: 1,
  });

  assert.deepEqual(fishingRhythm, {
    stage: 3,
    catchBonus: 6,
    inventoryPressureReduction: 3,
  });
  assert.deepEqual(travellingRhythm, {
    stage: 0,
    catchBonus: 0,
    inventoryPressureReduction: 0,
  });
  assert.deepEqual(homeRhythm, {
    stage: 0,
    catchBonus: 0,
    inventoryPressureReduction: 0,
  });
});

test("Season 5 Drunken Monk rhythm improves catch interval", () => {
  const effects = getSeasonFiveBuildEffects({
    characterClass: SeasonFiveCharacterClass.DRUNKEN_MONK,
    purchasedNodeKeys: ["monk_wobble_cast", "monk_river_breath"],
  });
  const rhythm = calculateSeasonFiveRhythm({
    actionKind: SeasonFiveActionKind.FISHING,
    actionStartedAt: new Date("2026-06-05T12:00:00.000Z"),
    now: new Date("2026-06-05T13:00:00.000Z"),
    rhythmCatchBonus: effects.rhythmCatchBonus,
    rhythmPressureReduction: effects.rhythmPressureReduction,
  });
  const baselineInterval = calculateSeasonFiveCatchIntervalMinutes({
    catchDifficulty: 3,
    catchBonus: effects.catchBonus,
  });
  const rhythmInterval = calculateSeasonFiveCatchIntervalMinutes({
    catchDifficulty: 3,
    catchBonus: effects.catchBonus + rhythm.catchBonus,
  });

  assert.equal(rhythm.stage, 2);
  assert.ok(rhythmInterval < baselineInterval);
});

test("Season 5 Drunken Monk wins long-session tempo", () => {
  const monk = getSeasonFiveBuildEffects({
    characterClass: SeasonFiveCharacterClass.DRUNKEN_MONK,
    purchasedNodeKeys: [
      ...skillKeysForPath(SeasonFiveCharacterClass.DRUNKEN_MONK, "monk_flow"),
      ...skillKeysForPath(
        SeasonFiveCharacterClass.DRUNKEN_MONK,
        "monk_stillness"
      ),
    ],
  });
  const rhythm = calculateSeasonFiveRhythm({
    actionKind: SeasonFiveActionKind.FISHING,
    actionStartedAt: new Date("2026-06-05T12:00:00.000Z"),
    now: new Date("2026-06-05T13:31:00.000Z"),
    rhythmCatchBonus: monk.rhythmCatchBonus,
    rhythmPressureReduction: monk.rhythmPressureReduction,
  });
  const rivalCatchBonuses = [
    getSeasonFiveBuildEffects({
      characterClass: SeasonFiveCharacterClass.RETIRED_WARRIOR,
      purchasedNodeKeys: skillKeysForPath(
        SeasonFiveCharacterClass.RETIRED_WARRIOR,
        "warrior_siege_patience"
      ),
    }).catchBonus,
    getSeasonFiveBuildEffects({
      characterClass: SeasonFiveCharacterClass.DEMENTED_WIZARD,
      purchasedNodeKeys: skillKeysForPath(
        SeasonFiveCharacterClass.DEMENTED_WIZARD,
        "wizard_deep_muttering"
      ),
    }).catchBonus,
    getSeasonFiveBuildEffects({
      characterClass: SeasonFiveCharacterClass.BURNT_OUT_ROGUE,
      purchasedNodeKeys: skillKeysForPath(
        SeasonFiveCharacterClass.BURNT_OUT_ROGUE,
        "rogue_dirty_luck"
      ),
    }).catchBonus,
  ];

  assert.equal(monk.rhythmCatchBonus, 5);
  assert.equal(monk.rhythmPressureReduction, 5);
  assert.equal(rhythm.stage, 3);
  assert.ok(
    monk.catchBonus + rhythm.catchBonus > Math.max(...rivalCatchBonuses)
  );
});

test("Season 5 Retired Warrior wins trophy weight and raw pack capacity", () => {
  const trophyWarrior = getSeasonFiveBuildEffects({
    characterClass: SeasonFiveCharacterClass.RETIRED_WARRIOR,
    purchasedNodeKeys: skillKeysForPath(
      SeasonFiveCharacterClass.RETIRED_WARRIOR,
      "warrior_trophy_hunter"
    ),
  });
  const packWarrior = getSeasonFiveBuildEffects({
    characterClass: SeasonFiveCharacterClass.RETIRED_WARRIOR,
    purchasedNodeKeys: skillKeysForPath(
      SeasonFiveCharacterClass.RETIRED_WARRIOR,
      "warrior_campaign_pack"
    ),
  });
  const wizardDeep = getSeasonFiveBuildEffects({
    characterClass: SeasonFiveCharacterClass.DEMENTED_WIZARD,
    purchasedNodeKeys: skillKeysForPath(
      SeasonFiveCharacterClass.DEMENTED_WIZARD,
      "wizard_deep_muttering"
    ),
  });
  const roguePack = getSeasonFiveBuildEffects({
    characterClass: SeasonFiveCharacterClass.BURNT_OUT_ROGUE,
    purchasedNodeKeys: skillKeysForPath(
      SeasonFiveCharacterClass.BURNT_OUT_ROGUE,
      "rogue_false_bottoms"
    ),
  });

  assert.ok(trophyWarrior.sizeBonusPercent > wizardDeep.sizeBonusPercent);
  assert.ok(trophyWarrior.sizeBonusPercent > roguePack.sizeBonusPercent);
  assert.ok(packWarrior.inventoryBonus > roguePack.inventoryBonus);
});

test("Season 5 Demented Wizard wins rarity", () => {
  const wizard = getSeasonFiveBuildEffects({
    characterClass: SeasonFiveCharacterClass.DEMENTED_WIZARD,
    purchasedNodeKeys: skillKeysForPath(
      SeasonFiveCharacterClass.DEMENTED_WIZARD,
      "wizard_moon_logic"
    ),
  });
  const rogue = getSeasonFiveBuildEffects({
    characterClass: SeasonFiveCharacterClass.BURNT_OUT_ROGUE,
    purchasedNodeKeys: skillKeysForPath(
      SeasonFiveCharacterClass.BURNT_OUT_ROGUE,
      "rogue_dirty_luck"
    ),
  });
  const monk = getSeasonFiveBuildEffects({
    characterClass: SeasonFiveCharacterClass.DRUNKEN_MONK,
    purchasedNodeKeys: skillKeysForPath(
      SeasonFiveCharacterClass.DRUNKEN_MONK,
      "monk_lucky_mess"
    ),
  });
  const warrior = getSeasonFiveBuildEffects({
    characterClass: SeasonFiveCharacterClass.RETIRED_WARRIOR,
    purchasedNodeKeys: skillKeysForPath(
      SeasonFiveCharacterClass.RETIRED_WARRIOR,
      "warrior_trophy_hunter"
    ),
  });

  assert.ok(wizard.rarityBonus > rogue.rarityBonus);
  assert.ok(wizard.rarityBonus > monk.rarityBonus);
  assert.ok(wizard.rarityBonus > warrior.rarityBonus);
});

test("Season 5 Burnt-Out Rogue wins travel speed and flat pack pressure", () => {
  const rogueSpeed = getSeasonFiveBuildEffects({
    characterClass: SeasonFiveCharacterClass.BURNT_OUT_ROGUE,
    purchasedNodeKeys: skillKeysForPath(
      SeasonFiveCharacterClass.BURNT_OUT_ROGUE,
      "rogue_soft_steps"
    ),
  });
  const roguePack = getSeasonFiveBuildEffects({
    characterClass: SeasonFiveCharacterClass.BURNT_OUT_ROGUE,
    purchasedNodeKeys: skillKeysForPath(
      SeasonFiveCharacterClass.BURNT_OUT_ROGUE,
      "rogue_false_bottoms"
    ),
  });
  const monkStillness = getSeasonFiveBuildEffects({
    characterClass: SeasonFiveCharacterClass.DRUNKEN_MONK,
    purchasedNodeKeys: skillKeysForPath(
      SeasonFiveCharacterClass.DRUNKEN_MONK,
      "monk_stillness"
    ),
  });
  const wizardDistance = getSeasonFiveBuildEffects({
    characterClass: SeasonFiveCharacterClass.DEMENTED_WIZARD,
    purchasedNodeKeys: skillKeysForPath(
      SeasonFiveCharacterClass.DEMENTED_WIZARD,
      "wizard_bent_distance"
    ),
  });
  const warriorPack = getSeasonFiveBuildEffects({
    characterClass: SeasonFiveCharacterClass.RETIRED_WARRIOR,
    purchasedNodeKeys: skillKeysForPath(
      SeasonFiveCharacterClass.RETIRED_WARRIOR,
      "warrior_campaign_pack"
    ),
  });

  assert.ok(rogueSpeed.travelPercent < monkStillness.travelPercent);
  assert.ok(rogueSpeed.travelPercent < wizardDistance.travelPercent);
  assert.ok(
    roguePack.inventoryPressureReduction >
      warriorPack.inventoryPressureReduction
  );
  assert.ok(
    roguePack.inventoryPressureReduction >
      monkStillness.inventoryPressureReduction
  );
});

test("Season 5 build archetypes keep speed and trophy paths viable", () => {
  const fastRareBuild = getSeasonFiveBuildEffects({
    characterClass: SeasonFiveCharacterClass.BURNT_OUT_ROGUE,
    gear: [
      {
        slot: SeasonFiveGearSlot.BAIT,
        power: 2,
        equipped: true,
      },
    ],
    purchasedNodeKeys: [
      "rogue_soft_boots",
      "rogue_stolen_lure",
      "rogue_backwater_gossip",
    ],
  });
  const trophyBuild = getSeasonFiveBuildEffects({
    characterClass: SeasonFiveCharacterClass.RETIRED_WARRIOR,
    gear: [
      {
        slot: SeasonFiveGearSlot.ROD,
        power: 2,
        equipped: true,
      },
      {
        slot: SeasonFiveGearSlot.PACK,
        power: 2,
        equipped: true,
      },
      {
        slot: SeasonFiveGearSlot.TRINKET,
        power: 2,
        equipped: true,
      },
    ],
    purchasedNodeKeys: ["warrior_trophy_drag", "warrior_final_campaign"],
  });

  assert.ok(fastRareBuild.catchBonus > trophyBuild.catchBonus);
  assert.ok(fastRareBuild.rarityBonus > trophyBuild.rarityBonus);
  assert.ok(trophyBuild.sizeBonusPercent > fastRareBuild.sizeBonusPercent);
  assert.ok(trophyBuild.inventoryBonus > fastRareBuild.inventoryBonus);
  assert.ok(fastRareBuild.travelPercent < trophyBuild.travelPercent);
});

test("Season 5 experience levels grant capped skill points", () => {
  const oneLevel = getSeasonFiveProgressionAfterExperience({
    level: 1,
    skillPoints: 0,
    experience: 50,
  });
  const capped = getSeasonFiveProgressionAfterExperience({
    level: 10,
    skillPoints: 11,
    experience: 9999,
  });

  assert.deepEqual(oneLevel, {
    level: 2,
    skillPoints: 1,
    pointDelta: 1,
  });
  assert.equal(capped.level, 11);
  assert.equal(capped.skillPoints, SEASON_FIVE_MAX_SKILL_POINTS);
  assert.equal(capped.pointDelta, 1);
});

function createSkillPurchaseDb(character: {
  class: SeasonFiveCharacterClass;
  skillPoints: number;
  purchases?: string[];
}) {
  const cycle = {
    id: "s5-cycle",
    ruleset: CycleRuleset.SEASON_5,
    resolvedAt: null,
  };
  const mapTiles = createSeasonFiveMapTileRecords();
  const createdPurchases: string[] = [];
  const updates: unknown[] = [];
  const tx = {
    seasonFiveCharacter: {
      findUnique: async () => ({
        id: "character",
        class: character.class,
        skillPoints: character.skillPoints,
        skillPurchases: (character.purchases ?? []).map((nodeKey) => ({
          nodeKey,
        })),
      }),
      update: async (args: unknown) => {
        updates.push(args);
        return args;
      },
    },
    seasonFiveSkillPurchase: {
      create: async ({ data }: { data: { nodeKey: string } }) => {
        createdPurchases.push(data.nodeKey);
        return data;
      },
    },
  };

  return {
    createdPurchases,
    updates,
    db: {
      cycle: {
        findFirst: async () => cycle,
        create: async () => {
          throw new Error("cycle create should not be called");
        },
      },
      seasonFiveMapTile: {
        upsert: async (args: unknown) => args,
        findMany: async () => mapTiles,
      },
      seasonFiveFishingLocation: {
        upsert: async (args: unknown) => args,
      },
      seasonFiveFishingWaterBody: createSeasonFiveFishingWaterBodyDelegate(),
      $transaction: async (callback: (transaction: typeof tx) => unknown) =>
        callback(tx),
    },
  };
}

test("Season 5 skill purchases enforce class, requirements, duplicates, and points", async () => {
  await assert.rejects(
    purchaseSeasonFiveSkill({
      userId: "user",
      nodeKey: "monk_wobble_cast",
      db: createSkillPurchaseDb({
        class: SeasonFiveCharacterClass.RETIRED_WARRIOR,
        skillPoints: 2,
      }).db as never,
    }),
    /does not belong/
  );

  await assert.rejects(
    purchaseSeasonFiveSkill({
      userId: "user",
      nodeKey: "monk_river_breath",
      db: createSkillPurchaseDb({
        class: SeasonFiveCharacterClass.DRUNKEN_MONK,
        skillPoints: 2,
      }).db as never,
    }),
    /previous skill/
  );

  await assert.rejects(
    purchaseSeasonFiveSkill({
      userId: "user",
      nodeKey: "monk_wobble_cast",
      db: createSkillPurchaseDb({
        class: SeasonFiveCharacterClass.DRUNKEN_MONK,
        skillPoints: 2,
        purchases: ["monk_wobble_cast"],
      }).db as never,
    }),
    /already unlocked/
  );

  await assert.rejects(
    purchaseSeasonFiveSkill({
      userId: "user",
      nodeKey: "monk_wobble_cast",
      db: createSkillPurchaseDb({
        class: SeasonFiveCharacterClass.DRUNKEN_MONK,
        skillPoints: 0,
      }).db as never,
    }),
    /skill point/
  );

  const success = createSkillPurchaseDb({
    class: SeasonFiveCharacterClass.DRUNKEN_MONK,
    skillPoints: 2,
  });
  await purchaseSeasonFiveSkill({
    userId: "user",
    nodeKey: "monk_wobble_cast",
    db: success.db as never,
  });

  assert.deepEqual(success.createdPurchases, ["monk_wobble_cast"]);
  assert.equal(success.updates.length, 1);
});

test("Season 5 balance constants expose formula tuning knobs", () => {
  assert.equal(SEASON_FIVE_BALANCE.catchBaseIntervalMinutes, 5);
  assert.equal(SEASON_FIVE_BALANCE.smellPerCatchBonus, 2);
  assert.equal(SEASON_FIVE_BALANCE.inventorySlotsPerStronk, 2);
  assert.equal(SEASON_FIVE_BALANCE.rarityPerLuk, 3);
  assert.equal(SEASON_FIVE_BALANCE.sizePercentPerStronk, 5);
  assert.equal(SEASON_FIVE_BALANCE.travelPercentPerQuietness, -5);
  assert.equal(SEASON_FIVE_BALANCE.maxSizeMultiplier, 1.5);
});

test("Season 5 fish species pools keep fantasy rarity ladders", () => {
  const rarityLadder = [
    SeasonFiveFishRarity.COMMON,
    SeasonFiveFishRarity.COMMON,
    SeasonFiveFishRarity.UNCOMMON,
    SeasonFiveFishRarity.RARE,
    SeasonFiveFishRarity.LEGENDARY,
  ];

  for (const [profileKey, species] of Object.entries(
    SEASON_FIVE_FISH_SPECIES_BY_PROFILE
  )) {
    assert.equal(species.length, 5, profileKey);
    assert.deepEqual(
      species.map((fish) => fish.rarity),
      rarityLadder,
      profileKey
    );
    assert.equal(new Set(species.map((fish) => fish.key)).size, 5, profileKey);
    assert.ok(
      species.every((fish) => /^[a-z0-9-]+$/.test(fish.key)),
      profileKey
    );
  }

  assert.equal(
    SEASON_FIVE_FISH_SPECIES_BY_PROFILE.deep[4].name,
    "The Regrettable Mouth"
  );
  assert.equal(
    SEASON_FIVE_FISH_SPECIES_BY_PROFILE.lava_lake[1].name,
    "Cinder Snot Koi"
  );
  assert.equal(
    createSeasonFiveCatchFromBalance({
      seed: "profile-test",
      hash: 99,
      minWeightGrams: 5000,
      maxWeightGrams: 85000,
      difficulty: 5,
      sizeBonusPercent: 0,
      inventoryPressure: 3,
      profileKey: "lava_lake",
    }).speciesName,
    "Lord Scaldington"
  );
});

test("Season 5 travel, catch interval, and inventory calculations clamp safely", () => {
  assert.equal(
    calculateSeasonFiveTravelMinutes({ baseMinutes: 10, travelPercent: -15 }),
    9
  );
  assert.equal(
    calculateSeasonFiveTravelMinutes({ baseMinutes: 1, travelPercent: -99 }),
    1
  );
  assert.equal(
    calculateSeasonFiveCatchIntervalMinutes({
      catchDifficulty: 4,
      catchBonus: 99,
    }),
    1
  );
  assert.equal(
    calculateSeasonFiveInventoryCapacity({
      baseCapacity: 12,
      inventoryBonus: 8,
    }),
    20
  );
  assert.equal(
    calculateSeasonFiveInventoryCapacity({
      baseCapacity: -5,
      inventoryBonus: 0,
    }),
    1
  );
});

test("Season 5 catch generation is deterministic and bounded", () => {
  const first = createSeasonFiveCatch({
    seed: "character:moon-depths:2026-06-05T12:00:00.000Z",
    minWeightGrams: 5000,
    maxWeightGrams: 32000,
    difficulty: 4,
    sizeBonusPercent: 25,
    inventoryPressure: 2,
  });
  const second = createSeasonFiveCatch({
    seed: "character:moon-depths:2026-06-05T12:00:00.000Z",
    minWeightGrams: 5000,
    maxWeightGrams: 32000,
    difficulty: 4,
    sizeBonusPercent: 25,
    inventoryPressure: 2,
  });

  assert.deepEqual(first, second);
  assert.ok(first.weightGrams >= 5000);
  assert.ok(first.weightGrams <= 48000);
  assert.ok(first.inventorySlots >= 2);
});

test("Season 5 fish weight formatter displays kilograms", () => {
  assert.equal(formatSeasonFiveFishWeight(0), "0 kg");
  assert.equal(formatSeasonFiveFishWeight(1200), "1.2 kg");
  assert.equal(formatSeasonFiveFishWeight(19500), "19.5 kg");
  assert.equal(formatSeasonFiveFishWeight(55100), "55 kg");
});

test("Season 5 action helpers build deterministic travel state", () => {
  const now = new Date("2026-06-05T12:00:00.000Z");
  const destination = {
    id: "lake-1",
    key: "mist-lake",
    name: "Mist Lake",
    kind: SeasonFiveLocationKind.LAKE,
    travelMinutes: 12,
  };
  const first = createSeasonFiveTravelState({
    destination,
    now,
    travelPercent: -25,
  });
  const replacement = createSeasonFiveTravelState({
    destination: {
      ...destination,
      id: "sea-1",
      key: "brine-sea",
      name: "Brine Sea",
      kind: SeasonFiveLocationKind.SEA,
      travelMinutes: 20,
    },
    now,
    travelPercent: -25,
  });

  assert.deepEqual(first, {
    actionKind: SeasonFiveActionKind.TRAVELING,
    destinationLocationId: "lake-1",
    actionStartedAt: now,
    actionCompletesAt: new Date("2026-06-05T12:09:00.000Z"),
    lastResolvedAt: now,
  });
  assert.equal(replacement.destinationLocationId, "sea-1");
  assert.equal(
    replacement.actionCompletesAt.getTime(),
    new Date("2026-06-05T12:15:00.000Z").getTime()
  );
});

test("Season 5 action helpers resolve travel completion and home return", () => {
  const resolvedAt = new Date("2026-06-05T12:15:00.000Z");
  const fishing = resolveSeasonFiveCompletedTravel({
    destination: {
      id: "sea-1",
      key: "brine-sea",
      name: "Brine Sea",
      kind: SeasonFiveLocationKind.SEA,
      travelMinutes: 20,
    },
    resolvedAt,
  });
  const home = resolveSeasonFiveCompletedTravel({
    destination: {
      id: "home",
      key: "home",
      name: "Home Base",
      kind: SeasonFiveLocationKind.HOME,
      travelMinutes: 0,
    },
    resolvedAt,
  });
  const manualHome = createSeasonFiveHomeState({
    homeId: "home",
    now: resolvedAt,
  });

  assert.deepEqual(fishing, {
    actionKind: SeasonFiveActionKind.FISHING,
    currentLocationId: "sea-1",
    destinationLocationId: null,
    actionStartedAt: resolvedAt,
    actionCompletesAt: null,
    lastResolvedAt: resolvedAt,
  });
  assert.deepEqual(home, {
    actionKind: SeasonFiveActionKind.AT_HOME,
    currentLocationId: "home",
    destinationLocationId: null,
    actionStartedAt: null,
    actionCompletesAt: null,
    lastResolvedAt: resolvedAt,
  });
  assert.deepEqual(manualHome, home);
});

test("Season 5 action summary exposes ETA and destination", () => {
  const now = new Date("2026-06-05T12:00:00.000Z");
  const etaAt = new Date("2026-06-05T12:07:30.000Z");
  const summary = getSeasonFiveActionSummary({
    actionKind: SeasonFiveActionKind.TRAVELING,
    currentLocation: {
      id: "home",
      key: "home",
      name: "Home Base",
      kind: SeasonFiveLocationKind.HOME,
      travelMinutes: 0,
    },
    destinationLocation: {
      id: "lake-1",
      key: "mist-lake",
      name: "Mist Lake",
      kind: SeasonFiveLocationKind.LAKE,
      travelMinutes: 12,
    },
    actionStartedAt: now,
    actionCompletesAt: etaAt,
    now,
  });

  assert.equal(summary.kind, SeasonFiveActionKind.TRAVELING);
  assert.equal(summary.destination?.key, "mist-lake");
  assert.equal(summary.etaAt, etaAt);
  assert.equal(summary.remainingSeconds, 450);
});

test("Season 5 map template creates stable tile roles for core locations", () => {
  const tiles = createSeasonFiveMapTiles();
  const tileByKey = new Map(tiles.map((tile) => [tile.key, tile]));

  assert.equal(tiles.length, SEASON_FIVE_MAP_COLUMNS * SEASON_FIVE_MAP_ROWS);
  assert.equal(
    tileByKey.get(getSeasonFiveLocationTileKey("home") ?? "")?.role,
    SeasonFiveMapRole.HOME
  );
  assert.equal(
    tileByKey.get(getSeasonFiveLocationTileKey("mossglass-lake") ?? "")?.role,
    SeasonFiveMapRole.FISHING_SPOT
  );
});

test("Season 5 water body planner turns water, coast, and named spots into fishing locations", () => {
  const tiles = createSeasonFiveMapTiles();
  const waterBodies = planSeasonFiveWaterBodies(tiles);
  const fishingLocations = planSeasonFiveFishingLocations({
    tiles,
    waterBodies,
  });
  const fishableTileKeys = tiles
    .filter(
      (tile) =>
        tile.terrain === SeasonFiveMapTerrain.WATER ||
        tile.terrain === SeasonFiveMapTerrain.COAST ||
        tile.role === SeasonFiveMapRole.FISHING_SPOT ||
        tile.role === SeasonFiveMapRole.SECRET_LAKE
    )
    .map((tile) => tile.key)
    .sort();
  const locationTileKeys = fishingLocations
    .map((location) => location.tileKey)
    .sort();
  const unnamedFishableTile = tiles.find(
    (tile) =>
      fishableTileKeys.includes(tile.key) &&
      tile.role === SeasonFiveMapRole.NONE
  );
  const moonDepthsTileKey = getSeasonFiveLocationTileKey("moon-depths");
  const moonDepthsBody = waterBodies.find((body) =>
    body.tileKeys.includes(moonDepthsTileKey ?? "")
  );

  assert.deepEqual(locationTileKeys, fishableTileKeys);
  assert.ok(
    fishingLocations.some((location) => location.key.startsWith("tile:"))
  );
  assert.ok(unnamedFishableTile);
  assert.equal(
    fishingLocations.find(
      (location) => location.tileKey === unnamedFishableTile.key
    )?.key,
    `tile:${unnamedFishableTile.key}`
  );
  assert.equal(
    fishingLocations.find((location) => location.key === "mossglass-lake")
      ?.tileKey,
    getSeasonFiveLocationTileKey("mossglass-lake")
  );
  assert.equal(moonDepthsBody?.profileKey, "deep");
  assert.ok(waterBodies.some((body) => body.profileKey === "coast"));
});

test("Season 5 degraded map state still exposes fishable water tiles", () => {
  const state = getDegradedSeasonFiveHomeState();
  const fishableWaterTile = state.map.tiles.find(
    (tile) =>
      tile.role === SeasonFiveMapRole.NONE &&
      (tile.terrain === SeasonFiveMapTerrain.WATER ||
        tile.terrain === SeasonFiveMapTerrain.COAST)
  );

  assert.ok(fishableWaterTile);
  assert.equal(
    state.locations.find((location) => location.tileKey === fishableWaterTile.key)
      ?.key,
    `tile:${fishableWaterTile.key}`
  );
});

test("Season 5 daily specials rotate deterministic shops, events, and secret lakes", () => {
  const tiles = createSeasonFiveMapTiles();
  const now = new Date("2026-06-05T12:00:00.000Z");
  const first = planSeasonFiveDailySpecialTiles({ tiles, now });
  const second = planSeasonFiveDailySpecialTiles({ tiles, now });

  assert.deepEqual(first, second);
  assert.deepEqual(
    first.map((special) => special.role),
    [
      SeasonFiveMapRole.SHOP,
      SeasonFiveMapRole.EVENT,
      SeasonFiveMapRole.SECRET_LAKE,
    ]
  );
  const secret = first.find(
    (special) => special.role === SeasonFiveMapRole.SECRET_LAKE
  );
  assert.equal(secret?.hidden, true);
  assert.equal(secret?.requiredKey, SEASON_FIVE_SECRET_LAKE_KEY);
});

test("Season 5 Luk can reveal hidden global special tiles", () => {
  const hiddenTiles = [{ key: "t-1-1" }, { key: "t-2-2" }];
  const noHiddenTiles = rollSeasonFiveGlobalDiscovery({
    seed: "lucky-seed",
    luk: 10,
    hiddenTiles: [],
  });
  const highLuk = Array.from({ length: 100 }, (_, index) =>
    rollSeasonFiveGlobalDiscovery({
      seed: `lucky-seed-${index}`,
      luk: 10,
      hiddenTiles,
    })
  ).find(Boolean);

  assert.equal(noHiddenTiles, null);
  assert.ok(highLuk === "t-1-1" || highLuk === "t-2-2");
});

test("Season 5 discoveries can temporarily reveal water-body pool details", () => {
  const hiddenWaterBodies = [
    { id: "body-deep", key: "water:deep:t-8-2" },
    { id: "body-lava", key: "water:lava_lake:t-4-4" },
  ];
  const noCandidates = rollSeasonFiveWaterBodyDiscovery({
    seed: "pool-seed",
    luk: 10,
    magik: 10,
    gearKeys: ["lucky-bottlecap"],
    purchasedNodeKeys: ["wizard_salt_runes"],
    hiddenWaterBodies: [],
  });
  const revealed = Array.from({ length: 100 }, (_, index) =>
    rollSeasonFiveWaterBodyDiscovery({
      seed: `pool-seed-${index}`,
      luk: 10,
      magik: 10,
      gearKeys: ["lucky-bottlecap"],
      purchasedNodeKeys: ["wizard_salt_runes"],
      hiddenWaterBodies,
    })
  ).find(Boolean);

  assert.equal(noCandidates, null);
  assert.ok(
    revealed?.id === "body-deep" || revealed?.id === "body-lava"
  );
});

test("Season 5 route preview adds tile distance and travel modifiers", () => {
  const preview = calculateSeasonFiveRoutePreview({
    from: { row: 5, col: 7 },
    to: { row: 8, col: 2 },
    baseMinutes: 10,
    travelPercent: -20,
  });

  assert.equal(preview.distance, 8);
  assert.equal(preview.travelMinutes, 14);
});

test("Season 5 map presence groups by destination and stays bounded", () => {
  const locations = [
    { id: "home", key: "home" },
    { id: "lake", key: "mossglass-lake" },
  ];
  const characters = Array.from(
    { length: SEASON_FIVE_MAP_MARKER_LIMIT + 3 },
    (_, index) => ({
      id: `character-${index}`,
      name: `Character ${index}`,
      class: SeasonFiveCharacterClass.BURNT_OUT_ROGUE,
      classLabel: "Burnt-Out Rogue",
      actionKind:
        index === 0
          ? SeasonFiveActionKind.TRAVELING
          : SeasonFiveActionKind.FISHING,
      currentLocationId: index === 0 ? "home" : "lake",
      destinationLocationId: index === 0 ? "lake" : null,
      inventoryUsed: index === 1 ? 12 : 0,
      inventoryCapacity: 12,
    })
  );
  const activity = buildSeasonFiveLocationActivity({
    locations,
    characters,
  });
  const lake = activity.find((entry) => entry.locationKey === "mossglass-lake");

  assert.equal(lake?.totalCount, SEASON_FIVE_MAP_MARKER_LIMIT + 3);
  assert.equal(lake?.characters.length, SEASON_FIVE_MAP_MARKER_LIMIT);
  assert.equal(lake?.overflowCount, 3);
  assert.equal(lake?.characters[0]?.actionKind, SeasonFiveActionKind.TRAVELING);
  assert.equal(lake?.characters[1]?.inventoryFull, true);
});

test("Season 5 passive fishing fills empty inventory deterministically", () => {
  const plan = planSeasonFivePassiveCatches({
    lastResolvedAt: new Date("2026-06-05T12:00:00.000Z"),
    resolvedAt: new Date("2026-06-05T12:05:00.000Z"),
    catchIntervalMinutes: 1,
    inventoryUsed: 0,
    inventoryCapacity: 3,
    createCatch: () => ({
      speciesKey: "puddle-gobbler",
      speciesName: "Puddle Gobbler",
      rarity: SeasonFiveFishRarity.COMMON,
      weightGrams: 1200,
      inventorySlots: 1,
    }),
  });

  assert.equal(plan.catches.length, 3);
  assert.equal(plan.inventoryUsed, 3);
  assert.equal(plan.inventoryFull, true);
  assert.equal(
    plan.nextResolvedAt.getTime(),
    new Date("2026-06-05T12:05:00.000Z").getTime()
  );
});

test("Season 5 passive fishing respects partial and full inventory", () => {
  const createCatch = () => ({
    speciesKey: "puddle-gobbler",
    speciesName: "Puddle Gobbler",
    rarity: SeasonFiveFishRarity.COMMON,
    weightGrams: 1200,
    inventorySlots: 1,
  });
  const partial = planSeasonFivePassiveCatches({
    lastResolvedAt: new Date("2026-06-05T12:00:00.000Z"),
    resolvedAt: new Date("2026-06-05T12:05:00.000Z"),
    catchIntervalMinutes: 1,
    inventoryUsed: 2,
    inventoryCapacity: 3,
    createCatch,
  });
  const full = planSeasonFivePassiveCatches({
    lastResolvedAt: new Date("2026-06-05T12:00:00.000Z"),
    resolvedAt: new Date("2026-06-05T12:05:00.000Z"),
    catchIntervalMinutes: 1,
    inventoryUsed: 3,
    inventoryCapacity: 3,
    createCatch,
  });

  assert.equal(partial.catches.length, 1);
  assert.equal(partial.inventoryUsed, 3);
  assert.equal(partial.inventoryFull, true);
  assert.equal(full.catches.length, 0);
  assert.equal(full.inventoryUsed, 3);
  assert.equal(full.inventoryFull, true);
});

test("Season 5 passive fishing stops when a water-body pool is depleted", () => {
  const plan = planSeasonFivePassiveCatches({
    lastResolvedAt: new Date("2026-06-05T12:00:00.000Z"),
    resolvedAt: new Date("2026-06-05T12:05:00.000Z"),
    catchIntervalMinutes: 1,
    inventoryUsed: 0,
    inventoryCapacity: 10,
    stockAvailable: 2,
    createCatch: () => ({
      speciesKey: "puddle-gobbler",
      speciesName: "Puddle Gobbler",
      rarity: SeasonFiveFishRarity.COMMON,
      weightGrams: 1200,
      inventorySlots: 1,
    }),
  });

  assert.equal(plan.catches.length, 2);
  assert.equal(plan.stockUsed, 2);
  assert.equal(plan.stockDepleted, true);
  assert.equal(plan.inventoryFull, false);
});

test("Season 5 water-body stock regenerates by elapsed whole catches", () => {
  const lastRegeneratedAt = new Date("2026-06-05T12:00:00.000Z");
  const now = new Date("2026-06-05T14:00:00.000Z");
  const partial = regenerateSeasonFiveWaterBodyStock({
    currentStock: 10,
    maxStock: 68,
    regenPerHour: 14,
    lastRegeneratedAt,
    now,
  });
  const full = regenerateSeasonFiveWaterBodyStock({
    currentStock: 68,
    maxStock: 68,
    regenPerHour: 14,
    lastRegeneratedAt,
    now,
  });

  assert.equal(partial.currentStock, 38);
  assert.equal(partial.regenerated, 28);
  assert.equal(partial.lastRegeneratedAt.getTime(), now.getTime());
  assert.equal(full.currentStock, 68);
  assert.equal(full.regenerated, 0);
  assert.equal(full.lastRegeneratedAt.getTime(), lastRegeneratedAt.getTime());
});

test("Season 5 passive fishing is idempotent for already resolved minutes", () => {
  const plan = planSeasonFivePassiveCatches({
    lastResolvedAt: new Date("2026-06-05T12:05:00.000Z"),
    resolvedAt: new Date("2026-06-05T12:05:00.000Z"),
    catchIntervalMinutes: 1,
    inventoryUsed: 0,
    inventoryCapacity: 3,
    createCatch: () => {
      throw new Error("already resolved minutes should not roll catches");
    },
  });

  assert.equal(plan.catches.length, 0);
  assert.equal(plan.inventoryUsed, 0);
  assert.equal(plan.inventoryFull, false);
});

test("Season 5 inventory pressure labels empty, close, and full packs", () => {
  assert.deepEqual(
    getSeasonFiveInventoryPressure({
      inventoryUsed: 0,
      inventoryCapacity: 12,
    }),
    {
      used: 0,
      capacity: 12,
      remaining: 12,
      percent: 0,
      full: false,
      closeToFull: false,
      label: "Empty",
    }
  );
  assert.deepEqual(
    getSeasonFiveInventoryPressure({
      inventoryUsed: 9,
      inventoryCapacity: 12,
    }),
    {
      used: 9,
      capacity: 12,
      remaining: 3,
      percent: 75,
      full: false,
      closeToFull: true,
      label: "Tight",
    }
  );
  assert.deepEqual(
    getSeasonFiveInventoryPressure({
      inventoryUsed: 12,
      inventoryCapacity: 12,
    }),
    {
      used: 12,
      capacity: 12,
      remaining: 0,
      percent: 100,
      full: true,
      closeToFull: false,
      label: "Full",
    }
  );
});

test("Season 5 Most Fish leaderboard uses stable tie ordering", () => {
  const ranked = rankSeasonFiveMostFish([
    {
      id: "slow-small",
      name: "Berta",
      class: SeasonFiveCharacterClass.RETIRED_WARRIOR,
      totalFishCaught: 8,
      biggestFishGrams: 8000,
      createdAt: new Date("2026-06-05T12:02:00.000Z"),
    },
    {
      id: "fast-big",
      name: "Aino",
      class: SeasonFiveCharacterClass.DRUNKEN_MONK,
      totalFishCaught: 8,
      biggestFishGrams: 12000,
      createdAt: new Date("2026-06-05T12:03:00.000Z"),
    },
    {
      id: "most",
      name: "Ciro",
      class: SeasonFiveCharacterClass.BURNT_OUT_ROGUE,
      totalFishCaught: 9,
      biggestFishGrams: 4000,
      createdAt: new Date("2026-06-05T12:04:00.000Z"),
    },
    {
      id: "earlier",
      name: "Dina",
      class: SeasonFiveCharacterClass.DEMENTED_WIZARD,
      totalFishCaught: 8,
      biggestFishGrams: 12000,
      createdAt: new Date("2026-06-05T12:01:00.000Z"),
    },
  ]);

  assert.deepEqual(
    ranked.map((row) => row.id),
    ["most", "earlier", "fast-big", "slow-small"]
  );
});

test("Season 5 Biggest Fish leaderboard derives exact catches and stable ties", () => {
  const character = {
    id: "wizard",
    name: "Wizard",
    class: SeasonFiveCharacterClass.DEMENTED_WIZARD,
    totalFishCaught: 4,
    biggestFishGrams: 18000,
    createdAt: new Date("2026-06-05T12:00:00.000Z"),
  };
  const ranked = rankSeasonFiveBiggestFish([
    {
      id: "later-equal",
      speciesName: "Abyssal Belch Eel",
      rarity: SeasonFiveFishRarity.RARE,
      weightGrams: 18000,
      caughtAt: new Date("2026-06-05T12:10:00.000Z"),
      character,
      location: { name: "Moon Depths" },
    },
    {
      id: "exact-winner",
      speciesName: "Wizard's Lost-Toe Trout",
      rarity: SeasonFiveFishRarity.RARE,
      weightGrams: 18000,
      caughtAt: new Date("2026-06-05T12:05:00.000Z"),
      character,
      location: { name: "Moon Depths" },
    },
    {
      id: "runner",
      speciesName: "Puddle Gobbler",
      rarity: SeasonFiveFishRarity.COMMON,
      weightGrams: 15000,
      caughtAt: new Date("2026-06-05T12:04:00.000Z"),
      character: {
        id: "monk",
        name: "Monk",
        class: SeasonFiveCharacterClass.DRUNKEN_MONK,
        totalFishCaught: 10,
        biggestFishGrams: 15000,
        createdAt: new Date("2026-06-05T12:00:00.000Z"),
      },
      location: { name: "Mossglass Lake" },
    },
  ]);

  assert.deepEqual(
    ranked.map((row) => row.id),
    ["wizard", "monk"]
  );
  assert.equal(ranked[0].catchId, "exact-winner");
  assert.equal(ranked[0].speciesName, "Wizard's Lost-Toe Trout");
  assert.equal(ranked[0].biggestFishGrams, 18000);
  assert.equal(ranked[0].locationName, "Moon Depths");
});

test("Season 5 preview cycle seed creates active cycle and baseline locations", async () => {
  const now = new Date("2026-06-05T12:00:00.000Z");
  const upserts: unknown[] = [];
  const waterBodyUpserts: unknown[] = [];
  const mapUpserts: unknown[] = [];
  let createdCycleData: Record<string, unknown> | null = null;
  const mapTiles = createSeasonFiveMapTileRecords();
  const waterBodies = planSeasonFiveWaterBodies(mapTiles);
  const generatedLocations = planSeasonFiveFishingLocations({
    tiles: mapTiles,
    waterBodies,
  });
  const expectedLocationKeys = [
    "home",
    ...generatedLocations.map((location) => location.key),
  ].sort();
  const db = {
    cycle: {
      findFirst: async () => null,
      create: async ({ data }: { data: Record<string, unknown> }) => {
        createdCycleData = data;
        return {
          id: "s5-cycle",
          ...data,
        };
      },
    },
    seasonFiveMapTile: {
      upsert: async (args: unknown) => {
        mapUpserts.push(args);
        return args;
      },
      findMany: async () => mapTiles,
    },
    seasonFiveFishingWaterBody: createSeasonFiveFishingWaterBodyDelegate({
      upserts: waterBodyUpserts,
    }),
    seasonFiveFishingLocation: {
      upsert: async (args: unknown) => {
        upserts.push(args);
        return args;
      },
    },
  };

  const cycle = await ensureSeasonFivePreviewCycle({
    now,
    db: db as never,
  });

  assert.equal(cycle.id, "s5-cycle");
  assert.equal(createdCycleData?.status, CycleStatus.ACTIVE);
  assert.equal(createdCycleData?.ruleset, CycleRuleset.SEASON_5);
  assert.equal(createdCycleData?.activeStartedAt, now);
  assert.equal(
    (createdCycleData?.activeEndsAt as Date).getTime(),
    now.getTime() + SEASON_FIVE_DURATION_HOURS * 60 * 60 * 1000
  );
  assert.equal(
    mapUpserts.length,
    SEASON_FIVE_MAP_COLUMNS * SEASON_FIVE_MAP_ROWS
  );
  assert.equal(waterBodyUpserts.length, waterBodies.length);
  assert.equal(upserts.length, expectedLocationKeys.length);
  assert.deepEqual(
    upserts
      .map((entry) => (entry as { create: { key: string } }).create.key)
      .sort(),
    expectedLocationKeys
  );
  assert.ok(
    upserts.every((entry) => {
      const create = (entry as { create: { tileId: string | null } }).create;
      return typeof create.tileId === "string";
    })
  );
});

test("Season 5 preview cycle seed reuses existing cycle and upserts locations", async () => {
  const existingCycle = {
    id: "existing-s5-cycle",
    status: CycleStatus.ACTIVE,
    ruleset: CycleRuleset.SEASON_5,
    resolvedAt: null,
  };
  const upserts: Array<{
    where: { cycleId_key: { cycleId: string; key: string } };
    create: { cycleId: string; key: string; tileId: string | null };
    update: { name: string; tileId: string | null };
  }> = [];
  const waterBodyUpserts: unknown[] = [];
  const mapUpserts: unknown[] = [];
  const mapTiles = createSeasonFiveMapTileRecords();
  const waterBodies = planSeasonFiveWaterBodies(mapTiles);
  const generatedLocations = planSeasonFiveFishingLocations({
    tiles: mapTiles,
    waterBodies,
  });
  const db = {
    cycle: {
      findFirst: async () => existingCycle,
      create: async () => {
        throw new Error("create should not be called for existing S5 cycle");
      },
    },
    seasonFiveMapTile: {
      upsert: async (args: unknown) => {
        mapUpserts.push(args);
        return args;
      },
      findMany: async () => mapTiles,
    },
    seasonFiveFishingWaterBody: createSeasonFiveFishingWaterBodyDelegate({
      upserts: waterBodyUpserts,
    }),
    seasonFiveFishingLocation: {
      upsert: async (args: (typeof upserts)[number]) => {
        upserts.push(args);
        return args;
      },
    },
  };

  const cycle = await ensureSeasonFivePreviewCycle({
    db: db as never,
  });

  assert.equal(cycle, existingCycle);
  assert.equal(
    mapUpserts.length,
    SEASON_FIVE_MAP_COLUMNS * SEASON_FIVE_MAP_ROWS
  );
  assert.equal(waterBodyUpserts.length, waterBodies.length);
  assert.equal(upserts.length, generatedLocations.length + 1);
  assert.ok(
    upserts.every(
      (entry) =>
        entry.where.cycleId_key.cycleId === existingCycle.id &&
        entry.create.cycleId === existingCycle.id &&
        typeof entry.create.tileId === "string" &&
        typeof entry.update.tileId === "string" &&
        entry.update.name.length > 0
    )
  );
});
