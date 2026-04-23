const FIRST_MEGA_FORTRESS_NOTICE_PREFIX =
  "project-a:first-mega-fortress-notice";

export function getFirstMegaFortressNoticeStorageKey(cycleId: string) {
  return `${FIRST_MEGA_FORTRESS_NOTICE_PREFIX}:${cycleId}`;
}

export function shouldShowFirstMegaFortressNotice({
  cycleId,
  megaFortressDestroyCount,
  isDismissed,
}: {
  cycleId: string | null;
  megaFortressDestroyCount: number;
  isDismissed: boolean;
}) {
  return (
    cycleId !== null &&
    megaFortressDestroyCount === 1 &&
    !isDismissed
  );
}

