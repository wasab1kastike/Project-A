import { prisma } from "@/lib/prisma";
import { GameError } from "./errors";
import { isFortressRace, type FortressRace } from "./races";
import { getRaceSkillTree, getSkillTier } from "./race-skill-tree";

export async function getSkillTreeState({
  fortressId,
}: {
  fortressId: string;
}) {
  const purchases = await prisma.raceSkillPurchase.findMany({
    where: { fortressId },
    select: { path: true, tier: true },
  });

  const unlocked = new Map(purchases.map((p) => [p.path, p.tier]));
  const totalPurchased = purchases.reduce((sum, p) => sum + p.tier, 0);
  const availablePoints = Math.max(0, getMaxSkillPoints() - totalPurchased);

  return { unlocked, totalPurchased, availablePoints };
}

export function getMaxSkillPoints(): number {
  return 12;
}

export function getEarnedSkillPoints(fortress: {
  level: number;
  ownedTileCount: number;
}): number {
  const fromLevel = Math.max(0, fortress.level - 1);
  const fromTiles = Math.floor(fortress.ownedTileCount / 3);
  return fromLevel + fromTiles;
}

export async function purchaseSkillTier({
  userId,
  fortressId,
  pathKey,
  now = new Date(),
}: {
  userId: string;
  fortressId: string;
  pathKey: string;
  now?: Date;
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

    const tree = getRaceSkillTree(fortress.race);
    const path = tree.paths.find((p) => p.key === pathKey);

    if (!path) {
      throw new GameError("That skill path is not available for your race.");
    }

    const purchases = await tx.raceSkillPurchase.findMany({
      where: { fortressId },
      select: { path: true, tier: true },
    });

    const totalPurchased = purchases.reduce((sum, p) => sum + p.tier, 0);
    const availablePoints = Math.max(0, getMaxSkillPoints() - totalPurchased);
    const currentTier = purchases.find((p) => p.path === pathKey)?.tier ?? 0;
    const nextTier = currentTier + 1;

    if (nextTier > path.tiers.length) {
      throw new GameError("That path is fully unlocked.");
    }

    const earned = getEarnedSkillPoints({
      level: fortress.level,
      ownedTileCount: fortress._count.ownedMapHexes,
    });

    if (earned <= totalPurchased || availablePoints <= 0) {
      throw new GameError(
        "No skill points available. Level up your castle or claim more territory."
      );
    }

    const tier = getSkillTier(fortress.race, pathKey, nextTier);
    if (!tier) throw new GameError("Invalid skill tier.");

    await tx.raceSkillPurchase.upsert({
      where: { fortressId_path: { fortressId, path: pathKey } },
      create: { fortressId, path: pathKey, tier: nextTier },
      update: { tier: nextTier },
    });

    return { path: pathKey, tier: nextTier, rewards: tier.rewards };
  });
}

export function getActiveSkillRewards({
  race,
  purchases,
}: {
  race: FortressRace | null;
  purchases: Array<{ path: string; tier: number }>;
}): Array<{ path: string; tier: number; label: string; effect: string; value?: number }> {
  if (!race || !isFortressRace(race)) return [];
  const results: Array<{ path: string; tier: number; label: string; effect: string; value?: number }> = [];

  for (const purchase of purchases) {
    const tier = getSkillTier(race, purchase.path, purchase.tier);
    if (tier) {
      for (const reward of tier.rewards) {
        results.push({ path: purchase.path, tier: purchase.tier, ...reward });
      }
    }
  }

  return results;
}
