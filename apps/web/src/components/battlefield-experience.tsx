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

  return (
    <section className={styles.experience} aria-labelledby="battlefield-title">
      <div className={styles.header}>
        <div>
          <span className={styles.label}>Battlefield</span>
          <h2 id="battlefield-title">{title}</h2>
          <p>{description}</p>
        </div>
        <div className={styles.headerActions}>
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
      </div>

      <div className={styles.mapStage}>
        <FortressMap
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
                <span className={styles.label}>Selected castle</span>
                <h3>{playerSummary.name}</h3>
                <p>
                  {playerSummary.currentTargetName
                    ? `Saved target: ${playerSummary.currentTargetName}`
                    : "Grow steadily or launch a unit toward another castle."}
                </p>

                <form action={setFortressActionAction} className={styles.form}>
                  <label className={styles.field}>
                    <span>Current action</span>
                    <select
                      name="action"
                      value={action}
                      onChange={(event) => {
                        const nextAction =
                          event.target.value === "ATTACK" ? "ATTACK" : "GROW";
                        setAction(nextAction);

                        if (nextAction === "GROW") {
                          setTargetFortressId("");
                        }
                      }}
                    >
                      <option value="GROW">Grow</option>
                      <option value="ATTACK">Attack</option>
                    </select>
                  </label>
                  <label className={styles.field}>
                    <span>Attack target</span>
                    <select
                      name="targetFortressId"
                      value={targetFortressId}
                      onChange={(event) => {
                        setAction("ATTACK");
                        setTargetFortressId(event.target.value);
                      }}
                    >
                      <option value="">No target</option>
                      {targets.map((target) => (
                        <option key={target.id} value={target.id}>
                          {target.name} ({target.points} pts)
                        </option>
                      ))}
                    </select>
                  </label>
                  <button className={styles.primaryButton} type="submit">
                    Save action
                  </button>
                </form>

                {playerSummary.canRename ? (
                  <form action={renameFortressAction} className={styles.form}>
                    <label className={styles.field}>
                      <span>Fortress name</span>
                      <input
                        name="fortressName"
                        type="text"
                        defaultValue={playerSummary.name}
                        required
                      />
                    </label>
                    <button className={styles.secondaryButton} type="submit">
                      Spend 10 points to rename
                    </button>
                  </form>
                ) : (
                  <p className={styles.helper}>
                    Renaming during ACTIVE costs 10 points.
                  </p>
                )}
              </div>
            ) : null}

            {phaseStatus === "REGISTRATION" &&
            canEditRegistrationName &&
            playerFortress ? (
              <div className={styles.drawerContent}>
                <span className={styles.label}>Registration</span>
                <h3>{playerFortress.name}</h3>
                <p>
                  You can still rename your castle before the season starts.
                </p>
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
