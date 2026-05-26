"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import {
  getSeasonAnnouncementStorageKey,
  shouldShowSeasonAnnouncement,
} from "@/lib/game/season-announcement";
import styles from "./season-update-announcement.module.css";

const SECTIONS = [
  {
    title: "Pressure Expansion",
    items: [
      "Assign pressure workers and prioritize connected neutral border tiles.",
      "Neutral tiles are claimed automatically at 600 pressure.",
      "Manual gold-paid tile purchases are retired.",
    ],
  },
  {
    title: "Politics & Trade",
    items: [
      "Declare war with a 24-hour warning, negotiate peace, or build trust-backed alliances.",
      "Neutral and allied fortresses can trade gold, food, and army.",
      "Accepted cargo travels in slow convoy legs; allied delivery bonuses reward trust.",
    ],
  },
  {
    title: "Campaign Warfare",
    items: [
      "War borders use standing campaign orders instead of ordinary manual PvP launches.",
      "Committed army and pressure build a siege over time.",
      "A visible 12-hour warning opens before siege combat resolves.",
    ],
  },
  {
    title: "Retired For Season 4",
    items: [
      "The old Home of A center becomes an inaccessible monument.",
      "Loot camps and old active race abilities are not live Season 4 gameplay.",
      "Previous season records remain in history.",
    ],
  },
];

export function SeasonUpdateAnnouncement({
  userId,
}: {
  userId: string | null;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const storageKey = getSeasonAnnouncementStorageKey({ userId });
  const dialogId = "season-update-dialog";
  const titleId = "season-update-title";
  const descriptionId = "season-update-description";
  const portalTarget =
    typeof document === "undefined"
      ? null
      : document.getElementById("modal-root") ?? document.body;

  useEffect(() => {
    let isDismissed = false;

    if (typeof window !== "undefined") {
      try {
        isDismissed =
          window.localStorage.getItem(storageKey) === "dismissed";
      } catch {
        isDismissed = false;
      }
    }

    queueMicrotask(() => {
      setIsOpen(
        shouldShowSeasonAnnouncement({
          isDismissed,
        })
      );
    });
  }, [storageKey]);

  function dismissAnnouncement() {
    if (typeof window !== "undefined") {
      try {
        window.localStorage.setItem(storageKey, "dismissed");
      } catch {
        // Ignore storage failures and still close locally.
      }
    }

    setIsOpen(false);
  }

  function reopenAnnouncement() {
    setIsOpen(
      shouldShowSeasonAnnouncement({
        isDismissed: true,
        isManuallyReopened: true,
      })
    );
  }

  return (
    <>
      <button
        aria-controls={dialogId}
        aria-expanded={isOpen}
        aria-haspopup="dialog"
        className={styles.reopenButton}
        type="button"
        onClick={reopenAnnouncement}
      >
        Season Update
      </button>
      {isOpen && portalTarget
        ? createPortal(
            <div className={styles.backdrop}>
              <section
                aria-describedby={descriptionId}
                aria-labelledby={titleId}
                aria-modal="true"
                className={styles.card}
                id={dialogId}
                role="dialog"
              >
                <div className={styles.header}>
                  <span className={styles.eyebrow}>What&apos;s New?</span>
                  <button
                    aria-label="Close season update"
                    className={styles.closeButton}
                    onClick={dismissAnnouncement}
                    type="button"
                  >
                    Close
                  </button>
                </div>
                <div>
                  <h2 id={titleId}>Season 4: Borders, Treaties, and Convoys</h2>
                  <p id={descriptionId}>
                    Season 4 is a slower strategy game built around pressure
                    expansion, diplomacy, trade logistics, and territorial
                    campaigns. Registration and pretesting are open while the
                    final rules are verified.
                  </p>
                </div>
                <div className={styles.sectionGrid}>
                  {SECTIONS.map((section) => (
                    <article className={styles.updateSection} key={section.title}>
                      <h3>{section.title}</h3>
                      <ul>
                        {section.items.map((item) => (
                          <li key={item}>{item}</li>
                        ))}
                      </ul>
                    </article>
                  ))}
                </div>
                <p className={styles.footer}>
                  Choose a race, claim a fortress, and prepare for Season 4.
                </p>
                <div className={styles.actions}>
                  <button
                    className={styles.primaryButton}
                    onClick={dismissAnnouncement}
                    type="button"
                  >
                    Enter pretesting
                  </button>
                </div>
              </section>
            </div>,
            portalTarget
          )
        : null}
    </>
  );
}
