"use client";

import { useState } from "react";
import Link from "next/link";
import {
  acceptPeaceAction,
  declareWarAction,
  proposePeaceAction,
} from "@/app/game-actions";
import type { PoliticsPageState } from "@/lib/game/politics-read-model";
import styles from "./page.module.css";

type PoliticsRow = PoliticsPageState["rows"][number];
type PoliticsAction = PoliticsRow["availableActions"][number];

function getStatusLabel(status: PoliticsRow["effectiveStatus"]) {
  switch (status) {
    case "WAR_PENDING":
      return "War pending";
    case "PEACE_PENDING":
      return "Peace pending";
    default:
      return status.charAt(0) + status.slice(1).toLowerCase();
  }
}

function getActionLabel(action: PoliticsAction) {
  switch (action) {
    case "DECLARE_WAR":
      return "Declare war";
    case "PROPOSE_PEACE":
      return "Propose peace";
    case "ACCEPT_PEACE":
      return "Accept peace";
  }
}

function getTimingLabel(row: PoliticsRow) {
  if (row.effectiveStatus === "WAR") {
    return "War active";
  }

  if (row.effectiveStatus === "WAR_PENDING") {
    const minutes = row.minutesUntilWar ?? 0;
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;

    if (hours > 0) {
      return remainingMinutes > 0
        ? `War in ${hours}h ${remainingMinutes}m`
        : `War in ${hours}h`;
    }

    return `War in ${Math.max(1, minutes)}m`;
  }

  if (row.relationStatus === "PEACE_PENDING") {
    return row.peaceProposedByCurrentPlayer
      ? "Peace proposed"
      : "Peace offer received";
  }

  return null;
}

export function PoliticsClient({ state }: { state: PoliticsPageState }) {
  const [pendingId, setPendingId] = useState<string | null>(null);

  async function handleAction(row: PoliticsRow, action: PoliticsAction) {
    if (pendingId) {
      return;
    }

    const key = `${row.fortressId}:${action}`;
    setPendingId(key);

    try {
      const result =
        action === "DECLARE_WAR"
          ? await declareWarAction(row.fortressId)
          : action === "PROPOSE_PEACE"
            ? await proposePeaceAction(row.fortressId)
            : await acceptPeaceAction(row.fortressId);

      if (!result.ok) {
        window.alert(result.error);
      }
    } finally {
      setPendingId(null);
    }
  }

  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <nav className={styles.topbar} aria-label="Politics navigation">
          <div className={styles.titleBlock}>
            <span className={styles.eyebrow}>Season 4</span>
            <h1>Politics & Trade</h1>
          </div>
          <Link href="/">Battlefield</Link>
        </nav>

        <section className={styles.hero}>
          <div>
            <span className={styles.eyebrow}>Diplomacy desk</span>
            <h2>{state.playerFortress?.name ?? "Politics unavailable"}</h2>
            <p>
              Declare wars with a 24-hour warning, watch pending treaties, and
              settle peace offers from one focused command page.
            </p>
          </div>
        </section>

        <div className={styles.grid}>
          <section className={styles.panel}>
            <div className={styles.panelHeader}>
              <div>
                <span className={styles.eyebrow}>Relations</span>
                <h2>War and peace</h2>
              </div>
              <strong>{state.rows.length}</strong>
            </div>

            <div className={styles.relationList}>
              {state.rows.length > 0 ? (
                state.rows.map((row) => {
                  const timingLabel = getTimingLabel(row);

                  return (
                    <article key={row.fortressId} className={styles.card}>
                      <div className={styles.cardHeader}>
                        <div>
                          <strong>{row.commanderName || row.name}</strong>
                          <span>{row.name}</span>
                        </div>
                        <span
                          className={styles.relationChip}
                          data-status={row.effectiveStatus.toLowerCase()}
                        >
                          {getStatusLabel(row.effectiveStatus)}
                        </span>
                      </div>
                      {timingLabel ? (
                        <p className={styles.timing}>{timingLabel}</p>
                      ) : null}
                      <div className={styles.actions}>
                        {row.availableActions.length > 0 ? (
                          row.availableActions.map((action) => {
                            const key = `${row.fortressId}:${action}`;

                            return (
                              <button
                                key={action}
                                type="button"
                                disabled={pendingId !== null}
                                onClick={() => {
                                  void handleAction(row, action);
                                }}
                              >
                                {pendingId === key
                                  ? "Sending..."
                                  : getActionLabel(action)}
                              </button>
                            );
                          })
                        ) : (
                          <button type="button" disabled>
                            {row.relationStatus === "PEACE_PENDING" &&
                            row.peaceProposedByCurrentPlayer
                              ? "Peace proposed"
                              : "No action"}
                          </button>
                        )}
                      </div>
                      {row.disabledReason ? (
                        <p className={styles.muted}>{row.disabledReason}</p>
                      ) : null}
                    </article>
                  );
                })
              ) : (
                <p className={styles.muted}>
                  No other player fortresses are active in this cycle.
                </p>
              )}
            </div>
          </section>

          <section className={`${styles.panel} ${styles.lockedPanel}`}>
            <div>
              <span className={styles.eyebrow}>Trading</span>
              <h2>Coming later</h2>
            </div>
            <p>
              Gold, food, army, and connected tile offers will live here once
              the Season 4 trade rules and escrow model are implemented.
            </p>
            <div className={styles.lockedGrid} aria-hidden="true">
              <span>Gold</span>
              <span>Food</span>
              <span>Army</span>
              <span>Tiles</span>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
