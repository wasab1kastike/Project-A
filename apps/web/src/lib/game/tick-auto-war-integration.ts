// =============================================================================
// Tick Auto-War Integration - automated dispatch for Season 4 war fronts
// =============================================================================

import type { PrismaClient } from "@prisma/client";
import {
  AGGRESSION_STANCE_COMMITMENT,
  TileAttackPriority,
  selectNextTarget,
  type AggressionStance,
  type PriorityTile,
  type ReachableTarget,
} from "./war-front";
import { HEX_TILES } from "./map-hex";
import { getRoadAdjustedAttackArrival } from "./road-travel";

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

type AutoWarPriorityTile = PriorityTile & {
  fortressId?: string;
};

export async function processAutoWarDispatch(args: {
  db: PrismaClient;
  cycleId: string;
  now: Date;
  fortresses: FortressSnapshot[];
  diplomacyRelations: DiplomacySnapshot[];
  ownedTiles: OwnedTileSnapshot[];
  activeCampaigns: CampaignSnapshot[];
  priorityTiles: AutoWarPriorityTile[];
}): Promise<void> {
  const {
    db,
    cycleId,
    now,
    fortresses,
    diplomacyRelations,
    ownedTiles,
    activeCampaigns,
    priorityTiles,
  } = args;

  const warPairs = diplomacyRelations.filter((r) => r.status === "WAR");
  if (warPairs.length === 0) return;

  const ownedByFortress = new Map<string, Set<string>>();
  for (const ownedTile of ownedTiles) {
    if (!ownedByFortress.has(ownedTile.ownerFortressId)) {
      ownedByFortress.set(ownedTile.ownerFortressId, new Set());
    }
    ownedByFortress.get(ownedTile.ownerFortressId)!.add(ownedTile.tileId);
  }

  const campaignCountByFortress = new Map<string, number>();
  for (const campaign of activeCampaigns) {
    const count = campaignCountByFortress.get(campaign.attackerFortressId) ?? 0;
    campaignCountByFortress.set(campaign.attackerFortressId, count + 1);
  }

  for (const war of warPairs) {
    const directions = [
      { attackerId: war.fortressAId, defenderId: war.fortressBId },
      { attackerId: war.fortressBId, defenderId: war.fortressAId },
    ];

    for (const direction of directions) {
      const attacker = fortresses.find((f) => f.id === direction.attackerId);
      const defender = fortresses.find((f) => f.id === direction.defenderId);
      if (!attacker || !defender) continue;

      const activeCount = campaignCountByFortress.get(attacker.id) ?? 0;
      const maxCampaigns = 2 + attacker.level;
      if (activeCount >= maxCampaigns) continue;

      const attackerOwnedTiles = ownedByFortress.get(attacker.id) ?? new Set();
      const defenderOwnedTiles = ownedByFortress.get(defender.id) ?? new Set();
      const reachableTargets: ReachableTarget[] = [];

      for (const tileId of defenderOwnedTiles) {
        const tile = HEX_TILES.find((candidate) => candidate.id === tileId);
        if (!tile) continue;

        const priorityMatch = priorityTiles.find(
          (priority) =>
            priority.tileId === tileId &&
            priority.targetEnemyId === defender.id &&
            (!priority.fortressId || priority.fortressId === attacker.id),
        );

        reachableTargets.push({
          tileId,
          priority: priorityMatch?.priority ?? TileAttackPriority.NONE,
          isConnected: isAdjacentToOwned(tile, HEX_TILES, attackerOwnedTiles),
          estimatedDefense: defender.army,
          distance: estimateDistance(attacker, defender),
        });
      }

      const target = selectNextTarget(reachableTargets);
      if (!target) continue;

      let front = await db.warFront.findFirst({
        where: {
          cycleId,
          attackerFortressId: attacker.id,
          enemyFortressId: defender.id,
        },
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

      const assignedIds = (
        await db.battalionAssignment.findMany({
          where: { frontId: front.id },
          select: { battalionId: true },
        })
      ).map((assignment) => assignment.battalionId);

      let activeIds = assignedIds;
      if (activeIds.length === 0) {
        const idleBattalions = await db.battalion.findMany({
          where: { fortressId: attacker.id, size: { gt: 0 }, mode: "ATTACK" },
          select: { id: true },
        });
        activeIds = idleBattalions.map((battalion) => battalion.id);
      }

      const battalions = await db.battalion.findMany({
        where: { id: { in: activeIds }, size: { gt: 0 }, mode: "ATTACK" },
        select: { id: true, size: true },
      });
      const totalAvailable = battalions.reduce((sum, battalion) => sum + battalion.size, 0);
      if (totalAvailable <= 0) continue;

      const aggression = (front.aggression as AggressionStance) ?? "BALANCED";
      const rate = AGGRESSION_STANCE_COMMITMENT[aggression];
      const commitAmount = Math.max(1, Math.floor(totalAvailable * rate));
      const cappedAmount = Math.min(commitAmount, Math.max(10, defender.army * 2));
      const baseMinutes = Math.max(1, Math.floor(estimateDistance(attacker, defender) / 10));
      const { arrivesAt } = await getRoadAdjustedAttackArrival({
        db,
        cycleId,
        launchedAt: now,
        origin: attacker,
        target: defender,
        baseMinutes,
      });

      try {
        await db.$transaction(async (tx) => {
          let remainingDeduction = cappedAmount;
          for (const battalion of battalions) {
            if (remainingDeduction <= 0) break;
            const take = Math.min(battalion.size, remainingDeduction);
            await tx.battalion.update({
              where: { id: battalion.id },
              data: { size: { decrement: take } },
            });
            remainingDeduction -= take;
          }

          await tx.attackUnit.create({
            data: {
              cycleId,
              attackerFortressId: attacker.id,
              targetFortressId: defender.id,
              armyAmount: cappedAmount,
              launchedAt: now,
              arrivesAt,
            },
          });
        });
        campaignCountByFortress.set(attacker.id, activeCount + 1);
      } catch (_error) {
        // Target state can change mid-tick; the next tick can retry.
      }
    }
  }

}

function isAdjacentToOwned(
  tile: { col: number; row: number },
  allTiles: typeof HEX_TILES,
  ownedSet: Set<string>,
): boolean {
  const isEvenCol = tile.col % 2 === 0;
  const offsets: [number, number][] = [
    [-1, 0],
    [1, 0],
    [0, -1],
    [0, 1],
  ];

  if (isEvenCol) {
    offsets.push([-1, -1], [-1, 1]);
  } else {
    offsets.push([1, -1], [1, 1]);
  }

  for (const [dc, dr] of offsets) {
    const neighbor = allTiles.find(
      (candidate) => candidate.col === tile.col + dc && candidate.row === tile.row + dr,
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

export function getAutoWarCommitment(
  availableArmy: number,
  aggression: AggressionStance,
): number {
  const rate = AGGRESSION_STANCE_COMMITMENT[aggression];
  return Math.max(1, Math.floor(availableArmy * rate));
}
