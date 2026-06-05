import assert from "node:assert/strict";
import test from "node:test";
import {
  CycleRuleset,
  CycleStatus,
  SeasonFiveActionKind,
  SeasonFiveCharacterClass,
  SeasonFiveGearSlot,
  SeasonFiveLocationKind,
} from "@/lib/prisma-client";
import {
  createSeasonFiveHomeState,
  createSeasonFiveTravelState,
  getSeasonFiveActionSummary,
  resolveSeasonFiveCompletedTravel,
} from "./season-five-actions";
import {
  calculateSeasonFiveCatchIntervalMinutes,
  calculateSeasonFiveInventoryCapacity,
  calculateSeasonFiveTravelMinutes,
  createSeasonFiveCatch,
  ensureSeasonFivePreviewCycle,
  getSeasonFiveBuildEffects,
  normalizeSeasonFiveClass,
  SEASON_FIVE_DURATION_HOURS,
  SEASON_FIVE_LOCATIONS,
} from "./season-five";

test("Season 5 class selection accepts persisted enum values", () => {
  assert.equal(
    normalizeSeasonFiveClass("DRUNKEN_MONK"),
    SeasonFiveCharacterClass.DRUNKEN_MONK
  );
  assert.throws(() => normalizeSeasonFiveClass("fisher king"), /valid/);
});

test("Season 5 build effects combine class, gear, and skill stats", () => {
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
    purchasedNodeKeys: ["steady_hands", "deep_pockets", "muddy_shortcuts"],
  });

  assert.deepEqual(effects.stats, {
    stronk: 7,
    luk: 10,
    smell: 10,
    magik: 4,
    quietness: 10,
  });
  assert.equal(effects.catchBonus, 2);
  assert.equal(effects.inventoryBonus, 4);
  assert.equal(effects.travelPercent, -25);
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

test("Season 5 preview cycle seed creates active cycle and baseline locations", async () => {
  const now = new Date("2026-06-05T12:00:00.000Z");
  const upserts: unknown[] = [];
  let createdCycleData: Record<string, unknown> | null = null;
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
  assert.equal(upserts.length, SEASON_FIVE_LOCATIONS.length);
  assert.deepEqual(
    upserts
      .map((entry) => (entry as { create: { key: string } }).create.key)
      .sort(),
    SEASON_FIVE_LOCATIONS.map((location) => location.key).sort()
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
    create: { cycleId: string; key: string };
    update: { name: string };
  }> = [];
  const db = {
    cycle: {
      findFirst: async () => existingCycle,
      create: async () => {
        throw new Error("create should not be called for existing S5 cycle");
      },
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
  assert.equal(upserts.length, SEASON_FIVE_LOCATIONS.length);
  assert.ok(
    upserts.every(
      (entry) =>
        entry.where.cycleId_key.cycleId === existingCycle.id &&
        entry.create.cycleId === existingCycle.id &&
        entry.update.name.length > 0
    )
  );
});
