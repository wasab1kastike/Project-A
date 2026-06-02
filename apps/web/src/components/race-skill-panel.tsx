"use client";

import { useState } from "react";
import {
  MAX_SKILL_POINTS,
  SKILL_POINT_RESPEC_GOLD_COST,
  getRaceSkillTree,
  type RaceSkillNode,
} from "@/lib/game/race-skill-tree";
import type { FortressRace } from "@/lib/game/races";
import styles from "./race-skill-panel.module.css";

type SkillState = {
  race: FortressRace;
  purchasedNodeKeys: string[];
  earnedPoints: number;
  totalPurchased: number;
  playerLevel: number;
  tileCount: number;
  gold: number;
};

type NodeState = "active" | "unlockable" | "locked";

function getNodeState({
  node,
  purchasedNodeKeys,
  availablePoints,
  actionPending,
}: {
  node: RaceSkillNode;
  purchasedNodeKeys: Set<string>;
  availablePoints: number;
  actionPending: boolean;
}): NodeState {
  if (purchasedNodeKeys.has(node.key)) return "active";
  const previousKey = `${node.pathKey}-${node.level - 1}`;
  if (
    (node.level === 1 || purchasedNodeKeys.has(previousKey)) &&
    availablePoints > 0 &&
    !actionPending
  ) {
    return "unlockable";
  }
  return "locked";
}

export function RaceSkillPanel({
  skillState,
  onPurchase,
  onReset,
}: {
  skillState: SkillState | null;
  onPurchase?: (nodeKey: string) => Promise<void>;
  onReset?: (nodeKey: string) => Promise<void>;
}) {
  const [purchasePending, setPurchasePending] = useState<string | null>(null);
  const [resetPending, setResetPending] = useState<string | null>(null);

  if (!skillState) {
    return (
      <section className={styles.emptyState}>
        Choose a race to unlock its skill tree.
      </section>
    );
  }

  const tree = getRaceSkillTree(skillState.race);
  const { earnedPoints, totalPurchased } = skillState;
  const purchasedNodeKeys = new Set(skillState.purchasedNodeKeys);
  const availablePoints = Math.max(
    0,
    Math.min(MAX_SKILL_POINTS, earnedPoints) - totalPurchased
  );
  const capReached = totalPurchased >= MAX_SKILL_POINTS;
  const actionPending = purchasePending !== null || resetPending !== null;
  const canAffordReset = skillState.gold >= SKILL_POINT_RESPEC_GOLD_COST;

  return (
    <section className={styles.panel} aria-label="Race skill tree">
      <div className={styles.tree}>
        <div className={styles.coreNode}>
          <span className={styles.coreEyebrow}>
            {tree.race.replaceAll("_", " ")}
          </span>
          <strong>{availablePoints} available</strong>
          <span>
            {totalPurchased} spent / {MAX_SKILL_POINTS} max
          </span>
        </div>

        {tree.paths.map((path, pathIndex) => {
          const purchasedInPath = path.nodes.filter((node) =>
            purchasedNodeKeys.has(node.key)
          ).length;
          const isMaxed = purchasedInPath >= path.nodes.length;
          const pathClassName = [
            styles.path,
            pathIndex === 0 ? styles.pathTop : "",
            pathIndex === 1 ? styles.pathLeft : "",
            pathIndex === 2 ? styles.pathRight : "",
          ]
            .filter(Boolean)
            .join(" ");

          return (
            <div className={pathClassName} key={path.key}>
              <div className={styles.pathHeader}>
                <strong>{path.name}</strong>
                <span>
                  {purchasedInPath}/{path.nodes.length}
                </span>
                <p>{path.description}</p>
              </div>

              <ol className={styles.tierList}>
                {path.nodes.map((node) => {
                  const nodeState = getNodeState({
                    node,
                    purchasedNodeKeys,
                    availablePoints,
                    actionPending,
                  });
                  const isPending = purchasePending === node.key;
                  const isResetPending = resetPending === node.key;
                  const isNextNode = nodeState === "unlockable";
                  const nextKey = `${node.pathKey}-${node.level + 1}`;
                  const isResettable =
                    nodeState === "active" &&
                    !purchasedNodeKeys.has(nextKey) &&
                    !actionPending;
                  const canPurchase =
                    nodeState === "unlockable" && !isMaxed && !isPending;
                  const nodeClassName = [
                    styles.tierNode,
                    nodeState === "active" ? styles.activeNode : "",
                    nodeState === "unlockable" ? styles.unlockableNode : "",
                    nodeState === "locked" ? styles.lockedNode : "",
                  ]
                    .filter(Boolean)
                    .join(" ");

                  return (
                    <li className={nodeClassName} key={node.key}>
                      <div className={styles.tierBadge}>{node.level}</div>
                      <div className={styles.tierBody}>
                        <div className={styles.tierTitleRow}>
                          <strong>{node.name}</strong>
                          <span>
                            {nodeState === "active"
                              ? "Active"
                              : nodeState === "unlockable"
                                ? "Next"
                                : "Locked"}
                          </span>
                        </div>
                        <p>
                          {node.rewards
                            .map((reward) => reward.label)
                            .join(", ")}
                        </p>
                        {isNextNode && capReached ? (
                          <span className={styles.lockReason}>
                            {MAX_SKILL_POINTS} point cap reached
                          </span>
                        ) : null}
                        {isNextNode && !capReached && availablePoints <= 0 ? (
                          <span className={styles.lockReason}>
                            No skill points available
                          </span>
                        ) : null}
                        {canPurchase ? (
                          <button
                            className={styles.unlockButton}
                            type="button"
                            onClick={async () => {
                              if (purchasePending) return;
                              setPurchasePending(node.key);
                              try {
                                await onPurchase?.(node.key);
                              } finally {
                                setPurchasePending(null);
                              }
                            }}
                          >
                            Unlock
                          </button>
                        ) : null}
                        {isResettable ? (
                          <button
                            className={styles.resetButton}
                            type="button"
                            disabled={!canAffordReset}
                            title={
                              canAffordReset
                                ? `Reset this point for ${SKILL_POINT_RESPEC_GOLD_COST.toLocaleString("en-US")} gold`
                                : `Needs ${SKILL_POINT_RESPEC_GOLD_COST.toLocaleString("en-US")} gold`
                            }
                            onClick={async () => {
                              if (actionPending || !canAffordReset) return;
                              setResetPending(node.key);
                              try {
                                await onReset?.(node.key);
                              } finally {
                                setResetPending(null);
                              }
                            }}
                          >
                            Reset {SKILL_POINT_RESPEC_GOLD_COST.toLocaleString("en-US")}g
                          </button>
                        ) : null}
                        {isPending && isNextNode ? (
                          <span className={styles.pendingLabel}>
                            Unlocking...
                          </span>
                        ) : null}
                        {isResetPending ? (
                          <span className={styles.pendingLabel}>
                            Resetting...
                          </span>
                        ) : null}
                      </div>
                    </li>
                  );
                })}
              </ol>
            </div>
          );
        })}
      </div>
    </section>
  );
}
