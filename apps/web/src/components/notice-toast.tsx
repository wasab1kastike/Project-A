"use client";

import { useEffect, useState } from "react";
import styles from "./notice-toast.module.css";

export function NoticeToast({
  message,
  autoDismissMs = 5000,
}: {
  message: string;
  autoDismissMs?: number;
}) {
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    if (!isVisible) {
      return;
    }

    const timeoutId = setTimeout(() => {
      setIsVisible(false);
    }, autoDismissMs);

    return () => clearTimeout(timeoutId);
  }, [isVisible, autoDismissMs]);

  if (!isVisible) {
    return null;
  }

  return (
    <p className={styles.noticeToast}>
      <span>{message}</span>
      <button
        aria-label="Dismiss notice"
        className={styles.closeButton}
        onClick={() => setIsVisible(false)}
        type="button"
      >
        ✕
      </button>
    </p>
  );
}
