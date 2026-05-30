// =============================================================================
// Tick Battalion Integration — Wire battalions into production + guard phases
// =============================================================================
// Called from tick.ts to replace old scalar army production with battalion-
// based recruitment and guard distribution.
// =============================================================================

import type { PrismaClient } from "@prisma/client";
import { processRecruitmentTick } from "./recruitment";
import { processGuardTick, type GuardableTile } from "./guard-system";
import { getBattalionSlots, generateBattalionName } from "./battalion-types";
import type { Battalion } from "./battalion-types";

// ── Types ────────────────────────────────────────────────────────────────────

type TickBattalionContext = {
  db: PrismaClient;
  cycleId: string;
  now: Date;
};

// ── Recruitment ──────────────────────────────────────────────────────────────

/**
 * Process battalion-based recruitment for all fortresses in the cycle.
 * Replaces the old queue-based recruitment → fortress.army scalar.
 */
export async function processBattalionRecruitment(args: {
  ctx: TickBattalionContext;
  /** Map of fortressId → recruiters assigned */
  recruitersByFortress: Map<string, number>;
  /** Map of fortressId → race (for race bonuses) */
  raceByFortress: Map<string, string | null>;
  /** Map of fortressId → fortress level */
  levelByFortress: Map<string, number>;
  /** Map of fortressId → barracks level (simplified: 0 for now) */
  barracksLevelByFortress: Map<string, number>;
  /** Map of fortressId → current gold */
  goldByFortress: Map<string, number>;
  /** Map of fortressId → WarPolicy maxArmySize */
  maxArmyByFortress: Map<string, number>;
}): Promise<Map<string, number>> {
  const { ctx, recruitersByFortress, raceByFortress, levelByFortress, barracksLevelByFortress, goldByFortress, maxArmyByFortress } = args;

  // Load all battalions grouped by fortress.
  const allBattalions = await ctx.db.battalion.findMany({
    where: { cycleId: ctx.cycleId },
    select: {
      id: true,
      fortressId: true,
      name: true,
      size: true,
      maxSize: true,
      tier: true,
      xp: true,
      readyAt: true,
      stance: true,
      garrisonedAt: true,
      stanceLockedUntil: true,
    },
  });

  const battalionsByFortress = new Map<string, Battalion[]>();
  for (const b of allBattalions) {
    const list = battalionsByFortress.get(b.fortressId) ?? [];
    list.push({
      id: b.id,
      name: b.name,
      size: b.size,
      maxSize: b.maxSize,
      tier: b.tier as Battalion["tier"],
      xp: b.xp,
      readyAt: b.readyAt?.getTime() ?? null,
      stance: b.stance as Battalion["stance"],
      garrisonedAt: b.garrisonedAt,
      stanceLockedUntil: b.stanceLockedUntil?.getTime() ?? null,
    });
    battalionsByFortress.set(b.fortressId, list);
  }

  const newArmyByFortress = new Map<string, number>(); // total army after recruitment
  const battalionUpdates: Array<{
    id: string;
    size: number;
    maxSize: number;
    tier: number;
    xp: number;
    readyAt: Date | null;
    stance: string;
    garrisonedAt: string | null;
    stanceLockedUntil: Date | null;
  }> = [];

  const newBattalions: Array<{
    cycleId: string;
    fortressId: string;
    name: string;
    size: number;
    maxSize: number;
    tier: number;
    xp: number;
    stance: string;
  }> = [];

  for (const [fortressId, recruiters] of recruitersByFortress) {
    if (recruiters <= 0) {
      // Still sum existing battalion sizes.
      const existing = battalionsByFortress.get(fortressId) ?? [];
      newArmyByFortress.set(fortressId, existing.reduce((s, b) => s + b.size, 0));
      continue;
    }

    const race = raceByFortress.get(fortressId) ?? null;
    const level = levelByFortress.get(fortressId) ?? 1;
    const barracksLevel = barracksLevelByFortress.get(fortressId) ?? 0;
    const gold = goldByFortress.get(fortressId) ?? 0;
    const maxArmy = maxArmyByFortress.get(fortressId) ?? 500;
    const existing = battalionsByFortress.get(fortressId) ?? [];
    const totalSlots = getBattalionSlots(level, 0);

    // Race bonus: base 1.0, adjust per race.
    const raceBonus =
      race === "ORKS" ? 1.2 :
      race === "SPACE_MURINES" ? 1.1 :
      1.0;

    const result = processRecruitmentTick({
      battalions: existing,
      recruiters,
      barracksLevel,
      raceBonus,
      totalSlots,
      gold,
      preferredBattalionId: undefined,
      newBattalionName: generateBattalionName(
        (race as "DWARFS" | "ORKS" | "SPACE_MURINES" | "UNSTABLE_UNICORNS") ?? "DWARFS",
        existing.length,
      ),
    });

    // Stage updates.
    for (const bn of result.battalions) {
      // Check if this battalion is new (not in existing list).
      const isNew = !existing.some((e) => e.id === bn.id);
      if (isNew) {
        newBattalions.push({
          cycleId: ctx.cycleId,
          fortressId,
          name: bn.name,
          size: bn.size,
          maxSize: bn.maxSize,
          tier: bn.tier,
          xp: bn.xp,
          stance: bn.stance,
        });
      } else {
        battalionUpdates.push({
          id: bn.id,
          size: bn.size,
          maxSize: bn.maxSize,
          tier: bn.tier,
          xp: bn.xp,
          readyAt: bn.readyAt ? new Date(bn.readyAt) : null,
          stance: bn.stance,
          garrisonedAt: bn.garrisonedAt,
          stanceLockedUntil: bn.stanceLockedUntil ? new Date(bn.stanceLockedUntil) : null,
        });
      }
    }

    // Cap at max army size.
    const totalAfter = result.battalions.reduce((s, b) => s + b.size, 0);
    newArmyByFortress.set(fortressId, Math.min(totalAfter, maxArmy));
  }

  // Write to DB.
  if (battalionUpdates.length > 0) {
    for (const upd of battalionUpdates) {
      await ctx.db.battalion.update({
        where: { id: upd.id },
        data: {
          size: upd.size,
          maxSize: upd.maxSize,
          tier: upd.tier,
          xp: upd.xp,
          readyAt: upd.readyAt,
          stance: upd.stance,
          garrisonedAt: upd.garrisonedAt,
          stanceLockedUntil: upd.stanceLockedUntil,
        },
      });
    }
  }

  if (newBattalions.length > 0) {
    await ctx.db.battalion.createMany({ data: newBattalions });
  }

  return newArmyByFortress;
}

// ── Guard Distribution ───────────────────────────────────────────────────────

/**
 * Process battalion-based guard distribution.
 * Reads WarPolicy.guardPercent, auto-distributes guards to owned tiles.
 */
export async function processBattalionGuard(args: {
  ctx: TickBattalionContext;
  /** Map of fortressId → guard % (from WarPolicy) */
  guardPercentByFortress: Map<string, number>;
  /** Map of fortressId → owned tile IDs */
  ownedTilesByFortress: Map<string, string[]>;
}): Promise<void> {
  const { ctx, guardPercentByFortress, ownedTilesByFortress } = args;

  // Load battalions.
  const allBattalions = await ctx.db.battalion.findMany({
    where: { cycleId: ctx.cycleId },
  });

  for (const [fortressId, guardPercent] of guardPercentByFortress) {
    if (guardPercent <= 0) continue;

    const fortressBattalions: Battalion[] = allBattalions
      .filter((b) => b.fortressId === fortressId && b.size > 0)
      .map((b) => ({
        id: b.id,
        name: b.name,
        size: b.size,
        maxSize: b.maxSize,
        tier: b.tier as Battalion["tier"],
        xp: b.xp,
        readyAt: b.readyAt?.getTime() ?? null,
        stance: b.stance as Battalion["stance"],
        garrisonedAt: b.garrisonedAt,
        stanceLockedUntil: b.stanceLockedUntil?.getTime() ?? null,
      }));

    if (fortressBattalions.length === 0) continue;

    const ownedTiles = ownedTilesByFortress.get(fortressId) ?? [];
    if (ownedTiles.length === 0) continue;

    const guardableTiles: GuardableTile[] = ownedTiles.map((tileId) => ({
      tileId,
      priority: 2, // NORMAL
      isBorder: false, // simplified — caller can enhance
      enemyProximity: 0,
      productionValue: 0,
      currentGuardStrength: 0,
    }));

    // Only auto-assign guard stance for battalions that aren't already on a
    // specific stance (REST, TRAINING, PATROL, AMBUSH are player-chosen and
    // should not be overwritten).
    const result = processGuardTick({
      battalions: fortressBattalions,
      ownedTiles: guardableTiles,
      config: {
        guardPercent,
        defaultStance: "FORTIFY" as const,
      },
    });

    // Write assignments back to DB.
    for (const bn of result.battalions) {
      await ctx.db.battalion.update({
        where: { id: bn.id },
        data: {
          stance: bn.stance,
          garrisonedAt: bn.garrisonedAt,
          stanceLockedUntil: bn.stanceLockedUntil ? new Date(bn.stanceLockedUntil) : null,
        },
      });
    }
  }
}

// ── Combat Casualty Reconciliation ───────────────────────────────────────────

/**
 * After combat resolves, reconcile battalion sizes with the actual fortress.army.
 * Distributes losses proportionally across battalions and tracks kills.
 *
 * @param ctx — tick context
 * @param currentArmy — post-combat fortress.army values (from tick.ts currentArmy map)
 * @param previousArmy — pre-combat fortress.army values (for delta calculation)
 * @param killsByFortress — map of fortressId → units killed (from combat resolution)
 */
export async function reconcileBattalionCasualties(args: {
  ctx: { db: PrismaClient; cycleId: string };
  /** Post-combat fortress.army values (from currentArmy map after all combat). */
  currentArmyByFortress: Map<string, number>;
  /** Pre-combat fortress.army values (from fortress.army at start of tick). */
  previousArmyByFortress: Map<string, number>;
}): Promise<void> {
  const { ctx, currentArmyByFortress, previousArmyByFortress } = args;

  // Load all battalions for this cycle.
  const allBattalions = await ctx.db.battalion.findMany({
    where: { cycleId: ctx.cycleId },
  });

  const battalionUpdates: Array<{ id: string; size: number }> = [];
  const battalionsToDisband: string[] = [];

  for (const [fortressId, postArmy] of currentArmyByFortress) {
    const preArmy = previousArmyByFortress.get(fortressId) ?? postArmy;
    if (postArmy >= preArmy) continue; // No net loss this tick.

    const netLoss = preArmy - postArmy;
    const fortressBattalions = allBattalions.filter(
      (b) => b.fortressId === fortressId && b.size > 0,
    );

    if (fortressBattalions.length === 0) continue;

    const totalBnSize = fortressBattalions.reduce((s, b) => s + b.size, 0);
    if (totalBnSize <= 0) continue;

    // Distribute losses proportionally across battalions.
    let remaining = netLoss;
    for (const bn of fortressBattalions) {
      if (remaining <= 0) break;
      const share = Math.min(
        Math.ceil((bn.size / totalBnSize) * netLoss),
        bn.size,
        remaining,
      );
      const newSize = bn.size - share;
      remaining -= share;

      if (newSize <= 0) {
        battalionsToDisband.push(bn.id);
      } else {
        battalionUpdates.push({ id: bn.id, size: newSize });
      }
    }
  }

  // Apply updates.
  if (battalionUpdates.length > 0) {
    for (const upd of battalionUpdates) {
      await ctx.db.battalion.update({
        where: { id: upd.id },
        data: { size: upd.size },
      });
    }
  }

  if (battalionsToDisband.length > 0) {
    await ctx.db.battalion.updateMany({
      where: { id: { in: battalionsToDisband } },
      data: { size: 0, stance: "REST", garrisonedAt: null },
    });
  }
}
