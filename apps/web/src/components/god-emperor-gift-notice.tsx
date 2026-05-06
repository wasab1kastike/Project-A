"use client";

import { useEffect, useState } from "react";
import styles from "./god-emperor-gift-notice.module.css";

const STORAGE_KEY = "god-emperor-gift-notice:dismissed";

export function GodEmperorGiftNotice({
  fortressName,
}: {
  fortressName: string | null | undefined;
}) {
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    if (fortressName !== "Tero") {
      return;
    }

    let isDismissed = false;

    try {
      isDismissed = window.localStorage.getItem(STORAGE_KEY) === "dismissed";
    } catch {
      isDismissed = false;
    }

    if (!isDismissed) {
      queueMicrotask(() => setIsOpen(true));
    }
  }, [fortressName]);

  function dismiss() {
    try {
      window.localStorage.setItem(STORAGE_KEY, "dismissed");
    } catch {
      // Ignore write failures.
    }

    setIsOpen(false);
  }

  if (!isOpen) {
    return null;
  }

  return (
    <div className={styles.backdrop}>
      <section
        aria-describedby="god-emperor-gift-description"
        aria-labelledby="god-emperor-gift-title"
        aria-modal="true"
        className={styles.card}
        role="dialog"
      >
        <span className={styles.eyebrow}>Imperial Decree</span>
        <h2 id="god-emperor-gift-title" className={styles.title}>
          Gift from God Emperor A
        </h2>

        <div className={styles.rewardBadge} aria-label="Reward granted">
          <span className={styles.rewardAmount}>1500</span>
          <span className={styles.rewardLabel}>units</span>
        </div>

        <p id="god-emperor-gift-description" className={styles.lore}>
          In the annals of the realm it is written: <em>&quot;He who spots the
          flaw in the Emperor&apos;s war machine shall be made whole — and then some.&quot;</em>{" "}
          Your keen eye and the sacrifice of your brave soldiers have not gone
          unnoticed. The God Emperor A, in his infinite wisdom and occasional
          guilt, hereby replenishes your ranks. March forth, commander.
          Do not waste this gift.
        </p>

        <div className={styles.actions}>
          <button
            className={styles.button}
            onClick={dismiss}
            type="button"
          >
            Glory to the Emperor
          </button>
        </div>
      </section>
    </div>
  );
}
