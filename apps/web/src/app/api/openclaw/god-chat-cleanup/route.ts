import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  getConfiguredOpenClawGodSecret,
  isOpenClawGodAuthorized,
  openClawJsonError,
} from "@/lib/openclaw/auth";
import { emitProjectARefresh } from "@/lib/realtime";

const GOD_EMPEROR_TEST_CHAT_BODIES = [
  "A stamps the war ledger: Tile 7:11: COOKERS of BEEFSTEW, Dwarfs, presses DA BOYZ of DA BOYZEZ ZITY, ORKS,; DEFENDER_STRONG at 99% progress.. Someone's strategy is wearing ceremonial shoes to a mud fight.",
  "Season decree: Season live: ACTIVE. A has opened one eye, which is already more oversight than some castles deserve.",
];

export async function POST(request: Request) {
  const secret = getConfiguredOpenClawGodSecret();

  if (!secret) {
    return openClawJsonError("OpenClaw cleanup is not configured.", 503);
  }

  if (!isOpenClawGodAuthorized(request, secret)) {
    return openClawJsonError("OpenClaw cleanup secret is missing or invalid.", 401);
  }

  const rows = await prisma.chatMessage.findMany({
    where: {
      type: "TEXT",
      body: {
        in: GOD_EMPEROR_TEST_CHAT_BODIES,
      },
      author: {
        email: "god-emperor-a@project-a.local",
      },
    },
    select: {
      id: true,
      body: true,
      createdAt: true,
    },
    orderBy: {
      createdAt: "asc",
    },
  });

  if (rows.length !== GOD_EMPEROR_TEST_CHAT_BODIES.length) {
    return NextResponse.json(
      {
        ok: false,
        error: `Refusing to delete: expected ${GOD_EMPEROR_TEST_CHAT_BODIES.length} rows, matched ${rows.length}.`,
        matched: rows.map((row) => ({
          id: row.id,
          body: row.body,
          createdAt: row.createdAt.toISOString(),
        })),
      },
      {
        status: 409,
      }
    );
  }

  const deleted = await prisma.chatMessage.deleteMany({
    where: {
      id: {
        in: rows.map((row) => row.id),
      },
    },
  });

  emitProjectARefresh("openclaw-god-chat-cleanup");

  return NextResponse.json({
    ok: true,
    deleted: deleted.count,
    ids: rows.map((row) => row.id),
  });
}
