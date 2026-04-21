"use client";

import { useMemo, useState } from "react";

import {
  editRegistrationFortressNameAction,
  renameFortressAction,
  setFortressActionAction,
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
};

type PlayerSummary = {
  id: string;
  name: string;
  points: number;
  currentAction: "GROW" | "ATTACK";
  currentTargetId?: string | null;
  currentTargetName?: string | null;
  canRename: boolean;
  canSetAction: boolean;
};

type PlayerFortress = {
  id: string;
  name: string;
  points: number;
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
  const [chatOpen, setChatOpen] = useState(false);
  const [actionOpen, setActionOpen] = useState(false);
  const [selectedFortressId, setSelectedFortressId] = useState<string | null>(
    null
  );
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

  const actionButtons = (
    <div
      className={immersive ? styles.floatingActions : styles.headerActions}
      aria-label="Battlefield overlays"
    >
      <button
        type="button"
        className={styles.overlayButton}
        aria-expanded={chatOpen}
        onClick={() => setChatOpen((isOpen) => !isOpen)}
      >
        {chatOpen ? "Hide chat" : "Open chat"}
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
              return;
            }

            if (fortress.isTargetable && playerSummary?.canSetAction) {
              setAction("ATTACK");
              setTargetFortressId(fortress.id);
              if (ownFortress) {
                setSelectedFortressId(ownFortress.id);
                setActionOpen(true);
              }
            }
          }}
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
                    <h3>{playerFortress.name}</h3>
                  </div>
                  <strong>{playerFortress.points} pts</strong>
                </div>
                <form
                  action={editRegistrationFortressNameAction}
                  className={styles.form}
                >
                  <label className={styles.field}>
                    <span>Fortress name</span>
                    <input
                      name="fortressName"
                      type="text"
                      defaultValue={playerFortress.name}
                      required
                    />
                  </label>
                  <button className={styles.primaryButton} type="submit">
                    Update registration name
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
