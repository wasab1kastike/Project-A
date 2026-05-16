import { NextResponse } from "next/server";
import { sendGodEmperorChatMessage } from "@/lib/game/chat";
import { GameError } from "@/lib/game/errors";
import {
  getConfiguredOpenClawGodSecret,
  isOpenClawGodAuthorized,
  openClawJsonError,
} from "@/lib/openclaw/auth";
import { emitProjectARefresh } from "@/lib/realtime";

async function readJsonBody(request: Request) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  const secret = getConfiguredOpenClawGodSecret();

  if (!secret) {
    return openClawJsonError("OpenClaw god chat is not configured.", 503);
  }

  if (!isOpenClawGodAuthorized(request, secret)) {
    return openClawJsonError(
      "OpenClaw god chat secret is missing or invalid.",
      401
    );
  }

  const payload = await readJsonBody(request);

  if (
    !payload ||
    typeof payload !== "object" ||
    !("body" in payload) ||
    typeof payload.body !== "string"
  ) {
    return openClawJsonError(
      "Request body must include a string body field.",
      400
    );
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
        return openClawJsonError(error.message, 409);
      }

      if (/limited to/i.test(error.message)) {
        return openClawJsonError(error.message, 429);
      }

      return openClawJsonError(error.message, 400);
    }

    return openClawJsonError(
      "Something went wrong while posting divine chat.",
      500
    );
  }
}
