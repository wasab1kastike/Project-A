import pg from "pg";
import { randomUUID } from "node:crypto";

const { Client } = pg;

const SYSTEM_EMAIL = "npc@project-a.local";
const SYSTEM_NAME = "Project-A NPC";
const UNIBONK_NAME = "UNIBONK";
const DA_BOYZEZ_NAME = "DA BOYZEZ ZITY";
const CHAT_BODY =
  "DIVINE CUSTOMER SUPPORT UPDATE: A checked the complaint box and found UniBonk's missing 20,000 troops wedged behind the Home of A health bar. DA BOYZEZ ZITY also receives 50,000 troops, 50,000 gold, and one castle loot box for upgrade weirdness plus yesterday's Home of A slapstick damage tax. A promises the next patch note will be written with fewer hammers.";

type FortressRow = {
  id: string;
  ownerId: string;
  name: string;
  commanderName: string;
  army: number;
  gold: number;
};

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

    const fortressResult = await client.query<FortressRow>(
      `SELECT id, "ownerId", name, "commanderName", army, gold
       FROM "Fortress"
       WHERE "cycleId" = $1
         AND "isNpc" = false
         AND UPPER(name) = ANY($2::text[])
       ORDER BY name ASC`,
      [cycle.id, [UNIBONK_NAME, DA_BOYZEZ_NAME]]
    );

    const foundNames = new Set(
      fortressResult.rows.map((fortress) => fortress.name.toUpperCase())
    );
    const missingNames = [UNIBONK_NAME, DA_BOYZEZ_NAME].filter(
      (name) => !foundNames.has(name)
    );

    if (missingNames.length > 0) {
      throw new Error(`Missing target castles: ${missingNames.join(", ")}`);
    }

    const unibonk = fortressResult.rows.find(
      (fortress) => fortress.name.toUpperCase() === UNIBONK_NAME
    );
    const daBoyzez = fortressResult.rows.find(
      (fortress) => fortress.name.toUpperCase() === DA_BOYZEZ_NAME
    );

    if (!unibonk || !daBoyzez) {
      throw new Error("Failed to resolve compensation target castles.");
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

    const unibonkUpdate = await client.query<{ army: number; gold: number }>(
      `UPDATE "Fortress"
       SET army = army + 20000,
           "updatedAt" = NOW()
       WHERE id = $1
       RETURNING army, gold`,
      [unibonk.id]
    );

    const daBoyzezUpdate = await client.query<{ army: number; gold: number }>(
      `UPDATE "Fortress"
       SET army = army + 50000,
           gold = gold + 50000,
           "updatedAt" = NOW()
       WHERE id = $1
       RETURNING army, gold`,
      [daBoyzez.id]
    );

    await client.query(
      `INSERT INTO "ArcadeLootBoxPurchase"
        (id, "userId", "crateType", price, "openedAt", "duplicatePayout", "createdAt", "updatedAt")
       VALUES
        ($1, $2, 'FORTRESS', 0, NULL, 0, NOW(), NOW())`,
      [randomUUID(), daBoyzez.ownerId]
    );

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
          chatMessage: CHAT_BODY,
          grants: [
            {
              name: unibonk.name,
              commanderName: unibonk.commanderName,
              armyGranted: 20_000,
              goldGranted: 0,
              fortressLootBoxesGranted: 0,
              beforeArmy: unibonk.army,
              afterArmy: unibonkUpdate.rows[0]?.army,
              beforeGold: unibonk.gold,
              afterGold: unibonkUpdate.rows[0]?.gold,
              reason: "Lost units for defeating Home of A.",
            },
            {
              name: daBoyzez.name,
              commanderName: daBoyzez.commanderName,
              armyGranted: 50_000,
              goldGranted: 50_000,
              fortressLootBoxesGranted: 1,
              beforeArmy: daBoyzez.army,
              afterArmy: daBoyzezUpdate.rows[0]?.army,
              beforeGold: daBoyzez.gold,
              afterGold: daBoyzezUpdate.rows[0]?.gold,
              reason:
                "Upgrade issues and yesterday's Home of A defeat penalty.",
            },
          ],
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
