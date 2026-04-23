import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { after, before, beforeEach, test, type TestContext } from "node:test";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  CycleStatus,
  FortressAction,
  PrismaClient,
  ScoreEventType,
  WinnerRequestStatus,
} from "@/lib/prisma-client";
import {
  forceEndCurrentCycle,
  runManualCatchUpTick,
  setRegistrationJoiningLock,
} from "./admin-operations";
import { seedProjectA } from "./bootstrap";
import { sendChatMessage } from "./chat";
import {
  ACTIVE_PLAYER_CAP,
  CURRENT_MAP_LAYOUT_VERSION,
  MAP_POSITIONS,
  MEGA_FORTRESS_DESTROY_BONUS,
  MEGA_FORTRESS_HEALTH,
  UNIT_SPRITE_VARIANTS,
} from "./constants";
import { getAttackArrivalAt } from "./attacks";
import {
  HEX_SPAWN_TILES,
  MAP_WORLD_HEIGHT,
  MAP_WORLD_WIDTH,
  isPointNearSpawnHex,
  snapMapPointToHex,
} from "./map-hex";
import { getAttackPresentation } from "@/components/fortress-map";
import { takeUniqueSpawnPoints } from "./mega-fortress";
import { getAdminDashboardState } from "./admin-dashboard";
import { getCycleHistoryPageState } from "./history";
import { getHomePageState } from "./read-model";
import {
  editRegistrationFortressName,
  joinRegistrationCycle,
  purchaseFortressUpgrade,
  registerCommanderName,
  renameActiveFortress,
  setFortressAction,
} from "./service";
import {
  TickRunnerError,
  classifyTickHealth,
  runGameTick,
} from "./tick";
import { addMinutes } from "./time";
import { formatTickRunnerError, formatTickSummary } from "./tick-cli";
import { getFortressAttackDamage, getFortressGrowGain } from "./upgrades";
import {
  classifyWinnerRequest,
  reviewWinnerRequest,
  submitWinnerRequest,
} from "./winner-requests";

const __dirname = dirname(fileURLToPath(import.meta.url));
const workspaceRoot = resolve(__dirname, "../../..");
const defaultDatabaseUrl =
  process.env.TEST_DATABASE_URL ??
  process.env.DATABASE_URL ??
  "postgresql://postgres:postgres@localhost:5432/project_a?schema=public";

test("map positions are unique and spread across the battlefield bounds", () => {
  const occupied = new Set<string>();
  const originalArea = 2200 * 1400;
  const currentArea = MAP_WORLD_WIDTH * MAP_WORLD_HEIGHT;

  assert.ok(currentArea / originalArea > 2.95);
  assert.ok(currentArea / originalArea < 3.05);
  assert.equal(MAP_POSITIONS.length, ACTIVE_PLAYER_CAP);

  for (const position of MAP_POSITIONS) {
    assert.ok(position.x >= 6 && position.x <= 94);
    assert.ok(position.y >= 6 && position.y <= 95);
    assert.ok(isPointNearSpawnHex(position));
    occupied.add(`${position.x}:${position.y}`);
  }

  assert.equal(occupied.size, MAP_POSITIONS.length);

  for (let leftIndex = 0; leftIndex < MAP_POSITIONS.length; leftIndex += 1) {
    for (
      let rightIndex = leftIndex + 1;
      rightIndex < MAP_POSITIONS.length;
      rightIndex += 1
    ) {
      const left = MAP_POSITIONS[leftIndex];
      const right = MAP_POSITIONS[rightIndex];
      const leftHex = snapMapPointToHex(left);
      const rightHex = snapMapPointToHex(right);

      assert.notEqual(leftHex.tile.id, rightHex.tile.id);
      assert.ok(Math.hypot(left.x - right.x, left.y - right.y) >= 9);
    }
  }
});

test("spawn sampler returns unique valid spawn points", () => {
  const points = takeUniqueSpawnPoints("sampler:unique", 18, {
    minSeparationDistance: 9,
  });
  const uniqueKeys = new Set(
    points.map((point) => `${Math.round(point.x)}:${Math.round(point.y)}`)
  );

  assert.equal(points.length, 18);
  assert.equal(uniqueKeys.size, points.length);

  for (const point of points) {
    assert.ok(isPointNearSpawnHex(point));
  }
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

test("tick health classification separates healthy, delayed, and stalled states", () => {
  assert.equal(classifyTickHealth(0), "ok");
  assert.equal(classifyTickHealth(1), "ok");
  assert.equal(classifyTickHealth(2), "lagging");
  assert.equal(classifyTickHealth(3), "stalled");
});

test("tick CLI summary includes attack launch and resolution counts", () => {
  const formatted = formatTickSummary({
    restartedRegistrationCycles: 1,
    activatedCycles: 2,
    resolvedCycles: 3,
    nextRegistrationCyclesCreated: 4,
    processedMinutes: 5,
    scoreEventsCreated: 6,
    launchedAttackUnits: 7,
    resolvedAttackUnits: 8,
  });

  assert.match(formatted, /Registration restarted: 1/);
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
  assert.equal(impacting.progress, 0.94);
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
  await client.cycleHistory.deleteMany();
  await client.winnerRequest.deleteMany();
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

  await prisma.cycle.update({
    where: {
      id: cycle.id,
    },
    data: {
      mapLayoutVersion: 1,
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
      (position) => `${position.mapX}:${position.mapY}`
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
    now: new Date("2026-04-20T12:02:00.000Z"),
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

  await setFortressAction({
    db: prisma,
    userId: alpha.id,
    action: FortressAction.ATTACK,
    targetFortressId: betaFortress.id,
    now: new Date("2026-04-20T12:05:00.000Z"),
  });

  await assert.rejects(
    () =>
      setFortressAction({
        db: prisma,
        userId: alpha.id,
        action: FortressAction.ATTACK,
        targetFortressId: alphaFortress.id,
        now: new Date("2026-04-20T12:05:00.000Z"),
      }),
    /cannot target itself/
  );

  const refreshedFortress = await prisma.fortress.findUniqueOrThrow({
    where: {
      id: alphaFortress.id,
    },
  });

  assert.equal(refreshedFortress.currentAction, FortressAction.ATTACK);
  assert.equal(refreshedFortress.targetFortressId, betaFortress.id);

  const activeAttackUnit = await prisma.attackUnit.findFirst({
    where: {
      attackerFortressId: alphaFortress.id,
      targetFortressId: betaFortress.id,
      resolvedAt: null,
      cancelledAt: null,
    },
  });

  assert.ok(activeAttackUnit);
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
      points: 2000,
    },
  });

  await purchaseFortressUpgrade({
    db: prisma,
    userId: user.id,
    now: new Date("2026-04-20T12:06:00.000Z"),
  });
  await purchaseFortressUpgrade({
    db: prisma,
    userId: user.id,
    now: new Date("2026-04-20T12:07:00.000Z"),
  });
  await purchaseFortressUpgrade({
    db: prisma,
    userId: user.id,
    now: new Date("2026-04-20T12:08:00.000Z"),
  });
  await purchaseFortressUpgrade({
    db: prisma,
    userId: user.id,
    now: new Date("2026-04-20T12:09:00.000Z"),
  });

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
    [-100, -300, -600, -1000]
  );
  assert.equal(fortress.level, 4);
  assert.equal(fortress.points, 0);
  assert.equal(state.playerSummary?.level, 4);
  assert.equal(state.playerSummary?.nextUpgradeCost, null);
  assert.equal(state.playerSummary?.canPurchaseUpgrade, false);

  await assert.rejects(
    () =>
      purchaseFortressUpgrade({
        db: prisma,
        userId: user.id,
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
      mapX: 94,
      mapY: 95,
    },
  });

  await runGameTick({
    db: prisma,
    now: new Date("2026-04-20T12:02:00.000Z"),
  });

  const grownAttacker = await prisma.fortress.findUniqueOrThrow({
    where: {
      id: attackerFortress.id,
    },
    select: {
      points: true,
    },
  });

  assert.equal(grownAttacker.points, getFortressGrowGain(2));

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
    },
  });

  assert.equal(damagedTarget.points, 10 - getFortressAttackDamage(2));
});

test("attack units launch for free and damage on arrival", async (context) => {
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

  assert.equal(nextOutbound.length, 1);
});

test("attack mode launches one unit per tick even while previous units are in transit", async (context) => {
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

  assert.equal(unresolvedBeforeArrival.length, 5);
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
  const launchedOnArrivalTick = unitsAfterFirstArrivalTick.filter((unit) => {
    return unit.launchedAt.getTime() === firstUnit.arrivesAt.getTime();
  });

  assert.equal(launchedOnArrivalTick.length, 0);
  assert.equal(
    unresolvedAfterFirstArrivalTick.length,
    unresolvedBeforeArrival.length - 1
  );

  await runGameTick({
    db: prisma,
    now: addMinutes(firstUnit.arrivesAt, 1),
  });

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

  assert.equal(relaunchedUnits.length, unresolvedAfterFirstArrivalTick.length + 1);
  assert.equal(
    relaunchedUnits.at(-1)?.launchedAt.toISOString(),
    addMinutes(firstUnit.arrivesAt, 1).toISOString()
  );
});

test("attack stream cadence follows the fortress's last launch time instead of the wall-clock minute edge", async (context) => {
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

  assert.equal(unitsAfterNinetySeconds.length, 2);
  assert.equal(
    unitsAfterNinetySeconds[1]?.launchedAt.toISOString(),
    "2026-04-20T12:07:00.000Z"
  );
});

test("setting an attack target immediately updates the fortress target like the map attack flow expects", async (context) => {
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
      currentAction: true,
      targetFortressId: true,
    },
  });

  assert.equal(attackerFortress.currentAction, FortressAction.ATTACK);
  assert.equal(attackerFortress.targetFortressId, secondTargetFortress.id);
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
  assert.equal(refreshedAttacker.points, 3 + MEGA_FORTRESS_DESTROY_BONUS);
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
  assert.equal(state.playerSummary?.name.startsWith("👑 "), true);
  assert.equal(state.leaderboard[0]?.name.startsWith("👑 "), true);
  assert.equal(
    state.leaderboard.some((entry) => entry.id === megaFortress.id),
    false
  );
});

test("later mega fortress destroys scale reward and health without changing crown or free upgrade count", async (context) => {
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

  const pointsBeforeSecondKill = (
    await prisma.fortress.findUniqueOrThrow({
      where: {
        id: attackerFortress.id,
      },
      select: {
        points: true,
      },
    })
  ).points;

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
  assert.equal(refreshedAttacker.points, pointsBeforeSecondKill + 1000);
  assert.deepEqual(
    destroyBonusEvents.map((event) => event.delta),
    [500, 1000]
  );
  assert.equal(refreshedMega.health, MEGA_FORTRESS_HEALTH * 3);
  assert.equal(refreshedMega.maxHealth, MEGA_FORTRESS_HEALTH * 3);
});

test("switching to grow preserves in-flight attacks but stops future launches", async (context) => {
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

test("retargeting keeps in-flight units on the old target and sends future launches to the new target", async (context) => {
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

  assert.equal(unresolvedUnits.length, 3);
  assert.equal(unresolvedUnits[0]?.targetFortressId, firstTargetFortress.id);
  assert.equal(unresolvedUnits[1]?.targetFortressId, firstTargetFortress.id);
  assert.equal(unresolvedUnits[2]?.targetFortressId, secondTargetFortress.id);
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

  const historyState = await getCycleHistoryPageState({
    userId: winner.id,
    db: prisma,
  });
  const adminState = await getAdminDashboardState({
    db: prisma,
  });

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
  assert.equal(
    adminState.winnerRequests[0]?.status,
    WinnerRequestStatus.NEEDS_SIMPLIFICATION
  );
  assert.equal(adminState.winnerRequests[0]?.authorLabel, "Archive Commander");
  assert.equal(adminState.recentHistory[0]?.winnerLabel, "Archive Commander");
  assert.equal(
    adminState.winnerRequests[0]?.reviewNotes,
    "Keep it to one small badge and no extra summary blocks."
  );
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

test("manual catch-up resolves due attacks and relaunches on the next eligible minute", async (context) => {
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
  assert.ok(summary.launchedAttackUnits >= 2);
  assert.equal(afterCatchUpTarget.points, beforeCatchUpTarget.points - 2);
  assert.ok(unresolvedAfterCatchUp.length >= 2);
  assert.equal(
    unresolvedAfterCatchUp.at(-1)?.launchedAt.toISOString(),
    catchUpAt.toISOString()
  );
});
