"use client";

import { useState, type FormEvent } from "react";
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
  rejectPeaceAction,
  rejectTradeOfferAction,
  recallArmyOrderAction,
} from "@/app/game-actions";
import type { PoliticsPageState } from "@/lib/game/politics-read-model";
import styles from "./page.module.css";

type PoliticsRow = PoliticsPageState["rows"][number];
type PoliticsAction = PoliticsRow["availableActions"][number];
type TreatyPayer = "SELF" | "TARGET";
type ActiveTradeDirection =
  PoliticsPageState["activeTradeOffers"][number]["directions"][number];

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
    case "REJECT_PEACE":
      return "Reject peace";
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

function formatTermsOrNone(input: Parameters<typeof formatTerms>[0]) {
  return formatTerms(input) || "no resources";
}

function estimateTradeRuns({
  gold,
  food,
  army,
  points,
  nukeFuel,
  nukeRocket,
  nukeWrathOfA,
  tileId,
  wagonResourceLimit,
}: {
  gold: number;
  food: number;
  army: number;
  points: number;
  nukeFuel: number;
  nukeRocket: number;
  nukeWrathOfA: number;
  tileId: string;
  wagonResourceLimit: number;
}) {
  const resourceRuns =
    gold + food > 0
      ? Math.ceil((gold + food) / Math.max(1, wagonResourceLimit))
      : 0;
  const hasNonResourceCargo =
    army > 0 ||
    points > 0 ||
    nukeFuel > 0 ||
    nukeRocket > 0 ||
    nukeWrathOfA > 0 ||
    tileId.length > 0;

  return Math.max(resourceRuns, hasNonResourceCargo ? 1 : 0);
}

export function PoliticsClient({ state }: { state: PoliticsPageState }) {
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [renderedAt] = useState(() => Date.now());
  const tradeTargets = state.rows.filter((row) => row.canTrade);
  const [tradeTargetId, setTradeTargetId] = useState(
    tradeTargets[0]?.fortressId ?? ""
  );
  const [tradeCargo, setTradeCargo] = useState({
    offeredGold: 0,
    offeredFood: 0,
    offeredArmy: 0,
    offeredPoints: 0,
    offeredNukeFuel: 0,
    offeredNukeRocket: 0,
    offeredNukeWrathOfA: 0,
    requestedGold: 0,
    requestedFood: 0,
    requestedArmy: 0,
    requestedPoints: 0,
    requestedNukeFuel: 0,
    requestedNukeRocket: 0,
    requestedNukeWrathOfA: 0,
    offeredTileId: "",
    requestedTileId: "",
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
  const selectedTradeTarget = tradeTargetId
    ? state.rows.find((row) => row.fortressId === tradeTargetId) ?? null
    : null;
  const offeredRunCount = estimateTradeRuns({
    gold: tradeCargo.offeredGold,
    food: tradeCargo.offeredFood,
    army: tradeCargo.offeredArmy,
    points: tradeCargo.offeredPoints,
    nukeFuel: tradeCargo.offeredNukeFuel,
    nukeRocket: tradeCargo.offeredNukeRocket,
    nukeWrathOfA: tradeCargo.offeredNukeWrathOfA,
    tileId: tradeCargo.offeredTileId,
    wagonResourceLimit: state.playerFortress?.tradeWagonResourceLimit ?? 1,
  });
  const requestedRunCount = selectedTradeTarget
    ? estimateTradeRuns({
        gold: tradeCargo.requestedGold,
        food: tradeCargo.requestedFood,
        army: tradeCargo.requestedArmy,
        points: tradeCargo.requestedPoints,
        nukeFuel: tradeCargo.requestedNukeFuel,
        nukeRocket: tradeCargo.requestedNukeRocket,
        nukeWrathOfA: tradeCargo.requestedNukeWrathOfA,
        tileId: tradeCargo.requestedTileId,
        wagonResourceLimit: selectedTradeTarget.tradeWagonResourceLimit,
      })
    : 0;

  const liveTermsSummary = formatTermsOrNone({
    gold: termsGold,
    food: termsFood,
    army: termsArmy,
    tileId: termsTileId || null,
  });

  function openTermsPanel(
    row: PoliticsRow,
    action: "PROPOSE_ALLIANCE" | "PROPOSE_PEACE"
  ) {
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
        case "REJECT_PEACE":
          result = await rejectPeaceAction(row.fortressId);
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
        offeredNukeFuel: tradeCargo.offeredNukeFuel,
        offeredNukeRocket: tradeCargo.offeredNukeRocket,
        offeredNukeWrathOfA: tradeCargo.offeredNukeWrathOfA,
        requestedGold: tradeCargo.requestedGold,
        requestedFood: tradeCargo.requestedFood,
        requestedArmy: tradeCargo.requestedArmy,
        requestedPoints: tradeCargo.requestedPoints,
        requestedNukeFuel: tradeCargo.requestedNukeFuel,
        requestedNukeRocket: tradeCargo.requestedNukeRocket,
        requestedNukeWrathOfA: tradeCargo.requestedNukeWrathOfA,
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
          offeredNukeFuel: 0,
          offeredNukeRocket: 0,
          offeredNukeWrathOfA: 0,
          requestedGold: 0,
          requestedFood: 0,
          requestedArmy: 0,
          requestedPoints: 0,
          requestedNukeFuel: 0,
          requestedNukeRocket: 0,
          requestedNukeWrathOfA: 0,
          offeredTileId: "",
          requestedTileId: "",
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
      nukeComponentKind?: string | null;
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
      .map((item) =>
        item.kind === "NUKE_COMPONENT" && item.nukeComponentKind
          ? `${item.amount!.toLocaleString()} ${item.nukeComponentKind.toLowerCase().replaceAll("_", " ")}`
          : `${item.amount!.toLocaleString()} ${item.kind.toLowerCase()}`
      );

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

  function formatTradeCargoTotals(
    cargo: {
      gold: number;
      food: number;
      army: number;
      points: number;
      nukeFuel: number;
      nukeRocket: number;
      nukeWrathOfA: number;
    },
    deedTileIds: string[] = []
  ) {
    const items = [
      cargo.gold > 0 ? `${cargo.gold.toLocaleString()} gold` : null,
      cargo.food > 0 ? `${cargo.food.toLocaleString()} food` : null,
      cargo.army > 0 ? `${cargo.army.toLocaleString()} army` : null,
      cargo.points > 0 ? `${cargo.points.toLocaleString()} points` : null,
      cargo.nukeFuel > 0 ? `${cargo.nukeFuel.toLocaleString()} fuel` : null,
      cargo.nukeRocket > 0
        ? `${cargo.nukeRocket.toLocaleString()} rocket`
        : null,
      cargo.nukeWrathOfA > 0
        ? `${cargo.nukeWrathOfA.toLocaleString()} wrath`
        : null,
      ...deedTileIds.map((tileId) => `Tile ${tileId}`),
    ].filter(Boolean);

    return items.join(", ") || "nothing";
  }

  function formatTradeProgress(direction: ActiveTradeDirection) {
    const lines = [
      direction.total.gold > 0
        ? `Gold ${direction.delivered.gold.toLocaleString()} / ${direction.total.gold.toLocaleString()} delivered`
        : null,
      direction.total.food > 0
        ? `Food ${direction.delivered.food.toLocaleString()} / ${direction.total.food.toLocaleString()} delivered`
        : null,
      direction.total.army > 0
        ? `Army ${direction.delivered.army.toLocaleString()} / ${direction.total.army.toLocaleString()} delivered`
        : null,
      direction.total.points > 0
        ? `Points ${direction.delivered.points.toLocaleString()} / ${direction.total.points.toLocaleString()} delivered`
        : null,
      direction.total.nukeFuel > 0
        ? `Fuel ${direction.delivered.nukeFuel.toLocaleString()} / ${direction.total.nukeFuel.toLocaleString()} delivered`
        : null,
      direction.total.nukeRocket > 0
        ? `Rocket ${direction.delivered.nukeRocket.toLocaleString()} / ${direction.total.nukeRocket.toLocaleString()} delivered`
        : null,
      direction.total.nukeWrathOfA > 0
        ? `Wrath ${direction.delivered.nukeWrathOfA.toLocaleString()} / ${direction.total.nukeWrathOfA.toLocaleString()} delivered`
        : null,
      direction.totalDeedTileIds.length > 0
        ? `Deeds ${direction.deliveredDeedTileIds.length.toLocaleString()} / ${direction.totalDeedTileIds.length.toLocaleString()} delivered`
        : null,
    ].filter(Boolean);

    return lines.join("; ") || "No cargo";
  }

  function formatTradeDirectionDetail(direction: ActiveTradeDirection) {
    const parts = [
      `runs ${direction.settledRunCount.toLocaleString()} settled / ${direction.activeRunCount.toLocaleString()} active / ${direction.queuedRunCount.toLocaleString()} queued`,
    ];
    const inTransit = formatTradeCargoTotals(direction.inTransit);
    const queued = formatTradeCargoTotals(
      direction.queued,
      direction.queuedDeedTileIds
    );
    const lost = formatTradeCargoTotals(
      direction.lost,
      direction.lostDeedTileIds
    );

    if (inTransit !== "nothing") {
      parts.push(`in transit: ${inTransit}`);
    }

    if (queued !== "nothing") {
      parts.push(`queued: ${queued}`);
    }

    if (lost !== "nothing") {
      parts.push(`lost/seized: ${lost}`);
    }

    return parts.join("; ");
  }

  function isTradeDirectionFulfilled(direction: ActiveTradeDirection) {
    return direction.activeRunCount === 0 && direction.queuedRunCount === 0;
  }

  function formatLegCargo(leg: PoliticsPageState["activeConvoyLegs"][number]) {
    const items = [
      leg.deedTileId ? `Tile ${leg.deedTileId}` : null,
      leg.gold > 0 ? `${leg.gold.toLocaleString()} gold` : null,
      leg.food > 0 ? `${leg.food.toLocaleString()} food` : null,
      leg.army > 0 ? `${leg.army.toLocaleString()} army` : null,
      leg.points > 0 ? `${leg.points.toLocaleString()} points` : null,
      leg.nukeFuel > 0 ? `${leg.nukeFuel.toLocaleString()} fuel` : null,
      leg.nukeRocket > 0 ? `${leg.nukeRocket.toLocaleString()} rocket` : null,
      leg.nukeWrathOfA > 0 ? `${leg.nukeWrathOfA.toLocaleString()} wrath` : null,
    ].filter(Boolean);

    if (leg.deedFailureReason) {
      items.push(`(deed: ${leg.deedFailureReason})`);
    }

    return items.join(", ") || "empty";
  }

  function formatConvoyTiming(
    leg: PoliticsPageState["activeConvoyLegs"][number]
  ) {
    if (leg.arrivedAwaitingTick) {
      return "Arrived, awaiting next tick";
    }

    const seconds = Math.ceil((leg.arrivesAt.getTime() - renderedAt) / 1000);

    if (seconds <= 0) {
      return "Arrived, awaiting next tick";
    }

    if (seconds >= 3600) {
      return `Arrives in ${Math.ceil(seconds / 3600)}h`;
    }

    return `Arrives in ${Math.max(1, Math.ceil(seconds / 60))}m`;
  }

  function formatEta(date: Date | null, fallback = "Unknown") {
    if (!date) {
      return fallback;
    }

    const seconds = Math.ceil((date.getTime() - renderedAt) / 1000);

    if (seconds <= 0) {
      return "Arrived, awaiting tick";
    }

    if (seconds >= 3600) {
      return `~${Math.ceil(seconds / 3600)}h`;
    }

    return `~${Math.max(1, Math.ceil(seconds / 60))}m`;
  }

  return (
    <section className={styles.commandSurface} aria-label="Politics and trade">
      <header className={styles.commandHeader}>
        <div>
          <span className={styles.eyebrow}>Season 4 diplomacy</span>
          <h2>Politics & Trade</h2>
        </div>
        <dl className={styles.commandMetrics}>
          <div>
            <dt>Relations</dt>
            <dd>{state.rows.length}</dd>
          </div>
          <div>
            <dt>Offers</dt>
            <dd>
              {state.incomingTradeOffers.length +
                state.outgoingTradeOffers.length}
            </dd>
          </div>
          <div>
            <dt>Convoys</dt>
            <dd>{state.activeConvoyLegs.length}</dd>
          </div>
        </dl>
      </header>

      <div className={styles.commandGrid}>
        <section className={`${styles.panel} ${styles.relationPanel}`}>
          <div className={styles.panelHeader}>
            <div>
              <span className={styles.eyebrow}>Relations</span>
              <h3>War and peace</h3>
            </div>
            <strong>{state.playerFortress?.name ?? "No fortress"}</strong>
          </div>

          <div className={styles.relationTable}>
            <div className={styles.relationHead} aria-hidden="true">
              <span>Fortress</span>
              <span>Status</span>
              <span>Intel</span>
              <span>Orders</span>
            </div>
            {state.rows.length > 0 ? (
              state.rows.map((row) => {
                const timingLabel = getTimingLabel(row);
                const hasAllianceOffer =
                  row.effectiveStatus === "ALLIANCE_PENDING" &&
                  (row.allianceOfferGold > 0 ||
                    row.allianceOfferFood > 0 ||
                    row.allianceOfferArmy > 0 ||
                    row.allianceOfferTileId);
                const hasPeaceTerms =
                  row.effectiveStatus === "PEACE_PENDING" &&
                  (row.peaceReparationGold > 0 ||
                    row.peaceReparationFood > 0 ||
                    row.peaceReparationArmy > 0 ||
                    row.peaceReparationTileId);
                const peaceLocked =
                  row.peaceLockedUntil &&
                  new Date(row.peaceLockedUntil).getTime() > renderedAt;

                return (
                  <article key={row.fortressId} className={styles.relationRow}>
                    <div className={styles.relationIdentity}>
                      <strong>{row.commanderName || row.name}</strong>
                      <span>{row.name}</span>
                      <small>{row.race ?? "Race unknown"}</small>
                    </div>

                    <div className={styles.relationStatus}>
                      <span
                        className={styles.relationChip}
                        data-status={row.effectiveStatus.toLowerCase()}
                      >
                        {getStatusLabel(row.effectiveStatus)}
                      </span>
                      {timingLabel ? (
                        <p className={styles.timing}>{timingLabel}</p>
                      ) : null}
                    </div>

                    <div className={styles.relationIntel}>
                      {row.effectiveStatus === "ALLIED" ? (
                        <p>
                          Escrow each:{" "}
                          {row.allianceEscrowGoldEach.toLocaleString()} gold +{" "}
                          {row.allianceEscrowFoodEach.toLocaleString()} food
                        </p>
                      ) : null}
                      {row.effectiveStatus === "ALLIED" &&
                      row.trustUpgradeTier ? (
                        <p className={styles.treatyNote}>
                          Trust upgrade requested: tier {row.trustUpgradeTier}
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
                      {hasAllianceOffer ? (
                        <p className={styles.offerNote}>
                          Offer:{" "}
                          {[
                            row.allianceOfferGold > 0
                              ? `${row.allianceOfferGold.toLocaleString()} gold`
                              : null,
                            row.allianceOfferFood > 0
                              ? `${row.allianceOfferFood.toLocaleString()} food`
                              : null,
                            row.allianceOfferArmy > 0
                              ? `${row.allianceOfferArmy.toLocaleString()} army`
                              : null,
                            row.allianceOfferTileId
                              ? `tile ${row.allianceOfferTileId}`
                              : null,
                          ]
                            .filter(Boolean)
                            .join(", ")}{" "}
                          (
                          {row.allianceOfferDirection === "B_TO_A"
                            ? "they pay you"
                            : "you pay them"}
                          )
                        </p>
                      ) : null}
                      {hasPeaceTerms ? (
                        <p className={styles.peaceNote}>
                          Peace terms:{" "}
                          {row.peaceReparationFromCurrentPlayer
                            ? "you pay "
                            : "they pay "}
                          {formatTermsOrNone({
                            gold: row.peaceReparationGold,
                            food: row.peaceReparationFood,
                            army: row.peaceReparationArmy,
                            tileId: row.peaceReparationTileId,
                          })}
                        </p>
                      ) : null}
                      {peaceLocked ? (
                        <p className={styles.lockNote}>
                          Unbreakable peace:{" "}
                          {Math.ceil(
                            (new Date(row.peaceLockedUntil!).getTime() -
                              renderedAt) /
                              3600000
                          )}
                          h remaining
                        </p>
                      ) : null}
                      {!timingLabel &&
                      row.effectiveStatus !== "ALLIED" &&
                      !hasAllianceOffer &&
                      !hasPeaceTerms &&
                      !peaceLocked ? (
                        <p className={styles.muted}>No active treaty terms.</p>
                      ) : null}
                      {row.disabledReason ? (
                        <p className={styles.muted}>{row.disabledReason}</p>
                      ) : null}
                    </div>

                    <div className={styles.actions}>
                      {row.availableActions.length > 0 ? (
                        row.availableActions.map((action) => {
                          const key = `${row.fortressId}:${action}`;
                          const actionLabel =
                            action === "PROPOSE_PEACE" &&
                            row.effectiveStatus === "PEACE_PENDING"
                              ? "Counter offer"
                              : getActionLabel(action);
                          const isTermsAction =
                            action === "PROPOSE_ALLIANCE" ||
                            action === "PROPOSE_PEACE";
                          const acceptanceCost =
                            action === "ACCEPT_ALLIANCE"
                              ? `Escrow due now: ${row.allianceEscrowGoldEach.toLocaleString()} gold + ${row.allianceEscrowFoodEach.toLocaleString()} food each${
                                  row.collateralGold > 0 ||
                                  row.collateralFood > 0 ||
                                  row.collateralArmy > 0
                                    ? `; break collateral ${formatTermsOrNone({
                                        gold: row.collateralGold,
                                        food: row.collateralFood,
                                        army: row.collateralArmy,
                                      })}`
                                    : ""
                                }`
                              : action === "ACCEPT_TRUST_UPGRADE" &&
                                  row.trustUpgradeTier
                                ? `Escrow due after accept: ${(row.trustUpgradeEscrowGoldEach ?? 0).toLocaleString()} gold + ${(row.trustUpgradeEscrowFoodEach ?? 0).toLocaleString()} food each`
                                : action === "ACCEPT_PEACE"
                                  ? `Due on accept: ${
                                      row.peaceReparationFromCurrentPlayer
                                        ? "you pay "
                                        : "they pay "
                                    }${formatTermsOrNone({
                                      gold: row.peaceReparationGold,
                                      food: row.peaceReparationFood,
                                      army: row.peaceReparationArmy,
                                      tileId: row.peaceReparationTileId,
                                    })}`
                                  : null;

                          return (
                            <div key={action} className={styles.actionStack}>
                              <button
                                type="button"
                                data-danger={
                                  action === "BETRAY_ALLIANCE" || undefined
                                }
                                disabled={pendingId !== null}
                                onClick={() => {
                                  if (isTermsAction) {
                                    openTermsPanel(
                                      row,
                                      action as
                                        | "PROPOSE_ALLIANCE"
                                        | "PROPOSE_PEACE"
                                    );
                                  } else {
                                    void handleAction(row, action);
                                  }
                                }}
                              >
                                {pendingId === key
                                  ? "Sending..."
                                  : actionLabel}
                              </button>
                              {acceptanceCost ? (
                                <small className={styles.actionCost}>
                                  {acceptanceCost}
                                </small>
                              ) : null}
                            </div>
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

                    {termsPanel && termsPanel.rowId === row.fortressId ? (
                      <div className={styles.termsForm}>
                        <p className={styles.termsLabel}>
                          {termsPanel.action === "PROPOSE_ALLIANCE"
                            ? "Alliance break collateral"
                            : "Peace reparation"}
                        </p>
                        <p className={styles.treatyNote}>
                          {termsPanel.action === "PROPOSE_ALLIANCE"
                            ? `Whoever betrays owes: ${liveTermsSummary}`
                            : `${
                                termsPayer === "SELF"
                                  ? "You pay on acceptance"
                                  : "They pay on acceptance"
                              }: ${liveTermsSummary}`}
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
                                  setTermsGold(
                                    Math.max(0, Number(e.target.value) || 0)
                                  )
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
                                  setTermsFood(
                                    Math.max(0, Number(e.target.value) || 0)
                                  )
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
                                  setTermsArmy(
                                    Math.max(0, Number(e.target.value) || 0)
                                  )
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
                          <label className={styles.formLabel}>
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
                        (
                          (termsPayer === "SELF"
                            ? state.playerEligibleDeedTiles
                            : row.ownedTileIds) ?? []
                        ).length > 0 ? (
                          <label className={styles.formLabel}>
                            <span>Transfer tile</span>
                            <select
                              value={termsTileId}
                              onChange={(e) => setTermsTileId(e.target.value)}
                            >
                              <option value="">-</option>
                              {(
                                (termsPayer === "SELF"
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
                        <div className={styles.formActions}>
                          <button
                            type="button"
                            disabled={pendingId !== null}
                            onClick={() => void submitTerms(row)}
                          >
                            {pendingId ===
                            `${row.fortressId}:${termsPanel.action}`
                              ? "Sending..."
                              : termsPanel.action === "PROPOSE_ALLIANCE"
                                ? "Propose alliance"
                                : row.effectiveStatus === "PEACE_PENDING"
                                  ? "Send counter"
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
              <h3>Convoys</h3>
            </div>
            <div className={styles.panelBadges}>
              {state.incomingTradeOffers.length > 0 ? (
                <span className={styles.offerBadge}>
                  {state.incomingTradeOffers.length} offer
                  {state.incomingTradeOffers.length > 1 ? "s" : ""}
                </span>
              ) : null}
              <strong>{state.activeConvoyLegs.length}</strong>
            </div>
          </div>
          <form
            className={styles.tradeForm}
            onSubmit={(event) => void submitOffer(event)}
          >
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
            <p className={styles.muted}>
              Wagon capacity per run: you can send{" "}
              {(state.playerFortress?.tradeWagonResourceLimit ?? 0).toLocaleString()}{" "}
              gold+food
              {state.playerFortress
                ? `; outbound wagons ${state.playerFortress.activeOutboundWagons}/${state.playerFortress.activeTradeWagonLimit}`
                : ""}
              {selectedTradeTarget
                ? `; ${selectedTradeTarget.name} can send ${selectedTradeTarget.tradeWagonResourceLimit.toLocaleString()} gold+food per run and has ${selectedTradeTarget.activeOutboundWagons}/${selectedTradeTarget.activeTradeWagonLimit} outbound wagons active`
                : ""}
              . This offer uses {offeredRunCount.toLocaleString()} outgoing run
              {offeredRunCount === 1 ? "" : "s"}
              {requestedRunCount > 0
                ? ` and requests ${requestedRunCount.toLocaleString()} return run${requestedRunCount === 1 ? "" : "s"}`
                : ""}
              . Army, points, components, and tile deeds ride with the first
              run and do not count against the gold+food cap.
            </p>
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
                        onChange={(event) =>
                          setCargoValue(key, event.target.value)
                        }
                      />
                    </label>
                  );
                })}
                {([
                  ["Nuke fuel", "offeredNukeFuel"],
                  ["Nuke rocket", "offeredNukeRocket"],
                  ["Wrath of A", "offeredNukeWrathOfA"],
                ] as const).map(([label, key]) => (
                  <label key={key}>
                    <span>{label}</span>
                    <input
                      type="number"
                      min={0}
                      step={1}
                      value={tradeCargo[key]}
                      onChange={(event) =>
                        setCargoValue(key, event.target.value)
                      }
                    />
                  </label>
                ))}
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
                        onChange={(event) =>
                          setCargoValue(key, event.target.value)
                        }
                      />
                    </label>
                  );
                })}
                {([
                  ["Nuke fuel", "requestedNukeFuel"],
                  ["Nuke rocket", "requestedNukeRocket"],
                  ["Wrath of A", "requestedNukeWrathOfA"],
                ] as const).map(([label, key]) => (
                  <label key={key}>
                    <span>{label}</span>
                    <input
                      type="number"
                      min={0}
                      step={1}
                      value={tradeCargo[key]}
                      onChange={(event) =>
                        setCargoValue(key, event.target.value)
                      }
                    />
                  </label>
                ))}
              </fieldset>
            </div>
            {(() => {
              const selectedRow = tradeTargetId
                ? state.rows.find((r) => r.fortressId === tradeTargetId)
                : null;
              const partnerTiles = selectedRow?.eligibleDeedTiles ?? [];
              const playerTiles = state.playerEligibleDeedTiles ?? [];

              const hasDeeds =
                partnerTiles.length > 0 || playerTiles.length > 0;

              return hasDeeds ? (
                <details className={styles.deedDetails}>
                  <summary>
                    Tile deed ({playerTiles.length} yours /{" "}
                    {partnerTiles.length} from ally)
                  </summary>
                  {playerTiles.length > 0 ? (
                    <label>
                      <span>You send tile to them</span>
                      <select
                        value={tradeCargo.offeredTileId}
                        onChange={(e) =>
                          setTileValue("offeredTileId", e.target.value)
                        }
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
                    <p className={styles.muted}>
                      No eligible tiles you can send to this ally.
                    </p>
                  )}
                  {partnerTiles.length > 0 ? (
                    <label>
                      <span>They request tile from you</span>
                      <select
                        value={tradeCargo.requestedTileId}
                        onChange={(e) =>
                          setTileValue("requestedTileId", e.target.value)
                        }
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
            <button
              type="submit"
              disabled={!tradeTargetId || pendingId !== null}
            >
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
                    Receive{" "}
                    {formatCargo(offer.lineItems, offer.senderFortressId)}
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
            <h3>Active Trades</h3>
            {state.activeTradeOffers.length === 0 ? (
              <p className={styles.muted}>No accepted trades are being fulfilled.</p>
            ) : (
              state.activeTradeOffers.map((offer) => (
                <article key={offer.id} className={styles.tradeCard}>
                  <strong>{offer.counterpartName}</strong>
                  {offer.directions.map((direction) => {
                    const fulfilled = isTradeDirectionFulfilled(direction);

                    return (
                      <div
                        key={`${offer.id}:${direction.fromFortressId}:${direction.toFortressId}`}
                        className={styles.tradeProgress}
                      >
                        <p>
                          {direction.outgoing ? "You send" : "You receive"}:{" "}
                          {formatTradeProgress(direction)}
                        </p>
                        <p>{formatTradeDirectionDetail(direction)}</p>
                        <time>
                          {direction.nextArrivalAt
                            ? `Next arrival: ${formatEta(direction.nextArrivalAt)}; `
                            : fulfilled
                              ? "No wagons still moving; "
                              : "Next arrival: waiting for wagon slot; "}
                          estimated fulfillment:{" "}
                          {formatEta(
                            direction.estimatedFulfillmentAt,
                            fulfilled ? "Fulfilled" : "Pending"
                          )}
                        </time>
                      </div>
                    );
                  })}
                  <time>
                    Whole trade estimated fulfillment:{" "}
                    {formatEta(
                      offer.estimatedFulfillmentAt,
                      offer.directions.every(isTradeDirectionFulfilled)
                        ? "Fulfilled"
                        : "Pending"
                    )}
                  </time>
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
                  <time>
                    {formatConvoyTiming(leg)} - {leg.arrivesAt.toLocaleString()}
                  </time>
                  {leg.outgoing &&
                  (leg.canEscort || leg.activeEscortOrderId) ? (
                    <div className={styles.orderControl}>
                      {leg.activeEscortOrderId ? (
                        <>
                          <span>
                            Escort: {leg.activeEscortArmy?.toLocaleString()}{" "}
                            army
                          </span>
                          <button
                            type="button"
                            disabled={pendingId !== null}
                            onClick={() =>
                              void handleOrder(
                                `recall:${leg.activeEscortOrderId}`,
                                () =>
                                  recallArmyOrderAction(
                                    leg.activeEscortOrderId!
                                  )
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
                                Math.max(
                                  1,
                                  Number.parseInt(event.target.value || "1", 10)
                                )
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

          {state.tradeLog.length > 0 ? (
            <div className={styles.tradeSection}>
              <h3>Trade Log</h3>
              {state.tradeLog.map((entry) => (
                <article key={entry.id} className={styles.tradeCard}>
                  <strong>{entry.title}</strong>
                  <p>
                    {entry.detail}
                    {" - "}
                    <span>{entry.profitLabel}</span>
                  </p>
                  <time>{entry.timestamp.toLocaleString()}</time>
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
    </section>
  );
}
