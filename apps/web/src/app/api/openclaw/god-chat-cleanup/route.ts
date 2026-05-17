import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  getConfiguredOpenClawGodSecret,
  isOpenClawGodAuthorized,
  openClawJsonError,
} from "@/lib/openclaw/auth";
import { emitProjectARefresh } from "@/lib/realtime";

const GOD_EMPEROR_TEST_CHAT_BODY =
  "The God Emperor A watches the banners strain in the smoke.";
const EXPECTED_TEST_ROW_COUNT = 2;

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
      body: GOD_EMPEROR_TEST_CHAT_BODY,
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

  if (rows.length !== EXPECTED_TEST_ROW_COUNT) {
    return NextResponse.json(
      {
        ok: false,
        error: `Refusing to delete: expected ${EXPECTED_TEST_ROW_COUNT} rows, matched ${rows.length}.`,
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
