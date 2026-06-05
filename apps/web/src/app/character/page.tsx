import { redirect } from "next/navigation";
import type { Session } from "next-auth";
import { auth, isAuthConfigured } from "@/auth";
import {
  getDegradedSeasonFiveHomeState,
  getSeasonFiveHomeState,
  isSeasonFivePreviewEnabled,
} from "@/lib/game/season-five";
import { SeasonFiveCharacterClient } from "../season-five-character-client";

export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function getSearchValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function CharacterPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  if (!isSeasonFivePreviewEnabled()) {
    redirect("/");
  }

  let session: Session | null = null;

  try {
    session = await auth();
  } catch (error) {
    console.error("Failed to load Season 5 character session", error);
    redirect("/?error=Sign%20in%20again%20to%20manage%20your%20character.");
  }

  if (!session?.user?.id) {
    redirect("/?error=Sign%20in%20to%20manage%20your%20character.");
  }

  let state = getDegradedSeasonFiveHomeState();

  try {
    state = await getSeasonFiveHomeState({
      userId: session.user.id,
    });
  } catch (error) {
    console.error("Failed to load Season 5 character state", error);
  }

  const params = await searchParams;

  return (
    <SeasonFiveCharacterClient
      state={state}
      session={session}
      activeTab={getSearchValue(params.tab) ?? null}
      authConfigured={isAuthConfigured}
      realtimeEnabled={process.env.NEXT_PUBLIC_REALTIME_ENABLED === "true"}
    />
  );
}
