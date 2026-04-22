"use client";

import { startTransition, useEffect } from "react";
import { useRouter } from "next/navigation";
import { io } from "socket.io-client";
import { PROJECT_A_REFRESH_EVENT } from "@/lib/realtime";

type RealtimeBridgeProps = {
  enabled: boolean;
};

export function RealtimeBridge({ enabled }: RealtimeBridgeProps) {
  const router = useRouter();

  useEffect(() => {
    if (!enabled) {
      return;
    }

    let pollingInterval: ReturnType<typeof setInterval> | null = null;
    let refreshPending = false;

    const refreshView = () => {
      if (refreshPending) {
        return;
      }

      refreshPending = true;
      startTransition(() => {
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
      }, 5000);
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

      socket.disconnect();
    };
  }, [enabled, router]);

  return null;
}
