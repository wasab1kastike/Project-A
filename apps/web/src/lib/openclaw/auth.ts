import { NextResponse } from "next/server";

export const OPENCLAW_GOD_SECRET_HEADER = "x-openclaw-god-secret";

export function getConfiguredOpenClawGodSecret() {
  const secret = process.env.OPENCLAW_GOD_SHARED_SECRET?.trim();

  return secret || null;
}

export function isOpenClawGodAuthorized(request: Request, secret: string) {
  return request.headers.get(OPENCLAW_GOD_SECRET_HEADER) === secret;
}

export function openClawJsonError(message: string, status: number) {
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
