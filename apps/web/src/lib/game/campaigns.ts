import { DiplomacyRelationStatus } from "@/lib/prisma-client";
import { addHours } from "./time";

export const CAMPAIGN_SIEGE_THRESHOLD = 3_600; // 1 hour at 60 army/tick
export const CAMPAIGN_RESPONSE_HOURS = 12;

export function calculateCampaignProgressPerTick({
  pressureWorkersAssigned,
  committedArmy,
  armyContributionMultiplier = 1,
}: {
  pressureWorkersAssigned: number;
  committedArmy: number;
  armyContributionMultiplier?: number;
}) {
  const workers = Math.max(0, Math.floor(pressureWorkersAssigned));
  const armyContribution = Math.floor(
    (Math.max(0, committedArmy) / 50) *
      Math.max(1, armyContributionMultiplier),
  );

  // Workers add bonus progress but don't cap army.
  return workers + Math.max(armyContribution, workers > 0 ? workers : armyContribution);
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
