export const SEASON_ECONOMY_RACES_ANNOUNCEMENT_KEY =
  "season-economy-races-v1";

const SEASON_ANNOUNCEMENT_STORAGE_PREFIX = "project-a:season-announcement";

export function getSeasonAnnouncementStorageKey({
  announcementKey = SEASON_ECONOMY_RACES_ANNOUNCEMENT_KEY,
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
