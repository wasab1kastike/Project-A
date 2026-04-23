"use client";

import { useState } from "react";
import {
  renameFortressAction,
  setFortressActionAction,
} from "@/app/game-actions";
import { FortressMap, type MapFortress } from "./fortress-map";
import styles from "./active-command-center.module.css";

type CommandTarget = {
  id: string;
  name: string;
  points: number;
  isNpc: boolean;
  health: number;
  maxHealth: number;
  currentAction: "GROW" | "ATTACK";
};

export function ActiveCommandCenter({
  currentAction,
  currentTargetId,
  currentTargetName,
  fortressName,
  mapFortresses,
  targets,
}: {
  currentAction: "GROW" | "ATTACK";
  currentTargetId?: string | null;
  currentTargetName?: string | null;
  fortressName: string;
  mapFortresses: MapFortress[];
  targets: CommandTarget[];
}) {
  const [action, setAction] = useState<"GROW" | "ATTACK">(currentAction);
  const [targetFortressId, setTargetFortressId] = useState(
    currentTargetId ?? ""
  );

  return (
    <div className={styles.layout}>
      <div className={styles.mapPanel}>
        <div className={styles.mapHeader}>
          <span className={styles.label}>Battlefield</span>
          <p>
            Click any targetable fortress to sync the attack target selector.
          </p>
        </div>
        <FortressMap
          fortresses={mapFortresses}
          selectedTargetId={action === "ATTACK" ? targetFortressId : null}
          onSelectFortress={(fortress) => {
            if (!fortress.isTargetable) {
              return;
            }

            setAction("ATTACK");
            setTargetFortressId(fortress.id);
          }}
        />
      </div>

      <div className={styles.forms}>
        <form action={setFortressActionAction} className={styles.form}>
          <span className={styles.label}>Orders</span>
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
                setTargetFortressId(event.target.value);
              }}
            >
              <option value="">No target</option>
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
          <p className={styles.helper}>
            {action === "ATTACK" && currentTargetName
              ? `Saved target: ${currentTargetName}`
              : "Grow adds 1 point per minute tick. Attack keeps one outbound unit in flight at a time and damages the target on impact."}
          </p>
          <button className={styles.primaryButton} type="submit">
            Save action
          </button>
        </form>

        <form action={renameFortressAction} className={styles.form}>
          <span className={styles.label}>Rename</span>
          <label className={styles.field}>
            <span>Fortress name</span>
            <input
              name="fortressName"
              type="text"
              defaultValue={fortressName}
              required
            />
          </label>
          <p className={styles.helper}>
            Renaming during ACTIVE costs 10 points and still requires a unique
            name.
          </p>
          <button className={styles.secondaryButton} type="submit">
            Spend 10 points to rename
          </button>
        </form>
      </div>
    </div>
  );
}
