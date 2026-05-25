import { DiplomacyRelationStatus } from "@/lib/prisma-client";
import { addHours } from "./time";

export const CAMPAIGN_SIEGE_THRESHOLD = 14_400;
export const CAMPAIGN_RESPONSE_HOURS = 12;

export function calculateCampaignProgressPerTick({
  pressureWorkersAssigned,
  committedArmy,
}: {
  pressureWorkersAssigned: number;
  committedArmy: number;
}) {
  const workers = Math.max(0, Math.floor(pressureWorkersAssigned));
  const armyContribution = Math.min(
    Math.floor(Math.max(0, committedArmy) / 100),
    workers
  );

  return workers + armyContribution;
}

export function getCampaignResponseEndsAt(siegeOpenedAt: Date) {
  return addHours(siegeOpenedAt, CAMPAIGN_RESPONSE_HOURS);
}

export function getCampaignStartBlockedReason({
  relationStatus,
  isEnemyOwned,
  isBorderTarget,
  hasActiveCampaign,
  hasActiveBattlefield,
}: {
  relationStatus: DiplomacyRelationStatus;
  isEnemyOwned: boolean;
  isBorderTarget: boolean;
  hasActiveCampaign: boolean;
  hasActiveBattlefield: boolean;
}) {
  if (!isEnemyOwned) {
    return "Campaigns target enemy-owned territory.";
  }

  if (relationStatus !== DiplomacyRelationStatus.WAR) {
    return "Territorial campaigns require active war.";
  }

  if (!isBorderTarget) {
    return "Campaigns must begin on an active border.";
  }

  if (hasActiveCampaign) {
    return "That tile already has an active campaign.";
  }

  if (hasActiveBattlefield) {
    return "That tile already has an active siege.";
  }

  return null;
}
