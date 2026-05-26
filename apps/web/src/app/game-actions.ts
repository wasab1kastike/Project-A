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
  cancelDwarfRuneOfGrudges,
  chooseDwarfGrudge,
  chooseDwarfTierThreeGrudge,
  choosePendingUpgradeSpecialization,
  acceptAlliance,
  acceptAllianceTrustUpgrade,
  cancelAllianceProposal,
  cancelAllianceTrustUpgrade,
  acceptPeace,
  activateCasusBelliWar,
  attackMapHex,
  clearTilePressurePriority,
  declareWar,
  betrayAlliance,
  fortifyMapHex,
  claimUnicornTeleport,
  activateUnicornShatteredReality,
  joinBattlefield,
  joinRegistrationCycle,
  purchaseFortressUpgrade,
  proposeAlliance,
  proposeAllianceTrustUpgrade,
  proposePeace,
  rejectAllianceProposal,
  rejectAllianceTrustUpgrade,
  reinforceDwarfRuneOfGrudges,
  recruitArmy,
  registerCommanderName,
  renameActiveFortress,
  recallAllUnits,
  recallBattlefieldArmy,
  recallAttackUnit,
  recallGarrisonArmy,
  instantRecallGarrison,
  torchOccupiedMapHex,
  selectFortressRace,
  setFortressAction,
  updateWorkerAssignment,
  shuffleFortressLocation,
  investOrkWaaaghScrap,
  buyPointsWithGold,
  setTilePressurePriority,
  stationGuardOrder,
  createEscortOrder,
  createRaidOrder,
  startTerritoryCampaign,
  recallArmyOrder,
  createTradeOffer,
  acceptTradeOffer,
  rejectTradeOffer,
  cancelTradeOffer,
} from "@/lib/game/service";
import type { CreateTradeOfferInput } from "@/lib/game/service";
import type { AttackUnitLaunchMarker } from "@/lib/game/service";

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

const GAMEPLAY_REVALIDATE_PATHS = ["/"];
const CASTLE_REVALIDATE_PATHS = ["/", "/castle"];
const COMMUNITY_REVALIDATE_PATHS = ["/", "/history", "/admin"];

function notifyAndRevalidate(
  reason: string,
  paths: string[] = GAMEPLAY_REVALIDATE_PATHS
) {
  for (const path of new Set(paths)) {
    revalidatePath(path);
  }

  emitProjectARefresh(reason);
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
    notifyAndRevalidate("map-attack");
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

export async function setTilePressurePriorityAction(tileId: string) {
  const session = await auth();
  const userId = session?.user?.id;

  if (!userId) {
    return {
      ok: false,
      error: "You need to sign in before changing season state.",
    } satisfies InlineActionResult;
  }

  try {
    await setTilePressurePriority({
      userId,
      tileId,
    });
    notifyAndRevalidate("tile-pressure-priority");
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

export async function clearTilePressurePriorityAction(tileId: string) {
  const session = await auth();
  const userId = session?.user?.id;

  if (!userId) {
    return {
      ok: false,
      error: "You need to sign in before changing season state.",
    } satisfies InlineActionResult;
  }

  try {
    await clearTilePressurePriority({
      userId,
      tileId,
    });
    notifyAndRevalidate("tile-pressure-priority-clear");
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

export async function declareWarAction(targetFortressId: string) {
  const session = await auth();
  const userId = session?.user?.id;

  if (!userId) {
    return {
      ok: false,
      error: "You need to sign in before changing season state.",
    } satisfies InlineActionResult;
  }

  try {
    await declareWar({
      userId,
      targetFortressId,
    });
    notifyAndRevalidate("politics-declare-war", ["/", "/politics"]);
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

export async function activateCasusBelliWarAction(targetFortressId: string) {
  const session = await auth();
  const userId = session?.user?.id;

  if (!userId) {
    return {
      ok: false,
      error: "You need to sign in before changing season state.",
    } satisfies InlineActionResult;
  }

  try {
    await activateCasusBelliWar({ userId, targetFortressId });
    notifyAndRevalidate("politics-activate-casus-belli-war", ["/", "/politics"]);
    return { ok: true } satisfies InlineActionResult;
  } catch (error) {
    return {
      ok: false,
      error: getActionErrorMessage(error),
    } satisfies InlineActionResult;
  }
}

export async function proposeAllianceAction(targetFortressId: string) {
  const session = await auth();
  const userId = session?.user?.id;

  if (!userId) {
    return {
      ok: false,
      error: "You need to sign in before changing season state.",
    } satisfies InlineActionResult;
  }

  try {
    await proposeAlliance({ userId, targetFortressId });
    notifyAndRevalidate("politics-propose-alliance", ["/", "/politics"]);
    return { ok: true } satisfies InlineActionResult;
  } catch (error) {
    return {
      ok: false,
      error: getActionErrorMessage(error),
    } satisfies InlineActionResult;
  }
}

export async function acceptAllianceAction(targetFortressId: string) {
  const session = await auth();
  const userId = session?.user?.id;

  if (!userId) {
    return {
      ok: false,
      error: "You need to sign in before changing season state.",
    } satisfies InlineActionResult;
  }

  try {
    await acceptAlliance({ userId, targetFortressId });
    notifyAndRevalidate("politics-accept-alliance", ["/", "/politics"]);
    return { ok: true } satisfies InlineActionResult;
  } catch (error) {
    return {
      ok: false,
      error: getActionErrorMessage(error),
    } satisfies InlineActionResult;
  }
}

export async function cancelAllianceProposalAction(targetFortressId: string) {
  const session = await auth();
  const userId = session?.user?.id;

  if (!userId) {
    return {
      ok: false,
      error: "You need to sign in before changing season state.",
    } satisfies InlineActionResult;
  }

  try {
    await cancelAllianceProposal({ userId, targetFortressId });
    notifyAndRevalidate("politics-cancel-alliance", ["/", "/politics"]);
    return { ok: true } satisfies InlineActionResult;
  } catch (error) {
    return {
      ok: false,
      error: getActionErrorMessage(error),
    } satisfies InlineActionResult;
  }
}

export async function rejectAllianceProposalAction(targetFortressId: string) {
  const session = await auth();
  const userId = session?.user?.id;

  if (!userId) {
    return {
      ok: false,
      error: "You need to sign in before changing season state.",
    } satisfies InlineActionResult;
  }

  try {
    await rejectAllianceProposal({ userId, targetFortressId });
    notifyAndRevalidate("politics-reject-alliance", ["/", "/politics"]);
    return { ok: true } satisfies InlineActionResult;
  } catch (error) {
    return {
      ok: false,
      error: getActionErrorMessage(error),
    } satisfies InlineActionResult;
  }
}

export async function proposeAllianceTrustUpgradeAction(targetFortressId: string) {
  const session = await auth();
  const userId = session?.user?.id;

  if (!userId) {
    return {
      ok: false,
      error: "You need to sign in before changing season state.",
    } satisfies InlineActionResult;
  }

  try {
    await proposeAllianceTrustUpgrade({ userId, targetFortressId });
    notifyAndRevalidate("politics-propose-trust-upgrade", ["/", "/politics"]);
    return { ok: true } satisfies InlineActionResult;
  } catch (error) {
    return {
      ok: false,
      error: getActionErrorMessage(error),
    } satisfies InlineActionResult;
  }
}

export async function acceptAllianceTrustUpgradeAction(targetFortressId: string) {
  const session = await auth();
  const userId = session?.user?.id;

  if (!userId) {
    return {
      ok: false,
      error: "You need to sign in before changing season state.",
    } satisfies InlineActionResult;
  }

  try {
    await acceptAllianceTrustUpgrade({ userId, targetFortressId });
    notifyAndRevalidate("politics-accept-trust-upgrade", ["/", "/politics"]);
    return { ok: true } satisfies InlineActionResult;
  } catch (error) {
    return {
      ok: false,
      error: getActionErrorMessage(error),
    } satisfies InlineActionResult;
  }
}

export async function cancelAllianceTrustUpgradeAction(targetFortressId: string) {
  const session = await auth();
  const userId = session?.user?.id;

  if (!userId) {
    return {
      ok: false,
      error: "You need to sign in before changing season state.",
    } satisfies InlineActionResult;
  }

  try {
    await cancelAllianceTrustUpgrade({ userId, targetFortressId });
    notifyAndRevalidate("politics-cancel-trust-upgrade", ["/", "/politics"]);
    return { ok: true } satisfies InlineActionResult;
  } catch (error) {
    return {
      ok: false,
      error: getActionErrorMessage(error),
    } satisfies InlineActionResult;
  }
}

export async function rejectAllianceTrustUpgradeAction(targetFortressId: string) {
  const session = await auth();
  const userId = session?.user?.id;

  if (!userId) {
    return {
      ok: false,
      error: "You need to sign in before changing season state.",
    } satisfies InlineActionResult;
  }

  try {
    await rejectAllianceTrustUpgrade({ userId, targetFortressId });
    notifyAndRevalidate("politics-reject-trust-upgrade", ["/", "/politics"]);
    return { ok: true } satisfies InlineActionResult;
  } catch (error) {
    return {
      ok: false,
      error: getActionErrorMessage(error),
    } satisfies InlineActionResult;
  }
}

export async function betrayAllianceAction(targetFortressId: string) {
  const session = await auth();
  const userId = session?.user?.id;

  if (!userId) {
    return {
      ok: false,
      error: "You need to sign in before changing season state.",
    } satisfies InlineActionResult;
  }

  try {
    await betrayAlliance({ userId, targetFortressId });
    notifyAndRevalidate("politics-betray-alliance", ["/", "/politics"]);
    return { ok: true } satisfies InlineActionResult;
  } catch (error) {
    return {
      ok: false,
      error: getActionErrorMessage(error),
    } satisfies InlineActionResult;
  }
}

export async function proposePeaceAction(targetFortressId: string) {
  const session = await auth();
  const userId = session?.user?.id;

  if (!userId) {
    return {
      ok: false,
      error: "You need to sign in before changing season state.",
    } satisfies InlineActionResult;
  }

  try {
    await proposePeace({
      userId,
      targetFortressId,
    });
    notifyAndRevalidate("politics-propose-peace", ["/", "/politics"]);
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

export async function acceptPeaceAction(targetFortressId: string) {
  const session = await auth();
  const userId = session?.user?.id;

  if (!userId) {
    return {
      ok: false,
      error: "You need to sign in before changing season state.",
    } satisfies InlineActionResult;
  }

  try {
    await acceptPeace({
      userId,
      targetFortressId,
    });
    notifyAndRevalidate("politics-accept-peace", ["/", "/politics"]);
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

export async function createTradeOfferAction(input: CreateTradeOfferInput) {
  const session = await auth();
  const userId = session?.user?.id;

  if (!userId) {
    return {
      ok: false,
      error: "You need to sign in before changing season state.",
    } satisfies InlineActionResult;
  }

  try {
    await createTradeOffer({ userId, ...input });
    notifyAndRevalidate("trade-offer-create", ["/", "/castle", "/politics"]);
    return { ok: true } satisfies InlineActionResult;
  } catch (error) {
    return {
      ok: false,
      error: getActionErrorMessage(error),
    } satisfies InlineActionResult;
  }
}

export async function acceptTradeOfferAction(tradeOfferId: string) {
  const session = await auth();
  const userId = session?.user?.id;

  if (!userId) {
    return {
      ok: false,
      error: "You need to sign in before changing season state.",
    } satisfies InlineActionResult;
  }

  try {
    await acceptTradeOffer({ userId, tradeOfferId });
    notifyAndRevalidate("trade-offer-accept", ["/", "/castle", "/politics"]);
    return { ok: true } satisfies InlineActionResult;
  } catch (error) {
    return {
      ok: false,
      error: getActionErrorMessage(error),
    } satisfies InlineActionResult;
  }
}

export async function rejectTradeOfferAction(tradeOfferId: string) {
  const session = await auth();
  const userId = session?.user?.id;

  if (!userId) {
    return {
      ok: false,
      error: "You need to sign in before changing season state.",
    } satisfies InlineActionResult;
  }

  try {
    await rejectTradeOffer({ userId, tradeOfferId });
    notifyAndRevalidate("trade-offer-reject", ["/politics"]);
    return { ok: true } satisfies InlineActionResult;
  } catch (error) {
    return {
      ok: false,
      error: getActionErrorMessage(error),
    } satisfies InlineActionResult;
  }
}

export async function cancelTradeOfferAction(tradeOfferId: string) {
  const session = await auth();
  const userId = session?.user?.id;

  if (!userId) {
    return {
      ok: false,
      error: "You need to sign in before changing season state.",
    } satisfies InlineActionResult;
  }

  try {
    await cancelTradeOffer({ userId, tradeOfferId });
    notifyAndRevalidate("trade-offer-cancel", ["/politics"]);
    return { ok: true } satisfies InlineActionResult;
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
    notifyAndRevalidate("map-hex-attack");
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

export async function stationGuardOrderAction(tileId: string, armyAmount = 1) {
  const session = await auth();
  const userId = session?.user?.id;

  if (!userId) {
    return {
      ok: false,
      error: "You need to sign in before changing season state.",
    } satisfies InlineActionResult;
  }

  try {
    await stationGuardOrder({ userId, tileId, armyAmount });
    notifyAndRevalidate("army-order-guard", ["/", "/castle"]);
    return { ok: true } satisfies InlineActionResult;
  } catch (error) {
    return {
      ok: false,
      error: getActionErrorMessage(error),
    } satisfies InlineActionResult;
  }
}

export async function createEscortOrderAction(
  convoyLegId: string,
  armyAmount = 1
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
    await createEscortOrder({ userId, convoyLegId, armyAmount });
    notifyAndRevalidate("army-order-escort", ["/politics", "/", "/castle"]);
    return { ok: true } satisfies InlineActionResult;
  } catch (error) {
    return {
      ok: false,
      error: getActionErrorMessage(error),
    } satisfies InlineActionResult;
  }
}

export async function createRaidOrderAction(
  targetFortressId: string,
  armyAmount = 1
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
    await createRaidOrder({ userId, targetFortressId, armyAmount });
    notifyAndRevalidate("army-order-raid", ["/politics", "/", "/castle"]);
    return { ok: true } satisfies InlineActionResult;
  } catch (error) {
    return {
      ok: false,
      error: getActionErrorMessage(error),
    } satisfies InlineActionResult;
  }
}

export async function startTerritoryCampaignAction(
  tileId: string,
  armyAmount = 1
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
    await startTerritoryCampaign({ userId, tileId, armyAmount });
    notifyAndRevalidate("territory-campaign-start", ["/", "/politics"]);
    return { ok: true } satisfies InlineActionResult;
  } catch (error) {
    return {
      ok: false,
      error: getActionErrorMessage(error),
    } satisfies InlineActionResult;
  }
}

export async function recallArmyOrderAction(armyOrderId: string) {
  const session = await auth();
  const userId = session?.user?.id;

  if (!userId) {
    return {
      ok: false,
      error: "You need to sign in before changing season state.",
    } satisfies InlineActionResult;
  }

  try {
    await recallArmyOrder({ userId, armyOrderId });
    notifyAndRevalidate("army-order-recall", ["/", "/castle", "/politics"]);
    return { ok: true } satisfies InlineActionResult;
  } catch (error) {
    return {
      ok: false,
      error: getActionErrorMessage(error),
    } satisfies InlineActionResult;
  }
}

export async function fortifyMapHexAction(tileId: string, armyAmount = 1) {
  const session = await auth();
  const userId = session?.user?.id;

  if (!userId) {
    return {
      ok: false,
      error: "You need to sign in before changing season state.",
    } satisfies MapHexAttackActionResult;
  }

  try {
    const launchedAttackUnit = await fortifyMapHex({
      userId,
      tileId,
      armyAmount,
    });
    notifyAndRevalidate("map-hex-fortify");
    return {
      ok: true,
      launchedAttackUnit,
    } satisfies MapHexAttackActionResult;
  } catch (error) {
    if (!(error instanceof GameError)) {
      console.error("fortifyMapHexAction failed", {
        tileId,
        armyAmount,
        userId,
        error,
      });
    }

    return {
      ok: false,
      error: getActionErrorMessage(error),
    } satisfies MapHexAttackActionResult;
  }
}

export async function relocateCastleToTileAction(tileId: string) {
  const session = await auth();
  const userId = session?.user?.id;

  if (!userId) {
    return {
      ok: false,
      error: "You need to sign in before changing season state.",
    } satisfies InlineActionResult;
  }

  try {
    await shuffleFortressLocation({
      userId,
      destinationTileId: tileId,
    });
    notifyAndRevalidate("castle-yeet-map", CASTLE_REVALIDATE_PATHS);
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

export async function joinBattlefieldAction(
  battlefieldId: string,
  side: "ATTACKER" | "DEFENDER",
  armyAmount: number
): Promise<InlineActionResult> {
  const session = await auth();
  const userId = session?.user?.id;

  if (!userId) {
    return { ok: false, error: "You need to sign in before joining a battlefield." };
  }

  try {
    await joinBattlefield({
      userId,
      battlefieldId,
      side:
        side === BattlefieldSide.DEFENDER
          ? BattlefieldSide.DEFENDER
          : BattlefieldSide.ATTACKER,
      armyAmount,
    });
    notifyAndRevalidate("battlefield-join");
    return { ok: true };
  } catch (error) {
    return { ok: false, error: getActionErrorMessage(error) };
  }
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
    notifyAndRevalidate("map-recall");
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
    notifyAndRevalidate("map-recall");
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
    notifyAndRevalidate("garrison-recall");
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
    notifyAndRevalidate("battlefield-recall");
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
    notifyAndRevalidate("garrison-recall");
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

export async function recallAllUnitsAction() {
  const session = await auth();
  const userId = session?.user?.id;

  if (!userId) {
    return {
      ok: false,
      error: "You need to sign in before changing season state.",
    } satisfies InlineActionResult;
  }

  try {
    await recallAllUnits({
      userId,
    });
    notifyAndRevalidate("all-units-recall");
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

export async function torchOccupiedMapHexAction(garrisonId: string) {
  const session = await auth();
  const userId = session?.user?.id;

  if (!userId) {
    return {
      ok: false,
      error: "You need to sign in before changing season state.",
    } satisfies InlineActionResult;
  }

  try {
    await torchOccupiedMapHex({
      userId,
      garrisonId,
    });
    notifyAndRevalidate("map-hex-torch");
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
  pressureWorkersAssigned: number;
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
      pressureWorkersAssigned: input.pressureWorkersAssigned,
    });
    notifyAndRevalidate("worker-assignment", CASTLE_REVALIDATE_PATHS);
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
    notifyAndRevalidate("army-recruitment", CASTLE_REVALIDATE_PATHS);
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

export async function selectFortressRaceAction(
  race: string
): Promise<InlineActionResult> {
  const session = await auth();
  const userId = session?.user?.id;

  if (!userId) {
    return { ok: false, error: "You need to sign in before selecting a race." };
  }

  try {
    await selectFortressRace({ userId, race });
    notifyAndRevalidate("race-selection", CASTLE_REVALIDATE_PATHS);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: getActionErrorMessage(error) };
  }
}

export async function joinFortressAction(
  commanderName: string,
  fortressName: string,
  race?: string
): Promise<InlineActionResult> {
  const session = await auth();
  const userId = session?.user?.id;

  if (!userId) {
    return { ok: false, error: "You need to sign in before joining." };
  }

  try {
    await joinRegistrationCycle({
      userId,
      commanderName,
      fortressName,
      race: race || undefined,
    });
    notifyAndRevalidate("join");
    return { ok: true };
  } catch (error) {
    return { ok: false, error: getActionErrorMessage(error) };
  }
}

export async function joinFortressFormAction(formData: FormData) {
  const result = await joinFortressAction(
    getString(formData, "commanderName"),
    getString(formData, "fortressName"),
    getString(formData, "race") || undefined
  );

  if (!result.ok) {
    redirectToHome("error", result.error);
  }

  finishAction("You joined the registration cycle.");
}

export async function editRegistrationFortressNameAction(
  commanderName: string,
  fortressName: string
): Promise<InlineActionResult> {
  const session = await auth();
  const userId = session?.user?.id;

  if (!userId) {
    return {
      ok: false,
      error: "You need to sign in before updating registration.",
    };
  }

  try {
    await editRegistrationFortressName({
      userId,
      commanderName,
      fortressName,
    });
    notifyAndRevalidate("registration-rename");
    return { ok: true };
  } catch (error) {
    return { ok: false, error: getActionErrorMessage(error) };
  }
}

export async function editRegistrationFortressNameFormAction(formData: FormData) {
  const result = await editRegistrationFortressNameAction(
    getString(formData, "commanderName"),
    getString(formData, "fortressName")
  );

  if (!result.ok) {
    redirectToHome("error", result.error);
  }

  finishAction("Registration fortress name updated.");
}

export async function renameFortressAction(
  fortressName: string
): Promise<InlineActionResult> {
  const session = await auth();
  const userId = session?.user?.id;

  if (!userId) {
    return { ok: false, error: "You need to sign in before renaming." };
  }

  try {
    await renameActiveFortress({ userId, fortressName });
    notifyAndRevalidate("active-rename", CASTLE_REVALIDATE_PATHS);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: getActionErrorMessage(error) };
  }
}

export async function buyPointsWithGoldAction(
  goldAmount: number
): Promise<InlineActionResult> {
  const session = await auth();
  const userId = session?.user?.id;

  if (!userId) {
    return { ok: false, error: "You need to sign in before converting gold." };
  }

  if (goldAmount <= 0) {
    return { ok: false, error: "Gold amount must be greater than 0." };
  }

  try {
    await buyPointsWithGold({ userId, goldAmount });
    notifyAndRevalidate("gold-to-points-conversion", CASTLE_REVALIDATE_PATHS);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: getActionErrorMessage(error) };
  }
}

export async function purchaseFortressUpgradeAction(
  specialization: string
): Promise<InlineActionResult> {
  const session = await auth();
  const userId = session?.user?.id;

  if (!userId) {
    return { ok: false, error: "You need to sign in before upgrading." };
  }

  try {
    await purchaseFortressUpgrade({ userId, specialization });
    notifyAndRevalidate("castle-upgrade", CASTLE_REVALIDATE_PATHS);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: getActionErrorMessage(error) };
  }
}

export async function choosePendingUpgradeSpecializationAction(
  specialization: string
): Promise<InlineActionResult> {
  const session = await auth();
  const userId = session?.user?.id;

  if (!userId) {
    return { ok: false, error: "You need to sign in before locking specialization." };
  }

  try {
    await choosePendingUpgradeSpecialization({ userId, specialization });
    notifyAndRevalidate(
      "castle-upgrade-specialization",
      CASTLE_REVALIDATE_PATHS
    );
    return { ok: true };
  } catch (error) {
    return { ok: false, error: getActionErrorMessage(error) };
  }
}

export async function chooseDwarfGrudgeAction(
  targetFortressId: string
): Promise<InlineActionResult> {
  const session = await auth();
  const userId = session?.user?.id;

  if (!userId) {
    return { ok: false, error: "You need to sign in before choosing a grudge." };
  }

  try {
    await chooseDwarfGrudge({ userId, targetFortressId });
    notifyAndRevalidate("dwarf-grudge", CASTLE_REVALIDATE_PATHS);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: getActionErrorMessage(error) };
  }
}

export async function chooseDwarfTierThreeGrudgeAction(
  targetFortressId?: string,
  doubleExisting?: boolean
): Promise<InlineActionResult> {
  const session = await auth();
  const userId = session?.user?.id;

  if (!userId) {
    return { ok: false, error: "You need to sign in before choosing a tier-three grudge." };
  }

  try {
    await chooseDwarfTierThreeGrudge({
      userId,
      targetFortressId: targetFortressId || undefined,
      doubleExisting: doubleExisting ?? false,
    });
    notifyAndRevalidate("dwarf-grudge-tier-three", CASTLE_REVALIDATE_PATHS);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: getActionErrorMessage(error) };
  }
}

export async function activateWaaaghAction(): Promise<InlineActionResult> {
  const session = await auth();
  const userId = session?.user?.id;

  if (!userId) {
    return { ok: false, error: "You need to sign in before activating WAAAGH." };
  }

  try {
    await activateRaceAbility({
      userId,
      kind: RaceAbilityKind.ORK_WAAAGH,
    });
    notifyAndRevalidate("ork-waaagh", CASTLE_REVALIDATE_PATHS);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: getActionErrorMessage(error) };
  }
}

export async function activateOrkBossOrderAction(
  kind: OrkBossOrderKind
): Promise<InlineActionResult> {
  const session = await auth();
  const userId = session?.user?.id;

  if (!userId) {
    return { ok: false, error: "You need to sign in before activating a boss order." };
  }

  try {
    await activateOrkBossOrder({ userId, kind });
    notifyAndRevalidate("ork-boss-order", CASTLE_REVALIDATE_PATHS);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: getActionErrorMessage(error) };
  }
}

export async function investOrkWaaaghScrapAction(
  kind: string
): Promise<InlineActionResult> {
  const session = await auth();
  const userId = session?.user?.id;

  if (!userId) {
    return { ok: false, error: "You need to sign in before investing Scrap." };
  }

  try {
    await investOrkWaaaghScrap({
      userId,
      kind: kind as OrkWaaaghInvestmentKind,
    });
    notifyAndRevalidate("ork-waaagh-investment", CASTLE_REVALIDATE_PATHS);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: getActionErrorMessage(error) };
  }
}

export async function activateStimAction(): Promise<InlineActionResult> {
  const session = await auth();
  const userId = session?.user?.id;

  if (!userId) {
    return { ok: false, error: "You need to sign in before activating STIM." };
  }

  try {
    await activateRaceAbility({
      userId,
      kind: RaceAbilityKind.SPACE_MURINE_STIM,
    });
    notifyAndRevalidate("space-murine-stim", CASTLE_REVALIDATE_PATHS);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: getActionErrorMessage(error) };
  }
}

export async function activateDwarfDeepMiningAction(
  committedGold: number
): Promise<InlineActionResult> {
  const session = await auth();
  const userId = session?.user?.id;

  if (!userId) {
    return { ok: false, error: "You need to sign in before starting Deep Mining." };
  }

  try {
    await activateDwarfDeepMining({
      userId,
      committedGold,
    });
    notifyAndRevalidate("dwarf-deep-mining", CASTLE_REVALIDATE_PATHS);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: getActionErrorMessage(error) };
  }
}

export async function activateDwarfRuneOfGrudgesAction(
  targetFortressId: string
): Promise<InlineActionResult> {
  const session = await auth();
  const userId = session?.user?.id;

  if (!userId) {
    return { ok: false, error: "You need to sign in before raising a rune." };
  }

  try {
    await activateDwarfRuneOfGrudges({
      userId,
      targetFortressId,
    });
    notifyAndRevalidate("dwarf-rune-grudges", CASTLE_REVALIDATE_PATHS);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: getActionErrorMessage(error) };
  }
}

export async function reinforceDwarfRuneOfGrudgesAction(
  sentArmy: number
): Promise<InlineActionResult> {
  const session = await auth();
  const userId = session?.user?.id;

  if (!userId) {
    return {
      ok: false,
      error: "You need to sign in before reinforcing your rune.",
    };
  }

  try {
    await reinforceDwarfRuneOfGrudges({
      userId,
      sentArmy,
    });
    notifyAndRevalidate(
      "dwarf-rune-grudges-reinforce",
      CASTLE_REVALIDATE_PATHS
    );
    return { ok: true };
  } catch (error) {
    return { ok: false, error: getActionErrorMessage(error) };
  }
}

export async function cancelDwarfRuneOfGrudgesAction(): Promise<InlineActionResult> {
  const session = await auth();
  const userId = session?.user?.id;

  if (!userId) {
    return {
      ok: false,
      error: "You need to sign in before canceling your rune.",
    };
  }

  try {
    await cancelDwarfRuneOfGrudges({
      userId,
    });
    notifyAndRevalidate("dwarf-rune-grudges-cancel", CASTLE_REVALIDATE_PATHS);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: getActionErrorMessage(error) };
  }
}

export async function claimUnicornTeleportAction(): Promise<InlineActionResult> {
  const session = await auth();
  const userId = session?.user?.id;

  if (!userId) {
    return { ok: false, error: "You need to sign in before claiming Unicorn teleport." };
  }

  try {
    await claimUnicornTeleport({
      userId,
    });
    await shuffleFortressLocation({
      userId,
      useFreeTeleport: true,
    });
    notifyAndRevalidate("unicorn-teleport-activate", CASTLE_REVALIDATE_PATHS);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: getActionErrorMessage(error) };
  }
}

export async function activateUnicornShatteredRealityAction(): Promise<InlineActionResult> {
  const session = await auth();
  const userId = session?.user?.id;

  if (!userId) {
    return { ok: false, error: "You need to sign in before triggering Shattered Reality." };
  }

  try {
    await activateUnicornShatteredReality({
      userId,
    });
    notifyAndRevalidate("unicorn-shattered-reality", CASTLE_REVALIDATE_PATHS);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: getActionErrorMessage(error) };
  }
}

export async function shuffleFortressLocationAction() {
  await requireUserId();
  redirectToHome("error", "Castle Yeet is paused for now.");
}

export async function useUnicornTeleportAction(): Promise<InlineActionResult> {
  const session = await auth();
  const userId = session?.user?.id;

  if (!userId) {
    return { ok: false, error: "You need to sign in before using Unicorn teleport." };
  }

  try {
    await shuffleFortressLocation({
      userId,
      useFreeTeleport: true,
    });
    notifyAndRevalidate("unicorn-teleport-use", CASTLE_REVALIDATE_PATHS);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: getActionErrorMessage(error) };
  }
}

export async function registerCommanderNameAction(
  commanderName: string
): Promise<InlineActionResult> {
  const session = await auth();
  const userId = session?.user?.id;

  if (!userId) {
    return { ok: false, error: "You need to sign in before registering nick." };
  }

  try {
    await registerCommanderName({
      userId,
      commanderName,
    });
    notifyAndRevalidate("commander-name", CASTLE_REVALIDATE_PATHS);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: getActionErrorMessage(error) };
  }
}

export async function registerCommanderNameFormAction(formData: FormData) {
  const result = await registerCommanderNameAction(
    getString(formData, "commanderName")
  );

  if (!result.ok) {
    redirectToHome("error", result.error);
  }

  finishAction("In-game nick registered.");
}

export async function setFortressActionAction(
  action: "ATTACK" | "GROW",
  targetFortressId?: string,
  sentArmy = 1
): Promise<InlineActionResult> {
  const session = await auth();
  const userId = session?.user?.id;

  if (!userId) {
    return { ok: false, error: "You need to sign in before setting an action." };
  }

  try {
    const fortressAction =
      action === FortressAction.ATTACK ? FortressAction.ATTACK : FortressAction.GROW;

    await setFortressAction({
      userId,
      action: fortressAction,
      targetFortressId: targetFortressId || undefined,
      sentArmy,
    });
    notifyAndRevalidate("action-update", CASTLE_REVALIDATE_PATHS);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: getActionErrorMessage(error) };
  }
}

export async function submitCommunityWishProposalAction(
  cycleId: string,
  requestText: string
): Promise<InlineActionResult> {
  const session = await auth();
  const userId = session?.user?.id;

  if (!userId) {
    return {
      ok: false,
      error: "You need to sign in before submitting a community wish.",
    };
  }

  if (!cycleId) {
    return { ok: false, error: "Community wish is missing its cycle reference." };
  }

  try {
    await submitCommunityWishProposal({
      cycleId,
      userId,
      requestText,
    });
    notifyAndRevalidate("community-wish-proposal", COMMUNITY_REVALIDATE_PATHS);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: getActionErrorMessage(error) };
  }
}

export async function submitCommunityWishProposalFormAction(formData: FormData) {
  const result = await submitCommunityWishProposalAction(
    getString(formData, "cycleId"),
    getString(formData, "requestText")
  );

  if (!result.ok) {
    redirectToHome("error", result.error);
  }

  finishAction("Community wish proposal saved.");
}

export async function saveCommunityWishVotesAction(
  cycleId: string,
  allocations: Array<{ proposalId: string; votes: number }>
): Promise<InlineActionResult> {
  const session = await auth();
  const userId = session?.user?.id;

  if (!userId) {
    return {
      ok: false,
      error: "You need to sign in before saving community votes.",
    };
  }

  if (!cycleId) {
    return {
      ok: false,
      error: "Community wish vote is missing its cycle reference.",
    };
  }

  try {
    await saveCommunityWishVotes({
      cycleId,
      userId,
      allocations,
    });
    notifyAndRevalidate("community-wish-vote", COMMUNITY_REVALIDATE_PATHS);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: getActionErrorMessage(error) };
  }
}

export async function saveCommunityWishVotesFormAction(formData: FormData) {
  const cycleId = getString(formData, "cycleId");
  const allocations = Array.from(formData.entries())
    .filter(([key]) => key.startsWith("proposalVotes:"))
    .map(([key, value]) => ({
      proposalId: key.slice("proposalVotes:".length),
      votes: typeof value === "string" ? Number(value) : 0,
    }));

  const result = await saveCommunityWishVotesAction(cycleId, allocations);

  if (!result.ok) {
    redirectToHome("error", result.error);
  }

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

export async function sendChatMessageAction(
  _prevState: InlineActionResult | null,
  formData: FormData
): Promise<InlineActionResult> {
  const session = await auth();
  const userId = session?.user?.id;

  if (!userId) {
    return { ok: false, error: "You need to sign in before posting." };
  }

  try {
    await sendChatMessage({
      userId,
      body: getString(formData, "body"),
    });
    notifyAndRevalidate("chat-message", ["/"]);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: getActionErrorMessage(error) };
  }
}

export async function sendChatGifMessageAction(gif: {
  providerId: string;
  title: string;
  previewUrl: string;
  displayUrl: string;
  width: number;
  height: number;
  sourceUrl: string;
}): Promise<InlineActionResult> {
  const session = await auth();
  const userId = session?.user?.id;

  if (!userId) {
    return { ok: false, error: "You need to sign in before posting." };
  }

  try {
    await sendChatGifMessage({ userId, gif });
    notifyAndRevalidate("chat-message", ["/"]);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: getActionErrorMessage(error) };
  }
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
