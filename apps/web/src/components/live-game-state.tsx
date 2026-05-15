"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
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

const GAME_STATE_FETCH_TIMEOUT_MS = 8_000;

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
  const refreshPromiseRef = useRef<Promise<boolean> | null>(null);

  const refreshGameState = useCallback(async (reason?: string) => {
    if (refreshPromiseRef.current) {
      return refreshPromiseRef.current;
    }

    const refreshPromise = (async () => {
      setIsRefreshing(true);

      try {
        const nextState = await fetchGameState(reason);
        setState(nextState);
        setLastRefreshError(null);
        return true;
      } catch (error) {
        setLastRefreshError(
          error instanceof Error
            ? error.message
            : "Game state refresh failed."
        );
        return false;
      } finally {
        setIsRefreshing(false);
        refreshPromiseRef.current = null;
      }
    })();

    refreshPromiseRef.current = refreshPromise;
    return refreshPromise;
  }, []);

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
