import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getHomePageState } from "@/lib/game/read-model";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await auth();
  const state = await getHomePageState({
    userId: session?.user?.id,
  });

  return NextResponse.json(state, {
    headers: {
      "Cache-Control": "no-store",
    },
  });
}
