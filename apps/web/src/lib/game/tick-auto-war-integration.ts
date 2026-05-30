// =============================================================================
// Tick Auto-War Integration — Automated campaign dispatch for war fronts
// =============================================================================
// Called from tick.ts before processSeasonFourCampaigns. Checks active war
// fronts and auto-creates campaign orders for idle battalions.
// =============================================================================

import type { PrismaClient } from "@prisma/client";
import {
  AggressionStance,
  AGGRESSION_STANCE_COMMITMENT,
  FrontStatus,
  selectNextTarget,
  type ReachableTarget,
  type PriorityTile,
} from "./war-front";
import { HEX_TILES } from "./map-hex";

// ── Types ────────────────────────────────────────────────────────────────────

type FortressSnapshot = {
  id: string;
  level: number;
  army: number;
  mapX: number;
  mapY: number;
  ownerId: string;
};

type DiplomacySnapshot = {
  status: string;
  fortressAId: string;
  fortressBId: string;
};

type OwnedTileSnapshot = {
  tileId: string;
  ownerFortressId: string;
};

type CampaignSnapshot = {
  id: string;
  attackerFortressId: string;
  defenderFortressId: string;
  targetTileId: string;
  armyOrder: { committedArmy: number; status: string } | null;
};

// ── Integration ──────────────────────────────────────────────────────────────

/**
 * Process auto-war for one tick. Checks all warring fortresses and creates
 * automated campaign orders for fronts with idle battalions.
 *
 * Call this from tick.ts BEFORE processSeasonFourCampaigns.
 *
 * Current implementation: finds fortresses at war and logs auto-war status.
 * Full integration requires battalion data from DB (not yet modeled).
 */
export async function processAutoWarDispatch(args: {
  db: PrismaClient;
  cycleId: string;
  now: Date;
  /** All fortresses in the cycle. */
  fortresses: FortressSnapshot[];
  /** All active diplomacy relations. */
  diplomacyRelations: DiplomacySnapshot[];
  /** All owned tiles. */
  ownedTiles: OwnedTileSnapshot[];
  /** Active campaigns. */
  activeCampaigns: CampaignSnapshot[];
  /** Priority tiles per fortress (from DB or config). */
  priorityTiles: PriorityTile[];
}): Promise<void> {
  const { db, cycleId, now, fortresses, diplomacyRelations, ownedTiles, activeCampaigns } = args;

  // Find fortresses at war.
  const warPairs = diplomacyRelations.filter((r) => r.status === "WAR");

  console.log(`[auto-war] found ${warPairs.length} war pairs, ${activeCampaigns.length} active campaigns`);
  if (warPairs.length === 0) return;

  // Build lookup: fortress ID → owned tiles
  const ownedByFortress = new Map<string, Set<string>>();
  for (const ot of ownedTiles) {
    if (!ownedByFortress.has(ot.ownerFortressId)) {
      ownedByFortress.set(ot.ownerFortressId, new Set());
    }
    ownedByFortress.get(ot.ownerFortressId)!.add(ot.tileId);
  }

  // Build lookup: fortress ID → active campaign count
  const campaignCountByFortress = new Map<string, number>();
  for (const c of activeCampaigns) {
    const count = campaignCountByFortress.get(c.attackerFortressId) ?? 0;
    campaignCountByFortress.set(c.attackerFortressId, count + 1);
  }

  // For each warring pair, check if auto-war should dispatch an attack.
  for (const war of warPairs) {
    const attacker = fortresses.find((f) => f.id === war.fortressAId);
    const defender = fortresses.find((f) => f.id === war.fortressBId);

    if (!attacker || !defender) continue;

    // Skip if attacker already has campaigns at capacity.
    const activeCount = campaignCountByFortress.get(attacker.id) ?? 0;
    const maxCampaigns = 2 + attacker.level; // same as attack cap
    if (activeCount >= maxCampaigns) continue;

    // Build reachable targets for this front.
    const attackerOwnedTiles = ownedByFortress.get(attacker.id) ?? new Set();
    const defenderOwnedTiles = ownedByFortress.get(defender.id) ?? new Set();

    const reachableTargets: ReachableTarget[] = [];

    for (const tileId of defenderOwnedTiles) {
      // Check if tile is adjacent to attacker's territory.
      const tile = HEX_TILES.find((t) => t.id === tileId);
      if (!tile) continue;

      const isConnected = isAdjacentToOwned(tile, HEX_TILES, attackerOwnedTiles);

      // Prioritize tiles that are marked as priority targets.
      const priorityMatch = args.priorityTiles.find(
        (pt) => pt.tileId === tileId && pt.targetEnemyId === defender.id,
      );

      reachableTargets.push({
        tileId,
        priority: priorityMatch?.priority ?? 0,
        isConnected,
        estimatedDefense: defender.army, // simplified
        distance: estimateDistance(attacker, defender),
      });
    }

    // Select best target.
    const target = selectNextTarget(reachableTargets);
    if (!target) continue;

    // Auto-create front if none exists.
    let front = await db.warFront.findFirst({
      where: { cycleId, attackerFortressId: attacker.id, enemyFortressId: defender.id },
    });
    if (!front) {
      front = await db.warFront.create({
        data: {
          cycleId,
          attackerFortressId: attacker.id,
          enemyFortressId: defender.id,
          status: "ADVANCING",
          aggression: "BALANCED",
        },
      });
    }

    // Get battalion IDs: assigned to front first, then any idle.
    const assignedIds = (
      await db.battalionAssignment.findMany({
        where: { frontId: front.id },
        select: { battalionId: true },
      })
    ).map((a) => a.battalionId);

    let activeIds = assignedIds;
    if (activeIds.length === 0) {
      const idle = await db.battalion.findMany({
        where: { fortressId: attacker.id, size: { gt: 0 } },
        select: { id: true, size: true },
      });
      activeIds = idle.map((b) => b.id);
    }

    const battalions = await db.battalion.findMany({
      where: { id: { in: activeIds }, size: { gt: 0 } },
      select: { id: true, size: true },
    });
    const totalAvailable = battalions.reduce((s, b) => s + b.size, 0);
    if (totalAvailable <= 0) continue;

    const aggression = (front.aggression as AggressionStance) ?? "BALANCED";
    const rate = AGGRESSION_STANCE_COMMITMENT[aggression];
    const commitAmount = Math.max(1, Math.floor(totalAvailable * rate));
    const cappedAmount = Math.min(commitAmount, Math.max(10, defender.army * 2));

    try {
      await db.$transaction(async (tx) => {
        const order = await tx.armyOrder.create({
          data: {
            cycleId,
            fortressId: attacker.id,
            type: "CAMPAIGN",
            status: "ACTIVE",
            committedArmy: cappedAmount,
            targetTileId: target.tileId,
            targetFortressId: defender.id,
            startsAt: now,
          },
        });
        await tx.territoryCampaign.create({
          data: {
            cycleId,
            attackerFortressId: attacker.id,
            defenderFortressId: defender.id,
            targetTileId: target.tileId,
            armyOrderId: order.id,
            status: "BUILDING",
            progress: 0,
          },
        });
        console.log(
          `[auto-war] ${attacker.id} → ${defender.id}: ${cappedAmount} army → ${target.tileId} (${aggression})`,
        );
      });
    } catch (_err) {
      // Campaign may already exist — fine.
    }
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function isAdjacentToOwned(
  tile: { col: number; row: number },
  allTiles: typeof HEX_TILES,
  ownedSet: Set<string>,
): boolean {
  const isEvenCol = tile.col % 2 === 0;
  const offsets: [number, number][] = [
    [-1, 0], [1, 0], [0, -1], [0, 1],
  ];
  if (isEvenCol) {
    offsets.push([-1, -1], [-1, 1]);
  } else {
    offsets.push([1, -1], [1, 1]);
  }

  for (const [dc, dr] of offsets) {
    const neighbor = allTiles.find(
      (t) => t.col === tile.col + dc && t.row === tile.row + dr,
    );
    if (neighbor && ownedSet.has(neighbor.id)) return true;
  }

  return false;
}

function estimateDistance(
  a: { mapX: number; mapY: number },
  b: { mapX: number; mapY: number },
): number {
  const dx = a.mapX - b.mapX;
  const dy = a.mapY - b.mapY;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Compute how much army should be committed for an auto-war attack
 * based on aggression stance and available army.
 */
export function getAutoWarCommitment(
  availableArmy: number,
  aggression: AggressionStance,
): number {
  const rate = AGGRESSION_STANCE_COMMITMENT[aggression];
  return Math.max(1, Math.floor(availableArmy * rate));
}
