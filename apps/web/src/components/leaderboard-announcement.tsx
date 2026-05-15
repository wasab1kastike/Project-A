"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { HomePageState } from "@/lib/game/read-model";
import styles from "./season-update-announcement.module.css";

const STORAGE_PREFIX = "project-a:leaderboard-announcement";
const ANNOUNCEMENT_KEY = "2026-05-15-loot-lord-live-leaderboard";

type LeaderboardTitleSummary = HomePageState["leaderboardTitles"][number];

function formatScore(value: number | null, metricLabel: string) {
  return value === null ? "No score yet" : `${value.toLocaleString()} ${metricLabel}`;
}

export function LeaderboardAnnouncement({
  userId,
  leaderboardTitles,
  triggerClassName,
  triggerLabel = "Leaderboard",
}: {
  userId: string | null;
  leaderboardTitles: LeaderboardTitleSummary[];
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
                    The leaderboard tracks points, units killed, tiles owned,
                    goblins bonked, and castle loot stolen. Lead a category to
                    hold its title and buff until someone rudely becomes better
                    at it.
                  </p>
                </div>
                <div className={styles.leaderboardRows}>
                  {leaderboardTitles.map((row) => (
                    <article className={styles.leaderboardRow} key={row.category}>
                      <div className={styles.leaderboardTitleCell}>
                        <h3>{row.title}</h3>
                        <p>
                          {row.label}. {row.buffLabel}.
                        </p>
                      </div>
                      <div className={styles.leaderboardScoreCell}>
                        <span>Holder</span>
                        <strong>{row.holderName ?? "No holder yet"}</strong>
                        <small>
                          {formatScore(row.holderMetric, row.metricLabel)}
                        </small>
                      </div>
                      <div className={styles.leaderboardScoreCell}>
                        <span>Your score</span>
                        {row.currentUserMetric === null ? (
                          <strong>Join a fortress to compete</strong>
                        ) : (
                          <>
                            <strong>
                              {row.currentUserMetric.toLocaleString()}
                            </strong>
                            <small>{row.metricLabel}</small>
                          </>
                        )}
                      </div>
                    </article>
                  ))}
                </div>
                <p className={styles.footer}>
                  The crown is live, the ledger is watching, and the loot
                  receipts are admissible evidence.
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
