import { startTransition, useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Creates a safe refresh helper for a component.
 * - Wraps router.refresh() in startTransition to defer UI updates and prevent jank.
 * - Prevents concurrent refresh requests via a pending flag to avoid stacked rerenders on burst events.
 */
export function useRefreshView() {
  const router = useRouter();
  const [refreshPending, setRefreshPending] = useState(false);

  const refreshView = () => {
    if (refreshPending) {
      return;
    }

    setRefreshPending(true);
    startTransition(() => {
      router.refresh();
      setRefreshPending(false);
    });
  };

  return refreshView;
}
