import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { after, before, beforeEach, test, type TestContext } from "node:test";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  ArcadeCosmeticSlot,
  ArcadeGameType,
  ArcadeLootBoxType,
  ChatMessageType,
  CommunityWishStatus,
  CycleStatus,
  FortressAction,
  FortressRace,
  PrismaClient,
  ScoreEventType,
  WinnerRequestStatus,
} from "@/lib/prisma-client";
import "./balance.test";
import "./battle-report.test";
import "./season-announcement.test";
import {
  forceEndCurrentCycle,
  runManualCatchUpTick,
  setRegistrationJoiningLock,
} from "./admin-operations";
import { seedProjectA } from "./bootstrap";
import { markChatRead, sendChatGifMessage, sendChatMessage } from "./chat";
import {
  COMMUNITY_WISH_MAX_LENGTH,
  adminResolveCommunityWishTie,
  getCommunityWishProposalEndsAt,
  getCommunityWishVoteBudget,
  getCommunityWishVoteWeight,
  resolveExpiredCommunityWishVotes,
  saveCommunityWishVotes,
  submitCommunityWishProposal,
  updateCommunityWishFulfillmentProgress,
} from "./community-wishes";
import { getBuildArcadeRewardVariant } from "./build-arcade";
import {
  equipCosmeticUnlock,
  getArcadeHubState,
  mintSeasonArcadeCoins,
  openArcadeLootBox,
  playArcadeGame,
  purchaseArcadeLootBox,
} from "./arcade";
import {
  ACTIVE_LOCATION_SHUFFLE_COST,
  ACTIVE_PLAYER_CAP,
  ARCADE_SEASON_BASE_COINS,
  ARCADE_SEASON_POINTS_BONUS_CAP,
  ARCADE_SEASON_POINTS_BONUS_DIVISOR,
  getArcadeSeasonRankBonus,
  CURRENT_MAP_LAYOUT_VERSION,
  MEGA_FORTRESS_DESTROY_BONUS,
  MEGA_FORTRESS_HEALTH,
  ARCADE_LOOT_BOX_SKINS,
  FORTRESS_LEVEL_UP_COSTS,
  MAX_FORTRESS_LEVEL,
  UNIT_SPRITE_VARIANTS,
} from "./constants";
import { getAttackArrivalAt, getAttackTravelMinutes } from "./attacks";
import { getAttackPresentation } from "./attack-presentation";
import { getNextHelsinkiNoonAfter, getRaceBuffTier } from "./race-buffs";
import {
  HEX_SPAWN_TILES,
  MAP_WORLD_HEIGHT,
  MAP_WORLD_WIDTH,
  isPointNearSpawnHex,
  snapMapPointToHex,
} from "./map-hex";
import {
  getFortressSpawnLayout,
  getRenderedMapPositionKey,
  getSpawnPointKey,
  takeOpenSpawnPoint,
  takeUniqueSpawnPoints,
  type SpawnPoint,
} from "./spawn-layout";
import { hasDuplicateFortressMapPositions } from "./mega-fortress";
import { getAdminDashboardState } from "./admin-dashboard";
import { getCycleHistoryPageState } from "./history";
import { getHomePageState } from "./read-model";
import {
  editRegistrationFortressName,
  joinRegistrationCycle,
  purchaseFortressUpgrade,
  registerCommanderName,
  renameActiveFortress,
  selectFortressRace,
  setFortressAction,
  updateWorkerAssignment,
  shuffleFortressLocation,
} from "./service";
import { TickRunnerError, classifyTickHealth, runGameTick } from "./tick";
import { addHours, addMinutes } from "./time";
import { formatTickRunnerError, formatTickSummary } from "./tick-cli";
import {
  classifyWinnerRequest,
  reviewWinnerRequest,
  submitWinnerRequest,
  updateWinnerRequestFulfillmentProgress,
} from "./winner-requests";

const __dirname = dirname(fileURLToPath(import.meta.url));
const workspaceRoot = resolve(__dirname, "../../..");
const defaultDatabaseUrl =
  process.env.TEST_DATABASE_URL ??
  process.env.DATABASE_URL ??
  "postgresql://postgres:postgres@localhost:5432/project_a?schema=public";
const ACTIVE_EDGE_PADDING = 15;

async function getFortressLocationShuffleCount(
  prisma: PrismaClient,
  fortressId: string
) {
  const rows = await prisma.$queryRaw<Array<{ locationShuffleCount: number }>>`
    SELECT "locationShuffleCount"
    FROM "Fortress"
    WHERE "id" = ${fortressId}
    LIMIT 1
  `;

  return rows[0]?.locationShuffleCount ?? 0;
}

function toPointKey(point: SpawnPoint) {
  return `${Math.round(point.x)}:${Math.round(point.y)}`;
}

function getEdgeDistance(point: SpawnPoint) {
  return Math.min(point.x, 100 - point.x, point.y, 100 - point.y);
}

function isOuterBand(point: SpawnPoint, padding = ACTIVE_EDGE_PADDING) {
  return getEdgeDistance(point) < padding;
}

function getUniqueSpawnCandidates() {
  const candidates = new Map<string, SpawnPoint>();

  for (const tile of HEX_SPAWN_TILES) {
    const point = {
      x: tile.xPercent,
      y: tile.yPercent,
    };
    const key = toPointKey(point);

    if (candidates.has(key) || !isPointNearSpawnHex(point)) {
      continue;
    }

    candidates.set(key, point);
  }

  return [...candidates.values()];
}

function createExcludedKeys(
  candidates: SpawnPoint[],
  allowedKeys: Set<string>
) {
  return new Set(
    candidates
      .map((candidate) => toPointKey(candidate))
      .filter((key) => !allowedKeys.has(key))
  );
}

function findEdgePreferenceScenario() {
  const candidates = getUniqueSpawnCandidates();
  const innerCandidates = candidates.filter(
    (candidate) => !isOuterBand(candidate)
  );
  const edgeCandidates = candidates.filter((candidate) =>
    isOuterBand(candidate)
  );

  for (const reference of innerCandidates) {
    for (const inner of innerCandidates) {
      if (toPointKey(inner) === toPointKey(reference)) {
        continue;
      }

      const innerDistance = Math.hypot(
        inner.x - reference.x,
        inner.y - reference.y
      );

      if (innerDistance < 9) {
        continue;
      }

      for (const edge of edgeCandidates) {
        const edgeDistance = Math.hypot(
          edge.x - reference.x,
          edge.y - reference.y
        );

        if (edgeDistance < 9 || edgeDistance <= innerDistance) {
          continue;
        }

        return {
          reference,
          inner,
          edge,
          candidates,
        };
      }
    }
  }

  throw new Error("Could not find a spawn edge preference test scenario.");
}

test("fortress spawn layout is unique and spread across the battlefield bounds", () => {
  const positions = getFortressSpawnLayout({
    cycleId: "layout:test",
    purpose: "registration:fortress-layout",
    count: ACTIVE_PLAYER_CAP,
  });
  const occupied = new Set<string>();
  const originalArea = 2200 * 1400;
  const currentArea = MAP_WORLD_WIDTH * MAP_WORLD_HEIGHT;

  assert.ok(currentArea / originalArea > 2.95);
  assert.ok(currentArea / originalArea < 3.05);
  assert.equal(positions.length, ACTIVE_PLAYER_CAP);

  for (const position of positions) {
    assert.ok(position.x >= 0 && position.x <= 100);
    assert.ok(position.y >= 0 && position.y <= 100);
    assert.ok(isPointNearSpawnHex(position));
    occupied.add(`${position.x}:${position.y}`);
  }

  assert.equal(occupied.size, positions.length);

  for (let leftIndex = 0; leftIndex < positions.length; leftIndex += 1) {
    for (
      let rightIndex = leftIndex + 1;
      rightIndex < positions.length;
      rightIndex += 1
    ) {
      const left = positions[leftIndex];
      const right = positions[rightIndex];
      const leftHex = snapMapPointToHex(left);
      const rightHex = snapMapPointToHex(right);

      assert.notEqual(leftHex.tile.id, rightHex.tile.id);
      assert.ok(Math.hypot(left.x - right.x, left.y - right.y) >= 9);
    }
  }
});

test("fortress spawn layout is stable for the same cycle seed", () => {
  const first = getFortressSpawnLayout({
    cycleId: "layout:stable",
    purpose: "registration:fortress-layout",
    count: ACTIVE_PLAYER_CAP,
  });
  const second = getFortressSpawnLayout({
    cycleId: "layout:stable",
    purpose: "registration:fortress-layout",
    count: ACTIVE_PLAYER_CAP,
  });

  assert.deepEqual(second, first);
});

test("fortress spawn layout changes materially for different cycle seeds", () => {
  const alpha = getFortressSpawnLayout({
    cycleId: "layout:alpha",
    purpose: "registration:fortress-layout",
    count: ACTIVE_PLAYER_CAP,
  });
  const beta = getFortressSpawnLayout({
    cycleId: "layout:beta",
    purpose: "registration:fortress-layout",
    count: ACTIVE_PLAYER_CAP,
  });
  const alphaKeys = alpha.map(
    (point) => `${Math.round(point.x)}:${Math.round(point.y)}`
  );
  const betaKeySet = new Set(
    beta.map((point) => `${Math.round(point.x)}:${Math.round(point.y)}`)
  );
  const overlapCount = alphaKeys.filter((key) => betaKeySet.has(key)).length;

  assert.ok(overlapCount <= Math.floor(ACTIVE_PLAYER_CAP * 0.8));
});

test("spawn sampler returns unique valid spawn points", () => {
  const points = takeUniqueSpawnPoints("sampler:unique", 18, {
    minSeparationDistance: 9,
  });
  const uniqueKeys = new Set(
    points.map((point) => getRenderedMapPositionKey(point))
  );

  assert.equal(points.length, 18);
  assert.equal(uniqueKeys.size, points.length);

  for (const point of points) {
    assert.ok(isPointNearSpawnHex(point));
  }
});

test("spawn sampler treats rendered stored coordinates as occupied", () => {
  const first = takeUniqueSpawnPoints("sampler:rounded-occupied", 1)[0];

  assert.ok(first);

  const [next] = takeUniqueSpawnPoints("sampler:rounded-occupied", 1, {
    excludedKeys: new Set([getRenderedMapPositionKey(first)]),
  });

  assert.ok(next);
  assert.notEqual(
    getRenderedMapPositionKey(next),
    getRenderedMapPositionKey(first)
  );
});

test("open spawn point skips rendered occupied tiles", () => {
  const first = takeOpenSpawnPoint("open:rendered-occupied");
  const next = takeOpenSpawnPoint("open:rendered-occupied", {
    excludedKeys: new Set([getRenderedMapPositionKey(first)]),
  });

  assert.notEqual(
    getRenderedMapPositionKey(next),
    getRenderedMapPositionKey(first)
  );
});

test("spawn sampler is stable for the same seed", () => {
  const first = takeUniqueSpawnPoints("sampler:stable", 14, {
    minSeparationDistance: 9,
  });
  const second = takeUniqueSpawnPoints("sampler:stable", 14, {
    minSeparationDistance: 9,
  });

  assert.deepEqual(second, first);
});

test("spawn sampler produces materially different layouts for different seeds", () => {
  const count = Math.min(HEX_SPAWN_TILES.length, 16);
  const alpha = takeUniqueSpawnPoints("sampler:alpha", count, {
    minSeparationDistance: 9,
  });
  const beta = takeUniqueSpawnPoints("sampler:beta", count, {
    minSeparationDistance: 9,
  });
  const alphaKeys = alpha.map(
    (point) => `${Math.round(point.x)}:${Math.round(point.y)}`
  );
  const betaKeySet = new Set(
    beta.map((point) => `${Math.round(point.x)}:${Math.round(point.y)}`)
  );
  const overlapCount = alphaKeys.filter((key) => betaKeySet.has(key)).length;

  assert.ok(overlapCount <= Math.floor(count * 0.8));
});

test("open spawn point prefers inner candidates over outer-band candidates", () => {
  const scenario = findEdgePreferenceScenario();
  const allowedKeys = new Set([
    toPointKey(scenario.inner),
    toPointKey(scenario.edge),
  ]);
  const excludedKeys = createExcludedKeys(scenario.candidates, allowedKeys);
  excludedKeys.add(toPointKey(scenario.reference));

  const unbiased = takeOpenSpawnPoint("open:unbiased", {
    excludedKeys,
    referencePoints: [scenario.reference],
    minSeparationDistance: 9,
  });
  const biased = takeOpenSpawnPoint("open:biased", {
    excludedKeys,
    referencePoints: [scenario.reference],
    minSeparationDistance: 9,
    preferredEdgePadding: ACTIVE_EDGE_PADDING,
  });

  assert.deepEqual(unbiased, scenario.edge);
  assert.deepEqual(biased, scenario.inner);
});

test("open spawn point falls back to outer-band candidates when inner ones are unavailable", () => {
  const candidates = getUniqueSpawnCandidates();
  const edgeCandidate = candidates.find((candidate) => isOuterBand(candidate));

  assert.ok(edgeCandidate);

  const excludedKeys = createExcludedKeys(
    candidates,
    new Set([toPointKey(edgeCandidate)])
  );
  const chosen = takeOpenSpawnPoint("open:fallback", {
    excludedKeys,
    preferredEdgePadding: ACTIVE_EDGE_PADDING,
  });

  assert.deepEqual(chosen, edgeCandidate);
  assert.equal(isOuterBand(chosen), true);
});

test("active reshuffle sampler keeps valid spacing while preferring inner tiles", () => {
  const count = 18;
  const points = takeUniqueSpawnPoints("sampler:active-reshuffle", count, {
    minSeparationDistance: 9,
    preferredEdgePadding: ACTIVE_EDGE_PADDING,
  });
  const uniqueKeys = new Set(points.map((point) => toPointKey(point)));

  assert.equal(points.length, count);
  assert.equal(uniqueKeys.size, points.length);

  for (const point of points) {
    assert.ok(isPointNearSpawnHex(point));
  }

  for (let leftIndex = 0; leftIndex < points.length; leftIndex += 1) {
    for (
      let rightIndex = leftIndex + 1;
      rightIndex < points.length;
      rightIndex += 1
    ) {
      const left = points[leftIndex]!;
      const right = points[rightIndex]!;

      assert.ok(Math.hypot(left.x - right.x, left.y - right.y) >= 9);
    }
  }
});

test("active reshuffle sampler uses fewer outer-band spawns than registration layout", () => {
  let registrationOuterBandCount = 0;
  let reshuffleOuterBandCount = 0;

  for (let index = 0; index < 24; index += 1) {
    const registrationLayout = getFortressSpawnLayout({
      cycleId: `layout-vs-reshuffle:${index}`,
      purpose: "registration:fortress-layout",
      count: ACTIVE_PLAYER_CAP,
    });
    const reshuffleLayout = takeUniqueSpawnPoints(
      `layout-vs-reshuffle:${index}`,
      ACTIVE_PLAYER_CAP,
      {
        minSeparationDistance: 9,
        preferredEdgePadding: ACTIVE_EDGE_PADDING,
      }
    );

    registrationOuterBandCount += registrationLayout.filter((point) =>
      isOuterBand(point)
    ).length;
    reshuffleOuterBandCount += reshuffleLayout.filter((point) =>
      isOuterBand(point)
    ).length;
  }

  assert.ok(reshuffleOuterBandCount < registrationOuterBandCount);
});

test("duplicate fortress map positions are detected by rendered tile key", () => {
  const renderedDuplicate = HEX_SPAWN_TILES.find((tile) => {
    const shifted = { x: tile.xPercent, y: tile.yPercent + 0.8 };

    return (
      getSpawnPointKey(shifted) !==
        getSpawnPointKey({ x: tile.xPercent, y: tile.yPercent }) &&
      getRenderedMapPositionKey(shifted) ===
        getRenderedMapPositionKey({ x: tile.xPercent, y: tile.yPercent })
    );
  });

  assert.ok(renderedDuplicate);
  assert.equal(
    hasDuplicateFortressMapPositions([
      { mapX: renderedDuplicate.xPercent, mapY: renderedDuplicate.yPercent },
      {
        mapX: renderedDuplicate.xPercent,
        mapY: renderedDuplicate.yPercent + 0.8,
      },
    ]),
    true
  );

  const distinctPoints = takeUniqueSpawnPoints("duplicate:distinct-rendered", 2);

  assert.equal(
    hasDuplicateFortressMapPositions([
      { mapX: distinctPoints[0]!.x, mapY: distinctPoints[0]!.y },
      { mapX: distinctPoints[1]!.x, mapY: distinctPoints[1]!.y },
    ]),
    false
  );
});

test("join registration uses the shared deterministic spawn layout", async (context) => {
  const prisma = getPrismaOrSkip(context);

  if (!prisma) {
    return;
  }

  const cycle = await seedOpenCycle(prisma);
  const firstUser = await createUser(prisma, "layout-first@example.com");
  const secondUser = await createUser(prisma, "layout-second@example.com");
  const expectedLayout = getFortressSpawnLayout({
    cycleId: cycle.id,
    purpose: "registration:fortress-layout",
    count: ACTIVE_PLAYER_CAP,
  });

  await joinRegistrationCycle({
    db: prisma,
    userId: firstUser.id,
    fortressName: "Layout One",
    now: new Date("2026-04-19T12:05:00.000Z"),
  });
  await joinRegistrationCycle({
    db: prisma,
    userId: secondUser.id,
    fortressName: "Layout Two",
    now: new Date("2026-04-19T12:06:00.000Z"),
  });

  const joinedFortresses = await prisma.fortress.findMany({
    where: {
      cycleId: cycle.id,
      ownerId: {
        in: [firstUser.id, secondUser.id],
      },
    },
    orderBy: {
      joinedAt: "asc",
    },
    select: {
      mapX: true,
      mapY: true,
    },
  });

  assert.deepEqual(
    joinedFortresses.map((fortress) => ({
      x: fortress.mapX,
      y: fortress.mapY,
    })),
    expectedLayout.slice(0, joinedFortresses.length).map((position) => ({
      x: Math.round(position.x),
      y: Math.round(position.y),
    }))
  );
});

test("tick health classification separates healthy, delayed, and stalled states", () => {
  assert.equal(classifyTickHealth(0), "ok");
  assert.equal(classifyTickHealth(1), "ok");
  assert.equal(classifyTickHealth(2), "lagging");
  assert.equal(classifyTickHealth(3), "stalled");
});

test("tick CLI summary includes attack launch and resolution counts", () => {
  const formatted = formatTickSummary({
    restartedRegistrationCycles: 1,
    testingCyclesStarted: 1,
    testingCyclesCompleted: 1,
    activatedCycles: 2,
    resolvedCycles: 3,
    resolvedCommunityWishVotes: 0,
    nextRegistrationCyclesCreated: 4,
    processedMinutes: 5,
    scoreEventsCreated: 6,
    launchedAttackUnits: 7,
    resolvedAttackUnits: 8,
  });

  assert.match(formatted, /Registration restarted: 1/);
  assert.match(formatted, /Testing cycles started: 1/);
  assert.match(formatted, /Testing cycles completed: 1/);
  assert.match(formatted, /Attack units launched: 7/);
  assert.match(formatted, /Attack units resolved: 8/);
});

test("tick CLI formats structured runner errors with stage context", () => {
  const formatted = formatTickRunnerError(
    new TickRunnerError({
      stage: "process-minute",
      cycleId: "cycle-123",
      tickAt: new Date("2026-04-23T12:02:00.000Z"),
      now: new Date("2026-04-23T12:05:00.000Z"),
      cause: new Error("Unique constraint failed"),
    })
  );

  assert.match(formatted, /"event":"tick-run-failed"/);
  assert.match(formatted, /"stage":"process-minute"/);
  assert.match(formatted, /"cycleId":"cycle-123"/);
  assert.match(formatted, /Unique constraint failed/);
});

test("attack presentation keeps units moving until the impact window", () => {
  const unit = {
    id: "unit-1",
    armyAmount: 1,
    launchedAt: new Date("2026-04-23T12:00:00.000Z"),
    arrivesAt: new Date("2026-04-23T12:00:10.000Z"),
    attacker: {
      id: "attacker",
      name: "Alpha",
      mapX: 10,
      mapY: 10,
      unitSpriteVariant: "unit-1" as const,
    },
    target: {
      id: "target",
      name: "Beta",
      mapX: 20,
      mapY: 20,
    },
  };

  const traveling = getAttackPresentation(
    unit,
    new Date("2026-04-23T12:00:08.000Z").getTime()
  );
  const impacting = getAttackPresentation(
    unit,
    new Date("2026-04-23T12:00:09.200Z").getTime()
  );

  assert.equal(traveling.isImpacting, false);
  assert.equal(traveling.showSprite, true);
  assert.ok(traveling.progress < 0.94);

  assert.equal(impacting.isImpacting, true);
  assert.equal(impacting.showSprite, false);
  assert.ok(impacting.progress <= 0.94);
  assert.equal(impacting.progress, 0.92);
});

test("race buff tiers unlock tier 2 at active start and tier 3 at next Helsinki noon", () => {
  const activeStartedAt = new Date("2026-04-20T09:00:00.000Z");
  const tierThreeAt = getNextHelsinkiNoonAfter(activeStartedAt);

  assert.equal(
    getRaceBuffTier({
      activeStartedAt,
      now: new Date("2026-04-20T08:59:00.000Z"),
      isActiveSeason: true,
    }),
    0
  );
  assert.equal(
    getRaceBuffTier({
      activeStartedAt,
      now: activeStartedAt,
      isActiveSeason: true,
    }),
    2
  );
  assert.equal(
    getRaceBuffTier({
      activeStartedAt,
      now: tierThreeAt,
      isActiveSeason: true,
    }),
    3
  );
  assert.equal(
    getRaceBuffTier({
      activeStartedAt,
      now: tierThreeAt,
      isActiveSeason: false,
    }),
    0
  );
});

test("unicorn tier 2 travel speed halves attack travel time", () => {
  const origin = { mapX: 0, mapY: 0 };
  const target = { mapX: 120, mapY: 0 };

  assert.equal(getAttackTravelMinutes(origin, target), 10);
  assert.equal(
    getAttackTravelMinutes(origin, target, {
      attackerRace: "UNSTABLE_UNICORNS",
      raceBuffTier: 2,
    }),
    5
  );
});

test("build arcade rewards unlock cosmetics at predictable score thresholds", () => {
  assert.equal(getBuildArcadeRewardVariant(0), null);
  assert.equal(getBuildArcadeRewardVariant(4), null);
  assert.equal(getBuildArcadeRewardVariant(5), "ember");
  assert.equal(getBuildArcadeRewardVariant(10), "frost");
  assert.equal(getBuildArcadeRewardVariant(18), "jade");
  assert.equal(getBuildArcadeRewardVariant(24), "onyx");
});

test("arcade season minting grants a flat payout plus capped points bonus once", async (context) => {
  const prisma = getPrismaOrSkip(context);

  if (!prisma) {
    return;
  }

  const user = await createUser(prisma, "arcade-season@example.com");
  const cycle = await seedActiveCommunityWishCycle(prisma, [
    {
      userId: user.id,
      commanderName: "Arcade Commander",
      fortressName: "Arcade Hold",
      points: 265,
    },
  ]);

  const firstMint = await mintSeasonArcadeCoins({
    cycleId: cycle.id,
    db: prisma,
    now: new Date("2026-04-26T09:00:00.000Z"),
  });

  assert.equal(firstMint.mintedPlayers, 1);
  assert.equal(
    firstMint.mintedCoins,
    ARCADE_SEASON_BASE_COINS +
      Math.min(
        ARCADE_SEASON_POINTS_BONUS_CAP,
        Math.floor(265 / ARCADE_SEASON_POINTS_BONUS_DIVISOR)
      ) +
      getArcadeSeasonRankBonus(1)
  );

  const wallet = await prisma.arcadeWallet.findUnique({
    where: {
      userId: user.id,
    },
    select: {
      balance: true,
    },
  });

  assert.equal(
    wallet?.balance,
    ARCADE_SEASON_BASE_COINS +
      Math.min(
        ARCADE_SEASON_POINTS_BONUS_CAP,
        Math.floor(265 / ARCADE_SEASON_POINTS_BONUS_DIVISOR)
      ) +
      getArcadeSeasonRankBonus(1)
  );

  const secondMint = await mintSeasonArcadeCoins({
    cycleId: cycle.id,
    db: prisma,
    now: new Date("2026-04-26T09:00:00.000Z"),
  });

  assert.equal(secondMint.mintedPlayers, 0);
  assert.equal(secondMint.mintedCoins, 0);
});

test("arcade season minting uses the resolved placement order for rank bonuses", async (context) => {
  const prisma = getPrismaOrSkip(context);

  if (!prisma) {
    return;
  }

  const firstUser = await createUser(prisma, "arcade-rank-1@example.com");
  const secondUser = await createUser(prisma, "arcade-rank-2@example.com");
  const cycle = await seedActiveCommunityWishCycle(prisma, [
    {
      userId: firstUser.id,
      commanderName: "Rank One",
      fortressName: "Rank One Hold",
      points: 10,
    },
    {
      userId: secondUser.id,
      commanderName: "Rank Two",
      fortressName: "Rank Two Hold",
      points: 500,
    },
  ]);

  const result = await mintSeasonArcadeCoins({
    cycleId: cycle.id,
    db: prisma,
    now: new Date("2026-04-26T09:00:00.000Z"),
    rankedFortresses: [
      { ownerId: secondUser.id },
      { ownerId: firstUser.id },
    ],
  });

  assert.equal(result.mintedPlayers, 2);
  assert.equal(
    result.mintedCoins,
    ARCADE_SEASON_BASE_COINS +
      Math.min(
        ARCADE_SEASON_POINTS_BONUS_CAP,
        Math.floor(500 / ARCADE_SEASON_POINTS_BONUS_DIVISOR)
      ) +
      getArcadeSeasonRankBonus(1) +
      ARCADE_SEASON_BASE_COINS +
      Math.min(
        ARCADE_SEASON_POINTS_BONUS_CAP,
        Math.floor(10 / ARCADE_SEASON_POINTS_BONUS_DIVISOR)
      ) +
      getArcadeSeasonRankBonus(2)
  );

  const firstWallet = await prisma.arcadeWallet.findUnique({
    where: {
      userId: firstUser.id,
    },
    select: {
      balance: true,
    },
  });

  const secondWallet = await prisma.arcadeWallet.findUnique({
    where: {
      userId: secondUser.id,
    },
    select: {
      balance: true,
    },
  });

  assert.equal(
    firstWallet?.balance,
    ARCADE_SEASON_BASE_COINS +
      Math.min(
        ARCADE_SEASON_POINTS_BONUS_CAP,
        Math.floor(10 / ARCADE_SEASON_POINTS_BONUS_DIVISOR)
      ) +
      getArcadeSeasonRankBonus(2)
  );
  assert.equal(
    secondWallet?.balance,
    ARCADE_SEASON_BASE_COINS +
      Math.min(
        ARCADE_SEASON_POINTS_BONUS_CAP,
        Math.floor(500 / ARCADE_SEASON_POINTS_BONUS_DIVISOR)
      ) +
      getArcadeSeasonRankBonus(1)
  );
});

test("arcade loot box duplicate refunds coins instead of creating duplicate skins", async (context) => {
  const prisma = getPrismaOrSkip(context);

  if (!prisma) {
    return;
  }

  const user = await createUser(prisma, "arcade-loot@example.com");
  await seedOpenCycle(prisma);

  await joinRegistrationCycle({
    db: prisma,
    userId: user.id,
    commanderName: "Loot Commander",
    fortressName: "Loot Hold",
    now: new Date("2026-04-19T12:05:00.000Z"),
  });

  await prisma.arcadeWallet.create({
    data: {
      userId: user.id,
      balance: 100,
    },
  });

  const purchase = await purchaseArcadeLootBox({
    userId: user.id,
    crateType: ArcadeLootBoxType.UNIT,
    db: prisma,
    now: new Date("2026-04-19T12:06:00.000Z"),
  });

  await Promise.all(
    ARCADE_LOOT_BOX_SKINS[ArcadeCosmeticSlot.UNIT].map((skin) =>
      prisma.arcadeCosmeticUnlock.create({
        data: {
          userId: user.id,
          slot: ArcadeCosmeticSlot.UNIT,
          variant: skin.variant,
        },
      })
    )
  );

  const opened = await openArcadeLootBox({
    purchaseId: purchase.purchase.id,
    userId: user.id,
    db: prisma,
    now: new Date("2026-04-19T12:07:00.000Z"),
  });

  assert.equal(opened.duplicatePayout, 30);
  assert.equal(opened.unlockId, null);

  const wallet = await prisma.arcadeWallet.findUnique({
    where: {
      userId: user.id,
    },
    select: {
      balance: true,
    },
  });

  assert.equal(wallet?.balance, 55);

  const reloadedPurchase = await prisma.arcadeLootBoxPurchase.findUnique({
    where: {
      id: purchase.purchase.id,
    },
    select: {
      openedAt: true,
      duplicatePayout: true,
    },
  });

  assert.ok(reloadedPurchase?.openedAt);
  assert.equal(reloadedPurchase?.duplicatePayout, 30);
});

test("arcade loot boxes can be purchased during the active cycle", async (context) => {
  const prisma = getPrismaOrSkip(context);

  if (!prisma) {
    return;
  }

  const user = await createUser(prisma, "arcade-active-buy@example.com");
  const cycle = await seedActiveCommunityWishCycle(prisma, [
    {
      userId: user.id,
      commanderName: "Active Buyer",
      fortressName: "Market Keep",
      points: 25,
    },
  ]);

  await prisma.arcadeWallet.create({
    data: {
      userId: user.id,
      balance: 100,
    },
  });

  const result = await purchaseArcadeLootBox({
    userId: user.id,
    crateType: ArcadeLootBoxType.UNIT,
    db: prisma,
    now: new Date("2026-04-20T12:03:00.000Z"),
  });

  assert.equal(result.purchase.crateType, ArcadeLootBoxType.UNIT);
  assert.equal(result.balanceAfter, 25);

  const ledgerEntry = await prisma.arcadeTransaction.findFirst({
    where: {
      userId: user.id,
      kind: "LOOT_BOX_PURCHASE",
    },
    select: {
      cycleId: true,
    },
  });

  assert.equal(ledgerEntry?.cycleId, cycle.id);
});

test("arcade loot boxes can be opened during the active cycle", async (context) => {
  const prisma = getPrismaOrSkip(context);

  if (!prisma) {
    return;
  }

  const user = await createUser(prisma, "arcade-active-open@example.com");
  await seedActiveCommunityWishCycle(prisma, [
    {
      userId: user.id,
      commanderName: "Active Opener",
      fortressName: "Crate Keep",
      points: 25,
    },
  ]);

  await prisma.arcadeWallet.create({
    data: {
      userId: user.id,
      balance: 100,
    },
  });

  const purchase = await purchaseArcadeLootBox({
    userId: user.id,
    crateType: ArcadeLootBoxType.FORTRESS,
    db: prisma,
    now: new Date("2026-04-20T12:03:00.000Z"),
  });

  const opened = await openArcadeLootBox({
    purchaseId: purchase.purchase.id,
    userId: user.id,
    db: prisma,
    now: new Date("2026-04-20T12:04:00.000Z"),
  });

  assert.equal(opened.slot, ArcadeCosmeticSlot.FORTRESS);

  const reloadedPurchase = await prisma.arcadeLootBoxPurchase.findUnique({
    where: {
      id: purchase.purchase.id,
    },
    select: {
      openedAt: true,
      rewardSlot: true,
      rewardVariant: true,
    },
  });

  assert.ok(reloadedPurchase?.openedAt);
  assert.equal(reloadedPurchase?.rewardSlot, ArcadeCosmeticSlot.FORTRESS);
  assert.equal(reloadedPurchase?.rewardVariant, opened.variant);
});

test("arcade hub exposes owned skins and shop actions outside build phase", async (context) => {
  const prisma = getPrismaOrSkip(context);

  if (!prisma) {
    return;
  }

  const user = await createUser(prisma, "arcade-active-hub@example.com");
  await seedActiveCommunityWishCycle(prisma, [
    {
      userId: user.id,
      commanderName: "Skin Swapper",
      fortressName: "Wardrobe Hold",
      points: 25,
    },
  ]);

  await prisma.user.update({
    where: {
      id: user.id,
    },
    data: {
      unitCosmeticVariant: "emerald",
    },
  });
  await prisma.arcadeWallet.create({
    data: {
      userId: user.id,
      balance: 100,
    },
  });
  await prisma.arcadeLootBoxPurchase.create({
    data: {
      userId: user.id,
      crateType: ArcadeLootBoxType.UNIT,
      price: 75,
    },
  });
  await prisma.arcadeCosmeticUnlock.create({
    data: {
      userId: user.id,
      slot: ArcadeCosmeticSlot.UNIT,
      variant: "emerald",
    },
  });

  const state = await getArcadeHubState({
    userId: user.id,
    db: prisma,
    now: new Date("2026-04-20T12:03:00.000Z"),
  });

  assert.equal(state.buildOpen, false);
  assert.equal(state.canBuy, true);
  assert.equal(state.canOpen, true);
  assert.equal(state.walletBalance, 100);
  assert.equal(state.unopenedPurchases.length, 1);
  assert.equal(state.equippedSkins.unit, "emerald");
  assert.equal(state.ownedSkins.unit.length, 1);
  assert.equal(state.ownedSkins.unit[0].equipped, true);
});

test("arcade games remain locked outside the build phase", async (context) => {
  const prisma = getPrismaOrSkip(context);

  if (!prisma) {
    return;
  }

  const user = await createUser(prisma, "arcade-active-game@example.com");
  const cycle = await seedActiveCommunityWishCycle(prisma, [
    {
      userId: user.id,
      commanderName: "Active Player",
      fortressName: "Table Keep",
      points: 25,
    },
  ]);

  await prisma.arcadeWallet.create({
    data: {
      userId: user.id,
      balance: 100,
    },
  });

  await assert.rejects(
    () =>
      playArcadeGame({
        cycleId: cycle.id,
        userId: user.id,
        gameType: ArcadeGameType.SLOTS,
        stake: 10,
        choice: null,
        db: prisma,
        now: new Date("2026-04-20T12:03:00.000Z"),
      }),
    /only open during the build phase/
  );
});

test("arcade cosmetic unlocks can be equipped onto the matching slot", async (context) => {
  const prisma = getPrismaOrSkip(context);

  if (!prisma) {
    return;
  }

  const user = await createUser(prisma, "arcade-equip@example.com");
  const unlock = await prisma.arcadeCosmeticUnlock.create({
    data: {
      userId: user.id,
      slot: ArcadeCosmeticSlot.FORTRESS,
      variant: "jade",
    },
    select: {
      id: true,
    },
  });

  const result = await equipCosmeticUnlock({
    unlockId: unlock.id,
    userId: user.id,
    slot: ArcadeCosmeticSlot.FORTRESS,
    db: prisma,
  });

  assert.equal(result.variant, "jade");

  const refreshedUser = await prisma.user.findUnique({
    where: {
      id: user.id,
    },
    select: {
      fortressCosmeticVariant: true,
    },
  });

  assert.equal(refreshedUser?.fortressCosmeticVariant, "jade");
});

type ReadyDatabaseSetup = {
  client: PrismaClient;
  schema: string;
};

type SkippedDatabaseSetup = {
  client: null;
  schema: null;
  reason: string;
};

function createSchemaDatabaseUrl(schema: string) {
  const url = new URL(defaultDatabaseUrl);
  url.searchParams.set("schema", schema);
  return url.toString();
}

function getPrismaMigrateCommand() {
  const args = [
    "prisma",
    "migrate",
    "deploy",
    "--schema",
    "prisma/schema.prisma",
  ];

  if (process.platform === "win32") {
    return {
      command: "cmd.exe",
      args: ["/c", "npx", ...args],
    };
  }

  return {
    command: "npx",
    args,
  };
}

function getSetupSkipReason(error: unknown) {
  if (error instanceof Error) {
    if (
      error.message.includes("Schema engine error") ||
      error.message.includes("ECONNREFUSED") ||
      error.message.includes("Can't reach database server") ||
      error.message.includes("Command failed:")
    ) {
      return "PostgreSQL is not reachable for game integration tests.";
    }

    return error.message;
  }

  return "A PostgreSQL database is not reachable.";
}

async function setupDatabase() {
  const schema = `game_test_${randomUUID().replace(/-/g, "")}`;
  const databaseUrl = createSchemaDatabaseUrl(schema);
  const migrateCommand = getPrismaMigrateCommand();

  execFileSync(migrateCommand.command, migrateCommand.args, {
    cwd: workspaceRoot,
    env: {
      ...process.env,
      DATABASE_URL: databaseUrl,
    },
    stdio: "pipe",
  });

  const client = new PrismaClient({
    datasources: {
      db: {
        url: databaseUrl,
      },
    },
  });

  await client.$connect();

  return { client, schema };
}

async function resetDatabase(client: PrismaClient) {
  await client.attackUnit.deleteMany();
  await client.scoreEvent.deleteMany();
  await client.gameTick.deleteMany();
  await client.chatMessage.deleteMany();
  await client.communityWishVote.deleteMany();
  await client.communityWishVoteEntitlement.deleteMany();
  await client.cycleHistory.deleteMany();
  await client.winnerRequest.deleteMany();
  await client.communityWishProposal.deleteMany();
  await client.fortress.deleteMany();
  await client.session.deleteMany();
  await client.account.deleteMany();
  await client.cycle.deleteMany();
  await client.user.deleteMany();
}

async function createUser(client: PrismaClient, email: string) {
  return client.user.create({
    data: {
      email,
      name: email,
    },
  });
}

async function seedActiveCommunityWishCycle(
  client: PrismaClient,
  players: Array<{
    userId: string;
    commanderName: string;
    fortressName: string;
    points: number;
  }>,
  activeEndsAt = new Date("2026-04-20T12:10:00.000Z")
) {
  const activeStartedAt = new Date("2026-04-20T12:00:00.000Z");
  const cycle = await client.cycle.create({
    data: {
      status: CycleStatus.ACTIVE,
      registrationStartedAt: new Date("2026-04-19T12:00:00.000Z"),
      registrationEndsAt: activeStartedAt,
      activeStartedAt,
      activeEndsAt,
      mapLayoutVersion: CURRENT_MAP_LAYOUT_VERSION,
    },
  });

  await Promise.all(
    players.map((player, index) =>
      client.fortress.create({
        data: {
          cycleId: cycle.id,
          ownerId: player.userId,
          commanderName: player.commanderName,
          commanderNameRegisteredAt: activeStartedAt,
          name: player.fortressName,
          points: player.points,
          health: 100,
          maxHealth: 100,
          mapX: 100 + index * 20,
          mapY: 100 + index * 20,
          joinedAt: new Date(activeStartedAt.getTime() + index * 1000),
        },
      })
    )
  );

  return cycle;
}

async function seedOpenCycle(
  client: PrismaClient,
  now = new Date("2026-04-19T12:00:00.000Z")
) {
  await seedProjectA(client, {
    adminEmail: "admin@example.com",
    now,
  });

  const cycle = await client.cycle.findFirst({
    where: {
      resolvedAt: null,
    },
    orderBy: {
      createdAt: "desc",
    },
  });

  assert.ok(cycle);

  return cycle;
}

let databaseSetup: ReadyDatabaseSetup | SkippedDatabaseSetup = {
  client: null,
  schema: null,
  reason: "Database setup has not run yet.",
};

function getPrismaOrSkip(context: TestContext) {
  if (!databaseSetup.client) {
    context.skip(databaseSetup.reason);
    return null;
  }

  return databaseSetup.client;
}

before(async () => {
  try {
    databaseSetup = await setupDatabase();
  } catch (error) {
    databaseSetup = {
      client: null,
      schema: null,
      reason: getSetupSkipReason(error),
    };
  }
});

after(async () => {
  if (!databaseSetup.client || !databaseSetup.schema) {
    return;
  }

  await databaseSetup.client.$executeRawUnsafe(
    `DROP SCHEMA IF EXISTS "${databaseSetup.schema}" CASCADE`
  );
  await databaseSetup.client.$disconnect();
});

beforeEach(async () => {
  if (!databaseSetup.client) {
    return;
  }

  await resetDatabase(databaseSetup.client);
});

test("seed bootstraps one open registration cycle", async (context) => {
  const prisma = getPrismaOrSkip(context);

  if (!prisma) {
    return;
  }

  const cycle = await seedOpenCycle(prisma);
  const cycles = await prisma.cycle.findMany();

  assert.equal(cycles.length, 1);
  assert.equal(cycle.status, "REGISTRATION");
});

test("join succeeds during registration and open active windows", async (context) => {
  const prisma = getPrismaOrSkip(context);

  if (!prisma) {
    return;
  }

  const cycle = await seedOpenCycle(prisma);
  const user = await createUser(prisma, "joiner@example.com");

  await joinRegistrationCycle({
    db: prisma,
    userId: user.id,
    fortressName: "Northern Bastion",
    now: new Date("2026-04-19T12:05:00.000Z"),
  });

  const fortress = await prisma.fortress.findUnique({
    where: {
      cycleId_ownerId: {
        cycleId: cycle.id,
        ownerId: user.id,
      },
    },
  });

  assert.ok(fortress);

  await setRegistrationJoiningLock({
    db: prisma,
    locked: true,
    now: new Date("2026-04-19T12:10:00.000Z"),
  });

  await runGameTick({
    db: prisma,
    now: new Date("2026-04-20T12:00:00.000Z"),
  });

  const activeUser = await createUser(prisma, "active-joiner@example.com");
  const activatedCycle = await prisma.cycle.findUniqueOrThrow({
    where: {
      id: cycle.id,
    },
  });
  const activeState = await getHomePageState({
    db: prisma,
    userId: activeUser.id,
    now: new Date("2026-04-20T12:01:00.000Z"),
  });

  assert.equal(activatedCycle.joiningLockedAt, null);
  assert.equal(activeState.canJoinCycle, true);

  await joinRegistrationCycle({
    db: prisma,
    userId: activeUser.id,
    fortressName: "Active Join",
    now: new Date("2026-04-20T12:01:00.000Z"),
  });
});

test("join fails after the active deadline", async (context) => {
  const prisma = getPrismaOrSkip(context);

  if (!prisma) {
    return;
  }

  await seedOpenCycle(prisma);
  await runGameTick({
    db: prisma,
    now: new Date("2026-04-20T12:00:00.000Z"),
  });

  const lateUser = await createUser(prisma, "too-late@example.com");

  await assert.rejects(
    () =>
      joinRegistrationCycle({
        db: prisma,
        userId: lateUser.id,
        fortressName: "After Deadline",
        now: new Date("2026-04-23T12:00:00.000Z"),
      }),
    /Joining is closed for this cycle/
  );
});

test("ACTIVE_PLAYER_CAP blocks joins during an active cycle", async (context) => {
  const prisma = getPrismaOrSkip(context);

  if (!prisma) {
    return;
  }

  await seedOpenCycle(prisma);

  for (let index = 0; index < ACTIVE_PLAYER_CAP; index += 1) {
    const user = await createUser(prisma, `active-cap-${index}@example.com`);
    await joinRegistrationCycle({
      db: prisma,
      userId: user.id,
      fortressName: `Active Cap ${index}`,
      now: new Date("2026-04-19T12:10:00.000Z"),
    });
  }

  await runGameTick({
    db: prisma,
    now: new Date("2026-04-20T12:00:00.000Z"),
  });

  const overflowUser = await createUser(prisma, "active-overflow@example.com");

  await assert.rejects(
    () =>
      joinRegistrationCycle({
        db: prisma,
        userId: overflowUser.id,
        fortressName: "Overflow Active",
        now: new Date("2026-04-20T12:01:00.000Z"),
      }),
    /already full/
  );
});

test("one fortress per user per cycle and duplicate names are rejected", async (context) => {
  const prisma = getPrismaOrSkip(context);

  if (!prisma) {
    return;
  }

  await seedOpenCycle(prisma);
  const alpha = await createUser(prisma, "alpha@example.com");
  const beta = await createUser(prisma, "beta@example.com");

  await joinRegistrationCycle({
    db: prisma,
    userId: alpha.id,
    commanderName: "Alpha Commander",
    fortressName: "Stonegate",
  });

  await assert.rejects(
    () =>
      joinRegistrationCycle({
        db: prisma,
        userId: alpha.id,
        fortressName: "Second Join",
      }),
    /already joined/
  );

  await assert.rejects(
    () =>
      joinRegistrationCycle({
        db: prisma,
        userId: beta.id,
        fortressName: "Stonegate",
      }),
    /already taken/
  );
});

test("season commander names are stored and unique per cycle", async (context) => {
  const prisma = getPrismaOrSkip(context);

  if (!prisma) {
    return;
  }

  const firstCycle = await seedOpenCycle(prisma);
  const alpha = await createUser(prisma, "nick-alpha@example.com");
  const beta = await createUser(prisma, "nick-beta@example.com");

  await joinRegistrationCycle({
    db: prisma,
    userId: alpha.id,
    commanderName: "Night Fox",
    fortressName: "Moon Gate",
  });

  const alphaFortress = await prisma.fortress.findUniqueOrThrow({
    where: {
      cycleId_ownerId: {
        cycleId: firstCycle.id,
        ownerId: alpha.id,
      },
    },
  });

  assert.equal(alphaFortress.commanderName, "Night Fox");
  assert.ok(alphaFortress.commanderNameRegisteredAt);
  assert.equal(alphaFortress.name, "Moon Gate");

  await assert.rejects(
    () =>
      joinRegistrationCycle({
        db: prisma,
        userId: beta.id,
        commanderName: "Night Fox",
        fortressName: "Sun Gate",
      }),
    /in-game nick is already taken/
  );

  await prisma.cycle.update({
    where: {
      id: firstCycle.id,
    },
    data: {
      status: CycleStatus.RESOLUTION,
      resolvedAt: new Date("2026-04-20T12:00:00.000Z"),
    },
  });

  const secondCycle = await prisma.cycle.create({
    data: {
      status: CycleStatus.REGISTRATION,
      registrationStartedAt: new Date("2026-04-20T12:00:00.000Z"),
      registrationEndsAt: new Date("2026-04-21T12:00:00.000Z"),
      activeEndsAt: new Date("2026-04-24T12:00:00.000Z"),
    },
  });

  await joinRegistrationCycle({
    db: prisma,
    userId: beta.id,
    commanderName: "Night Fox",
    fortressName: "Sun Gate",
    now: new Date("2026-04-20T12:01:00.000Z"),
  });

  const betaFortress = await prisma.fortress.findUniqueOrThrow({
    where: {
      cycleId_ownerId: {
        cycleId: secondCycle.id,
        ownerId: beta.id,
      },
    },
  });

  assert.equal(betaFortress.commanderName, "Night Fox");
});

test("registration enforces the 30 player cap", async (context) => {
  const prisma = getPrismaOrSkip(context);

  if (!prisma) {
    return;
  }

  await seedOpenCycle(prisma);

  for (let index = 0; index < 30; index += 1) {
    const user = await createUser(prisma, `cap-${index}@example.com`);
    await joinRegistrationCycle({
      db: prisma,
      userId: user.id,
      fortressName: `Fortress ${index}`,
    });
  }

  const extraUser = await createUser(prisma, "extra@example.com");

  await assert.rejects(
    () =>
      joinRegistrationCycle({
        db: prisma,
        userId: extraUser.id,
        fortressName: "Overflow",
      }),
    /already full/
  );
});

test("admin joining lock blocks new registration joins", async (context) => {
  const prisma = getPrismaOrSkip(context);

  if (!prisma) {
    return;
  }

  await seedOpenCycle(prisma);
  const user = await createUser(prisma, "locked@example.com");

  await setRegistrationJoiningLock({
    db: prisma,
    locked: true,
    now: new Date("2026-04-19T12:10:00.000Z"),
  });

  await assert.rejects(
    () =>
      joinRegistrationCycle({
        db: prisma,
        userId: user.id,
        fortressName: "Locked Keep",
        now: new Date("2026-04-19T12:11:00.000Z"),
      }),
    /locked by an admin/
  );
});

test("registration-time name editing works without charging points", async (context) => {
  const prisma = getPrismaOrSkip(context);

  if (!prisma) {
    return;
  }

  const cycle = await seedOpenCycle(prisma);
  const user = await createUser(prisma, "editor@example.com");

  await joinRegistrationCycle({
    db: prisma,
    userId: user.id,
    commanderName: "Old Commander",
    fortressName: "Old Name",
  });

  await editRegistrationFortressName({
    db: prisma,
    userId: user.id,
    commanderName: "New Commander",
    fortressName: "New Name",
  });

  const fortress = await prisma.fortress.findUniqueOrThrow({
    where: {
      cycleId_ownerId: {
        cycleId: cycle.id,
        ownerId: user.id,
      },
    },
  });
  const renameEvents = await prisma.scoreEvent.findMany({
    where: {
      cycleId: cycle.id,
      eventType: ScoreEventType.RENAME_COST,
    },
  });

  assert.equal(fortress.commanderName, "New Commander");
  assert.ok(fortress.commanderNameRegisteredAt);
  assert.equal(fortress.name, "New Name");
  assert.equal(fortress.points, 0);
  assert.equal(renameEvents.length, 0);

  await runGameTick({
    db: prisma,
    now: new Date("2026-04-20T12:00:00.000Z"),
  });

  const activeState = await getHomePageState({
    db: prisma,
    userId: user.id,
    now: new Date("2026-04-20T12:01:00.000Z"),
  });

  assert.equal(activeState.canEditRegistrationName, false);
});

test("existing cycle players can register an in-game nick once", async (context) => {
  const prisma = getPrismaOrSkip(context);

  if (!prisma) {
    return;
  }

  const cycle = await seedOpenCycle(prisma);
  const alpha = await createUser(prisma, "existing-alpha@example.com");
  const beta = await createUser(prisma, "existing-beta@example.com");

  await joinRegistrationCycle({
    db: prisma,
    userId: alpha.id,
    commanderName: "Alpha Default",
    fortressName: "Alpha Keep",
  });
  await joinRegistrationCycle({
    db: prisma,
    userId: beta.id,
    commanderName: "Beta Default",
    fortressName: "Beta Keep",
  });
  await prisma.fortress.updateMany({
    where: {
      cycleId: cycle.id,
    },
    data: {
      commanderNameRegisteredAt: null,
    },
  });
  await runGameTick({
    db: prisma,
    now: new Date("2026-04-20T12:00:00.000Z"),
  });

  const pendingState = await getHomePageState({
    db: prisma,
    userId: alpha.id,
    now: new Date("2026-04-20T12:01:00.000Z"),
  });

  assert.equal(pendingState.playerSummary?.canRegisterCommanderName, true);

  await registerCommanderName({
    db: prisma,
    userId: alpha.id,
    commanderName: "Alpha Nick",
    now: new Date("2026-04-20T12:02:00.000Z"),
  });

  const registeredState = await getHomePageState({
    db: prisma,
    userId: alpha.id,
    now: new Date("2026-04-20T12:03:00.000Z"),
  });

  assert.equal(registeredState.playerSummary?.commanderName, "Alpha Nick");
  assert.equal(registeredState.playerSummary?.canRegisterCommanderName, false);

  await assert.rejects(
    () =>
      registerCommanderName({
        db: prisma,
        userId: alpha.id,
        commanderName: "Second Nick",
      }),
    /already registered/
  );

  await assert.rejects(
    () =>
      registerCommanderName({
        db: prisma,
        userId: beta.id,
        commanderName: "Alpha Nick",
      }),
    /in-game nick is already taken/
  );
});

test("expired empty registration restarts with a fresh 24 hour window", async (context) => {
  const prisma = getPrismaOrSkip(context);

  if (!prisma) {
    return;
  }

  const cycle = await seedOpenCycle(prisma);
  const summary = await runGameTick({
    db: prisma,
    now: new Date("2026-04-20T12:01:00.000Z"),
  });
  const refreshedCycle = await prisma.cycle.findUniqueOrThrow({
    where: {
      id: cycle.id,
    },
  });

  assert.equal(summary.restartedRegistrationCycles, 1);
  assert.equal(refreshedCycle.status, "REGISTRATION");
  assert.equal(
    refreshedCycle.registrationStartedAt.toISOString(),
    "2026-04-20T12:01:00.000Z"
  );
  assert.equal(
    refreshedCycle.registrationEndsAt.toISOString(),
    "2026-04-21T12:01:00.000Z"
  );
});

test("non-empty registration enters testing for the final 24 hours before season start", async (context) => {
  const prisma = getPrismaOrSkip(context);

  if (!prisma) {
    return;
  }

  const cycle = await seedOpenCycle(
    prisma,
    new Date("2026-04-19T11:00:00.000Z")
  );
  const user = await createUser(prisma, "testing-start@example.com");

  await joinRegistrationCycle({
    db: prisma,
    userId: user.id,
    fortressName: "Test Gate",
    now: new Date("2026-04-19T11:05:00.000Z"),
  });

  const testingStartsAt = addHours(cycle.registrationEndsAt, -24);
  const summary = await runGameTick({
    db: prisma,
    now: testingStartsAt,
  });
  const testingCycle = await prisma.cycle.findUniqueOrThrow({
    where: {
      id: cycle.id,
    },
  });
  const testingState = await getHomePageState({
    db: prisma,
    userId: user.id,
    now: addMinutes(testingStartsAt, 1),
  });

  assert.equal(summary.testingCyclesStarted, 1);
  assert.equal(summary.activatedCycles, 0);
  assert.equal(testingCycle.status, CycleStatus.TESTING);
  assert.equal(testingCycle.testingStartedAt?.toISOString(), testingStartsAt.toISOString());
  assert.equal(testingCycle.testingEndsAt?.toISOString(), cycle.registrationEndsAt.toISOString());
  assert.equal(testingCycle.activeStartedAt?.toISOString(), cycle.registrationEndsAt.toISOString());
  assert.equal(testingState.phase?.status, CycleStatus.TESTING);
  assert.equal(testingState.phase?.deadline?.toISOString(), cycle.registrationEndsAt.toISOString());
  assert.equal(testingState.canJoinCycle, false);
  assert.equal(testingState.playerSummary?.isTestingPhase, true);
  assert.equal(testingState.communityWish.canSubmit, false);
});

test("testing allows joins and gameplay, then resets sandbox progress at season start", async (context) => {
  const prisma = getPrismaOrSkip(context);

  if (!prisma) {
    return;
  }

  const cycle = await seedOpenCycle(
    prisma,
    new Date("2026-04-19T11:00:00.000Z")
  );
  const alpha = await createUser(prisma, "testing-alpha@example.com");
  const beta = await createUser(prisma, "testing-beta@example.com");
  const late = await createUser(prisma, "testing-late@example.com");

  await joinRegistrationCycle({
    db: prisma,
    userId: alpha.id,
    commanderName: "Testing Alpha",
    fortressName: "Alpha Sandbox",
    now: new Date("2026-04-19T11:05:00.000Z"),
  });
  await joinRegistrationCycle({
    db: prisma,
    userId: beta.id,
    commanderName: "Testing Beta",
    fortressName: "Beta Sandbox",
    now: new Date("2026-04-19T11:06:00.000Z"),
  });

  const testingStartsAt = addHours(cycle.registrationEndsAt, -24);
  await runGameTick({
    db: prisma,
    now: testingStartsAt,
  });

  await joinRegistrationCycle({
    db: prisma,
    userId: late.id,
    commanderName: "Late Tester",
    fortressName: "Late Sandbox",
    now: addMinutes(testingStartsAt, 2),
  });
  await selectFortressRace({
    db: prisma,
    userId: alpha.id,
    race: "DWARFS",
    now: addMinutes(testingStartsAt, 3),
  });
  await updateWorkerAssignment({
    db: prisma,
    userId: alpha.id,
    minersAssigned: 20,
    farmersAssigned: 5,
    recruitersAssigned: 0,
    now: addMinutes(testingStartsAt, 4),
  });

  const alphaBeforeReset = await prisma.fortress.findUniqueOrThrow({
    where: {
      cycleId_ownerId: {
        cycleId: cycle.id,
        ownerId: alpha.id,
      },
    },
  });
  const betaBeforeReset = await prisma.fortress.findUniqueOrThrow({
    where: {
      cycleId_ownerId: {
        cycleId: cycle.id,
        ownerId: beta.id,
      },
    },
  });

  await prisma.cycle.update({
    where: {
      id: cycle.id,
    },
    data: {
      upgradesUnlockedAt: addMinutes(testingStartsAt, 4),
      crownedFortressId: alphaBeforeReset.id,
      megaFortressDestroyCount: 2,
    },
  });
  await prisma.fortress.update({
    where: {
      id: alphaBeforeReset.id,
    },
    data: {
      points: 123,
      food: 45,
      army: 30,
      level: 3,
      locationShuffleCount: 2,
    },
  });
  await prisma.scoreEvent.create({
    data: {
      cycleId: cycle.id,
      fortressId: alphaBeforeReset.id,
      actorId: alpha.id,
      eventType: ScoreEventType.GROW_TICK,
      delta: 123,
      createdAt: addMinutes(testingStartsAt, 5),
    },
  });
  await prisma.gameTick.create({
    data: {
      cycleId: cycle.id,
      tickAt: addMinutes(testingStartsAt, 5),
    },
  });
  await prisma.attackUnit.create({
    data: {
      cycleId: cycle.id,
      attackerFortressId: alphaBeforeReset.id,
      targetFortressId: betaBeforeReset.id,
      armyAmount: 5,
      launchedAt: addMinutes(testingStartsAt, 5),
      arrivesAt: addMinutes(testingStartsAt, 6),
    },
  });

  const summary = await runGameTick({
    db: prisma,
    now: cycle.registrationEndsAt,
  });
  const activeCycle = await prisma.cycle.findUniqueOrThrow({
    where: {
      id: cycle.id,
    },
  });
  const alphaAfterReset = await prisma.fortress.findUniqueOrThrow({
    where: {
      cycleId_ownerId: {
        cycleId: cycle.id,
        ownerId: alpha.id,
      },
    },
  });
  const lateAfterReset = await prisma.fortress.findUniqueOrThrow({
    where: {
      cycleId_ownerId: {
        cycleId: cycle.id,
        ownerId: late.id,
      },
    },
  });

  assert.equal(summary.testingCyclesCompleted, 1);
  assert.equal(summary.activatedCycles, 1);
  assert.equal(activeCycle.status, CycleStatus.ACTIVE);
  assert.equal(activeCycle.activeStartedAt?.toISOString(), cycle.registrationEndsAt.toISOString());
  assert.equal(activeCycle.upgradesUnlockedAt, null);
  assert.equal(activeCycle.crownedFortressId, null);
  assert.equal(activeCycle.megaFortressDestroyCount, 0);
  assert.equal(alphaAfterReset.commanderName, "Testing Alpha");
  assert.equal(alphaAfterReset.name, "Alpha Sandbox");
  assert.equal(alphaAfterReset.mapX, alphaBeforeReset.mapX);
  assert.equal(alphaAfterReset.mapY, alphaBeforeReset.mapY);
  assert.equal(lateAfterReset.commanderName, "Late Tester");
  assert.equal(alphaAfterReset.race, null);
  assert.equal(alphaAfterReset.points, 0);
  assert.equal(alphaAfterReset.food, 0);
  assert.equal(alphaAfterReset.army, 0);
  assert.equal(alphaAfterReset.level, 0);
  assert.equal(alphaAfterReset.minersAssigned, 10);
  assert.equal(alphaAfterReset.farmersAssigned, 10);
  assert.equal(alphaAfterReset.recruitersAssigned, 5);
  assert.equal(alphaAfterReset.locationShuffleCount, 0);
  assert.equal(await prisma.attackUnit.count({ where: { cycleId: cycle.id } }), 0);
  assert.equal(await prisma.scoreEvent.count({ where: { cycleId: cycle.id } }), 0);
  assert.equal(await prisma.gameTick.count({ where: { cycleId: cycle.id } }), 0);
  assert.equal(
    await prisma.fortress.count({ where: { cycleId: cycle.id, isNpc: true } }),
    1
  );
});

test("non-empty registration transitions to active exactly once", async (context) => {
  const prisma = getPrismaOrSkip(context);

  if (!prisma) {
    return;
  }

  const cycle = await seedOpenCycle(prisma);
  const user = await createUser(prisma, "active@example.com");

  await joinRegistrationCycle({
    db: prisma,
    userId: user.id,
    fortressName: "Warmup",
  });

  const summary = await runGameTick({
    db: prisma,
    now: new Date("2026-04-20T12:00:00.000Z"),
  });
  const transitioned = await prisma.cycle.findUniqueOrThrow({
    where: {
      id: cycle.id,
    },
  });

  assert.equal(summary.activatedCycles, 1);
  assert.equal(transitioned.status, "ACTIVE");
  assert.equal(
    transitioned.activeStartedAt?.toISOString(),
    "2026-04-20T12:00:00.000Z"
  );
  assert.equal(
    transitioned.activeEndsAt?.toISOString(),
    "2026-04-23T12:00:00.000Z"
  );
});

test("activation creates one mega fortress without consuming player slots", async (context) => {
  const prisma = getPrismaOrSkip(context);

  if (!prisma) {
    return;
  }

  const cycle = await seedOpenCycle(prisma);

  for (let index = 0; index < ACTIVE_PLAYER_CAP; index += 1) {
    const user = await createUser(prisma, `mega-cap-${index}@example.com`);

    await joinRegistrationCycle({
      db: prisma,
      userId: user.id,
      fortressName: `Mega Cap ${index}`,
    });
  }

  await runGameTick({
    db: prisma,
    now: new Date("2026-04-20T12:00:00.000Z"),
  });

  const fortresses = await prisma.fortress.findMany({
    where: {
      cycleId: cycle.id,
    },
  });
  const megaFortresses = fortresses.filter((fortress) => fortress.isNpc);
  const playerFortresses = fortresses.filter((fortress) => !fortress.isNpc);

  assert.equal(playerFortresses.length, ACTIVE_PLAYER_CAP);
  assert.equal(megaFortresses.length, 1);
  assert.equal(megaFortresses[0]?.health, MEGA_FORTRESS_HEALTH);
  assert.equal(megaFortresses[0]?.maxHealth, MEGA_FORTRESS_HEALTH);
  assert.equal(megaFortresses[0]?.name, "Home of A");
  assert.equal(megaFortresses[0]?.sizeTiles, 4);
  assert.equal(megaFortresses[0]?.iconLabel, "A-");

  const state = await getHomePageState({
    userId: playerFortresses[0]?.ownerId,
    now: new Date("2026-04-20T12:01:00.000Z"),
    db: prisma,
  });

  assert.equal(state.cycle?.joinedCount, ACTIVE_PLAYER_CAP);
  assert.equal(state.cycle?.remainingSlots, 0);
  assert.equal(
    state.mapFortresses.filter((fortress) => fortress.isNpc).length,
    1
  );
  assert.equal(
    state.leaderboard.some((entry) => entry.id === megaFortresses[0]?.id),
    false
  );
  assert.equal(
    state.availableTargets.some(
      (target) => target.id === megaFortresses[0]?.id
    ),
    true
  );
});

test("old active map layouts reshuffle once on the next tick", async (context) => {
  const prisma = getPrismaOrSkip(context);

  if (!prisma) {
    return;
  }

  const cycle = await seedOpenCycle(prisma);
  const alpha = await createUser(prisma, "layout-alpha@example.com");
  const beta = await createUser(prisma, "layout-beta@example.com");

  await joinRegistrationCycle({
    db: prisma,
    userId: alpha.id,
    fortressName: "Layout Alpha",
  });
  await joinRegistrationCycle({
    db: prisma,
    userId: beta.id,
    fortressName: "Layout Beta",
  });
  await runGameTick({
    db: prisma,
    now: new Date("2026-04-20T12:00:00.000Z"),
  });

  await prisma.fortress.updateMany({
    where: {
      cycleId: cycle.id,
      ownerId: {
        in: [alpha.id, beta.id],
      },
    },
    data: {
      mapX: 10,
      mapY: 10,
    },
  });

  await prisma.cycle.update({
    where: {
      id: cycle.id,
    },
    data: {
      mapLayoutVersion: CURRENT_MAP_LAYOUT_VERSION - 1,
    },
  });

  const positionsBefore = await prisma.fortress.findMany({
    where: {
      cycleId: cycle.id,
    },
    orderBy: {
      id: "asc",
    },
    select: {
      id: true,
      mapX: true,
      mapY: true,
    },
  });

  await runGameTick({
    db: prisma,
    now: new Date("2026-04-20T12:01:00.000Z"),
  });

  const refreshedCycle = await prisma.cycle.findUniqueOrThrow({
    where: {
      id: cycle.id,
    },
  });
  const positionsAfterFirstTick = await prisma.fortress.findMany({
    where: {
      cycleId: cycle.id,
    },
    orderBy: {
      id: "asc",
    },
    select: {
      id: true,
      mapX: true,
      mapY: true,
    },
  });
  const uniquePositionKeys = new Set(
    positionsAfterFirstTick.map(
      (position) => getRenderedMapPositionKey(position)
    )
  );

  assert.equal(refreshedCycle.mapLayoutVersion, CURRENT_MAP_LAYOUT_VERSION);
  assert.notDeepEqual(positionsAfterFirstTick, positionsBefore);
  assert.equal(uniquePositionKeys.size, positionsAfterFirstTick.length);

  for (const position of positionsAfterFirstTick) {
    assert.ok(isPointNearSpawnHex({ x: position.mapX, y: position.mapY }));
  }

  await runGameTick({
    db: prisma,
    now: new Date("2026-04-20T12:01:00.000Z"),
  });

  const positionsAfterSecondTick = await prisma.fortress.findMany({
    where: {
      cycleId: cycle.id,
    },
    orderBy: {
      id: "asc",
    },
    select: {
      id: true,
      mapX: true,
      mapY: true,
    },
  });

  assert.deepEqual(positionsAfterSecondTick, positionsAfterFirstTick);
});

test("current active map layouts reshuffle when positions are duplicated", async (context) => {
  const prisma = getPrismaOrSkip(context);

  if (!prisma) {
    return;
  }

  const cycle = await seedOpenCycle(prisma);
  const alpha = await createUser(prisma, "duplicate-layout-alpha@example.com");
  const beta = await createUser(prisma, "duplicate-layout-beta@example.com");

  await joinRegistrationCycle({
    db: prisma,
    userId: alpha.id,
    fortressName: "Duplicate Layout Alpha",
  });
  await joinRegistrationCycle({
    db: prisma,
    userId: beta.id,
    fortressName: "Duplicate Layout Beta",
  });
  await runGameTick({
    db: prisma,
    now: new Date("2026-04-20T12:00:00.000Z"),
  });

  await prisma.fortress.updateMany({
    where: {
      cycleId: cycle.id,
      ownerId: {
        in: [alpha.id, beta.id],
      },
    },
    data: {
      mapX: 10,
      mapY: 10,
    },
  });

  await prisma.cycle.update({
    where: {
      id: cycle.id,
    },
    data: {
      mapLayoutVersion: CURRENT_MAP_LAYOUT_VERSION,
    },
  });

  await runGameTick({
    db: prisma,
    now: new Date("2026-04-20T12:01:00.000Z"),
  });

  const state = await getHomePageState({
    db: prisma,
    userId: alpha.id,
    now: new Date("2026-04-20T12:01:30.000Z"),
  });
  const positionsAfterTick = await prisma.fortress.findMany({
    where: {
      cycleId: cycle.id,
    },
    select: {
      mapX: true,
      mapY: true,
    },
  });
  const uniquePositionKeys = new Set(
    positionsAfterTick.map((position) => getRenderedMapPositionKey(position))
  );
  const renderedMarkerKeys = new Set(
    state.mapFortresses.map((fortress) => getRenderedMapPositionKey(fortress))
  );

  assert.equal(uniquePositionKeys.size, positionsAfterTick.length);
  assert.equal(renderedMarkerKeys.size, state.mapFortresses.length);
});

test("testing map layouts reshuffle when rendered positions are duplicated", async (context) => {
  const prisma = getPrismaOrSkip(context);

  if (!prisma) {
    return;
  }

  const cycle = await seedOpenCycle(
    prisma,
    new Date("2026-04-19T11:00:00.000Z")
  );
  const alpha = await createUser(prisma, "testing-layout-alpha@example.com");
  const beta = await createUser(prisma, "testing-layout-beta@example.com");

  await joinRegistrationCycle({
    db: prisma,
    userId: alpha.id,
    fortressName: "Testing Layout Alpha",
    now: new Date("2026-04-19T11:05:00.000Z"),
  });
  await joinRegistrationCycle({
    db: prisma,
    userId: beta.id,
    fortressName: "Testing Layout Beta",
    now: new Date("2026-04-19T11:06:00.000Z"),
  });

  const testingStartsAt = addHours(cycle.registrationEndsAt, -24);

  await runGameTick({
    db: prisma,
    now: testingStartsAt,
  });
  await prisma.fortress.updateMany({
    where: {
      cycleId: cycle.id,
      ownerId: {
        in: [alpha.id, beta.id],
      },
    },
    data: {
      mapX: 10,
      mapY: 10,
    },
  });
  await prisma.cycle.update({
    where: {
      id: cycle.id,
    },
    data: {
      mapLayoutVersion: CURRENT_MAP_LAYOUT_VERSION,
    },
  });

  await runGameTick({
    db: prisma,
    now: addMinutes(testingStartsAt, 1),
  });

  const positionsAfterTick = await prisma.fortress.findMany({
    where: {
      cycleId: cycle.id,
    },
    select: {
      mapX: true,
      mapY: true,
    },
  });
  const uniquePositionKeys = new Set(
    positionsAfterTick.map((position) => getRenderedMapPositionKey(position))
  );

  assert.equal(uniquePositionKeys.size, positionsAfterTick.length);
});

test("action updates persist and self-targeting is rejected", async (context) => {
  const prisma = getPrismaOrSkip(context);

  if (!prisma) {
    return;
  }

  const cycle = await seedOpenCycle(prisma);
  const alpha = await createUser(prisma, "attacker@example.com");
  const beta = await createUser(prisma, "target@example.com");

  await joinRegistrationCycle({
    db: prisma,
    userId: alpha.id,
    fortressName: "Alpha",
  });
  await joinRegistrationCycle({
    db: prisma,
    userId: beta.id,
    fortressName: "Beta",
  });

  await runGameTick({
    db: prisma,
    now: new Date("2026-04-20T12:00:00.000Z"),
  });

  const alphaFortress = await prisma.fortress.findUniqueOrThrow({
    where: {
      cycleId_ownerId: {
        cycleId: cycle.id,
        ownerId: alpha.id,
      },
    },
  });
  const betaFortress = await prisma.fortress.findUniqueOrThrow({
    where: {
      cycleId_ownerId: {
        cycleId: cycle.id,
        ownerId: beta.id,
      },
    },
  });

  await prisma.fortress.update({
    where: {
      id: alphaFortress.id,
    },
    data: {
      army: 6,
      race: FortressRace.DWARFS,
    },
  });

  await assert.rejects(
    () =>
      setFortressAction({
        db: prisma,
        userId: alpha.id,
        action: FortressAction.ATTACK,
        targetFortressId: betaFortress.id,
        sentArmy: 0,
        now: new Date("2026-04-20T12:05:00.000Z"),
      }),
    /at least 1 army/
  );

  await assert.rejects(
    () =>
      setFortressAction({
        db: prisma,
        userId: alpha.id,
        action: FortressAction.ATTACK,
        targetFortressId: betaFortress.id,
        sentArmy: -2,
        now: new Date("2026-04-20T12:05:00.000Z"),
      }),
    /at least 1 army/
  );

  await assert.rejects(
    () =>
      setFortressAction({
        db: prisma,
        userId: alpha.id,
        action: FortressAction.ATTACK,
        targetFortressId: betaFortress.id,
        sentArmy: 7,
        now: new Date("2026-04-20T12:05:00.000Z"),
      }),
    /enough army/
  );

  await setFortressAction({
    db: prisma,
    userId: alpha.id,
    action: FortressAction.ATTACK,
    targetFortressId: betaFortress.id,
    sentArmy: 5,
    now: new Date("2026-04-20T12:05:00.000Z"),
  });

  await assert.rejects(
    () =>
      setFortressAction({
        db: prisma,
        userId: alpha.id,
        action: FortressAction.ATTACK,
        targetFortressId: alphaFortress.id,
        sentArmy: 1,
        now: new Date("2026-04-20T12:05:00.000Z"),
      }),
    /cannot target itself/
  );

  const refreshedFortress = await prisma.fortress.findUniqueOrThrow({
    where: {
      id: alphaFortress.id,
    },
  });

  assert.equal(refreshedFortress.currentAction, FortressAction.GROW);
  assert.equal(refreshedFortress.targetFortressId, null);
  assert.equal(refreshedFortress.army, 1);

  const activeAttackUnit = await prisma.attackUnit.findFirst({
    where: {
      attackerFortressId: alphaFortress.id,
      targetFortressId: betaFortress.id,
      resolvedAt: null,
      cancelledAt: null,
    },
    select: {
      armyAmount: true,
    },
  });

  assert.ok(activeAttackUnit);
  assert.equal(activeAttackUnit?.armyAmount, 5);
});

test("resolved battle reports are exposed to involved players", async (context) => {
  const prisma = getPrismaOrSkip(context);

  if (!prisma) {
    return;
  }

  const cycle = await seedOpenCycle(prisma);
  const attacker = await createUser(prisma, "report-attacker@example.com");
  const defender = await createUser(prisma, "report-defender@example.com");

  await joinRegistrationCycle({
    db: prisma,
    userId: attacker.id,
    fortressName: "Report Attacker",
  });
  await joinRegistrationCycle({
    db: prisma,
    userId: defender.id,
    fortressName: "Report Defender",
  });
  await runGameTick({
    db: prisma,
    now: new Date("2026-04-20T12:00:00.000Z"),
  });

  const attackerFortress = await prisma.fortress.findUniqueOrThrow({
    where: {
      cycleId_ownerId: {
        cycleId: cycle.id,
        ownerId: attacker.id,
      },
    },
  });
  const defenderFortress = await prisma.fortress.findUniqueOrThrow({
    where: {
      cycleId_ownerId: {
        cycleId: cycle.id,
        ownerId: defender.id,
      },
    },
  });

  await prisma.fortress.update({
    where: {
      id: attackerFortress.id,
    },
    data: {
      army: 20,
      race: FortressRace.DWARFS,
      mapX: 10,
      mapY: 10,
    },
  });
  await prisma.fortress.update({
    where: {
      id: defenderFortress.id,
    },
    data: {
      army: 1,
      points: 20,
      food: 20,
      mapX: 90,
      mapY: 90,
    },
  });

  await setFortressAction({
    db: prisma,
    userId: attacker.id,
    action: FortressAction.ATTACK,
    targetFortressId: defenderFortress.id,
    sentArmy: 10,
    now: new Date("2026-04-20T12:05:00.000Z"),
  });

  const launch = await prisma.attackUnit.findFirstOrThrow({
    where: {
      attackerFortressId: attackerFortress.id,
      targetFortressId: defenderFortress.id,
      cancelledAt: null,
    },
    orderBy: {
      launchedAt: "desc",
    },
  });

  await runGameTick({
    db: prisma,
    now: launch.arrivesAt,
  });

  const attackerState = await getHomePageState({
    db: prisma,
    userId: attacker.id,
    now: new Date(launch.arrivesAt.getTime() + 60_000),
  });
  const defenderState = await getHomePageState({
    db: prisma,
    userId: defender.id,
    now: new Date(launch.arrivesAt.getTime() + 60_000),
  });

  assert.equal(attackerState.battleReports.length, 1);
  assert.equal(defenderState.battleReports.length, 1);
  assert.match(attackerState.battleReports[0]?.reportLines[0] ?? "", /Raid victory!/);
  assert.match(attackerState.battleReports[0]?.reportLines[2] ?? "", /returned/);
  assert.match(attackerState.battleReports[0]?.reportLines[3] ?? "", /Loot gained:/);
  assert.match(defenderState.battleReports[0]?.reportLines[2] ?? "", /Defender lost/);
});

test("attack launching is rejected outside ACTIVE cycle", async (context) => {
  const prisma = getPrismaOrSkip(context);

  if (!prisma) {
    return;
  }

  const cycle = await seedOpenCycle(prisma);
  const attacker = await createUser(prisma, "inactive-attacker@example.com");
  const target = await createUser(prisma, "inactive-target@example.com");

  await joinRegistrationCycle({
    db: prisma,
    userId: attacker.id,
    commanderName: "Inactive Attacker",
    fortressName: "Inactive Keep",
  });
  await joinRegistrationCycle({
    db: prisma,
    userId: target.id,
    commanderName: "Inactive Target",
    fortressName: "Target Keep",
  });

  const targetFortress = await prisma.fortress.findUniqueOrThrow({
    where: {
      cycleId_ownerId: {
        cycleId: cycle.id,
        ownerId: target.id,
      },
    },
  });

  await assert.rejects(
    () =>
      setFortressAction({
        db: prisma,
        userId: attacker.id,
        action: FortressAction.ATTACK,
        targetFortressId: targetFortress.id,
        sentArmy: 1,
        now: new Date("2026-04-20T12:04:00.000Z"),
      }),
    /not accepting active actions/
  );
});

test("joining assigns a stable valid unit sprite variant", async (context) => {
  const prisma = getPrismaOrSkip(context);

  if (!prisma) {
    return;
  }

  const cycle = await seedOpenCycle(prisma);
  const player = await createUser(prisma, "sprite-player@example.com");

  await joinRegistrationCycle({
    db: prisma,
    userId: player.id,
    fortressName: "Sprite Keep",
  });

  const fortress = await prisma.fortress.findUniqueOrThrow({
    where: {
      cycleId_ownerId: {
        cycleId: cycle.id,
        ownerId: player.id,
      },
    },
  });

  assert.ok(UNIT_SPRITE_VARIANTS.includes(fortress.unitSpriteVariant as never));
});

test("active rename costs 10 points and rejects insufficient points or duplicate names", async (context) => {
  const prisma = getPrismaOrSkip(context);

  if (!prisma) {
    return;
  }

  const cycle = await seedOpenCycle(prisma);
  const alpha = await createUser(prisma, "rename-alpha@example.com");
  const beta = await createUser(prisma, "rename-beta@example.com");

  await joinRegistrationCycle({
    db: prisma,
    userId: alpha.id,
    fortressName: "Alpha",
  });
  await joinRegistrationCycle({
    db: prisma,
    userId: beta.id,
    fortressName: "Beta",
  });
  await runGameTick({
    db: prisma,
    now: new Date("2026-04-20T12:00:00.000Z"),
  });

  await prisma.fortress.updateMany({
    where: {
      cycleId: cycle.id,
    },
    data: {
      points: 10,
    },
  });

  await renameActiveFortress({
    db: prisma,
    userId: alpha.id,
    fortressName: "Gamma",
    now: new Date("2026-04-20T12:02:00.000Z"),
  });

  await assert.rejects(
    () =>
      renameActiveFortress({
        db: prisma,
        userId: beta.id,
        fortressName: "Gamma",
        now: new Date("2026-04-20T12:02:00.000Z"),
      }),
    /already taken/
  );

  await prisma.fortress.update({
    where: {
      cycleId_ownerId: {
        cycleId: cycle.id,
        ownerId: beta.id,
      },
    },
    data: {
      points: 5,
    },
  });

  await assert.rejects(
    () =>
      renameActiveFortress({
        db: prisma,
        userId: beta.id,
        fortressName: "Delta",
        now: new Date("2026-04-20T12:02:00.000Z"),
      }),
    /at least 10 points/
  );

  const renamed = await prisma.fortress.findUniqueOrThrow({
    where: {
      cycleId_ownerId: {
        cycleId: cycle.id,
        ownerId: alpha.id,
      },
    },
  });

  assert.equal(renamed.name, "Gamma");
  assert.equal(renamed.points, 0);
});

test("worker assignment updates validate cycle, ownership, capacity, and derived population", async (context) => {
  const prisma = getPrismaOrSkip(context);

  if (!prisma) {
    return;
  }

  const cycle = await seedOpenCycle(prisma);
  const player = await createUser(prisma, "workers-player@example.com");
  const outsider = await createUser(prisma, "workers-outsider@example.com");

  await joinRegistrationCycle({
    db: prisma,
    userId: player.id,
    fortressName: "Worker Keep",
    now: new Date("2026-04-19T12:05:00.000Z"),
  });
  await runGameTick({
    db: prisma,
    now: new Date("2026-04-20T12:00:00.000Z"),
  });

  const activeFortress = await prisma.fortress.findUniqueOrThrow({
    where: {
      cycleId_ownerId: {
        cycleId: cycle.id,
        ownerId: player.id,
      },
    },
  });

  const updated = await updateWorkerAssignment({
    db: prisma,
    userId: player.id,
    minersAssigned: 20,
    farmersAssigned: 5,
    recruitersAssigned: 0,
    now: new Date("2026-04-20T12:05:00.000Z"),
  });

  assert.equal(updated.minersAssigned, 20);
  assert.equal(updated.farmersAssigned, 5);
  assert.equal(updated.recruitersAssigned, 0);

  await assert.rejects(
    () =>
      updateWorkerAssignment({
        db: prisma,
        userId: player.id,
        minersAssigned: -1,
        farmersAssigned: 0,
        recruitersAssigned: 0,
        now: new Date("2026-04-20T12:05:30.000Z"),
      }),
    /population/
  );

  await assert.rejects(
    () =>
      updateWorkerAssignment({
        db: prisma,
        userId: player.id,
        minersAssigned: 26,
        farmersAssigned: 0,
        recruitersAssigned: 0,
        now: new Date("2026-04-20T12:06:00.000Z"),
      }),
    /capacity|population/
  );

  await assert.rejects(
    () =>
      updateWorkerAssignment({
        db: prisma,
        userId: outsider.id,
        minersAssigned: 1,
        farmersAssigned: 1,
        recruitersAssigned: 1,
        now: new Date("2026-04-20T12:06:30.000Z"),
      }),
    /participating in the active cycle/
  );

  await prisma.fortress.update({
    where: {
      id: activeFortress.id,
    },
    data: {
      level: 1,
    },
  });

  const resized = await updateWorkerAssignment({
    db: prisma,
    userId: player.id,
    minersAssigned: 20,
    farmersAssigned: 10,
    recruitersAssigned: 5,
    now: new Date("2026-04-20T12:07:00.000Z"),
  });

  assert.equal(resized.level, 1);
  assert.equal(
    resized.minersAssigned + resized.farmersAssigned + resized.recruitersAssigned,
    35
  );
});

test("race selection is owner-only and locked once per season", async (context) => {
  const prisma = getPrismaOrSkip(context);

  if (!prisma) {
    return;
  }

  const cycle = await seedOpenCycle(prisma);
  const owner = await createUser(prisma, "race-owner@example.com");
  const outsider = await createUser(prisma, "race-outsider@example.com");

  await joinRegistrationCycle({
    db: prisma,
    userId: owner.id,
    fortressName: "Race Keep",
  });

  await assert.rejects(
    () =>
      selectFortressRace({
        db: prisma,
        userId: outsider.id,
        race: "DWARFS",
        now: new Date("2026-04-20T12:00:00.000Z"),
      }),
    /not participating/
  );

  await assert.rejects(
    () =>
      selectFortressRace({
        db: prisma,
        userId: owner.id,
        race: "ELVES",
        now: new Date("2026-04-20T12:00:00.000Z"),
      }),
    /valid race/
  );

  const selected = await selectFortressRace({
    db: prisma,
    userId: owner.id,
    race: "ORKS",
    now: new Date("2026-04-20T12:00:00.000Z"),
  });

  assert.equal(selected.race, "ORKS");

  await assert.rejects(
    () =>
      selectFortressRace({
        db: prisma,
        userId: owner.id,
        race: "SPACE_MURINES",
        now: new Date("2026-04-20T12:01:00.000Z"),
      }),
    /locked/
  );

  const fortress = await prisma.fortress.findUniqueOrThrow({
    where: {
      cycleId_ownerId: {
        cycleId: cycle.id,
        ownerId: owner.id,
      },
    },
  });

  assert.equal(fortress.race, "ORKS");
});

test("location shuffle is free once, then costs 50 points and cancels outgoing attacks", async (context) => {
  const prisma = getPrismaOrSkip(context);

  if (!prisma) {
    return;
  }

  const cycle = await seedOpenCycle(prisma);
  const attacker = await createUser(prisma, "shuffle-attacker@example.com");
  const target = await createUser(prisma, "shuffle-target@example.com");

  await joinRegistrationCycle({
    db: prisma,
    userId: attacker.id,
    fortressName: "Shuffle Alpha",
  });
  await joinRegistrationCycle({
    db: prisma,
    userId: target.id,
    fortressName: "Shuffle Beta",
  });
  await runGameTick({
    db: prisma,
    now: new Date("2026-04-20T12:00:00.000Z"),
  });

  const attackerFortress = await prisma.fortress.findUniqueOrThrow({
    where: {
      cycleId_ownerId: {
        cycleId: cycle.id,
        ownerId: attacker.id,
      },
    },
  });
  const targetFortress = await prisma.fortress.findUniqueOrThrow({
    where: {
      cycleId_ownerId: {
        cycleId: cycle.id,
        ownerId: target.id,
      },
    },
  });

  await prisma.fortress.update({
    where: {
      id: attackerFortress.id,
    },
    data: {
      points: 100,
      army: 1,
      race: FortressRace.DWARFS,
    },
  });

  await setFortressAction({
    db: prisma,
    userId: attacker.id,
    action: FortressAction.ATTACK,
    targetFortressId: targetFortress.id,
    now: new Date("2026-04-20T12:05:00.000Z"),
  });
  await setFortressAction({
    db: prisma,
    userId: attacker.id,
    action: FortressAction.GROW,
    now: new Date("2026-04-20T12:05:10.000Z"),
  });

  const beforeFreeShuffle = await prisma.fortress.findUniqueOrThrow({
    where: {
      id: attackerFortress.id,
    },
  });
  const freeShuffle = await shuffleFortressLocation({
    db: prisma,
    userId: attacker.id,
    now: new Date("2026-04-20T12:06:00.000Z"),
  });
  const afterFreeShuffle = await prisma.fortress.findUniqueOrThrow({
    where: {
      id: attackerFortress.id,
    },
  });
  const cancelledUnits = await prisma.attackUnit.findMany({
    where: {
      attackerFortressId: attackerFortress.id,
      cancelledAt: {
        not: null,
      },
    },
  });

  assert.equal(freeShuffle.shuffleCost, 0);
  assert.equal(freeShuffle.cancelledAttackUnitCount, 1);
  assert.equal(afterFreeShuffle.points, beforeFreeShuffle.points);
  assert.equal(
    await getFortressLocationShuffleCount(prisma, attackerFortress.id),
    1
  );
  assert.notDeepEqual(
    { x: afterFreeShuffle.mapX, y: afterFreeShuffle.mapY },
    { x: beforeFreeShuffle.mapX, y: beforeFreeShuffle.mapY }
  );
  assert.equal(cancelledUnits.length, 1);

  const secondShuffle = await shuffleFortressLocation({
    db: prisma,
    userId: attacker.id,
    now: new Date("2026-04-20T12:07:00.000Z"),
  });
  const afterSecondShuffle = await prisma.fortress.findUniqueOrThrow({
    where: {
      id: attackerFortress.id,
    },
  });
  const shuffleCostEvents = await prisma.scoreEvent.findMany({
    where: {
      cycleId: cycle.id,
      fortressId: attackerFortress.id,
      eventType: "FORTRESS_LOCATION_SHUFFLE_COST" as ScoreEventType,
    },
  });

  assert.equal(secondShuffle.shuffleCost, ACTIVE_LOCATION_SHUFFLE_COST);
  assert.equal(
    afterSecondShuffle.points,
    beforeFreeShuffle.points - ACTIVE_LOCATION_SHUFFLE_COST
  );
  assert.equal(
    await getFortressLocationShuffleCount(prisma, attackerFortress.id),
    2
  );
  assert.notDeepEqual(
    { x: afterSecondShuffle.mapX, y: afterSecondShuffle.mapY },
    { x: afterFreeShuffle.mapX, y: afterFreeShuffle.mapY }
  );
  assert.equal(shuffleCostEvents.length, 1);
  assert.equal(shuffleCostEvents[0]?.delta, -ACTIVE_LOCATION_SHUFFLE_COST);
});

test("location shuffle allows manual attacks in flight and rejects insufficient paid points", async (context) => {
  const prisma = getPrismaOrSkip(context);

  if (!prisma) {
    return;
  }

  const cycle = await seedOpenCycle(prisma);
  const attacker = await createUser(
    prisma,
    "shuffle-rule-attacker@example.com"
  );
  const target = await createUser(prisma, "shuffle-rule-target@example.com");

  await joinRegistrationCycle({
    db: prisma,
    userId: attacker.id,
    fortressName: "Rule Alpha",
  });
  await joinRegistrationCycle({
    db: prisma,
    userId: target.id,
    fortressName: "Rule Beta",
  });
  await runGameTick({
    db: prisma,
    now: new Date("2026-04-20T12:00:00.000Z"),
  });

  const targetFortress = await prisma.fortress.findUniqueOrThrow({
    where: {
      cycleId_ownerId: {
        cycleId: cycle.id,
        ownerId: target.id,
      },
    },
  });

  await prisma.fortress.update({
    where: {
      cycleId_ownerId: {
        cycleId: cycle.id,
        ownerId: attacker.id,
      },
    },
    data: {
      army: 1,
      race: FortressRace.DWARFS,
    },
  });

  await setFortressAction({
    db: prisma,
    userId: attacker.id,
    action: FortressAction.ATTACK,
    targetFortressId: targetFortress.id,
    now: new Date("2026-04-20T12:05:00.000Z"),
  });

  const freeShuffle = await shuffleFortressLocation({
    db: prisma,
    userId: attacker.id,
    now: new Date("2026-04-20T12:05:30.000Z"),
  });

  assert.equal(freeShuffle.shuffleCost, 0);
  assert.equal(freeShuffle.cancelledAttackUnitCount, 1);

  await prisma.fortress.update({
    where: {
      cycleId_ownerId: {
        cycleId: cycle.id,
        ownerId: attacker.id,
      },
    },
    data: {
      currentAction: FortressAction.GROW,
      targetFortressId: null,
      points: ACTIVE_LOCATION_SHUFFLE_COST - 1,
    },
  });
  await prisma.$executeRaw`
    UPDATE "Fortress"
    SET "locationShuffleCount" = 1
    WHERE "cycleId" = ${cycle.id} AND "ownerId" = ${attacker.id}
  `;

  await assert.rejects(
    () =>
      shuffleFortressLocation({
        db: prisma,
        userId: attacker.id,
        now: new Date("2026-04-20T12:06:00.000Z"),
      }),
    /at least 50 points/
  );
});

test("location shuffle prefers an inner-map position when one is available", async (context) => {
  const prisma = getPrismaOrSkip(context);

  if (!prisma) {
    return;
  }

  await seedOpenCycle(prisma);
  const alpha = await createUser(prisma, "shuffle-inner-alpha@example.com");
  const beta = await createUser(prisma, "shuffle-inner-beta@example.com");

  await joinRegistrationCycle({
    db: prisma,
    userId: alpha.id,
    fortressName: "Inner Alpha",
  });
  await joinRegistrationCycle({
    db: prisma,
    userId: beta.id,
    fortressName: "Inner Beta",
  });
  await runGameTick({
    db: prisma,
    now: new Date("2026-04-20T12:00:00.000Z"),
  });

  const shuffleResult = await shuffleFortressLocation({
    db: prisma,
    userId: alpha.id,
    now: new Date("2026-04-20T12:03:00.000Z"),
  });

  assert.ok(
    getEdgeDistance({
      x: shuffleResult.fortress.mapX,
      y: shuffleResult.fortress.mapY,
    }) >= ACTIVE_EDGE_PADDING
  );
});

test("castle upgrades reject locked, unaffordable, and max-level purchases", async (context) => {
  const prisma = getPrismaOrSkip(context);

  if (!prisma) {
    return;
  }

  const cycle = await seedOpenCycle(prisma);
  const user = await createUser(prisma, "upgrades@example.com");

  await joinRegistrationCycle({
    db: prisma,
    userId: user.id,
    fortressName: "Upgrade Keep",
  });
  await runGameTick({
    db: prisma,
    now: new Date("2026-04-20T12:00:00.000Z"),
  });

  await assert.rejects(
    () =>
      purchaseFortressUpgrade({
        db: prisma,
        userId: user.id,
        specialization: "POINTS",
        now: new Date("2026-04-20T12:03:00.000Z"),
      }),
    /unlock after Home of A has fallen/
  );

  await prisma.cycle.update({
    where: {
      id: cycle.id,
    },
    data: {
      upgradesUnlockedAt: new Date("2026-04-20T12:04:00.000Z"),
    },
  });

  await prisma.fortress.update({
    where: {
      cycleId_ownerId: {
        cycleId: cycle.id,
        ownerId: user.id,
      },
    },
    data: {
      points: 99,
    },
  });

  await assert.rejects(
    () =>
      purchaseFortressUpgrade({
        db: prisma,
        userId: user.id,
        specialization: "POINTS",
        now: new Date("2026-04-20T12:05:00.000Z"),
      }),
    /at least 100 points/
  );

  let fortress = await prisma.fortress.findUniqueOrThrow({
    where: {
      cycleId_ownerId: {
        cycleId: cycle.id,
        ownerId: user.id,
      },
    },
  });

  assert.equal(fortress.level, 0);
  assert.equal(fortress.points, 99);

  const unaffordableState = await getHomePageState({
    userId: user.id,
    now: new Date("2026-04-20T12:05:30.000Z"),
    db: prisma,
  });

  assert.equal(unaffordableState.playerSummary?.nextUpgradeCost, 100);
  assert.equal(unaffordableState.playerSummary?.canAffordUpgrade, false);
  assert.equal(unaffordableState.playerSummary?.canPurchaseUpgrade, false);

  await prisma.fortress.update({
    where: {
      id: fortress.id,
    },
    data: {
      points: FORTRESS_LEVEL_UP_COSTS.reduce((total, cost) => total + cost, 0),
    },
  });

  await purchaseFortressUpgrade({
    db: prisma,
    userId: user.id,
    specialization: "POINTS",
    now: new Date("2026-04-20T12:06:00.000Z"),
  });
  const afterFirstUpgradeState = await getHomePageState({
    userId: user.id,
    now: new Date("2026-04-20T12:06:30.000Z"),
    db: prisma,
  });
  const afterFirstUpgradeFortress = await prisma.fortress.findUniqueOrThrow({
    where: {
      cycleId_ownerId: {
        cycleId: cycle.id,
        ownerId: user.id,
      },
    },
  });
  const afterFirstUpgradeSummary =
    afterFirstUpgradeState.playerSummary ??
    (() => {
      throw new Error("Expected player summary after first upgrade.");
    })();

  assert.equal(afterFirstUpgradeFortress.level, 1);
  assert.equal(afterFirstUpgradeSummary.displayedCastleLevel, 2);
  assert.equal(afterFirstUpgradeSummary.population, 35);
  assert.equal(afterFirstUpgradeSummary.defenseMultiplier, 1.2);
  assert.equal(afterFirstUpgradeSummary.minersAssigned, 10);
  assert.equal(afterFirstUpgradeSummary.farmersAssigned, 10);
  assert.equal(afterFirstUpgradeSummary.recruitersAssigned, 5);
  assert.equal(
    afterFirstUpgradeSummary.minersAssigned +
      afterFirstUpgradeSummary.farmersAssigned +
      afterFirstUpgradeSummary.recruitersAssigned,
    25
  );
  assert.equal(
    afterFirstUpgradeSummary.population -
      afterFirstUpgradeSummary.minersAssigned -
      afterFirstUpgradeSummary.farmersAssigned -
      afterFirstUpgradeSummary.recruitersAssigned,
    10
  );
  for (let level = 1; level < MAX_FORTRESS_LEVEL; level += 1) {
    await purchaseFortressUpgrade({
      db: prisma,
      userId: user.id,
      specialization: "POINTS",
      now: new Date(
        `2026-04-20T12:${String(6 + level).padStart(2, "0")}:00.000Z`
      ),
    });
  }

  fortress = await prisma.fortress.findUniqueOrThrow({
    where: {
      id: fortress.id,
    },
  });

  const purchaseEvents = await prisma.scoreEvent.findMany({
    where: {
      cycleId: cycle.id,
      fortressId: fortress.id,
      eventType: ScoreEventType.FORTRESS_UPGRADE_PURCHASE,
    },
    orderBy: {
      createdAt: "asc",
    },
  });
  const state = await getHomePageState({
    userId: user.id,
    now: new Date("2026-04-20T12:09:30.000Z"),
    db: prisma,
  });

  assert.deepEqual(
    purchaseEvents.map((event) => event.delta),
    FORTRESS_LEVEL_UP_COSTS.map((cost) => -cost)
  );
  assert.equal(fortress.level, MAX_FORTRESS_LEVEL);
  assert.equal(fortress.points, 0);
  assert.equal(state.playerSummary?.level, MAX_FORTRESS_LEVEL);
  assert.equal(state.playerSummary?.displayedCastleLevel, 10);
  assert.equal(state.playerSummary?.nextUpgradeCost, null);
  assert.equal(state.playerSummary?.canPurchaseUpgrade, false);

  await assert.rejects(
    () =>
      purchaseFortressUpgrade({
        db: prisma,
        userId: user.id,
        specialization: "POINTS",
        now: new Date("2026-04-20T12:10:00.000Z"),
      }),
    /maximum level/
  );
});

test("tick processing is idempotent for the same minute", async (context) => {
  const prisma = getPrismaOrSkip(context);

  if (!prisma) {
    return;
  }

  const cycle = await seedOpenCycle(prisma);
  const user = await createUser(prisma, "grower@example.com");

  await joinRegistrationCycle({
    db: prisma,
    userId: user.id,
    fortressName: "Grower",
  });
  await runGameTick({
    db: prisma,
    now: new Date("2026-04-20T12:00:00.000Z"),
  });

  const firstRun = await runGameTick({
    db: prisma,
    now: new Date("2026-04-20T12:02:00.000Z"),
  });
  const secondRun = await runGameTick({
    db: prisma,
    now: new Date("2026-04-20T12:02:00.000Z"),
  });
  const fortress = await prisma.fortress.findUniqueOrThrow({
    where: {
      cycleId_ownerId: {
        cycleId: cycle.id,
        ownerId: user.id,
      },
    },
  });

  assert.equal(firstRun.processedMinutes, 2);
  assert.equal(secondRun.processedMinutes, 0);
  assert.equal(fortress.points, 2);
});

test("castle levels increase grow income and attack damage without changing cadence", async (context) => {
  const prisma = getPrismaOrSkip(context);

  if (!prisma) {
    return;
  }

  const cycle = await seedOpenCycle(prisma);
  const attacker = await createUser(prisma, "upgrade-attacker@example.com");
  const target = await createUser(prisma, "upgrade-target@example.com");

  await joinRegistrationCycle({
    db: prisma,
    userId: attacker.id,
    fortressName: "Upgrade Attacker",
  });
  await joinRegistrationCycle({
    db: prisma,
    userId: target.id,
    fortressName: "Upgrade Target",
  });
  await runGameTick({
    db: prisma,
    now: new Date("2026-04-20T12:00:00.000Z"),
  });

  const attackerFortress = await prisma.fortress.findUniqueOrThrow({
    where: {
      cycleId_ownerId: {
        cycleId: cycle.id,
        ownerId: attacker.id,
      },
    },
  });
  const targetFortress = await prisma.fortress.findUniqueOrThrow({
    where: {
      cycleId_ownerId: {
        cycleId: cycle.id,
        ownerId: target.id,
      },
    },
  });

  await prisma.cycle.update({
    where: {
      id: cycle.id,
    },
    data: {
      upgradesUnlockedAt: new Date("2026-04-20T12:01:00.000Z"),
    },
  });
  await prisma.fortress.update({
    where: {
      id: attackerFortress.id,
    },
    data: {
      level: 2,
      points: 0,
      food: 1,
      army: 20,
      minersAssigned: 10,
      farmersAssigned: 10,
      recruitersAssigned: 5,
      mapX: 6,
      mapY: 6,
    },
  });
  await prisma.fortress.update({
    where: {
      id: targetFortress.id,
    },
    data: {
      points: 10,
      food: 4,
      army: 4,
      currentAction: FortressAction.ATTACK,
      minersAssigned: 10,
      farmersAssigned: 10,
      recruitersAssigned: 5,
      mapX: 94,
      mapY: 95,
    },
  });

  await runGameTick({
    db: prisma,
    now: new Date("2026-04-20T12:01:00.000Z"),
  });

  const grownAttacker = await prisma.fortress.findUniqueOrThrow({
    where: {
      id: attackerFortress.id,
    },
    select: {
      points: true,
      food: true,
      army: true,
    },
  });

  assert.equal(grownAttacker.points, 10);
  assert.equal(grownAttacker.food, 6);
  assert.equal(grownAttacker.army, 25);

  await setFortressAction({
    db: prisma,
    userId: attacker.id,
    action: FortressAction.ATTACK,
    targetFortressId: targetFortress.id,
    now: new Date("2026-04-20T12:03:00.000Z"),
  });

  const attackUnit = await prisma.attackUnit.findFirstOrThrow({
    where: {
      attackerFortressId: attackerFortress.id,
      targetFortressId: targetFortress.id,
      resolvedAt: null,
      cancelledAt: null,
    },
    orderBy: {
      launchedAt: "asc",
    },
  });

  await runGameTick({
    db: prisma,
    now: attackUnit.arrivesAt,
  });

  const damagedTarget = await prisma.fortress.findUniqueOrThrow({
    where: {
      id: targetFortress.id,
    },
    select: {
      points: true,
      food: true,
      army: true,
    },
  });

  assert.equal(damagedTarget.points, 9);
  assert.equal(damagedTarget.food, 3);
  assert.equal(damagedTarget.army, 2);

  const updatedAttacker = await prisma.fortress.findUniqueOrThrow({
    where: {
      id: attackerFortress.id,
    },
    select: {
      points: true,
      food: true,
      army: true,
    },
  });

  assert.equal(updatedAttacker.points, 11);
  assert.equal(updatedAttacker.food, 7);
  assert.equal(updatedAttacker.army, 11);
});

test("worker assignments produce points, food, and army in the same tick", async (context) => {
  const prisma = getPrismaOrSkip(context);

  if (!prisma) {
    return;
  }

  const cycle = await seedOpenCycle(prisma);
  const defaultWorker = await createUser(prisma, "worker-default@example.com");
  const foodLimitedWorker = await createUser(
    prisma,
    "worker-food-limited@example.com"
  );
  const idleWorker = await createUser(prisma, "worker-idle@example.com");
  const minerLeader = await createUser(prisma, "worker-miner@example.com");

  for (const [userId, name] of [
    [defaultWorker.id, "Default Workers"],
    [foodLimitedWorker.id, "Food Limited"],
    [idleWorker.id, "Idle Fort"],
    [minerLeader.id, "Miner Leader"],
  ] as const) {
    await joinRegistrationCycle({
      db: prisma,
      userId,
      fortressName: name,
      now: new Date("2026-04-19T12:05:00.000Z"),
    });
  }

  await runGameTick({
    db: prisma,
    now: new Date("2026-04-20T12:00:00.000Z"),
  });

  const defaultFortress = await prisma.fortress.findUniqueOrThrow({
    where: {
      cycleId_ownerId: {
        cycleId: cycle.id,
        ownerId: defaultWorker.id,
      },
    },
  });
  const foodLimitedFortress = await prisma.fortress.findUniqueOrThrow({
    where: {
      cycleId_ownerId: {
        cycleId: cycle.id,
        ownerId: foodLimitedWorker.id,
      },
    },
  });
  const idleFortress = await prisma.fortress.findUniqueOrThrow({
    where: {
      cycleId_ownerId: {
        cycleId: cycle.id,
        ownerId: idleWorker.id,
      },
    },
  });
  const minerFortress = await prisma.fortress.findUniqueOrThrow({
    where: {
      cycleId_ownerId: {
        cycleId: cycle.id,
        ownerId: minerLeader.id,
      },
    },
  });

  await prisma.fortress.update({
    where: {
      id: defaultFortress.id,
    },
    data: {
      points: 0,
      food: 0,
      army: 0,
      minersAssigned: 10,
      farmersAssigned: 10,
      recruitersAssigned: 5,
    },
  });
  await prisma.fortress.update({
    where: {
      id: foodLimitedFortress.id,
    },
    data: {
      points: 0,
      food: 2,
      army: 0,
      minersAssigned: 0,
      farmersAssigned: 0,
      recruitersAssigned: 5,
    },
  });
  await prisma.fortress.update({
    where: {
      id: idleFortress.id,
    },
    data: {
      points: 0,
      food: 0,
      army: 0,
      minersAssigned: 0,
      farmersAssigned: 0,
      recruitersAssigned: 0,
    },
  });
  await prisma.fortress.update({
    where: {
      id: minerFortress.id,
    },
    data: {
      points: 0,
      food: 0,
      army: 0,
      minersAssigned: 25,
      farmersAssigned: 0,
      recruitersAssigned: 0,
    },
  });

  await runGameTick({
    db: prisma,
    now: new Date("2026-04-20T12:01:00.000Z"),
  });

  const refreshedDefault = await prisma.fortress.findUniqueOrThrow({
    where: {
      id: defaultFortress.id,
    },
    select: {
      points: true,
      food: true,
      army: true,
    },
  });
  const refreshedFoodLimited = await prisma.fortress.findUniqueOrThrow({
    where: {
      id: foodLimitedFortress.id,
    },
    select: {
      points: true,
      food: true,
      army: true,
    },
  });
  const refreshedIdle = await prisma.fortress.findUniqueOrThrow({
    where: {
      id: idleFortress.id,
    },
    select: {
      points: true,
      food: true,
      army: true,
    },
  });
  const refreshedMiner = await prisma.fortress.findUniqueOrThrow({
    where: {
      id: minerFortress.id,
    },
    select: {
      points: true,
      food: true,
      army: true,
    },
  });
  const minerState = await getHomePageState({
    db: prisma,
    userId: minerLeader.id,
    now: new Date("2026-04-20T12:02:00.000Z"),
  });

  assert.deepEqual(refreshedDefault, {
    points: 10,
    food: 5,
    army: 5,
  });
  assert.deepEqual(refreshedFoodLimited, {
    points: 0,
    food: 0,
    army: 2,
  });
  assert.deepEqual(refreshedIdle, {
    points: 0,
    food: 0,
    army: 0,
  });
  assert.deepEqual(refreshedMiner, {
    points: 25,
    food: 0,
    army: 0,
  });
  assert.equal(minerState.leaderboard[0]?.id, minerLeader.id);
});

test("manual attack units resolve without relaunching on the same tick", async (context) => {
  const prisma = getPrismaOrSkip(context);

  if (!prisma) {
    return;
  }

  const cycle = await seedOpenCycle(prisma);
  const attacker = await createUser(prisma, "lag-attacker@example.com");
  const target = await createUser(prisma, "lag-target@example.com");

  await joinRegistrationCycle({
    db: prisma,
    userId: attacker.id,
    fortressName: "Attacker",
  });
  await joinRegistrationCycle({
    db: prisma,
    userId: target.id,
    fortressName: "Target",
  });
  await runGameTick({
    db: prisma,
    now: new Date("2026-04-20T12:00:00.000Z"),
  });

  const attackerFortress = await prisma.fortress.findUniqueOrThrow({
    where: {
      cycleId_ownerId: {
        cycleId: cycle.id,
        ownerId: attacker.id,
      },
    },
  });
  const targetFortress = await prisma.fortress.findUniqueOrThrow({
    where: {
      cycleId_ownerId: {
        cycleId: cycle.id,
        ownerId: target.id,
      },
    },
  });

  await prisma.fortress.update({
    where: {
      id: attackerFortress.id,
    },
    data: {
      points: 3,
      army: 1,
      race: FortressRace.DWARFS,
    },
  });
  await prisma.fortress.update({
    where: {
      id: targetFortress.id,
    },
    data: {
      points: 1,
    },
  });

  const launchTime = new Date("2026-04-20T12:05:00.000Z");

  await setFortressAction({
    db: prisma,
    userId: attacker.id,
    action: FortressAction.ATTACK,
    targetFortressId: targetFortress.id,
    now: launchTime,
  });

  const launchedAttacker = await prisma.fortress.findUniqueOrThrow({
    where: {
      id: attackerFortress.id,
    },
  });
  const launchedTarget = await prisma.fortress.findUniqueOrThrow({
    where: {
      id: targetFortress.id,
    },
  });
  const attackUnit = await prisma.attackUnit.findFirstOrThrow({
    where: {
      attackerFortressId: attackerFortress.id,
      targetFortressId: targetFortress.id,
      cancelledAt: null,
    },
  });

  assert.equal(launchedAttacker.points, 3);
  assert.equal(launchedTarget.points, 1);
  assert.equal(
    attackUnit.arrivesAt.toISOString(),
    getAttackArrivalAt({
      launchedAt: launchTime,
      origin: attackerFortress,
      target: targetFortress,
    }).toISOString()
  );

  const beforeArrival = new Date(attackUnit.arrivesAt.getTime() - 60_000);

  await runGameTick({
    db: prisma,
    now: beforeArrival,
  });

  const beforeImpactTarget = await prisma.fortress.findUniqueOrThrow({
    where: {
      id: targetFortress.id,
    },
  });

  assert.ok(beforeImpactTarget.points >= 1);

  await runGameTick({
    db: prisma,
    now: attackUnit.arrivesAt,
  });

  const resolvedUnit = await prisma.attackUnit.findUniqueOrThrow({
    where: {
      id: attackUnit.id,
    },
  });
  const afterImpactTarget = await prisma.fortress.findUniqueOrThrow({
    where: {
      id: targetFortress.id,
    },
  });

  assert.equal(
    resolvedUnit.resolvedAt?.toISOString(),
    attackUnit.arrivesAt.toISOString()
  );
  assert.equal(afterImpactTarget.points, beforeImpactTarget.points - 1);
  assert.ok(afterImpactTarget.points >= 0);

  const sameTickOutbound = await prisma.attackUnit.findMany({
    where: {
      attackerFortressId: attackerFortress.id,
      resolvedAt: null,
      cancelledAt: null,
    },
  });

  assert.equal(sameTickOutbound.length, 0);

  await runGameTick({
    db: prisma,
    now: new Date(attackUnit.arrivesAt.getTime() + 60_000),
  });

  const nextOutbound = await prisma.attackUnit.findMany({
    where: {
      attackerFortressId: attackerFortress.id,
      resolvedAt: null,
      cancelledAt: null,
    },
  });

  assert.equal(nextOutbound.length, 0);
});

test("manual attack launches one unit and does not queue more while in transit", async (context) => {
  const prisma = getPrismaOrSkip(context);

  if (!prisma) {
    return;
  }

  const cycle = await seedOpenCycle(prisma);
  const attacker = await createUser(prisma, "queue-attacker@example.com");
  const target = await createUser(prisma, "queue-target@example.com");

  await joinRegistrationCycle({
    db: prisma,
    userId: attacker.id,
    fortressName: "Queue Attacker",
  });
  await joinRegistrationCycle({
    db: prisma,
    userId: target.id,
    fortressName: "Queue Target",
  });
  await runGameTick({
    db: prisma,
    now: new Date("2026-04-20T12:00:00.000Z"),
  });

  const attackerFortress = await prisma.fortress.findUniqueOrThrow({
    where: {
      cycleId_ownerId: {
        cycleId: cycle.id,
        ownerId: attacker.id,
      },
    },
  });
  const targetFortress = await prisma.fortress.findUniqueOrThrow({
    where: {
      cycleId_ownerId: {
        cycleId: cycle.id,
        ownerId: target.id,
      },
    },
  });

  await prisma.fortress.update({
    where: {
      id: attackerFortress.id,
    },
    data: {
      points: 8,
      army: 1,
      race: FortressRace.DWARFS,
      mapX: 6,
      mapY: 6,
    },
  });
  await prisma.fortress.update({
    where: {
      id: targetFortress.id,
    },
    data: {
      mapX: 94,
      mapY: 95,
    },
  });

  const launchTime = new Date("2026-04-20T12:05:00.000Z");

  await setFortressAction({
    db: prisma,
    userId: attacker.id,
    action: FortressAction.ATTACK,
    targetFortressId: targetFortress.id,
    now: launchTime,
  });

  const firstUnit = await prisma.attackUnit.findFirstOrThrow({
    where: {
      attackerFortressId: attackerFortress.id,
      cancelledAt: null,
    },
    orderBy: {
      launchedAt: "asc",
    },
  });
  const expectedArrival = getAttackArrivalAt({
    launchedAt: launchTime,
    origin: {
      ...attackerFortress,
      mapX: 6,
      mapY: 6,
    },
    target: {
      ...targetFortress,
      mapX: 94,
      mapY: 95,
    },
  });

  assert.equal(
    firstUnit.arrivesAt.toISOString(),
    expectedArrival.toISOString()
  );
  assert.ok(firstUnit.arrivesAt.getTime() - launchTime.getTime() >= 4 * 60_000);

  await runGameTick({
    db: prisma,
    now: new Date("2026-04-20T12:06:00.000Z"),
  });
  await runGameTick({
    db: prisma,
    now: new Date("2026-04-20T12:07:00.000Z"),
  });
  await runGameTick({
    db: prisma,
    now: new Date("2026-04-20T12:08:00.000Z"),
  });
  await runGameTick({
    db: prisma,
    now: new Date("2026-04-20T12:09:00.000Z"),
  });

  const unresolvedBeforeArrival = await prisma.attackUnit.findMany({
    where: {
      attackerFortressId: attackerFortress.id,
      resolvedAt: null,
      cancelledAt: null,
    },
    orderBy: {
      launchedAt: "asc",
    },
    select: {
      id: true,
      launchedAt: true,
      arrivesAt: true,
    },
  });

  assert.equal(unresolvedBeforeArrival.length, 1);
  assert.equal(
    unresolvedBeforeArrival[0]?.arrivesAt.toISOString(),
    firstUnit.arrivesAt.toISOString()
  );
  assert.ok(
    unresolvedBeforeArrival.every(
      (unit) => unit.launchedAt.getTime() < firstUnit.arrivesAt.getTime()
    )
  );

  const attackLaunchEvents = await prisma.scoreEvent.findMany({
    where: {
      cycleId: cycle.id,
      fortressId: attackerFortress.id,
      eventType: ScoreEventType.ATTACK_SELF,
    },
  });
  const attackerBeforeFirstArrival = await prisma.fortress.findUniqueOrThrow({
    where: {
      id: attackerFortress.id,
    },
  });

  assert.equal(attackLaunchEvents.length, 0);
  assert.equal(attackerBeforeFirstArrival.points, 8);

  await runGameTick({
    db: prisma,
    now: firstUnit.arrivesAt,
  });

  const unitsAfterFirstArrivalTick = await prisma.attackUnit.findMany({
    where: {
      attackerFortressId: attackerFortress.id,
      cancelledAt: null,
    },
    orderBy: {
      launchedAt: "asc",
    },
    select: {
      id: true,
      launchedAt: true,
      resolvedAt: true,
    },
  });
  const unresolvedAfterFirstArrivalTick = unitsAfterFirstArrivalTick.filter(
    (unit) => unit.resolvedAt === null
  );
  assert.equal(unresolvedAfterFirstArrivalTick.length, 0);

  const relaunchedUnits = await prisma.attackUnit.findMany({
    where: {
      attackerFortressId: attackerFortress.id,
      resolvedAt: null,
      cancelledAt: null,
    },
    orderBy: {
      launchedAt: "asc",
    },
  });

  assert.equal(relaunchedUnits.length, 0);
});

test("manual attacks do not recur on tick boundaries", async (context) => {
  const prisma = getPrismaOrSkip(context);

  if (!prisma) {
    return;
  }

  const cycle = await seedOpenCycle(prisma);
  const attacker = await createUser(prisma, "cadence-attacker@example.com");
  const target = await createUser(prisma, "cadence-target@example.com");

  await joinRegistrationCycle({
    db: prisma,
    userId: attacker.id,
    fortressName: "Cadence Attacker",
  });
  await joinRegistrationCycle({
    db: prisma,
    userId: target.id,
    fortressName: "Cadence Target",
  });
  await runGameTick({
    db: prisma,
    now: new Date("2026-04-20T12:00:00.000Z"),
  });

  const attackerFortress = await prisma.fortress.findUniqueOrThrow({
    where: {
      cycleId_ownerId: {
        cycleId: cycle.id,
        ownerId: attacker.id,
      },
    },
  });
  const targetFortress = await prisma.fortress.findUniqueOrThrow({
    where: {
      cycleId_ownerId: {
        cycleId: cycle.id,
        ownerId: target.id,
      },
    },
  });

  await prisma.fortress.update({
    where: {
      id: attackerFortress.id,
    },
    data: {
      army: 1,
      race: FortressRace.DWARFS,
      mapX: 6,
      mapY: 6,
    },
  });
  await prisma.fortress.update({
    where: {
      id: targetFortress.id,
    },
    data: {
      mapX: 94,
      mapY: 95,
    },
  });

  const launchTime = new Date("2026-04-20T12:05:30.000Z");

  await setFortressAction({
    db: prisma,
    userId: attacker.id,
    action: FortressAction.ATTACK,
    targetFortressId: targetFortress.id,
    now: launchTime,
  });

  await runGameTick({
    db: prisma,
    now: new Date("2026-04-20T12:06:00.000Z"),
  });

  const unitsAfterThirtySeconds = await prisma.attackUnit.findMany({
    where: {
      attackerFortressId: attackerFortress.id,
      cancelledAt: null,
    },
    orderBy: {
      launchedAt: "asc",
    },
    select: {
      launchedAt: true,
    },
  });

  assert.equal(unitsAfterThirtySeconds.length, 1);
  assert.equal(
    unitsAfterThirtySeconds[0]?.launchedAt.toISOString(),
    launchTime.toISOString()
  );

  await runGameTick({
    db: prisma,
    now: new Date("2026-04-20T12:07:00.000Z"),
  });

  const unitsAfterNinetySeconds = await prisma.attackUnit.findMany({
    where: {
      attackerFortressId: attackerFortress.id,
      cancelledAt: null,
    },
    orderBy: {
      launchedAt: "asc",
    },
    select: {
      launchedAt: true,
    },
  });

  assert.equal(unitsAfterNinetySeconds.length, 1);
});

test("manual attack commands can launch distinct one-time units in the same minute", async (context) => {
  const prisma = getPrismaOrSkip(context);

  if (!prisma) {
    return;
  }

  const cycle = await seedOpenCycle(prisma);
  const attacker = await createUser(
    prisma,
    "toggle-same-minute-attacker@example.com"
  );
  const target = await createUser(
    prisma,
    "toggle-same-minute-target@example.com"
  );

  await joinRegistrationCycle({
    db: prisma,
    userId: attacker.id,
    fortressName: "Toggle Attacker",
  });
  await joinRegistrationCycle({
    db: prisma,
    userId: target.id,
    fortressName: "Toggle Target",
  });
  await runGameTick({
    db: prisma,
    now: new Date("2026-04-20T12:00:00.000Z"),
  });

  const attackerFortress = await prisma.fortress.findUniqueOrThrow({
    where: {
      cycleId_ownerId: {
        cycleId: cycle.id,
        ownerId: attacker.id,
      },
    },
  });
  const targetFortress = await prisma.fortress.findUniqueOrThrow({
    where: {
      cycleId_ownerId: {
        cycleId: cycle.id,
        ownerId: target.id,
      },
    },
  });

  await prisma.fortress.update({
    where: {
      id: attackerFortress.id,
    },
    data: {
      army: 2,
      race: FortressRace.DWARFS,
    },
  });

  await setFortressAction({
    db: prisma,
    userId: attacker.id,
    action: FortressAction.ATTACK,
    targetFortressId: targetFortress.id,
    now: new Date("2026-04-20T12:05:10.000Z"),
  });
  await setFortressAction({
    db: prisma,
    userId: attacker.id,
    action: FortressAction.GROW,
    now: new Date("2026-04-20T12:05:20.000Z"),
  });
  await setFortressAction({
    db: prisma,
    userId: attacker.id,
    action: FortressAction.ATTACK,
    targetFortressId: targetFortress.id,
    now: new Date("2026-04-20T12:05:40.000Z"),
  });

  const units = await prisma.attackUnit.findMany({
    where: {
      attackerFortressId: attackerFortress.id,
      resolvedAt: null,
      cancelledAt: null,
    },
    orderBy: {
      launchedAt: "asc",
    },
    select: {
      launchedAt: true,
      targetFortressId: true,
    },
  });

  assert.equal(units.length, 2);
  assert.equal(units[0]?.launchedAt.toISOString(), "2026-04-20T12:05:10.000Z");
  assert.equal(units[0]?.targetFortressId, targetFortress.id);
  assert.equal(units[1]?.launchedAt.toISOString(), "2026-04-20T12:05:40.000Z");
  assert.equal(units[1]?.targetFortressId, targetFortress.id);
});

test("attack toggle can launch again after the next minute boundary", async (context) => {
  const prisma = getPrismaOrSkip(context);

  if (!prisma) {
    return;
  }

  const cycle = await seedOpenCycle(prisma);
  const attacker = await createUser(
    prisma,
    "toggle-next-minute-attacker@example.com"
  );
  const target = await createUser(
    prisma,
    "toggle-next-minute-target@example.com"
  );

  await joinRegistrationCycle({
    db: prisma,
    userId: attacker.id,
    fortressName: "Boundary Attacker",
  });
  await joinRegistrationCycle({
    db: prisma,
    userId: target.id,
    fortressName: "Boundary Target",
  });
  await runGameTick({
    db: prisma,
    now: new Date("2026-04-20T12:00:00.000Z"),
  });

  const attackerFortress = await prisma.fortress.findUniqueOrThrow({
    where: {
      cycleId_ownerId: {
        cycleId: cycle.id,
        ownerId: attacker.id,
      },
    },
  });
  const targetFortress = await prisma.fortress.findUniqueOrThrow({
    where: {
      cycleId_ownerId: {
        cycleId: cycle.id,
        ownerId: target.id,
      },
    },
  });

  await prisma.fortress.update({
    where: {
      id: attackerFortress.id,
    },
    data: {
      army: 2,
      race: FortressRace.DWARFS,
    },
  });

  await setFortressAction({
    db: prisma,
    userId: attacker.id,
    action: FortressAction.ATTACK,
    targetFortressId: targetFortress.id,
    now: new Date("2026-04-20T12:05:30.000Z"),
  });
  await setFortressAction({
    db: prisma,
    userId: attacker.id,
    action: FortressAction.GROW,
    now: new Date("2026-04-20T12:05:45.000Z"),
  });
  await setFortressAction({
    db: prisma,
    userId: attacker.id,
    action: FortressAction.ATTACK,
    targetFortressId: targetFortress.id,
    now: new Date("2026-04-20T12:06:00.000Z"),
  });

  const units = await prisma.attackUnit.findMany({
    where: {
      attackerFortressId: attackerFortress.id,
      resolvedAt: null,
      cancelledAt: null,
    },
    orderBy: {
      launchedAt: "asc",
    },
    select: {
      launchedAt: true,
      targetFortressId: true,
    },
  });

  assert.equal(units.length, 2);
  assert.equal(units[0]?.launchedAt.toISOString(), "2026-04-20T12:05:30.000Z");
  assert.equal(units[1]?.launchedAt.toISOString(), "2026-04-20T12:06:00.000Z");
  assert.ok(units.every((unit) => unit.targetFortressId === targetFortress.id));
});

test("manual attacks launch immediately without persisting an attack target", async (context) => {
  const prisma = getPrismaOrSkip(context);

  if (!prisma) {
    return;
  }

  const cycle = await seedOpenCycle(prisma);
  const attacker = await createUser(prisma, "map-flow-attacker@example.com");
  const firstTarget = await createUser(prisma, "map-flow-first@example.com");
  const secondTarget = await createUser(prisma, "map-flow-second@example.com");

  await joinRegistrationCycle({
    db: prisma,
    userId: attacker.id,
    fortressName: "Map Attacker",
  });
  await joinRegistrationCycle({
    db: prisma,
    userId: firstTarget.id,
    fortressName: "First Target",
  });
  await joinRegistrationCycle({
    db: prisma,
    userId: secondTarget.id,
    fortressName: "Second Target",
  });
  await runGameTick({
    db: prisma,
    now: new Date("2026-04-20T12:00:00.000Z"),
  });

  const firstTargetFortress = await prisma.fortress.findUniqueOrThrow({
    where: {
      cycleId_ownerId: {
        cycleId: cycle.id,
        ownerId: firstTarget.id,
      },
    },
  });
  const secondTargetFortress = await prisma.fortress.findUniqueOrThrow({
    where: {
      cycleId_ownerId: {
        cycleId: cycle.id,
        ownerId: secondTarget.id,
      },
    },
  });

  await prisma.fortress.update({
    where: {
      cycleId_ownerId: {
        cycleId: cycle.id,
        ownerId: attacker.id,
      },
    },
    data: {
      army: 2,
      race: FortressRace.DWARFS,
    },
  });

  await setFortressAction({
    db: prisma,
    userId: attacker.id,
    action: FortressAction.ATTACK,
    targetFortressId: firstTargetFortress.id,
    now: new Date("2026-04-20T12:05:00.000Z"),
  });
  await setFortressAction({
    db: prisma,
    userId: attacker.id,
    action: FortressAction.ATTACK,
    targetFortressId: secondTargetFortress.id,
    now: new Date("2026-04-20T12:05:10.000Z"),
  });

  const attackerFortress = await prisma.fortress.findUniqueOrThrow({
    where: {
      cycleId_ownerId: {
        cycleId: cycle.id,
        ownerId: attacker.id,
      },
    },
    select: {
      id: true,
      currentAction: true,
      targetFortressId: true,
    },
  });
  const launchedTargets = await prisma.attackUnit.findMany({
    where: {
      attackerFortressId: attackerFortress.id,
      cancelledAt: null,
    },
    orderBy: {
      launchedAt: "asc",
    },
    select: {
      targetFortressId: true,
    },
  });

  assert.equal(attackerFortress.currentAction, FortressAction.GROW);
  assert.equal(attackerFortress.targetFortressId, null);
  assert.deepEqual(
    launchedTargets.map((unit) => unit.targetFortressId),
    [firstTargetFortress.id, secondTargetFortress.id]
  );
});

test("first mega fortress destroy unlocks upgrades, grants a free level, and respawns stronger", async (context) => {
  const prisma = getPrismaOrSkip(context);

  if (!prisma) {
    return;
  }

  const cycle = await seedOpenCycle(prisma);
  const attacker = await createUser(prisma, "mega-attacker@example.com");

  await joinRegistrationCycle({
    db: prisma,
    userId: attacker.id,
    fortressName: "Alpha",
  });
  await runGameTick({
    db: prisma,
    now: new Date("2026-04-20T12:00:00.000Z"),
  });

  const attackerFortress = await prisma.fortress.findUniqueOrThrow({
    where: {
      cycleId_ownerId: {
        cycleId: cycle.id,
        ownerId: attacker.id,
      },
    },
  });
  const megaFortress = await prisma.fortress.findFirstOrThrow({
    where: {
      cycleId: cycle.id,
      isNpc: true,
    },
  });
  const positionsBefore = await prisma.fortress.findMany({
    where: {
      cycleId: cycle.id,
    },
    orderBy: {
      id: "asc",
    },
    select: {
      id: true,
      mapX: true,
      mapY: true,
    },
  });

  await prisma.fortress.update({
    where: {
      id: attackerFortress.id,
    },
    data: {
      points: 3,
      army: 2,
      race: FortressRace.DWARFS,
    },
  });
  await prisma.fortress.update({
    where: {
      id: megaFortress.id,
    },
    data: {
      health: 2,
    },
  });

  await setFortressAction({
    db: prisma,
    userId: attacker.id,
    action: FortressAction.ATTACK,
    targetFortressId: megaFortress.id,
    now: new Date("2026-04-20T12:05:00.000Z"),
  });

  const attackUnit = await prisma.attackUnit.findFirstOrThrow({
    where: {
      attackerFortressId: attackerFortress.id,
      targetFortressId: megaFortress.id,
      cancelledAt: null,
    },
  });

  await runGameTick({
    db: prisma,
    now: attackUnit.arrivesAt,
  });

  const refreshedCycle = await prisma.cycle.findUniqueOrThrow({
    where: {
      id: cycle.id,
    },
  });
  const refreshedAttacker = await prisma.fortress.findUniqueOrThrow({
    where: {
      id: attackerFortress.id,
    },
  });
  const refreshedMega = await prisma.fortress.findUniqueOrThrow({
    where: {
      id: megaFortress.id,
    },
  });
  const positionsAfter = await prisma.fortress.findMany({
    where: {
      cycleId: cycle.id,
    },
    orderBy: {
      id: "asc",
    },
    select: {
      id: true,
      mapX: true,
      mapY: true,
    },
  });
  const positionKeys = new Set(
    positionsAfter.map((position) => `${position.mapX}:${position.mapY}`)
  );
  const state = await getHomePageState({
    userId: attacker.id,
    now: new Date(attackUnit.arrivesAt.getTime() + 1_000),
    db: prisma,
  });
  const damageEvent = await prisma.scoreEvent.findFirst({
    where: {
      cycleId: cycle.id,
      eventType: ScoreEventType.MEGA_DAMAGE,
    },
  });
  const bonusEvent = await prisma.scoreEvent.findFirst({
    where: {
      cycleId: cycle.id,
      eventType: ScoreEventType.MEGA_DESTROY_BONUS,
    },
  });
  const freeUpgradeEvent = await prisma.scoreEvent.findFirst({
    where: {
      cycleId: cycle.id,
      eventType: ScoreEventType.FORTRESS_UPGRADE_SLAYER_BONUS,
    },
  });

  assert.equal(refreshedCycle.crownedFortressId, attackerFortress.id);
  assert.ok(refreshedCycle.upgradesUnlockedAt);
  assert.equal(refreshedCycle.megaFortressDestroyCount, 1);
  assert.equal(refreshedAttacker.points, 3 + MEGA_FORTRESS_DESTROY_BONUS + 10);
  assert.equal(refreshedAttacker.food, MEGA_FORTRESS_DESTROY_BONUS + 5);
  assert.equal(refreshedAttacker.level, 1);
  assert.equal(refreshedMega.health, MEGA_FORTRESS_HEALTH * 2);
  assert.equal(refreshedMega.maxHealth, MEGA_FORTRESS_HEALTH * 2);
  assert.equal(refreshedMega.points, 0);
  assert.equal(positionKeys.size, positionsAfter.length);
  assert.notDeepEqual(positionsAfter, positionsBefore);
  assert.ok(damageEvent);
  assert.ok(bonusEvent);
  assert.ok(freeUpgradeEvent);
  assert.equal(state.playerSummary?.level, 1);
  assert.equal(state.playerSummary?.nextUpgradeCost, 300);
  assert.equal(state.playerSummary?.receivedSlayerUpgrade, true);
  assert.equal(state.playerSummary?.isSlayerOfA, true);
  assert.equal(state.leaderboard[0]?.isSlayerOfA, true);
  assert.equal(
    state.leaderboard.some((entry) => entry.id === megaFortress.id),
    false
  );
});

test("mega fortress destroy credit goes to the unit that drops health to zero", async (context) => {
  const prisma = getPrismaOrSkip(context);

  if (!prisma) {
    return;
  }

  const cycle = await seedOpenCycle(prisma);
  const earlyUser = await createUser(prisma, "mega-early-arrival@example.com");
  const lateUser = await createUser(prisma, "mega-late-arrival@example.com");

  await joinRegistrationCycle({
    db: prisma,
    userId: earlyUser.id,
    commanderName: "Early Commander",
    fortressName: "Early Keep",
  });
  await joinRegistrationCycle({
    db: prisma,
    userId: lateUser.id,
    commanderName: "Late Commander",
    fortressName: "Late Keep",
  });
  await runGameTick({
    db: prisma,
    now: new Date("2026-04-20T12:00:00.000Z"),
  });

  const earlyFortress = await prisma.fortress.findUniqueOrThrow({
    where: {
      cycleId_ownerId: {
        cycleId: cycle.id,
        ownerId: earlyUser.id,
      },
    },
  });
  const lateFortress = await prisma.fortress.findUniqueOrThrow({
    where: {
      cycleId_ownerId: {
        cycleId: cycle.id,
        ownerId: lateUser.id,
      },
    },
  });
  const megaFortress = await prisma.fortress.findFirstOrThrow({
    where: {
      cycleId: cycle.id,
      isNpc: true,
    },
  });

  await prisma.fortress.update({
    where: {
      id: megaFortress.id,
    },
    data: {
      health: 2,
    },
  });
  await prisma.gameTick.create({
    data: {
      cycleId: cycle.id,
      tickAt: new Date("2026-04-20T12:06:00.000Z"),
    },
  });
  await prisma.attackUnit.createMany({
    data: [
      {
        cycleId: cycle.id,
        attackerFortressId: earlyFortress.id,
        targetFortressId: megaFortress.id,
        launchedAt: new Date("2026-04-20T12:05:00.000Z"),
        arrivesAt: new Date("2026-04-20T12:06:00.000Z"),
      },
      {
        cycleId: cycle.id,
        attackerFortressId: lateFortress.id,
        targetFortressId: megaFortress.id,
        launchedAt: new Date("2026-04-20T12:05:00.000Z"),
        arrivesAt: new Date("2026-04-20T12:07:00.000Z"),
      },
    ],
  });

  await runGameTick({
    db: prisma,
    now: new Date("2026-04-20T12:07:00.000Z"),
  });
  await forceEndCurrentCycle({
    db: prisma,
    now: new Date("2026-04-20T12:08:00.000Z"),
  });

  const refreshedCycle = await prisma.cycle.findUniqueOrThrow({
    where: {
      id: cycle.id,
    },
  });
  const earlyBonusEvent = await prisma.scoreEvent.findFirst({
    where: {
      cycleId: cycle.id,
      fortressId: earlyFortress.id,
      eventType: ScoreEventType.MEGA_DESTROY_BONUS,
    },
  });
  const lateBonusEvent = await prisma.scoreEvent.findFirst({
    where: {
      cycleId: cycle.id,
      fortressId: lateFortress.id,
      eventType: ScoreEventType.MEGA_DESTROY_BONUS,
    },
  });
  const damageEvents = await prisma.scoreEvent.findMany({
    where: {
      cycleId: cycle.id,
      targetFortressId: megaFortress.id,
      eventType: ScoreEventType.MEGA_DAMAGE,
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });
  const history = await prisma.cycleHistory.findUniqueOrThrow({
    where: {
      cycleId: cycle.id,
    },
  });

  assert.equal(refreshedCycle.crownedFortressId, lateFortress.id);
  assert.equal(earlyBonusEvent, null);
  assert.equal(lateBonusEvent?.delta, MEGA_FORTRESS_DESTROY_BONUS);
  assert.deepEqual(
    damageEvents.map((event) => event.actorId),
    [earlyUser.id, lateUser.id]
  );
  assert.equal(history.firstSlayerCommanderName, "Late Commander");
  assert.equal(history.firstSlayerFortressName, "Late Keep");
});
test("later mega fortress destroys scale reward and health without changing the first slayer or free upgrade count", async (context) => {
  const prisma = getPrismaOrSkip(context);

  if (!prisma) {
    return;
  }

  const cycle = await seedOpenCycle(prisma);
  const attacker = await createUser(prisma, "mega-repeat-attacker@example.com");

  await joinRegistrationCycle({
    db: prisma,
    userId: attacker.id,
    fortressName: "Repeat Alpha",
  });
  await runGameTick({
    db: prisma,
    now: new Date("2026-04-20T12:00:00.000Z"),
  });

  const attackerFortress = await prisma.fortress.findUniqueOrThrow({
    where: {
      cycleId_ownerId: {
        cycleId: cycle.id,
        ownerId: attacker.id,
      },
    },
  });
  const megaFortress = await prisma.fortress.findFirstOrThrow({
    where: {
      cycleId: cycle.id,
      isNpc: true,
    },
  });

  await prisma.fortress.update({
    where: {
      id: attackerFortress.id,
    },
    data: {
      points: 3,
      army: 2,
      race: FortressRace.DWARFS,
    },
  });
  await prisma.fortress.update({
    where: {
      id: megaFortress.id,
    },
    data: {
      health: 2,
    },
  });

  await setFortressAction({
    db: prisma,
    userId: attacker.id,
    action: FortressAction.ATTACK,
    targetFortressId: megaFortress.id,
    now: new Date("2026-04-20T12:05:00.000Z"),
  });

  const firstAttackUnit = await prisma.attackUnit.findFirstOrThrow({
    where: {
      attackerFortressId: attackerFortress.id,
      targetFortressId: megaFortress.id,
      cancelledAt: null,
    },
    orderBy: {
      launchedAt: "asc",
    },
  });

  await runGameTick({
    db: prisma,
    now: firstAttackUnit.arrivesAt,
  });

  await setFortressAction({
    db: prisma,
    userId: attacker.id,
    action: FortressAction.GROW,
    now: new Date("2026-04-20T12:06:00.000Z"),
  });
  await prisma.fortress.update({
    where: {
      id: attackerFortress.id,
    },
    data: {
      army: 2,
      mapX: 6,
      mapY: 6,
    },
  });
  await prisma.fortress.update({
    where: {
      id: megaFortress.id,
    },
    data: {
      mapX: 7,
      mapY: 6,
      health: 4,
      maxHealth: MEGA_FORTRESS_HEALTH * 2,
    },
  });

  const resourcesBeforeSecondKill = await prisma.fortress.findUniqueOrThrow({
    where: {
      id: attackerFortress.id,
    },
    select: {
      points: true,
      food: true,
    },
  });
  await setFortressAction({
    db: prisma,
    userId: attacker.id,
    action: FortressAction.ATTACK,
    targetFortressId: megaFortress.id,
    now: new Date("2026-04-20T12:06:00.000Z"),
  });

  const secondAttackUnit = await prisma.attackUnit.findFirstOrThrow({
    where: {
      attackerFortressId: attackerFortress.id,
      targetFortressId: megaFortress.id,
      launchedAt: {
        gte: new Date("2026-04-20T12:06:00.000Z"),
      },
      cancelledAt: null,
    },
    orderBy: {
      launchedAt: "asc",
    },
  });

  await runGameTick({
    db: prisma,
    now: secondAttackUnit.arrivesAt,
  });

  const refreshedCycle = await prisma.cycle.findUniqueOrThrow({
    where: {
      id: cycle.id,
    },
  });
  const refreshedAttacker = await prisma.fortress.findUniqueOrThrow({
    where: {
      id: attackerFortress.id,
    },
  });
  const refreshedMega = await prisma.fortress.findUniqueOrThrow({
    where: {
      id: megaFortress.id,
    },
  });
  const freeUpgradeEvents = await prisma.scoreEvent.findMany({
    where: {
      cycleId: cycle.id,
      fortressId: attackerFortress.id,
      eventType: ScoreEventType.FORTRESS_UPGRADE_SLAYER_BONUS,
    },
  });
  const destroyBonusEvents = await prisma.scoreEvent.findMany({
    where: {
      cycleId: cycle.id,
      fortressId: attackerFortress.id,
      eventType: ScoreEventType.MEGA_DESTROY_BONUS,
    },
    orderBy: {
      createdAt: "asc",
    },
  });

  assert.equal(refreshedCycle.megaFortressDestroyCount, 2);
  assert.equal(refreshedCycle.crownedFortressId, attackerFortress.id);
  assert.equal(freeUpgradeEvents.length, 1);
  assert.equal(refreshedAttacker.level, 1);
  assert.equal(refreshedAttacker.points, resourcesBeforeSecondKill.points + 1000 + 10);
  assert.equal(refreshedAttacker.food, resourcesBeforeSecondKill.food + 1000 + 5);
  assert.deepEqual(
    destroyBonusEvents.map((event) => event.delta),
    [500, 1000]
  );
  assert.equal(refreshedMega.health, MEGA_FORTRESS_HEALTH * 3);
  assert.equal(refreshedMega.maxHealth, MEGA_FORTRESS_HEALTH * 3);
});

test("resolved history stores the first slayer of A snapshot", async (context) => {
  const prisma = getPrismaOrSkip(context);

  if (!prisma) {
    return;
  }

  const cycle = await seedOpenCycle(prisma);
  const attacker = await createUser(prisma, "history-slayer@example.com");

  await joinRegistrationCycle({
    db: prisma,
    userId: attacker.id,
    commanderName: "Slayer Commander",
    fortressName: "Alpha",
  });
  await runGameTick({
    db: prisma,
    now: new Date("2026-04-20T12:00:00.000Z"),
  });

  const attackerFortress = await prisma.fortress.findUniqueOrThrow({
    where: {
      cycleId_ownerId: {
        cycleId: cycle.id,
        ownerId: attacker.id,
      },
    },
  });
  const megaFortress = await prisma.fortress.findFirstOrThrow({
    where: {
      cycleId: cycle.id,
      isNpc: true,
    },
  });

  await prisma.fortress.update({
    where: {
      id: attackerFortress.id,
    },
    data: {
      points: 3,
      army: 2,
      race: FortressRace.DWARFS,
    },
  });
  await prisma.fortress.update({
    where: {
      id: megaFortress.id,
    },
    data: {
      health: 2,
    },
  });

  await setFortressAction({
    db: prisma,
    userId: attacker.id,
    action: FortressAction.ATTACK,
    targetFortressId: megaFortress.id,
    now: new Date("2026-04-20T12:05:00.000Z"),
  });

  const attackUnit = await prisma.attackUnit.findFirstOrThrow({
    where: {
      attackerFortressId: attackerFortress.id,
      targetFortressId: megaFortress.id,
      cancelledAt: null,
    },
  });

  await runGameTick({
    db: prisma,
    now: attackUnit.arrivesAt,
  });
  await forceEndCurrentCycle({
    db: prisma,
    now: new Date("2026-04-20T12:08:00.000Z"),
  });

  const history = await prisma.cycleHistory.findUniqueOrThrow({
    where: {
      cycleId: cycle.id,
    },
  });
  const historyState = await getCycleHistoryPageState({
    userId: attacker.id,
    db: prisma,
  });
  const adminState = await getAdminDashboardState({
    db: prisma,
  });

  assert.equal(history.firstSlayerCommanderName, "Slayer Commander");
  assert.equal(history.firstSlayerFortressName, "Alpha");
  assert.equal(
    historyState.entries[0]?.firstSlayerCommanderName,
    "Slayer Commander"
  );
  assert.equal(historyState.entries[0]?.firstSlayerFortressName, "Alpha");
  assert.equal(
    adminState.recentHistory[0]?.firstSlayerCommanderName,
    "Slayer Commander"
  );
  assert.equal(adminState.recentHistory[0]?.firstSlayerFortressName, "Alpha");
});

test("manual grow command preserves in-flight attacks and launches no future attacks", async (context) => {
  const prisma = getPrismaOrSkip(context);

  if (!prisma) {
    return;
  }

  const cycle = await seedOpenCycle(prisma);
  const attacker = await createUser(prisma, "cancel-attacker@example.com");
  const target = await createUser(prisma, "cancel-target@example.com");

  await joinRegistrationCycle({
    db: prisma,
    userId: attacker.id,
    fortressName: "Attacker",
  });
  await joinRegistrationCycle({
    db: prisma,
    userId: target.id,
    fortressName: "Target",
  });
  await runGameTick({
    db: prisma,
    now: new Date("2026-04-20T12:00:00.000Z"),
  });

  const attackerFortress = await prisma.fortress.findUniqueOrThrow({
    where: {
      cycleId_ownerId: {
        cycleId: cycle.id,
        ownerId: attacker.id,
      },
    },
  });
  const targetFortress = await prisma.fortress.findUniqueOrThrow({
    where: {
      cycleId_ownerId: {
        cycleId: cycle.id,
        ownerId: target.id,
      },
    },
  });

  await prisma.fortress.update({
    where: {
      id: attackerFortress.id,
    },
    data: {
      points: 4,
      army: 1,
      race: FortressRace.DWARFS,
    },
  });

  await setFortressAction({
    db: prisma,
    userId: attacker.id,
    action: FortressAction.ATTACK,
    targetFortressId: targetFortress.id,
    now: new Date("2026-04-20T12:05:00.000Z"),
  });

  await setFortressAction({
    db: prisma,
    userId: attacker.id,
    action: FortressAction.GROW,
    now: new Date("2026-04-20T12:06:00.000Z"),
  });

  const preservedUnit = await prisma.attackUnit.findFirstOrThrow({
    where: {
      attackerFortressId: attackerFortress.id,
    },
  });
  const refreshedAttacker = await prisma.fortress.findUniqueOrThrow({
    where: {
      id: attackerFortress.id,
    },
  });

  assert.equal(refreshedAttacker.points, 4);
  assert.equal(refreshedAttacker.currentAction, FortressAction.GROW);
  assert.equal(preservedUnit.cancelledAt, null);

  await runGameTick({
    db: prisma,
    now: new Date("2026-04-20T12:07:00.000Z"),
  });

  const unresolvedAfterGrow = await prisma.attackUnit.findMany({
    where: {
      attackerFortressId: attackerFortress.id,
      resolvedAt: null,
      cancelledAt: null,
    },
  });

  assert.equal(unresolvedAfterGrow.length, 1);
});

test("manual retargeting launches one-time units at each chosen target", async (context) => {
  const prisma = getPrismaOrSkip(context);

  if (!prisma) {
    return;
  }

  const cycle = await seedOpenCycle(prisma);
  const attacker = await createUser(prisma, "retarget-attacker@example.com");
  const firstTarget = await createUser(prisma, "retarget-first@example.com");
  const secondTarget = await createUser(prisma, "retarget-second@example.com");

  await joinRegistrationCycle({
    db: prisma,
    userId: attacker.id,
    fortressName: "Attacker",
  });
  await joinRegistrationCycle({
    db: prisma,
    userId: firstTarget.id,
    fortressName: "First Target",
  });
  await joinRegistrationCycle({
    db: prisma,
    userId: secondTarget.id,
    fortressName: "Second Target",
  });
  await runGameTick({
    db: prisma,
    now: new Date("2026-04-20T12:00:00.000Z"),
  });

  const attackerFortress = await prisma.fortress.findUniqueOrThrow({
    where: {
      cycleId_ownerId: {
        cycleId: cycle.id,
        ownerId: attacker.id,
      },
    },
  });
  const firstTargetFortress = await prisma.fortress.findUniqueOrThrow({
    where: {
      cycleId_ownerId: {
        cycleId: cycle.id,
        ownerId: firstTarget.id,
      },
    },
  });
  const secondTargetFortress = await prisma.fortress.findUniqueOrThrow({
    where: {
      cycleId_ownerId: {
        cycleId: cycle.id,
        ownerId: secondTarget.id,
      },
    },
  });

  await prisma.fortress.update({
    where: {
      id: attackerFortress.id,
    },
    data: {
      army: 2,
      race: FortressRace.DWARFS,
      mapX: 6,
      mapY: 6,
    },
  });
  await prisma.fortress.update({
    where: {
      id: firstTargetFortress.id,
    },
    data: {
      mapX: 94,
      mapY: 95,
    },
  });
  await prisma.fortress.update({
    where: {
      id: secondTargetFortress.id,
    },
    data: {
      mapX: 84,
      mapY: 84,
    },
  });

  await setFortressAction({
    db: prisma,
    userId: attacker.id,
    action: FortressAction.ATTACK,
    targetFortressId: firstTargetFortress.id,
    now: new Date("2026-04-20T12:05:00.000Z"),
  });

  await runGameTick({
    db: prisma,
    now: new Date("2026-04-20T12:06:00.000Z"),
  });

  await setFortressAction({
    db: prisma,
    userId: attacker.id,
    action: FortressAction.ATTACK,
    targetFortressId: secondTargetFortress.id,
    now: new Date("2026-04-20T12:06:30.000Z"),
  });

  await runGameTick({
    db: prisma,
    now: new Date("2026-04-20T12:07:00.000Z"),
  });

  const unresolvedUnits = await prisma.attackUnit.findMany({
    where: {
      attackerFortressId: attackerFortress.id,
      resolvedAt: null,
      cancelledAt: null,
    },
    orderBy: {
      launchedAt: "asc",
    },
    select: {
      launchedAt: true,
      targetFortressId: true,
    },
  });

  assert.equal(unresolvedUnits.length, 2);
  assert.equal(unresolvedUnits[0]?.targetFortressId, firstTargetFortress.id);
  assert.equal(unresolvedUnits[1]?.targetFortressId, secondTargetFortress.id);
});

test("expired active cycle resolves a winner, writes history, and opens the next registration cycle", async (context) => {
  const prisma = getPrismaOrSkip(context);

  if (!prisma) {
    return;
  }

  const cycle = await seedOpenCycle(prisma);
  const alpha = await createUser(prisma, "winner-alpha@example.com");
  const beta = await createUser(prisma, "winner-beta@example.com");

  await joinRegistrationCycle({
    db: prisma,
    userId: alpha.id,
    fortressName: "Alpha",
  });
  await joinRegistrationCycle({
    db: prisma,
    userId: beta.id,
    fortressName: "Beta",
  });
  await runGameTick({
    db: prisma,
    now: new Date("2026-04-20T12:00:00.000Z"),
  });

  await prisma.cycle.update({
    where: {
      id: cycle.id,
    },
    data: {
      activeEndsAt: new Date("2026-04-20T12:02:00.000Z"),
    },
  });
  await prisma.fortress.update({
    where: {
      cycleId_ownerId: {
        cycleId: cycle.id,
        ownerId: alpha.id,
      },
    },
    data: {
      points: 5,
    },
  });
  await prisma.fortress.update({
    where: {
      cycleId_ownerId: {
        cycleId: cycle.id,
        ownerId: beta.id,
      },
    },
    data: {
      points: 3,
    },
  });

  const summary = await runGameTick({
    db: prisma,
    now: new Date("2026-04-20T12:02:00.000Z"),
  });
  const resolvedCycle = await prisma.cycle.findUniqueOrThrow({
    where: {
      id: cycle.id,
    },
  });
  const history = await prisma.cycleHistory.findUniqueOrThrow({
    where: {
      cycleId: cycle.id,
    },
  });
  const nextCycle = await prisma.cycle.findFirstOrThrow({
    where: {
      resolvedAt: null,
    },
    orderBy: {
      createdAt: "desc",
    },
  });

  assert.equal(summary.processedMinutes, 2);
  assert.equal(summary.resolvedCycles, 1);
  assert.equal(summary.nextRegistrationCyclesCreated, 1);
  assert.equal(resolvedCycle.status, "RESOLUTION");
  assert.equal(resolvedCycle.winnerId, alpha.id);
  assert.equal(
    resolvedCycle.resolvedAt?.toISOString(),
    "2026-04-20T12:02:00.000Z"
  );
  assert.equal(history.winnerId, alpha.id);
  assert.equal(history.winningScore, 7);
  assert.equal(history.firstSlayerCommanderName, null);
  assert.equal(history.firstSlayerFortressName, null);
  assert.match(history.tieBreakSummary ?? "", /Alpha/);
  assert.notEqual(nextCycle.id, cycle.id);
  assert.equal(nextCycle.status, "REGISTRATION");
  assert.equal(
    nextCycle.registrationStartedAt.toISOString(),
    "2026-04-20T12:02:00.000Z"
  );
});

test("winner tie-break picks the fortress that reached the final score first", async (context) => {
  const prisma = getPrismaOrSkip(context);

  if (!prisma) {
    return;
  }

  const cycle = await seedOpenCycle(prisma);
  const alpha = await createUser(prisma, "tie-alpha@example.com");
  const beta = await createUser(prisma, "tie-beta@example.com");

  await joinRegistrationCycle({
    db: prisma,
    userId: alpha.id,
    fortressName: "Alpha",
  });
  await joinRegistrationCycle({
    db: prisma,
    userId: beta.id,
    fortressName: "Beta",
  });
  await runGameTick({
    db: prisma,
    now: new Date("2026-04-20T12:00:00.000Z"),
  });

  const alphaFortress = await prisma.fortress.findUniqueOrThrow({
    where: {
      cycleId_ownerId: {
        cycleId: cycle.id,
        ownerId: alpha.id,
      },
    },
  });
  const betaFortress = await prisma.fortress.findUniqueOrThrow({
    where: {
      cycleId_ownerId: {
        cycleId: cycle.id,
        ownerId: beta.id,
      },
    },
  });

  await prisma.cycle.update({
    where: {
      id: cycle.id,
    },
    data: {
      activeEndsAt: new Date("2026-04-20T12:02:00.000Z"),
    },
  });
  await prisma.fortress.updateMany({
    where: {
      cycleId: cycle.id,
    },
    data: {
      points: 2,
    },
  });
  await prisma.gameTick.createMany({
    data: [
      {
        cycleId: cycle.id,
        tickAt: new Date("2026-04-20T12:01:00.000Z"),
      },
      {
        cycleId: cycle.id,
        tickAt: new Date("2026-04-20T12:02:00.000Z"),
      },
    ],
  });
  await prisma.scoreEvent.createMany({
    data: [
      {
        cycleId: cycle.id,
        fortressId: alphaFortress.id,
        actorId: alpha.id,
        eventType: ScoreEventType.MANUAL_ADJUST,
        delta: 2,
        createdAt: new Date("2026-04-20T12:01:00.000Z"),
      },
      {
        cycleId: cycle.id,
        fortressId: betaFortress.id,
        actorId: beta.id,
        eventType: ScoreEventType.MANUAL_ADJUST,
        delta: 1,
        createdAt: new Date("2026-04-20T12:01:00.000Z"),
      },
      {
        cycleId: cycle.id,
        fortressId: betaFortress.id,
        actorId: beta.id,
        eventType: ScoreEventType.MANUAL_ADJUST,
        delta: 1,
        createdAt: new Date("2026-04-20T12:02:00.000Z"),
      },
    ],
  });

  const summary = await runGameTick({
    db: prisma,
    now: new Date("2026-04-20T12:02:00.000Z"),
  });
  const resolvedCycle = await prisma.cycle.findUniqueOrThrow({
    where: {
      id: cycle.id,
    },
  });
  const history = await prisma.cycleHistory.findUniqueOrThrow({
    where: {
      cycleId: cycle.id,
    },
  });

  assert.equal(summary.processedMinutes, 0);
  assert.equal(summary.resolvedCycles, 1);
  assert.equal(resolvedCycle.winnerId, alpha.id);
  assert.match(history.tieBreakSummary ?? "", /earliest reach time/);
  assert.match(history.tieBreakSummary ?? "", /Alpha/);
  assert.match(history.tieBreakSummary ?? "", /Beta/);
});

test("resolved cycles are not resolved twice when the tick runner is re-run", async (context) => {
  const prisma = getPrismaOrSkip(context);

  if (!prisma) {
    return;
  }

  const cycle = await seedOpenCycle(prisma);
  const user = await createUser(prisma, "rerun-winner@example.com");

  await joinRegistrationCycle({
    db: prisma,
    userId: user.id,
    fortressName: "Solo",
  });
  await runGameTick({
    db: prisma,
    now: new Date("2026-04-20T12:00:00.000Z"),
  });

  const firstRun = await runGameTick({
    db: prisma,
    now: new Date("2026-04-23T12:05:00.000Z"),
  });
  const secondRun = await runGameTick({
    db: prisma,
    now: new Date("2026-04-23T12:05:00.000Z"),
  });
  const historyCount = await prisma.cycleHistory.count({
    where: {
      cycleId: cycle.id,
    },
  });

  assert.equal(firstRun.resolvedCycles, 1);
  assert.equal(secondRun.resolvedCycles, 0);
  assert.equal(historyCount, 1);
});

test("force end during registration advances the cycle through the normal tick flow", async (context) => {
  const prisma = getPrismaOrSkip(context);

  if (!prisma) {
    return;
  }

  const cycle = await seedOpenCycle(prisma);
  const user = await createUser(prisma, "force-registration@example.com");

  await joinRegistrationCycle({
    db: prisma,
    userId: user.id,
    fortressName: "Fast Start",
  });

  const summary = await forceEndCurrentCycle({
    db: prisma,
    now: new Date("2026-04-19T12:10:00.000Z"),
  });
  const updatedCycle = await prisma.cycle.findUniqueOrThrow({
    where: {
      id: cycle.id,
    },
  });

  assert.equal(summary?.activatedCycles, 1);
  assert.equal(updatedCycle.status, "ACTIVE");
  assert.equal(
    updatedCycle.registrationEndsAt.toISOString(),
    "2026-04-19T12:10:00.000Z"
  );
});

test("force end during active resolves immediately and opens the next cycle", async (context) => {
  const prisma = getPrismaOrSkip(context);

  if (!prisma) {
    return;
  }

  const cycle = await seedOpenCycle(prisma);
  const user = await createUser(prisma, "force-active@example.com");

  await joinRegistrationCycle({
    db: prisma,
    userId: user.id,
    fortressName: "Fast Finish",
  });
  await runGameTick({
    db: prisma,
    now: new Date("2026-04-20T12:00:00.000Z"),
  });

  const summary = await forceEndCurrentCycle({
    db: prisma,
    now: new Date("2026-04-20T12:03:00.000Z"),
  });
  const resolvedCycle = await prisma.cycle.findUniqueOrThrow({
    where: {
      id: cycle.id,
    },
  });
  const history = await prisma.cycleHistory.findUniqueOrThrow({
    where: {
      cycleId: cycle.id,
    },
  });
  const nextCycle = await prisma.cycle.findFirstOrThrow({
    where: {
      resolvedAt: null,
    },
    orderBy: {
      createdAt: "desc",
    },
  });

  assert.equal(summary?.resolvedCycles, 1);
  assert.equal(resolvedCycle.status, "RESOLUTION");
  assert.equal(history.cycleId, cycle.id);
  assert.notEqual(nextCycle.id, cycle.id);
  assert.equal(nextCycle.status, "REGISTRATION");
});

test("read model orders leaderboard by points then joined time then name", async (context) => {
  const prisma = getPrismaOrSkip(context);

  if (!prisma) {
    return;
  }

  const cycle = await seedOpenCycle(prisma);
  const alpha = await createUser(prisma, "leader-alpha@example.com");
  const beta = await createUser(prisma, "leader-beta@example.com");
  const gamma = await createUser(prisma, "leader-gamma@example.com");

  await joinRegistrationCycle({
    db: prisma,
    userId: alpha.id,
    fortressName: "Alpha",
  });
  await joinRegistrationCycle({
    db: prisma,
    userId: beta.id,
    fortressName: "Beta",
  });
  await joinRegistrationCycle({
    db: prisma,
    userId: gamma.id,
    fortressName: "Gamma",
  });

  const sharedJoinedAt = new Date("2026-04-19T12:10:00.000Z");

  await prisma.fortress.updateMany({
    where: {
      cycleId: cycle.id,
      ownerId: {
        in: [alpha.id, beta.id],
      },
    },
    data: {
      joinedAt: sharedJoinedAt,
      points: 10,
    },
  });
  await prisma.fortress.update({
    where: {
      cycleId_ownerId: {
        cycleId: cycle.id,
        ownerId: gamma.id,
      },
    },
    data: {
      points: 7,
    },
  });

  const state = await getHomePageState({
    userId: alpha.id,
    db: prisma,
  });

  assert.deepEqual(
    state.leaderboard.map((entry) => entry.name),
    ["Alpha", "Beta", "Gamma"]
  );
});

test("read model exposes location shuffle cost and outgoing warning state", async (context) => {
  const prisma = getPrismaOrSkip(context);

  if (!prisma) {
    return;
  }

  const cycle = await seedOpenCycle(prisma);
  const attacker = await createUser(
    prisma,
    "shuffle-read-attacker@example.com"
  );
  const target = await createUser(prisma, "shuffle-read-target@example.com");

  await joinRegistrationCycle({
    db: prisma,
    userId: attacker.id,
    fortressName: "Read Alpha",
  });
  await joinRegistrationCycle({
    db: prisma,
    userId: target.id,
    fortressName: "Read Beta",
  });
  await runGameTick({
    db: prisma,
    now: new Date("2026-04-20T12:00:00.000Z"),
  });

  const targetFortress = await prisma.fortress.findUniqueOrThrow({
    where: {
      cycleId_ownerId: {
        cycleId: cycle.id,
        ownerId: target.id,
      },
    },
  });

  await prisma.fortress.update({
    where: {
      cycleId_ownerId: {
        cycleId: cycle.id,
        ownerId: attacker.id,
      },
    },
    data: {
      army: 1,
      race: FortressRace.DWARFS,
    },
  });

  await setFortressAction({
    db: prisma,
    userId: attacker.id,
    action: FortressAction.ATTACK,
    targetFortressId: targetFortress.id,
    now: new Date("2026-04-20T12:05:00.000Z"),
  });
  await setFortressAction({
    db: prisma,
    userId: attacker.id,
    action: FortressAction.GROW,
    now: new Date("2026-04-20T12:05:10.000Z"),
  });

  const freeState = await getHomePageState({
    userId: attacker.id,
    db: prisma,
    now: new Date("2026-04-20T12:05:30.000Z"),
  });

  assert.equal(freeState.playerSummary?.locationShuffleCost, 0);
  assert.equal(freeState.playerSummary?.freeLocationShuffleAvailable, true);
  assert.equal(freeState.playerSummary?.hasOutgoingAttackUnits, true);
  assert.equal(freeState.playerSummary?.canShuffleLocation, true);

  await prisma.fortress.update({
    where: {
      cycleId_ownerId: {
        cycleId: cycle.id,
        ownerId: attacker.id,
      },
    },
    data: {
      points: ACTIVE_LOCATION_SHUFFLE_COST - 1,
      currentAction: FortressAction.GROW,
      targetFortressId: null,
    },
  });
  await prisma.$executeRaw`
    UPDATE "Fortress"
    SET "locationShuffleCount" = 1
    WHERE "cycleId" = ${cycle.id} AND "ownerId" = ${attacker.id}
  `;
  await prisma.attackUnit.updateMany({
    where: {
      cycleId: cycle.id,
      attackerFortressId: freeState.playerSummary?.id,
      resolvedAt: null,
      cancelledAt: null,
    },
    data: {
      cancelledAt: new Date("2026-04-20T12:05:40.000Z"),
    },
  });

  const paidState = await getHomePageState({
    userId: attacker.id,
    db: prisma,
    now: new Date("2026-04-20T12:06:00.000Z"),
  });

  assert.equal(
    paidState.playerSummary?.locationShuffleCost,
    ACTIVE_LOCATION_SHUFFLE_COST
  );
  assert.equal(paidState.playerSummary?.freeLocationShuffleAvailable, false);
  assert.equal(paidState.playerSummary?.hasOutgoingAttackUnits, false);
  assert.equal(paidState.playerSummary?.canShuffleLocation, false);
});

test("read model marks spectators and participants correctly", async (context) => {
  const prisma = getPrismaOrSkip(context);

  if (!prisma) {
    return;
  }

  await seedOpenCycle(prisma);
  const observer = await createUser(prisma, "observer@example.com");
  const participant = await createUser(prisma, "participant@example.com");

  await joinRegistrationCycle({
    db: prisma,
    userId: participant.id,
    fortressName: "Participant",
  });

  const signedOutState = await getHomePageState({
    db: prisma,
  });
  const observerState = await getHomePageState({
    userId: observer.id,
    db: prisma,
  });
  const participantState = await getHomePageState({
    userId: participant.id,
    db: prisma,
  });

  assert.equal(signedOutState.isSpectator, true);
  assert.equal(observerState.isSpectator, true);
  assert.equal(participantState.isSpectator, false);
});

test("read model reports healthy ACTIVE tick metadata", async (context) => {
  const prisma = getPrismaOrSkip(context);

  if (!prisma) {
    return;
  }

  await seedOpenCycle(prisma);
  await runGameTick({
    db: prisma,
    now: new Date("2026-04-20T12:00:00.000Z"),
  });

  const healthyState = await getHomePageState({
    db: prisma,
    now: new Date("2026-04-20T12:01:00.000Z"),
  });

  assert.equal(healthyState.phase?.status, CycleStatus.ACTIVE);
  assert.equal(
    healthyState.cycle?.lastProcessedTickAt?.toISOString(),
    "2026-04-20T12:00:00.000Z"
  );
  assert.equal(healthyState.cycle?.tickDelayMinutes, 1);
  assert.equal(healthyState.cycle?.tickHealth, "ok");
});

test("read model reports delayed ACTIVE tick metadata and hides it outside ACTIVE", async (context) => {
  const prisma = getPrismaOrSkip(context);

  if (!prisma) {
    return;
  }

  await seedOpenCycle(prisma);
  const registrationState = await getHomePageState({
    db: prisma,
    now: new Date("2026-04-19T12:10:00.000Z"),
  });

  assert.equal(registrationState.phase?.status, CycleStatus.REGISTRATION);
  assert.equal(registrationState.cycle?.lastProcessedTickAt, null);
  assert.equal(registrationState.cycle?.tickDelayMinutes, null);

  await runGameTick({
    db: prisma,
    now: new Date("2026-04-20T12:00:00.000Z"),
  });

  const laggingState = await getHomePageState({
    db: prisma,
    now: new Date("2026-04-20T12:02:00.000Z"),
  });

  assert.equal(laggingState.phase?.status, CycleStatus.ACTIVE);
  assert.equal(laggingState.cycle?.tickDelayMinutes, 2);
  assert.equal(laggingState.cycle?.tickHealth, "lagging");

  const delayedState = await getHomePageState({
    db: prisma,
    now: new Date("2026-04-20T12:05:00.000Z"),
  });

  assert.equal(delayedState.phase?.status, CycleStatus.ACTIVE);
  assert.equal(
    delayedState.cycle?.lastProcessedTickAt?.toISOString(),
    "2026-04-20T12:00:00.000Z"
  );
  assert.equal(delayedState.cycle?.tickDelayMinutes, 5);
  assert.equal(delayedState.cycle?.tickHealth, "stalled");
});

test("read model exposes only valid targetable fortresses during active play", async (context) => {
  const prisma = getPrismaOrSkip(context);

  if (!prisma) {
    return;
  }

  const cycle = await seedOpenCycle(prisma);
  const alpha = await createUser(prisma, "map-alpha@example.com");
  const beta = await createUser(prisma, "map-beta@example.com");

  await joinRegistrationCycle({
    db: prisma,
    userId: alpha.id,
    fortressName: "Alpha",
  });
  await joinRegistrationCycle({
    db: prisma,
    userId: beta.id,
    fortressName: "Beta",
  });
  await runGameTick({
    db: prisma,
    now: new Date("2026-04-20T12:00:00.000Z"),
  });

  const alphaFortress = await prisma.fortress.findUniqueOrThrow({
    where: {
      cycleId_ownerId: {
        cycleId: cycle.id,
        ownerId: alpha.id,
      },
    },
  });
  const betaFortress = await prisma.fortress.findUniqueOrThrow({
    where: {
      cycleId_ownerId: {
        cycleId: cycle.id,
        ownerId: beta.id,
      },
    },
  });

  await prisma.fortress.update({
    where: {
      id: alphaFortress.id,
    },
    data: {
      army: 1,
      race: FortressRace.DWARFS,
    },
  });

  await setFortressAction({
    db: prisma,
    userId: alpha.id,
    action: FortressAction.ATTACK,
    targetFortressId: betaFortress.id,
    now: new Date("2026-04-20T12:04:00.000Z"),
  });

  const state = await getHomePageState({
    userId: alpha.id,
    now: new Date("2026-04-20T12:05:00.000Z"),
    db: prisma,
  });

  const currentUserMarker = state.mapFortresses.find(
    (fortress) => fortress.id === alphaFortress.id
  );
  const targetableMarkers = state.mapFortresses.filter(
    (fortress) => fortress.isTargetable
  );

  assert.ok(currentUserMarker);
  assert.equal(currentUserMarker.isCurrentUser, true);
  assert.equal(currentUserMarker.isTargetable, false);
  assert.equal(targetableMarkers.length, 2);
  assert.equal(targetableMarkers[0]?.name, "Beta");
  assert.equal(state.availableTargets.length, 2);
  assert.equal(state.availableTargets[0]?.name, "Beta");
  assert.equal(
    state.availableTargets.some((target) => target.isNpc),
    true
  );
  assert.equal(state.attackUnits.length, 1);
  assert.equal(state.attackUnits[0]?.attacker.id, alphaFortress.id);
  assert.equal(state.attackUnits[0]?.target.id, betaFortress.id);
  assert.ok(
    UNIT_SPRITE_VARIANTS.includes(
      state.attackUnits[0]?.attacker.unitSpriteVariant as never
    )
  );
});

test("chat messages are visible to spectators in read-only mode", async (context) => {
  const prisma = getPrismaOrSkip(context);

  if (!prisma) {
    return;
  }

  await seedOpenCycle(prisma);
  const sender = await createUser(prisma, "chatter@example.com");

  await joinRegistrationCycle({
    db: prisma,
    userId: sender.id,
    commanderName: "Lobby Hawk",
    fortressName: "Signal Keep",
  });

  await sendChatMessage({
    db: prisma,
    userId: sender.id,
    body: "Season lobby is live.",
    now: new Date("2026-04-19T12:03:00.000Z"),
  });

  const signedOutState = await getHomePageState({
    db: prisma,
  });

  assert.equal(signedOutState.isSpectator, true);
  assert.equal(signedOutState.chat.canPost, false);
  assert.equal(signedOutState.chat.messages.length, 1);
  assert.equal(signedOutState.chat.messages[0]?.body, "Season lobby is live.");
  assert.equal(signedOutState.chat.messages[0]?.authorName, "Lobby Hawk");
  assert.equal(signedOutState.chat.unreadCount, 0);
  assert.equal(signedOutState.chat.hasUnread, false);
  assert.equal(signedOutState.chat.persistsUnread, false);
  assert.equal(
    signedOutState.chat.latestMessageAt?.toISOString(),
    "2026-04-19T12:03:00.000Z"
  );
});

test("chat sending is rate limited to six messages per minute", async (context) => {
  const prisma = getPrismaOrSkip(context);

  if (!prisma) {
    return;
  }

  await seedOpenCycle(prisma);
  const sender = await createUser(prisma, "limit@example.com");
  const now = new Date("2026-04-19T12:00:00.000Z");

  for (let index = 0; index < 6; index += 1) {
    await sendChatMessage({
      db: prisma,
      userId: sender.id,
      body: `Message ${index + 1}`,
      now: new Date(now.getTime() + index * 1000),
    });
  }

  await assert.rejects(
    () =>
      sendChatMessage({
        db: prisma,
        userId: sender.id,
        body: "Message 7",
        now: new Date(now.getTime() + 10_000),
      }),
    /6 messages per minute/
  );
});

test("chat GIF messages are persisted and returned in page state", async (context) => {
  const prisma = getPrismaOrSkip(context);

  if (!prisma) {
    return;
  }

  await seedOpenCycle(prisma);
  const sender = await createUser(prisma, "gif-sender@example.com");

  await joinRegistrationCycle({
    db: prisma,
    userId: sender.id,
    commanderName: "Signal GIF",
    fortressName: "Motion Keep",
  });

  await sendChatGifMessage({
    db: prisma,
    userId: sender.id,
    gif: {
      providerId: "abc123",
      title: "Victory dance",
      previewUrl: "https://media0.giphy.com/media/abc123/100.gif",
      displayUrl: "https://media0.giphy.com/media/abc123/200.gif",
      width: 320,
      height: 200,
      sourceUrl: "https://giphy.com/gifs/victory-dance-abc123",
    },
    now: new Date("2026-04-19T12:03:00.000Z"),
  });

  const storedMessage = await prisma.chatMessage.findFirstOrThrow({
    where: {
      authorId: sender.id,
    },
  });
  const state = await getHomePageState({
    db: prisma,
    userId: sender.id,
  });
  const message = state.chat.messages[0];

  assert.equal(storedMessage.type, ChatMessageType.GIF);
  assert.equal(storedMessage.gifProvider, "giphy");
  assert.equal(storedMessage.gifProviderId, "abc123");
  assert.equal(message?.type, ChatMessageType.GIF);
  assert.equal(message?.body, "Victory dance");
  assert.equal(message?.gif?.provider, "giphy");
  assert.equal(message?.gif?.providerId, "abc123");
  assert.equal(
    message?.gif?.displayUrl,
    "https://media0.giphy.com/media/abc123/200.gif"
  );
  assert.equal(message?.authorName, "Signal GIF");
});

test("chat GIF messages share the text message rate limit", async (context) => {
  const prisma = getPrismaOrSkip(context);

  if (!prisma) {
    return;
  }

  await seedOpenCycle(prisma);
  const sender = await createUser(prisma, "gif-limit@example.com");
  const now = new Date("2026-04-19T12:00:00.000Z");

  for (let index = 0; index < 5; index += 1) {
    await sendChatMessage({
      db: prisma,
      userId: sender.id,
      body: `Message ${index + 1}`,
      now: new Date(now.getTime() + index * 1000),
    });
  }

  await sendChatGifMessage({
    db: prisma,
    userId: sender.id,
    gif: {
      providerId: "limit123",
      title: "Limit reached",
      previewUrl: "https://media1.giphy.com/media/limit123/100.gif",
      displayUrl: "https://media1.giphy.com/media/limit123/200.gif",
      width: 320,
      height: 200,
      sourceUrl: "https://giphy.com/gifs/limit-reached-limit123",
    },
    now: new Date(now.getTime() + 5000),
  });

  await assert.rejects(
    () =>
      sendChatMessage({
        db: prisma,
        userId: sender.id,
        body: "Message 7",
        now: new Date(now.getTime() + 10_000),
      }),
    /6 messages per minute/
  );
});

test("chat GIF messages reject non-GIPHY media and missing ids", async (context) => {
  const prisma = getPrismaOrSkip(context);

  if (!prisma) {
    return;
  }

  await seedOpenCycle(prisma);
  const sender = await createUser(prisma, "gif-invalid@example.com");

  await assert.rejects(
    () =>
      sendChatGifMessage({
        db: prisma,
        userId: sender.id,
        gif: {
          providerId: "",
          title: "Missing id",
          previewUrl: "https://media0.giphy.com/media/missing/100.gif",
          displayUrl: "https://media0.giphy.com/media/missing/200.gif",
          width: 320,
          height: 200,
          sourceUrl: "https://giphy.com/gifs/missing",
        },
      }),
    /GIF id is required/
  );

  await assert.rejects(
    () =>
      sendChatGifMessage({
        db: prisma,
        userId: sender.id,
        gif: {
          providerId: "badhost",
          title: "Bad host",
          previewUrl: "https://example.com/bad.gif",
          displayUrl: "https://media0.giphy.com/media/badhost/200.gif",
          width: 320,
          height: 200,
          sourceUrl: "https://giphy.com/gifs/badhost",
        },
      }),
    /Only GIPHY media URLs/
  );
});

test("chat unread count includes only other users' messages", async (context) => {
  const prisma = getPrismaOrSkip(context);

  if (!prisma) {
    return;
  }

  await seedOpenCycle(prisma);
  const currentUser = await createUser(prisma, "unread-self@example.com");
  const otherUser = await createUser(prisma, "unread-other@example.com");

  await joinRegistrationCycle({
    db: prisma,
    userId: currentUser.id,
    commanderName: "Signal One",
    fortressName: "Signal One",
  });
  await joinRegistrationCycle({
    db: prisma,
    userId: otherUser.id,
    commanderName: "Signal Two",
    fortressName: "Signal Two",
  });

  await sendChatMessage({
    db: prisma,
    userId: otherUser.id,
    body: "Enemy scouts sighted.",
    now: new Date("2026-04-19T12:03:00.000Z"),
  });
  await sendChatMessage({
    db: prisma,
    userId: currentUser.id,
    body: "Holding the east gate.",
    now: new Date("2026-04-19T12:04:00.000Z"),
  });
  await sendChatMessage({
    db: prisma,
    userId: otherUser.id,
    body: "Reinforcements are coming.",
    now: new Date("2026-04-19T12:05:00.000Z"),
  });

  const state = await getHomePageState({
    db: prisma,
    userId: currentUser.id,
  });

  assert.equal(state.chat.unreadCount, 2);
  assert.equal(state.chat.hasUnread, true);
  assert.equal(state.chat.persistsUnread, true);
  assert.equal(
    state.chat.latestMessageAt?.toISOString(),
    "2026-04-19T12:05:00.000Z"
  );
});

test("chat unread count respects the last read timestamp", async (context) => {
  const prisma = getPrismaOrSkip(context);

  if (!prisma) {
    return;
  }

  await seedOpenCycle(prisma);
  const currentUser = await createUser(prisma, "unread-window@example.com");
  const otherUser = await createUser(prisma, "unread-window-other@example.com");

  await joinRegistrationCycle({
    db: prisma,
    userId: currentUser.id,
    commanderName: "Northwatch",
    fortressName: "Northwatch",
  });
  await joinRegistrationCycle({
    db: prisma,
    userId: otherUser.id,
    commanderName: "Southwall",
    fortressName: "Southwall",
  });

  await sendChatMessage({
    db: prisma,
    userId: otherUser.id,
    body: "First signal.",
    now: new Date("2026-04-19T12:03:00.000Z"),
  });
  await sendChatMessage({
    db: prisma,
    userId: currentUser.id,
    body: "Acknowledged.",
    now: new Date("2026-04-19T12:04:00.000Z"),
  });
  await sendChatMessage({
    db: prisma,
    userId: otherUser.id,
    body: "Second signal.",
    now: new Date("2026-04-19T12:05:00.000Z"),
  });

  await prisma.user.update({
    where: {
      id: currentUser.id,
    },
    data: {
      lastReadChatAt: new Date("2026-04-19T12:03:30.000Z"),
    },
  });

  const state = await getHomePageState({
    db: prisma,
    userId: currentUser.id,
  });

  assert.equal(state.chat.unreadCount, 1);
  assert.equal(state.chat.hasUnread, true);
});

test("marking chat as read clears unread state on the next read", async (context) => {
  const prisma = getPrismaOrSkip(context);

  if (!prisma) {
    return;
  }

  await seedOpenCycle(prisma);
  const currentUser = await createUser(prisma, "mark-read@example.com");
  const otherUser = await createUser(prisma, "mark-read-other@example.com");

  await joinRegistrationCycle({
    db: prisma,
    userId: currentUser.id,
    commanderName: "Beacon",
    fortressName: "Beacon",
  });
  await joinRegistrationCycle({
    db: prisma,
    userId: otherUser.id,
    commanderName: "Harbor",
    fortressName: "Harbor",
  });

  await sendChatMessage({
    db: prisma,
    userId: otherUser.id,
    body: "Unread message.",
    now: new Date("2026-04-19T12:03:00.000Z"),
  });

  const beforeRead = await getHomePageState({
    db: prisma,
    userId: currentUser.id,
  });

  assert.equal(beforeRead.chat.unreadCount, 1);
  assert.equal(beforeRead.chat.hasUnread, true);

  await markChatRead({
    db: prisma,
    userId: currentUser.id,
    now: new Date("2026-04-19T12:06:00.000Z"),
  });

  const afterRead = await getHomePageState({
    db: prisma,
    userId: currentUser.id,
  });

  assert.equal(afterRead.chat.unreadCount, 0);
  assert.equal(afterRead.chat.hasUnread, false);
});

test("only the resolved cycle winner can submit a winner request", async (context) => {
  const prisma = getPrismaOrSkip(context);

  if (!prisma) {
    return;
  }

  const cycle = await seedOpenCycle(prisma);
  const winner = await createUser(prisma, "request-winner@example.com");
  const loser = await createUser(prisma, "request-loser@example.com");

  await joinRegistrationCycle({
    db: prisma,
    userId: winner.id,
    fortressName: "Winner Keep",
  });
  await joinRegistrationCycle({
    db: prisma,
    userId: loser.id,
    fortressName: "Loser Keep",
  });
  await runGameTick({
    db: prisma,
    now: new Date("2026-04-20T12:00:00.000Z"),
  });
  await prisma.fortress.update({
    where: {
      cycleId_ownerId: {
        cycleId: cycle.id,
        ownerId: winner.id,
      },
    },
    data: {
      points: 9,
    },
  });
  await forceEndCurrentCycle({
    db: prisma,
    now: new Date("2026-04-20T12:03:00.000Z"),
  });

  await assert.rejects(
    () =>
      submitWinnerRequest({
        db: prisma,
        cycleId: cycle.id,
        userId: loser.id,
        requestText: "Add a new spectator banner.",
      }),
    /Only the recorded cycle winner/
  );

  const created = await submitWinnerRequest({
    db: prisma,
    cycleId: cycle.id,
    userId: winner.id,
    requestText: "Add a small winner banner to the history page.",
  });

  assert.equal(created.authorId, winner.id);
  assert.equal(created.status, WinnerRequestStatus.SUBMITTED);

  const unresolvedCycle = await prisma.cycle.findFirstOrThrow({
    where: {
      resolvedAt: null,
    },
  });

  await assert.rejects(
    () =>
      submitWinnerRequest({
        db: prisma,
        cycleId: unresolvedCycle.id,
        userId: winner.id,
        requestText: "This should not be allowed yet.",
      }),
    /open only after a cycle is resolved/
  );
});

test("winner request validation classifies allowed, simplifiable, and rejected inputs", () => {
  const allowed = classifyWinnerRequest(
    "Add a tiny countdown pulse when registration has under one minute left."
  );
  const simplifiable = classifyWinnerRequest(
    "1. Add a post-win badge. 2. Add a new summary panel. 3. Add another notification card."
  );
  const rejected = classifyWinnerRequest(
    "Buff my fortress with extra points and open the PR automatically."
  );

  assert.equal(allowed.status, WinnerRequestStatus.SUBMITTED);
  assert.equal(simplifiable.status, WinnerRequestStatus.NEEDS_SIMPLIFICATION);
  assert.equal(rejected.status, WinnerRequestStatus.REJECTED);
});

test("community wish proposals open to active players during the season", async (context) => {
  const prisma = getPrismaOrSkip(context);

  if (!prisma) {
    return;
  }

  const alpha = await createUser(prisma, "community-alpha@example.com");
  const beta = await createUser(prisma, "community-beta@example.com");
  const spectator = await createUser(prisma, "community-spectator@example.com");
  const cycle = await seedActiveCommunityWishCycle(
    prisma,
    [
      {
        userId: alpha.id,
        commanderName: "Alpha",
        fortressName: "Alpha Keep",
        points: 10,
      },
      {
        userId: beta.id,
        commanderName: "Beta",
        fortressName: "Beta Keep",
        points: 8,
      },
    ],
    new Date("2026-04-23T12:00:00.000Z")
  );

  await assert.rejects(
    () =>
      submitCommunityWishProposal({
        db: prisma,
        cycleId: cycle.id,
        userId: spectator.id,
        requestText: "Add a new endgame badge.",
        now: new Date("2026-04-20T12:01:00.000Z"),
      }),
    /Only players/
  );

  const proposal = await submitCommunityWishProposal({
    db: prisma,
    cycleId: cycle.id,
    userId: alpha.id,
    requestText: "Add a new endgame badge.",
    now: new Date("2026-04-20T12:01:00.000Z"),
  });

  assert.equal(proposal.status, WinnerRequestStatus.SUBMITTED);

  const rejectedProposal = await submitCommunityWishProposal({
    db: prisma,
    cycleId: cycle.id,
    userId: beta.id,
    requestText: "Buff my fortress next season.",
    now: new Date("2026-04-20T12:02:00.000Z"),
  });

  assert.equal(rejectedProposal.status, WinnerRequestStatus.REJECTED);

  const updatedProposal = await submitCommunityWishProposal({
    db: prisma,
    cycleId: cycle.id,
    userId: alpha.id,
    requestText: "Add a cleaner endgame badge.",
    now: new Date("2026-04-20T12:03:00.000Z"),
  });

  assert.equal(updatedProposal.id, proposal.id);
  assert.equal(updatedProposal.requestText, "Add a cleaner endgame badge.");
  assert.equal(updatedProposal.status, WinnerRequestStatus.SUBMITTED);

  await assert.rejects(
    () =>
      submitCommunityWishProposal({
        db: prisma,
        cycleId: cycle.id,
        userId: alpha.id,
        requestText: "x".repeat(COMMUNITY_WISH_MAX_LENGTH + 1),
        now: new Date("2026-04-20T12:04:00.000Z"),
      }),
    /at most 50 characters/
  );

  await assert.rejects(
    () =>
      submitCommunityWishProposal({
        db: prisma,
        cycleId: cycle.id,
        userId: beta.id,
        requestText: "Add a late idea.",
        now: new Date("2026-04-23T12:00:00.000Z"),
      }),
    /closed/
  );
});

test("community wish voting uses final rank budgets and free allocations", async (context) => {
  const prisma = getPrismaOrSkip(context);

  if (!prisma) {
    return;
  }

  assert.equal(getCommunityWishVoteWeight(1), 1);
  assert.equal(getCommunityWishVoteWeight(2), 5);
  assert.equal(getCommunityWishVoteWeight(3), 4);
  assert.equal(getCommunityWishVoteWeight(4), 3);
  assert.equal(getCommunityWishVoteWeight(5), 2);
  assert.equal(getCommunityWishVoteWeight(6), 1);
  assert.equal(
    getCommunityWishProposalEndsAt(
      new Date("2026-04-20T08:59:00.000Z")
    ).toISOString(),
    "2026-04-20T09:00:00.000Z"
  );
  assert.equal(
    getCommunityWishProposalEndsAt(
      new Date("2026-04-20T12:10:00.000Z")
    ).toISOString(),
    "2026-04-27T09:00:00.000Z"
  );

  const users = await Promise.all(
    Array.from({ length: 6 }, (_, index) =>
      createUser(prisma, `community-rank-${index}@example.com`)
    )
  );
  const cycle = await seedActiveCommunityWishCycle(
    prisma,
    users.map((user, index) => ({
      userId: user.id,
      commanderName: `Rank ${index + 1}`,
      fortressName: `Rank Keep ${index + 1}`,
      points: 60 - index * 10,
    }))
  );
  const [winner, second, third] = users;

  const firstProposal = await submitCommunityWishProposal({
    db: prisma,
    cycleId: cycle.id,
    userId: second.id,
    requestText: "Add a compact replay summary.",
    now: new Date("2026-04-20T12:01:00.000Z"),
  });
  const secondProposal = await submitCommunityWishProposal({
    db: prisma,
    cycleId: cycle.id,
    userId: third.id,
    requestText: "Add a new map marker style.",
    now: new Date("2026-04-20T12:02:00.000Z"),
  });

  await runGameTick({
    db: prisma,
    now: new Date("2026-04-20T12:10:00.000Z"),
  });

  const history = await prisma.cycleHistory.findUniqueOrThrow({
    where: {
      cycleId: cycle.id,
    },
  });

  assert.equal(history.communityWishStatus, CommunityWishStatus.OPEN);
  assert.equal(
    history.communityWishProposalEndsAt?.toISOString(),
    "2026-04-27T09:00:00.000Z"
  );
  assert.equal(
    history.communityWishVotingEndsAt?.toISOString(),
    "2026-04-27T15:00:00.000Z"
  );

  await submitCommunityWishProposal({
    db: prisma,
    cycleId: cycle.id,
    userId: third.id,
    requestText: "Add more terrain themes.",
    now: new Date("2026-04-27T08:59:00.000Z"),
  });
  await assert.rejects(
    () =>
      submitCommunityWishProposal({
        db: prisma,
        cycleId: cycle.id,
        userId: third.id,
        requestText: "Add another terrain theme.",
        now: new Date("2026-04-27T09:00:00.000Z"),
      }),
    /closed/
  );

  const winnerBudget = await getCommunityWishVoteBudget({
    db: prisma,
    cycleId: cycle.id,
    userId: winner.id,
  });
  const secondBudget = await getCommunityWishVoteBudget({
    db: prisma,
    cycleId: cycle.id,
    userId: second.id,
  });

  assert.equal(winnerBudget.voteBudget, 1);
  assert.equal(secondBudget.voteBudget, 5);

  await assert.rejects(
    () =>
      saveCommunityWishVotes({
        db: prisma,
        cycleId: cycle.id,
        userId: second.id,
        allocations: [
          { proposalId: firstProposal.id, votes: 3 },
          { proposalId: secondProposal.id, votes: 3 },
        ],
        now: new Date("2026-04-20T12:15:00.000Z"),
      }),
    /at most 5/
  );

  await saveCommunityWishVotes({
    db: prisma,
    cycleId: cycle.id,
    userId: second.id,
    allocations: [{ proposalId: firstProposal.id, votes: 5 }],
    now: new Date("2026-04-20T12:14:00.000Z"),
  });
  await saveCommunityWishVotes({
    db: prisma,
    cycleId: cycle.id,
    userId: second.id,
    allocations: [
      { proposalId: firstProposal.id, votes: 3 },
      { proposalId: secondProposal.id, votes: 2 },
    ],
    now: new Date("2026-04-20T12:15:00.000Z"),
  });

  const proposalVotes = await prisma.communityWishProposal.findMany({
    where: {
      id: {
        in: [firstProposal.id, secondProposal.id],
      },
    },
    select: {
      id: true,
      votes: {
        select: {
          votes: true,
        },
      },
    },
  });
  const voteCountByProposalId = new Map(
    proposalVotes.map((proposal) => [
      proposal.id,
      proposal.votes.reduce((sum, vote) => sum + vote.votes, 0),
    ])
  );

  assert.equal(voteCountByProposalId.get(firstProposal.id), 3);
  assert.equal(voteCountByProposalId.get(secondProposal.id), 2);

  const refreshedBudget = await getCommunityWishVoteBudget({
    db: prisma,
    cycleId: cycle.id,
    userId: second.id,
  });

  assert.equal(refreshedBudget.usedVotes, 5);
  assert.equal(refreshedBudget.remainingVotes, 0);

  await assert.rejects(
    () =>
      saveCommunityWishVotes({
        db: prisma,
        cycleId: cycle.id,
        userId: second.id,
        allocations: [{ proposalId: secondProposal.id, votes: 5 }],
        now: new Date("2026-04-27T15:00:00.000Z"),
      }),
    /voting has ended/
  );
});

test("community wish voting resolves winners and leaves ties for admin", async (context) => {
  const prisma = getPrismaOrSkip(context);

  if (!prisma) {
    return;
  }

  const alpha = await createUser(prisma, "community-resolve-alpha@example.com");
  const beta = await createUser(prisma, "community-resolve-beta@example.com");
  const gamma = await createUser(prisma, "community-resolve-gamma@example.com");
  const delta = await createUser(prisma, "community-resolve-delta@example.com");
  const admin = await createUser(prisma, "community-resolve-admin@example.com");
  const cycle = await seedActiveCommunityWishCycle(prisma, [
    {
      userId: alpha.id,
      commanderName: "Alpha",
      fortressName: "Alpha Keep",
      points: 20,
    },
    {
      userId: beta.id,
      commanderName: "Beta",
      fortressName: "Beta Keep",
      points: 10,
    },
    {
      userId: gamma.id,
      commanderName: "Gamma",
      fortressName: "Gamma Keep",
      points: 5,
    },
    {
      userId: delta.id,
      commanderName: "Delta",
      fortressName: "Delta Keep",
      points: 1,
    },
  ]);
  const alphaProposal = await submitCommunityWishProposal({
    db: prisma,
    cycleId: cycle.id,
    userId: alpha.id,
    requestText: "Add a quiet victory animation.",
    now: new Date("2026-04-20T12:01:00.000Z"),
  });
  const betaProposal = await submitCommunityWishProposal({
    db: prisma,
    cycleId: cycle.id,
    userId: beta.id,
    requestText: "Add a scoreboard filter.",
    now: new Date("2026-04-20T12:02:00.000Z"),
  });
  const lowerProposal = await submitCommunityWishProposal({
    db: prisma,
    cycleId: cycle.id,
    userId: gamma.id,
    requestText: "Add a quieter archive label.",
    now: new Date("2026-04-20T12:03:00.000Z"),
  });
  const rejectedProposal = await submitCommunityWishProposal({
    db: prisma,
    cycleId: cycle.id,
    userId: delta.id,
    requestText: "Buff my fortress next season.",
    now: new Date("2026-04-20T12:04:00.000Z"),
  });

  await runGameTick({
    db: prisma,
    now: new Date("2026-04-20T12:10:00.000Z"),
  });
  await saveCommunityWishVotes({
    db: prisma,
    cycleId: cycle.id,
    userId: alpha.id,
    allocations: [{ proposalId: alphaProposal.id, votes: 1 }],
    now: new Date("2026-04-20T12:15:00.000Z"),
  });
  await saveCommunityWishVotes({
    db: prisma,
    cycleId: cycle.id,
    userId: beta.id,
    allocations: [{ proposalId: betaProposal.id, votes: 1 }],
    now: new Date("2026-04-20T12:16:00.000Z"),
  });

  await resolveExpiredCommunityWishVotes({
    db: prisma,
    now: new Date("2026-04-27T15:00:00.000Z"),
  });

  const tiedHistory = await prisma.cycleHistory.findUniqueOrThrow({
    where: {
      cycleId: cycle.id,
    },
  });

  assert.equal(
    tiedHistory.communityWishStatus,
    CommunityWishStatus.TIE_REQUIRES_ADMIN
  );

  await assert.rejects(
    () =>
      adminResolveCommunityWishTie({
        db: prisma,
        cycleId: cycle.id,
        proposalId: lowerProposal.id,
        adminId: admin.id,
        now: new Date("2026-04-27T15:12:00.000Z"),
      }),
    /tied top/
  );
  await assert.rejects(
    () =>
      adminResolveCommunityWishTie({
        db: prisma,
        cycleId: cycle.id,
        proposalId: rejectedProposal.id,
        adminId: admin.id,
        now: new Date("2026-04-27T15:13:00.000Z"),
      }),
    /tied top/
  );

  await adminResolveCommunityWishTie({
    db: prisma,
    cycleId: cycle.id,
    proposalId: betaProposal.id,
    adminId: admin.id,
    now: new Date("2026-04-27T15:15:00.000Z"),
  });

  const resolvedTie = await prisma.cycleHistory.findUniqueOrThrow({
    where: {
      cycleId: cycle.id,
    },
  });

  assert.equal(resolvedTie.communityWishStatus, CommunityWishStatus.RESOLVED);
  assert.equal(resolvedTie.communityWishProposalId, betaProposal.id);

  const secondCycle = await seedActiveCommunityWishCycle(prisma, [
    {
      userId: alpha.id,
      commanderName: "Alpha Two",
      fortressName: "Alpha Two Keep",
      points: 20,
    },
    {
      userId: beta.id,
      commanderName: "Beta Two",
      fortressName: "Beta Two Keep",
      points: 10,
    },
  ]);
  const winningProposal = await submitCommunityWishProposal({
    db: prisma,
    cycleId: secondCycle.id,
    userId: beta.id,
    requestText: "Add a season-end confetti toggle.",
    now: new Date("2026-04-20T12:01:00.000Z"),
  });

  await runGameTick({
    db: prisma,
    now: new Date("2026-04-20T12:10:00.000Z"),
  });
  await saveCommunityWishVotes({
    db: prisma,
    cycleId: secondCycle.id,
    userId: beta.id,
    allocations: [{ proposalId: winningProposal.id, votes: 5 }],
    now: new Date("2026-04-20T12:15:00.000Z"),
  });
  await resolveExpiredCommunityWishVotes({
    db: prisma,
    now: new Date("2026-04-27T15:00:00.000Z"),
  });

  const resolvedHistory = await prisma.cycleHistory.findUniqueOrThrow({
    where: {
      cycleId: secondCycle.id,
    },
  });

  assert.equal(resolvedHistory.communityWishStatus, CommunityWishStatus.RESOLVED);
  assert.equal(resolvedHistory.communityWishProposalId, winningProposal.id);
  assert.equal(resolvedHistory.communityWishFulfillmentProgress, 0);
  assert.match(
    resolvedHistory.communityWishSnapshot ?? "",
    /season-end confetti/
  );

  const updatedCommunityProgress =
    await updateCommunityWishFulfillmentProgress({
      db: prisma,
      cycleId: secondCycle.id,
      progress: 125,
    });

  assert.equal(updatedCommunityProgress.communityWishFulfillmentProgress, 100);

  await prisma.cycleHistory.update({
    where: {
      cycleId: secondCycle.id,
    },
    data: {
      communityWishSnapshot: null,
    },
  });

  const historyState = await getCycleHistoryPageState({
    userId: beta.id,
    db: prisma,
  });
  const homeState = await getHomePageState({
    userId: beta.id,
    db: prisma,
    now: new Date("2026-04-28T12:00:00.000Z"),
  });
  const adminState = await getAdminDashboardState({
    db: prisma,
  });
  const historyEntry = historyState.entries.find(
    (entry) => entry.cycleId === secondCycle.id
  );
  const adminCommunityWish = adminState.communityWishes.find(
    (entry) => entry.cycleId === secondCycle.id
  );

  assert.match(
    historyEntry?.communityWishSnapshot ?? "",
    /season-end confetti/
  );
  assert.equal(
    historyEntry?.communityWishFulfillmentProgress,
    100
  );
  assert.equal(
    homeState.latestSeason?.wishes.community?.fulfillmentProgress,
    100
  );
  assert.match(
    homeState.latestSeason?.wishes.community?.text ?? "",
    /season-end confetti/
  );
  assert.equal(adminCommunityWish?.fulfillmentProgress, 100);
});

test("community wish migration backfills legacy history as no proposals", () => {
  const migrationSql = readFileSync(
    resolve(
      workspaceRoot,
      "prisma/migrations/20260424194500_community_wish_pool/migration.sql"
    ),
    "utf8"
  );

  assert.match(
    migrationSql,
    /"communityWishStatus" "CommunityWishStatus" NOT NULL DEFAULT 'NO_PROPOSALS'/
  );
  assert.match(
    migrationSql,
    /UPDATE "CycleHistory"\s+SET "communityWishStatus" = 'NO_PROPOSALS'/m
  );
});

test("only one winner request may exist per winner and cycle", async (context) => {
  const prisma = getPrismaOrSkip(context);

  if (!prisma) {
    return;
  }

  const cycle = await seedOpenCycle(prisma);
  const winner = await createUser(prisma, "single-request@example.com");

  await joinRegistrationCycle({
    db: prisma,
    userId: winner.id,
    fortressName: "Solo Winner",
  });
  await runGameTick({
    db: prisma,
    now: new Date("2026-04-20T12:00:00.000Z"),
  });
  await forceEndCurrentCycle({
    db: prisma,
    now: new Date("2026-04-20T12:03:00.000Z"),
  });

  await submitWinnerRequest({
    db: prisma,
    cycleId: cycle.id,
    userId: winner.id,
    requestText: "Add a compact winner summary tile.",
  });

  await assert.rejects(
    () =>
      submitWinnerRequest({
        db: prisma,
        cycleId: cycle.id,
        userId: winner.id,
        requestText: "Try a second request.",
      }),
    /already has a stored winner request/
  );
});

test("admin review rejects invalid transitions and persists valid status updates", async (context) => {
  const prisma = getPrismaOrSkip(context);

  if (!prisma) {
    return;
  }

  const cycle = await seedOpenCycle(prisma);
  const winner = await createUser(prisma, "review-winner@example.com");
  const admin = await prisma.user.create({
    data: {
      email: "review-admin@example.com",
      name: "review-admin@example.com",
      role: "ADMIN",
    },
  });

  await joinRegistrationCycle({
    db: prisma,
    userId: winner.id,
    fortressName: "Review Fort",
  });
  await runGameTick({
    db: prisma,
    now: new Date("2026-04-20T12:00:00.000Z"),
  });
  await forceEndCurrentCycle({
    db: prisma,
    now: new Date("2026-04-20T12:03:00.000Z"),
  });

  const request = await submitWinnerRequest({
    db: prisma,
    cycleId: cycle.id,
    userId: winner.id,
    requestText: "Add a small winner highlight card to history.",
  });

  await reviewWinnerRequest({
    db: prisma,
    requestId: request.id,
    reviewedById: admin.id,
    status: WinnerRequestStatus.UNDER_ADMIN_REVIEW,
    reviewNotes: "Queued for manual review.",
    now: new Date("2026-04-20T12:10:00.000Z"),
  });

  const reviewed = await reviewWinnerRequest({
    db: prisma,
    requestId: request.id,
    reviewedById: admin.id,
    status: WinnerRequestStatus.ACCEPTED,
    reviewNotes: "Accepted as a bounded MVP-safe UI enhancement.",
    now: new Date("2026-04-20T12:12:00.000Z"),
  });

  assert.equal(reviewed.status, WinnerRequestStatus.ACCEPTED);
  assert.equal(
    reviewed.reviewNotes,
    "Accepted as a bounded MVP-safe UI enhancement."
  );

  await assert.rejects(
    () =>
      reviewWinnerRequest({
        db: prisma,
        requestId: request.id,
        reviewedById: admin.id,
        status: WinnerRequestStatus.REJECTED,
        reviewNotes: "Too late after acceptance.",
        now: new Date("2026-04-20T12:13:00.000Z"),
      }),
    /Cannot move/
  );
});

test("history and admin read models expose stored winner request state", async (context) => {
  const prisma = getPrismaOrSkip(context);

  if (!prisma) {
    return;
  }

  const cycle = await seedOpenCycle(prisma);
  const winner = await createUser(prisma, "history-winner@example.com");
  const admin = await prisma.user.create({
    data: {
      email: "history-admin@example.com",
      name: "history-admin@example.com",
      role: "ADMIN",
    },
  });

  await joinRegistrationCycle({
    db: prisma,
    userId: winner.id,
    commanderName: "Archive Commander",
    fortressName: "Archive Fort",
  });
  await runGameTick({
    db: prisma,
    now: new Date("2026-04-20T12:00:00.000Z"),
  });
  await forceEndCurrentCycle({
    db: prisma,
    now: new Date("2026-04-20T12:03:00.000Z"),
  });

  const created = await submitWinnerRequest({
    db: prisma,
    cycleId: cycle.id,
    userId: winner.id,
    requestText: "Add a tiny winner seal next to the archived result.",
  });

  await reviewWinnerRequest({
    db: prisma,
    requestId: created.id,
    reviewedById: admin.id,
    status: WinnerRequestStatus.NEEDS_SIMPLIFICATION,
    reviewNotes: "Keep it to one small badge and no extra summary blocks.",
    now: new Date("2026-04-20T12:08:00.000Z"),
  });
  const clampedHighProgress = await updateWinnerRequestFulfillmentProgress({
    db: prisma,
    requestId: created.id,
    progress: 140,
  });
  const persistedProgress = await updateWinnerRequestFulfillmentProgress({
    db: prisma,
    requestId: created.id,
    progress: 42,
  });

  const historyState = await getCycleHistoryPageState({
    userId: winner.id,
    db: prisma,
  });
  const adminState = await getAdminDashboardState({
    db: prisma,
  });
  const homeState = await getHomePageState({
    userId: winner.id,
    db: prisma,
    now: new Date("2026-04-21T12:00:00.000Z"),
  });

  assert.equal(clampedHighProgress.fulfillmentProgress, 100);
  assert.equal(persistedProgress.fulfillmentProgress, 42);
  assert.equal(
    historyState.entries[0]?.winnerRequestStatus,
    WinnerRequestStatus.NEEDS_SIMPLIFICATION
  );
  assert.equal(
    historyState.entries[0]?.winnerRequestSnapshot,
    "Add a tiny winner seal next to the archived result."
  );
  assert.equal(historyState.entries[0]?.canSubmitWinnerRequest, false);
  assert.equal(historyState.entries[0]?.winnerLabel, "Archive Commander");
  assert.equal(historyState.entries[0]?.firstSlayerCommanderName, null);
  assert.equal(historyState.entries[0]?.firstSlayerFortressName, null);
  assert.equal(historyState.entries[0]?.winnerRequestFulfillmentProgress, 42);
  assert.equal(homeState.latestSeason?.wishes.winner?.fulfillmentProgress, 42);
  assert.equal(
    homeState.latestSeason?.wishes.winner?.text,
    "Add a tiny winner seal next to the archived result."
  );
  assert.equal(
    adminState.winnerRequests[0]?.status,
    WinnerRequestStatus.NEEDS_SIMPLIFICATION
  );
  assert.equal(adminState.winnerRequests[0]?.authorLabel, "Archive Commander");
  assert.equal(adminState.recentHistory[0]?.winnerLabel, "Archive Commander");
  assert.equal(adminState.recentHistory[0]?.firstSlayerCommanderName, null);
  assert.equal(adminState.recentHistory[0]?.firstSlayerFortressName, null);
  assert.equal(
    adminState.winnerRequests[0]?.reviewNotes,
    "Keep it to one small badge and no extra summary blocks."
  );
  assert.equal(adminState.winnerRequests[0]?.fulfillmentProgress, 42);
  assert.equal(adminState.winnerRequests[0]?.reviewedByLabel, "Admin reviewer");
});

test("active cycle with missing ticks is detected as stalled", async (context) => {
  const prisma = getPrismaOrSkip(context);

  if (!prisma) {
    return;
  }

  const user = await createUser(prisma, "stalled@example.com");
  const cycle = await seedOpenCycle(prisma);

  await joinRegistrationCycle({
    db: prisma,
    userId: user.id,
    commanderName: "Stalled Commander",
    fortressName: "Frozen Keep",
  });

  await runGameTick({
    db: prisma,
    now: cycle.registrationEndsAt,
  });

  const activeCycle = await prisma.cycle.findFirstOrThrow({
    where: {
      id: cycle.id,
    },
    select: {
      activeStartedAt: true,
    },
  });
  assert.ok(activeCycle.activeStartedAt);

  const stalledAt = addMinutes(activeCycle.activeStartedAt, 3);
  const adminState = await getAdminDashboardState({
    db: prisma,
    now: stalledAt,
  });

  assert.equal(adminState.currentCycle?.status, CycleStatus.ACTIVE);
  assert.equal(adminState.currentCycle?.tickHealth, "stalled");
  assert.equal(adminState.currentCycle?.minutesBehind, 3);
  assert.equal(adminState.currentCycle?.lastProcessedTickAt, null);
});

test("manual catch-up unfreezes points", async (context) => {
  const prisma = getPrismaOrSkip(context);

  if (!prisma) {
    return;
  }

  const user = await createUser(prisma, "unfreeze@example.com");
  const cycle = await seedOpenCycle(prisma);

  await joinRegistrationCycle({
    db: prisma,
    userId: user.id,
    commanderName: "Catch Up Commander",
    fortressName: "Warm Keep",
  });

  await runGameTick({
    db: prisma,
    now: cycle.registrationEndsAt,
  });

  const activeCycle = await prisma.cycle.findFirstOrThrow({
    where: {
      id: cycle.id,
    },
    select: {
      activeStartedAt: true,
    },
  });
  assert.ok(activeCycle.activeStartedAt);
  const catchUpAt = addMinutes(activeCycle.activeStartedAt, 3);

  const beforeCatchUp = await prisma.fortress.findFirstOrThrow({
    where: {
      cycleId: cycle.id,
      ownerId: user.id,
    },
    select: {
      points: true,
    },
  });
  const stalledState = await getAdminDashboardState({
    db: prisma,
    now: catchUpAt,
  });
  assert.equal(stalledState.currentCycle?.tickHealth, "stalled");

  await runManualCatchUpTick({
    db: prisma,
    now: catchUpAt,
  });

  const afterCatchUp = await prisma.fortress.findFirstOrThrow({
    where: {
      cycleId: cycle.id,
      ownerId: user.id,
    },
    select: {
      points: true,
    },
  });
  const recoveredState = await getAdminDashboardState({
    db: prisma,
    now: catchUpAt,
  });

  assert.ok(afterCatchUp.points > beforeCatchUp.points);
  assert.equal(recoveredState.currentCycle?.tickHealth, "ok");
  assert.equal(recoveredState.currentCycle?.minutesBehind, 0);
});

test("manual catch-up resolves due attacks without relaunching", async (context) => {
  const prisma = getPrismaOrSkip(context);

  if (!prisma) {
    return;
  }

  const cycle = await seedOpenCycle(prisma);
  const attacker = await createUser(prisma, "catchup-attacker@example.com");
  const target = await createUser(prisma, "catchup-target@example.com");

  await joinRegistrationCycle({
    db: prisma,
    userId: attacker.id,
    commanderName: "Replay Attacker",
    fortressName: "Replay Keep",
  });
  await joinRegistrationCycle({
    db: prisma,
    userId: target.id,
    commanderName: "Replay Target",
    fortressName: "Target Keep",
  });

  await runGameTick({
    db: prisma,
    now: cycle.registrationEndsAt,
  });

  const attackerFortress = await prisma.fortress.findUniqueOrThrow({
    where: {
      cycleId_ownerId: {
        cycleId: cycle.id,
        ownerId: attacker.id,
      },
    },
  });
  const targetFortress = await prisma.fortress.findUniqueOrThrow({
    where: {
      cycleId_ownerId: {
        cycleId: cycle.id,
        ownerId: target.id,
      },
    },
  });

  await prisma.fortress.update({
    where: {
      id: attackerFortress.id,
    },
    data: {
      army: 1,
      race: FortressRace.DWARFS,
      mapX: 6,
      mapY: 6,
    },
  });
  await prisma.fortress.update({
    where: {
      id: targetFortress.id,
    },
    data: {
      mapX: 94,
      mapY: 95,
      points: 5,
    },
  });

  const launchTime = addMinutes(cycle.registrationEndsAt, 5);

  await setFortressAction({
    db: prisma,
    userId: attacker.id,
    action: FortressAction.ATTACK,
    targetFortressId: targetFortress.id,
    now: launchTime,
  });

  const firstUnit = await prisma.attackUnit.findFirstOrThrow({
    where: {
      attackerFortressId: attackerFortress.id,
      resolvedAt: null,
      cancelledAt: null,
    },
    orderBy: {
      launchedAt: "asc",
    },
  });
  const catchUpAt = addMinutes(firstUnit.arrivesAt, 1);

  const beforeCatchUpTarget = await prisma.fortress.findUniqueOrThrow({
    where: {
      id: targetFortress.id,
    },
    select: {
      points: true,
    },
  });

  const summary = await runManualCatchUpTick({
    db: prisma,
    now: catchUpAt,
  });

  const afterCatchUpTarget = await prisma.fortress.findUniqueOrThrow({
    where: {
      id: targetFortress.id,
    },
    select: {
      points: true,
    },
  });
  const unresolvedAfterCatchUp = await prisma.attackUnit.findMany({
    where: {
      attackerFortressId: attackerFortress.id,
      resolvedAt: null,
      cancelledAt: null,
    },
    orderBy: {
      launchedAt: "asc",
    },
    select: {
      launchedAt: true,
    },
  });

  assert.ok(summary.processedMinutes >= 1);
  assert.equal(summary.resolvedAttackUnits, 1);
  assert.equal(summary.launchedAttackUnits, 0);
  assert.equal(afterCatchUpTarget.points, beforeCatchUpTarget.points - 2);
  assert.equal(unresolvedAfterCatchUp.length, 0);
});
