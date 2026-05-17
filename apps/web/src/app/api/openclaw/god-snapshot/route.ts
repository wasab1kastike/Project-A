import { NextResponse } from "next/server";
import { getGodSnapshot } from "@/lib/game/god-snapshot";
import {
  getConfiguredOpenClawGodSecret,
  isOpenClawGodAuthorized,
  openClawJsonError,
} from "@/lib/openclaw/auth";

export async function GET(request: Request) {
  const secret = getConfiguredOpenClawGodSecret();

  if (!secret) {
    return openClawJsonError("OpenClaw god vision is not configured.", 503);
  }

  if (!isOpenClawGodAuthorized(request, secret)) {
    return openClawJsonError(
      "OpenClaw god vision secret is missing or invalid.",
      401
    );
  }

  try {
    const snapshot = await getGodSnapshot();

    return NextResponse.json(snapshot);
  } catch {
    return openClawJsonError(
      "Something went wrong while reading divine vision.",
      500
    );
  }
}
