"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import {
  attackFromMapAction,
  editRegistrationFortressNameAction,
  markChatReadAction,
  purchaseFortressUpgradeAction,
  registerCommanderNameAction,
  renameFortressAction,
  setFortressActionAction,
  shuffleFortressLocationAction,
} from "@/app/game-actions";
import { ChatPanel } from "./chat-panel";
import {
  FortressMap,
  type AttackUnitMarker,
  type MapFortress,
} from "./fortress-map";
import styles from "./battlefield-experience.module.css";

type CommandTarget = {
  id: string;
  commanderName: string;
  name: string;
  points: number;
  isNpc: boolean;
  health: number;
  maxHealth: number;
  currentAction: "GROW" | "ATTACK";
};

type ChatProps = {
  messages: Array<{
    id: string;
    body: string;
    createdAt: Date;
    authorName: string;
    isCurrentUser: boolean;
  }>;
  canPost: boolean;
  maxLength: number;
  postHint: string | null;
  unreadCount: number;
  hasUnread: boolean;
  latestMessageAt: Date | null;
  persistsUnread: boolean;
};

type PlayerSummary = {
  id: string;
  commanderName: string;
  canRegisterCommanderName: boolean;
  name: string;
  points: number;
  level: number;
  currentAction: "GROW" | "ATTACK";
  currentTargetId?: string | null;
  currentTargetName?: string | null;
  isCrowned?: boolean;
  canRename: boolean;
  canSetAction: boolean;
  locationShuffleCost: number | null;
  freeLocationShuffleAvailable: boolean;
  hasOutgoingAttackUnits: boolean;
  canShuffleLocation: boolean;
  upgradesUnlocked: boolean;
  nextUpgradeCost: number | null;
  canAffordUpgrade: boolean;
  canPurchaseUpgrade: boolean;
  receivedSlayerUpgrade: boolean;
  growPerTick: number;
  attackDamage: number;
};

type PlayerFortress = {
  id: string;
  commanderName: string;
  canRegisterCommanderName: boolean;
  name: string;
  points: number;
  level: number;
  currentAction: "GROW" | "ATTACK";
  mapX: number;
  mapY: number;
};

export function BattlefieldExperience({
  title,
  description,
  phaseStatus,
  playerSummary,
  playerFortress,
  mapFortresses,
  attackUnits,
  targets,
  chat,
  canEditRegistrationName,
  immersive = false,
}: {
  title: string;
  description: string;
  phaseStatus?: "REGISTRATION" | "ACTIVE" | "RESOLUTION" | null;
  playerSummary: PlayerSummary | null;
  playerFortress: PlayerFortress | null;
  mapFortresses: MapFortress[];
  attackUnits: AttackUnitMarker[];
  targets: CommandTarget[];
  chat: ChatProps;
  canEditRegistrationName: boolean;
  immersive?: boolean;
}) {
  const router = useRouter();
  const [chatOpen, setChatOpen] = useState(false);
  const [actionOpen, setActionOpen] = useState(false);
  const [unreadChatCount, setUnreadChatCount] = useState(chat.unreadCount);
  const [mapAttackPending, setMapAttackPending] = useState(false);
  const [selectedFortressId, setSelectedFortressId] = useState<string | null>(
    null
  );
  const knownChatMessageIdsRef = useRef(
    new Set(chat.messages.map((message) => message.id))
  );
  const markChatReadPendingRef = useRef(false);
  const [action, setAction] = useState<"GROW" | "ATTACK">(
    playerSummary?.currentAction ?? "GROW"
  );
  const [targetFortressId, setTargetFortressId] = useState(
    playerSummary?.currentTargetId ?? ""
  );

  const ownFortress = useMemo(
    () => mapFortresses.find((fortress) => fortress.isCurrentUser) ?? null,
    [mapFortresses]
  );

  useEffect(() => {
    if (chatOpen || !chat.persistsUnread) {
      return;
    }

    queueMicrotask(() => {
      setUnreadChatCount(chat.unreadCount);
    });
  }, [chat.unreadCount, chat.persistsUnread, chatOpen]);

  useEffect(() => {
    const knownMessageIds = knownChatMessageIdsRef.current;
    const unseenIncomingMessages = chat.messages.filter((message) => {
      return !knownMessageIds.has(message.id) && !message.isCurrentUser;
    });

    if (chatOpen) {
      queueMicrotask(() => {
        setUnreadChatCount(0);
      });
      if (
        unseenIncomingMessages.length > 0 &&
        chat.persistsUnread &&
        !markChatReadPendingRef.current
      ) {
        markChatReadPendingRef.current = true;
        void markChatReadAction().finally(() => {
          markChatReadPendingRef.current = false;
        });
      }
    } else if (!chat.persistsUnread && unseenIncomingMessages.length > 0) {
      queueMicrotask(() => {
        setUnreadChatCount(
          (currentCount) => currentCount + unseenIncomingMessages.length
        );
      });
    }

    knownChatMessageIdsRef.current = new Set(
      chat.messages.map((message) => message.id)
    );
  }, [chat.messages, chat.persistsUnread, chatOpen]);

  const canOpenActions = Boolean(
    ownFortress &&
    ((phaseStatus === "ACTIVE" && playerSummary?.canSetAction) ||
      (phaseStatus === "REGISTRATION" &&
        canEditRegistrationName &&
        playerFortress))
  );

  function openOwnActions(fortressId: string) {
    if (!canOpenActions) {
      return;
    }

    setSelectedFortressId(fortressId);
    setActionOpen(true);
  }

  function chooseAction(nextAction: "GROW" | "ATTACK") {
    setAction(nextAction);

    if (nextAction === "GROW") {
      setTargetFortressId("");
    }
  }

  async function prepareAttackTarget(fortress: MapFortress) {
    if (!fortress.isTargetable || !playerSummary?.canSetAction) {
      return;
    }

    setAction("ATTACK");
    setTargetFortressId(fortress.id);

    if (!ownFortress || mapAttackPending) {
      return;
    }

    setSelectedFortressId(ownFortress.id);
    setMapAttackPending(true);

    try {
      const result = await attackFromMapAction(fortress.id);

      if (result.ok) {
        router.refresh();
      }
    } finally {
      setMapAttackPending(false);
    }
  }

  function handleChatToggle() {
    if (chatOpen) {
      setChatOpen(false);
      return;
    }

    setChatOpen(true);
    setUnreadChatCount(0);

    if (chat.persistsUnread && !markChatReadPendingRef.current) {
      markChatReadPendingRef.current = true;
      void markChatReadAction().finally(() => {
        markChatReadPendingRef.current = false;
      });
    }
  }

  const hasUnreadChat = unreadChatCount > 0;
  const unreadBadgeLabel =
    unreadChatCount > 99 ? "99+" : unreadChatCount.toString();

  const actionButtons = (
    <div
      className={immersive ? styles.floatingActions : styles.headerActions}
      aria-label="Battlefield overlays"
    >
      <button
        type="button"
        className={`${styles.overlayButton} ${
          hasUnreadChat ? styles.overlayButtonAttention : ""
        }`}
        aria-label={
          hasUnreadChat
            ? `Chat, ${unreadChatCount} unread messages`
            : "Chat"
        }
        aria-expanded={chatOpen}
        onClick={handleChatToggle}
      >
        <span className={styles.overlayButtonLabel}>Chat</span>
        {hasUnreadChat ? (
          <span className={styles.unreadBadge} aria-hidden="true">
            {unreadBadgeLabel}
          </span>
        ) : null}
      </button>
      {ownFortress ? (
        <button
          type="button"
          className={styles.overlayButton}
          aria-expanded={actionOpen}
          disabled={!canOpenActions}
          onClick={() => openOwnActions(ownFortress.id)}
        >
          Orders
        </button>
      ) : null}
    </div>
  );

  return (
    <section
      className={`${styles.experience} ${immersive ? styles.immersive : ""}`}
      aria-labelledby="battlefield-title"
    >
      <div className={immersive ? styles.headerHidden : styles.header}>
        <div>
          <span className={styles.label}>Battlefield</span>
          <h2 id="battlefield-title">{title}</h2>
          <p>{description}</p>
        </div>
        {!immersive ? actionButtons : null}
      </div>

      <div className={styles.mapStage}>
        {immersive ? actionButtons : null}
        <FortressMap
          className={immersive ? styles.fullMap : undefined}
          fortresses={mapFortresses}
          attackUnits={attackUnits}
          selectedFortressId={selectedFortressId}
          selectedTargetId={action === "ATTACK" ? targetFortressId : null}
          onSelectFortress={(fortress) => {
            if (fortress.isCurrentUser) {
              openOwnActions(fortress.id);
            }
          }}
          onConfirmAttackTarget={prepareAttackTarget}
        />

        {chatOpen ? (
          <aside
            className={`${styles.drawer} ${styles.chatDrawer} ${styles.drawerOpen}`}
          >
            <button
              type="button"
              className={styles.closeButton}
              aria-label="Close chat"
              onClick={() => setChatOpen(false)}
            >
              Close
            </button>
            <ChatPanel
              messages={chat.messages}
              canPost={chat.canPost}
              maxLength={chat.maxLength}
              postHint={chat.postHint}
            />
          </aside>
        ) : null}

        {actionOpen ? (
          <aside
            className={`${styles.drawer} ${styles.actionDrawer} ${styles.drawerOpen}`}
          >
            <button
              type="button"
              className={styles.closeButton}
              aria-label="Close orders"
              onClick={() => setActionOpen(false)}
            >
              Close
            </button>

            {phaseStatus === "ACTIVE" && playerSummary ? (
              <div className={styles.drawerContent}>
                <div className={styles.ordersHeader}>
                  <div>
                    <span className={styles.label}>Orders</span>
                    <h3>{playerSummary.name}</h3>
                  </div>
                  <strong>{playerSummary.points} pts</strong>
                </div>

                <form action={setFortressActionAction} className={styles.form}>
                  <input name="action" type="hidden" value={action} />
                  <div className={styles.segmentGroup} aria-label="Current action">
                    <button
                      type="button"
                      className={`${styles.segmentButton} ${
                        action === "GROW" ? styles.segmentButtonActive : ""
                      }`}
                      aria-pressed={action === "GROW"}
                      onClick={() => chooseAction("GROW")}
                    >
                      Grow
                    </button>
                    <button
                      type="button"
                      className={`${styles.segmentButton} ${
                        action === "ATTACK" ? styles.segmentButtonActive : ""
                      }`}
                      aria-pressed={action === "ATTACK"}
                      onClick={() => chooseAction("ATTACK")}
                    >
                      Attack
                    </button>
                  </div>

                  {action === "ATTACK" ? (
                    <label className={styles.field}>
                      <span>Target</span>
                      <select
                        name="targetFortressId"
                        value={targetFortressId}
                        onChange={(event) => {
                          setTargetFortressId(event.target.value);
                        }}
                      >
                        <option value="">Choose target</option>
                        {targets.map((target) => (
                          <option key={target.id} value={target.id}>
                            {target.name} (
                            {target.isNpc
                              ? `${target.health}/${target.maxHealth} HP`
                              : `${target.points} pts`}
                            )
                          </option>
                        ))}
                      </select>
                    </label>
                  ) : null}

                  <button className={styles.primaryButton} type="submit">
                    Save orders
                  </button>
                </form>
                <p className={styles.helper}>
                  Tap a target on the map, then confirm Attack. Orders and map
                  targeting now update the same attack state.
                </p>

                <div className={styles.upgradePanel}>
                  <div className={styles.upgradeHeader}>
                    <div>
                      <span className={styles.label}>Location shuffle</span>
                      <h4>Reposition fortress</h4>
                    </div>
                    <strong>
                      {playerSummary.locationShuffleCost === 0
                        ? "Free"
                        : `${playerSummary.locationShuffleCost} pts`}
                    </strong>
                  </div>
                  <p className={styles.helper}>
                    {playerSummary.freeLocationShuffleAvailable
                      ? "Your first location shuffle this season is free. Later shuffles cost 50 points."
                      : "This fortress already used its free location shuffle. The next one costs 50 points."}
                  </p>
                  {playerSummary.currentAction !== "GROW" ? (
                    <p className={`${styles.helper} ${styles.warningText}`}>
                      Switch to Grow before shuffling fortress location.
                    </p>
                  ) : null}
                  {playerSummary.hasOutgoingAttackUnits ? (
                    <p className={`${styles.helper} ${styles.warningText}`}>
                      Outgoing attack units already in flight will be canceled when you shuffle.
                    </p>
                  ) : null}
                  {!playerSummary.canShuffleLocation &&
                  playerSummary.currentAction === "GROW" &&
                  playerSummary.locationShuffleCost !== null &&
                  playerSummary.points < playerSummary.locationShuffleCost ? (
                    <p className={styles.helper}>
                      You need {playerSummary.locationShuffleCost} points for the next location shuffle.
                    </p>
                  ) : null}
                  <form action={shuffleFortressLocationAction}>
                    <button
                      className={styles.secondaryButton}
                      type="submit"
                      disabled={!playerSummary.canShuffleLocation}
                    >
                      {playerSummary.locationShuffleCost === 0
                        ? "Shuffle location for free"
                        : `Shuffle location for ${playerSummary.locationShuffleCost} pts`}
                    </button>
                  </form>
                </div>

                <div className={styles.upgradePanel}>
                  <div className={styles.upgradeHeader}>
                    <div>
                      <span className={styles.label}>Castle level</span>
                      <h4>Level {playerSummary.level}</h4>
                    </div>
                    <strong>
                      +{playerSummary.growPerTick} grow / {playerSummary.attackDamage} dmg
                    </strong>
                  </div>
                  <p className={styles.helper}>
                    {playerSummary.upgradesUnlocked
                      ? playerSummary.nextUpgradeCost === null
                        ? "Your castle is maxed out. Growth and attack damage are fully upgraded."
                        : playerSummary.canAffordUpgrade
                          ? `Upgrade now for ${playerSummary.nextUpgradeCost} points. Each level adds +1 growth and +2 attack damage. Home of A keeps returning stronger after each fall.`
                          : `Next upgrade costs ${playerSummary.nextUpgradeCost} points. Earn more before buying while Home of A escalates each time it falls.`
                      : "Castle upgrades unlock for everyone after Home of A falls for the first time."}
                  </p>
                  {playerSummary.receivedSlayerUpgrade ? (
                    <p className={styles.helper}>
                      Home of A slayer bonus claimed: you received one free castle upgrade.
                    </p>
                  ) : null}
                  {playerSummary.upgradesUnlocked &&
                  playerSummary.nextUpgradeCost !== null ? (
                    <form action={purchaseFortressUpgradeAction}>
                      <button
                        className={styles.secondaryButton}
                        type="submit"
                        disabled={!playerSummary.canPurchaseUpgrade}
                      >
                        Buy upgrade for {playerSummary.nextUpgradeCost} pts
                      </button>
                    </form>
                  ) : null}
                </div>

                {playerSummary.canRegisterCommanderName ? (
                  <form
                    action={registerCommanderNameAction}
                    className={styles.renamePanel}
                  >
                    <label className={styles.field}>
                      <span>In-game nick</span>
                      <input
                        name="commanderName"
                        type="text"
                        defaultValue={playerSummary.commanderName}
                        maxLength={32}
                        required
                      />
                    </label>
                    <button className={styles.secondaryButton} type="submit">
                      Register nick
                    </button>
                  </form>
                ) : null}

                {playerSummary.canRename ? (
                  <form
                    action={renameFortressAction}
                    className={styles.renamePanel}
                  >
                    <label className={styles.field}>
                      <span>Rename</span>
                      <input
                        name="fortressName"
                        type="text"
                        defaultValue={playerSummary.name}
                        maxLength={32}
                        required
                      />
                    </label>
                    <button className={styles.secondaryButton} type="submit">
                      Spend 10 pts
                    </button>
                  </form>
                ) : (
                  <p className={styles.helper}>Rename unlocks at 10 points.</p>
                )}
              </div>
            ) : null}

            {phaseStatus === "REGISTRATION" &&
            canEditRegistrationName &&
            playerFortress ? (
              <div className={styles.drawerContent}>
                <div className={styles.ordersHeader}>
                  <div>
                    <span className={styles.label}>Registration</span>
                    <h3>{playerFortress.commanderName}</h3>
                  </div>
                  <strong>{playerFortress.points} pts</strong>
                </div>
                <form
                  action={editRegistrationFortressNameAction}
                  className={styles.form}
                >
                  <label className={styles.field}>
                    <span>In-game nick</span>
                    <input
                      name="commanderName"
                      type="text"
                      defaultValue={playerFortress.commanderName}
                      maxLength={32}
                      required
                    />
                  </label>
                  <label className={styles.field}>
                    <span>Fortress name</span>
                    <input
                      name="fortressName"
                      type="text"
                      defaultValue={playerFortress.name}
                      maxLength={32}
                      required
                    />
                  </label>
                  <button className={styles.primaryButton} type="submit">
                    Update registration
                  </button>
                </form>
              </div>
            ) : null}
          </aside>
        ) : null}
      </div>
    </section>
  );
}
