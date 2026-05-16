import { NextResponse } from "next/server";
import { sendGodEmperorChatMessage } from "@/lib/game/chat";
import { GameError } from "@/lib/game/errors";
import { emitProjectARefresh } from "@/lib/realtime";

const OPENCLAW_GOD_SECRET_HEADER = "x-openclaw-god-secret";

function jsonError(message: string, status: number) {
  return NextResponse.json(
    {
      ok: false,
      error: message,
    },
    {
      status,
    }
  );
}

function getConfiguredSecret() {
  const secret = process.env.OPENCLAW_GOD_SHARED_SECRET?.trim();

  return secret || null;
}

function isAuthorized(request: Request, secret: string) {
  return request.headers.get(OPENCLAW_GOD_SECRET_HEADER) === secret;
}

async function readJsonBody(request: Request) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  const secret = getConfiguredSecret();

  if (!secret) {
    return jsonError("OpenClaw god chat is not configured.", 503);
  }

  if (!isAuthorized(request, secret)) {
    return jsonError("OpenClaw god chat secret is missing or invalid.", 401);
  }

  const payload = await readJsonBody(request);

  if (
    !payload ||
    typeof payload !== "object" ||
    !("body" in payload) ||
    typeof payload.body !== "string"
  ) {
    return jsonError("Request body must include a string body field.", 400);
  }

  try {
    const message = await sendGodEmperorChatMessage({
      body: payload.body,
    });

    emitProjectARefresh("openclaw-god-chat");

    return NextResponse.json(
      {
        ok: true,
        id: message.id,
      },
      {
        status: 201,
      }
    );
  } catch (error) {
    if (error instanceof GameError) {
      if (/until a cycle exists/i.test(error.message)) {
        return jsonError(error.message, 409);
      }

      if (/limited to/i.test(error.message)) {
        return jsonError(error.message, 429);
      }

      return jsonError(error.message, 400);
    }

    return jsonError("Something went wrong while posting divine chat.", 500);
  }
}
