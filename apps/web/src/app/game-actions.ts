"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import {
  markChatRead,
  sendChatGifMessage,
  sendChatMessage,
} from "@/lib/game/chat";
import {
  equipCosmeticUnlock,
  openArcadeLootBox,
  playArcadeGame,
  purchaseArcadeLootBox,
  unequipCosmeticUnlock,
} from "@/lib/game/arcade";
import {
  saveCommunityWishVotes,
  submitCommunityWishProposal,
} from "@/lib/game/community-wishes";
import { submitBuildArcadeScore } from "@/lib/game/build-arcade";
import { GameError } from "@/lib/game/errors";
import {
  ArcadeCosmeticSlot,
  ArcadeGameType,
  ArcadeLootBoxType,
  BattlefieldSide,
  FortressAction,
  OrkBossOrderKind,
  OrkWaaaghInvestmentKind,
  RaceAbilityKind,
} from "@/lib/prisma-client";
import { emitProjectARefresh } from "@/lib/realtime";
import {
  editRegistrationFortressName,
  activateDwarfDeepMining,
  activateDwarfRuneOfGrudges,
  activateOrkBossOrder,
  activateRaceAbility,
  chooseDwarfGrudge,
  chooseDwarfTierThreeGrudge,
  choosePendingUpgradeSpecialization,
  attackMapHex,
  claimNeutralMapHex,
  claimUnicornTeleport,
  activateUnicornShatteredReality,
  joinBattlefield,
  joinRegistrationCycle,
  purchaseFortressUpgrade,
  recruitArmy,
  registerCommanderName,
  renameActiveFortress,
  recallBattlefieldArmy,
  recallAttackUnit,
  recallGarrisonArmy,
  instantRecallGarrison,
  selectFortressRace,
  setFortressAction,
  updateWorkerAssignment,
  shuffleFortressLocation,
  investOrkWaaaghScrap,
  buyPointsWithGold,
} from "@/lib/game/service";
import type { AttackUnitLaunchMarker } from "@/lib/game/service";

function getString(formData: FormData, key: string) {
  const value = formData.get(key);

  return typeof value === "string" ? value : "";
}

function getNumber(formData: FormData, key: string, fallback: number) {
  const value = getString(formData, key);

  if (!value) {
    return fallback;
  }

  return Number(value);
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

function redirectToArcade(
  kind: "error" | "notice",
  message: string,
  details?: Record<string, string>
): never {
  const params = new URLSearchParams(details);
  params.set(kind, message);
  redirect(`/shop?${params.toString()}`);
}

async function requireUserId() {
  const session = await auth();
  const userId = session?.user?.id;

  if (!userId) {
    redirectToHome(
      "error",
      "You need to sign in before changing season state."
    );
  }

  return userId;
}

async function requireArcadeUserId() {
  const session = await auth();
  const userId = session?.user?.id;

  if (!userId) {
    redirectToArcade("error", "You need to sign in before using the arcade.");
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

function finishArcadeAction(
  notice: string,
  details?: Record<string, string>
): never {
  revalidatePath("/shop");
  redirectToArcade("notice", notice, details);
}

type InlineActionResult =
  | {
      ok: true;
    }
  | {
      ok: false;
      error: string;
    };

type MapHexAttackActionResult =
  | {
      ok: true;
      launchedAttackUnit?: AttackUnitLaunchMarker;
    }
  | {
      ok: false;
      error: string;
    };

function isTransientClaimTransactionError(error: unknown) {
  if (!(error instanceof Error)) {
    return false;
  }

  return /Transaction already closed|expired transaction|Transaction API error|timed out/i.test(
    error.message
  );
}

export async function attackFromMapAction(
  targetFortressId: string,
  sentArmy = 1
) {
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
      sentArmy,
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

export async function claimMapHexAction(tileId: string) {
  const session = await auth();
  const userId = session?.user?.id;

  if (!userId) {
    return {
      ok: false,
      error: "You need to sign in before changing season state.",
    } satisfies InlineActionResult;
  }

  try {
    try {
      await claimNeutralMapHex({
        userId,
        tileId,
      });
    } catch (error) {
      if (!isTransientClaimTransactionError(error)) {
        throw error;
      }

      console.warn(
        "Retrying claimMapHexAction after transient transaction timeout",
        error
      );

      await claimNeutralMapHex({
        userId,
        tileId,
      });
    }

    emitProjectARefresh("map-hex-claim");
    revalidatePath("/");
    revalidatePath("/castle");
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

export async function attackMapHexAction(tileId: string, sentArmy = 1) {
  const session = await auth();
  const userId = session?.user?.id;

  if (!userId) {
    return {
      ok: false,
      error: "You need to sign in before changing season state.",
    } satisfies InlineActionResult;
  }

  try {
    const result = await attackMapHex({
      userId,
      tileId,
      sentArmy,
    });
    emitProjectARefresh("map-hex-attack");
    revalidatePath("/");
    revalidatePath("/castle");
    return {
      ok: true,
      launchedAttackUnit: result.launchedAttackUnit,
    } satisfies MapHexAttackActionResult;
  } catch (error) {
    return {
      ok: false,
      error: getActionErrorMessage(error),
    } satisfies MapHexAttackActionResult;
  }
}

export async function joinBattlefieldAction(formData: FormData) {
  const userId = await requireUserId();
  const sideInput = getString(formData, "side");

  try {
    await joinBattlefield({
      userId,
      battlefieldId: getString(formData, "battlefieldId"),
      side:
        sideInput === BattlefieldSide.DEFENDER
          ? BattlefieldSide.DEFENDER
          : BattlefieldSide.ATTACKER,
      armyAmount: getNumber(formData, "armyAmount", 1),
    });
    emitProjectARefresh("battlefield-join");
  } catch (error) {
    redirectToHome("error", getActionErrorMessage(error));
  }

  finishAction("Army committed to battlefield.");
}

export async function recallAttackUnitAction(attackUnitId: string) {
  const session = await auth();
  const userId = session?.user?.id;

  if (!userId) {
    return {
      ok: false,
      error: "You need to sign in before changing season state.",
    } satisfies InlineActionResult;
  }

  try {
    await recallAttackUnit({
      userId,
      attackUnitId,
    });
    emitProjectARefresh("map-recall");
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

export async function instantRecallAttackUnitAction(attackUnitId: string) {
  const session = await auth();
  const userId = session?.user?.id;

  if (!userId) {
    return {
      ok: false,
      error: "You need to sign in before changing season state.",
    } satisfies InlineActionResult;
  }

  try {
    await recallAttackUnit({
      userId,
      attackUnitId,
      instant: true,
    });
    emitProjectARefresh("map-recall");
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

export async function instantRecallGarrisonAction(garrisonId: string) {
  const session = await auth();
  const userId = session?.user?.id;

  if (!userId) {
    return {
      ok: false,
      error: "You need to sign in before changing season state.",
    } satisfies InlineActionResult;
  }

  try {
    await instantRecallGarrison({
      userId,
      garrisonId,
    });
    emitProjectARefresh("garrison-recall");
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

export async function recallBattlefieldArmyAction(
  battlefieldId: string,
  armyAmount: number
) {
  const session = await auth();
  const userId = session?.user?.id;

  if (!userId) {
    return {
      ok: false,
      error: "You need to sign in before changing season state.",
    } satisfies InlineActionResult;
  }

  try {
    await recallBattlefieldArmy({
      userId,
      battlefieldId,
      armyAmount,
    });
    emitProjectARefresh("battlefield-recall");
    revalidatePath("/");
    revalidatePath("/castle");
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

export async function recallGarrisonArmyAction(
  garrisonId: string,
  armyAmount: number
) {
  const session = await auth();
  const userId = session?.user?.id;

  if (!userId) {
    return {
      ok: false,
      error: "You need to sign in before changing season state.",
    } satisfies InlineActionResult;
  }

  try {
    await recallGarrisonArmy({
      userId,
      garrisonId,
      armyAmount,
    });
    emitProjectARefresh("garrison-recall");
    revalidatePath("/");
    revalidatePath("/castle");
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

export async function updateWorkerAssignmentAction(input: {
  minersAssigned: number;
  farmersAssigned: number;
  recruitersAssigned: number;
}) {
  const session = await auth();
  const userId = session?.user?.id;

  if (!userId) {
    return {
      ok: false,
      error: "You need to sign in before changing season state.",
    } satisfies InlineActionResult;
  }

  try {
    await updateWorkerAssignment({
      userId,
      minersAssigned: input.minersAssigned,
      farmersAssigned: input.farmersAssigned,
      recruitersAssigned: input.recruitersAssigned,
    });
    emitProjectARefresh("worker-assignment");
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

export async function recruitArmyAction(input: { unitCount: number }) {
  const session = await auth();
  const userId = session?.user?.id;

  if (!userId) {
    return {
      ok: false,
      error: "You need to sign in before recruiting army.",
    } satisfies InlineActionResult;
  }

  try {
    await recruitArmy({
      userId,
      unitCount: input.unitCount,
    });
    emitProjectARefresh("army-recruitment");
    revalidatePath("/");
    revalidatePath("/castle");
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

export async function selectFortressRaceAction(formData: FormData) {
  const userId = await requireUserId();

  try {
    await selectFortressRace({
      userId,
      race: getString(formData, "race"),
    });
    emitProjectARefresh("race-selection");
  } catch (error) {
    redirectToHome("error", getActionErrorMessage(error));
  }

  finishAction("Race locked for this season.");
}

export async function joinFortressAction(formData: FormData) {
  const userId = await requireUserId();

  try {
    await joinRegistrationCycle({
      userId,
      commanderName: getString(formData, "commanderName"),
      fortressName: getString(formData, "fortressName"),
      race: getString(formData, "race"),
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

  finishAction("Fortress renamed and 10 gold spent.");
}

export async function buyPointsWithGoldAction(formData: FormData) {
  const userId = await requireUserId();

  const goldAmount = getNumber(formData, "goldAmount", 0);
  let goldSpent = goldAmount;
  let pointsGained = 0;

  if (goldAmount <= 0) {
    redirectToHome("error", "Gold amount must be greater than 0.");
  }

  try {
    const result = await buyPointsWithGold({
      userId,
      goldAmount,
    });
    goldSpent = result.goldSpent;
    pointsGained = result.pointsGained;
    emitProjectARefresh("gold-to-points-conversion");
    revalidatePath("/");
  } catch (error) {
    redirectToHome("error", getActionErrorMessage(error));
  }

  finishAction(`Spent ${goldSpent} gold to gain ${pointsGained} points.`);
}

export async function purchaseFortressUpgradeAction(formData: FormData) {
  const userId = await requireUserId();

  try {
    await purchaseFortressUpgrade({
      userId,
      specialization: getString(formData, "specialization"),
    });
    emitProjectARefresh("castle-upgrade");
  } catch (error) {
    redirectToHome("error", getActionErrorMessage(error));
  }

  finishAction("Castle upgrade started. It will complete on a future tick.");
}

export async function choosePendingUpgradeSpecializationAction(
  formData: FormData
) {
  const userId = await requireUserId();

  try {
    await choosePendingUpgradeSpecialization({
      userId,
      specialization: getString(formData, "specialization"),
    });
    emitProjectARefresh("castle-upgrade-specialization");
  } catch (error) {
    redirectToHome("error", getActionErrorMessage(error));
  }

  finishAction("Castle specialization locked.");
}

export async function chooseDwarfGrudgeAction(formData: FormData) {
  const userId = await requireUserId();

  try {
    await chooseDwarfGrudge({
      userId,
      targetFortressId: getString(formData, "targetFortressId"),
    });
    emitProjectARefresh("dwarf-grudge");
  } catch (error) {
    redirectToHome("error", getActionErrorMessage(error));
  }

  finishAction("Grudge Book updated.");
}

export async function chooseDwarfTierThreeGrudgeAction(formData: FormData) {
  const userId = await requireUserId();

  try {
    await chooseDwarfTierThreeGrudge({
      userId,
      targetFortressId: getString(formData, "targetFortressId") || undefined,
      doubleExisting: getString(formData, "choice") === "double",
    });
    emitProjectARefresh("dwarf-grudge-tier-three");
  } catch (error) {
    redirectToHome("error", getActionErrorMessage(error));
  }

  finishAction("Grudge Book updated.");
}

export async function activateWaaaghAction() {
  const userId = await requireUserId();

  try {
    await activateRaceAbility({
      userId,
      kind: RaceAbilityKind.ORK_WAAAGH,
    });
    emitProjectARefresh("ork-waaagh");
  } catch (error) {
    redirectToHome("error", getActionErrorMessage(error));
  }

  finishAction("WAAAGH activated for one hour.");
}

export async function activateOrkBossOrderAction(formData: FormData) {
  const userId = await requireUserId();

  try {
    await activateOrkBossOrder({
      userId,
      kind: getString(formData, "kind") as OrkBossOrderKind,
    });
    emitProjectARefresh("ork-boss-order");
  } catch (error) {
    redirectToHome("error", getActionErrorMessage(error));
  }

  finishAction("Boss Order shouted.");
}

export async function investOrkWaaaghScrapAction(formData: FormData) {
  const userId = await requireUserId();

  try {
    await investOrkWaaaghScrap({
      userId,
      kind: getString(formData, "kind") as OrkWaaaghInvestmentKind,
    });
    emitProjectARefresh("ork-waaagh-investment");
  } catch (error) {
    redirectToHome("error", getActionErrorMessage(error));
  }

  finishAction("WAAAGH fed with Scrap.");
}

export async function activateStimAction() {
  const userId = await requireUserId();

  try {
    await activateRaceAbility({
      userId,
      kind: RaceAbilityKind.SPACE_MURINE_STIM,
    });
    emitProjectARefresh("space-murine-stim");
  } catch (error) {
    redirectToHome("error", getActionErrorMessage(error));
  }

  finishAction("STIM activated for one hour.");
}

export async function activateDwarfDeepMiningAction(formData: FormData) {
  const userId = await requireUserId();
  let notice: string;

  try {
    const result = await activateDwarfDeepMining({
      userId,
      committedGold: getNumber(formData, "committedGold", 0),
    });
    emitProjectARefresh("dwarf-deep-mining");

    notice = `${result.label}: ${result.committedGold} gold committed, resolves at ${result.resolveAt.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    })}.`;
  } catch (error) {
    redirectToHome("error", getActionErrorMessage(error));
  }

  finishAction(notice);
}

export async function activateDwarfRuneOfGrudgesAction(formData: FormData) {
  const userId = await requireUserId();

  try {
    const result = await activateDwarfRuneOfGrudges({
      userId,
      targetFortressId: getString(formData, "targetFortressId"),
    });
    emitProjectARefresh("dwarf-rune-grudges");

    finishAction(
      `Rune of Grudges raised against ${result.targetName} for 6 hours.`
    );
  } catch (error) {
    redirectToHome("error", getActionErrorMessage(error));
  }
}

export async function claimUnicornTeleportAction() {
  const userId = await requireUserId();
  let notice: string;

  try {
    await claimUnicornTeleport({
      userId,
    });
    const result = await shuffleFortressLocation({
      userId,
      useFreeTeleport: true,
    });
    emitProjectARefresh("unicorn-teleport-activate");

    notice =
      result.cancelledAttackUnitCount > 0
        ? "Free Unicorn teleport fired for 1 hour and left an attackable decoy at home. Outgoing attacks were canceled."
        : "Free Unicorn teleport fired for 1 hour and left an attackable decoy at home.";
  } catch (error) {
    redirectToHome("error", getActionErrorMessage(error));
  }

  finishAction(notice);
}

export async function activateUnicornShatteredRealityAction() {
  const userId = await requireUserId();

  try {
    const result = await activateUnicornShatteredReality({
      userId,
    });
    emitProjectARefresh("unicorn-shattered-reality");
    finishAction(`Shattered Reality: ${result.summary}`);
  } catch (error) {
    redirectToHome("error", getActionErrorMessage(error));
  }
}

export async function shuffleFortressLocationAction() {
  await requireUserId();
  redirectToHome("error", "Castle Yeet is paused for now.");
}

export async function useUnicornTeleportAction() {
  const userId = await requireUserId();
  let notice: string;

  try {
    const result = await shuffleFortressLocation({
      userId,
      useFreeTeleport: true,
    });
    emitProjectARefresh("unicorn-teleport-use");

    notice =
      result.cancelledAttackUnitCount > 0
        ? "Free Unicorn teleport fired for 1 hour and left an attackable decoy at home. Outgoing attacks were canceled."
        : "Free Unicorn teleport fired for 1 hour and left an attackable decoy at home.";
  } catch (error) {
    redirectToHome("error", getActionErrorMessage(error));
  }

  finishAction(notice);
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
  const sentArmy = getNumber(formData, "sentArmy", 1);

  try {
    const action =
      actionInput === FortressAction.ATTACK
        ? FortressAction.ATTACK
        : FortressAction.GROW;

    await setFortressAction({
      userId,
      action,
      targetFortressId: targetFortressId || undefined,
      sentArmy,
    });
    emitProjectARefresh("action-update");
  } catch (error) {
    redirectToHome("error", getActionErrorMessage(error));
  }

  finishAction(
    actionInput === FortressAction.ATTACK
      ? "Attack launched."
      : "Fortress growth continues."
  );
}

export async function submitCommunityWishProposalAction(formData: FormData) {
  const userId = await requireUserId();
  const cycleId = getString(formData, "cycleId");
  const requestText = getString(formData, "requestText");

  if (!cycleId) {
    redirectToHome("error", "Community wish is missing its cycle reference.");
  }

  try {
    await submitCommunityWishProposal({
      cycleId,
      userId,
      requestText,
    });
    emitProjectARefresh("community-wish-proposal");
  } catch (error) {
    redirectToHome("error", getActionErrorMessage(error));
  }

  revalidatePath("/history");
  revalidatePath("/admin");
  finishAction("Community wish proposal saved.");
}

export async function saveCommunityWishVotesAction(formData: FormData) {
  const userId = await requireUserId();
  const cycleId = getString(formData, "cycleId");

  if (!cycleId) {
    redirectToHome(
      "error",
      "Community wish vote is missing its cycle reference."
    );
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
    redirectToHome("error", getActionErrorMessage(error));
  }

  revalidatePath("/history");
  revalidatePath("/admin");
  finishAction("Community wish votes saved.");
}

export async function submitBuildArcadeScoreAction(formData: FormData) {
  const userId = await requireUserId();
  const cycleId = getString(formData, "cycleId");
  const scoreValue = Number(getString(formData, "score"));

  if (!cycleId) {
    redirectToHome(
      "error",
      "Build arcade score is missing its cycle reference."
    );
  }

  try {
    await submitBuildArcadeScore({
      cycleId,
      userId,
      score: Number.isFinite(scoreValue) ? scoreValue : 0,
    });
    emitProjectARefresh("build-arcade-score");
  } catch (error) {
    redirectToHome("error", getActionErrorMessage(error));
  }

  finishAction("Build arcade score saved.");
}

export async function playArcadeGameAction(formData: FormData) {
  const userId = await requireArcadeUserId();
  const cycleId = getString(formData, "cycleId");
  const gameType = getString(formData, "gameType");
  const stakeValue = Number(getString(formData, "stake"));
  const choice = getString(formData, "choice") || null;

  if (!cycleId) {
    redirectToArcade("error", "Arcade game is missing its cycle reference.");
  }

  try {
    await playArcadeGame({
      cycleId,
      userId,
      gameType:
        gameType === ArcadeGameType.DICE
          ? ArcadeGameType.DICE
          : gameType === ArcadeGameType.WHEEL
            ? ArcadeGameType.WHEEL
            : ArcadeGameType.SLOTS,
      stake: Number.isFinite(stakeValue) ? stakeValue : 0,
      choice,
    });
    emitProjectARefresh("arcade-game-play");
  } catch (error) {
    redirectToArcade("error", getActionErrorMessage(error));
  }

  finishArcadeAction("Arcade game resolved.");
}

export async function purchaseArcadeLootBoxAction(formData: FormData) {
  const userId = await requireArcadeUserId();
  const crateType = getString(formData, "crateType");

  try {
    await purchaseArcadeLootBox({
      userId,
      crateType:
        crateType === ArcadeLootBoxType.FORTRESS
          ? ArcadeLootBoxType.FORTRESS
          : ArcadeLootBoxType.UNIT,
    });
    emitProjectARefresh("arcade-loot-box-purchase");
  } catch (error) {
    redirectToArcade("error", getActionErrorMessage(error));
  }

  finishArcadeAction("Loot box purchased.");
}

export async function openArcadeLootBoxAction(formData: FormData) {
  const userId = await requireArcadeUserId();
  const purchaseId = getString(formData, "purchaseId");

  if (!purchaseId) {
    redirectToArcade("error", "Loot box is missing its purchase reference.");
  }

  try {
    const result = await openArcadeLootBox({
      purchaseId,
      userId,
    });
    emitProjectARefresh("arcade-loot-box-open");
    finishArcadeAction("Loot box opened.", {
      reveal: "loot-box",
      slot: result.slot,
      variant: result.variant,
      duplicate: result.duplicatePayout > 0 ? "1" : "0",
    });
  } catch (error) {
    redirectToArcade("error", getActionErrorMessage(error));
  }
}

export async function equipCosmeticUnlockAction(formData: FormData) {
  const userId = await requireArcadeUserId();
  const unlockId = getString(formData, "unlockId");
  const slot = getString(formData, "slot");

  if (!unlockId) {
    redirectToArcade("error", "Cosmetic unlock is missing its reference.");
  }

  try {
    await equipCosmeticUnlock({
      unlockId,
      userId,
      slot:
        slot === ArcadeCosmeticSlot.FORTRESS
          ? ArcadeCosmeticSlot.FORTRESS
          : ArcadeCosmeticSlot.UNIT,
    });
    emitProjectARefresh("arcade-cosmetic-equip");
  } catch (error) {
    redirectToArcade("error", getActionErrorMessage(error));
  }

  finishArcadeAction("Cosmetic equipped.");
}

export async function unequipCosmeticAction(formData: FormData) {
  const userId = await requireArcadeUserId();
  const slot = getString(formData, "slot");

  if (!slot) {
    redirectToArcade("error", "Cosmetic slot is missing.");
  }

  try {
    await unequipCosmeticUnlock({
      userId,
      slot:
        slot === ArcadeCosmeticSlot.FORTRESS
          ? ArcadeCosmeticSlot.FORTRESS
          : ArcadeCosmeticSlot.UNIT,
    });
    emitProjectARefresh("arcade-cosmetic-equip");
  } catch (error) {
    redirectToArcade("error", getActionErrorMessage(error));
  }

  finishArcadeAction("Using default skin.");
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

export async function sendChatGifMessageAction(formData: FormData) {
  const userId = await requireUserId();

  try {
    await sendChatGifMessage({
      userId,
      gif: {
        providerId: getString(formData, "providerId"),
        title: getString(formData, "title"),
        previewUrl: getString(formData, "previewUrl"),
        displayUrl: getString(formData, "displayUrl"),
        width: Number(getString(formData, "width")),
        height: Number(getString(formData, "height")),
        sourceUrl: getString(formData, "sourceUrl"),
      },
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

