import { prisma } from "@/lib/prisma";
import { GameError } from "./errors";
import { isFortressRace, type FortressRace } from "./races";
import {
  MAX_SKILL_POINTS,
  getPurchasedNodeRewards,
  getRaceSkillTree,
  getSkillNode,
  getSkillPathForNode,
} from "./race-skill-tree";

export type RaceSkillPurchaseSummary = {
  nodeKey: string;
};

export async function getSkillTreeState({
  fortressId,
}: {
  fortressId: string;
}) {
  const purchases = await prisma.raceSkillPurchase.findMany({
    where: { fortressId },
    select: { nodeKey: true },
  });

  const purchasedNodeKeys = purchases.map((purchase) => purchase.nodeKey);
  const totalPurchased = purchasedNodeKeys.length;
  const availablePoints = getAvailableSkillPoints({
    earnedPoints: getMaxSkillPoints(),
    totalPurchased,
  });

  return { purchasedNodeKeys, totalPurchased, availablePoints };
}

export function getMaxSkillPoints(): number {
  return MAX_SKILL_POINTS;
}

export function getEarnedSkillPoints(fortress: {
  level: number;
  ownedTileCount: number;
}): number {
  const fromLevel = Math.max(0, fortress.level - 1);
  const fromTiles = Math.floor(fortress.ownedTileCount / 3);
  return Math.min(getMaxSkillPoints(), fromLevel + fromTiles);
}

export function getAvailableSkillPoints({
  earnedPoints,
  totalPurchased,
}: {
  earnedPoints: number;
  totalPurchased: number;
}): number {
  return Math.max(
    0,
    Math.min(getMaxSkillPoints(), earnedPoints) - Math.max(0, totalPurchased)
  );
}

export function getPurchasedNodeKeySet(
  purchases: Array<RaceSkillPurchaseSummary>
): Set<string> {
  return new Set(purchases.map((purchase) => purchase.nodeKey));
}

export function getPathPurchasedNodeCount({
  race,
  pathKey,
  purchases,
}: {
  race: FortressRace;
  pathKey: string;
  purchases: Array<RaceSkillPurchaseSummary>;
}): number {
  const tree = getRaceSkillTree(race);
  const path = tree.paths.find((candidate) => candidate.key === pathKey);
  if (!path) return 0;
  const purchased = getPurchasedNodeKeySet(purchases);
  return path.nodes.filter((node) => purchased.has(node.key)).length;
}

export function assertSkillNodeCanBePurchased({
  race,
  nodeKey,
  purchases,
  availablePoints,
}: {
  race: FortressRace;
  nodeKey: string;
  purchases: Array<RaceSkillPurchaseSummary>;
  availablePoints: number;
}) {
  const node = getSkillNode(race, nodeKey);

  if (!node) {
    throw new GameError("That skill node is not available for your race.");
  }

  const path = getSkillPathForNode(race, nodeKey);
  const purchased = getPurchasedNodeKeySet(purchases);

  if (purchased.has(nodeKey)) {
    throw new GameError("That skill node is already unlocked.");
  }

  if (availablePoints <= 0) {
    throw new GameError(
      "No skill points available. Level up your castle or claim more territory."
    );
  }

  const previousNode = path?.nodes.find(
    (candidate) => candidate.level === node.level - 1
  );

  if (previousNode && !purchased.has(previousNode.key)) {
    throw new GameError("Unlock the previous node in this branch first.");
  }

  return node;
}

export async function purchaseSkillNode({
  userId,
  fortressId,
  nodeKey,
}: {
  userId: string;
  fortressId: string;
  nodeKey: string;
}) {
  return prisma.$transaction(async (tx) => {
    const fortress = await tx.fortress.findUnique({
      where: { id: fortressId },
      select: {
        id: true,
        ownerId: true,
        race: true,
        level: true,
        _count: { select: { ownedMapHexes: true } },
      },
    });

    if (!fortress || fortress.ownerId !== userId) {
      throw new GameError("You do not control this fortress.");
    }

    if (!fortress.race || !isFortressRace(fortress.race)) {
      throw new GameError("Choose a race before investing in a skill tree.");
    }

    const purchases = await tx.raceSkillPurchase.findMany({
      where: { fortressId },
      select: { nodeKey: true },
    });

    const earned = getEarnedSkillPoints({
      level: fortress.level,
      ownedTileCount: fortress._count.ownedMapHexes,
    });
    const availablePoints = getAvailableSkillPoints({
      earnedPoints: earned,
      totalPurchased: purchases.length,
    });
    const node = assertSkillNodeCanBePurchased({
      race: fortress.race,
      nodeKey,
      purchases,
      availablePoints,
    });

    await tx.raceSkillPurchase.create({
      data: { fortressId, nodeKey },
    });

    return { nodeKey, rewards: node.rewards };
  });
}

export function getActiveSkillRewards({
  race,
  purchases,
}: {
  race: FortressRace | null;
  purchases: Array<RaceSkillPurchaseSummary>;
}): Array<{
  nodeKey: string;
  pathKey: string;
  level: number;
  label: string;
  effect: string;
  value?: number;
}> {
  if (!race || !isFortressRace(race)) return [];
  return getPurchasedNodeRewards({
    race,
    nodeKeys: purchases.map((purchase) => purchase.nodeKey),
  });
}
