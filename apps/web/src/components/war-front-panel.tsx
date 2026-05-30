// =============================================================================
// War Front Panel — Season 4 Auto-War UI
// =============================================================================
// Slide-out panel for managing war fronts: assign battalions, set aggression,
// view front status, and manage priority attack tiles.
// =============================================================================

"use client";

import { useState } from "react";
import styles from "./war-front-panel.module.css";
import type {
  WarFront,
  AggressionStance,
  PrioritizedBattlefield,
} from "@/lib/game/war-front";

// ── Types ────────────────────────────────────────────────────────────────────

export type FrontPanelBattalion = {
  id: string;
  name: string;
  size: number;
  maxSize: number;
  tier: number;
};

export type FrontPanelProps = {
  fronts: WarFront[];
  battalions: FrontPanelBattalion[];
  battlefieldPriorities: PrioritizedBattlefield[];
  /** Called when user wants to assign a battalion to a front. */
  onAssignBattalion?: (frontId: string, battalionId: string) => void;
  /** Called when user wants to remove a battalion from a front. */
  onRemoveBattalion?: (frontId: string, battalionId: string) => void;
  /** Called when user changes aggression stance. */
  onSetAggression?: (frontId: string, stance: AggressionStance) => void;
  /** Called when user wants to create a new front (declare war). */
  onCreateFront?: (enemyFortressId: string) => void;
  /** Called when user requests retreat from a front. */
  onRetreatFront?: (frontId: string) => void;
  /** Called when user changes battlefield priority. */
  onSetBattlefieldPriority?: (
    battlefieldId: string,
    priority: number,
  ) => void;
  onClose: () => void;
};

// ── Status Badge ─────────────────────────────────────────────────────────────

const STATUS_LABELS: Record<string, string> = {
  ADVANCING: "Advancing",
  STALLED: "Stalled",
  VICTORIOUS: "Victorious",
  DEFEATED: "Defeated",
  RETREATING: "Retreating",
};

const STATUS_COLORS: Record<string, string> = {
  ADVANCING: "#4caf50",
  STALLED: "#ff9800",
  VICTORIOUS: "#2196f3",
  DEFEATED: "#f44336",
  RETREATING: "#9e9e9e",
};

function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={styles.statusBadge}
      style={{ backgroundColor: STATUS_COLORS[status] ?? "#888" }}
    >
      {STATUS_LABELS[status] ?? status}
    </span>
  );
}

// ── Aggression Selector ──────────────────────────────────────────────────────

const AGGRESSION_LABELS: Record<string, string> = {
  CAUTIOUS: "Cautious (30%)",
  BALANCED: "Balanced (60%)",
  AGGRESSIVE: "Aggressive (100%)",
};

function AggressionSelector({
  value,
  onChange,
}: {
  value: AggressionStance;
  onChange: (stance: AggressionStance) => void;
}) {
  return (
    <div className={styles.aggressionRow}>
      {(["CAUTIOUS", "BALANCED", "AGGRESSIVE"] as AggressionStance[]).map(
        (stance) => (
          <button
            key={stance}
            type="button"
            className={`${styles.aggressionBtn} ${
              value === stance ? styles.aggressionBtnActive : ""
            }`}
            onClick={() => onChange(stance)}
          >
            {AGGRESSION_LABELS[stance]}
          </button>
        ),
      )}
    </div>
  );
}

// ── Main Panel ───────────────────────────────────────────────────────────────

export function WarFrontPanel({
  fronts,
  battalions,
  battlefieldPriorities,
  onAssignBattalion,
  onRemoveBattalion,
  onSetAggression,
  onCreateFront,
  onRetreatFront,
  onSetBattlefieldPriority,
  onClose,
}: FrontPanelProps) {
  const [activeTab, setActiveTab] = useState<"fronts" | "battlefields">(
    "fronts",
  );

  const availableBattalions = battalions.filter(
    (b) => !fronts.some((f) => f.assignedBattalionIds.includes(b.id)),
  );

  return (
    <aside className={styles.panel} aria-label="War Fronts">
      {/* Header */}
      <div className={styles.header}>
        <h2 className={styles.title}>War Fronts</h2>
        <button
          type="button"
          className={styles.closeBtn}
          onClick={onClose}
          aria-label="Close war fronts panel"
        >
          ✕
        </button>
      </div>

      {/* Tabs */}
      <div className={styles.tabs}>
        <button
          type="button"
          className={`${styles.tab} ${activeTab === "fronts" ? styles.tabActive : ""}`}
          onClick={() => setActiveTab("fronts")}
        >
          Fronts ({fronts.length})
        </button>
        <button
          type="button"
          className={`${styles.tab} ${activeTab === "battlefields" ? styles.tabActive : ""}`}
          onClick={() => setActiveTab("battlefields")}
        >
          Battlefields ({battlefieldPriorities.filter((b) => b.priority > 0).length})
        </button>
      </div>

      <div className={styles.body}>
        {/* ── Fronts Tab ──────────────────────────────────────────────── */}
        {activeTab === "fronts" && (
          <>
            {fronts.length === 0 ? (
              <div className={styles.emptyState}>
                <p>No active war fronts.</p>
                <p className={styles.hint}>
                  Declare war on a fortress to open a front.
                </p>
              </div>
            ) : (
              fronts.map((front) => (
                <div key={front.id} className={styles.frontCard}>
                  <div className={styles.frontHeader}>
                    <StatusBadge status={front.status} />
                    <span className={styles.enemyName}>
                      vs. {front.enemyFortressId}
                    </span>
                  </div>

                  {/* Battalion Assignment */}
                  <div className={styles.section}>
                    <span className={styles.sectionLabel}>
                      Assigned Battalions
                    </span>
                    {front.assignedBattalionIds.length === 0 ? (
                      <p className={styles.hint}>No battalions assigned.</p>
                    ) : (
                      <ul className={styles.battalionList}>
                        {front.assignedBattalionIds.map((bnId) => {
                          const bn = battalions.find((b) => b.id === bnId);
                          return (
                            <li key={bnId} className={styles.battalionItem}>
                              <span className={styles.battalionName}>
                                {bn?.name ?? bnId}
                              </span>
                              <span className={styles.battalionSize}>
                                {bn?.size ?? "?"} / {bn?.maxSize ?? "?"}
                              </span>
                              <button
                                type="button"
                                className={styles.removeBtn}
                                onClick={() =>
                                  onRemoveBattalion?.(front.id, bnId)
                                }
                                aria-label={`Remove ${bn?.name ?? bnId}`}
                              >
                                −
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    )}

                    {/* Add battalion dropdown */}
                    {availableBattalions.length > 0 && (
                      <div className={styles.assignRow}>
                        <select
                          className={styles.assignSelect}
                          defaultValue=""
                          onChange={(e) => {
                            if (e.target.value) {
                              onAssignBattalion?.(front.id, e.target.value);
                              e.target.value = "";
                            }
                          }}
                        >
                          <option value="" disabled>
                            Add battalion…
                          </option>
                          {availableBattalions.map((bn) => (
                            <option key={bn.id} value={bn.id}>
                              {bn.name} ({bn.size} units)
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                  </div>

                  {/* Aggression */}
                  <div className={styles.section}>
                    <span className={styles.sectionLabel}>Aggression</span>
                    <AggressionSelector
                      value="BALANCED"
                      onChange={(stance) =>
                        onSetAggression?.(front.id, stance)
                      }
                    />
                  </div>

                  {/* Retreat */}
                  {front.status === "ADVANCING" ||
                  front.status === "STALLED" ? (
                    <button
                      type="button"
                      className={styles.retreatBtn}
                      onClick={() => onRetreatFront?.(front.id)}
                    >
                      Retreat
                    </button>
                  ) : null}
                </div>
              ))
            )}
          </>
        )}

        {/* ── Battlefields Tab ────────────────────────────────────────── */}
        {activeTab === "battlefields" && (
          <>
            {battlefieldPriorities.length === 0 ? (
              <div className={styles.emptyState}>
                <p>No active battlefields.</p>
              </div>
            ) : (
              battlefieldPriorities
                .filter((bf) => bf.ourArmyRemaining > 0)
                .map((bf) => (
                  <div key={bf.battlefieldId} className={styles.battlefieldCard}>
                    <div className={styles.battlefieldHeader}>
                      <span className={styles.battlefieldName}>
                        {bf.battlefieldId}
                      </span>
                      <span className={styles.battlefieldSide}>
                        {bf.side === "ATTACKER" ? "Attacking" : "Defending"}
                      </span>
                    </div>
                    <div className={styles.battlefieldStats}>
                      <span>
                        Our army: {bf.ourArmyRemaining} vs Enemy:{" "}
                        {bf.enemyArmyRemaining}
                      </span>
                    </div>
                    <div className={styles.priorityRow}>
                      <span className={styles.sectionLabel}>Priority</span>
                      <select
                        className={styles.prioritySelect}
                        value={bf.priority}
                        onChange={(e) =>
                          onSetBattlefieldPriority?.(
                            bf.battlefieldId,
                            Number(e.target.value),
                          )
                        }
                      >
                        <option value={0}>None</option>
                        <option value={1}>Low</option>
                        <option value={2}>Normal</option>
                        <option value={3}>Reinforce First</option>
                      </select>
                    </div>
                  </div>
                ))
            )}
          </>
        )}
      </div>
    </aside>
  );
}
