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
  BattlefieldSide,
  ChatMessageType,
  CommunityWishStatus,
  CycleStatus,
  DwarfDeepMiningOutcome,
  FortressAction,
  FortressKind,
  FortressRace,
  LootCampVariant,
  PrismaClient,
  RaceAbilityKind,
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
  HOME_OF_A_ARMY_DRAIN_PER_TICK,
  HOME_OF_A_NEUTRAL_DEFENSE,
  getArcadeSeasonRankBonus,
  ARCADE_FORTRESS_LOOT_BOX_SKINS_SET_1,
  CURRENT_MAP_LAYOUT_VERSION,
  HOME_OF_A_POINT_INCOME,
  HOME_OF_A_TILE_ID,
  MEGA_FORTRESS_DESTROY_BONUS,
  MEGA_FORTRESS_HEALTH,
  NPC_SYSTEM_USER_EMAIL,
  ARCADE_LOOT_BOX_SKINS,
  ARCADE_UNIT_LOOT_BOX_SKINS_LEGACY,
  FORTRESS_LEVEL_UP_COSTS,
  MAX_FORTRESS_LEVEL,
  UNIT_SPRITE_VARIANTS,
} from "./constants";
import { getAttackArrivalAt, getAttackTravelMinutes } from "./attacks";
import { getAttackPresentation } from "./attack-presentation";
import {
  getCosmeticSpriteStyle,
  getDedicatedCosmeticSpriteAssetGaps,
  getDefaultRaceCosmeticVariant,
} from "./cosmetic-sprites";
import { getNextHelsinkiNoonAfter, getRaceBuffTier } from "./race-buffs";
import {
  HEX_SPAWN_TILES,
  MAP_WORLD_HEIGHT,
  MAP_WORLD_WIDTH,
  isPointNearSpawnHex,
  snapMapPointToHex,
} from "./map-hex";
import {
  buildFortressSpawnSeed,
  getFortressSpawnLayout,
  getOpenSpawnCandidates,
  getRenderedMapPositionKey,
  getSpawnPointKey,
  takeOpenSpawnPoint,
  takeUniqueSpawnPoints,
  type SpawnPoint,
} from "./spawn-layout";
import {
  ensureMegaFortress,
  getHomeOfAMapPosition,
  hasDuplicateFortressMapPositions,
} from "./mega-fortress";
import { getAdminDashboardState } from "./admin-dashboard";
import { getCycleHistoryPageState } from "./history";
import { getHomePageState } from "./read-model";
import {
  editRegistrationFortressName,
  joinRegistrationCycle,
  purchaseFortressUpgrade,
  registerCommanderName,
  renameActiveFortress,
  recallAttackUnit,
  selectFortressRace,
  setFortressAction,
  activateRaceAbility,
  activateDwarfDeepMining,
  activateDwarfRuneOfGrudges,
  claimUnicornTeleport,
  claimNeutralMapHex,
  attackMapHex,
  joinBattlefield,
  updateWorkerAssignment,
  shuffleFortressLocation,
} from "./service";
import { TickRunnerError, classifyTickHealth, runGameTick } from "./tick";
import { addHours, addMinutes } from "./time";
import {
  getLootCampDefenseArmy,
  getLootCampScheduleForHour,
} from "./loot-camps";
import { formatTickRunnerError, formatTickSummary } from "./tick-cli";
import {
  getBattlefieldAttrition,
  getBattlefieldProgressDelta,
  processActiveBattlefields,
} from "./battlefields";
import {
  getTileBonus,
  getTileClaimCost,
  isTileConnectedToFortressOrOwnedTiles,
} from "./territory";
import {
  classifyWinnerRequest,
  reviewWinnerRequest,
  submitWinnerRequest,
  updateWinnerRequestFulfillmentProgress,
} from "./winner-requests";
import {
  RaceSchemaReadinessError,
  ensureRaceSchemaReadiness,
  getRaceSchemaReadiness,
} from "./schema-guards";
import { getChatMessageVariant } from "@/components/chat-panel-helpers";

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

function distanceBetweenPoints(
  left: { x: number; y: number },
  right: { x: number; y: number }
) {
  return Math.hypot(left.x - right.x, left.y - right.y);
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

  const distinctPoints = takeUniqueSpawnPoints(
    "duplicate:distinct-rendered",
    2
  );

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

test("chat message variant marks only system messages as system", () => {
  assert.equal(
    getChatMessageVariant({ isCurrentUser: false, isSystem: false }),
    "default"
  );
  assert.equal(
    getChatMessageVariant({ isCurrentUser: true, isSystem: false }),
    "own"
  );
  assert.equal(
    getChatMessageVariant({ isCurrentUser: false, isSystem: true }),
    "system"
  );
  assert.equal(
    getChatMessageVariant({ isCurrentUser: true, isSystem: true }),
    "system"
  );
});

test("territory bonuses and claim costs are deterministic", () => {
  const tile = HEX_SPAWN_TILES.find(
    (candidate) => candidate.biome === "plains"
  );

  assert.ok(tile);
  assert.deepEqual(getTileBonus(tile), {
    gold: 1,
    points: 0,
    food: 2,
    army: 0,
    defensePercent: 0,
    label: "+1 gold, +2 food / tick",
  });
  assert.equal(
    getTileClaimCost({
      tile,
      origin: {
        mapX: 50,
        mapY: 50,
      },
    }),
    getTileClaimCost({
      tile,
      origin: {
        mapX: 50,
        mapY: 50,
      },
    })
  );
});

test("battlefield progress advances by one to five percent per tick", () => {
  const tickAt = new Date("2026-05-05T12:00:00.000Z");
  const progress = getBattlefieldProgressDelta({
    battlefieldId: "battlefield-test",
    tickAt,
  });

  assert.ok(progress >= 1);
  assert.ok(progress <= 5);
  assert.equal(
    progress,
    getBattlefieldProgressDelta({
      battlefieldId: "battlefield-test",
      tickAt,
    })
  );
});

test("battlefield attrition is deterministic and has minimum losses", () => {
  const tickAt = new Date("2026-05-05T12:00:00.000Z");
  const attrition = getBattlefieldAttrition({
    battlefieldId: "battlefield-attrition-test",
    tickAt,
    attackerArmy: 2,
    defenderArmy: 3,
  });

  assert.ok(attrition.attackerLosses >= 1);
  assert.ok(attrition.defenderLosses >= 1);
  assert.ok(attrition.attackerLosses <= 2);
  assert.ok(attrition.defenderLosses <= 3);
  assert.deepEqual(
    attrition,
    getBattlefieldAttrition({
      battlefieldId: "battlefield-attrition-test",
      tickAt,
      attackerArmy: 2,
      defenderArmy: 3,
    })
  );
  assert.deepEqual(
    getBattlefieldAttrition({
      battlefieldId: "battlefield-attrition-test",
      tickAt,
      attackerArmy: 0,
      defenderArmy: 3,
    }),
    {
      attackerLosses: 0,
      defenderLosses: 0,
    }
  );
});

test("neutral tile claim spends gold and applies tick bonus", async (context) => {
  const prisma = getPrismaOrSkip(context);

  if (!prisma) {
    return;
  }

  const user = await createUser(prisma, "tile-claim@example.com");
  const cycle = await seedActiveCommunityWishCycle(prisma, [
    {
      userId: user.id,
      commanderName: "Tile Claimer",
      fortressName: "Claim Keep",
      points: 100,
    },
  ]);
  const fortress = await prisma.fortress.findUniqueOrThrow({
    where: {
      cycleId_ownerId: {
        cycleId: cycle.id,
        ownerId: user.id,
      },
    },
  });
  await prisma.fortress.update({
    where: {
      id: fortress.id,
    },
    data: {
      points: 0,
      gold: 100,
      food: 0,
      army: 0,
      minersAssigned: 0,
      farmersAssigned: 0,
      recruitersAssigned: 0,
    },
  });
  const tile = HEX_SPAWN_TILES.find(
    (candidate) =>
      candidate.spawnable &&
      isTileConnectedToFortressOrOwnedTiles({
        tileId: candidate.id,
        fortress,
        ownedTileIds: [],
      }) &&
      (getTileBonus(candidate).gold > 0 || getTileBonus(candidate).food > 0)
  );

  assert.ok(tile);

  const claimCost = getTileClaimCost({
    tile,
    origin: {
      mapX: fortress.mapX,
      mapY: fortress.mapY,
    },
  });

  await claimNeutralMapHex({
    userId: user.id,
    tileId: tile.id,
    now: new Date("2026-04-20T12:01:00.000Z"),
    db: prisma,
  });
  await runGameTick({
    now: new Date("2026-04-20T12:02:00.000Z"),
    db: prisma,
  });

  const pendingOwnership = await prisma.mapHexOwnership.findUnique({
    where: {
      cycleId_tileId: {
        cycleId: cycle.id,
        tileId: tile.id,
      },
    },
  });

  assert.equal(pendingOwnership, null);

  await runGameTick({
    now: new Date("2026-04-20T12:11:00.000Z"),
    db: prisma,
  });

  const expectedTileBonus = getTileBonus(tile, {
    tileId: tile.id,
    cycleId: cycle.id,
    at: new Date("2026-04-20T12:11:00.000Z"),
  });

  const reloaded = await prisma.fortress.findUniqueOrThrow({
    where: {
      id: fortress.id,
    },
  });

  assert.equal(reloaded.gold, 100 - claimCost + expectedTileBonus.gold);
  assert.equal(reloaded.food, expectedTileBonus.food);
  assert.equal(reloaded.points, expectedTileBonus.points);

  const completedProject = await prisma.mapHexClaimProject.findFirstOrThrow({
    where: {
      cycleId: cycle.id,
      tileId: tile.id,
    },
  });

  assert.equal(completedProject.completedAt?.toISOString(), "2026-04-20T12:11:00.000Z");
});

test("owned tile attack creates a targetTileId battlefield", async (context) => {
  const prisma = getPrismaOrSkip(context);

  if (!prisma) {
    return;
  }

  const attacker = await createUser(prisma, "tile-attack-attacker@example.com");
  const defender = await createUser(prisma, "tile-attack-defender@example.com");
  const cycle = await seedActiveCommunityWishCycle(prisma, [
    {
      userId: attacker.id,
      commanderName: "Tile Attacker",
      fortressName: "Attack Keep",
      points: 100,
    },
    {
      userId: defender.id,
      commanderName: "Tile Defender",
      fortressName: "Defense Keep",
      points: 100,
    },
  ]);
  const [attackerFortress, defenderFortress] = await Promise.all([
    prisma.fortress.findUniqueOrThrow({
      where: { cycleId_ownerId: { cycleId: cycle.id, ownerId: attacker.id } },
    }),
    prisma.fortress.findUniqueOrThrow({
      where: { cycleId_ownerId: { cycleId: cycle.id, ownerId: defender.id } },
    }),
  ]);
  const tile = HEX_SPAWN_TILES.find((candidate) => candidate.spawnable);

  assert.ok(tile);

  await prisma.fortress.update({
    where: { id: attackerFortress.id },
    data: { race: FortressRace.ORKS, army: 20 },
  });
  await prisma.fortress.update({
    where: { id: defenderFortress.id },
    data: { race: FortressRace.DWARFS, army: 10 },
  });
  await prisma.mapHexOwnership.create({
    data: {
      cycleId: cycle.id,
      tileId: tile.id,
      ownerFortressId: defenderFortress.id,
    },
  });

  const battlefield = await attackMapHex({
    userId: attacker.id,
    tileId: tile.id,
    sentArmy: 5,
    now: new Date("2026-04-20T12:01:00.000Z"),
    db: prisma,
  });

  const reloaded = await prisma.battlefield.findUniqueOrThrow({
    where: { id: battlefield.id },
    include: { incomingReinforcements: true },
  });

  assert.equal(reloaded.targetTileId, tile.id);
  assert.equal(reloaded.targetFortressId, defenderFortress.id);
  assert.equal(reloaded.incomingReinforcements.length, 1);
  assert.equal(
    reloaded.incomingReinforcements[0]?.reinforcementSide,
    BattlefieldSide.ATTACKER
  );
});

test("reinforcement travels before joining a battlefield", async (context) => {
  const prisma = getPrismaOrSkip(context);

  if (!prisma) {
    return;
  }

  const attacker = await createUser(prisma, "reinforce-attacker@example.com");
  const defender = await createUser(prisma, "reinforce-defender@example.com");
  const cycle = await seedActiveCommunityWishCycle(prisma, [
    {
      userId: attacker.id,
      commanderName: "Marcher",
      fortressName: "March Keep",
      points: 100,
    },
    {
      userId: defender.id,
      commanderName: "Holder",
      fortressName: "Hold Keep",
      points: 100,
    },
  ]);
  const [attackerFortress, defenderFortress] = await Promise.all([
    prisma.fortress.findUniqueOrThrow({
      where: { cycleId_ownerId: { cycleId: cycle.id, ownerId: attacker.id } },
    }),
    prisma.fortress.findUniqueOrThrow({
      where: { cycleId_ownerId: { cycleId: cycle.id, ownerId: defender.id } },
    }),
  ]);
  const tile = HEX_SPAWN_TILES.find((candidate) => candidate.spawnable);

  assert.ok(tile);

  await prisma.fortress.update({
    where: { id: attackerFortress.id },
    data: { race: FortressRace.ORKS, army: 20 },
  });
  await prisma.fortress.update({
    where: { id: defenderFortress.id },
    data: { race: FortressRace.DWARFS, army: 10 },
  });
  await prisma.mapHexOwnership.create({
    data: {
      cycleId: cycle.id,
      tileId: tile.id,
      ownerFortressId: defenderFortress.id,
    },
  });

  const battlefield = await attackMapHex({
    userId: attacker.id,
    tileId: tile.id,
    sentArmy: 5,
    now: new Date("2026-04-20T12:01:00.000Z"),
    db: prisma,
  });
  const unit = await prisma.attackUnit.findFirstOrThrow({
    where: { reinforcementBattlefieldId: battlefield.id },
  });

  assert.equal(
    await prisma.battlefieldParticipant.count({
      where: { battlefieldId: battlefield.id },
    }),
    0
  );

  await runGameTick({ now: unit.arrivesAt, db: prisma });

  const participant = await prisma.battlefieldParticipant.findUnique({
    where: {
      battlefieldId_fortressId: {
        battlefieldId: battlefield.id,
        fortressId: attackerFortress.id,
      },
    },
  });

  assert.equal(participant?.side, BattlefieldSide.ATTACKER);
  assert.equal(participant?.armyCommitted, 5);
});

test("player cannot join both battlefield sides including pending reinforcements", async (context) => {
  const prisma = getPrismaOrSkip(context);

  if (!prisma) {
    return;
  }

  const attacker = await createUser(prisma, "side-lock-attacker@example.com");
  const defender = await createUser(prisma, "side-lock-defender@example.com");
  const cycle = await seedActiveCommunityWishCycle(prisma, [
    {
      userId: attacker.id,
      commanderName: "Side Lock",
      fortressName: "Side Lock Keep",
      points: 100,
    },
    {
      userId: defender.id,
      commanderName: "Side Defender",
      fortressName: "Side Defense Keep",
      points: 100,
    },
  ]);
  const [attackerFortress, defenderFortress] = await Promise.all([
    prisma.fortress.findUniqueOrThrow({
      where: { cycleId_ownerId: { cycleId: cycle.id, ownerId: attacker.id } },
    }),
    prisma.fortress.findUniqueOrThrow({
      where: { cycleId_ownerId: { cycleId: cycle.id, ownerId: defender.id } },
    }),
  ]);

  await prisma.fortress.update({
    where: { id: attackerFortress.id },
    data: { race: FortressRace.ORKS, army: 20 },
  });
  await prisma.fortress.update({
    where: { id: defenderFortress.id },
    data: { race: FortressRace.DWARFS, army: 10 },
  });

  const battlefield = await prisma.battlefield.create({
    data: {
      cycleId: cycle.id,
      targetFortressId: defenderFortress.id,
      attackerBannerFortressId: attackerFortress.id,
      defenderBannerFortressId: defenderFortress.id,
      startedAt: new Date("2026-04-20T12:01:00.000Z"),
    },
  });

  await joinBattlefield({
    userId: attacker.id,
    battlefieldId: battlefield.id,
    side: BattlefieldSide.ATTACKER,
    armyAmount: 5,
    now: new Date("2026-04-20T12:02:00.000Z"),
    db: prisma,
  });

  await assert.rejects(
    () =>
      joinBattlefield({
        userId: attacker.id,
        battlefieldId: battlefield.id,
        side: BattlefieldSide.DEFENDER,
        armyAmount: 1,
        now: new Date("2026-04-20T12:03:00.000Z"),
        db: prisma,
      }),
    /other side/
  );
});

test("tile battle transfers ownership on attacker win", async (context) => {
  const prisma = getPrismaOrSkip(context);

  if (!prisma) {
    return;
  }

  const attacker = await createUser(prisma, "tile-win-attacker@example.com");
  const defender = await createUser(prisma, "tile-win-defender@example.com");
  const cycle = await seedActiveCommunityWishCycle(prisma, [
    {
      userId: attacker.id,
      commanderName: "Tile Winner",
      fortressName: "Winner Keep",
      points: 100,
    },
    {
      userId: defender.id,
      commanderName: "Tile Loser",
      fortressName: "Loser Keep",
      points: 100,
    },
  ]);
  const [attackerFortress, defenderFortress] = await Promise.all([
    prisma.fortress.findUniqueOrThrow({
      where: { cycleId_ownerId: { cycleId: cycle.id, ownerId: attacker.id } },
    }),
    prisma.fortress.findUniqueOrThrow({
      where: { cycleId_ownerId: { cycleId: cycle.id, ownerId: defender.id } },
    }),
  ]);
  const tile = HEX_SPAWN_TILES.find((candidate) => candidate.spawnable);

  assert.ok(tile);

  await prisma.mapHexOwnership.create({
    data: {
      cycleId: cycle.id,
      tileId: tile.id,
      ownerFortressId: defenderFortress.id,
    },
  });
  const battlefield = await prisma.battlefield.create({
    data: {
      cycleId: cycle.id,
      targetTileId: tile.id,
      targetFortressId: defenderFortress.id,
      attackerBannerFortressId: attackerFortress.id,
      defenderBannerFortressId: defenderFortress.id,
      progress: 99,
      attackerArmyRemaining: 50,
      defenderArmyRemaining: 0,
      pointsReward: 25,
      startedAt: new Date("2026-04-20T12:01:00.000Z"),
      participants: {
        create: {
          fortressId: attackerFortress.id,
          side: BattlefieldSide.ATTACKER,
          armyCommitted: 50,
          armyRemaining: 50,
        },
      },
    },
  });

  await processActiveBattlefields({
    db: prisma,
    cycleId: cycle.id,
    tickAt: new Date("2026-04-20T12:02:00.000Z"),
  });

  const ownership = await prisma.mapHexOwnership.findUniqueOrThrow({
    where: { cycleId_tileId: { cycleId: cycle.id, tileId: tile.id } },
  });
  const resolved = await prisma.battlefield.findUniqueOrThrow({
    where: { id: battlefield.id },
  });

  assert.equal(ownership.ownerFortressId, attackerFortress.id);
  assert.equal(resolved.resolvedWinnerSide, BattlefieldSide.ATTACKER);
});

test("tile battle keeps ownership on defender win", async (context) => {
  const prisma = getPrismaOrSkip(context);

  if (!prisma) {
    return;
  }

  const attacker = await createUser(prisma, "tile-keep-attacker@example.com");
  const defender = await createUser(prisma, "tile-keep-defender@example.com");
  const cycle = await seedActiveCommunityWishCycle(prisma, [
    {
      userId: attacker.id,
      commanderName: "Tile Challenger",
      fortressName: "Challenger Keep",
      points: 100,
    },
    {
      userId: defender.id,
      commanderName: "Tile Holder",
      fortressName: "Holder Keep",
      points: 100,
    },
  ]);
  const [attackerFortress, defenderFortress] = await Promise.all([
    prisma.fortress.findUniqueOrThrow({
      where: { cycleId_ownerId: { cycleId: cycle.id, ownerId: attacker.id } },
    }),
    prisma.fortress.findUniqueOrThrow({
      where: { cycleId_ownerId: { cycleId: cycle.id, ownerId: defender.id } },
    }),
  ]);
  const tile = HEX_SPAWN_TILES.find((candidate) => candidate.spawnable);

  assert.ok(tile);

  await prisma.fortress.update({
    where: { id: defenderFortress.id },
    data: { army: 100, level: 5 },
  });
  await prisma.mapHexOwnership.create({
    data: {
      cycleId: cycle.id,
      tileId: tile.id,
      ownerFortressId: defenderFortress.id,
    },
  });
  await prisma.battlefield.create({
    data: {
      cycleId: cycle.id,
      targetTileId: tile.id,
      targetFortressId: defenderFortress.id,
      attackerBannerFortressId: attackerFortress.id,
      defenderBannerFortressId: defenderFortress.id,
      progress: 99,
      attackerArmyRemaining: 1,
      defenderArmyRemaining: 100,
      startedAt: new Date("2026-04-20T12:01:00.000Z"),
      participants: {
        create: {
          fortressId: attackerFortress.id,
          side: BattlefieldSide.ATTACKER,
          armyCommitted: 1,
          armyRemaining: 1,
        },
      },
    },
  });

  await processActiveBattlefields({
    db: prisma,
    cycleId: cycle.id,
    tickAt: new Date("2026-04-20T12:02:00.000Z"),
  });

  const ownership = await prisma.mapHexOwnership.findUniqueOrThrow({
    where: { cycleId_tileId: { cycleId: cycle.id, tileId: tile.id } },
  });

  assert.equal(ownership.ownerFortressId, defenderFortress.id);
});

test("Home of A is centered and cannot be neutral claimed", async (context) => {
  const prisma = getPrismaOrSkip(context);

  if (!prisma) {
    return;
  }

  const user = await createUser(prisma, "home-center@example.com");
  const cycle = await seedActiveCommunityWishCycle(prisma, [
    {
      userId: user.id,
      commanderName: "Center Commander",
      fortressName: "Center Keep",
      points: 100,
    },
  ]);
  const position = getHomeOfAMapPosition();

  const home = await ensureMegaFortress({
    db: prisma,
    cycleId: cycle.id,
    seed: "test-home-center",
  });

  assert.equal(home.mapX, position.mapX);
  assert.equal(home.mapY, position.mapY);
  assert.equal(home.army, HOME_OF_A_NEUTRAL_DEFENSE);
  await assert.rejects(
    () =>
      claimNeutralMapHex({
        userId: user.id,
        tileId: HOME_OF_A_TILE_ID,
        now: new Date("2026-04-20T12:01:00.000Z"),
        db: prisma,
      }),
    /must be conquered/
  );
});

test("Home of A first capture creates ownership and holder shares", async (context) => {
  const prisma = getPrismaOrSkip(context);

  if (!prisma) {
    return;
  }

  const banner = await createUser(prisma, "home-banner@example.com");
  const ally = await createUser(prisma, "home-ally@example.com");
  const cycle = await seedActiveCommunityWishCycle(prisma, [
    {
      userId: banner.id,
      commanderName: "Banner Commander",
      fortressName: "Banner Keep",
      points: 0,
    },
    {
      userId: ally.id,
      commanderName: "Ally Commander",
      fortressName: "Ally Keep",
      points: 0,
    },
  ]);
  const [bannerFortress, allyFortress] = await Promise.all([
    prisma.fortress.findUniqueOrThrow({
      where: { cycleId_ownerId: { cycleId: cycle.id, ownerId: banner.id } },
    }),
    prisma.fortress.findUniqueOrThrow({
      where: { cycleId_ownerId: { cycleId: cycle.id, ownerId: ally.id } },
    }),
  ]);

  await prisma.fortress.updateMany({
    where: {
      id: {
        in: [bannerFortress.id, allyFortress.id],
      },
    },
    data: {
      army: 10,
      minersAssigned: 0,
      farmersAssigned: 0,
      recruitersAssigned: 0,
    },
  });
  const home = await ensureMegaFortress({
    db: prisma,
    cycleId: cycle.id,
    seed: "test-home-capture",
  });

  await prisma.battlefield.create({
    data: {
      cycleId: cycle.id,
      targetTileId: HOME_OF_A_TILE_ID,
      targetFortressId: home.id,
      attackerBannerFortressId: bannerFortress.id,
      defenderBannerFortressId: null,
      progress: 99,
      attackerArmyRemaining: 100,
      defenderArmyRemaining: 0,
      pointsReward: HOME_OF_A_POINT_INCOME,
      startedAt: new Date("2026-04-20T12:01:00.000Z"),
      participants: {
        create: [
          {
            fortressId: bannerFortress.id,
            side: BattlefieldSide.ATTACKER,
            armyCommitted: 30,
            armyRemaining: 30,
          },
          {
            fortressId: allyFortress.id,
            side: BattlefieldSide.ATTACKER,
            armyCommitted: 70,
            armyRemaining: 70,
          },
        ],
      },
    },
  });

  await processActiveBattlefields({
    db: prisma,
    cycleId: cycle.id,
    tickAt: new Date("2026-04-20T12:02:00.000Z"),
  });

  const ownership = await prisma.mapHexOwnership.findUniqueOrThrow({
    where: { cycleId_tileId: { cycleId: cycle.id, tileId: HOME_OF_A_TILE_ID } },
  });
  const holders = await prisma.homeOfAHolder.findMany({
    where: { cycleId: cycle.id },
    orderBy: { contributionWeight: "asc" },
  });

  assert.equal(ownership.ownerFortressId, bannerFortress.id);
  assert.deepEqual(
    holders.map((holder) => [holder.fortressId, holder.contributionWeight]),
    [
      [bannerFortress.id, 30],
      [allyFortress.id, 70],
    ]
  );
});

test("Home of A tick income splits banner half and holder army share", async (context) => {
  const prisma = getPrismaOrSkip(context);

  if (!prisma) {
    return;
  }

  const banner = await createUser(prisma, "home-income-banner@example.com");
  const ally = await createUser(prisma, "home-income-ally@example.com");
  const cycle = await seedActiveCommunityWishCycle(prisma, [
    {
      userId: banner.id,
      commanderName: "Income Banner",
      fortressName: "Income Banner Keep",
      points: 0,
    },
    {
      userId: ally.id,
      commanderName: "Income Ally",
      fortressName: "Income Ally Keep",
      points: 0,
    },
  ]);
  const [bannerFortress, allyFortress] = await Promise.all([
    prisma.fortress.findUniqueOrThrow({
      where: { cycleId_ownerId: { cycleId: cycle.id, ownerId: banner.id } },
    }),
    prisma.fortress.findUniqueOrThrow({
      where: { cycleId_ownerId: { cycleId: cycle.id, ownerId: ally.id } },
    }),
  ]);

  await prisma.fortress.updateMany({
    where: {
      id: {
        in: [bannerFortress.id, allyFortress.id],
      },
    },
    data: {
      minersAssigned: 0,
      farmersAssigned: 0,
      recruitersAssigned: 0,
    },
  });

  await prisma.mapHexOwnership.create({
    data: {
      cycleId: cycle.id,
      tileId: HOME_OF_A_TILE_ID,
      ownerFortressId: bannerFortress.id,
    },
  });
  await prisma.homeOfAHolder.createMany({
    data: [
      {
        cycleId: cycle.id,
        fortressId: bannerFortress.id,
        bannerFortressId: bannerFortress.id,
        contributionWeight: 30,
      },
      {
        cycleId: cycle.id,
        fortressId: allyFortress.id,
        bannerFortressId: bannerFortress.id,
        contributionWeight: 70,
      },
    ],
  });

  await runGameTick({
    db: prisma,
    now: new Date("2026-04-20T12:01:00.000Z"),
  });

  const [reloadedBanner, reloadedAlly] = await Promise.all([
    prisma.fortress.findUniqueOrThrow({ where: { id: bannerFortress.id } }),
    prisma.fortress.findUniqueOrThrow({ where: { id: allyFortress.id } }),
  ]);

  assert.equal(reloadedBanner.points, 17);
  assert.equal(reloadedAlly.points, 8);
  assert.equal(reloadedBanner.army, 10 - HOME_OF_A_ARMY_DRAIN_PER_TICK);
  assert.equal(reloadedAlly.army, 10 - HOME_OF_A_ARMY_DRAIN_PER_TICK);
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

test("race schema readiness passes when race tables, enums, and columns exist", async (context) => {
  const prisma = getPrismaOrSkip(context);

  if (!prisma) {
    return;
  }

  await withIsolatedDatabase(prisma, async (isolated) => {
    const readiness = await getRaceSchemaReadiness(isolated);

    assert.equal(readiness.ready, true);
    assert.equal(readiness.missingObjects.length, 0);
    assert.equal(readiness.message, null);
  });
});

test("race schema readiness reports missing Dwarf roll columns clearly", async (context) => {
  const prisma = getPrismaOrSkip(context);

  if (!prisma) {
    return;
  }

  await withIsolatedDatabase(prisma, async (isolated) => {
    await isolated.$executeRawUnsafe(`
      ALTER TABLE "DwarfDeepMiningRoll"
      DROP COLUMN "committedGold",
      DROP COLUMN "armyDelta"
    `);

    const readiness = await getRaceSchemaReadiness(isolated);

    assert.equal(readiness.ready, false);
    assert.equal(
      readiness.missingObjects.includes(
        "column DwarfDeepMiningRoll.committedGold"
      ),
      true
    );
    assert.equal(
      readiness.missingObjects.includes("column DwarfDeepMiningRoll.armyDelta"),
      true
    );
    assert.match(readiness.message ?? "", /Run Prisma migrations/);
  });
});

test("race schema readiness reports missing ORK tables and enums clearly", async (context) => {
  const prisma = getPrismaOrSkip(context);

  if (!prisma) {
    return;
  }

  await withIsolatedDatabase(prisma, async (isolated) => {
    await isolated.$executeRawUnsafe('DROP TABLE "OrkScrapBank" CASCADE');
    await isolated.$executeRawUnsafe(
      'ALTER TYPE "OrkBossOrderKind" RENAME TO "OrkBossOrderKind__missing"'
    );

    const readiness = await getRaceSchemaReadiness(isolated);

    assert.equal(readiness.ready, false);
    assert.equal(readiness.missingObjects.includes("table OrkScrapBank"), true);
    assert.equal(
      readiness.missingObjects.includes("enum OrkBossOrderKind"),
      true
    );
  });
});

test("race schema readiness error message is concise for cron logs", async (context) => {
  const prisma = getPrismaOrSkip(context);

  if (!prisma) {
    return;
  }

  await withIsolatedDatabase(prisma, async (isolated) => {
    await isolated.$executeRawUnsafe('DROP TABLE "OrkScrapEvent" CASCADE');

    await assert.rejects(
      () => ensureRaceSchemaReadiness(isolated),
      (error: unknown) => {
        assert.equal(error instanceof RaceSchemaReadinessError, true);
        assert.match(String((error as Error).message), /Race schema preflight failed/);
        assert.match(String((error as Error).message), /Run Prisma migrations/);
        return true;
      }
    );
  });
});

test("runGameTick fails fast on race schema drift before processing minutes", async (context) => {
  const prisma = getPrismaOrSkip(context);

  if (!prisma) {
    return;
  }

  await withIsolatedDatabase(prisma, async (isolated) => {
    const cycle = await seedOpenCycle(isolated);

    await isolated.$executeRawUnsafe('DROP TABLE "OrkBossOrder" CASCADE');

    let runnerError: TickRunnerError | null = null;

    try {
      await runGameTick({
        db: isolated,
        now: new Date("2026-04-20T12:00:00.000Z"),
      });
    } catch (error) {
      runnerError = error as TickRunnerError;
    }

    assert.ok(runnerError);
    assert.equal(runnerError.stage, "schema-preflight");
    assert.equal(
      (runnerError as Error & { cause?: unknown }).cause instanceof
        RaceSchemaReadinessError,
      true
    );
    assert.match(formatTickRunnerError(runnerError), /"stage":"schema-preflight"/);
    assert.equal(await isolated.gameTick.count(), 0);

    const reloadedCycle = await isolated.cycle.findUniqueOrThrow({
      where: {
        id: cycle.id,
      },
    });

    assert.equal(reloadedCycle.status, CycleStatus.REGISTRATION);
  });
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

  assert.equal(getAttackTravelMinutes(origin, target), 50);
  assert.equal(
    getAttackTravelMinutes(origin, target, {
      attackerRace: "UNSTABLE_UNICORNS",
      raceBuffTier: 2,
    }),
    25
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

test("cosmetic sprite styles resolve known shop skins", () => {
  assert.deepEqual(getCosmeticSpriteStyle("UNIT", "silver-knight"), {
    backgroundImage: 'url("/assets/sprite-unit-silver-knight.png")',
    backgroundSize: "contain",
    backgroundPosition: "center",
  });
  assert.deepEqual(getCosmeticSpriteStyle("UNIT", "ranger-scout"), {
    backgroundImage: 'url("/assets/unit-sprite-ranger-scout.png")',
    backgroundSize: "contain",
    backgroundPosition: "center",
  });
  assert.deepEqual(getCosmeticSpriteStyle("FORTRESS", "forest-keep"), {
    backgroundImage: 'url("/assets/sprite-castle-forest-citadel.png")',
    backgroundSize: "contain",
    backgroundPosition: "center",
  });
  assert.deepEqual(getCosmeticSpriteStyle("FORTRESS", "frosthold-bastion"), {
    backgroundImage: 'url("/assets/sprite-castle-frost-bastion.png")',
    backgroundSize: "contain",
    backgroundPosition: "center",
  });
  assert.deepEqual(getCosmeticSpriteStyle("FORTRESS", "cyber-fortress"), {
    backgroundImage: 'url("/assets/sprite-fortress-Cyber-Fortress.png")',
    backgroundSize: "contain",
    backgroundPosition: "center",
  });
  assert.deepEqual(getCosmeticSpriteStyle("FORTRESS", "desert-fortress"), {
    backgroundImage: 'url("/assets/sprite-castle-Desert-Fortress.png")',
    backgroundSize: "contain",
    backgroundPosition: "center",
  });
  assert.deepEqual(getCosmeticSpriteStyle("FORTRESS", "crystal-citadel"), {
    backgroundImage: 'url("/assets/sprite-castle-Crystal-Citadel.png")',
    backgroundSize: "contain",
    backgroundPosition: "center",
  });
  assert.deepEqual(getCosmeticSpriteStyle("FORTRESS", "swamp-keep"), {
    backgroundImage: 'url("/assets/sprite-fortress-Swamp-Keep.png")',
    backgroundSize: "contain",
    backgroundPosition: "center",
  });
  assert.deepEqual(
    getCosmeticSpriteStyle("FORTRESS", "mechanical-drill-fortress"),
    {
      backgroundImage:
        'url("/assets/sprite-fortress-Mechanical-Drill-Fortress.png")',
      backgroundSize: "contain",
      backgroundPosition: "center",
    }
  );
  assert.deepEqual(getCosmeticSpriteStyle("FORTRESS", "ancient-mire-temple"), {
    backgroundImage: 'url("/assets/sprite-fortress-Ancient-Mire-Temple.png")',
    backgroundSize: "contain",
    backgroundPosition: "center",
  });
});

test("cosmetic sprite metadata excludes skins without dedicated replacements", () => {
  const removedFortressVariants = ["golden-capital", "shadow-spire"];
  const removedUnitVariants = [
    "steam-engineer",
    "clockwork-smith",
    "purple-necromancer",
    "gold-prospector",
    "bone-reaver",
    "hooded-hexer",
    "crystal-warlock",
  ];
  const activeFortressVariants: string[] =
    ARCADE_FORTRESS_LOOT_BOX_SKINS_SET_1.map((skin) => skin.variant);
  const activeLegacyUnitVariants: string[] =
    ARCADE_UNIT_LOOT_BOX_SKINS_LEGACY.map((skin) => skin.variant);

  for (const variant of removedFortressVariants) {
    assert.equal(activeFortressVariants.includes(variant), false);
    assert.equal(getCosmeticSpriteStyle("FORTRESS", variant), null);
  }

  for (const variant of removedUnitVariants) {
    assert.equal(activeLegacyUnitVariants.includes(variant), false);
    assert.equal(getCosmeticSpriteStyle("UNIT", variant), null);
  }

  assert.equal(activeLegacyUnitVariants.includes("ranger-scout"), true);
});

test("dedicated cosmetic sprite asset gaps report current set status", () => {
  assert.deepEqual(getDedicatedCosmeticSpriteAssetGaps(), {
    fortressMissing: [],
    unitMissing: [],
    extraDedicatedAssets: ["sprite-unit-lich.png"],
  });
});

test("unstable unicorn default cosmetic variants are deterministic", () => {
  assert.equal(
    getDefaultRaceCosmeticVariant({
      slot: "FORTRESS",
      race: "DWARFS",
      seed: "fortress-a",
    }),
    null
  );
  assert.equal(
    getDefaultRaceCosmeticVariant({
      slot: "FORTRESS",
      race: "UNSTABLE_UNICORNS",
      seed: "fortress-a",
    }),
    getDefaultRaceCosmeticVariant({
      slot: "FORTRESS",
      race: "UNSTABLE_UNICORNS",
      seed: "fortress-a",
    })
  );
  assert.notEqual(
    getCosmeticSpriteStyle(
      "FORTRESS",
      getDefaultRaceCosmeticVariant({
        slot: "FORTRESS",
        race: "UNSTABLE_UNICORNS",
        seed: "fortress-a",
      })
    ),
    null
  );
  assert.notEqual(
    getCosmeticSpriteStyle(
      "UNIT",
      getDefaultRaceCosmeticVariant({
        slot: "UNIT",
        race: "UNSTABLE_UNICORNS",
        seed: "fortress-a",
      })
    ),
    null
  );
});

test("free unicorn teleport creates a temporary move and home decoy", async (context) => {
  const prisma = getPrismaOrSkip(context);

  if (!prisma) {
    return;
  }

  const cycle = await seedOpenCycle(prisma);
  const unicorn = await createUser(prisma, "unicorn-decoy@example.com");
  const murine = await createUser(prisma, "murine-no-decoy@example.com");

  await joinRegistrationCycle({
    db: prisma,
    userId: unicorn.id,
    commanderName: "Unicorn Decoy",
    fortressName: "Glitter Keep",
  });
  await joinRegistrationCycle({
    db: prisma,
    userId: murine.id,
    commanderName: "Murine No Decoy",
    fortressName: "Plain Keep",
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
      activeStartedAt: new Date("2026-04-19T08:00:00.000Z"),
    },
  });
  await selectFortressRace({
    db: prisma,
    userId: unicorn.id,
    race: FortressRace.UNSTABLE_UNICORNS,
    now: new Date("2026-04-20T12:01:00.000Z"),
  });
  await selectFortressRace({
    db: prisma,
    userId: murine.id,
    race: FortressRace.SPACE_MURINES,
    now: new Date("2026-04-20T12:01:00.000Z"),
  });

  const unicornBeforeTeleport = await prisma.fortress.findUniqueOrThrow({
    where: {
      cycleId_ownerId: {
        cycleId: cycle.id,
        ownerId: unicorn.id,
      },
    },
  });

  await claimUnicornTeleport({
    db: prisma,
    userId: unicorn.id,
    now: new Date("2026-04-20T12:02:00.000Z"),
  });
  await shuffleFortressLocation({
    db: prisma,
    userId: unicorn.id,
    useFreeTeleport: true,
    now: new Date("2026-04-20T12:03:00.000Z"),
  });

  const firstDecoy = await prisma.fortress.findFirstOrThrow({
    where: {
      cycleId: cycle.id,
      fortressKind: FortressKind.UNICORN_DECOY,
      health: {
        gt: 0,
      },
    },
  });

  assert.equal(firstDecoy.mapX, unicornBeforeTeleport.mapX);
  assert.equal(firstDecoy.mapY, unicornBeforeTeleport.mapY);
  assert.equal(firstDecoy.unicornDecoyLevel, 1);

  const otherPlayerState = await getHomePageState({
    db: prisma,
    userId: murine.id,
    now: new Date("2026-04-20T12:03:30.000Z"),
  });
  const disguisedDecoyMarker = otherPlayerState.mapFortresses.find(
    (fortress) => fortress.id === firstDecoy.id
  );
  const disguisedDecoyTarget = otherPlayerState.availableTargets.find(
    (target) => target.id === firstDecoy.id
  );

  assert.ok(disguisedDecoyMarker);
  assert.equal(disguisedDecoyMarker.fortressKind, FortressKind.PLAYER);
  assert.equal(disguisedDecoyMarker.unicornDecoyLevel, null);
  assert.equal(disguisedDecoyMarker.name, unicornBeforeTeleport.name);
  assert.equal(
    disguisedDecoyMarker.commanderName,
    unicornBeforeTeleport.commanderName
  );
  assert.equal(disguisedDecoyMarker.race, FortressRace.UNSTABLE_UNICORNS);
  assert.equal(disguisedDecoyMarker.isNpc, false);

  assert.ok(disguisedDecoyTarget);
  assert.equal(disguisedDecoyTarget.fortressKind, FortressKind.PLAYER);
  assert.equal(disguisedDecoyTarget.unicornDecoyLevel, null);
  assert.equal(disguisedDecoyTarget.name, unicornBeforeTeleport.name);
  assert.equal(
    disguisedDecoyTarget.commanderName,
    unicornBeforeTeleport.commanderName
  );

  const temporaryTeleport =
    await prisma.unicornTemporaryTeleport.findFirstOrThrow({
      where: {
        fortressId: unicornBeforeTeleport.id,
        returnedAt: null,
      },
    });

  assert.equal(temporaryTeleport.originMapX, unicornBeforeTeleport.mapX);
  assert.equal(temporaryTeleport.originMapY, unicornBeforeTeleport.mapY);
  assert.equal(temporaryTeleport.decoyFortressId, firstDecoy.id);
  assert.equal(
    temporaryTeleport.returnAt.toISOString(),
    "2026-04-20T13:03:00.000Z"
  );

  const unicornState = await getHomePageState({
    db: prisma,
    userId: unicorn.id,
    now: new Date("2026-04-20T12:04:00.000Z"),
  });

  assert.equal(
    unicornState.playerSummary?.activeUnicornTeleport?.originTile,
    `${unicornBeforeTeleport.mapX}:${unicornBeforeTeleport.mapY}`
  );
  assert.equal(
    unicornState.playerSummary?.raceBuffs.canClaimUnicornTeleport,
    false
  );

  await claimUnicornTeleport({
    db: prisma,
    userId: unicorn.id,
    now: new Date("2026-04-20T13:02:00.000Z"),
  });
  await assert.rejects(
    () =>
      shuffleFortressLocation({
        db: prisma,
        userId: unicorn.id,
        useFreeTeleport: true,
        now: new Date("2026-04-20T13:02:30.000Z"),
      }),
    /has not returned home/
  );
});

test("free unicorn teleport returns home after one hour and clears its decoy", async (context) => {
  const prisma = getPrismaOrSkip(context);

  if (!prisma) {
    return;
  }

  const cycle = await seedOpenCycle(prisma);
  const unicorn = await createUser(prisma, "unicorn-return@example.com");

  await joinRegistrationCycle({
    db: prisma,
    userId: unicorn.id,
    commanderName: "Unicorn Return",
    fortressName: "Return Keep",
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
      activeStartedAt: new Date("2026-04-19T08:00:00.000Z"),
    },
  });
  await selectFortressRace({
    db: prisma,
    userId: unicorn.id,
    race: FortressRace.UNSTABLE_UNICORNS,
    now: new Date("2026-04-20T12:01:00.000Z"),
  });

  const fortressBeforeTeleport = await prisma.fortress.findUniqueOrThrow({
    where: {
      cycleId_ownerId: {
        cycleId: cycle.id,
        ownerId: unicorn.id,
      },
    },
  });

  await claimUnicornTeleport({
    db: prisma,
    userId: unicorn.id,
    now: new Date("2026-04-20T12:02:00.000Z"),
  });
  await shuffleFortressLocation({
    db: prisma,
    userId: unicorn.id,
    useFreeTeleport: true,
    now: new Date("2026-04-20T12:03:00.000Z"),
  });

  await runGameTick({
    db: prisma,
    now: new Date("2026-04-20T12:45:00.000Z"),
  });

  assert.equal(
    await prisma.unicornTemporaryTeleport.count({
      where: {
        fortressId: fortressBeforeTeleport.id,
        returnedAt: null,
      },
    }),
    1
  );

  await runGameTick({
    db: prisma,
    now: new Date("2026-04-20T13:04:00.000Z"),
  });

  const fortressAfterReturn = await prisma.fortress.findUniqueOrThrow({
    where: {
      id: fortressBeforeTeleport.id,
    },
  });
  const returnedTeleport =
    await prisma.unicornTemporaryTeleport.findFirstOrThrow({
      where: {
        fortressId: fortressBeforeTeleport.id,
      },
    });

  assert.equal(fortressAfterReturn.mapX, fortressBeforeTeleport.mapX);
  assert.equal(fortressAfterReturn.mapY, fortressBeforeTeleport.mapY);
  assert.notEqual(returnedTeleport.returnedAt, null);
  assert.equal(
    await prisma.fortress.count({
      where: {
        id: returnedTeleport.decoyFortressId ?? "",
        health: {
          gt: 0,
        },
      },
    }),
    0
  );
});

test("free unicorn teleport delays return while the home tile is occupied", async (context) => {
  const prisma = getPrismaOrSkip(context);

  if (!prisma) {
    return;
  }

  const cycle = await seedOpenCycle(prisma);
  const unicorn = await createUser(
    prisma,
    "unicorn-blocked-return@example.com"
  );
  const blocker = await createUser(
    prisma,
    "unicorn-return-blocker@example.com"
  );

  await joinRegistrationCycle({
    db: prisma,
    userId: unicorn.id,
    commanderName: "Blocked Unicorn",
    fortressName: "Blocked Keep",
  });
  await joinRegistrationCycle({
    db: prisma,
    userId: blocker.id,
    commanderName: "Return Blocker",
    fortressName: "Blocker Keep",
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
      activeStartedAt: new Date("2026-04-19T08:00:00.000Z"),
    },
  });
  await selectFortressRace({
    db: prisma,
    userId: unicorn.id,
    race: FortressRace.UNSTABLE_UNICORNS,
    now: new Date("2026-04-20T12:01:00.000Z"),
  });

  const fortressBeforeTeleport = await prisma.fortress.findUniqueOrThrow({
    where: {
      cycleId_ownerId: {
        cycleId: cycle.id,
        ownerId: unicorn.id,
      },
    },
  });
  const blockerBeforeMove = await prisma.fortress.findUniqueOrThrow({
    where: {
      cycleId_ownerId: {
        cycleId: cycle.id,
        ownerId: blocker.id,
      },
    },
  });

  await claimUnicornTeleport({
    db: prisma,
    userId: unicorn.id,
    now: new Date("2026-04-20T12:02:00.000Z"),
  });
  await shuffleFortressLocation({
    db: prisma,
    userId: unicorn.id,
    useFreeTeleport: true,
    now: new Date("2026-04-20T12:03:00.000Z"),
  });
  const fortressDuringTeleport = await prisma.fortress.findUniqueOrThrow({
    where: {
      id: fortressBeforeTeleport.id,
    },
  });

  await prisma.fortress.update({
    where: {
      id: blockerBeforeMove.id,
    },
    data: {
      mapX: fortressBeforeTeleport.mapX,
      mapY: fortressBeforeTeleport.mapY,
    },
  });

  await runGameTick({
    db: prisma,
    now: new Date("2026-04-20T13:04:00.000Z"),
  });

  const stillAway = await prisma.fortress.findUniqueOrThrow({
    where: {
      id: fortressBeforeTeleport.id,
    },
  });

  assert.equal(stillAway.mapX, fortressDuringTeleport.mapX);
  assert.equal(stillAway.mapY, fortressDuringTeleport.mapY);
  assert.equal(
    await prisma.unicornTemporaryTeleport.count({
      where: {
        fortressId: fortressBeforeTeleport.id,
        returnedAt: null,
      },
    }),
    1
  );

  await prisma.fortress.update({
    where: {
      id: blockerBeforeMove.id,
    },
    data: {
      mapX: blockerBeforeMove.mapX,
      mapY: blockerBeforeMove.mapY,
    },
  });
  await runGameTick({
    db: prisma,
    now: new Date("2026-04-20T13:05:00.000Z"),
  });

  const returnedHome = await prisma.fortress.findUniqueOrThrow({
    where: {
      id: fortressBeforeTeleport.id,
    },
  });

  assert.equal(returnedHome.mapX, fortressBeforeTeleport.mapX);
  assert.equal(returnedHome.mapY, fortressBeforeTeleport.mapY);
});

test("attacking a unicorn teleport decoy destroys it and applies backlash", async (context) => {
  const prisma = getPrismaOrSkip(context);

  if (!prisma) {
    return;
  }

  const cycle = await seedOpenCycle(prisma);
  const unicorn = await createUser(prisma, "unicorn-decoy-target@example.com");
  const attacker = await createUser(
    prisma,
    "unicorn-decoy-attacker@example.com"
  );

  await joinRegistrationCycle({
    db: prisma,
    userId: unicorn.id,
    commanderName: "Decoy Target",
    fortressName: "Decoy Target Keep",
  });
  await joinRegistrationCycle({
    db: prisma,
    userId: attacker.id,
    commanderName: "Decoy Attacker",
    fortressName: "Decoy Attacker Keep",
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
      activeStartedAt: new Date("2026-04-19T08:00:00.000Z"),
    },
  });
  await selectFortressRace({
    db: prisma,
    userId: unicorn.id,
    race: FortressRace.UNSTABLE_UNICORNS,
    now: new Date("2026-04-20T12:01:00.000Z"),
  });
  await selectFortressRace({
    db: prisma,
    userId: attacker.id,
    race: FortressRace.DWARFS,
    now: new Date("2026-04-20T12:01:00.000Z"),
  });

  await claimUnicornTeleport({
    db: prisma,
    userId: unicorn.id,
    now: new Date("2026-04-20T12:02:00.000Z"),
  });
  await shuffleFortressLocation({
    db: prisma,
    userId: unicorn.id,
    useFreeTeleport: true,
    now: new Date("2026-04-20T12:03:00.000Z"),
  });

  const decoy = await prisma.fortress.findFirstOrThrow({
    where: {
      cycleId: cycle.id,
      fortressKind: FortressKind.UNICORN_DECOY,
      health: {
        gt: 0,
      },
    },
  });
  const unicornFortressBefore = await prisma.fortress.findUniqueOrThrow({
    where: {
      cycleId_ownerId: {
        cycleId: cycle.id,
        ownerId: unicorn.id,
      },
    },
  });
  const attackerFortress = await prisma.fortress.findUniqueOrThrow({
    where: {
      cycleId_ownerId: {
        cycleId: cycle.id,
        ownerId: attacker.id,
      },
    },
  });

  await prisma.fortress.update({
    where: {
      id: attackerFortress.id,
    },
    data: {
      army: 250,
      food: 0,
      farmersAssigned: 0,
      recruitersAssigned: 0,
    },
  });
  await setFortressAction({
    db: prisma,
    userId: attacker.id,
    action: FortressAction.ATTACK,
    targetFortressId: decoy.id,
    sentArmy: 250,
    now: new Date("2026-04-20T12:04:00.000Z"),
  });

  const attackUnit = await prisma.attackUnit.findFirstOrThrow({
    where: {
      attackerFortressId: attackerFortress.id,
      targetFortressId: decoy.id,
    },
  });

  await runGameTick({
    db: prisma,
    now: attackUnit.arrivesAt,
  });

  const resolvedAttackUnit = await prisma.attackUnit.findUniqueOrThrow({
    where: {
      id: attackUnit.id,
    },
  });
  const refreshedDecoy = await prisma.fortress.findUniqueOrThrow({
    where: {
      id: decoy.id,
    },
  });
  const unicornFortressAfter = await prisma.fortress.findUniqueOrThrow({
    where: {
      id: unicornFortressBefore.id,
    },
  });
  const decoyEvents = await prisma.scoreEvent.findMany({
    where: {
      cycleId: cycle.id,
      fortressId: attackerFortress.id,
      targetFortressId: decoy.id,
      eventType: ScoreEventType.UNICORN_DECOY_DESTROY,
    },
  });

  assert.equal(resolvedAttackUnit.attackerReturned, 50);
  assert.equal(resolvedAttackUnit.attackerRetired, 200);
  assert.equal(resolvedAttackUnit.pointsLooted, 0);
  assert.equal(resolvedAttackUnit.foodLooted, 0);
  assert.equal(refreshedDecoy.health, 0);
  assert.equal(unicornFortressAfter.points, unicornFortressBefore.points);
  assert.equal(unicornFortressAfter.food, unicornFortressBefore.food);
  assert.equal(unicornFortressAfter.army, unicornFortressBefore.army);
  assert.equal(decoyEvents.length, 1);
});

test("loot camps spawn deterministically across each gameplay hour", async (context) => {
  const prisma = getPrismaOrSkip(context);

  if (!prisma) {
    return;
  }

  const player = await createUser(prisma, "loot-spawn-player@example.com");
  const activeStartedAt = new Date("2026-04-20T12:00:00.000Z");
  const cycle = await seedActiveCommunityWishCycle(
    prisma,
    [
      {
        userId: player.id,
        commanderName: "Loot Spawn",
        fortressName: "Loot Spawn Keep",
        points: 0,
      },
    ],
    new Date("2026-04-20T14:30:00.000Z")
  );
  const hourStart = new Date("2026-04-20T13:00:00.000Z");
  const expectedSchedule = getLootCampScheduleForHour({
    cycleId: cycle.id,
    activeStartedAt,
    hourStart,
  });

  assert.ok(expectedSchedule.length >= 1);
  assert.ok(expectedSchedule.length <= 3);
  assert.equal(
    new Set(expectedSchedule.map((entry) => entry.minute)).size,
    expectedSchedule.length
  );

  await runGameTick({
    db: prisma,
    now: new Date("2026-04-20T13:59:00.000Z"),
  });
  await runGameTick({
    db: prisma,
    now: new Date("2026-04-20T13:59:00.000Z"),
  });

  const spawnedThisHour = await prisma.fortress.findMany({
    where: {
      cycleId: cycle.id,
      fortressKind: FortressKind.LOOT_CAMP,
      joinedAt: {
        gte: hourStart,
        lt: new Date("2026-04-20T14:00:00.000Z"),
      },
    },
    select: {
      id: true,
      lootCampVariant: true,
      maxHealth: true,
      army: true,
      expiresAt: true,
    },
  });

  assert.equal(spawnedThisHour.length, expectedSchedule.length);

  for (const camp of spawnedThisHour) {
    assert.ok(camp.lootCampVariant);
    assert.ok(camp.maxHealth >= 100);
    assert.ok(camp.maxHealth <= 10000);
    assert.equal(
      camp.army,
      getLootCampDefenseArmy(camp.lootCampVariant, camp.maxHealth)
    );
    assert.ok(camp.expiresAt);
  }
});

test("loot camp defending army scales by variant", () => {
  assert.equal(getLootCampDefenseArmy(LootCampVariant.CLASSIC, 100), 5);
  assert.equal(getLootCampDefenseArmy(LootCampVariant.RICH, 100), 8);
  assert.equal(getLootCampDefenseArmy(LootCampVariant.CHAOS, 100), 12);
  assert.equal(getLootCampDefenseArmy(LootCampVariant.CLASSIC, 10000), 500);
  assert.equal(getLootCampDefenseArmy(LootCampVariant.RICH, 10000), 800);
  assert.equal(getLootCampDefenseArmy(LootCampVariant.CHAOS, 10000), 1200);
});

test("loot camps expire and disappear from the home page read model", async (context) => {
  const prisma = getPrismaOrSkip(context);

  if (!prisma) {
    return;
  }

  const player = await createUser(prisma, "loot-expiry-player@example.com");
  const cycle = await seedActiveCommunityWishCycle(
    prisma,
    [
      {
        userId: player.id,
        commanderName: "Loot Expiry",
        fortressName: "Loot Expiry Keep",
        points: 0,
      },
    ],
    new Date("2026-04-20T13:00:00.000Z")
  );
  const camp = await createLootCamp(prisma, {
    cycleId: cycle.id,
    variant: LootCampVariant.CLASSIC,
    strength: 100,
    now: new Date("2026-04-20T12:00:00.000Z"),
    mapX: 45,
    mapY: 45,
    suffix: "expiry",
  });

  await runGameTick({
    db: prisma,
    now: new Date("2026-04-20T12:31:00.000Z"),
  });

  const expiredCamp = await prisma.fortress.findUniqueOrThrow({
    where: {
      id: camp.id,
    },
  });
  const state = await getHomePageState({
    db: prisma,
    userId: player.id,
    now: new Date("2026-04-20T12:31:00.000Z"),
  });

  assert.equal(expiredCamp.health, 0);
  assert.equal(
    state.mapFortresses.some((fortress) => fortress.id === camp.id),
    false
  );
});

test("loot camp raids apply variant rewards without mega fortress progression", async (context) => {
  const prisma = getPrismaOrSkip(context);

  if (!prisma) {
    return;
  }

  const db = prisma;
  const attacker = await createUser(db, "loot-attacker@example.com");
  const cycle = await seedActiveCommunityWishCycle(
    db,
    [
      {
        userId: attacker.id,
        commanderName: "Loot Attacker",
        fortressName: "Loot Attacker Keep",
        points: 0,
      },
    ],
    new Date("2026-04-20T15:00:00.000Z")
  );
  const attackerFortress = await db.fortress.update({
    where: {
      cycleId_ownerId: {
        cycleId: cycle.id,
        ownerId: attacker.id,
      },
    },
    data: {
      race: FortressRace.ORKS,
      army: 1000,
      level: MAX_FORTRESS_LEVEL,
      food: 0,
      points: 0,
      minersAssigned: 0,
      farmersAssigned: 0,
      recruitersAssigned: 0,
      mapX: 50,
      mapY: 50,
    },
  });
  const waaaghUsedAt = new Date("2026-04-20T12:01:00.000Z");

  await db.raceAbilityActivation.create({
    data: {
      fortressId: attackerFortress.id,
      kind: RaceAbilityKind.ORK_WAAAGH,
      activeFrom: waaaghUsedAt,
      activeUntil: addMinutes(waaaghUsedAt, 30),
      usedAt: waaaghUsedAt,
    },
  });

  async function destroyCamp(
    variant: LootCampVariant,
    now: Date,
    suffix: string,
    mapY: number
  ) {
    await db.fortress.update({
      where: {
        id: attackerFortress.id,
      },
      data: {
        army: 1000,
      },
    });

    const camp = await createLootCamp(db, {
      cycleId: cycle.id,
      variant,
      strength: 100,
      now,
      mapX: 52,
      mapY,
      suffix,
    });

    await setFortressAction({
      db,
      userId: attacker.id,
      action: FortressAction.ATTACK,
      targetFortressId: camp.id,
      sentArmy: 100,
      now,
    });

    const attackUnit = await db.attackUnit.findFirstOrThrow({
      where: {
        attackerFortressId: attackerFortress.id,
        targetFortressId: camp.id,
      },
      orderBy: {
        launchedAt: "desc",
      },
    });

    await runGameTick({
      db,
      now: attackUnit.arrivesAt,
    });

    return {
      camp,
      attackUnit: await db.attackUnit.findUniqueOrThrow({
        where: {
          id: attackUnit.id,
        },
      }),
    };
  }

  const classic = await destroyCamp(
    LootCampVariant.CLASSIC,
    new Date("2026-04-20T12:02:00.000Z"),
    "classic",
    51
  );
  const rich = await destroyCamp(
    LootCampVariant.RICH,
    new Date("2026-04-20T12:05:00.000Z"),
    "rich",
    52
  );
  const chaos = await destroyCamp(
    LootCampVariant.CHAOS,
    new Date("2026-04-20T12:08:00.000Z"),
    "chaos",
    53
  );
  const refreshedAttacker = await db.fortress.findUniqueOrThrow({
    where: {
      id: attackerFortress.id,
    },
  });
  const richRewardEvents = await db.scoreEvent.findMany({
    where: {
      cycleId: cycle.id,
      fortressId: attackerFortress.id,
      targetFortressId: rich.camp.id,
      eventType: ScoreEventType.LOOT_CAMP_REWARD,
    },
  });
  const latestWaaagh = await db.raceAbilityActivation.findFirstOrThrow({
    where: {
      fortressId: attackerFortress.id,
      kind: RaceAbilityKind.ORK_WAAAGH,
    },
    orderBy: {
      usedAt: "desc",
    },
  });
  const refreshedCycle = await db.cycle.findUniqueOrThrow({
    where: {
      id: cycle.id,
    },
  });

  assert.equal(classic.attackUnit.foodLooted, 100);
  assert.equal(classic.attackUnit.pointsLooted, 0);
  assert.equal(rich.attackUnit.pointsLooted, 100);
  assert.equal(rich.attackUnit.foodLooted, 0);
  assert.equal(chaos.attackUnit.armyLooted, 100);
  assert.ok(refreshedAttacker.food >= 100);
  assert.ok(refreshedAttacker.gold >= 100);
  assert.ok(refreshedAttacker.army >= 100);
  assert.equal(richRewardEvents.length, 1);
  assert.ok(latestWaaagh.usedAt < waaaghUsedAt);
  assert.equal(refreshedCycle.megaFortressDestroyCount, 0);
  assert.equal(refreshedCycle.upgradesUnlockedAt, null);
  assert.equal(refreshedCycle.crownedFortressId, null);
});

test("activating WAAAGH posts a global system chat announcement", async (context) => {
  const prisma = getPrismaOrSkip(context);

  if (!prisma) {
    return;
  }

  const ork = await createUser(prisma, "waaagh-announcer@example.com");
  const cycle = await seedActiveCommunityWishCycle(
    prisma,
    [
      {
        userId: ork.id,
        commanderName: "Big Shouta",
        fortressName: "Noise Fort",
        points: 0,
      },
    ],
    new Date("2026-04-20T15:00:00.000Z")
  );

  await prisma.fortress.update({
    where: {
      cycleId_ownerId: {
        cycleId: cycle.id,
        ownerId: ork.id,
      },
    },
    data: {
      race: FortressRace.ORKS,
    },
  });

  await activateRaceAbility({
    userId: ork.id,
    kind: RaceAbilityKind.ORK_WAAAGH,
    now: new Date("2026-04-20T12:05:00.000Z"),
    db: prisma,
  });

  const announcement = await prisma.chatMessage.findFirstOrThrow({
    where: {
      cycleId: cycle.id,
      body: {
        contains: "WAAAGH",
      },
    },
    include: {
      author: true,
    },
  });

  assert.equal(announcement.author.email, NPC_SYSTEM_USER_EMAIL);
  assert.equal(announcement.type, ChatMessageType.TEXT);
  assert.match(announcement.body, /Noise Fort/);
  assert.match(announcement.body, /Big Shouta/);
});

test("underpowered loot camp raids lose without damaging health or paying rewards", async (context) => {
  const prisma = getPrismaOrSkip(context);

  if (!prisma) {
    return;
  }

  const attacker = await createUser(
    prisma,
    "loot-partial-attacker@example.com"
  );
  const cycle = await seedActiveCommunityWishCycle(
    prisma,
    [
      {
        userId: attacker.id,
        commanderName: "Loot Partial",
        fortressName: "Loot Partial Keep",
        points: 0,
      },
    ],
    new Date("2026-04-20T13:00:00.000Z")
  );
  const attackerFortress = await prisma.fortress.update({
    where: {
      cycleId_ownerId: {
        cycleId: cycle.id,
        ownerId: attacker.id,
      },
    },
    data: {
      race: FortressRace.DWARFS,
      army: 10,
      level: 0,
      food: 0,
      points: 0,
      minersAssigned: 0,
      farmersAssigned: 0,
      recruitersAssigned: 0,
      mapX: 50,
      mapY: 50,
    },
  });
  const camp = await createLootCamp(prisma, {
    cycleId: cycle.id,
    variant: LootCampVariant.RICH,
    strength: 10000,
    now: new Date("2026-04-20T12:01:00.000Z"),
    mapX: 52,
    mapY: 50,
    suffix: "partial",
  });

  await setFortressAction({
    db: prisma,
    userId: attacker.id,
    action: FortressAction.ATTACK,
    targetFortressId: camp.id,
    sentArmy: 1,
    now: new Date("2026-04-20T12:02:00.000Z"),
  });

  const attackUnit = await prisma.attackUnit.findFirstOrThrow({
    where: {
      attackerFortressId: attackerFortress.id,
      targetFortressId: camp.id,
    },
  });

  await runGameTick({
    db: prisma,
    now: attackUnit.arrivesAt,
  });

  const damagedCamp = await prisma.fortress.findUniqueOrThrow({
    where: {
      id: camp.id,
    },
  });
  const resolvedAttack = await prisma.attackUnit.findUniqueOrThrow({
    where: {
      id: attackUnit.id,
    },
  });

  assert.equal(damagedCamp.health, 10000);
  assert.ok(
    damagedCamp.army < getLootCampDefenseArmy(LootCampVariant.RICH, 10000)
  );
  assert.equal(resolvedAttack.pointsLooted, 0);
  assert.equal(resolvedAttack.foodLooted, 0);
  assert.equal(resolvedAttack.armyLooted, 0);
  assert.equal(resolvedAttack.attackerReturned, 0);
});

test("winning loot camp raids damage health and return surviving attackers", async (context) => {
  const prisma = getPrismaOrSkip(context);

  if (!prisma) {
    return;
  }

  const attacker = await createUser(
    prisma,
    "loot-winning-partial-attacker@example.com"
  );
  const cycle = await seedActiveCommunityWishCycle(
    prisma,
    [
      {
        userId: attacker.id,
        commanderName: "Loot Winner",
        fortressName: "Loot Winner Keep",
        points: 0,
      },
    ],
    new Date("2026-04-20T13:00:00.000Z")
  );
  const attackerFortress = await prisma.fortress.update({
    where: {
      cycleId_ownerId: {
        cycleId: cycle.id,
        ownerId: attacker.id,
      },
    },
    data: {
      race: FortressRace.DWARFS,
      army: 2000,
      level: 0,
      food: 0,
      points: 0,
      minersAssigned: 0,
      farmersAssigned: 0,
      recruitersAssigned: 0,
      mapX: 50,
      mapY: 50,
    },
  });
  const camp = await createLootCamp(prisma, {
    cycleId: cycle.id,
    variant: LootCampVariant.RICH,
    strength: 10000,
    now: new Date("2026-04-20T12:01:00.000Z"),
    mapX: 52,
    mapY: 50,
    suffix: "winning-partial",
  });

  await setFortressAction({
    db: prisma,
    userId: attacker.id,
    action: FortressAction.ATTACK,
    targetFortressId: camp.id,
    sentArmy: 1000,
    now: new Date("2026-04-20T12:02:00.000Z"),
  });

  const attackUnit = await prisma.attackUnit.findFirstOrThrow({
    where: {
      attackerFortressId: attackerFortress.id,
      targetFortressId: camp.id,
    },
  });

  await runGameTick({
    db: prisma,
    now: attackUnit.arrivesAt,
  });

  const damagedCamp = await prisma.fortress.findUniqueOrThrow({
    where: {
      id: camp.id,
    },
  });
  const resolvedAttack = await prisma.attackUnit.findUniqueOrThrow({
    where: {
      id: attackUnit.id,
    },
  });

  assert.equal(damagedCamp.health, 8000);
  assert.ok(
    damagedCamp.army < getLootCampDefenseArmy(LootCampVariant.RICH, 10000)
  );
  assert.equal(resolvedAttack.pointsLooted, 0);
  assert.equal(resolvedAttack.foodLooted, 0);
  assert.equal(resolvedAttack.armyLooted, 0);
  assert.ok((resolvedAttack.attackerReturned ?? 0) > 0);
});

test("cosmetic sprite styles leave unknown and filter skins to css fallback", () => {
  assert.equal(getCosmeticSpriteStyle("UNIT", "ember"), null);
  assert.equal(getCosmeticSpriteStyle("FORTRESS", "missing-skin"), null);
  assert.equal(getCosmeticSpriteStyle("UNIT", null), null);
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
    rankedFortresses: [{ ownerId: secondUser.id }, { ownerId: firstUser.id }],
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

async function withIsolatedDatabase<T>(
  baseClient: PrismaClient,
  run: (isolatedClient: PrismaClient) => Promise<T>
) {
  const isolated = await setupDatabase();

  try {
    return await run(isolated.client);
  } finally {
    await isolated.client.$disconnect();
    await baseClient.$executeRawUnsafe(
      `DROP SCHEMA IF EXISTS "${isolated.schema}" CASCADE`
    );
  }
}

async function resetDatabase(client: PrismaClient) {
  await client.attackUnit.deleteMany();
  await client.battlefieldParticipant.deleteMany();
  await client.battlefield.deleteMany();
  await client.homeOfAHolder.deleteMany();
  await client.orkScrapEvent.deleteMany();
  await client.orkWaaaghInvestment.deleteMany();
  await client.orkBossOrder.deleteMany();
  await client.orkScrapBank.deleteMany();
  await client.mapHexClaimProject.deleteMany();
  await client.mapHexOwnership.deleteMany();
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

async function createLootCamp(
  client: PrismaClient,
  input: {
    cycleId: string;
    variant: LootCampVariant;
    strength: number;
    now: Date;
    mapX?: number;
    mapY?: number;
    suffix?: string;
  }
) {
  const owner = await client.user.create({
    data: {
      name: "Loot Camp NPC",
    },
  });
  const suffix = input.suffix ?? randomUUID().slice(0, 8);
  const variantName =
    input.variant === LootCampVariant.CLASSIC
      ? "Classic"
      : input.variant === LootCampVariant.RICH
        ? "Rich"
        : "Chaos";

  return client.fortress.create({
    data: {
      cycleId: input.cycleId,
      ownerId: owner.id,
      commanderName: `${variantName} Loot Camp ${suffix}`,
      commanderNameRegisteredAt: input.now,
      name: `${variantName} Loot Camp ${suffix}`,
      fortressKind: FortressKind.LOOT_CAMP,
      lootCampVariant: input.variant,
      isNpc: true,
      health: input.strength,
      maxHealth: input.strength,
      food: 0,
      army: getLootCampDefenseArmy(input.variant, input.strength),
      minersAssigned: 0,
      farmersAssigned: 0,
      recruitersAssigned: 0,
      expiresAt: addMinutes(input.now, 30),
      mapX: input.mapX ?? 50,
      mapY: input.mapY ?? 50,
      joinedAt: input.now,
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

test("NPC fortresses do not consume player join slots", async (context) => {
  const prisma = getPrismaOrSkip(context);

  if (!prisma) {
    return;
  }

  const cycle = await seedOpenCycle(prisma);

  for (let index = 0; index < ACTIVE_PLAYER_CAP - 1; index += 1) {
    const user = await createUser(prisma, `npc-slot-${index}@example.com`);

    await joinRegistrationCycle({
      db: prisma,
      userId: user.id,
      fortressName: `Npc Slot ${index}`,
      now: new Date("2026-04-19T12:10:00.000Z"),
    });
  }

  const npcOwner = await createUser(prisma, "npc-slot-owner@example.com");

  await prisma.fortress.create({
    data: {
      cycleId: cycle.id,
      ownerId: npcOwner.id,
      commanderName: "Npc Slot Camp",
      name: "Npc Slot Camp",
      isNpc: true,
      fortressKind: FortressKind.LOOT_CAMP,
      mapX: 999,
      mapY: 999,
    },
  });

  const finalPlayer = await createUser(prisma, "npc-slot-final@example.com");

  await assert.doesNotReject(() =>
    joinRegistrationCycle({
      db: prisma,
      userId: finalPlayer.id,
      fortressName: "Npc Slot Final",
      now: new Date("2026-04-19T12:10:00.000Z"),
    })
  );

  const overflowUser = await createUser(
    prisma,
    "npc-slot-overflow@example.com"
  );

  await assert.rejects(
    () =>
      joinRegistrationCycle({
        db: prisma,
        userId: overflowUser.id,
        fortressName: "Npc Slot Overflow",
        now: new Date("2026-04-19T12:10:00.000Z"),
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

test("non-empty registration enters testing and ends it one hour before season start", async (context) => {
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
  const testingEndsAt = addHours(cycle.registrationEndsAt, -1);
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
  assert.equal(
    testingCycle.testingStartedAt?.toISOString(),
    testingStartsAt.toISOString()
  );
  assert.equal(
    testingCycle.testingEndsAt?.toISOString(),
    testingEndsAt.toISOString()
  );
  assert.equal(
    testingCycle.activeStartedAt?.toISOString(),
    cycle.registrationEndsAt.toISOString()
  );
  assert.equal(testingState.phase?.status, CycleStatus.TESTING);
  assert.equal(
    testingState.phase?.deadline?.toISOString(),
    testingEndsAt.toISOString()
  );
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
  const testingEndsAt = addHours(cycle.registrationEndsAt, -1);
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
  const resetTile = HEX_SPAWN_TILES.find((tile) => tile.spawnable);

  assert.ok(resetTile);

  await prisma.mapHexOwnership.create({
    data: {
      cycleId: cycle.id,
      tileId: resetTile.id,
      ownerFortressId: betaBeforeReset.id,
    },
  });
  await prisma.battlefield.create({
    data: {
      cycleId: cycle.id,
      targetTileId: resetTile.id,
      targetFortressId: betaBeforeReset.id,
      attackerBannerFortressId: alphaBeforeReset.id,
      defenderBannerFortressId: betaBeforeReset.id,
      participants: {
        create: {
          fortressId: alphaBeforeReset.id,
          side: BattlefieldSide.ATTACKER,
          armyCommitted: 5,
          armyRemaining: 5,
        },
      },
    },
  });

  const gapSummary = await runGameTick({
    db: prisma,
    now: testingEndsAt,
  });
  const gapCycle = await prisma.cycle.findUniqueOrThrow({
    where: {
      id: cycle.id,
    },
  });

  assert.equal(gapSummary.testingCyclesCompleted, 0);
  assert.equal(gapSummary.activatedCycles, 0);
  assert.equal(gapCycle.status, CycleStatus.TESTING);

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
  assert.equal(
    activeCycle.activeStartedAt?.toISOString(),
    cycle.registrationEndsAt.toISOString()
  );
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
  assert.equal(
    await prisma.attackUnit.count({ where: { cycleId: cycle.id } }),
    0
  );
  assert.equal(
    await prisma.battlefield.count({ where: { cycleId: cycle.id } }),
    0
  );
  assert.equal(
    await prisma.mapHexOwnership.count({ where: { cycleId: cycle.id } }),
    0
  );
  assert.equal(
    await prisma.scoreEvent.count({ where: { cycleId: cycle.id } }),
    0
  );
  assert.equal(
    await prisma.gameTick.count({ where: { cycleId: cycle.id } }),
    0
  );
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
    positionsAfterFirstTick.map((position) =>
      getRenderedMapPositionKey(position)
    )
  );

  assert.equal(refreshedCycle.mapLayoutVersion, CURRENT_MAP_LAYOUT_VERSION);
  assert.notDeepEqual(positionsAfterFirstTick, positionsBefore);
  assert.equal(uniquePositionKeys.size, positionsAfterFirstTick.length);

  for (const position of positionsAfterFirstTick) {
    const previous = positionsBefore.find((entry) => entry.id === position.id);

    assert.ok(previous);
    assert.notEqual(
      getRenderedMapPositionKey(position),
      getRenderedMapPositionKey(previous)
    );
  }

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

  const positionsBeforeTick = await prisma.fortress.findMany({
    where: {
      cycleId: cycle.id,
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
      id: true,
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

  for (const position of positionsAfterTick) {
    const previous = positionsBeforeTick.find(
      (entry) => entry.id === position.id
    );

    assert.ok(previous);
    assert.notEqual(
      getRenderedMapPositionKey(position),
      getRenderedMapPositionKey(previous)
    );
  }
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

  const positionsBeforeTick = await prisma.fortress.findMany({
    where: {
      cycleId: cycle.id,
    },
    select: {
      id: true,
      mapX: true,
      mapY: true,
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
      id: true,
      mapX: true,
      mapY: true,
    },
  });
  const uniquePositionKeys = new Set(
    positionsAfterTick.map((position) => getRenderedMapPositionKey(position))
  );

  assert.equal(uniquePositionKeys.size, positionsAfterTick.length);

  for (const position of positionsAfterTick) {
    const previous = positionsBeforeTick.find(
      (entry) => entry.id === position.id
    );

    assert.ok(previous);
    assert.notEqual(
      getRenderedMapPositionKey(position),
      getRenderedMapPositionKey(previous)
    );
  }
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
  assert.match(
    attackerState.battleReports[0]?.reportLines[0] ?? "",
    /Raid victory!/
  );
  assert.match(
    attackerState.battleReports[0]?.reportLines[2] ?? "",
    /returned/
  );
  assert.match(
    attackerState.battleReports[0]?.reportLines[3] ?? "",
    /Loot gained:/
  );
  assert.match(
    defenderState.battleReports[0]?.reportLines[2] ?? "",
    /Defender lost/
  );
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

test("active rename costs 10 gold and rejects insufficient gold or duplicate names", async (context) => {
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
      gold: 10,
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
      gold: 5,
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
    /at least 10 gold/
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
  assert.equal(renamed.gold, 0);
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
    resized.minersAssigned +
      resized.farmersAssigned +
      resized.recruitersAssigned,
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

test("Dwarf Deep Mining validates race, committed army, and hourly cooldown", async (context) => {
  const prisma = getPrismaOrSkip(context);

  if (!prisma) {
    return;
  }

  const cycle = await seedOpenCycle(prisma);
  const dwarf = await createUser(prisma, "deep-mining-dwarf@example.com");
  const target = await createUser(prisma, "deep-mining-target@example.com");
  const activeAt = new Date("2026-04-20T12:01:00.000Z");

  await joinRegistrationCycle({
    db: prisma,
    userId: dwarf.id,
    fortressName: "Deep Hold",
  });
  await joinRegistrationCycle({
    db: prisma,
    userId: target.id,
    fortressName: "Target Hold",
  });
  await runGameTick({
    db: prisma,
    now: new Date("2026-04-20T12:00:00.000Z"),
  });
  await selectFortressRace({
    db: prisma,
    userId: dwarf.id,
    race: FortressRace.DWARFS,
    now: activeAt,
  });
  await selectFortressRace({
    db: prisma,
    userId: target.id,
    race: FortressRace.ORKS,
    now: activeAt,
  });

  const dwarfFortress = await prisma.fortress.findUniqueOrThrow({
    where: {
      cycleId_ownerId: {
        cycleId: cycle.id,
        ownerId: dwarf.id,
      },
    },
  });
  await prisma.fortress.update({
    where: {
      id: dwarfFortress.id,
    },
    data: {
      gold: 600,
      army: 40,
      minersAssigned: 30,
    },
  });

  await assert.rejects(
    () =>
      activateDwarfDeepMining({
        db: prisma,
        userId: target.id,
        committedGold: 150,
        now: activeAt,
        rollValue: 0.1,
      }),
    /Only Dwarfs/
  );

  await assert.rejects(
    () =>
      activateDwarfDeepMining({
        db: prisma,
        userId: dwarf.id,
        committedGold: 650,
        now: activeAt,
        rollValue: 0.1,
      }),
    /between 150 and 600 gold/
  );

  const result = await activateDwarfDeepMining({
    db: prisma,
    userId: dwarf.id,
    committedGold: 150,
    now: activeAt,
    rollValue: 0.1,
  });

  assert.equal(result.outcome, DwarfDeepMiningOutcome.RICH_VEIN);
  assert.equal(result.committedGold, 150);
  assert.ok(result.resolveAt > activeAt);

  const paidDwarf = await prisma.fortress.findUniqueOrThrow({
    where: {
      id: dwarfFortress.id,
    },
  });

  assert.equal(paidDwarf.gold, 450);

  await assert.rejects(
    () =>
      activateDwarfDeepMining({
        db: prisma,
        userId: dwarf.id,
        committedGold: 150,
        now: new Date("2026-04-20T12:30:00.000Z"),
        rollValue: 0.3,
      }),
    /already been used this hour/
  );

  await runGameTick({
    db: prisma,
    now: result.resolveAt,
  });

  const resolvedDwarf = await prisma.fortress.findUniqueOrThrow({
    where: {
      id: dwarfFortress.id,
    },
  });

  assert.ok(resolvedDwarf.gold > paidDwarf.gold);
});

test("Dwarf Deep Mining rune is contested and bounty destruction ends suppression", async (context) => {
  const prisma = getPrismaOrSkip(context);

  if (!prisma) {
    return;
  }

  const cycle = await seedOpenCycle(prisma);
  const dwarf = await createUser(prisma, "rune-dwarf@example.com");
  const target = await createUser(prisma, "rune-target@example.com");
  const attacker = await createUser(prisma, "rune-attacker@example.com");
  const activeAt = new Date("2026-04-20T12:01:00.000Z");

  await joinRegistrationCycle({
    db: prisma,
    userId: dwarf.id,
    fortressName: "Rune Hold",
  });
  await joinRegistrationCycle({
    db: prisma,
    userId: target.id,
    fortressName: "Sealed Hold",
  });
  await joinRegistrationCycle({
    db: prisma,
    userId: attacker.id,
    fortressName: "Breaker Hold",
  });
  await runGameTick({
    db: prisma,
    now: new Date("2026-04-20T12:00:00.000Z"),
  });

  await selectFortressRace({
    db: prisma,
    userId: dwarf.id,
    race: FortressRace.DWARFS,
    now: activeAt,
  });
  await selectFortressRace({
    db: prisma,
    userId: target.id,
    race: FortressRace.ORKS,
    now: activeAt,
  });
  await selectFortressRace({
    db: prisma,
    userId: attacker.id,
    race: FortressRace.SPACE_MURINES,
    now: activeAt,
  });

  const dwarfFortress = await prisma.fortress.findUniqueOrThrow({
    where: {
      cycleId_ownerId: {
        cycleId: cycle.id,
        ownerId: dwarf.id,
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
  const attackerFortress = await prisma.fortress.findUniqueOrThrow({
    where: {
      cycleId_ownerId: {
        cycleId: cycle.id,
        ownerId: attacker.id,
      },
    },
  });

  await prisma.fortress.update({
    where: {
      id: dwarfFortress.id,
    },
    data: {
      gold: 1000,
      army: 80,
      mapX: 10,
      mapY: 10,
    },
  });
  await prisma.fortress.update({
    where: {
      id: targetFortress.id,
    },
    data: {
      gold: 200,
      mapX: 90,
      mapY: 90,
    },
  });
  await prisma.fortress.update({
    where: {
      id: attackerFortress.id,
    },
    data: {
      army: 200,
      mapX: 50,
      mapY: 50,
    },
  });

  const result = await activateDwarfRuneOfGrudges({
    db: prisma,
    userId: dwarf.id,
    targetFortressId: targetFortress.id,
    now: activeAt,
  });

  assert.equal(result.goldCost, 250);
  assert.ok(result.runeFortressId);

  const rune = await prisma.fortress.findUniqueOrThrow({
    where: {
      id: result.runeFortressId,
    },
  });
  const dwarfAfterRune = await prisma.fortress.findUniqueOrThrow({
    where: {
      id: dwarfFortress.id,
    },
  });

  assert.equal(rune.fortressKind, FortressKind.DWARF_RUNE);
  assert.equal(rune.health, 1);
  assert.equal(rune.army, 1);
  assert.equal(rune.mapX, 50);
  assert.equal(rune.mapY, 50);
  assert.equal(dwarfAfterRune.gold, 750);

  const suppressedState = await getHomePageState({
    db: prisma,
    userId: target.id,
    now: activeAt,
  });
  assert.equal(
    suppressedState.playerSummary?.factionSuppression?.runeFortressId,
    rune.id
  );
  assert.equal(suppressedState.playerSummary?.race, null);

  await runGameTick({
    db: prisma,
    now: addMinutes(activeAt, 1),
  });

  const afterUpkeep = await prisma.fortress.findUniqueOrThrow({
    where: {
      id: dwarfFortress.id,
    },
  });
  assert.equal(afterUpkeep.gold, 725);

  await assert.rejects(
    () =>
      setFortressAction({
        db: prisma,
        userId: dwarf.id,
        action: FortressAction.ATTACK,
        targetFortressId: rune.id,
        sentArmy: 1,
        now: new Date("2026-04-20T12:02:00.000Z"),
      }),
    /own Deep Mining rune/
  );

  await setFortressAction({
    db: prisma,
    userId: attacker.id,
    action: FortressAction.ATTACK,
    targetFortressId: rune.id,
    sentArmy: 200,
    now: new Date("2026-04-20T12:02:00.000Z"),
  });

  const attackUnit = await prisma.attackUnit.findFirstOrThrow({
    where: {
      attackerFortressId: attackerFortress.id,
      targetFortressId: rune.id,
    },
  });

  await runGameTick({
    db: prisma,
    now: attackUnit.arrivesAt,
  });

  const destroyedRune = await prisma.fortress.findUniqueOrThrow({
    where: {
      id: rune.id,
    },
  });
  const bountyEvent = await prisma.scoreEvent.findFirst({
    where: {
      cycleId: cycle.id,
      fortressId: attackerFortress.id,
      targetFortressId: rune.id,
      eventType: ScoreEventType.DWARF_RUNE_BOUNTY,
      delta: 500,
    },
  });
  const clearedState = await getHomePageState({
    db: prisma,
    userId: target.id,
    now: addMinutes(attackUnit.arrivesAt, 1),
  });

  assert.equal(destroyedRune.health, 0);
  assert.ok(bountyEvent);
  assert.equal(clearedState.playerSummary?.factionSuppression, null);
  assert.equal(clearedState.playerSummary?.race, FortressRace.ORKS);
});

test("location shuffle is free once, then costs 50 gold", async (context) => {
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
  await prisma.fortress.update({
    where: {
      id: attackerFortress.id,
    },
    data: {
      gold: 100,
      army: 1,
      race: FortressRace.DWARFS,
    },
  });

  const beforeFreeShuffle = await prisma.fortress.findUniqueOrThrow({
    where: {
      id: attackerFortress.id,
    },
  });
  const freeShuffleAt = new Date("2026-04-20T12:06:00.000Z");
  const beforeRenderedKey = getRenderedMapPositionKey(beforeFreeShuffle);
  const otherFortressPositions = await prisma.fortress.findMany({
    where: {
      cycleId: cycle.id,
      id: {
        not: attackerFortress.id,
      },
    },
    select: {
      mapX: true,
      mapY: true,
    },
  });
  const excludedKeys = new Set(
    otherFortressPositions.map((fortress) =>
      getRenderedMapPositionKey(fortress)
    )
  );
  const shuffleSeed = buildFortressSpawnSeed({
    cycleId: cycle.id,
    purpose: "active:player-location-shuffle",
    activeStartedAt: cycle.activeStartedAt,
    tickAt: freeShuffleAt,
    entropy: `${attackerFortress.id}:1`,
  });
  const rankedCandidates = getOpenSpawnCandidates(shuffleSeed, {
    excludedKeys,
    preferredEdgePadding: ACTIVE_EDGE_PADDING,
  })
    .filter((candidate) => {
      return getRenderedMapPositionKey(candidate) !== beforeRenderedKey;
    })
    .sort((left, right) => {
      return (
        distanceBetweenPoints(right, {
          x: beforeFreeShuffle.mapX,
          y: beforeFreeShuffle.mapY,
        }) -
        distanceBetweenPoints(left, {
          x: beforeFreeShuffle.mapX,
          y: beforeFreeShuffle.mapY,
        })
      );
    });
  assert.ok(rankedCandidates.length > 0);
  const rankedCandidateKeys = new Set(
    rankedCandidates.map((candidate) => getRenderedMapPositionKey(candidate))
  );
  const freeShuffle = await shuffleFortressLocation({
    db: prisma,
    userId: attacker.id,
    now: freeShuffleAt,
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
  assert.equal(freeShuffle.cancelledAttackUnitCount, 0);
  assert.equal(afterFreeShuffle.points, beforeFreeShuffle.points);
  assert.equal(
    await getFortressLocationShuffleCount(prisma, attackerFortress.id),
    1
  );
  assert.equal(
    getRenderedMapPositionKey(afterFreeShuffle),
    getRenderedMapPositionKey(freeShuffle.fortress)
  );
  assert.notEqual(
    getRenderedMapPositionKey(afterFreeShuffle),
    beforeRenderedKey
  );
  assert.ok(
    rankedCandidateKeys.has(getRenderedMapPositionKey(afterFreeShuffle))
  );
  assert.notDeepEqual(
    { x: afterFreeShuffle.mapX, y: afterFreeShuffle.mapY },
    { x: beforeFreeShuffle.mapX, y: beforeFreeShuffle.mapY }
  );
  assert.equal(cancelledUnits.length, 0);

  const readModelAfterFreeShuffle = await getHomePageState({
    db: prisma,
    userId: attacker.id,
    now: new Date("2026-04-20T12:06:30.000Z"),
  });
  const readModelFortress = readModelAfterFreeShuffle.mapFortresses.find(
    (fortress) => fortress.id === attackerFortress.id
  );

  assert.ok(readModelFortress);
  assert.equal(
    getRenderedMapPositionKey(readModelFortress),
    getRenderedMapPositionKey(afterFreeShuffle)
  );

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

test("location shuffle keeps in-flight armies and rejects insufficient paid gold", async (context) => {
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

  const shuffleWithOutgoingUnits = await shuffleFortressLocation({
    db: prisma,
    userId: attacker.id,
    now: new Date("2026-04-20T12:05:30.000Z"),
  });

  assert.equal(shuffleWithOutgoingUnits.cancelledAttackUnitCount, 0);

  const activeOwnUnitsAfterShuffle = await prisma.attackUnit.count({
    where: {
      cycleId: cycle.id,
      attackerFortressId: attackerFortress.id,
      resolvedAt: null,
      cancelledAt: null,
    },
  });

  assert.ok(activeOwnUnitsAfterShuffle > 0);

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
      gold: ACTIVE_LOCATION_SHUFFLE_COST - 1,
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
    /at least 50 gold/
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

test("location shuffle recalculates returning unit arrival from the new fortress position", async (context) => {
  const prisma = getPrismaOrSkip(context);

  if (!prisma) {
    return;
  }

  const cycle = await seedOpenCycle(prisma);
  const attacker = await createUser(prisma, "shuffle-eta-attacker@example.com");
  const defender = await createUser(prisma, "shuffle-eta-defender@example.com");

  await joinRegistrationCycle({
    db: prisma,
    userId: attacker.id,
    fortressName: "ETA Alpha",
  });
  await joinRegistrationCycle({
    db: prisma,
    userId: defender.id,
    fortressName: "ETA Beta",
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
      army: 5,
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
      mapX: 88,
      mapY: 12,
    },
  });

  const launchTime = new Date("2026-04-20T12:05:00.000Z");
  await setFortressAction({
    db: prisma,
    userId: attacker.id,
    action: FortressAction.ATTACK,
    targetFortressId: defenderFortress.id,
    sentArmy: 3,
    now: launchTime,
  });

  const launchedUnit = await prisma.attackUnit.findFirstOrThrow({
    where: {
      attackerFortressId: attackerFortress.id,
      targetFortressId: defenderFortress.id,
      resolvedAt: null,
      cancelledAt: null,
    },
  });

  const recallTime = new Date(
    launchTime.getTime() +
      Math.floor((launchedUnit.arrivesAt.getTime() - launchTime.getTime()) / 2)
  );
  await recallAttackUnit({
    db: prisma,
    userId: attacker.id,
    attackUnitId: launchedUnit.id,
    now: recallTime,
  });

  const recalledBeforeShuffle = await prisma.attackUnit.findUniqueOrThrow({
    where: {
      id: launchedUnit.id,
    },
  });

  const shuffleTime = new Date(recallTime.getTime() + 30_000);
  const oldFortressPosition = await prisma.fortress.findUniqueOrThrow({
    where: {
      id: attackerFortress.id,
    },
    select: {
      mapX: true,
      mapY: true,
    },
  });

  await shuffleFortressLocation({
    db: prisma,
    userId: attacker.id,
    now: shuffleTime,
  });

  const recalledAfterShuffle = await prisma.attackUnit.findUniqueOrThrow({
    where: {
      id: launchedUnit.id,
    },
  });
  const newFortressPosition = await prisma.fortress.findUniqueOrThrow({
    where: {
      id: attackerFortress.id,
    },
    select: {
      mapX: true,
      mapY: true,
    },
  });

  const originalSegmentStart = recalledBeforeShuffle.recalledAt;
  assert.ok(originalSegmentStart);
  const originalDurationMs =
    recalledBeforeShuffle.arrivesAt.getTime() - originalSegmentStart.getTime();
  const originalProgress =
    originalDurationMs <= 0
      ? 1
      : Math.min(
          1,
          Math.max(
            0,
            (shuffleTime.getTime() - originalSegmentStart.getTime()) /
              originalDurationMs
          )
        );

  const originalOriginX = recalledBeforeShuffle.returnOriginMapX ?? 0;
  const originalOriginY = recalledBeforeShuffle.returnOriginMapY ?? 0;
  const currentPoint = {
    mapX: Math.round(
      originalOriginX +
        (oldFortressPosition.mapX - originalOriginX) * originalProgress
    ),
    mapY: Math.round(
      originalOriginY +
        (oldFortressPosition.mapY - originalOriginY) * originalProgress
    ),
  };

  const distanceToOldHome = Math.hypot(
    oldFortressPosition.mapX - currentPoint.mapX,
    oldFortressPosition.mapY - currentPoint.mapY
  );
  const distanceToNewHome = Math.hypot(
    newFortressPosition.mapX - currentPoint.mapX,
    newFortressPosition.mapY - currentPoint.mapY
  );
  const oldRemainingMs = Math.max(
    0,
    recalledBeforeShuffle.arrivesAt.getTime() - shuffleTime.getTime()
  );
  const newRemainingMs = Math.max(
    0,
    recalledAfterShuffle.arrivesAt.getTime() - shuffleTime.getTime()
  );

  const expectedRemainingMs =
    distanceToOldHome <= 0
      ? 0
      : Math.round(oldRemainingMs * (distanceToNewHome / distanceToOldHome));

  assert.equal(newRemainingMs, expectedRemainingMs);
  assert.equal(recalledAfterShuffle.returnOriginMapX, currentPoint.mapX);
  assert.equal(recalledAfterShuffle.returnOriginMapY, currentPoint.mapY);
});

test("castle upgrades are available during gameplay and reject unaffordable or max-level purchases", async (context) => {
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

  await prisma.fortress.update({
    where: {
      cycleId_ownerId: {
        cycleId: cycle.id,
        ownerId: user.id,
      },
    },
    data: {
      gold: 99,
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
    /at least 100 gold/
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
  assert.equal(fortress.gold, 99);

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
      gold: FORTRESS_LEVEL_UP_COSTS.reduce((total, cost) => total + cost, 0),
    },
  });

  await purchaseFortressUpgrade({
    db: prisma,
    userId: user.id,
    specialization: "POINTS",
    now: new Date("2026-04-20T12:06:00.000Z"),
  });
  const activeProject = await prisma.castleUpgradeProject.findFirstOrThrow({
    where: {
      fortressId: fortress.id,
      completedAt: null,
    },
  });
  assert.equal(activeProject.level, 1);
  assert.equal(activeProject.goldCost, FORTRESS_LEVEL_UP_COSTS[0]);

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

  assert.equal(afterFirstUpgradeFortress.level, 0);
  assert.equal(afterFirstUpgradeSummary.activeCastleUpgradeProject?.level, 1);
  assert.equal(afterFirstUpgradeSummary.canPurchaseUpgrade, false);

  await runGameTick({
    db: prisma,
    now: new Date("2026-04-20T12:22:00.000Z"),
  });

  const completedFirstUpgradeState = await getHomePageState({
    userId: user.id,
    now: new Date("2026-04-20T12:22:30.000Z"),
    db: prisma,
  });
  const completedFirstUpgradeFortress = await prisma.fortress.findUniqueOrThrow(
    {
      where: {
        cycleId_ownerId: {
          cycleId: cycle.id,
          ownerId: user.id,
        },
      },
    }
  );
  const completedFirstUpgradeSummary =
    completedFirstUpgradeState.playerSummary ??
    (() => {
      throw new Error("Expected player summary after completed upgrade.");
    })();

  assert.equal(completedFirstUpgradeFortress.level, 1);
  assert.equal(completedFirstUpgradeSummary.displayedCastleLevel, 2);
  assert.equal(completedFirstUpgradeSummary.population, 35);
  assert.equal(completedFirstUpgradeSummary.defenseMultiplier, 1.2);
  assert.equal(afterFirstUpgradeSummary.minersAssigned, 10);
  assert.equal(afterFirstUpgradeSummary.farmersAssigned, 10);
  assert.equal(afterFirstUpgradeSummary.recruitersAssigned, 5);
  assert.equal(
    completedFirstUpgradeSummary.minersAssigned +
      completedFirstUpgradeSummary.farmersAssigned +
      completedFirstUpgradeSummary.recruitersAssigned,
    25
  );
  assert.equal(
    completedFirstUpgradeSummary.population -
      completedFirstUpgradeSummary.minersAssigned -
      completedFirstUpgradeSummary.farmersAssigned -
      completedFirstUpgradeSummary.recruitersAssigned,
    10
  );
  for (let level = 1; level < MAX_FORTRESS_LEVEL; level += 1) {
    const startedAt = new Date(
      `2026-04-20T${String(13 + level).padStart(2, "0")}:00:00.000Z`
    );
    await purchaseFortressUpgrade({
      db: prisma,
      userId: user.id,
      specialization: "POINTS",
      now: startedAt,
    });
    await runGameTick({
      db: prisma,
      now: addMinutes(startedAt, (level + 1) * 15 + 1),
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
  assert.equal(fortress.gold, 0);
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
  assert.equal(fortress.gold, 2);
  assert.equal(fortress.points, 0);
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
      gold: 0,
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
      points: 0,
      gold: 10,
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
      gold: true,
      food: true,
      army: true,
    },
  });

  assert.equal(grownAttacker.points, 0);
  assert.equal(grownAttacker.gold, 10);
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
      gold: true,
      food: true,
      army: true,
    },
  });

  assert.equal(damagedTarget.points, 0);
  assert.equal(damagedTarget.gold, 9);
  assert.equal(damagedTarget.food, 3);
  assert.equal(damagedTarget.army, 2);

  const returningUnit = await prisma.attackUnit.findUniqueOrThrow({
    where: {
      id: attackUnit.id,
    },
  });

  const updatedAttacker = await prisma.fortress.findUniqueOrThrow({
    where: {
      id: attackerFortress.id,
    },
    select: {
      points: true,
      gold: true,
      food: true,
      army: true,
    },
  });

  assert.equal(updatedAttacker.points, 0);
  assert.equal(updatedAttacker.gold, 11);
  assert.equal(updatedAttacker.food, 7);
  assert.equal(updatedAttacker.army, 0);

  await runGameTick({
    db: prisma,
    now: returningUnit.arrivesAt,
  });

  const attackerAfterReturn = await prisma.fortress.findUniqueOrThrow({
    where: {
      id: attackerFortress.id,
    },
    select: {
      army: true,
    },
  });

  assert.equal(attackerAfterReturn.army, 11);
});

test("worker assignments produce gold, food, and army in the same tick", async (context) => {
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
      gold: 0,
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
      gold: 0,
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
      gold: 0,
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
      gold: 0,
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
      gold: true,
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
      gold: true,
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
      gold: true,
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
      gold: true,
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
    points: 0,
    gold: 10,
    food: 5,
    army: 5,
  });
  assert.deepEqual(refreshedFoodLimited, {
    points: 0,
    gold: 0,
    food: 0,
    army: 2,
  });
  assert.deepEqual(refreshedIdle, {
    points: 0,
    gold: 0,
    food: 0,
    army: 0,
  });
  assert.deepEqual(refreshedMiner, {
    points: 0,
    gold: 25,
    food: 0,
    army: 0,
  });
  assert.equal(minerState.leaderboard[0]?.id, defaultWorker.id);
});

test("recalled attack units return home without damaging the target", async (context) => {
  const prisma = getPrismaOrSkip(context);

  if (!prisma) {
    return;
  }

  const cycle = await seedOpenCycle(prisma);
  const attacker = await createUser(prisma, "recall-attacker@example.com");
  const defender = await createUser(prisma, "recall-defender@example.com");

  await joinRegistrationCycle({
    db: prisma,
    userId: attacker.id,
    fortressName: "Recall Attacker",
  });
  await joinRegistrationCycle({
    db: prisma,
    userId: defender.id,
    fortressName: "Recall Defender",
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
      army: 5,
      recruitersAssigned: 0,
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
      army: 0,
      points: 20,
      mapX: 82,
      mapY: 10,
    },
  });

  const launchTime = new Date("2026-04-20T12:05:00.000Z");

  await setFortressAction({
    db: prisma,
    userId: attacker.id,
    action: FortressAction.ATTACK,
    targetFortressId: defenderFortress.id,
    sentArmy: 3,
    now: launchTime,
  });

  const launchedUnit = await prisma.attackUnit.findFirstOrThrow({
    where: {
      attackerFortressId: attackerFortress.id,
      targetFortressId: defenderFortress.id,
      cancelledAt: null,
    },
  });
  const recallTime = new Date(
    launchTime.getTime() +
      Math.floor((launchedUnit.arrivesAt.getTime() - launchTime.getTime()) / 2)
  );

  await assert.rejects(
    () =>
      recallAttackUnit({
        db: prisma,
        userId: defender.id,
        attackUnitId: launchedUnit.id,
        now: recallTime,
      }),
    /not available to recall/
  );

  await recallAttackUnit({
    db: prisma,
    userId: attacker.id,
    attackUnitId: launchedUnit.id,
    now: recallTime,
  });

  await assert.rejects(
    () =>
      recallAttackUnit({
        db: prisma,
        userId: attacker.id,
        attackUnitId: launchedUnit.id,
        now: new Date(recallTime.getTime() + 1_000),
      }),
    /no longer on the way/
  );

  const recalledUnit = await prisma.attackUnit.findUniqueOrThrow({
    where: {
      id: launchedUnit.id,
    },
  });

  assert.equal(
    recalledUnit.recalledAt?.toISOString(),
    recallTime.toISOString()
  );
  assert.notEqual(recalledUnit.returnOriginMapX, null);
  assert.notEqual(recalledUnit.returnOriginMapY, null);

  await runGameTick({
    db: prisma,
    now: launchedUnit.arrivesAt,
  });

  const targetAfterOriginalArrival = await prisma.fortress.findUniqueOrThrow({
    where: {
      id: defenderFortress.id,
    },
  });

  assert.equal(targetAfterOriginalArrival.points, 20);

  await runGameTick({
    db: prisma,
    now: recalledUnit.arrivesAt,
  });

  const resolvedUnit = await prisma.attackUnit.findUniqueOrThrow({
    where: {
      id: launchedUnit.id,
    },
  });
  const attackerAfterReturn = await prisma.fortress.findUniqueOrThrow({
    where: {
      id: attackerFortress.id,
    },
  });
  const targetAfterReturn = await prisma.fortress.findUniqueOrThrow({
    where: {
      id: defenderFortress.id,
    },
  });

  assert.equal(
    resolvedUnit.resolvedAt?.toISOString(),
    recalledUnit.arrivesAt.toISOString()
  );
  assert.equal(resolvedUnit.defenderArmyAtBattleStart, null);
  assert.equal(resolvedUnit.resolvedAttackPower, 0);
  assert.equal(resolvedUnit.resolvedDefensePower, 0);
  assert.equal(resolvedUnit.attackerSurvivors, 3);
  assert.equal(resolvedUnit.attackerReturned, 3);
  assert.equal(resolvedUnit.attackerRetired, 0);
  assert.equal(resolvedUnit.defenderLosses, 0);
  assert.equal(resolvedUnit.pointsLooted, 0);
  assert.equal(resolvedUnit.foodLooted, 0);
  assert.equal(attackerAfterReturn.army, 5);
  assert.equal(targetAfterReturn.points, 20);

  const stateAfterReturn = await getHomePageState({
    db: prisma,
    userId: attacker.id,
    now: recalledUnit.arrivesAt,
  });
  const recallReport = stateAfterReturn.battleReports.find(
    (report) => report.id === launchedUnit.id
  );

  assert.equal(recallReport?.type, "RECALLED");
  assert.equal(recallReport?.sentArmy, 3);
  assert.equal(recallReport?.attackerReturned, 3);
  assert.match(recallReport?.reportLines[0] ?? "", /Army recalled/);
  assert.match(recallReport?.reportLines[0] ?? "", /3 troops returned home/);
  assert.doesNotMatch(
    recallReport?.reportLines.join(" ") ?? "",
    /Loot|Raid failed|Raid victory/
  );

  await assert.rejects(
    () =>
      recallAttackUnit({
        db: prisma,
        userId: attacker.id,
        attackUnitId: launchedUnit.id,
        now: new Date(recalledUnit.arrivesAt.getTime() + 1_000),
      }),
    /no longer on the way/
  );

  await prisma.fortress.update({
    where: {
      id: attackerFortress.id,
    },
    data: {
      army: 1,
    },
  });
  await setFortressAction({
    db: prisma,
    userId: attacker.id,
    action: FortressAction.ATTACK,
    targetFortressId: defenderFortress.id,
    sentArmy: 1,
    now: new Date(recalledUnit.arrivesAt.getTime() + 60_000),
  });

  const cancelledUnit = await prisma.attackUnit.findFirstOrThrow({
    where: {
      attackerFortressId: attackerFortress.id,
      resolvedAt: null,
      cancelledAt: null,
    },
    orderBy: {
      launchedAt: "desc",
    },
  });

  await prisma.attackUnit.update({
    where: {
      id: cancelledUnit.id,
    },
    data: {
      cancelledAt: new Date(cancelledUnit.launchedAt.getTime() + 1_000),
    },
  });

  await assert.rejects(
    () =>
      recallAttackUnit({
        db: prisma,
        userId: attacker.id,
        attackUnitId: cancelledUnit.id,
        now: new Date(cancelledUnit.launchedAt.getTime() + 2_000),
      }),
    /no longer on the way/
  );
});

test("Space Murines can save instant recall for later in the same hour", async (context) => {
  const prisma = getPrismaOrSkip(context);

  if (!prisma) {
    return;
  }

  const cycle = await seedOpenCycle(prisma);
  const attacker = await createUser(
    prisma,
    "instant-recall-attacker@example.com"
  );
  const defender = await createUser(
    prisma,
    "instant-recall-defender@example.com"
  );

  await joinRegistrationCycle({
    db: prisma,
    userId: attacker.id,
    fortressName: "Instant Recall Attacker",
  });
  await joinRegistrationCycle({
    db: prisma,
    userId: defender.id,
    fortressName: "Instant Recall Defender",
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
      army: 200,
      recruitersAssigned: 0,
      race: FortressRace.SPACE_MURINES,
      mapX: 10,
      mapY: 10,
    },
  });
  await prisma.fortress.update({
    where: {
      id: defenderFortress.id,
    },
    data: {
      army: 50,
      points: 50,
      food: 30,
      mapX: 82,
      mapY: 10,
    },
  });

  const launchTime = new Date("2026-04-20T12:05:00.000Z");

  await setFortressAction({
    db: prisma,
    userId: attacker.id,
    action: FortressAction.ATTACK,
    targetFortressId: defenderFortress.id,
    sentArmy: 100,
    now: launchTime,
  });

  const normalRecallUnit = await prisma.attackUnit.findFirstOrThrow({
    where: {
      attackerFortressId: attackerFortress.id,
      targetFortressId: defenderFortress.id,
      cancelledAt: null,
    },
    orderBy: {
      launchedAt: "desc",
    },
  });
  const normalRecallTime = new Date("2026-04-20T12:10:00.000Z");

  await recallAttackUnit({
    db: prisma,
    userId: attacker.id,
    attackUnitId: normalRecallUnit.id,
    now: normalRecallTime,
  });

  const normallyRecalledUnit = await prisma.attackUnit.findUniqueOrThrow({
    where: {
      id: normalRecallUnit.id,
    },
  });
  const attackerAfterNormalRecall = await prisma.fortress.findUniqueOrThrow({
    where: {
      id: attackerFortress.id,
    },
  });
  const defenderAfterNormalRecall = await prisma.fortress.findUniqueOrThrow({
    where: {
      id: defenderFortress.id,
    },
  });

  assert.equal(normallyRecalledUnit.resolvedAt, null);
  assert.equal(normallyRecalledUnit.attackerRetired, null);
  assert.notEqual(
    normallyRecalledUnit.arrivesAt.toISOString(),
    normalRecallTime.toISOString()
  );
  assert.equal(attackerAfterNormalRecall.army, 100);
  assert.equal(defenderAfterNormalRecall.army, 50);
  assert.equal(defenderAfterNormalRecall.points, 50);
  assert.equal(defenderAfterNormalRecall.food, 30);
  assert.equal(
    await prisma.raceAbilityActivation.count({
      where: {
        fortressId: attackerFortress.id,
        kind: RaceAbilityKind.SPACE_MURINE_INSTANT_RECALL,
      },
    }),
    0
  );

  const stateAfterNormalRecall = await getHomePageState({
    db: prisma,
    userId: attacker.id,
    now: normalRecallTime,
  });

  assert.equal(
    stateAfterNormalRecall.playerSummary?.raceBuffs.canInstantRecall,
    true
  );

  await setFortressAction({
    db: prisma,
    userId: attacker.id,
    action: FortressAction.ATTACK,
    targetFortressId: defenderFortress.id,
    sentArmy: 20,
    now: new Date("2026-04-20T12:15:00.000Z"),
  });

  const instantUnit = await prisma.attackUnit.findFirstOrThrow({
    where: {
      attackerFortressId: attackerFortress.id,
      targetFortressId: defenderFortress.id,
      resolvedAt: null,
      cancelledAt: null,
    },
    orderBy: {
      launchedAt: "desc",
    },
  });
  const instantRecallTime = new Date("2026-04-20T12:16:00.000Z");

  await recallAttackUnit({
    db: prisma,
    userId: attacker.id,
    attackUnitId: instantUnit.id,
    instant: true,
    now: instantRecallTime,
  });

  const instantRecalledUnit = await prisma.attackUnit.findUniqueOrThrow({
    where: {
      id: instantUnit.id,
    },
  });
  const attackerAfterInstantRecall = await prisma.fortress.findUniqueOrThrow({
    where: {
      id: attackerFortress.id,
    },
  });

  assert.equal(
    instantRecalledUnit.resolvedAt?.toISOString(),
    instantRecallTime.toISOString()
  );
  assert.equal(
    instantRecalledUnit.arrivesAt.toISOString(),
    instantRecallTime.toISOString()
  );
  assert.equal(instantRecalledUnit.defenderArmyAtBattleStart, null);
  assert.equal(instantRecalledUnit.resolvedAttackPower, 0);
  assert.equal(instantRecalledUnit.resolvedDefensePower, 0);
  assert.equal(instantRecalledUnit.attackerSurvivors, 19);
  assert.equal(instantRecalledUnit.attackerReturned, 19);
  assert.equal(instantRecalledUnit.attackerRetired, 1);
  assert.equal(instantRecalledUnit.defenderLosses, 0);
  assert.equal(instantRecalledUnit.pointsLooted, 0);
  assert.equal(instantRecalledUnit.foodLooted, 0);
  assert.equal(instantRecalledUnit.armyLooted, 0);
  assert.equal(attackerAfterInstantRecall.army, 119);

  const stateAfterInstant = await getHomePageState({
    db: prisma,
    userId: attacker.id,
    now: instantRecallTime,
  });
  const instantReport = stateAfterInstant.battleReports.find(
    (report) => report.id === instantUnit.id
  );

  assert.equal(
    stateAfterInstant.playerSummary?.raceBuffs.canInstantRecall,
    false
  );
  assert.equal(instantReport?.type, "RECALLED");
  assert.equal(instantReport?.attackerReturned, 19);
  assert.match(instantReport?.reportLines.join(" ") ?? "", /Recall cost: 1/);
  assert.doesNotMatch(
    instantReport?.reportLines.join(" ") ?? "",
    /Loot|Raid failed|Raid victory/
  );
  assert.equal(
    await prisma.raceAbilityActivation.count({
      where: {
        fortressId: attackerFortress.id,
        kind: RaceAbilityKind.SPACE_MURINE_INSTANT_RECALL,
      },
    }),
    1
  );

  await runGameTick({
    db: prisma,
    now: normallyRecalledUnit.arrivesAt,
  });

  const attackerAfterNormalReturn = await prisma.fortress.findUniqueOrThrow({
    where: {
      id: attackerFortress.id,
    },
  });

  assert.equal(attackerAfterNormalReturn.army, 219);

  await setFortressAction({
    db: prisma,
    userId: attacker.id,
    action: FortressAction.ATTACK,
    targetFortressId: defenderFortress.id,
    sentArmy: 1,
    now: new Date("2026-04-20T13:05:00.000Z"),
  });

  const nextHourUnit = await prisma.attackUnit.findFirstOrThrow({
    where: {
      attackerFortressId: attackerFortress.id,
      targetFortressId: defenderFortress.id,
      resolvedAt: null,
      cancelledAt: null,
    },
    orderBy: {
      launchedAt: "desc",
    },
  });
  const nextHourRecallTime = new Date("2026-04-20T13:06:00.000Z");

  await recallAttackUnit({
    db: prisma,
    userId: attacker.id,
    attackUnitId: nextHourUnit.id,
    instant: true,
    now: nextHourRecallTime,
  });

  const nextHourRecalledUnit = await prisma.attackUnit.findUniqueOrThrow({
    where: {
      id: nextHourUnit.id,
    },
  });
  const attackerAfterNextHourRecall = await prisma.fortress.findUniqueOrThrow({
    where: {
      id: attackerFortress.id,
    },
  });

  assert.equal(
    nextHourRecalledUnit.resolvedAt?.toISOString(),
    nextHourRecallTime.toISOString()
  );
  assert.equal(nextHourRecalledUnit.attackerReturned, 0);
  assert.equal(nextHourRecalledUnit.attackerRetired, 1);
  assert.equal(attackerAfterNextHourRecall.army, 218);
  assert.equal(
    await prisma.raceAbilityActivation.count({
      where: {
        fortressId: attackerFortress.id,
        kind: RaceAbilityKind.SPACE_MURINE_INSTANT_RECALL,
      },
    }),
    2
  );
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
      gold: 3,
      army: 1,
      race: FortressRace.DWARFS,
    },
  });
  await prisma.fortress.update({
    where: {
      id: targetFortress.id,
    },
    data: {
      points: 0,
      gold: 1,
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
  assert.equal(launchedAttacker.gold, 3);
  assert.equal(launchedTarget.points, 0);
  assert.equal(launchedTarget.gold, 1);
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

  assert.ok(beforeImpactTarget.gold >= 1);

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
  assert.equal(afterImpactTarget.points, beforeImpactTarget.points);
  assert.equal(afterImpactTarget.gold, beforeImpactTarget.gold - 1);
  assert.ok(afterImpactTarget.gold >= 0);

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

test.skip("legacy mega fortress destroy unlocks upgrades, grants a free level, and respawns stronger", async (context) => {
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

test.skip("legacy mega fortress destroy credit goes to the unit that drops health to zero", async (context) => {
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

test.skip("legacy direct Home of A attacks return armies when mega survives", async (context) => {
  const prisma = getPrismaOrSkip(context);

  if (!prisma) {
    return;
  }

  const cycle = await seedOpenCycle(prisma);
  const attacker = await createUser(prisma, "mega-return-attacker@example.com");

  await joinRegistrationCycle({
    db: prisma,
    userId: attacker.id,
    fortressName: "Return Alpha",
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
      army: 3,
      points: 0,
      food: 0,
      minersAssigned: 0,
      farmersAssigned: 0,
      recruitersAssigned: 0,
    },
  });
  await prisma.fortress.update({
    where: {
      id: megaFortress.id,
    },
    data: {
      health: MEGA_FORTRESS_HEALTH,
      maxHealth: MEGA_FORTRESS_HEALTH,
    },
  });

  await setFortressAction({
    db: prisma,
    userId: attacker.id,
    action: FortressAction.ATTACK,
    targetFortressId: megaFortress.id,
    sentArmy: 2,
    now: new Date("2026-04-20T12:05:00.000Z"),
  });

  const attackUnit = await prisma.attackUnit.findFirstOrThrow({
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
    now: attackUnit.arrivesAt,
  });

  const returningUnit = await prisma.attackUnit.findUniqueOrThrow({
    where: {
      id: attackUnit.id,
    },
  });
  const refreshedAttacker = await prisma.fortress.findUniqueOrThrow({
    where: {
      id: attackerFortress.id,
    },
    select: {
      army: true,
    },
  });

  assert.equal(returningUnit.resolvedAt, null);
  assert.ok(returningUnit.recalledAt);
  assert.equal(returningUnit.attackerSurvivors, 2);
  assert.equal(returningUnit.attackerRetired, 0);
  assert.equal(returningUnit.attackerReturned, 2);
  assert.equal(refreshedAttacker.army, 1);

  await runGameTick({
    db: prisma,
    now: returningUnit.arrivesAt,
  });

  const resolvedUnit = await prisma.attackUnit.findUniqueOrThrow({
    where: {
      id: attackUnit.id,
    },
  });
  const attackerAfterReturn = await prisma.fortress.findUniqueOrThrow({
    where: {
      id: attackerFortress.id,
    },
    select: {
      army: true,
    },
  });

  assert.ok(resolvedUnit.resolvedAt);
  assert.equal(attackerAfterReturn.army, 3);
});

test.skip("legacy returning mega attackers are not reprocessed with same-target arrivals", async (context) => {
  const prisma = getPrismaOrSkip(context);

  if (!prisma) {
    return;
  }

  const cycle = await seedOpenCycle(prisma);
  const attacker = await createUser(
    prisma,
    "mega-return-batch-attacker@example.com"
  );

  await joinRegistrationCycle({
    db: prisma,
    userId: attacker.id,
    fortressName: "Batch Return Alpha",
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
      army: 3,
      points: 0,
      food: 0,
      minersAssigned: 0,
      farmersAssigned: 0,
      recruitersAssigned: 0,
    },
  });

  await setFortressAction({
    db: prisma,
    userId: attacker.id,
    action: FortressAction.ATTACK,
    targetFortressId: megaFortress.id,
    sentArmy: 2,
    now: new Date("2026-04-20T12:05:00.000Z"),
  });

  const firstUnit = await prisma.attackUnit.findFirstOrThrow({
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
    now: firstUnit.arrivesAt,
  });

  const returningUnit = await prisma.attackUnit.findUniqueOrThrow({
    where: {
      id: firstUnit.id,
    },
  });
  assert.ok(returningUnit.arrivesAt);
  assert.ok(returningUnit.recalledAt);

  await setFortressAction({
    db: prisma,
    userId: attacker.id,
    action: FortressAction.ATTACK,
    targetFortressId: megaFortress.id,
    sentArmy: 1,
    now: addMinutes(returningUnit.recalledAt, 1),
  });

  const secondUnit = await prisma.attackUnit.findFirstOrThrow({
    where: {
      attackerFortressId: attackerFortress.id,
      targetFortressId: megaFortress.id,
      id: {
        not: firstUnit.id,
      },
      cancelledAt: null,
    },
    orderBy: {
      launchedAt: "asc",
    },
  });

  await prisma.attackUnit.update({
    where: {
      id: secondUnit.id,
    },
    data: {
      arrivesAt: returningUnit.arrivesAt,
    },
  });

  await runGameTick({
    db: prisma,
    now: returningUnit.arrivesAt,
  });

  const resolvedReturningUnit = await prisma.attackUnit.findUniqueOrThrow({
    where: {
      id: firstUnit.id,
    },
  });
  const recalledSecondUnit = await prisma.attackUnit.findUniqueOrThrow({
    where: {
      id: secondUnit.id,
    },
  });
  const refreshedAttacker = await prisma.fortress.findUniqueOrThrow({
    where: {
      id: attackerFortress.id,
    },
    select: {
      army: true,
    },
  });

  assert.ok(resolvedReturningUnit.resolvedAt);
  assert.equal(
    resolvedReturningUnit.recalledAt?.getTime(),
    returningUnit.recalledAt.getTime()
  );
  assert.ok(recalledSecondUnit.recalledAt);
  assert.equal(recalledSecondUnit.resolvedAt, null);
  assert.equal(refreshedAttacker.army, 2);
});

test.skip("legacy later mega fortress destroys scale reward and health without changing the first slayer or free upgrade count", async (context) => {
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
  assert.equal(
    refreshedAttacker.points,
    resourcesBeforeSecondKill.points + 1000 + 10
  );
  assert.equal(
    refreshedAttacker.food,
    resourcesBeforeSecondKill.food + 1000 + 5
  );
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
      gold: ACTIVE_LOCATION_SHUFFLE_COST - 1,
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
  assert.deepEqual(state.attackUnits[0]?.returnOrigin, {
    mapX: alphaFortress.mapX,
    mapY: alphaFortress.mapY,
  });
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

test("read model maps system-authored WAAAGH announcements to system chat messages", async (context) => {
  const prisma = getPrismaOrSkip(context);

  if (!prisma) {
    return;
  }

  const ork = await createUser(prisma, "waaagh-system-map@example.com");

  const cycle = await seedActiveCommunityWishCycle(
    prisma,
    [
      {
        userId: ork.id,
        commanderName: "Shout Boss",
        fortressName: "Echo Fort",
        points: 0,
      },
    ],
    new Date("2026-04-20T16:00:00.000Z")
  );

  await prisma.fortress.update({
    where: {
      cycleId_ownerId: {
        cycleId: cycle.id,
        ownerId: ork.id,
      },
    },
    data: {
      race: FortressRace.ORKS,
    },
  });

  await sendChatMessage({
    db: prisma,
    userId: ork.id,
    body: "Green tide rising.",
    now: new Date("2026-04-20T12:03:00.000Z"),
  });

  await activateRaceAbility({
    userId: ork.id,
    kind: RaceAbilityKind.ORK_WAAAGH,
    now: new Date("2026-04-20T12:05:00.000Z"),
    db: prisma,
  });

  const state = await getHomePageState({
    db: prisma,
    userId: ork.id,
  });

  const systemMessage = state.chat.messages.find((message) =>
    message.body.includes("WAAAGH")
  );
  const playerMessage = state.chat.messages.find(
    (message) => message.body === "Green tide rising."
  );

  assert.ok(systemMessage);
  assert.equal(systemMessage.isSystem, true);
  assert.equal(systemMessage.authorName, "System");
  assert.notEqual(systemMessage.authorName, "Spectator");

  assert.ok(playerMessage);
  assert.equal(playerMessage.isSystem, false);
  assert.equal(playerMessage.authorName, "Shout Boss");
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

  assert.equal(
    resolvedHistory.communityWishStatus,
    CommunityWishStatus.RESOLVED
  );
  assert.equal(resolvedHistory.communityWishProposalId, winningProposal.id);
  assert.equal(resolvedHistory.communityWishFulfillmentProgress, 0);
  assert.match(
    resolvedHistory.communityWishSnapshot ?? "",
    /season-end confetti/
  );

  const updatedCommunityProgress = await updateCommunityWishFulfillmentProgress(
    {
      db: prisma,
      cycleId: secondCycle.id,
      progress: 125,
    }
  );

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
  assert.equal(historyEntry?.communityWishFulfillmentProgress, 100);
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

test("manual catch-up unfreezes gold production", async (context) => {
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
      gold: true,
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
      gold: true,
    },
  });
  const recoveredState = await getAdminDashboardState({
    db: prisma,
    now: catchUpAt,
  });

  assert.ok(afterCatchUp.gold > beforeCatchUp.gold);
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
      points: 0,
      gold: 5,
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
      gold: true,
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
      gold: true,
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
  assert.equal(afterCatchUpTarget.points, beforeCatchUpTarget.points);
  assert.equal(afterCatchUpTarget.gold, beforeCatchUpTarget.gold - 2);
  assert.equal(unresolvedAfterCatchUp.length, 0);
});
