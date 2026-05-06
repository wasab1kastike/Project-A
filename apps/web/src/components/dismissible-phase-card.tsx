"use client";

import { useEffect, useState, type ReactNode } from "react";

export function DismissiblePhaseCard({
  ariaLive = "polite",
  children,
  className,
  closeButtonClassName,
  isDismissible,
  storageKey,
}: {
  ariaLive?: "off" | "polite" | "assertive";
  children: ReactNode;
  className: string;
  closeButtonClassName: string;
  isDismissible: boolean;
  storageKey: string;
}) {
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    if (!isDismissible) {
      return;
    }

    let nextVisible = true;

    try {
      nextVisible = window.localStorage.getItem(storageKey) !== "dismissed";
    } catch {
      nextVisible = true;
    }

    queueMicrotask(() => setIsVisible(nextVisible));
  }, [isDismissible, storageKey]);

  function dismissCard() {
    try {
      window.localStorage.setItem(storageKey, "dismissed");
    } catch {
      // Ignore storage failures and still close locally.
    }

    setIsVisible(false);
  }

  if (isDismissible && !isVisible) {
    return null;
  }

  return (
    <section className={className} aria-live={ariaLive}>
      {isDismissible ? (
        <button
          aria-label="Close phase card"
          className={closeButtonClassName}
          onClick={dismissCard}
          type="button"
        >
          Close
        </button>
      ) : null}
      {children}
    </section>
  );
}
