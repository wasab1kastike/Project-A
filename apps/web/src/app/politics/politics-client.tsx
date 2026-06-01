"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import {
  acceptAllianceAction,
  acceptAllianceTrustUpgradeAction,
  acceptPeaceAction,
  acceptTradeOfferAction,
  activateCasusBelliWarAction,
  betrayAllianceAction,
  cancelAllianceProposalAction,
  cancelAllianceTrustUpgradeAction,
  cancelTradeOfferAction,
  createTradeOfferAction,
  createEscortOrderAction,
  declareWarAction,
  proposeAllianceAction,
  proposeAllianceTrustUpgradeAction,
  proposePeaceAction,
  rejectAllianceProposalAction,
  rejectAllianceTrustUpgradeAction,
  rejectTradeOfferAction,
  recallArmyOrderAction,
} from "@/app/game-actions";
import type { PoliticsPageState } from "@/lib/game/politics-read-model";
import styles from "./page.module.css";

type PoliticsRow = PoliticsPageState["rows"][number];
type PoliticsAction = PoliticsRow["availableActions"][number];
type TreatyPayer = "SELF" | "TARGET";

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
    case "ACTIVATE_CASUS_BELLI_WAR":
      return "Invoke casus belli";
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

  if (row.effectiveStatus === "ENEMY" && row.casusBelliBelongsToCurrentPlayer) {
    return "Casus belli available for immediate war";
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

function formatTerms({
  gold,
  food,
  army,
  tileId,
}: {
  gold: number;
  food: number;
  army: number;
  tileId?: string | null;
}) {
  return [
    gold > 0 ? `${gold.toLocaleString()} gold` : null,
    food > 0 ? `${food.toLocaleString()} food` : null,
    army > 0 ? `${army.toLocaleString()} army` : null,
    tileId ? `tile ${tileId}` : null,
  ]
    .filter(Boolean)
    .join(", ");
}

export function PoliticsClient({ state }: { state: PoliticsPageState }) {
  const [pendingId, setPendingId] = useState<string | null>(null);
  const tradeTargets = state.rows.filter((row) => row.canTrade);
  const [tradeTargetId, setTradeTargetId] = useState(
    tradeTargets[0]?.fortressId ?? ""
  );
  const [tradeCargo, setTradeCargo] = useState({
    offeredGold: 0,
    offeredFood: 0,
    offeredArmy: 0,
    offeredPoints: 0,
    requestedGold: 0,
    requestedFood: 0,
    requestedArmy: 0,
    requestedPoints: 0,
    offeredTileId: '',
    requestedTileId: '',
  });
  const [orderArmy, setOrderArmy] = useState(100);

  // Alliance/peace terms panel state
  const [termsPanel, setTermsPanel] = useState<{
    rowId: string;
    action: "PROPOSE_ALLIANCE" | "PROPOSE_PEACE";
  } | null>(null);
  const [termsGold, setTermsGold] = useState(0);
  const [termsFood, setTermsFood] = useState(0);
  const [termsArmy, setTermsArmy] = useState(0);
  const [termsTileId, setTermsTileId] = useState("");
  const [termsPayer, setTermsPayer] = useState<TreatyPayer>("SELF");

  function openTermsPanel(row: PoliticsRow, action: "PROPOSE_ALLIANCE" | "PROPOSE_PEACE") {
    setTermsPanel({ rowId: row.fortressId, action });
    setTermsGold(0);
    setTermsFood(0);
    setTermsArmy(0);
    setTermsTileId("");
    setTermsPayer("SELF");
  }

  function closeTermsPanel() {
    setTermsPanel(null);
  }

  async function submitTerms(row: PoliticsRow) {
    if (!termsPanel || pendingId) return;

    const key = `${row.fortressId}:${termsPanel.action}`;
    setPendingId(key);

    try {
      let result;

      if (termsPanel.action === "PROPOSE_ALLIANCE") {
        result = await proposeAllianceAction({
          targetFortressId: row.fortressId,
          collateralGold: termsGold || undefined,
          collateralFood: termsFood || undefined,
          collateralArmy: termsArmy || undefined,
        });
      } else {
        result = await proposePeaceAction({
          targetFortressId: row.fortressId,
          reparationGold: termsGold || undefined,
          reparationFood: termsFood || undefined,
          reparationArmy: termsArmy || undefined,
          reparationTileId: termsTileId || undefined,
          reparationPayer: termsPayer,
        });
      }

      if (result?.ok) {
        closeTermsPanel();
      } else if (result && !result.ok) {
        window.alert(result.error);
      }
    } finally {
      setPendingId(null);
    }
  }

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

    if (
      action === "ACTIVATE_CASUS_BELLI_WAR" &&
      !window.confirm("Invoke casus belli? War starts immediately.")
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
        case "ACTIVATE_CASUS_BELLI_WAR":
          result = await activateCasusBelliWarAction(row.fortressId);
          break;
        case "PROPOSE_ALLIANCE":
          result = await proposeAllianceAction({
            targetFortressId: row.fortressId,
          });
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
          result = await proposePeaceAction({
            targetFortressId: row.fortressId,
          });
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

  function setCargoValue(name: keyof typeof tradeCargo, value: string) {
    setTradeCargo((current) => ({
      ...current,
      [name]: Number.parseInt(value || "0", 10),
    }));
  }

  function setTileValue(name: string, value: string) {
    setTradeCargo((current) => ({
      ...current,
      [name]: value,
    }));
  }

  async function submitOffer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (pendingId || !tradeTargetId) {
      return;
    }

    setPendingId("trade:create");

    try {
      const result = await createTradeOfferAction({
        targetFortressId: tradeTargetId,
        offeredGold: tradeCargo.offeredGold,
        offeredFood: tradeCargo.offeredFood,
        offeredArmy: tradeCargo.offeredArmy,
        offeredPoints: tradeCargo.offeredPoints,
        requestedGold: tradeCargo.requestedGold,
        requestedFood: tradeCargo.requestedFood,
        requestedArmy: tradeCargo.requestedArmy,
        requestedPoints: tradeCargo.requestedPoints,
        offeredTileId: tradeCargo.offeredTileId || undefined,
        requestedTileId: tradeCargo.requestedTileId || undefined,
      });

      if (!result.ok) {
        window.alert(result.error);
      } else {
        setTradeCargo({
          offeredGold: 0,
          offeredFood: 0,
          offeredArmy: 0,
          offeredPoints: 0,
          requestedGold: 0,
          requestedFood: 0,
          requestedArmy: 0,
          requestedPoints: 0,
          offeredTileId: '',
          requestedTileId: '',
        });
      }
    } finally {
      setPendingId(null);
    }
  }

  async function handleTradeOffer(
    tradeOfferId: string,
    action: "accept" | "reject" | "cancel"
  ) {
    if (pendingId) {
      return;
    }

    const key = `trade:${action}:${tradeOfferId}`;
    setPendingId(key);

    try {
      const result =
        action === "accept"
          ? await acceptTradeOfferAction(tradeOfferId)
          : action === "reject"
            ? await rejectTradeOfferAction(tradeOfferId)
            : await cancelTradeOfferAction(tradeOfferId);

      if (!result.ok) {
        window.alert(result.error);
      }
    } finally {
      setPendingId(null);
    }
  }

  async function handleOrder(
    key: string,
    action: () => Promise<{ ok: boolean; error?: string }>
  ) {
    if (pendingId) {
      return;
    }

    setPendingId(key);

    try {
      const result = await action();

      if (!result.ok) {
        window.alert(result.error);
      }
    } finally {
      setPendingId(null);
    }
  }

  function formatCargo(
    lineItems: {
      fromFortressId: string;
      kind: string;
      amount: number | null;
      tileId?: string | null;
    }[],
    fromFortressId: string
  ) {
    const cargoParts = lineItems
      .filter(
        (item) =>
          item.fromFortressId === fromFortressId &&
          item.kind !== "TILE" &&
          item.amount != null
      )
      .map((item) => `${item.amount!.toLocaleString()} ${item.kind.toLowerCase()}`);

    const deedItem = lineItems.find(
      (item) =>
        item.fromFortressId === fromFortressId &&
        item.kind === "TILE" &&
        item.tileId
    );

    if (deedItem) {
      cargoParts.push(`Tile ${deedItem.tileId}`);
    }

    return cargoParts.join(", ") || "nothing";
  }

  function formatLegCargo(leg: PoliticsPageState["activeConvoyLegs"][number]) {
    const items = [
      leg.deedTileId ? `Tile ${leg.deedTileId}` : null,
      leg.gold > 0 ? `${leg.gold.toLocaleString()} gold` : null,
      leg.food > 0 ? `${leg.food.toLocaleString()} food` : null,
      leg.army > 0 ? `${leg.army.toLocaleString()} army` : null,
      leg.points > 0 ? `${leg.points.toLocaleString()} points` : null,
    ].filter(Boolean);

    if (leg.deedFailureReason) {
      items.push(`(deed: ${leg.deedFailureReason})`);
    }

    return items.join(", ") || "empty";
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
                      {(row.effectiveStatus === "ALLIED" ||
                        row.effectiveStatus === "ALLIANCE_PENDING") &&
                      (row.collateralGold > 0 ||
                        row.collateralFood > 0 ||
                        row.collateralArmy > 0) ? (
                        <p className={styles.treatyNote}>
                          Break collateral:{" "}
                          {formatTerms({
                            gold: row.collateralGold,
                            food: row.collateralFood,
                            army: row.collateralArmy,
                          })}
                        </p>
                      ) : null}
                      {row.collateralDebtFortressId &&
                      (row.collateralDebtGold > 0 ||
                        row.collateralDebtFood > 0 ||
                        row.collateralDebtArmy > 0) ? (
                        <p className={styles.debtNote}>
                          {row.collateralDebtOwedByCurrentPlayer
                            ? "You owe"
                            : "Owed to you"}
                          {": "}
                          {formatTerms({
                            gold: row.collateralDebtGold,
                            food: row.collateralDebtFood,
                            army: row.collateralDebtArmy,
                          })}
                        </p>
                      ) : null}
                      {/* Legacy alliance offer details */}
                      {row.effectiveStatus === "ALLIANCE_PENDING" &&
                      (row.allianceOfferGold > 0 ||
                        row.allianceOfferFood > 0 ||
                        row.allianceOfferArmy > 0 ||
                        row.allianceOfferTileId) ? (
                        <p className={styles.muted} style={{ color: "#ffd700" }}>
                          Offer:{" "}
                          {[
                            row.allianceOfferGold > 0 ? `${row.allianceOfferGold.toLocaleString()} gold` : null,
                            row.allianceOfferFood > 0 ? `${row.allianceOfferFood.toLocaleString()} food` : null,
                            row.allianceOfferArmy > 0 ? `${row.allianceOfferArmy.toLocaleString()} army` : null,
                            row.allianceOfferTileId ? `tile ${row.allianceOfferTileId}` : null,
                          ]
                            .filter(Boolean)
                            .join(", ")}{" "}
                          ({row.allianceOfferDirection === "B_TO_A" ? "they pay you" : "you pay them"})
                        </p>
                      ) : null}
                      {/* Peace reparation details */}
                      {row.effectiveStatus === "PEACE_PENDING" &&
                      (row.peaceReparationGold > 0 ||
                        row.peaceReparationFood > 0 ||
                        row.peaceReparationArmy > 0 ||
                        row.peaceReparationTileId) ? (
                        <p className={styles.muted} style={{ color: "#ff8c42" }}>
                          Peace terms:{" "}
                          {row.peaceReparationFromCurrentPlayer
                            ? "you pay "
                            : "they pay "}
                          {formatTerms({
                            gold: row.peaceReparationGold,
                            food: row.peaceReparationFood,
                            army: row.peaceReparationArmy,
                            tileId: row.peaceReparationTileId,
                          })}
                        </p>
                      ) : null}
                      {/* Peace timer */}
                      {row.peaceLockedUntil && new Date(row.peaceLockedUntil) > new Date() ? (
                        <p className={styles.muted} style={{ color: "#6ab0ff" }}>
                          Unbreakable peace: {(() => {
                            const hoursLeft = Math.ceil(
                              (new Date(row.peaceLockedUntil!).getTime() - Date.now()) / 3600000
                            );
                            return `${hoursLeft}h remaining`;
                          })()}
                        </p>
                      ) : null}
                      <div className={styles.actions}>
                        {row.availableActions.length > 0 ? (
                          row.availableActions.map((action) => {
                            const key = `${row.fortressId}:${action}`;
                            const isTermsAction =
                              action === "PROPOSE_ALLIANCE" || action === "PROPOSE_PEACE";

                            return (
                              <button
                                key={action}
                                type="button"
                                data-danger={action === "BETRAY_ALLIANCE" || undefined}
                                disabled={pendingId !== null}
                                onClick={() => {
                                  if (isTermsAction) {
                                    openTermsPanel(
                                      row,
                                      action as "PROPOSE_ALLIANCE" | "PROPOSE_PEACE"
                                    );
                                  } else {
                                    void handleAction(row, action);
                                  }
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
                      {/* Alliance/Peace terms form */}
                      {termsPanel && termsPanel.rowId === row.fortressId ? (
                        <div className={styles.termsForm}>
                          <p className={styles.termsLabel}>
                            {termsPanel.action === "PROPOSE_ALLIANCE"
                              ? "Alliance break collateral (optional)"
                              : "Peace terms (optional)"}
                          </p>
                          <div className={styles.tradeColumns}>
                            <fieldset>
                              <legend>
                                {termsPanel.action === "PROPOSE_ALLIANCE"
                                  ? "Breaker owes"
                                  : termsPayer === "SELF"
                                    ? "You pay"
                                    : "They pay"}
                              </legend>
                              <label>
                                <span>Gold</span>
                                <input
                                  type="number"
                                  min={0}
                                  step={100}
                                  value={termsGold || ""}
                                  onChange={(e) =>
                                    setTermsGold(Math.max(0, Number(e.target.value) || 0))
                                  }
                                />
                              </label>
                              <label>
                                <span>Food</span>
                                <input
                                  type="number"
                                  min={0}
                                  step={100}
                                  value={termsFood || ""}
                                  onChange={(e) =>
                                    setTermsFood(Math.max(0, Number(e.target.value) || 0))
                                  }
                                />
                              </label>
                              <label>
                                <span>Army</span>
                                <input
                                  type="number"
                                  min={0}
                                  step={50}
                                  value={termsArmy || ""}
                                  onChange={(e) =>
                                    setTermsArmy(Math.max(0, Number(e.target.value) || 0))
                                  }
                                />
                              </label>
                            </fieldset>
                          </div>
                          {termsPanel.action === "PROPOSE_ALLIANCE" ? (
                            <p className={styles.muted}>
                              These terms are not paid now. Whoever breaks the
                              alliance owes this collateral to the harmed ally.
                            </p>
                          ) : (
                            <label style={{ fontSize: "0.85em", marginTop: 4 }}>
                              <span>Peace payer</span>
                              <select
                                value={termsPayer}
                                onChange={(e) => {
                                  setTermsPayer(e.target.value as TreatyPayer);
                                  setTermsTileId("");
                                }}
                              >
                                <option value="SELF">You pay them</option>
                                <option value="TARGET">They pay you</option>
                              </select>
                            </label>
                          )}
                          {termsPanel.action === "PROPOSE_PEACE" &&
                          ((termsPayer === "SELF"
                            ? state.playerEligibleDeedTiles
                            : row.ownedTileIds) ?? []
                          ).length > 0 ? (
                            <label style={{ fontSize: "0.85em", marginTop: 4 }}>
                              <span>Transfer tile</span>
                              <select
                                value={termsTileId}
                                onChange={(e) => setTermsTileId(e.target.value)}
                              >
                                <option value="">-</option>
                                {((termsPayer === "SELF"
                                  ? state.playerEligibleDeedTiles
                                  : row.ownedTileIds) ?? []
                                ).map((tileId: string) => (
                                  <option key={tileId} value={tileId}>
                                    {tileId}
                                  </option>
                                ))}
                              </select>
                            </label>
                          ) : null}
                          <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                            <button
                              type="button"
                              disabled={pendingId !== null}
                              onClick={() => void submitTerms(row)}
                            >
                              {pendingId === `${row.fortressId}:${termsPanel.action}`
                                ? "Sending..."
                                : termsPanel.action === "PROPOSE_ALLIANCE"
                                  ? "Propose alliance"
                                  : "Propose peace"}
                            </button>
                            <button
                              type="button"
                              disabled={pendingId !== null}
                              onClick={() => {
                                closeTermsPanel();
                                void handleAction(row, termsPanel.action);
                              }}
                            >
                              Skip terms
                            </button>
                            <button
                              type="button"
                              disabled={pendingId !== null}
                              onClick={closeTermsPanel}
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : null}
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

          <section className={`${styles.panel} ${styles.tradePanel}`}>
            <div className={styles.panelHeader}>
              <div>
              <span className={styles.eyebrow}>Trading</span>
                <h2>Convoys</h2>
              </div>
              <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                {state.incomingTradeOffers.length > 0 ? (
                  <span style={{
                    background: '#48f', color: '#fff', fontSize: '0.65rem',
                    fontWeight: 700, padding: '1px 6px', borderRadius: '8px',
                  }}>
                    {state.incomingTradeOffers.length} offer{state.incomingTradeOffers.length > 1 ? 's' : ''}
                  </span>
                ) : null}
                <strong>{state.activeConvoyLegs.length}</strong>
              </div>
            </div>
            <form className={styles.tradeForm} onSubmit={(event) => void submitOffer(event)}>
              <select
                value={tradeTargetId}
                onChange={(event) => setTradeTargetId(event.target.value)}
                disabled={tradeTargets.length === 0 || pendingId !== null}
                aria-label="Trade partner"
              >
                {tradeTargets.length === 0 ? (
                  <option value="">No eligible partners</option>
                ) : (
                  tradeTargets.map((row) => (
                    <option key={row.fortressId} value={row.fortressId}>
                      {row.name}
                    </option>
                  ))
                )}
              </select>
              <div className={styles.tradeColumns}>
                <fieldset>
                  <legend>You send</legend>
                  {(["Gold", "Food", "Army", "Points"] as const).map((kind) => {
                    const key = `offered${kind}` as keyof typeof tradeCargo;

                    return (
                      <label key={key}>
                        <span>{kind}</span>
                        <input
                          type="number"
                          min={0}
                          step={1}
                          value={tradeCargo[key]}
                          onChange={(event) => setCargoValue(key, event.target.value)}
                        />
                      </label>
                    );
                  })}
                </fieldset>
                <fieldset>
                  <legend>You receive</legend>
                  {(["Gold", "Food", "Army", "Points"] as const).map((kind) => {
                    const key = `requested${kind}` as keyof typeof tradeCargo;

                    return (
                      <label key={key}>
                        <span>{kind}</span>
                        <input
                          type="number"
                          min={0}
                          step={1}
                          value={tradeCargo[key]}
                          onChange={(event) => setCargoValue(key, event.target.value)}
                        />
                      </label>
                    );
                  })}
                </fieldset>
              </div>
              {(() => {
                const selectedRow = tradeTargetId
                  ? state.rows.find((r) => r.fortressId === tradeTargetId)
                  : null;
                const partnerTiles = selectedRow?.eligibleDeedTiles ?? [];
                const playerTiles = state.playerEligibleDeedTiles ?? [];

                const hasDeeds = partnerTiles.length > 0 || playerTiles.length > 0;

                return hasDeeds ? (
                  <details style={{ marginTop: '0.5rem', fontSize: '0.85em' }}>
                    <summary>Tile deed ({playerTiles.length} yours / {partnerTiles.length} from ally)</summary>
                    {playerTiles.length > 0 ? (
                      <label>
                        <span>You send tile to them</span>
                        <select
                          value={tradeCargo.offeredTileId}
                          onChange={(e) => setTileValue('offeredTileId', e.target.value)}
                        >
                          <option value="">—</option>
                          {playerTiles.map((tileId: string) => (
                            <option key={tileId} value={tileId}>
                              {tileId}
                            </option>
                          ))}
                        </select>
                      </label>
                    ) : (
                      <p style={{ fontSize: '0.8em', opacity: 0.6 }}>No eligible tiles you can send to this ally.</p>
                    )}
                    {partnerTiles.length > 0 ? (
                      <label>
                        <span>They request tile from you</span>
                        <select
                          value={tradeCargo.requestedTileId}
                          onChange={(e) => setTileValue('requestedTileId', e.target.value)}
                        >
                          <option value="">—</option>
                          {partnerTiles.map((tileId: string) => (
                            <option key={tileId} value={tileId}>
                              {tileId}
                            </option>
                          ))}
                        </select>
                      </label>
                    ) : null}
                  </details>
                ) : null;
              })()}
              <button type="submit" disabled={!tradeTargetId || pendingId !== null}>
                {pendingId === "trade:create" ? "Sending..." : "Send offer"}
              </button>
            </form>

            <div className={styles.tradeSection}>
              <h3>Incoming</h3>
              {state.incomingTradeOffers.length === 0 ? (
                <p className={styles.muted}>No pending incoming offers.</p>
              ) : (
                state.incomingTradeOffers.map((offer) => (
                  <article key={offer.id} className={styles.tradeCard}>
                    <strong>{offer.counterpartName}</strong>
                    <p>
                      Receive {formatCargo(offer.lineItems, offer.senderFortressId)}
                      {" / Send "}
                      {formatCargo(offer.lineItems, offer.receiverFortressId)}
                    </p>
                    <div className={styles.actions}>
                      <button
                        type="button"
                        disabled={pendingId !== null}
                        onClick={() => void handleTradeOffer(offer.id, "accept")}
                      >
                        Accept
                      </button>
                      <button
                        type="button"
                        disabled={pendingId !== null}
                        onClick={() => void handleTradeOffer(offer.id, "reject")}
                      >
                        Reject
                      </button>
                    </div>
                  </article>
                ))
              )}
            </div>

            <div className={styles.tradeSection}>
              <h3>Outgoing</h3>
              {state.outgoingTradeOffers.length === 0 ? (
                <p className={styles.muted}>No pending outgoing offers.</p>
              ) : (
                state.outgoingTradeOffers.map((offer) => (
                  <article key={offer.id} className={styles.tradeCard}>
                    <strong>{offer.counterpartName}</strong>
                    <p>
                      Send {formatCargo(offer.lineItems, offer.senderFortressId)}
                      {" / Receive "}
                      {formatCargo(offer.lineItems, offer.receiverFortressId)}
                    </p>
                    <div className={styles.actions}>
                      <button
                        type="button"
                        disabled={pendingId !== null}
                        onClick={() => void handleTradeOffer(offer.id, "cancel")}
                      >
                        Cancel
                      </button>
                    </div>
                  </article>
                ))
              )}
            </div>

            <div className={styles.tradeSection}>
              <h3>In Transit</h3>
              {state.activeConvoyLegs.length === 0 ? (
                <p className={styles.muted}>No active convoy legs.</p>
              ) : (
                state.activeConvoyLegs.map((leg) => (
                  <article key={leg.id} className={styles.tradeCard}>
                    <strong>
                      {leg.raidedByCurrentPlayer
                        ? "Observed route: "
                        : leg.outgoing
                          ? "To "
                          : "From "}
                      {leg.counterpartName}
                    </strong>
                    <p>{formatLegCargo(leg)}</p>
                    {leg.encounterSucceeded === false ? (
                      <p className={styles.muted}>
                        {leg.raidedByCurrentPlayer
                          ? "Interception failed; the convoy continues."
                          : "This convoy survived a raid attempt."}
                      </p>
                    ) : null}
                    <time>{leg.arrivesAt.toLocaleString()}</time>
                    {leg.outgoing && (leg.canEscort || leg.activeEscortOrderId) ? (
                      <div className={styles.orderControl}>
                        {leg.activeEscortOrderId ? (
                          <>
                            <span>
                              Escort: {leg.activeEscortArmy?.toLocaleString()} army
                            </span>
                            <button
                              type="button"
                              disabled={pendingId !== null}
                              onClick={() =>
                                void handleOrder(`recall:${leg.activeEscortOrderId}`, () =>
                                  recallArmyOrderAction(leg.activeEscortOrderId!)
                                )
                              }
                            >
                              Recall escort
                            </button>
                          </>
                        ) : (
                          <>
                            <input
                              type="number"
                              min={1}
                              step={1}
                              value={orderArmy}
                              onChange={(event) =>
                                setOrderArmy(
                                  Math.max(1, Number.parseInt(event.target.value || "1", 10))
                                )
                              }
                              aria-label="Army for escort order"
                            />
                            <button
                              type="button"
                              disabled={pendingId !== null}
                              onClick={() =>
                                void handleOrder(`escort:${leg.id}`, () =>
                                  createEscortOrderAction(leg.id, orderArmy)
                                )
                              }
                            >
                              Escort
                            </button>
                          </>
                        )}
                      </div>
                    ) : null}
                  </article>
                ))
              )}
            </div>

            {state.recentConvoyLegs.length > 0 ? (
              <div className={styles.tradeSection}>
                <h3>Results</h3>
                {state.recentConvoyLegs.map((leg) => (
                  <article key={leg.id} className={styles.tradeCard}>
                    <strong>
                      {leg.status === "SEIZED"
                        ? "Seized"
                        : leg.status === "INTERCEPTED"
                          ? leg.raidedByCurrentPlayer
                            ? "Intercepted"
                            : "Lost to raid"
                          : leg.encounterSucceeded === false
                            ? "Survived raid"
                            : "Delivered"}:
                      {" "}
                      {leg.counterpartName}
                    </strong>
                    <p>
                      {leg.status === "INTERCEPTED" && leg.raidedByCurrentPlayer
                        ? `${leg.stolenGold.toLocaleString()} gold, ${leg.stolenFood.toLocaleString()} food, ${leg.stolenArmy.toLocaleString()} army, ${leg.stolenPoints.toLocaleString()} points stolen`
                        : formatLegCargo(leg)}
                      {leg.bonusGold + leg.bonusFood > 0
                        ? ` + ${leg.bonusGold.toLocaleString()} gold / ${leg.bonusFood.toLocaleString()} food alliance bonus`
                        : ""}
                    </p>
                  </article>
                ))}
              </div>
            ) : null}

            {state.recentCovertIncidents.length > 0 ? (
              <div className={styles.tradeSection}>
                <h3>Detected Incidents</h3>
                {state.recentCovertIncidents.map((incident) => (
                  <article key={incident.id} className={styles.tradeCard}>
                    <strong>
                      {incident.detectedByCurrentPlayer
                        ? `Raid detected: ${incident.raiderName}`
                        : `Raid exposed by ${incident.detectorName}`}
                    </strong>
                    <p>
                      {incident.detectedByCurrentPlayer &&
                      incident.casusBelliExpiresAt
                        ? `Casus belli available until ${incident.casusBelliExpiresAt.toLocaleString()}.`
                        : `Detected ${incident.detectedAt.toLocaleString()}.`}
                    </p>
                  </article>
                ))}
              </div>
            ) : null}
          </section>
        </div>
      </div>
    </main>
  );
}
