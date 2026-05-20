"use client";

import { useEffect } from "react";
import { io } from "socket.io-client";
import { PROJECT_A_REFRESH_EVENT } from "@/lib/realtime";
import { useLiveGameStateRefresh } from "./live-game-state";

type RealtimeBridgeProps = {
  enabled: boolean;
};

const FALLBACK_REFRESH_INTERVAL_MS = 15_000;
const FALLBACK_REFRESH_JITTER_MS = 5_000;

function getFallbackRefreshDelay() {
  return (
    FALLBACK_REFRESH_INTERVAL_MS +
    Math.floor(Math.random() * FALLBACK_REFRESH_JITTER_MS)
  );
}

export function RealtimeBridge({ enabled }: RealtimeBridgeProps) {
  const refreshGameState = useLiveGameStateRefresh();

  useEffect(() => {
    if (!enabled) {
      return;
    }

    let pollingInterval: ReturnType<typeof setInterval> | null = null;
    let pollingTimeout: ReturnType<typeof setTimeout> | null = null;
    let refreshPending = false;

    const refreshView = (reason?: string) => {
      if (refreshPending) {
        return;
      }

      refreshPending = true;
      void refreshGameState(reason).finally(() => {
        refreshPending = false;
      });
    };

    const startPollingFallback = () => {
      if (document.visibilityState !== "visible") {
        return;
      }

      if (pollingInterval !== null || pollingTimeout !== null) {
        return;
      }

      pollingTimeout = setTimeout(() => {
        pollingTimeout = null;
        refreshView("polling-fallback");

        pollingInterval = setInterval(() => {
          if (document.visibilityState === "visible") {
            refreshView();
          }
        }, getFallbackRefreshDelay());
      }, getFallbackRefreshDelay());
    };

    const stopPollingFallback = () => {
      if (pollingTimeout !== null) {
        clearTimeout(pollingTimeout);
        pollingTimeout = null;
      }

      if (pollingInterval === null) {
        return;
      }

      clearInterval(pollingInterval);
      pollingInterval = null;
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible" && !socket.connected) {
        startPollingFallback();
        return;
      }

      if (document.visibilityState !== "visible") {
        stopPollingFallback();
      }
    };

    const socket = io({
      path: "/socket.io",
      withCredentials: true,
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
    });

    socket.on(PROJECT_A_REFRESH_EVENT, (payload?: { reason?: string }) => {
      if (payload?.reason === "connected") {
        return;
      }

      refreshView(payload?.reason ?? "socket-event");
    });

    socket.on("connect", () => {
      stopPollingFallback();
      refreshView("socket-connect");
    });

    socket.on("connect_error", () => {
      startPollingFallback();
    });

    socket.on("disconnect", () => {
      startPollingFallback();
    });

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      stopPollingFallback();
      socket.disconnect();
    };
  }, [enabled, refreshGameState]);

  return null;
}
