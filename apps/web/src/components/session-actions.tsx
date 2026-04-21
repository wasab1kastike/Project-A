"use client";

import Link from "next/link";
import { signIn, signOut } from "next-auth/react";
import styles from "./session-actions.module.css";

type SessionActionsProps = {
  authConfigured: boolean;
  isAuthenticated: boolean;
  isAdmin: boolean;
  variant?: "default" | "compact";
};

export function SessionActions({
  authConfigured,
  isAuthenticated,
  isAdmin,
  variant = "default",
}: SessionActionsProps) {
  const isCompact = variant === "compact";
  const actionsClassName = isCompact
    ? `${styles.actions} ${styles.compactActions}`
    : styles.actions;

  if (!isAuthenticated) {
    return (
      <div className={actionsClassName}>
        <button
          className={styles.primaryButton}
          type="button"
          disabled={!authConfigured}
          onClick={() => void signIn("google")}
        >
          {isCompact ? "Sign in" : "Sign in with Google"}
        </button>
        {!isCompact && !authConfigured ? (
          <p className={styles.hint}>
            Add the Google OAuth values to `apps/web/.env.local` to enable real
            sign-in.
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div className={actionsClassName}>
      <button
        className={styles.primaryButton}
        type="button"
        onClick={() => void signOut({ callbackUrl: "/" })}
      >
        {isCompact ? "Sign out" : "Sign out"}
      </button>
      {isAdmin ? (
        <Link className={styles.linkButton} href="/admin">
          {isCompact ? "Admin" : "Open admin dashboard"}
        </Link>
      ) : null}
      {!isCompact ? (
        <p className={styles.hint}>
        Signed-in users can join the open registration window and control their
        fortress during the active cycle.
        </p>
      ) : null}
    </div>
  );
}
