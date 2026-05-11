"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { emitProjectARefresh } from "@/lib/realtime";
import { requireAdminSession } from "@/lib/admin";
import { GameError } from "@/lib/game/errors";
import { WinnerRequestStatus } from "@/lib/prisma-client";
import {
  emergencyResetCurrentCycle,
  forceEndCurrentCycle,
  runManualCatchUpTick,
  setRegistrationJoiningLock,
  startNewSeasonWithActiveAt,
} from "@/lib/game/admin-operations";
import {
  adminResolveCommunityWishTie,
  updateCommunityWishFulfillmentProgress,
} from "@/lib/game/community-wishes";
import {
  reviewWinnerRequest,
  updateWinnerRequestFulfillmentProgress,
} from "@/lib/game/winner-requests";

function getString(formData: FormData, key: string) {
  const value = formData.get(key);

  return typeof value === "string" ? value : "";
}

function getNumber(formData: FormData, key: string) {
  const value = Number(getString(formData, key));

  return Number.isFinite(value) ? value : 0;
}

function redirectToAdmin(
  kind: "error" | "notice",
  message: string
): never {
  const params = new URLSearchParams();
  params.set(kind, message);
  redirect(`/admin?${params.toString()}`);
}

function getActionErrorMessage(error: unknown) {
  if (error instanceof GameError) {
    return error.message;
  }

  return "Something went wrong while updating admin state.";
}

function finishAction(notice: string): never {
  revalidatePath("/");
  revalidatePath("/admin");
  revalidatePath("/history");
  redirectToAdmin("notice", notice);
}

export async function toggleJoiningLockAction(formData: FormData) {
  await requireAdminSession();
  const intent = getString(formData, "intent");

  try {
    await setRegistrationJoiningLock({
      locked: intent !== "unlock",
    });
    emitProjectARefresh(intent === "unlock" ? "admin-unlock" : "admin-lock");
  } catch (error) {
    redirectToAdmin("error", getActionErrorMessage(error));
  }

  finishAction(
    intent === "unlock"
      ? "Registration joining unlocked."
      : "Registration joining locked."
  );
}

export async function forceEndCycleAction() {
  await requireAdminSession();

  try {
    await forceEndCurrentCycle();
    emitProjectARefresh("admin-force-end");
  } catch (error) {
    redirectToAdmin("error", getActionErrorMessage(error));
  }

  finishAction("Current cycle deadline forced to now.");
}

export async function emergencyResetCycleAction() {
  await requireAdminSession();

  try {
    await emergencyResetCurrentCycle();
    emitProjectARefresh("admin-emergency-reset");
  } catch (error) {
    redirectToAdmin("error", getActionErrorMessage(error));
  }

    finishAction("Emergency reset completed and a fresh build phase was created.");
}

export async function runManualCatchUpTickAction() {
  await requireAdminSession();

  try {
    await runManualCatchUpTick();
    emitProjectARefresh("admin-manual-catch-up");
  } catch (error) {
    redirectToAdmin("error", getActionErrorMessage(error));
  }

  finishAction(
    "Catch-up tick replay complete. Due minutes were reprocessed and the battlefield was refreshed."
  );
}

export async function reviewWinnerRequestAction(formData: FormData) {
  const session = await requireAdminSession();
  const requestId = getString(formData, "requestId");
  const statusInput = getString(formData, "status");
  const reviewNotes = getString(formData, "reviewNotes");

  const status = Object.values(WinnerRequestStatus).includes(
    statusInput as WinnerRequestStatus
  )
    ? (statusInput as WinnerRequestStatus)
    : null;

  if (!requestId || !status) {
    redirectToAdmin("error", "Choose a valid winner request and review state.");
  }

  try {
    await reviewWinnerRequest({
      requestId,
      reviewedById: session.user.id,
      status,
      reviewNotes,
    });
    emitProjectARefresh("winner-request-review");
  } catch (error) {
    redirectToAdmin("error", getActionErrorMessage(error));
  }

  finishAction("Winner request review updated.");
}

export async function updateWinnerRequestFulfillmentProgressAction(
  formData: FormData
) {
  await requireAdminSession();
  const requestId = getString(formData, "requestId");
  const progress = getNumber(formData, "progress");

  if (!requestId) {
    redirectToAdmin("error", "Choose a valid winner request.");
  }

  try {
    await updateWinnerRequestFulfillmentProgress({
      requestId,
      progress,
    });
    emitProjectARefresh("winner-request-progress");
  } catch (error) {
    redirectToAdmin("error", getActionErrorMessage(error));
  }

  finishAction("Winner wish progress updated.");
}

export async function resolveCommunityWishTieAction(formData: FormData) {
  const session = await requireAdminSession();
  const cycleId = getString(formData, "cycleId");
  const proposalId = getString(formData, "proposalId");

  if (!cycleId || !proposalId) {
    redirectToAdmin("error", "Choose a community wish proposal to resolve.");
  }

  try {
    await adminResolveCommunityWishTie({
      cycleId,
      proposalId,
      adminId: session.user.id,
    });
    emitProjectARefresh("community-wish-admin-resolve");
  } catch (error) {
    redirectToAdmin("error", getActionErrorMessage(error));
  }

  finishAction("Community wish tie resolved.");
}

export async function updateCommunityWishFulfillmentProgressAction(
  formData: FormData
) {
  await requireAdminSession();
  const cycleId = getString(formData, "cycleId");
  const progress = getNumber(formData, "progress");

  if (!cycleId) {
    redirectToAdmin("error", "Choose a resolved community wish.");
  }

  try {
    await updateCommunityWishFulfillmentProgress({
      cycleId,
      progress,
    });
    emitProjectARefresh("community-wish-progress");
  } catch (error) {
    redirectToAdmin("error", getActionErrorMessage(error));
  }

  finishAction("Community wish progress updated.");
}

export async function startNewSeasonAction(formData: FormData) {
  await requireAdminSession();
  const hoursInput = getString(formData, "hourOfDay");
  const hour = getNumber(formData, "hourOfDay");

  if (!Number.isFinite(hour) || hour < 0 || hour > 23) {
    redirectToAdmin("error", "Enter a valid hour (0-23) for season start time.");
  }

  try {
    const now = new Date();
    const activeStartTime = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
      hour,
      0,
      0,
      0
    );

    const result = await startNewSeasonWithActiveAt({
      activeStartTime,
    });

    emitProjectARefresh("admin-new-season");
  } catch (error) {
    redirectToAdmin("error", getActionErrorMessage(error));
  }

  finishAction(`New season started! Registration now open, active phase at ${hour}:00 today.`);
}
