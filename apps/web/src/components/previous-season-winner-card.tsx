"use client";

import { useEffect, useState, type ReactNode } from "react";

const STORAGE_PREFIX = "project-a:previous-season-winner-card";

export function PreviousSeasonWinnerCard({
  children,
  cycleId,
  className,
  closeButtonClassName,
}: {
  children: ReactNode;
  cycleId: string;
  className: string;
  closeButtonClassName: string;
}) {
  const [isVisible, setIsVisible] = useState(true);
  const storageKey = `${STORAGE_PREFIX}:${cycleId}`;

  useEffect(() => {
    let nextVisible = true;

    try {
      nextVisible = window.localStorage.getItem(storageKey) !== "dismissed";
    } catch {
      nextVisible = true;
    }

    queueMicrotask(() => setIsVisible(nextVisible));
  }, [storageKey]);

  function dismissCard() {
    try {
      window.localStorage.setItem(storageKey, "dismissed");
    } catch {
      // Ignore storage failures and still close locally.
    }

    setIsVisible(false);
  }

  if (!isVisible) {
    return null;
  }

  return (
    <section className={className}>
      <button
        aria-label="Close previous season winner"
        className={closeButtonClassName}
        onClick={dismissCard}
        type="button"
      >
        Close
      </button>
      {children}
    </section>
  );
}
