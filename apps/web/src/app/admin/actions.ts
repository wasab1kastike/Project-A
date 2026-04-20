"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { emitProjectARefresh } from "@/lib/realtime";
import { requireAdminSession } from "@/lib/admin";
import { GameError } from "@/lib/game/errors";
import {
  emergencyResetCurrentCycle,
  forceEndCurrentCycle,
  setRegistrationJoiningLock,
} from "@/lib/game/admin-operations";

function getString(formData: FormData, key: string) {
  const value = formData.get(key);

  return typeof value === "string" ? value : "";
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

  finishAction("Emergency reset completed and a fresh registration cycle was created.");
}
