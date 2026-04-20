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

    const socket = io({
      path: "/socket.io",
    });

    socket.on(PROJECT_A_REFRESH_EVENT, (payload?: { reason?: string }) => {
      if (payload?.reason === "connected") {
        return;
      }

      startTransition(() => {
        router.refresh();
      });
    });

    return () => {
      socket.disconnect();
    };
  }, [enabled, router]);

  return null;
}
