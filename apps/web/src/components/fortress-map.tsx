"use client";

import styles from "./fortress-map.module.css";

type MapFortress = {
  id: string;
  name: string;
  points: number;
  currentAction: "GROW" | "ATTACK";
  mapX: number;
  mapY: number;
  isCurrentUser: boolean;
  isTargetable: boolean;
};

export function FortressMap({
  fortresses,
  selectedTargetId,
  onSelectTarget,
}: {
  fortresses: MapFortress[];
  selectedTargetId?: string | null;
  onSelectTarget?: (fortressId: string) => void;
}) {
  return (
    <div className={styles.shell}>
      <div className={styles.gridBackdrop} />
      {fortresses.length === 0 ? (
        <div className={styles.emptyState}>
          No fortresses on the battlefield yet.
        </div>
      ) : (
        fortresses.map((fortress) => {
          const selectable = Boolean(onSelectTarget) && fortress.isTargetable;
          const className = [
            styles.marker,
            fortress.isCurrentUser ? styles.currentUser : "",
            selectedTargetId === fortress.id ? styles.selected : "",
            fortress.isTargetable ? styles.targetable : "",
          ]
            .filter(Boolean)
            .join(" ");

          return (
            <button
              key={fortress.id}
              type="button"
              className={className}
              style={{
                left: `${fortress.mapX}%`,
                top: `${fortress.mapY}%`,
              }}
              onClick={() => {
                if (selectable) {
                  onSelectTarget?.(fortress.id);
                }
              }}
              aria-pressed={selectedTargetId === fortress.id}
              aria-label={`${fortress.name}, ${fortress.points} points`}
            >
              <span className={styles.dot} />
              <span className={styles.tooltip}>
                <strong>{fortress.name}</strong>
                <span>{fortress.points} pts · {fortress.currentAction}</span>
              </span>
            </button>
          );
        })
      )}
    </div>
  );
}
