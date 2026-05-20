import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getHomePageState } from "@/lib/game/read-model";

export const dynamic = "force-dynamic";

export async function GET() {
  let userId: string | undefined;

  try {
    const session = await auth();
    userId = session?.user?.id;
  } catch (error) {
    console.error("Failed to load game state session", error);
  }

  try {
    const state = await getHomePageState({ userId });

    return NextResponse.json(state, {
      headers: {
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("Failed to load game state", error);

    return NextResponse.json(
      { error: "Game state refresh failed." },
      {
        status: 503,
        headers: {
          "Cache-Control": "no-store",
        },
      }
    );
  }
}
