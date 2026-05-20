import { startTransition, useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { useOptionalLiveGameStateRefresh } from "@/components/live-game-state";

/**
 * Creates a safe refresh helper for a component.
 * - Uses live state refreshes inside LiveGameStateProvider so failed fetches keep the last good state.
 * - Falls back to router.refresh() only for pages outside the live state provider.
 * - Prevents concurrent refresh requests via a pending flag to avoid stacked rerenders on burst events.
 */
export function useRefreshView() {
  const router = useRouter();
  const refreshGameState = useOptionalLiveGameStateRefresh();
  const [refreshPending, setRefreshPending] = useState(false);

  const refreshView = useCallback(async () => {
    if (refreshPending) {
      return;
    }

    setRefreshPending(true);

    try {
      if (refreshGameState) {
        await refreshGameState("inline-action");
        return;
      }

      startTransition(() => {
        router.refresh();
      });
    } finally {
      setRefreshPending(false);
    }
  }, [refreshGameState, refreshPending, router]);

  return refreshView;
}
