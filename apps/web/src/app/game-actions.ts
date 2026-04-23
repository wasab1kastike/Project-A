"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { markChatRead, sendChatMessage } from "@/lib/game/chat";
import { GameError } from "@/lib/game/errors";
import { FortressAction } from "@/lib/prisma-client";
import { emitProjectARefresh } from "@/lib/realtime";
import {
  editRegistrationFortressName,
  joinRegistrationCycle,
  purchaseFortressUpgrade,
  registerCommanderName,
  renameActiveFortress,
  setFortressAction,
  shuffleFortressLocation,
} from "@/lib/game/service";

function getString(formData: FormData, key: string) {
  const value = formData.get(key);

  return typeof value === "string" ? value : "";
}

function redirectToHome(
  kind: "error" | "notice",
  message: string,
  details?: Record<string, string>
): never {
  const params = new URLSearchParams(details);
  params.set(kind, message);
  redirect(`/?${params.toString()}`);
}

async function requireUserId() {
  const session = await auth();
  const userId = session?.user?.id;

  if (!userId) {
    redirectToHome("error", "You need to sign in before changing season state.");
  }

  return userId;
}

function getActionErrorMessage(error: unknown) {
  if (error instanceof GameError) {
    return error.message;
  }

  return "Something went wrong while updating the season.";
}

function finishAction(notice: string): never {
  revalidatePath("/");
  redirectToHome("notice", notice);
}

type InlineActionResult =
  | {
      ok: true;
    }
  | {
      ok: false;
      error: string;
    };

export async function attackFromMapAction(targetFortressId: string) {
  const session = await auth();
  const userId = session?.user?.id;

  if (!userId) {
    return {
      ok: false,
      error: "You need to sign in before changing season state.",
    } satisfies InlineActionResult;
  }

  try {
    await setFortressAction({
      userId,
      action: FortressAction.ATTACK,
      targetFortressId,
    });
    emitProjectARefresh("map-attack");
    revalidatePath("/");
    return {
      ok: true,
    } satisfies InlineActionResult;
  } catch (error) {
    return {
      ok: false,
      error: getActionErrorMessage(error),
    } satisfies InlineActionResult;
  }
}

export async function joinFortressAction(formData: FormData) {
  const userId = await requireUserId();

  try {
    await joinRegistrationCycle({
      userId,
      commanderName: getString(formData, "commanderName"),
      fortressName: getString(formData, "fortressName"),
    });
    emitProjectARefresh("join");
  } catch (error) {
    redirectToHome("error", getActionErrorMessage(error));
  }

  finishAction("You joined the registration cycle.");
}

export async function editRegistrationFortressNameAction(formData: FormData) {
  const userId = await requireUserId();

  try {
    await editRegistrationFortressName({
      userId,
      commanderName: getString(formData, "commanderName"),
      fortressName: getString(formData, "fortressName"),
    });
    emitProjectARefresh("registration-rename");
  } catch (error) {
    redirectToHome("error", getActionErrorMessage(error));
  }

  finishAction("Registration fortress name updated.");
}

export async function renameFortressAction(formData: FormData) {
  const userId = await requireUserId();

  try {
    await renameActiveFortress({
      userId,
      fortressName: getString(formData, "fortressName"),
    });
    emitProjectARefresh("active-rename");
  } catch (error) {
    redirectToHome("error", getActionErrorMessage(error));
  }

  finishAction("Fortress renamed and 10 points spent.");
}

export async function purchaseFortressUpgradeAction() {
  const userId = await requireUserId();

  try {
    await purchaseFortressUpgrade({
      userId,
    });
    emitProjectARefresh("castle-upgrade");
  } catch (error) {
    redirectToHome("error", getActionErrorMessage(error));
  }

  finishAction("Castle upgraded.");
}

export async function shuffleFortressLocationAction() {
  const userId = await requireUserId();

  try {
    const result = await shuffleFortressLocation({
      userId,
    });
    emitProjectARefresh("location-shuffle");

    const notice =
      result.shuffleCost === 0
        ? result.cancelledAttackUnitCount > 0
          ? "Fortress location shuffled for free. Outgoing attacks were canceled."
          : "Fortress location shuffled for free."
        : result.cancelledAttackUnitCount > 0
          ? "Fortress location shuffled and 50 points spent. Outgoing attacks were canceled."
          : "Fortress location shuffled and 50 points spent.";

    finishAction(notice);
  } catch (error) {
    redirectToHome("error", getActionErrorMessage(error));
  }
}

export async function registerCommanderNameAction(formData: FormData) {
  const userId = await requireUserId();

  try {
    await registerCommanderName({
      userId,
      commanderName: getString(formData, "commanderName"),
    });
    emitProjectARefresh("commander-name");
  } catch (error) {
    redirectToHome("error", getActionErrorMessage(error));
  }

  finishAction("In-game nick registered.");
}

export async function setFortressActionAction(formData: FormData) {
  const userId = await requireUserId();
  const actionInput = getString(formData, "action");
  const targetFortressId = getString(formData, "targetFortressId");

  try {
    const action =
      actionInput === FortressAction.ATTACK
        ? FortressAction.ATTACK
        : FortressAction.GROW;

    await setFortressAction({
      userId,
      action,
      targetFortressId: targetFortressId || undefined,
    });
    emitProjectARefresh("action-update");
  } catch (error) {
    redirectToHome("error", getActionErrorMessage(error));
  }

  finishAction("Fortress action updated.");
}

export async function sendChatMessageAction(formData: FormData) {
  const userId = await requireUserId();

  try {
    await sendChatMessage({
      userId,
      body: getString(formData, "body"),
    });
    emitProjectARefresh("chat-message");
  } catch (error) {
    redirectToHome("error", getActionErrorMessage(error));
  }

  revalidatePath("/");
  redirect("/");
}

export async function markChatReadAction() {
  const session = await auth();
  const userId = session?.user?.id;

  if (!userId) {
    return {
      ok: true,
    } satisfies InlineActionResult;
  }

  try {
    await markChatRead({
      userId,
    });
    return {
      ok: true,
    } satisfies InlineActionResult;
  } catch (error) {
    return {
      ok: false,
      error: getActionErrorMessage(error),
    } satisfies InlineActionResult;
  }
}
