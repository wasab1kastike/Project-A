export const SEASON_FOUR_IDLE_STRATEGY_ANNOUNCEMENT_KEY =
  "season-4-idle-strategy-v1";

const SEASON_ANNOUNCEMENT_STORAGE_PREFIX = "project-a:season-announcement";

export function getSeasonAnnouncementStorageKey({
  announcementKey = SEASON_FOUR_IDLE_STRATEGY_ANNOUNCEMENT_KEY,
  userId,
}: {
  announcementKey?: string;
  userId: string | null;
}) {
  return `${SEASON_ANNOUNCEMENT_STORAGE_PREFIX}:${announcementKey}:${
    userId ?? "guest"
  }`;
}

export function shouldShowSeasonAnnouncement({
  isDismissed,
  isManuallyReopened = false,
}: {
  isDismissed: boolean;
  isManuallyReopened?: boolean;
}) {
  return isManuallyReopened || !isDismissed;
}
