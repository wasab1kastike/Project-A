import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { after, before, beforeEach, test, type TestContext } from "node:test";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  FortressAction,
  PrismaClient,
  ScoreEventType,
} from "@/lib/prisma-client";
import {
  forceEndCurrentCycle,
  setRegistrationJoiningLock,
} from "./admin-operations";
import { seedProjectA } from "./bootstrap";
import { sendChatMessage } from "./chat";
import { getHomePageState } from "./read-model";
import { editRegistrationFortressName, joinRegistrationCycle, renameActiveFortress, setFortressAction } from "./service";
import { runGameTick } from "./tick";

const __dirname = dirname(fileURLToPath(import.meta.url));
const workspaceRoot = resolve(__dirname, "../../..");
const defaultDatabaseUrl =
  process.env.TEST_DATABASE_URL ??
  process.env.DATABASE_URL ??
  "postgresql://postgres:postgres@localhost:5432/project_a?schema=public";

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
  const args = ["prisma", "migrate", "deploy", "--schema", "prisma/schema.prisma"];

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

  execFileSync(
    migrateCommand.command,
    migrateCommand.args,
    {
      cwd: workspaceRoot,
      env: {
        ...process.env,
        DATABASE_URL: databaseUrl,
      },
      stdio: "pipe",
    }
  );

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

async function seedOpenCycle(client: PrismaClient, now = new Date("2026-04-19T12:00:00.000Z")) {
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

test("join succeeds only during registration", async (context) => {
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

    await assert.rejects(
      () =>
        joinRegistrationCycle({
          db: prisma,
          userId: user.id,
          fortressName: "Late Join",
          now: new Date("2026-04-20T12:00:00.000Z"),
        }),
      /Registration is closed/
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
      fortressName: "Old Name",
    });

    await editRegistrationFortressName({
      db: prisma,
      userId: user.id,
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

    assert.equal(fortress.name, "New Name");
    assert.equal(fortress.points, 0);
    assert.equal(renameEvents.length, 0);
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

test("delayed ticks catch up and never drive scores below zero", async (context) => {
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
        points: 2,
        currentAction: FortressAction.ATTACK,
        targetFortressId: targetFortress.id,
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

    const summary = await runGameTick({
      db: prisma,
      now: new Date("2026-04-20T12:02:00.000Z"),
    });
    const refreshedAttacker = await prisma.fortress.findUniqueOrThrow({
      where: {
        id: attackerFortress.id,
      },
    });
    const refreshedTarget = await prisma.fortress.findUniqueOrThrow({
      where: {
        id: targetFortress.id,
      },
    });

    assert.equal(summary.processedMinutes, 2);
    assert.equal(refreshedAttacker.points, 0);
    assert.equal(refreshedTarget.points, 0);
    assert.ok(refreshedAttacker.points >= 0);
    assert.ok(refreshedTarget.points >= 0);
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
    assert.equal(targetableMarkers.length, 1);
    assert.equal(targetableMarkers[0]?.name, "Beta");
    assert.equal(state.availableTargets.length, 1);
    assert.equal(state.availableTargets[0]?.name, "Beta");
});

test("chat messages are visible to spectators in read-only mode", async (context) => {
    const prisma = getPrismaOrSkip(context);

    if (!prisma) {
      return;
    }

    await seedOpenCycle(prisma);
    const sender = await createUser(prisma, "chatter@example.com");

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
    assert.equal(
      signedOutState.chat.messages[0]?.authorName,
      "chatter@example.com"
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
