"use client";

import { useEffect, useState } from "react";
import styles from "./notice-toast.module.css";

export function NoticeToast({
  message,
  autoDismissMs = 5000,
  storageKey,
}: {
  message: string;
  autoDismissMs?: number | null;
  storageKey?: string;
}) {
  const [isVisible, setIsVisible] = useState(() => !storageKey);

  useEffect(() => {
    if (!storageKey) {
      return;
    }

    let isDismissed = false;

    try {
      isDismissed = window.localStorage.getItem(storageKey) === "dismissed";
    } catch {
      isDismissed = false;
    }

    queueMicrotask(() => {
      setIsVisible(!isDismissed);
    });
  }, [storageKey]);

  useEffect(() => {
    if (!isVisible || autoDismissMs === null) {
      return;
    }

    const timeoutId = setTimeout(() => {
      setIsVisible(false);
    }, autoDismissMs);

    return () => clearTimeout(timeoutId);
  }, [isVisible, autoDismissMs]);

  function dismissNotice() {
    if (storageKey) {
      try {
        window.localStorage.setItem(storageKey, "dismissed");
      } catch {
        // Ignore storage failures and still close locally.
      }
    }

    setIsVisible(false);
  }

  if (!isVisible) {
    return null;
  }

  return (
    <p className={styles.noticeToast}>
      <span>{message}</span>
      <button
        aria-label="Dismiss notice"
        className={styles.closeButton}
        onClick={dismissNotice}
        type="button"
      >
        ✕
      </button>
    </p>
  );
}
