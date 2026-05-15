import { startTransition, useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { useOptionalLiveGameStateRefresh } from "@/components/live-game-state";

/**
 * Creates a safe refresh helper for a component.
 * - Wraps router.refresh() in startTransition to defer UI updates and prevent jank.
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
      const refreshed = refreshGameState
        ? await refreshGameState("inline-action")
        : false;

      if (!refreshed) {
        startTransition(() => {
          router.refresh();
        });
      }
    } finally {
      setRefreshPending(false);
    }
  }, [refreshGameState, refreshPending, router]);

  return refreshView;
}
