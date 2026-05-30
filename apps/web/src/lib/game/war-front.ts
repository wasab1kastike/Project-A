// =============================================================================
// War Fronts — Season 4 Auto-War
// =============================================================================
// Players assign battalions to war fronts. Each front targets one enemy.
// Battalions auto-advance through priority tiles. Battlefields can be
// prioritized for reinforcement.
// Pure functions only. No DB / Prisma imports.
// =============================================================================

// ── War Front ────────────────────────────────────────────────────────────────

export type WarFront = {
  /** Stable id. */
  id: string;
  /** The enemy fortress being attacked. */
  enemyFortressId: string;
  /** Battalions assigned to this front. */
  assignedBattalionIds: string[];
  /** Current state of the front. */
  status: FrontStatus;
  /** When the front was created (epoch ms). */
  createdAt: number;
};

export const FrontStatus = {
  /** Battalions are advancing toward priority tiles. */
  ADVANCING: "ADVANCING",
  /** No reachable priority tiles — battalions waiting. */
  STALLED: "STALLED",
  /** All priority tiles captured — front completed. */
  VICTORIOUS: "VICTORIOUS",
  /** All battalions destroyed — front lost. */
  DEFEATED: "DEFEATED",
  /** Player ordered retreat. */
  RETREATING: "RETREATING",
} as const;

export type FrontStatus = (typeof FrontStatus)[keyof typeof FrontStatus];

// ── Aggression Stance ────────────────────────────────────────────────────────

export const AggressionStance = {
  /** Commit 30% of battalion per attack. Safer, slower. */
  CAUTIOUS: "CAUTIOUS",
  /** Commit 60% of battalion per attack. */
  BALANCED: "BALANCED",
  /** Commit 100% of battalion per attack. Fast, risky. */
  AGGRESSIVE: "AGGRESSIVE",
} as const;

export type AggressionStance =
  (typeof AggressionStance)[keyof typeof AggressionStance];

/** Percentage of battalion committed per attack, by stance. */
export const AGGRESSION_STANCE_COMMITMENT: Record<AggressionStance, number> = {
  [AggressionStance.CAUTIOUS]: 0.3,
  [AggressionStance.BALANCED]: 0.6,
  [AggressionStance.AGGRESSIVE]: 1.0,
};

// ── Priority Tiles ───────────────────────────────────────────────────────────

export const TileAttackPriority = {
  /** Capture this tile first. */
  PRIMARY: 3,
  /** Capture after PRIMARY tiles. */
  SECONDARY: 2,
  /** Capture if nothing else available. */
  TERTIARY: 1,
  /** Not targeted. */
  NONE: 0,
} as const;

export type TileAttackPriority =
  (typeof TileAttackPriority)[keyof typeof TileAttackPriority];

export type PriorityTile = {
  tileId: string;
  priority: TileAttackPriority;
  /** Which enemy this tile belongs to (or is adjacent to). Null = neutral tile. */
  targetEnemyId: string | null;
};

// ── Battlefield Priority ─────────────────────────────────────────────────────

export const BattlefieldPriority = {
  /** Route all available reinforcements here first. */
  REINFORCE_FIRST: 3,
  /** Normal priority. */
  NORMAL: 2,
  /** Low priority — reinforce only if nothing else needs help. */
  LOW: 1,
  /** Do not send reinforcements. */
  NONE: 0,
} as const;

export type BattlefieldPriority =
  (typeof BattlefieldPriority)[keyof typeof BattlefieldPriority];

export type PrioritizedBattlefield = {
  battlefieldId: string;
  priority: BattlefieldPriority;
  side: "ATTACKER" | "DEFENDER";
  /** Current army remaining on our side. */
  ourArmyRemaining: number;
  /** Current enemy army remaining. */
  enemyArmyRemaining: number;
};

// ── Front Management ─────────────────────────────────────────────────────────

/**
 * Create a new war front against an enemy.
 */
export function createWarFront(args: {
  id: string;
  enemyFortressId: string;
  battalionIds: string[];
  now: number;
}): WarFront {
  return {
    id: args.id,
    enemyFortressId: args.enemyFortressId,
    assignedBattalionIds: args.battalionIds,
    status: FrontStatus.ADVANCING,
    createdAt: args.now,
  };
}

/**
 * Assign additional battalions to an existing front.
 */
export function assignBattalionsToFront(
  front: WarFront,
  battalionIds: string[],
): WarFront {
  const existingIds = new Set(front.assignedBattalionIds);
  const newIds = battalionIds.filter((id) => !existingIds.has(id));
  return {
    ...front,
    assignedBattalionIds: [...front.assignedBattalionIds, ...newIds],
    status: front.status === FrontStatus.STALLED ? FrontStatus.ADVANCING : front.status,
  };
}

/**
 * Remove battalions from a front (e.g., reassigned to another front).
 */
export function removeBattalionsFromFront(
  front: WarFront,
  battalionIds: string[],
): WarFront {
  const removeSet = new Set(battalionIds);
  const remaining = front.assignedBattalionIds.filter(
    (id) => !removeSet.has(id),
  );

  const newStatus =
    remaining.length === 0 ? FrontStatus.DEFEATED : front.status;

  return {
    ...front,
    assignedBattalionIds: remaining,
    status: newStatus,
  };
}

/**
 * Update the status of a front based on current conditions.
 */
export function updateFrontStatus(
  front: WarFront,
  args: {
    hasReachableTargets: boolean;
    hasBattalionsAlive: boolean;
    allPriorityTilesCaptured: boolean;
  },
): WarFront {
  if (!args.hasBattalionsAlive) {
    return { ...front, status: FrontStatus.DEFEATED };
  }
  if (args.allPriorityTilesCaptured) {
    return { ...front, status: FrontStatus.VICTORIOUS };
  }
  if (!args.hasReachableTargets) {
    return { ...front, status: FrontStatus.STALLED };
  }
  return { ...front, status: FrontStatus.ADVANCING };
}

// ── Target Selection ─────────────────────────────────────────────────────────

/**
 * A tile that can be targeted for attack.
 */
export type ReachableTarget = {
  tileId: string;
  /** Priority set by the player. */
  priority: TileAttackPriority;
  /** Whether this tile is connected to our owned territory. */
  isConnected: boolean;
  /** Estimated defense strength on this tile. */
  estimatedDefense: number;
  /** Distance in tiles from our nearest owned tile. */
  distance: number;
};

/**
 * Find the next target tile for a front.
 *
 * Rules:
 * 1. Only tiles with priority > NONE
 * 2. Must be connected to our owned territory
 * 3. Sorted by: priority (descending), then distance (ascending)
 * 4. Returns the highest-priority closest tile
 */
export function selectNextTarget(
  targets: ReachableTarget[],
): ReachableTarget | null {
  const eligible = targets.filter(
    (t) => t.priority > TileAttackPriority.NONE && t.isConnected,
  );

  if (eligible.length === 0) return null;

  eligible.sort((a, b) => {
    // Higher priority first.
    if (a.priority !== b.priority) return b.priority - a.priority;
    // Closer first.
    return a.distance - b.distance;
  });

  return eligible[0];
}

// ── Battlefield Priority ─────────────────────────────────────────────────────

/**
 * Sort battlefields by priority for reinforcement.
 * Returns battlefields in the order they should receive reinforcements.
 */
export function sortBattlefieldsByPriority(
  battlefields: PrioritizedBattlefield[],
): PrioritizedBattlefield[] {
  return [...battlefields].sort((a, b) => {
    // Higher priority first.
    if (a.priority !== b.priority) return b.priority - a.priority;
    // More desperate (lower our army ratio) first.
    const ratioA = a.ourArmyRemaining / Math.max(1, a.enemyArmyRemaining);
    const ratioB = b.ourArmyRemaining / Math.max(1, b.enemyArmyRemaining);
    return ratioA - ratioB;
  });
}

/**
 * Calculate how many reinforcements a battlefield needs.
 */
export function getBattlefieldReinforcementNeeds(
  battlefield: PrioritizedBattlefield,
  reinforcementPool: number,
): number {
  if (battlefield.priority === BattlefieldPriority.NONE) return 0;

  const deficit = Math.max(
    0,
    battlefield.enemyArmyRemaining - battlefield.ourArmyRemaining,
  );

  // Reinforce up to the deficit, capped by available pool.
  return Math.min(deficit, reinforcementPool);
}

// ── Front Summary ────────────────────────────────────────────────────────────

export type FrontSummary = {
  frontId: string;
  enemyId: string;
  status: FrontStatus;
  battalionCount: number;
  totalArmyCommitted: number;
  currentTarget: string | null;
  nextTargets: string[];
};

/**
 * Generate a human-readable summary of a front's status.
 */
export function summarizeFront(args: {
  front: WarFront;
  battalionCount: number;
  totalArmyCommitted: number;
  currentTarget: string | null;
  remainingTargets: string[];
}): FrontSummary {
  return {
    frontId: args.front.id,
    enemyId: args.front.enemyFortressId,
    status: args.front.status,
    battalionCount: args.battalionCount,
    totalArmyCommitted: args.totalArmyCommitted,
    currentTarget: args.currentTarget,
    nextTargets: args.remainingTargets.slice(0, 5),
  };
}
