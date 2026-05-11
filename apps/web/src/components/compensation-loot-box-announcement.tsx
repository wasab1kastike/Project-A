"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import styles from "./compensation-loot-box-announcement.module.css";

const STORAGE_PREFIX = "project-a:compensation-loot-boxes";
const ANNOUNCEMENT_KEY = "2026-05-11-service-issues";

export function CompensationLootBoxAnnouncement({
  userId,
}: {
  userId: string | null;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const storageKey = `${STORAGE_PREFIX}:${ANNOUNCEMENT_KEY}:${
    userId ?? "guest"
  }`;
  const titleId = "compensation-loot-box-title";
  const descriptionId = "compensation-loot-box-description";
  const portalTarget =
    typeof document === "undefined"
      ? null
      : (document.getElementById("modal-root") ?? document.body);

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

  if (!isOpen || !portalTarget || !userId) {
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
        <span className={styles.eyebrow}>Compensation delivery</span>
        <div>
          <h2 id={titleId}>The castle couriers found the apology crate.</h2>
          <p id={descriptionId}>
            The server room has been reintroduced to the concept of manners. As
            compensation, you got one free unit skin loot box and one free
            castle skin loot box in the Shop.
          </p>
        </div>
        <p className={styles.footer}>
          No coins spent. No forms. Just two boxes and a tiny amount of
          operational shame.
        </p>
        <div className={styles.actionRow}>
          <a
            className={styles.secondaryButton}
            href="/shop"
            onClick={dismissAnnouncement}
          >
            Open Shop
          </a>
          <button
            className={styles.closeButton}
            onClick={dismissAnnouncement}
            type="button"
          >
            Accept tribute
          </button>
        </div>
      </section>
    </div>,
    portalTarget
  );
}
