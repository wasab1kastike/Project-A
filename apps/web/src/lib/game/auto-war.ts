// =============================================================================
// Auto-War System — Season 4
// =============================================================================
// Policy-driven automated warfare. Players assign battalions to war fronts,
// paint priority tiles, and set aggression stances. The system auto-dispatches
// attacks, advances through targets, and manages battlefield reinforcements.
// Pure functions only. No DB / Prisma imports.
// =============================================================================

import {
  AggressionStance,
  AGGRESSION_STANCE_COMMITMENT,
  BattlefieldPriority,
  FrontStatus,
  PrioritizedBattlefield,
  PriorityTile,
  ReachableTarget,
  selectNextTarget,
  sortBattlefieldsByPriority,
  TileAttackPriority,
  updateFrontStatus,
  WarFront,
  getBattlefieldReinforcementNeeds,
} from "./war-front";
import {
  Battalion,
  BattalionStance,
  BattalionTier,
} from "./battalion-types";

// ── Auto-War Policy ──────────────────────────────────────────────────────────

export type AutoWarPolicy = {
  /** Maximum total army size. Excess production is wasted. */
  maxArmySize: number;
  /** Percentage of army kept for defense (guard duty). */
  guardPercent: number;
  /** Default aggression stance for new fronts. */
  defaultAggression: AggressionStance;
  /** Priority tiles — ordered list of targets per enemy. */
  priorityTiles: PriorityTile[];
  /** Battlefields to reinforce, in priority order. */
  battlefieldPriorities: PrioritizedBattlefield[];
  /** War fronts — one per enemy. */
  fronts: WarFront[];
};

// ── Army Split ───────────────────────────────────────────────────────────────

export type ArmySplit = {
  /** Total army across all battalions. */
  totalArmy: number;
  /** Army allocated to defense (guard %). */
  defensiveArmy: number;
  /** Army available for offensive operations. */
  offensiveArmy: number;
  /** Army actually committed to active attacks. */
  committedArmy: number;
  /** Army idle (available but not yet dispatched). */
  idleArmy: number;
};

/**
 * Calculate the army split based on policy and battalion states.
 */
export function calculateArmySplit(args: {
  battalions: Battalion[];
  policy: AutoWarPolicy;
  committedBattalionIds: Set<string>;
}): ArmySplit {
  const totalArmy = args.battalions.reduce((s, b) => s + b.size, 0);
  const defensiveArmy = Math.floor(totalArmy * (args.policy.guardPercent / 100));
  const offensiveArmy = totalArmy - defensiveArmy;

  const committedArmy = args.battalions
    .filter((b) => args.committedBattalionIds.has(b.id))
    .reduce((s, b) => s + b.size, 0);

  const idleArmy = Math.max(0, offensiveArmy - committedArmy);

  return { totalArmy, defensiveArmy, offensiveArmy, committedArmy, idleArmy };
}

// ── Attack Dispatch ──────────────────────────────────────────────────────────

export type AttackOrder = {
  /** Which battalion is attacking. */
  battalionId: string;
  /** Target tile. */
  targetTileId: string;
  /** How many units to commit. */
  armyCommitted: number;
  /** Which front this attack belongs to. */
  frontId: string;
  /** Aggression stance used for this attack. */
  aggression: AggressionStance;
};

/**
 * Calculate how much army to commit from a battalion based on aggression stance.
 */
export function getArmyCommitment(
  battalion: Battalion,
  aggression: AggressionStance,
): number {
  const rate = AGGRESSION_STANCE_COMMITMENT[aggression];
  return Math.max(1, Math.floor(battalion.size * rate));
}

/**
 * Dispatch an attack from a battalion to a target tile.
 * Returns the attack order and the battalion with committed army deducted.
 */
export function dispatchAttack(args: {
  battalion: Battalion;
  targetTileId: string;
  frontId: string;
  aggression: AggressionStance;
}): { order: AttackOrder; battalion: Battalion } {
  const armyCommitted = getArmyCommitment(args.battalion, args.aggression);

  const updatedBattalion: Battalion = {
    ...args.battalion,
    size: Math.max(0, args.battalion.size - armyCommitted),
    stance: BattalionStance.MOBILE,
  };

  const order: AttackOrder = {
    battalionId: args.battalion.id,
    targetTileId: args.targetTileId,
    armyCommitted,
    frontId: args.frontId,
    aggression: args.aggression,
  };

  return { order, battalion: updatedBattalion };
}

// ── Auto-Advance ─────────────────────────────────────────────────────────────

export type AutoAdvanceResult = {
  /** Attack orders dispatched this tick. */
  orders: AttackOrder[];
  /** Updated battalion list. */
  battalions: Battalion[];
  /** Updated fronts. */
  fronts: WarFront[];
  /** Reinforcements dispatched to battlefields. */
  reinforcements: BattlefieldReinforcement[];
  /** Summary of what happened. */
  summary: string[];
};

export type BattlefieldReinforcement = {
  battlefieldId: string;
  battalionId: string;
  armySent: number;
};

/**
 * Process one tick of auto-war.
 *
 * Flow:
 * 1. Split army into offensive/defensive pools
 * 2. For each active front with idle battalions:
 *    a. Select next priority target
 *    b. Dispatch attack with aggression-based commitment
 * 3. Route available army to priority battlefields
 * 4. Update front statuses
 * 5. Apply road progress (handled externally)
 */
export function processAutoWarTick(args: {
  battalions: Battalion[];
  policy: AutoWarPolicy;
  /** Reachable targets — caller must compute from map state. */
  reachableTargets: ReachableTarget[];
  /** Ids of battalions currently in transit (already dispatched). */
  battalionsInTransit: Set<string>;
}): AutoAdvanceResult {
  const summary: string[] = [];
  const orders: AttackOrder[] = [];
  const reinforcements: BattlefieldReinforcement[] = [];
  let updatedBattalions = args.battalions.map((b) => ({ ...b }));
  let updatedFronts = args.policy.fronts.map((f) => ({ ...f }));

  // ── Step 1: Army Split ───────────────────────────────────────────────

  const committedIds = new Set(args.battalionsInTransit);
  const split = calculateArmySplit({
    battalions: updatedBattalions,
    policy: args.policy,
    committedBattalionIds: committedIds,
  });

  // ── Step 2: Dispatch attacks from each front ─────────────────────────

  for (let i = 0; i < updatedFronts.length; i++) {
    const front = updatedFronts[i];
    if (
      front.status === FrontStatus.DEFEATED ||
      front.status === FrontStatus.VICTORIOUS ||
      front.status === FrontStatus.RETREATING
    ) {
      continue;
    }

    // Find idle battalions on this front.
    const idleBattalionIds = front.assignedBattalionIds.filter(
      (id) => !committedIds.has(id),
    );

    if (idleBattalionIds.length === 0) {
      summary.push(`Front ${front.id}: all battalions busy.`);
      continue;
    }

    // For each idle battalion, try to dispatch an attack.
    for (const bnId of idleBattalionIds) {
      const bnIdx = updatedBattalions.findIndex((b) => b.id === bnId);
      if (bnIdx < 0) continue;

      const battalion = updatedBattalions[bnIdx];
      if (battalion.size <= 0) continue;

      // Find targets for this front's enemy.
      const enemyTargets = args.reachableTargets.filter(
        (t) => t.priority > TileAttackPriority.NONE,
      );

      const target = selectNextTarget(enemyTargets);

      if (!target) {
        // No reachable targets — front is stalled.
        updatedFronts[i] = updateFrontStatus(front, {
          hasReachableTargets: false,
          hasBattalionsAlive: battalion.size > 0,
          allPriorityTilesCaptured: true,
        });
        summary.push(
          `Front ${front.id}: no reachable priority targets.`,
        );
        continue;
      }

      // Dispatch!
      const aggression =
        args.policy.defaultAggression ?? AggressionStance.BALANCED;

      const { order, battalion: updatedBn } = dispatchAttack({
        battalion,
        targetTileId: target.tileId,
        frontId: front.id,
        aggression,
      });

      orders.push(order);
      updatedBattalions[bnIdx] = updatedBn;
      committedIds.add(bnId);

      summary.push(
        `Front ${front.id}: dispatched ${order.armyCommitted} units from ${battalion.name} to tile ${target.tileId} (${aggression}).`,
      );

      // Only dispatch one attack per battalion per tick.
      // Additional battalions can still be dispatched in this tick.
    }

    // Update front status after dispatch attempts.
    const hasTargets = args.reachableTargets.some(
      (t) => t.priority > TileAttackPriority.NONE,
    );
    const hasAlive = updatedFronts[i].assignedBattalionIds.some((id) => {
      const bn = updatedBattalions.find((b) => b.id === id);
      return bn && bn.size > 0;
    });

    updatedFronts[i] = updateFrontStatus(updatedFronts[i], {
      hasReachableTargets: hasTargets,
      hasBattalionsAlive: hasAlive,
      allPriorityTilesCaptured: !hasTargets,
    });
  }

  // ── Step 3: Battlefield Reinforcements ────────────────────────────────

  const activeBfs = args.policy.battlefieldPriorities.filter(
    (bf) =>
      bf.priority > BattlefieldPriority.NONE &&
      bf.ourArmyRemaining > 0 &&
      bf.enemyArmyRemaining > 0,
  );

  if (activeBfs.length > 0) {
    const sorted = sortBattlefieldsByPriority(activeBfs);
    let reinforcementPool = split.idleArmy;

    for (const bf of sorted) {
      if (reinforcementPool <= 0) break;

      const needed = getBattlefieldReinforcementNeeds(bf, reinforcementPool);
      if (needed <= 0) continue;

      // Find an idle battalion to send.
      const idleBn = updatedBattalions.find(
        (b) => b.size >= needed && !committedIds.has(b.id),
      );

      if (idleBn) {
        const bnIdx = updatedBattalions.findIndex(
          (b) => b.id === idleBn.id,
        );
        updatedBattalions[bnIdx].size -= needed;

        reinforcements.push({
          battlefieldId: bf.battlefieldId,
          battalionId: idleBn.id,
          armySent: needed,
        });

        reinforcementPool -= needed;
        summary.push(
          `Reinforced battlefield ${bf.battlefieldId} with ${needed} units.`,
        );
      }
    }
  }

  // ── Step 4: Cap at max army size ──────────────────────────────────────

  const totalAfter = updatedBattalions.reduce((s, b) => s + b.size, 0);
  if (totalAfter > args.policy.maxArmySize) {
    // Trim from largest battalions first.
    let excess = totalAfter - args.policy.maxArmySize;
    const sortedBySize = [...updatedBattalions]
      .map((b, i) => ({ b, i }))
      .sort((a, b) => b.b.size - a.b.size);

    for (const { b, i } of sortedBySize) {
      if (excess <= 0) break;
      const trim = Math.min(b.size, excess);
      updatedBattalions[i].size -= trim;
      excess -= trim;
    }

    summary.push(
      `Army capped at ${args.policy.maxArmySize} (trimmed ${totalAfter - args.policy.maxArmySize} excess).`,
    );
  }

  return {
    orders,
    battalions: updatedBattalions,
    fronts: updatedFronts,
    reinforcements,
    summary,
  };
}

// ── War Policy Builder ───────────────────────────────────────────────────────

/**
 * Create a default auto-war policy. Callers override specific fields.
 */
export function createDefaultAutoWarPolicy(): AutoWarPolicy {
  return {
    maxArmySize: 500,
    guardPercent: 30,
    defaultAggression: AggressionStance.BALANCED,
    priorityTiles: [],
    battlefieldPriorities: [],
    fronts: [],
  };
}

/**
 * Add a priority tile to the policy.
 */
export function addPriorityTile(
  policy: AutoWarPolicy,
  tile: PriorityTile,
): AutoWarPolicy {
  // Replace existing entry for same tile if present.
  const filtered = policy.priorityTiles.filter(
    (t) => t.tileId !== tile.tileId,
  );
  return {
    ...policy,
    priorityTiles: [...filtered, tile],
  };
}

/**
 * Remove a priority tile from the policy.
 */
export function removePriorityTile(
  policy: AutoWarPolicy,
  tileId: string,
): AutoWarPolicy {
  return {
    ...policy,
    priorityTiles: policy.priorityTiles.filter((t) => t.tileId !== tileId),
  };
}
