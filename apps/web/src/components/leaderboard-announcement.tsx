"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import styles from "./season-update-announcement.module.css";

const STORAGE_PREFIX = "project-a:leaderboard-announcement";
const ANNOUNCEMENT_KEY = "2026-05-15-title-leaderboards";

const TITLE_ROWS = [
  {
    title: "Crown Accountant",
    body: "Most points. Gets +10% points from tile income.",
  },
  {
    title: "Butcher",
    body: "Most units killed. Gets +10% attack power.",
  },
  {
    title: "Landlord",
    body: "Most normal tiles owned. Gets +10% tile resource income.",
  },
  {
    title: "Goblin Bonker",
    body: "Most loot camps destroyed. Gets +25% loot-camp rewards.",
  },
];

export function LeaderboardAnnouncement({
  userId,
  triggerClassName,
  triggerLabel = "Leaderboard",
}: {
  userId: string | null;
  triggerClassName?: string;
  triggerLabel?: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const storageKey = `${STORAGE_PREFIX}:${ANNOUNCEMENT_KEY}:${
    userId ?? "guest"
  }`;
  const dialogId = "leaderboard-announcement-dialog";
  const titleId = "leaderboard-announcement-title";
  const descriptionId = "leaderboard-announcement-description";
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

  function reopenAnnouncement() {
    setIsOpen(true);
  }

  return (
    <>
      <button
        aria-controls={dialogId}
        aria-expanded={isOpen}
        aria-haspopup="dialog"
        className={triggerClassName ?? styles.reopenButton}
        type="button"
        onClick={reopenAnnouncement}
      >
        {triggerLabel}
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
                  <span className={styles.eyebrow}>Leaderboard update</span>
                  <button
                    aria-label="Close leaderboard announcement"
                    className={styles.closeButton}
                    onClick={dismissAnnouncement}
                    type="button"
                  >
                    Close
                  </button>
                </div>
                <div>
                  <h2 id={titleId}>Titles now come with paperwork.</h2>
                  <p id={descriptionId}>
                    The leaderboard now tracks points, units killed, tiles
                    owned, and goblins bonked. Lead a category to hold its title
                    and buff until someone rudely becomes better at it.
                  </p>
                </div>
                <div className={styles.sectionGrid}>
                  {TITLE_ROWS.map((row) => (
                    <article className={styles.updateSection} key={row.title}>
                      <h3>{row.title}</h3>
                      <p>{row.body}</p>
                    </article>
                  ))}
                </div>
                <p className={styles.footer}>
                  The crown is live, the ledger is watching, and the goblins
                  have filed a complaint.
                </p>
                <div className={styles.actions}>
                  <button
                    className={styles.primaryButton}
                    onClick={dismissAnnouncement}
                    type="button"
                  >
                    Inspect the leaderboard
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
