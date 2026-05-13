import pg from "pg";
import { randomUUID } from "node:crypto";

const { Client } = pg;

const TARGET_CASTLES = ["TERO", "UNIBONK"];
const ARMY_GRANT = 15_000;
const SYSTEM_EMAIL = "npc@project-a.local";
const SYSTEM_NAME = "Project-A NPC";

const apology =
  "A clears His cosmic throat: \"TERO, UNIBONK... apologies. I may have accidentally sneezed a minor apocalypse onto your remarkably fragile armies. In the oldest dust-caked tablets this is called a Whoops of A. Please accept 15,000 fresh troops and a unit loot box each. Try not to stand directly under divine patch notes during combat.\"";

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

    for (const fortress of fortressResult.rows) {
      await client.query(
        `UPDATE "Fortress"
         SET army = army + $2,
             "updatedAt" = NOW()
         WHERE id = $1`,
        [fortress.id, ARMY_GRANT]
      );

      await client.query(
        `INSERT INTO "ArcadeLootBoxPurchase"
          (id, "userId", "crateType", price, "openedAt", "duplicatePayout", "createdAt", "updatedAt")
         VALUES
          ($1, $2, 'UNIT', 0, NULL, 0, NOW(), NOW())`,
        [randomUUID(), fortress.ownerId]
      );
    }

    await client.query(
      `INSERT INTO "ChatMessage"
        (id, "cycleId", "authorId", type, body, "createdAt", "updatedAt")
       VALUES
        ($1, $2, $3, 'TEXT', $4, NOW(), NOW())`,
      [randomUUID(), cycle.id, systemUserId, apology]
    );

    await client.query("COMMIT");

    console.log(
      JSON.stringify(
        {
          ok: true,
          cycleId: cycle.id,
          cycleStatus: cycle.status,
          castles: fortressResult.rows.map((fortress) => fortress.name),
          armyGrantedEach: ARMY_GRANT,
          lootBoxesGrantedEach: 1,
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