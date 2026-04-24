"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { GameError } from "@/lib/game/errors";
import { emitProjectARefresh } from "@/lib/realtime";
import { saveCommunityWishVotes } from "@/lib/game/community-wishes";
import { submitWinnerRequest } from "@/lib/game/winner-requests";

function getString(formData: FormData, key: string) {
  const value = formData.get(key);

  return typeof value === "string" ? value : "";
}

function redirectToHistory(kind: "error" | "notice", message: string): never {
  const params = new URLSearchParams();
  params.set(kind, message);
  redirect(`/history?${params.toString()}`);
}

function getActionErrorMessage(error: unknown) {
  if (error instanceof GameError) {
    return error.message;
  }

  return "Something went wrong while saving the winner request.";
}

async function requireUserId() {
  const session = await auth();
  const userId = session?.user?.id;

  if (!userId) {
    redirectToHistory("error", "Sign in as the recorded winner before submitting a request.");
  }

  return userId;
}

export async function submitWinnerRequestAction(formData: FormData) {
  const userId = await requireUserId();
  const cycleId = getString(formData, "cycleId");
  const requestText = getString(formData, "requestText");

  if (!cycleId) {
    redirectToHistory("error", "Winner request is missing its cycle reference.");
  }

  try {
    await submitWinnerRequest({
      cycleId,
      userId,
      requestText,
    });
    emitProjectARefresh("winner-request-submit");
  } catch (error) {
    redirectToHistory("error", getActionErrorMessage(error));
  }

  revalidatePath("/admin");
  revalidatePath("/history");
  redirectToHistory("notice", "Winner request submitted.");
}

export async function saveCommunityWishVotesAction(formData: FormData) {
  const userId = await requireUserId();
  const cycleId = getString(formData, "cycleId");

  if (!cycleId) {
    redirectToHistory("error", "Community wish vote is missing its cycle reference.");
  }

  const allocations = Array.from(formData.entries())
    .filter(([key]) => key.startsWith("proposalVotes:"))
    .map(([key, value]) => ({
      proposalId: key.slice("proposalVotes:".length),
      votes: typeof value === "string" ? Number(value) : 0,
    }));

  try {
    await saveCommunityWishVotes({
      cycleId,
      userId,
      allocations,
    });
    emitProjectARefresh("community-wish-vote");
  } catch (error) {
    redirectToHistory("error", getActionErrorMessage(error));
  }

  revalidatePath("/admin");
  revalidatePath("/history");
  redirectToHistory("notice", "Community wish votes saved.");
}
