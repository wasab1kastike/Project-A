"use client";

import { useEffect, useState } from "react";
import styles from "./season-timer.module.css";

function formatCountdown(milliseconds: number) {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const parts = [hours, minutes, seconds].map((value) =>
    value.toString().padStart(2, "0")
  );

  return days > 0 ? `${days}d ${parts.join(":")}` : parts.join(":");
}

export function SeasonTimer({
  deadline,
  label,
}: {
  deadline: string | null;
  label: string;
}) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNow(Date.now());
    }, 1000);

    return () => {
      window.clearInterval(timer);
    };
  }, []);

  if (!deadline) {
    return (
      <div className={styles.timerCard}>
        <span className={styles.timerLabel}>{label}</span>
        <strong className={styles.timerValue}>No active countdown</strong>
      </div>
    );
  }

  const deadlineTime = new Date(deadline).getTime();
  const isExpired = deadlineTime <= now;

  return (
    <div className={styles.timerCard}>
      <span className={styles.timerLabel}>{label}</span>
      <strong className={styles.timerValue}>
        {isExpired ? "Awaiting next tick" : formatCountdown(deadlineTime - now)}
      </strong>
    </div>
  );
}
