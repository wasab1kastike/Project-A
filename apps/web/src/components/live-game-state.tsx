"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  useEffect,
  type ReactNode,
} from "react";
import type { HomePageState } from "@/lib/game/read-model";
import { reviveGameStateDates } from "@/lib/live-state-serialization";

type LiveGameStateContextValue = {
  state: HomePageState;
  isRefreshing: boolean;
  lastRefreshError: string | null;
  refreshGameState: (reason?: string) => Promise<boolean>;
};

const LiveGameStateContext =
  createContext<LiveGameStateContextValue | null>(null);

const GAME_STATE_FETCH_TIMEOUT_MS = 15_000;
const SYNC_RETRY_BASE_DELAY_MS = 15_000;
const SYNC_RETRY_MAX_DELAY_MS = 60000;

async function fetchGameState(reason?: string) {
  const searchParams = new URLSearchParams();
  const controller = new AbortController();
  const timeout = window.setTimeout(() => {
    controller.abort();
  }, GAME_STATE_FETCH_TIMEOUT_MS);

  if (reason) {
    searchParams.set("reason", reason);
  }

  const response = await fetch(`/api/game/state?${searchParams.toString()}`, {
    method: "GET",
    credentials: "same-origin",
    headers: {
      Accept: "application/json",
    },
    cache: "no-store",
    signal: controller.signal,
  }).finally(() => {
    window.clearTimeout(timeout);
  });

  if (!response.ok) {
    throw new Error(`Game state fetch failed with ${response.status}.`);
  }

  return reviveGameStateDates((await response.json()) as HomePageState);
}

function getSyncRetryDelayMs(failureCount: number) {
  return Math.min(
    SYNC_RETRY_BASE_DELAY_MS * Math.pow(2, Math.max(failureCount - 1, 0)),
    SYNC_RETRY_MAX_DELAY_MS
  );
}

function shouldBypassRefreshBackoff(reason?: string) {
  return (
    reason === "auto-retry" ||
    reason === "manual-retry" ||
    reason === "inline-action"
  );
}

export function LiveGameStateProvider({
  initialState,
  children,
}: {
  initialState: HomePageState;
  children: ReactNode;
}) {
  const [state, setState] = useState(initialState);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastRefreshError, setLastRefreshError] = useState<string | null>(null);
  const [syncRetryCount, setSyncRetryCount] = useState(0);
  const refreshPromiseRef = useRef<Promise<boolean> | null>(null);
  const retryTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const nextAutomaticRefreshAtRef = useRef(0);

  // Enhanced refresh with retry
  const refreshGameState = useCallback(async (reason?: string) => {
    if (refreshPromiseRef.current) {
      return refreshPromiseRef.current;
    }

    if (
      !shouldBypassRefreshBackoff(reason) &&
      Date.now() < nextAutomaticRefreshAtRef.current
    ) {
      return false;
    }

    const refreshPromise = (async () => {
      setIsRefreshing(true);

      try {
        const nextState = await fetchGameState(reason);
        setState(nextState);
        setLastRefreshError(null);
        setSyncRetryCount(0);
        nextAutomaticRefreshAtRef.current = 0;
        return true;
      } catch (error) {
        setLastRefreshError(
          error instanceof Error
            ? error.message
            : "Game state refresh failed."
        );
        setSyncRetryCount((count) => {
          const nextCount = count + 1;
          nextAutomaticRefreshAtRef.current =
            Date.now() + getSyncRetryDelayMs(nextCount);
          return nextCount;
        });
        return false;
      } finally {
        setIsRefreshing(false);
        refreshPromiseRef.current = null;
      }
    })();

    refreshPromiseRef.current = refreshPromise;
    return refreshPromise;
  }, []);

  // Automatic background retry when sync fails
  useEffect(() => {
    if (!lastRefreshError) {
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
        retryTimeoutRef.current = null;
      }
      return;
    }
    // Exponential backoff for retries
    const delay = getSyncRetryDelayMs(syncRetryCount);
    retryTimeoutRef.current = setTimeout(() => {
      refreshGameState("auto-retry");
    }, delay);
    return () => {
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
        retryTimeoutRef.current = null;
      }
    };
  }, [lastRefreshError, syncRetryCount, refreshGameState]);

  // Listen for manual retry events from UI
  useEffect(() => {
    const handler = () => {
      refreshGameState("manual-retry");
    };
    window.addEventListener("manual-sync-retry", handler);
    return () => {
      window.removeEventListener("manual-sync-retry", handler);
    };
  }, [refreshGameState]);

  const value = useMemo(
    () => ({
      state,
      isRefreshing,
      lastRefreshError,
      refreshGameState,
    }),
    [isRefreshing, lastRefreshError, refreshGameState, state]
  );

  return (
    <LiveGameStateContext.Provider value={value}>
      {children}
    </LiveGameStateContext.Provider>
  );
}

export function useLiveGameState() {
  const context = useContext(LiveGameStateContext);

  if (!context) {
    throw new Error("useLiveGameState must be used inside LiveGameStateProvider.");
  }

  return context;
}

export function useLiveGameStateRefresh() {
  return useLiveGameState().refreshGameState;
}

export function useOptionalLiveGameStateRefresh() {
  return useContext(LiveGameStateContext)?.refreshGameState ?? null;
}
