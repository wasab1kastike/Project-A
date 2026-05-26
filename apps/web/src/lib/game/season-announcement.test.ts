import assert from "node:assert/strict";
import test from "node:test";
import {
  SEASON_FOUR_IDLE_STRATEGY_ANNOUNCEMENT_KEY,
  getSeasonAnnouncementStorageKey,
  shouldShowSeasonAnnouncement,
} from "./season-announcement";

test("season announcement key is scoped by announcement and user", () => {
  assert.equal(
    getSeasonAnnouncementStorageKey({
      userId: "user-123",
    }),
    `project-a:season-announcement:${SEASON_FOUR_IDLE_STRATEGY_ANNOUNCEMENT_KEY}:user-123`
  );
  assert.equal(
    getSeasonAnnouncementStorageKey({
      userId: null,
    }),
    `project-a:season-announcement:${SEASON_FOUR_IDLE_STRATEGY_ANNOUNCEMENT_KEY}:guest`
  );
});

test("season announcement shows when not dismissed and hides after dismissal", () => {
  assert.equal(
    shouldShowSeasonAnnouncement({
      isDismissed: false,
    }),
    true
  );
  assert.equal(
    shouldShowSeasonAnnouncement({
      isDismissed: true,
    }),
    false
  );
});

test("season announcement can be reopened after dismissal", () => {
  assert.equal(
    shouldShowSeasonAnnouncement({
      isDismissed: true,
      isManuallyReopened: true,
    }),
    true
  );
});
