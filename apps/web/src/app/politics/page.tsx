import { redirect } from "next/navigation";
import type { Session } from "next-auth";

import { auth } from "@/auth";
import { getPoliticsPageState } from "@/lib/game/politics-read-model";
import { PoliticsClient } from "./politics-client";

export const dynamic = "force-dynamic";

export default async function PoliticsPage() {
  let session: Session | null = null;

  try {
    session = await auth();
  } catch (error) {
    console.error("Failed to load politics session", error);
    redirect("/?error=Sign%20in%20again%20to%20use%20politics.");
  }

  if (!session?.user?.id) {
    redirect("/?error=Sign%20in%20to%20use%20politics.");
  }

  const state = await getPoliticsPageState({
    userId: session.user.id,
  });

  if (!state.canUsePolitics) {
    redirect(
      `/?error=${encodeURIComponent(
        state.disabledReason ?? "Politics is not available right now."
      )}`
    );
  }

  return <PoliticsClient state={state} />;
}
