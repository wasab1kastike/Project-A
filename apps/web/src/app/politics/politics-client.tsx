"use client";

import { useState } from "react";
import Link from "next/link";
import {
  acceptAllianceAction,
  acceptAllianceTrustUpgradeAction,
  acceptPeaceAction,
  betrayAllianceAction,
  cancelAllianceProposalAction,
  cancelAllianceTrustUpgradeAction,
  declareWarAction,
  proposeAllianceAction,
  proposeAllianceTrustUpgradeAction,
  proposePeaceAction,
  rejectAllianceProposalAction,
  rejectAllianceTrustUpgradeAction,
} from "@/app/game-actions";
import type { PoliticsPageState } from "@/lib/game/politics-read-model";
import styles from "./page.module.css";

type PoliticsRow = PoliticsPageState["rows"][number];
type PoliticsAction = PoliticsRow["availableActions"][number];

function getStatusLabel(status: PoliticsRow["effectiveStatus"]) {
  switch (status) {
    case "ALLIANCE_PENDING":
      return "Alliance pending";
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
    case "PROPOSE_ALLIANCE":
      return "Propose alliance";
    case "ACCEPT_ALLIANCE":
      return "Accept alliance";
    case "CANCEL_ALLIANCE":
      return "Cancel proposal";
    case "REJECT_ALLIANCE":
      return "Reject alliance";
    case "PROPOSE_TRUST_UPGRADE":
      return "Raise trust";
    case "ACCEPT_TRUST_UPGRADE":
      return "Accept trust";
    case "CANCEL_TRUST_UPGRADE":
      return "Cancel request";
    case "REJECT_TRUST_UPGRADE":
      return "Reject trust";
    case "BETRAY_ALLIANCE":
      return "Betray";
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

  if (row.relationStatus === "ALLIANCE_PENDING") {
    return row.allianceProposedByCurrentPlayer
      ? "Alliance proposed"
      : "Alliance offer received";
  }

  if (row.effectiveStatus === "ALLIED") {
    if (row.trustUpgradeTier) {
      return row.trustUpgradeProposedByCurrentPlayer
        ? `Trust ${row.trustUpgradeTier} proposed`
        : `Trust ${row.trustUpgradeTier} requested`;
    }

    return `Trust ${row.allianceTrustTier}`;
  }

  return null;
}

export function PoliticsClient({ state }: { state: PoliticsPageState }) {
  const [pendingId, setPendingId] = useState<string | null>(null);

  async function handleAction(row: PoliticsRow, action: PoliticsAction) {
    if (pendingId) {
      return;
    }

    if (
      action === "BETRAY_ALLIANCE" &&
      !window.confirm(
        "Betray this alliance? Your escrow transfers to the other fortress and war starts immediately."
      )
    ) {
      return;
    }

    const key = `${row.fortressId}:${action}`;
    setPendingId(key);

    try {
      let result;

      switch (action) {
        case "DECLARE_WAR":
          result = await declareWarAction(row.fortressId);
          break;
        case "PROPOSE_ALLIANCE":
          result = await proposeAllianceAction(row.fortressId);
          break;
        case "ACCEPT_ALLIANCE":
          result = await acceptAllianceAction(row.fortressId);
          break;
        case "CANCEL_ALLIANCE":
          result = await cancelAllianceProposalAction(row.fortressId);
          break;
        case "REJECT_ALLIANCE":
          result = await rejectAllianceProposalAction(row.fortressId);
          break;
        case "PROPOSE_TRUST_UPGRADE":
          result = await proposeAllianceTrustUpgradeAction(row.fortressId);
          break;
        case "ACCEPT_TRUST_UPGRADE":
          result = await acceptAllianceTrustUpgradeAction(row.fortressId);
          break;
        case "CANCEL_TRUST_UPGRADE":
          result = await cancelAllianceTrustUpgradeAction(row.fortressId);
          break;
        case "REJECT_TRUST_UPGRADE":
          result = await rejectAllianceTrustUpgradeAction(row.fortressId);
          break;
        case "BETRAY_ALLIANCE":
          result = await betrayAllianceAction(row.fortressId);
          break;
        case "PROPOSE_PEACE":
          result = await proposePeaceAction(row.fortressId);
          break;
        case "ACCEPT_PEACE":
          result = await acceptPeaceAction(row.fortressId);
          break;
      }

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
              Manage trust-backed alliances, war declarations, and peace
              proposals from one focused command page.
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
                      {row.effectiveStatus === "ALLIED" ? (
                        <p className={styles.muted}>
                          Escrow each: {row.allianceEscrowGoldEach.toLocaleString()} gold
                          {" + "}
                          {row.allianceEscrowFoodEach.toLocaleString()} food
                        </p>
                      ) : null}
                      <div className={styles.actions}>
                        {row.availableActions.length > 0 ? (
                          row.availableActions.map((action) => {
                            const key = `${row.fortressId}:${action}`;

                            return (
                              <button
                                key={action}
                                type="button"
                                data-danger={action === "BETRAY_ALLIANCE" || undefined}
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
                              : row.relationStatus === "ALLIANCE_PENDING" &&
                                  row.allianceProposedByCurrentPlayer
                                ? "Alliance proposed"
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
