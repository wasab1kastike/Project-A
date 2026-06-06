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
} from "@/lib/prisma-client";
import {
  createSeasonFiveHomeState,
  createSeasonFiveTravelState,
  getSeasonFiveActionSummary,
  resolveSeasonFiveCompletedTravel,
} from "./season-five-actions";
import {
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
  rollSeasonFiveGlobalDiscovery,
  SEASON_FIVE_MAP_COLUMNS,
  SEASON_FIVE_MAP_ROWS,
  SEASON_FIVE_SECRET_LAKE_KEY,
} from "./season-five-map";
import {
  calculateSeasonFiveCatchIntervalMinutes,
  calculateSeasonFiveInventoryCapacity,
  calculateSeasonFiveTravelMinutes,
  createSeasonFiveCatch,
  ensureSeasonFivePreviewCycle,
  getSeasonFiveBuildEffects,
  getSeasonFiveProgressionAfterExperience,
  normalizeSeasonFiveClass,
  purchaseSeasonFiveSkill,
  SEASON_FIVE_DURATION_HOURS,
  SEASON_FIVE_LOCATIONS,
  SEASON_FIVE_MAX_SKILL_POINTS,
  SEASON_FIVE_SKILL_TREES,
} from "./season-five";
import { SEASON_FIVE_BALANCE } from "./season-five-balance";

test("Season 5 class selection accepts persisted enum values", () => {
  assert.equal(
    normalizeSeasonFiveClass("DRUNKEN_MONK"),
    SeasonFiveCharacterClass.DRUNKEN_MONK
  );
  assert.throws(() => normalizeSeasonFiveClass("fisher king"), /valid/);
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
    }
  }
});

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
  assert.equal(effects.rarityBonus, 20);
  assert.equal(effects.travelPercent, -20);
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
  const mapTiles = createSeasonFiveMapTiles().map((tile) => ({
    id: `tile-${tile.key}`,
    ...tile,
  }));
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
    minFishCm: 50,
    maxFishCm: 320,
    difficulty: 4,
    sizeBonusPercent: 25,
    inventoryPressure: 2,
  });
  const second = createSeasonFiveCatch({
    seed: "character:moon-depths:2026-06-05T12:00:00.000Z",
    minFishCm: 50,
    maxFishCm: 320,
    difficulty: 4,
    sizeBonusPercent: 25,
    inventoryPressure: 2,
  });

  assert.deepEqual(first, second);
  assert.ok(first.sizeCm >= 50);
  assert.ok(first.sizeCm <= 480);
  assert.ok(first.inventorySlots >= 2);
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
      speciesKey: "pond-minnow",
      speciesName: "Pond Minnow",
      rarity: SeasonFiveFishRarity.COMMON,
      sizeCm: 12,
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
    speciesKey: "pond-minnow",
    speciesName: "Pond Minnow",
    rarity: SeasonFiveFishRarity.COMMON,
    sizeCm: 12,
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
      biggestFishCm: 80,
      createdAt: new Date("2026-06-05T12:02:00.000Z"),
    },
    {
      id: "fast-big",
      name: "Aino",
      class: SeasonFiveCharacterClass.DRUNKEN_MONK,
      totalFishCaught: 8,
      biggestFishCm: 120,
      createdAt: new Date("2026-06-05T12:03:00.000Z"),
    },
    {
      id: "most",
      name: "Ciro",
      class: SeasonFiveCharacterClass.BURNT_OUT_ROGUE,
      totalFishCaught: 9,
      biggestFishCm: 40,
      createdAt: new Date("2026-06-05T12:04:00.000Z"),
    },
    {
      id: "earlier",
      name: "Dina",
      class: SeasonFiveCharacterClass.DEMENTED_WIZARD,
      totalFishCaught: 8,
      biggestFishCm: 120,
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
    biggestFishCm: 180,
    createdAt: new Date("2026-06-05T12:00:00.000Z"),
  };
  const ranked = rankSeasonFiveBiggestFish([
    {
      id: "later-equal",
      speciesName: "Moon Carp",
      rarity: SeasonFiveFishRarity.RARE,
      sizeCm: 180,
      caughtAt: new Date("2026-06-05T12:10:00.000Z"),
      character,
      location: { name: "Moon Depths" },
    },
    {
      id: "exact-winner",
      speciesName: "Lantern Eel",
      rarity: SeasonFiveFishRarity.RARE,
      sizeCm: 180,
      caughtAt: new Date("2026-06-05T12:05:00.000Z"),
      character,
      location: { name: "Moon Depths" },
    },
    {
      id: "runner",
      speciesName: "Mud Perch",
      rarity: SeasonFiveFishRarity.COMMON,
      sizeCm: 150,
      caughtAt: new Date("2026-06-05T12:04:00.000Z"),
      character: {
        id: "monk",
        name: "Monk",
        class: SeasonFiveCharacterClass.DRUNKEN_MONK,
        totalFishCaught: 10,
        biggestFishCm: 150,
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
  assert.equal(ranked[0].speciesName, "Lantern Eel");
  assert.equal(ranked[0].biggestFishCm, 180);
  assert.equal(ranked[0].locationName, "Moon Depths");
});

test("Season 5 preview cycle seed creates active cycle and baseline locations", async () => {
  const now = new Date("2026-06-05T12:00:00.000Z");
  const upserts: unknown[] = [];
  const mapUpserts: unknown[] = [];
  let createdCycleData: Record<string, unknown> | null = null;
  const mapTiles = createSeasonFiveMapTiles().map((tile) => ({
    id: `tile-${tile.key}`,
    ...tile,
  }));
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
  assert.equal(upserts.length, SEASON_FIVE_LOCATIONS.length);
  assert.deepEqual(
    upserts
      .map((entry) => (entry as { create: { key: string } }).create.key)
      .sort(),
    SEASON_FIVE_LOCATIONS.map((location) => location.key).sort()
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
  const mapUpserts: unknown[] = [];
  const mapTiles = createSeasonFiveMapTiles().map((tile) => ({
    id: `tile-${tile.key}`,
    ...tile,
  }));
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
  assert.equal(upserts.length, SEASON_FIVE_LOCATIONS.length);
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
