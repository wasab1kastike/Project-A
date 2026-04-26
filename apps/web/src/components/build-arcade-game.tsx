"use client";

import { useEffect, useMemo, useState } from "react";
import styles from "./build-arcade-game.module.css";

const GRID_SIZE = 9;
const GAME_DURATION_SECONDS = 20;

function pickNextTarget(previous: number | null) {
  let next = Math.floor(Math.random() * GRID_SIZE);

  if (previous !== null && GRID_SIZE > 1) {
    while (next === previous) {
      next = Math.floor(Math.random() * GRID_SIZE);
    }
  }

  return next;
}

export function BuildArcadeGame({
  cycleId,
  canPlay,
  bestScore,
  currentRewardVariant,
  rewardPreviewLabel,
  onSubmitScore,
}: {
  cycleId: string;
  canPlay: boolean;
  bestScore: number;
  currentRewardVariant: string | null;
  rewardPreviewLabel: string | null;
  onSubmitScore: (formData: FormData) => void;
}) {
  const [running, setRunning] = useState(false);
  const [finished, setFinished] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(GAME_DURATION_SECONDS);
  const [score, setScore] = useState(0);
  const [targetIndex, setTargetIndex] = useState<number | null>(null);

  useEffect(() => {
    if (!running) {
      return;
    }

    const timer = window.setInterval(() => {
      setSecondsLeft((current) => {
        if (current <= 1) {
          window.clearInterval(timer);
          setRunning(false);
          setFinished(true);
          return 0;
        }

        return current - 1;
      });
    }, 1000);

    return () => window.clearInterval(timer);
  }, [running]);

  const targetLabel = useMemo(() => {
    if (finished) {
      return "Round over";
    }

    if (!running) {
      return "Start the round";
    }

    return "Hit the glowing tile";
  }, [finished, running]);

  function startRound() {
    setScore(0);
    setSecondsLeft(GAME_DURATION_SECONDS);
    setFinished(false);
    setRunning(true);
    setTargetIndex(pickNextTarget(null));
  }

  function handleTileClick(index: number) {
    if (!running || targetIndex === null) {
      return;
    }

    if (index !== targetIndex) {
      setScore((current) => Math.max(0, current - 1));
      return;
    }

    setScore((current) => current + 1);
    setTargetIndex(pickNextTarget(targetIndex));
  }

  return (
    <section className={styles.shell} aria-label="Build arcade mini game">
      <div className={styles.header}>
        <div>
          <span className={styles.sectionLabel}>Build arcade</span>
          <h2>Catch the signal</h2>
          <p>
            Tap the glowing tile as fast as you can before the build window
            closes.
          </p>
        </div>
        <div className={styles.stats}>
          <div>
            <span>Score</span>
            <strong>{score}</strong>
          </div>
          <div>
            <span>Time</span>
            <strong>{secondsLeft}s</strong>
          </div>
          <div>
            <span>Best</span>
            <strong>{bestScore}</strong>
          </div>
        </div>
      </div>

      <div className={styles.grid} role="grid" aria-label={targetLabel}>
        {Array.from({ length: GRID_SIZE }, (_, index) => {
          const isTarget = running && index === targetIndex;

          return (
            <button
              key={index}
              type="button"
              className={`${styles.tile} ${isTarget ? styles.targetTile : ""}`}
              onClick={() => handleTileClick(index)}
              disabled={!running}
              aria-label={isTarget ? "Target tile" : `Tile ${index + 1}`}
            >
              <span />
            </button>
          );
        })}
      </div>

      <div className={styles.footer}>
        <div className={styles.rewardBox}>
          <span className={styles.sectionLabel}>Reward</span>
          <strong>{rewardPreviewLabel ?? currentRewardVariant ?? "No skin yet"}</strong>
          <p>
            {currentRewardVariant
              ? "Your current skin unlock applies to both units and castles."
              : "Reach 5 points to unlock your first skin."}
          </p>
        </div>

        <form action={onSubmitScore} className={styles.submitForm}>
          <input type="hidden" name="cycleId" value={cycleId} />
          <input type="hidden" name="score" value={score} />
          {!running && !finished ? (
            <button className={styles.primaryButton} type="button" onClick={startRound}>
              Start run
            </button>
          ) : null}
          {running ? (
            <button className={styles.secondaryButton} type="button" onClick={() => setRunning(false)}>
              Pause
            </button>
          ) : null}
          {finished ? (
            <button className={styles.primaryButton} type="submit">
              Claim cosmetic
            </button>
          ) : null}
        </form>
      </div>

      {!canPlay ? <p className={styles.lockedNote}>The arcade opens during the build phase.</p> : null}
    </section>
  );
}
