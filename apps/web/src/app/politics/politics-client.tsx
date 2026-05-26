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
  createRaidOrderAction,
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
    requestedGold: 0,
    requestedFood: 0,
    requestedArmy: 0,
    offeredTileId: '',
    requestedTileId: '',
  });
  const [orderArmy, setOrderArmy] = useState(100);

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
        requestedGold: tradeCargo.requestedGold,
        requestedFood: tradeCargo.requestedFood,
        requestedArmy: tradeCargo.requestedArmy,
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
          requestedGold: 0,
          requestedFood: 0,
          requestedArmy: 0,
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
                      {row.canRaid || row.activeRaidOrderId ? (
                        <div className={styles.orderControl}>
                          {row.activeRaidOrderId ? (
                            <>
                              <span>
                                Raid watching routes: {row.activeRaidArmy?.toLocaleString()} army
                              </span>
                              <button
                                type="button"
                                disabled={pendingId !== null}
                                onClick={() =>
                                  void handleOrder(`recall:${row.activeRaidOrderId}`, () =>
                                    recallArmyOrderAction(row.activeRaidOrderId!)
                                  )
                                }
                              >
                                Recall raid
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
                                aria-label="Army for raid order"
                              />
                              <button
                                type="button"
                                disabled={pendingId !== null}
                                onClick={() =>
                                  void handleOrder(`raid:${row.fortressId}`, () =>
                                    createRaidOrderAction(row.fortressId, orderArmy)
                                  )
                                }
                              >
                                Raid routes
                              </button>
                            </>
                          )}
                        </div>
                      ) : row.raidDisabledReason ? (
                        <p className={styles.muted}>{row.raidDisabledReason}</p>
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
                  {(["Gold", "Food", "Army"] as const).map((kind) => {
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
                  {(["Gold", "Food", "Army"] as const).map((kind) => {
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
                const eligibleTiles = selectedRow?.eligibleDeedTiles ?? [];

                return eligibleTiles.length > 0 ? (
                  <details style={{ marginTop: '0.5rem', fontSize: '0.85em' }}>
                    <summary>Tile deed ({eligibleTiles.length} eligible)</summary>
                    <label>
                      <span>You send tile to them</span>
                      <select
                        value={tradeCargo.offeredTileId}
                        onChange={(e) => setTileValue('offeredTileId', e.target.value)}
                      >
                        <option value="">—</option>
                        {eligibleTiles.map((tileId: string) => (
                          <option key={tileId} value={tileId}>
                            {tileId}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      <span>They send tile to you</span>
                      <select
                        value={tradeCargo.requestedTileId}
                        onChange={(e) => setTileValue('requestedTileId', e.target.value)}
                        disabled
                      >
                        <option value="">—</option>
                      </select>
                      <p style={{ margin: '2px 0 0', opacity: 0.5 }}>
                        Receiving a tile requires your ally to create the offer.
                      </p>
                    </label>
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

            {state.activeArmyOrders.some((order) => order.type === "RAID") ? (
              <div className={styles.tradeSection}>
                <h3>Raid Patrols</h3>
                {state.activeArmyOrders
                  .filter((order) => order.type === "RAID")
                  .map((order) => (
                    <article key={order.id} className={styles.tradeCard}>
                      <strong>Watching {order.targetName}</strong>
                      <p>{order.committedArmy.toLocaleString()} committed army</p>
                    </article>
                  ))}
              </div>
            ) : null}

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
                        ? `${leg.stolenGold.toLocaleString()} gold, ${leg.stolenFood.toLocaleString()} food, ${leg.stolenArmy.toLocaleString()} army stolen`
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
