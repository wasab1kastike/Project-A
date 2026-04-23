"use client";

import { useEffect, useState } from "react";
import styles from "./mega-fortress-notice.module.css";
import {
  getFirstMegaFortressNoticeStorageKey,
  shouldShowFirstMegaFortressNotice,
} from "@/lib/game/mega-fortress-notice";

export function MegaFortressNotice({
  cycleId,
  megaFortressDestroyCount,
}: {
  cycleId: string | null;
  megaFortressDestroyCount: number;
}) {
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    let isDismissed = false;

    if (typeof window !== "undefined" && cycleId) {
      try {
        isDismissed =
          window.localStorage.getItem(
            getFirstMegaFortressNoticeStorageKey(cycleId)
          ) === "dismissed";
      } catch {
        isDismissed = false;
      }
    }

    queueMicrotask(() => {
      setIsOpen(
        shouldShowFirstMegaFortressNotice({
          cycleId,
          megaFortressDestroyCount,
          isDismissed,
        })
      );
    });
  }, [cycleId, megaFortressDestroyCount]);

  function dismissNotice() {
    if (typeof window !== "undefined" && cycleId) {
      try {
        window.localStorage.setItem(
          getFirstMegaFortressNoticeStorageKey(cycleId),
          "dismissed"
        );
      } catch {
        // Ignore storage write failures and still close the notice locally.
      }
    }

    setIsOpen(false);
  }

  if (!isOpen) {
    return null;
  }

  return (
    <div className={styles.backdrop}>
      <section
        aria-describedby="mega-fortress-notice-description"
        aria-labelledby="mega-fortress-notice-title"
        aria-modal="true"
        className={styles.card}
        role="dialog"
      >
        <span className={styles.eyebrow}>Battlefield update</span>
        <h2 id="mega-fortress-notice-title">Home of A has fallen.</h2>
        <p id="mega-fortress-notice-description">
          Castle upgrades are now unlocked for everyone. The fortress that dealt
          the final blow got one free castle level, and Home of A will return
          stronger after each fall. Future kills also pay bigger point rewards.
        </p>
        <div className={styles.actions}>
          <button className={styles.button} onClick={dismissNotice} type="button">
            Got it
          </button>
        </div>
      </section>
    </div>
  );
}
