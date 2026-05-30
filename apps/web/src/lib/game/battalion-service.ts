// =============================================================================
// Battalion Service — Season 4
// =============================================================================
// Service layer for battalion CRUD, war front management, and war policy.
// Uses Prisma transactions. Called by server actions in game-actions.ts.
// =============================================================================

import { prisma } from "@/lib/prisma";
import { GameError } from "./errors";
import {
  DEFAULT_BATTALION_MAX_SIZE,
  BATTALION_COMMISSION_COST,
  BATTALION_EXPAND_COST_PER_50,
  MAX_BATTALION_SIZE,
  TIER_MAX_SIZES,
  BATTALION_SLOTS_BY_LEVEL,
  getBattalionSlots,
  generateBattalionName,
  type BattalionTier,
} from "./battalion-types";

// ═════════════════════════════════════════════════════════════════════════════
// Battalion CRUD
// ═════════════════════════════════════════════════════════════════════════════

export async function createBattalion(args: {
  userId: string;
  cycleId: string;
  fortressId: string;
  name?: string;
  race?: string | null;
  fortressLevel: number;
  existingBattalionCount: number;
}): Promise<{ id: string; name: string }> {
  const slots = getBattalionSlots(args.fortressLevel, 0);
  if (args.existingBattalionCount >= slots) {
    throw new GameError(
      `Maximum battalions reached (${slots}). Upgrade your fortress to unlock more slots.`,
    );
  }

  const name =
    args.name ??
    generateBattalionName(
      (args.race as "DWARFS" | "ORKS" | "SPACE_MURINES" | "UNSTABLE_UNICORNS") ??
        "DWARFS",
      args.existingBattalionCount,
    );

  const battalion = await prisma.battalion.create({
    data: {
      cycleId: args.cycleId,
      fortressId: args.fortressId,
      name,
      size: 0,
      maxSize: DEFAULT_BATTALION_MAX_SIZE,
      tier: 0,
      xp: 0,
      stance: "REST",
    },
    select: { id: true, name: true },
  });

  return battalion;
}

export async function expandBattalion(args: {
  userId: string;
  battalionId: string;
  fortressId: string;
  targetMaxSize: number;
  availableGold: number;
}): Promise<void> {
  const battalion = await prisma.battalion.findFirst({
    where: { id: args.battalionId, fortressId: args.fortressId },
  });

  if (!battalion) {
    throw new GameError("Battalion not found.");
  }

  const tierMax = TIER_MAX_SIZES[battalion.tier as BattalionTier] ?? MAX_BATTALION_SIZE;
  const targetSize = Math.max(
    battalion.maxSize,
    Math.min(args.targetMaxSize, tierMax),
  );

  if (targetSize <= battalion.maxSize) {
    throw new GameError("New max size must be larger than current.");
  }

  const increment = targetSize - battalion.maxSize;
  const cost = Math.ceil((increment / 50) * BATTALION_EXPAND_COST_PER_50);

  if (args.availableGold < cost) {
    throw new GameError(
      `Expanding to ${targetSize} costs ${cost} gold (you have ${args.availableGold}).`,
    );
  }

  await prisma.$transaction(async (tx) => {
    await tx.battalion.update({
      where: { id: args.battalionId },
      data: { maxSize: targetSize },
    });

    await tx.fortress.update({
      where: { id: args.fortressId },
      data: { gold: { decrement: cost } },
    });

    await tx.fortress.update({
      where: { id: args.fortressId },
      data: { gold: { decrement: BATTALION_EXPAND_COST_PER_50 } },
    });
  });
}

export async function disbandBattalion(args: {
  userId: string;
  battalionId: string;
  fortressId: string;
}): Promise<{ goldRefund: number }> {
  const battalion = await prisma.battalion.findFirst({
    where: { id: args.battalionId, fortressId: args.fortressId },
  });

  if (!battalion) {
    throw new GameError("Battalion not found.");
  }

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
      where: { id: args.fortressId },
      data: { gold: { increment: refund } },
    });
  });

  return { goldRefund: refund };
}

export async function setBattalionStance(args: {
  userId: string;
  battalionId: string;
  fortressId: string;
  stance: string;
}): Promise<void> {
  const validStances = ["FORTIFY", "MOBILE"]; // REST/TRAINING/PATROL/AMBUSH planned for future
  if (!validStances.includes(args.stance)) {
    throw new GameError(`Invalid stance: ${args.stance}`);
  }

  const battalion = await prisma.battalion.findFirst({
    where: { id: args.battalionId, fortressId: args.fortressId },
  });

  if (!battalion) {
    throw new GameError("Battalion not found.");
  }

  // FORTIFY stance locks the battalion for 1 hour.
  const stanceLockedUntil =
    args.stance === "FORTIFY" ? new Date(Date.now() + 3_600_000) : null;

  await prisma.battalion.update({
    where: { id: args.battalionId },
    data: {
      stance: args.stance,
      stanceLockedUntil,
    },
  });
}

// ═════════════════════════════════════════════════════════════════════════════
// War Policy
// ═════════════════════════════════════════════════════════════════════════════

export async function setGuardPercent(args: {
  userId: string;
  cycleId: string;
  fortressId: string;
  guardPercent: number;
}): Promise<void> {
  if (args.guardPercent < 0 || args.guardPercent > 100) {
    throw new GameError("Guard percentage must be between 0 and 100.");
  }

  await prisma.warPolicy.upsert({
    where: { cycleId_fortressId: { cycleId: args.cycleId, fortressId: args.fortressId } },
    create: {
      cycleId: args.cycleId,
      fortressId: args.fortressId,
      guardPercent: args.guardPercent,
      maxArmySize: 500,
      defaultAggression: "BALANCED",
    },
    update: { guardPercent: args.guardPercent },
  });
}

export async function setMaxArmySize(args: {
  userId: string;
  cycleId: string;
  fortressId: string;
  maxArmySize: number;
}): Promise<void> {
  if (args.maxArmySize < 100) {
    throw new GameError("Maximum army size must be at least 100.");
  }

  await prisma.warPolicy.upsert({
    where: { cycleId_fortressId: { cycleId: args.cycleId, fortressId: args.fortressId } },
    create: {
      cycleId: args.cycleId,
      fortressId: args.fortressId,
      maxArmySize: args.maxArmySize,
      guardPercent: 30,
      defaultAggression: "BALANCED",
    },
    update: { maxArmySize: args.maxArmySize },
  });
}

export async function setDefaultAggression(args: {
  userId: string;
  cycleId: string;
  fortressId: string;
  aggression: string;
}): Promise<void> {
  const valid = ["CAUTIOUS", "BALANCED", "AGGRESSIVE"];
  if (!valid.includes(args.aggression)) {
    throw new GameError(`Invalid aggression: ${args.aggression}`);
  }

  await prisma.warPolicy.upsert({
    where: { cycleId_fortressId: { cycleId: args.cycleId, fortressId: args.fortressId } },
    create: {
      cycleId: args.cycleId,
      fortressId: args.fortressId,
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

export async function createWarFront(args: {
  userId: string;
  cycleId: string;
  attackerFortressId: string;
  enemyFortressId: string;
}): Promise<{ id: string }> {
  // Check that the two fortresses are at war.
  const relation = await prisma.diplomacyRelation.findFirst({
    where: {
      cycleId: args.cycleId,
      status: "WAR",
      OR: [
        { fortressAId: args.attackerFortressId, fortressBId: args.enemyFortressId },
        { fortressAId: args.enemyFortressId, fortressBId: args.attackerFortressId },
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
        cycleId: args.cycleId,
        attackerFortressId: args.attackerFortressId,
        enemyFortressId: args.enemyFortressId,
      },
    },
  });

  if (existing) {
    throw new GameError("A front already exists against this enemy.");
  }

  const front = await prisma.warFront.create({
    data: {
      cycleId: args.cycleId,
      attackerFortressId: args.attackerFortressId,
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
  fortressId: string;
}): Promise<void> {
  // Verify battalion belongs to this fortress.
  const battalion = await prisma.battalion.findFirst({
    where: { id: args.battalionId, fortressId: args.fortressId },
  });
  if (!battalion) throw new GameError("Battalion not found.");

  // Verify front exists and belongs to this fortress.
  const front = await prisma.warFront.findFirst({
    where: { id: args.frontId, attackerFortressId: args.fortressId },
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
  fortressId: string;
}): Promise<void> {
  const assignment = await prisma.battalionAssignment.findFirst({
    where: { battalionId: args.battalionId, frontId: args.frontId },
  });
  if (!assignment) throw new GameError("Battalion is not assigned to this front.");

  await prisma.battalionAssignment.delete({
    where: { id: assignment.id },
  });
}

export async function setFrontAggression(args: {
  userId: string;
  frontId: string;
  fortressId: string;
  aggression: string;
}): Promise<void> {
  const valid = ["CAUTIOUS", "BALANCED", "AGGRESSIVE"];
  if (!valid.includes(args.aggression)) {
    throw new GameError(`Invalid aggression: ${args.aggression}`);
  }

  const front = await prisma.warFront.findFirst({
    where: { id: args.frontId, attackerFortressId: args.fortressId },
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
  fortressId: string;
}): Promise<void> {
  const front = await prisma.warFront.findFirst({
    where: { id: args.frontId, attackerFortressId: args.fortressId },
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
