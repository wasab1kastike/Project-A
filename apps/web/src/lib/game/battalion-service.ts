// =============================================================================
// Battalion Service — Season 4
// =============================================================================
// Service layer for battalion CRUD, war front management, and war policy.
// Uses Prisma transactions. Called by server actions in game-actions.ts.
// =============================================================================

import { prisma } from "@/lib/prisma";
import { CycleStatus, Prisma, type FortressRace } from "@/lib/prisma-client";
import { GameError } from "./errors";
import {
  DEFAULT_BATTALION_MAX_SIZE,
  BATTALION_COMMISSION_COST,
  MAX_BATTALION_SIZE,
  TIER_MAX_SIZES,
  getBattalionSlots,
  generateBattalionName,
  getBattalionModeUpdate,
  normalizeBattalionMode,
  type BattalionTier,
} from "./battalion-types";
import { applyFieldPromotion } from "./army-xp";
import { getSkillModifiers } from "./race-skill-effects";

type BattalionPrisma = typeof prisma;
type BattalionTx = Prisma.TransactionClient;
type BattalionDb = BattalionPrisma | BattalionTx;

type OwnedFortress = {
  id: string;
  cycleId: string;
  ownerId: string;
  level: number;
  gold: number;
  race: FortressRace | null;
  skillPurchases: Array<{ nodeKey: string }>;
};

const ACTIVE_BATTALION_CYCLE_STATUSES = [
  CycleStatus.REGISTRATION,
  CycleStatus.TESTING,
  CycleStatus.ACTIVE,
];

async function getOwnedFortress(
  db: BattalionDb,
  args: { userId: string; fortressId?: string },
): Promise<OwnedFortress> {
  const fortress = await db.fortress.findFirst({
    where: {
      ownerId: args.userId,
      isNpc: false,
      ...(args.fortressId ? { id: args.fortressId } : {}),
      cycle: { status: { in: ACTIVE_BATTALION_CYCLE_STATUSES } },
    },
    orderBy: { joinedAt: "desc" },
    select: {
      id: true,
      cycleId: true,
      ownerId: true,
      level: true,
      gold: true,
      race: true,
      skillPurchases: {
        select: { nodeKey: true },
      },
    },
  });

  if (!fortress) {
    throw new GameError("Active fortress not found.");
  }

  return fortress;
}

async function getOwnedBattalion(
  db: BattalionDb,
  args: { userId: string; battalionId: string },
) {
  const battalion = await db.battalion.findFirst({
    where: {
      id: args.battalionId,
      fortress: {
        ownerId: args.userId,
        isNpc: false,
        cycle: { status: { in: ACTIVE_BATTALION_CYCLE_STATUSES } },
      },
    },
    include: {
      fortress: {
        select: {
          id: true,
          cycleId: true,
          ownerId: true,
          level: true,
          gold: true,
          race: true,
          skillPurchases: {
            select: { nodeKey: true },
          },
        },
      },
    },
  });

  if (!battalion) {
    throw new GameError("Battalion not found.");
  }

  return battalion;
}

function toArmyXpBattalion(battalion: Awaited<ReturnType<typeof getOwnedBattalion>>) {
  return {
    id: battalion.id,
    name: battalion.name,
    size: battalion.size,
    maxSize: battalion.maxSize,
    tier: battalion.tier as 0 | 1 | 2 | 3,
    xp: battalion.xp,
    readyAt: battalion.readyAt?.getTime() ?? null,
    stance: battalion.stance as never,
    garrisonedAt: battalion.garrisonedAt,
    stanceLockedUntil: battalion.stanceLockedUntil?.getTime() ?? null,
  };
}

// ═════════════════════════════════════════════════════════════════════════════
// Battalion CRUD
// ═════════════════════════════════════════════════════════════════════════════

export async function createBattalion(args: {
  userId: string;
  name?: string;
  fortressId?: string;
}): Promise<{ id: string; name: string }> {
  return prisma.$transaction(async (tx) => {
    const fortress = await getOwnedFortress(tx, args);
    const skillModifiers = fortress.race
      ? getSkillModifiers({
          race: fortress.race,
          purchases: fortress.skillPurchases,
        })
      : null;
    const existingBattalionCount = await tx.battalion.count({
      where: { cycleId: fortress.cycleId, fortressId: fortress.id },
    });
    const slots = getBattalionSlots(
      fortress.level,
      0,
      skillModifiers?.battalionSlotBonus ?? 0,
    );

    if (existingBattalionCount >= slots) {
      throw new GameError(
        `Maximum battalions reached (${slots}). Upgrade your fortress to unlock more slots.`,
      );
    }

    if (fortress.gold < BATTALION_COMMISSION_COST) {
      throw new GameError(
        `Commissioning a battalion costs ${BATTALION_COMMISSION_COST} gold.`,
      );
    }

    const name =
      args.name ??
      generateBattalionName(
        fortress.race ?? "DWARFS",
        existingBattalionCount,
      );

    const battalion = await tx.battalion.create({
      data: {
        cycleId: fortress.cycleId,
        fortressId: fortress.id,
        name,
        size: 0,
        maxSize: Math.floor(
          DEFAULT_BATTALION_MAX_SIZE *
            (1 + (skillModifiers?.battalionMaxSizePercent ?? 0) / 100),
        ),
        tier: 0,
        xp: 0,
        stance: "REST",
        mode: "RESERVE",
      },
      select: { id: true, name: true },
    });

    await tx.fortress.update({
      where: { id: fortress.id },
      data: { gold: { decrement: BATTALION_COMMISSION_COST } },
    });

    return battalion;
  });
}

export async function expandBattalion(args: {
  userId: string;
  battalionId: string;
  targetMaxSize: number;
}): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const battalion = await getOwnedBattalion(tx, args);
    const skillModifiers = battalion.fortress.race
      ? getSkillModifiers({
          race: battalion.fortress.race,
          purchases: battalion.fortress.skillPurchases,
        })
      : null;
    const tierMax =
      TIER_MAX_SIZES[battalion.tier as BattalionTier] ?? MAX_BATTALION_SIZE;
    const skilledTierMax = Math.floor(
      tierMax * (1 + (skillModifiers?.battalionMaxSizePercent ?? 0) / 100),
    );
    const targetSize = Math.max(
      battalion.maxSize,
      Math.min(args.targetMaxSize, skilledTierMax),
    );

    if (targetSize <= battalion.maxSize) {
      throw new GameError("New max size must be larger than current.");
    }

    await tx.battalion.update({
      where: { id: args.battalionId },
      data: { maxSize: targetSize },
    });
  });
}

export async function disbandBattalion(args: {
  userId: string;
  battalionId: string;
}): Promise<{ goldRefund: number }> {
  const battalion = await getOwnedBattalion(prisma, args);

  // Check if battalion is assigned to a front.
  const assignment = await prisma.battalionAssignment.findUnique({
    where: { battalionId: args.battalionId },
  });

  if (assignment) {
    throw new GameError(
      "Cannot disband a battalion assigned to a war front. Remove it from the front first.",
    );
  }

  const refund = Math.floor(BATTALION_COMMISSION_COST * 0.5);

  await prisma.$transaction(async (tx) => {
    await tx.battalion.delete({ where: { id: args.battalionId } });
    await tx.fortress.update({
      where: { id: battalion.fortressId },
      data: { gold: { increment: refund } },
    });
  });

  return { goldRefund: refund };
}

export async function setBattalionStance(args: {
  userId: string;
  battalionId: string;
  stance: string;
}): Promise<void> {
  const battalion = await getOwnedBattalion(prisma, args);
  const update = getBattalionModeUpdate(battalion.mode ?? "GUARD");

  await prisma.battalion.update({
    where: { id: args.battalionId },
    data: update,
  });
}

export async function promoteBattalion(args: {
  userId: string;
  battalionId: string;
}): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const battalion = await getOwnedBattalion(tx, args);
    const skillModifiers = battalion.fortress.race
      ? getSkillModifiers({
          race: battalion.fortress.race,
          purchases: battalion.fortress.skillPurchases,
        })
      : null;
    const result = applyFieldPromotion(
      toArmyXpBattalion(battalion),
      skillModifiers?.promotionDiscountPercent ?? 0,
    );

    if (!result) {
      throw new GameError("Cannot promote this battalion.");
    }

    if (battalion.fortress.gold < result.goldCost) {
      throw new GameError(
        `Promoting this battalion costs ${result.goldCost} gold (you have ${battalion.fortress.gold}).`,
      );
    }

    await tx.battalion.update({
      where: { id: args.battalionId },
      data: { tier: result.newTier, xp: 0 },
    });
    await tx.fortress.update({
      where: { id: battalion.fortressId },
      data: { gold: { decrement: result.goldCost } },
    });
  });
}

// ═════════════════════════════════════════════════════════════════════════════
// War Policy
// ═════════════════════════════════════════════════════════════════════════════

export async function setGuardPercent(args: {
  userId: string;
  fortressId?: string;
  guardPercent: number;
}): Promise<void> {
  if (args.guardPercent < 0 || args.guardPercent > 100) {
    throw new GameError("Guard percentage must be between 0 and 100.");
  }

  const fortress = await getOwnedFortress(prisma, args);

  await prisma.warPolicy.upsert({
    where: { cycleId_fortressId: { cycleId: fortress.cycleId, fortressId: fortress.id } },
    create: {
      cycleId: fortress.cycleId,
      fortressId: fortress.id,
      guardPercent: args.guardPercent,
      maxArmySize: 500,
      defaultAggression: "BALANCED",
    },
    update: { guardPercent: args.guardPercent },
  });
}

export async function setMaxArmySize(args: {
  userId: string;
  fortressId?: string;
  maxArmySize: number;
}): Promise<void> {
  if (args.maxArmySize < 100) {
    throw new GameError("Maximum army size must be at least 100.");
  }

  const fortress = await getOwnedFortress(prisma, args);

  await prisma.warPolicy.upsert({
    where: { cycleId_fortressId: { cycleId: fortress.cycleId, fortressId: fortress.id } },
    create: {
      cycleId: fortress.cycleId,
      fortressId: fortress.id,
      maxArmySize: args.maxArmySize,
      guardPercent: 30,
      defaultAggression: "BALANCED",
    },
    update: { maxArmySize: args.maxArmySize },
  });
}

export async function setDefaultAggression(args: {
  userId: string;
  fortressId?: string;
  aggression: string;
}): Promise<void> {
  const valid = ["CAUTIOUS", "BALANCED", "AGGRESSIVE"];
  if (!valid.includes(args.aggression)) {
    throw new GameError(`Invalid aggression: ${args.aggression}`);
  }

  const fortress = await getOwnedFortress(prisma, args);

  await prisma.warPolicy.upsert({
    where: { cycleId_fortressId: { cycleId: fortress.cycleId, fortressId: fortress.id } },
    create: {
      cycleId: fortress.cycleId,
      fortressId: fortress.id,
      defaultAggression: args.aggression,
      maxArmySize: 500,
      guardPercent: 30,
    },
    update: { defaultAggression: args.aggression },
  });
}

// ═════════════════════════════════════════════════════════════════════════════
// War Fronts
// ═════════════════════════════════════════════════════════════════════════════

export async function setAllianceSupportPolicy(args: {
  userId: string;
  fortressId?: string;
  supportAttack: boolean;
  supportDefense: boolean;
}): Promise<void> {
  const fortress = await getOwnedFortress(prisma, args);

  await prisma.warPolicy.upsert({
    where: { cycleId_fortressId: { cycleId: fortress.cycleId, fortressId: fortress.id } },
    create: {
      cycleId: fortress.cycleId,
      fortressId: fortress.id,
      defaultAggression: "BALANCED",
      maxArmySize: 500,
      guardPercent: 30,
      allianceSupportAttack: args.supportAttack,
      allianceSupportDefense: args.supportDefense,
    },
    update: {
      allianceSupportAttack: args.supportAttack,
      allianceSupportDefense: args.supportDefense,
    },
  });
}

export async function createWarFront(args: {
  userId: string;
  attackerFortressId?: string;
  enemyFortressId: string;
}): Promise<{ id: string }> {
  const attacker = await getOwnedFortress(prisma, {
    userId: args.userId,
    fortressId: args.attackerFortressId,
  });

  // Check that the two fortresses are at war.
  const relation = await prisma.diplomacyRelation.findFirst({
    where: {
      cycleId: attacker.cycleId,
      status: "WAR",
      OR: [
        { fortressAId: attacker.id, fortressBId: args.enemyFortressId },
        { fortressAId: args.enemyFortressId, fortressBId: attacker.id },
      ],
    },
  });

  if (!relation) {
    throw new GameError(
      "You must be at war with a fortress to open a front.",
    );
  }

  // Check for existing front.
  const existing = await prisma.warFront.findUnique({
    where: {
      cycleId_attackerFortressId_enemyFortressId: {
        cycleId: attacker.cycleId,
        attackerFortressId: attacker.id,
        enemyFortressId: args.enemyFortressId,
      },
    },
  });

  if (existing) {
    throw new GameError("A front already exists against this enemy.");
  }

  const front = await prisma.warFront.create({
    data: {
      cycleId: attacker.cycleId,
      attackerFortressId: attacker.id,
      enemyFortressId: args.enemyFortressId,
      status: "ADVANCING",
      aggression: "BALANCED",
    },
    select: { id: true },
  });

  return front;
}

export async function assignBattalionToFront(args: {
  userId: string;
  battalionId: string;
  frontId: string;
}): Promise<void> {
  // Verify battalion belongs to this fortress.
  const battalion = await getOwnedBattalion(prisma, args);
  if ((battalion.mode ?? "GUARD") !== "ATTACK" || battalion.size <= 0) {
    throw new GameError("Only attack-ready battalions with troops can join a war front.");
  }

  // Verify front exists and belongs to this fortress.
  const front = await prisma.warFront.findFirst({
    where: { id: args.frontId, attackerFortressId: battalion.fortressId },
  });
  if (!front) throw new GameError("War front not found.");

  // Check if battalion already assigned.
  const existing = await prisma.battalionAssignment.findUnique({
    where: { battalionId: args.battalionId },
  });
  if (existing) {
    throw new GameError("Battalion is already assigned to a front.");
  }

  await prisma.battalionAssignment.create({
    data: {
      battalionId: args.battalionId,
      frontId: args.frontId,
    },
  });
}

export async function removeBattalionFromFront(args: {
  userId: string;
  battalionId: string;
  frontId: string;
}): Promise<void> {
  const battalion = await getOwnedBattalion(prisma, args);
  const assignment = await prisma.battalionAssignment.findFirst({
    where: {
      battalionId: battalion.id,
      frontId: args.frontId,
      front: { attackerFortressId: battalion.fortressId },
    },
  });
  if (!assignment) throw new GameError("Battalion is not assigned to this front.");

  await prisma.battalionAssignment.delete({
    where: { id: assignment.id },
  });
}

export async function setFrontAggression(args: {
  userId: string;
  frontId: string;
  fortressId?: string;
  aggression: string;
}): Promise<void> {
  const valid = ["CAUTIOUS", "BALANCED", "AGGRESSIVE"];
  if (!valid.includes(args.aggression)) {
    throw new GameError(`Invalid aggression: ${args.aggression}`);
  }

  const fortress = await getOwnedFortress(prisma, args);
  const front = await prisma.warFront.findFirst({
    where: { id: args.frontId, attackerFortressId: fortress.id },
  });
  if (!front) throw new GameError("War front not found.");

  await prisma.warFront.update({
    where: { id: args.frontId },
    data: { aggression: args.aggression },
  });
}

export async function retreatFront(args: {
  userId: string;
  frontId: string;
  fortressId?: string;
}): Promise<void> {
  const fortress = await getOwnedFortress(prisma, args);
  const front = await prisma.warFront.findFirst({
    where: { id: args.frontId, attackerFortressId: fortress.id },
  });
  if (!front) throw new GameError("War front not found.");

  if (front.status === "DEFEATED" || front.status === "VICTORIOUS") {
    throw new GameError("This front is already resolved.");
  }

  await prisma.$transaction(async (tx) => {
    await tx.warFront.update({
      where: { id: args.frontId },
      data: { status: "RETREATING" },
    });
    await tx.battalionAssignment.deleteMany({
      where: { frontId: args.frontId },
    });
  });
}

export async function setBattalionMode({
  userId,
  battalionId,
  mode,
}: {
  userId: string;
  battalionId: string;
  mode: string;
}): Promise<void> {
  const normalizedMode = normalizeBattalionMode(mode);
  if (normalizedMode !== mode) {
    throw new GameError("Invalid mode. Use ATTACK, GUARD, RESERVE, or ALLIANCE.");
  }

  const battalion = await getOwnedBattalion(prisma, { userId, battalionId });
  const update = getBattalionModeUpdate(normalizedMode);

  await prisma.$transaction(async (tx) => {
    if (normalizedMode !== "ATTACK") {
      await tx.battalionAssignment.deleteMany({ where: { battalionId } });
    }

    await tx.battalion.update({
      where: { id: battalion.id },
      data: update,
    });
  });
}
