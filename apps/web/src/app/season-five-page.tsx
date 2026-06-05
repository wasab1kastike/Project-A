import type { Session } from "next-auth";
import { auth, isAuthConfigured } from "@/auth";
import {
  getDegradedSeasonFiveHomeState,
  getSeasonFiveHomeState,
} from "@/lib/game/season-five";
import { SeasonFiveHomeClient } from "./season-five-home-client";

export async function SeasonFivePage({
  actionError,
  notice,
}: {
  actionError: string | null;
  notice: string | null;
}) {
  let session: Session | null = null;

  try {
    session = await auth();
  } catch (error) {
    console.error("Failed to load Season 5 session", error);
  }

  let state = getDegradedSeasonFiveHomeState();

  try {
    state = await getSeasonFiveHomeState({
      userId: session?.user?.id,
    });
  } catch (error) {
    console.error("Failed to load Season 5 state", error);
  }

  return (
    <SeasonFiveHomeClient
      state={state}
      session={session}
      actionError={actionError}
      notice={notice}
      authConfigured={isAuthConfigured}
      realtimeEnabled={process.env.NEXT_PUBLIC_REALTIME_ENABLED === "true"}
    />
  );
}
