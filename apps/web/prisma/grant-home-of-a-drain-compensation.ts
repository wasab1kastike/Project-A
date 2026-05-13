import pg from "pg";
import { randomUUID } from "node:crypto";

const { Client } = pg;

const TARGET_CASTLES = ["UNIBONK", "BEEFSTEW", "TERO"] as const;
const ARMY_GRANT = 50_000;
const SYSTEM_EMAIL = "npc@project-a.local";
const SYSTEM_NAME = "Project-A NPC";
const CHAT_BODY =
  "HOME OF A ACCOUNTING INCIDENT: A has inspected the sacred drain pipes and discovered 150,000 troops doing laps in the wrong dimension. UniBonk, BEEFSTEW, and Tero each receive 50,000 replacement units. Please welcome them back as heroes, not as victims of divine spreadsheet plumbing.";

async function main() {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error("DATABASE_URL is required.");
  }

  const client = new Client({
    connectionString,
    ssl: {
      rejectUnauthorized: false,
    },
  });

  await client.connect();

  try {
    await client.query("BEGIN");

    const cycleResult = await client.query<{
      id: string;
      status: string;
    }>(
      `SELECT id, status
       FROM "Cycle"
       WHERE "resolvedAt" IS NULL
       ORDER BY "createdAt" DESC
       LIMIT 1`
    );

    const cycle = cycleResult.rows[0];

    if (!cycle) {
      throw new Error("No unresolved cycle found.");
    }

    const previousMessage = await client.query<{ id: string }>(
      `SELECT id
       FROM "ChatMessage"
       WHERE "cycleId" = $1
         AND body = $2
       LIMIT 1`,
      [cycle.id, CHAT_BODY]
    );

    if (previousMessage.rows.length > 0) {
      throw new Error(
        `This compensation chat message already exists for cycle ${cycle.id}; refusing to grant twice.`
      );
    }

    const fortressResult = await client.query<{
      id: string;
      ownerId: string;
      name: string;
      commanderName: string;
      army: number;
    }>(
      `SELECT id, "ownerId", name, "commanderName", army
       FROM "Fortress"
       WHERE "cycleId" = $1
         AND "isNpc" = false
         AND UPPER(name) = ANY($2::text[])
       ORDER BY name ASC`,
      [cycle.id, TARGET_CASTLES]
    );

    if (fortressResult.rows.length !== TARGET_CASTLES.length) {
      throw new Error(
        `Expected ${TARGET_CASTLES.length} target castles, found ${fortressResult.rows.length}: ${JSON.stringify(
          fortressResult.rows,
          null,
          2
        )}`
      );
    }

    const foundNames = new Set(
      fortressResult.rows.map((fortress) => fortress.name.toUpperCase())
    );
    const missingNames = TARGET_CASTLES.filter((name) => !foundNames.has(name));

    if (missingNames.length > 0) {
      throw new Error(`Missing target castles: ${missingNames.join(", ")}`);
    }

    const systemUserResult = await client.query<{ id: string }>(
      `INSERT INTO "User" (id, email, name, "createdAt", "updatedAt")
       VALUES ($1, $2, $3, NOW(), NOW())
       ON CONFLICT (email)
       DO UPDATE SET name = EXCLUDED.name, "updatedAt" = NOW()
       RETURNING id`,
      [randomUUID(), SYSTEM_EMAIL, SYSTEM_NAME]
    );

    const systemUserId = systemUserResult.rows[0]?.id;

    if (!systemUserId) {
      throw new Error("Failed to resolve system user id.");
    }

    const grants: Array<{
      name: string;
      commanderName: string;
      beforeArmy: number;
      afterArmy: number;
    }> = [];

    for (const fortress of fortressResult.rows) {
      const updateResult = await client.query<{ army: number }>(
        `UPDATE "Fortress"
         SET army = army + $2,
             "updatedAt" = NOW()
         WHERE id = $1
         RETURNING army`,
        [fortress.id, ARMY_GRANT]
      );
      const afterArmy = updateResult.rows[0]?.army;

      if (afterArmy === undefined) {
        throw new Error(`Failed to update fortress ${fortress.name}.`);
      }

      grants.push({
        name: fortress.name,
        commanderName: fortress.commanderName,
        beforeArmy: fortress.army,
        afterArmy,
      });
    }

    await client.query(
      `INSERT INTO "ChatMessage"
        (id, "cycleId", "authorId", type, body, "createdAt", "updatedAt")
       VALUES
        ($1, $2, $3, 'TEXT', $4, NOW(), NOW())`,
      [randomUUID(), cycle.id, systemUserId, CHAT_BODY]
    );

    await client.query("COMMIT");

    console.log(
      JSON.stringify(
        {
          ok: true,
          cycleId: cycle.id,
          cycleStatus: cycle.status,
          armyGrantedEach: ARMY_GRANT,
          grants,
          chatMessage: CHAT_BODY,
        },
        null,
        2
      )
    );
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
