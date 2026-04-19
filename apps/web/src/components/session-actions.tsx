"use client";

import Link from "next/link";
import { signIn, signOut } from "next-auth/react";
import styles from "./session-actions.module.css";

type SessionActionsProps = {
  authConfigured: boolean;
  isAuthenticated: boolean;
  isAdmin: boolean;
};

export function SessionActions({
  authConfigured,
  isAuthenticated,
  isAdmin,
}: SessionActionsProps) {
  if (!isAuthenticated) {
    return (
      <div className={styles.actions}>
        <button
          className={styles.primaryButton}
          type="button"
          disabled={!authConfigured}
          onClick={() => void signIn("google")}
        >
          Sign in with Google
        </button>
        {!authConfigured ? (
          <p className={styles.hint}>
            Add the Google OAuth values to `apps/web/.env.local` to enable real
            sign-in.
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div className={styles.actions}>
      <button
        className={styles.primaryButton}
        type="button"
        onClick={() => void signOut({ callbackUrl: "/" })}
      >
        Sign out
      </button>
      {isAdmin ? (
        <Link className={styles.linkButton} href="/admin">
          Open admin dashboard
        </Link>
      ) : null}
      <p className={styles.hint}>
        Authenticated users can browse the app as spectators until gameplay
        actions are added.
      </p>
    </div>
  );
}
