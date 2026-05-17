import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  getConfiguredOpenClawGodSecret,
  isOpenClawGodAuthorized,
  openClawJsonError,
} from "@/lib/openclaw/auth";
import { emitProjectARefresh } from "@/lib/realtime";

const GOD_EMPEROR_TEST_CHAT_BODIES = [
  "The God Emperor A sees the scoreboard shift: Aarocorn leads with 164258 points.",
  "The God Emperor A sees the scoreboard shift: Aarocorn leads with 164282 points.",
  "Crown audit: Aarocorn leads with 164310 points. A approves the ambition and invoices everyone else for looking surprised.",
  "Crown audit: Aarocorn leads with 164318 points. A approves the ambition and invoices everyone else for looking surprised.",
  "Crown audit: Aarocorn of UniBonk, Unstable Unicorns, has stacked 164682 points. A respects the climb; the rest of the realm may file complaints in the bin.",
  "Home of A update: Defeated. Respawns at 18:21. A calls this dignity; the health bar calls it paperwork.",
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
