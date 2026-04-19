"use client";

import { startTransition, useEffect } from "react";
import { useRouter } from "next/navigation";
import { io } from "socket.io-client";
import { PROJECT_A_REFRESH_EVENT } from "@/lib/realtime";

export function RealtimeBridge() {
  const router = useRouter();

  useEffect(() => {
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
  }, [router]);

  return null;
}
