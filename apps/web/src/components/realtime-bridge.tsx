"use client";

import { startTransition, useEffect } from "react";
import { useRouter } from "next/navigation";
import { io } from "socket.io-client";
import { PROJECT_A_REFRESH_EVENT } from "@/lib/realtime";

type RealtimeBridgeProps = {
  enabled: boolean;
};

const FALLBACK_REFRESH_INTERVAL_MS = 10_000;
const MIN_REFRESH_INTERVAL_MS = 5_000;

export function RealtimeBridge({ enabled }: RealtimeBridgeProps) {
  const router = useRouter();

  useEffect(() => {
    if (!enabled) {
      return;
    }

    let pollingInterval: ReturnType<typeof setInterval> | null = null;
    let refreshTimeout: ReturnType<typeof setTimeout> | null = null;
    let refreshPending = false;
    let lastRefreshAt = 0;

    const refreshView = () => {
      const now = Date.now();
      const elapsed = now - lastRefreshAt;

      if (refreshPending) {
        return;
      }

      if (elapsed < MIN_REFRESH_INTERVAL_MS) {
        if (refreshTimeout === null) {
          refreshTimeout = setTimeout(() => {
            refreshTimeout = null;
            refreshView();
          }, MIN_REFRESH_INTERVAL_MS - elapsed);
        }

        return;
      }

      refreshPending = true;
      startTransition(() => {
        lastRefreshAt = Date.now();
        router.refresh();
        refreshPending = false;
      });
    };

    const startPollingFallback = () => {
      if (pollingInterval !== null) {
        return;
      }

      pollingInterval = setInterval(() => {
        refreshView();
      }, FALLBACK_REFRESH_INTERVAL_MS);
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

      refreshView();
    });

    socket.on("connect_error", () => {
      startPollingFallback();
    });

    return () => {
      if (pollingInterval !== null) {
        clearInterval(pollingInterval);
      }

      if (refreshTimeout !== null) {
        clearTimeout(refreshTimeout);
      }

      socket.disconnect();
    };
  }, [enabled, router]);

  return null;
}
