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
    title: "Choose Your Race",
    items: [
      "Pick one race for the season.",
      "Locked for the season.",
      "More race rewards coming later.",
    ],
  },
  {
    title: "Four Races",
    items: [
      "Dwarfs: defensive miners.",
      "Unstable Unicorns: magical food chaos.",
      "Space Murines: Acolytes of the Emperor A, they despise all other life forms.",
      "ORKS: loud raiders with huge loot potential.",
    ],
  },
  {
    title: "Economy Rework",
    items: [
      "Castles now have population.",
      "Miners = points.",
      "Farmers = food.",
      "Recruiters = army.",
    ],
  },
  {
    title: "Castle Defense",
    items: [
      "Home army defends automatically.",
      "Castle level increases defense bonus.",
      "Level 1 already grants +10%.",
    ],
  },
  {
    title: "Risky Raids",
    items: [
      "Send part or all of your army.",
      "Defender wins ties.",
      "Winning raids still cost troops.",
      "Defenders survive partially to prevent snowballing.",
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
                  <h2 id={titleId}>Season Update: Castles Got Jobs</h2>
                  <p id={descriptionId}>
                    The season now has real fortress economy, race identity, and
                    riskier raids. Tiny workers, big consequences.
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
                  Assign workers. Feed the army. Do not trust the unicorns.
                </p>
                <div className={styles.actions}>
                  <button
                    className={styles.primaryButton}
                    onClick={dismissAnnouncement}
                    type="button"
                  >
                    Enter the season
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
