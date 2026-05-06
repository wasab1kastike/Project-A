"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import styles from "./wappu-delay-announcement.module.css";

const STORAGE_PREFIX = "project-a:wappu-delay-announcement";
const ANNOUNCEMENT_KEY = "2026-05-11-testing-delay";

export function WappuDelayAnnouncement({
  userId,
}: {
  userId: string | null;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const storageKey = `${STORAGE_PREFIX}:${ANNOUNCEMENT_KEY}:${
    userId ?? "guest"
  }`;
  const titleId = "wappu-delay-title";
  const descriptionId = "wappu-delay-description";
  const portalTarget =
    typeof document === "undefined"
      ? null
      : document.getElementById("modal-root") ?? document.body;

  useEffect(() => {
    let isDismissed = false;

    try {
      isDismissed = window.localStorage.getItem(storageKey) === "dismissed";
    } catch {
      isDismissed = false;
    }

    queueMicrotask(() => setIsOpen(!isDismissed));
  }, [storageKey]);

  function dismissAnnouncement() {
    try {
      window.localStorage.setItem(storageKey, "dismissed");
    } catch {
      // Ignore storage failures and still close locally.
    }

    setIsOpen(false);
  }

  if (!isOpen || !portalTarget) {
    return null;
  }

  return createPortal(
    <div className={styles.backdrop}>
      <section
        aria-describedby={descriptionId}
        aria-labelledby={titleId}
        aria-modal="true"
        className={styles.card}
        role="dialog"
      >
        <span className={styles.eyebrow}>Season delay</span>
        <div>
          <h2 id={titleId}>Testing continues until Monday 12:00.</h2>
          <p id={descriptionId}>
            The next season is delayed because WAPPU never ends. Use the extra
            testing time to break the map, battles, and Home of A.
          </p>
        </div>
        <div className={styles.actionRow}>
          <button
            className={styles.closeButton}
            onClick={dismissAnnouncement}
            type="button"
          >
            Got it
          </button>
        </div>
      </section>
    </div>,
    portalTarget
  );
}
