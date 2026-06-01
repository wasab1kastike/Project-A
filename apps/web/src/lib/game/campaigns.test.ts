import assert from "node:assert/strict";
import test from "node:test";

import { DiplomacyRelationStatus } from "@/lib/prisma-client";
import {
  CAMPAIGN_RESPONSE_HOURS,
  CAMPAIGN_SIEGE_THRESHOLD,
  calculateCampaignProgressPerTick,
  getCampaignResponseEndsAt,
  getCampaignStartBlockedReason,
} from "./campaigns";

test("campaign workers add floor progress without capping committed army", () => {
  assert.equal(
    calculateCampaignProgressPerTick({
      pressureWorkersAssigned: 10,
      committedArmy: 1_000,
    }),
    30
  );
  assert.equal(
    calculateCampaignProgressPerTick({
      pressureWorkersAssigned: 10,
      committedArmy: 100_000,
    }),
    2010
  );
  assert.equal(
    calculateCampaignProgressPerTick({
      pressureWorkersAssigned: 10,
      committedArmy: 500,
    }),
    20
  );
  assert.equal(CAMPAIGN_SIEGE_THRESHOLD, 3_600);
  assert.equal(
    calculateCampaignProgressPerTick({
      pressureWorkersAssigned: 10,
      committedArmy: 500,
      armyContributionMultiplier: 1.3,
    }),
    23
  );
  assert.equal(
    calculateCampaignProgressPerTick({
      pressureWorkersAssigned: 10,
      committedArmy: 100_000,
      armyContributionMultiplier: 1.3,
    }),
    2610
  );
});

test("campaign warning keeps casualties paused for twelve hours", () => {
  const openedAt = new Date("2026-06-01T12:00:00.000Z");
  assert.equal(
    getCampaignResponseEndsAt(openedAt).getTime(),
    openedAt.getTime() + CAMPAIGN_RESPONSE_HOURS * 60 * 60 * 1000
  );
});

test("territorial campaigns require an active war border", () => {
  const validInput = {
    relationStatus: DiplomacyRelationStatus.WAR,
    isEnemyOwned: true,
    isBorderTarget: true,
    hasActiveCampaign: false,
    hasActiveBattlefield: false,
  };

  assert.equal(getCampaignStartBlockedReason(validInput), null);
  assert.match(
    getCampaignStartBlockedReason({
      ...validInput,
      relationStatus: DiplomacyRelationStatus.WAR_PENDING,
    }) ?? "",
    /active war/
  );
  assert.match(
    getCampaignStartBlockedReason({ ...validInput, isBorderTarget: false }) ??
      "",
    /active border/
  );
  assert.match(
    getCampaignStartBlockedReason({ ...validInput, hasActiveCampaign: true }) ??
      "",
    /active campaign/
  );
});
