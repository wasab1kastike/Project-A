"use client";

import { useEffect, useState } from "react";
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
      "Space Murines: disciplined sauna warriors.",
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
        className={styles.reopenButton}
        type="button"
        onClick={reopenAnnouncement}
      >
        Season Update
      </button>
      {isOpen ? (
        <div className={styles.backdrop}>
          <section
            aria-describedby="season-update-description"
            aria-labelledby="season-update-title"
            aria-modal="true"
            className={styles.card}
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
              <h2 id="season-update-title">
                Season Update: Castles Got Jobs
              </h2>
              <p id="season-update-description">
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
        </div>
      ) : null}
    </>
  );
}
