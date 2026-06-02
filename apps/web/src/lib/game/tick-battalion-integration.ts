// =============================================================================
// Tick Battalion Integration — Wire battalions into production + guard phases
// =============================================================================
// Called from tick.ts to replace old scalar army production with battalion-
// based recruitment and guard distribution.
// =============================================================================

import type { PrismaClient } from "@prisma/client";
import { processRecruitmentTick } from "./recruitment";
import { processGuardTick, type GuardableTile } from "./guard-system";
import {
  BattalionTier,
  DEFAULT_BATTALION_MAX_SIZE,
  getBattalionSlots,
  generateBattalionName,
} from "./battalion-types";
import { HEX_TILES } from "./map-hex";
import type { Battalion } from "./battalion-types";
import { getRoadAdjustedAttackArrival } from "./road-travel";
import { getSkillModifiers } from "./race-skill-effects";
import { isFortressRace } from "./races";

// ── Types ────────────────────────────────────────────────────────────────────

type TickBattalionContext = {
  db: PrismaClient;
  cycleId: string;
  now: Date;
};

type FortressPosition = {
  mapX: number;
  mapY: number;
};

async function getBattalionReinforcementArrival({
  db,
  cycleId,
  now,
  fortress,
  tileId,
}: {
  db: PrismaClient;
  cycleId: string;
  now: Date;
  fortress: FortressPosition;
  tileId: string;
}) {
  const tile = HEX_TILES.find((candidate) => candidate.id === tileId);
  if (!tile) return new Date(now.getTime() + 60_000);

  const dx = fortress.mapX - tile.xPercent;
  const dy = fortress.mapY - tile.yPercent;
  const approxTiles = Math.max(1, Math.ceil(Math.sqrt(dx * dx + dy * dy) / 3));
  const { arrivesAt } = await getRoadAdjustedAttackArrival({
    db,
    cycleId,
    launchedAt: now,
    origin: fortress,
    target: { mapX: tile.xPercent, mapY: tile.yPercent },
    baseMinutes: approxTiles,
  });

  return arrivesAt;
}

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
  /** Map of fortressId → purchased skill node keys */
  skillPurchasesByFortress?: Map<string, Array<{ nodeKey: string }>>;
  /** Existing scalar fortress army, used to seed battalions for migrated players. */
  currentArmyByFortress?: Map<string, number>;
  fortressPositionsById: Map<string, FortressPosition>;
}): Promise<{
  armyByFortress: Map<string, number>;
  goldSpentByFortress: Map<string, number>;
}> {
  const {
    ctx,
    recruitersByFortress,
    raceByFortress,
    levelByFortress,
    barracksLevelByFortress,
    goldByFortress,
    maxArmyByFortress,
    skillPurchasesByFortress,
    currentArmyByFortress,
    fortressPositionsById,
  } = args;

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
  const persistedSizeByBattalionId = new Map<string, number>();
  const pendingRecruitsByBattalionId = new Map<string, number>();

  const pendingBattalionReinforcements = await ctx.db.attackUnit.findMany({
    where: {
      cycleId: ctx.cycleId,
      reinforcementBattalionId: { not: null },
      resolvedAt: null,
      cancelledAt: null,
    },
    select: {
      reinforcementBattalionId: true,
      armyAmount: true,
    },
  });

  for (const reinforcement of pendingBattalionReinforcements) {
    if (!reinforcement.reinforcementBattalionId) continue;
    pendingRecruitsByBattalionId.set(
      reinforcement.reinforcementBattalionId,
      (pendingRecruitsByBattalionId.get(reinforcement.reinforcementBattalionId) ?? 0) +
        reinforcement.armyAmount,
    );
  }

  for (const b of allBattalions) {
    persistedSizeByBattalionId.set(b.id, b.size);
    const pendingRecruits = pendingRecruitsByBattalionId.get(b.id) ?? 0;
    const list = battalionsByFortress.get(b.fortressId) ?? [];
    list.push({
      id: b.id,
      name: b.name,
      size: Math.min(b.maxSize, b.size + pendingRecruits),
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
  const goldSpentByFortress = new Map<string, number>();
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
    mode: string;
  }> = [];

  const reinforcementLaunches: Array<{
    battalionId: string;
    fortressId: string;
    tileId: string;
    armyAmount: number;
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
    const skillModifiers =
      race && isFortressRace(race)
        ? getSkillModifiers({
            race,
            purchases: skillPurchasesByFortress?.get(fortressId) ?? [],
          })
        : null;
    const battalionMaxSizeMultiplier =
      1 + (skillModifiers?.battalionMaxSizePercent ?? 0) / 100;
    const defaultBattalionMaxSize = Math.floor(
      DEFAULT_BATTALION_MAX_SIZE * battalionMaxSizeMultiplier
    );
    const storedExisting = battalionsByFortress.get(fortressId) ?? [];
    const migratedArmy = Math.max(
      0,
      currentArmyByFortress?.get(fortressId) ?? 0
    );
    const existing =
      storedExisting.length === 0 && migratedArmy > 0
        ? [
            {
              id: `seed_${fortressId}`,
              name: generateBattalionName(
                (race as
                  | "DWARFS"
                  | "ORKS"
                  | "SPACE_MURINES"
                  | "UNSTABLE_UNICORNS") ?? "DWARFS",
                0
              ),
              size: migratedArmy,
              maxSize: Math.max(
                defaultBattalionMaxSize,
                migratedArmy
              ),
              tier: BattalionTier.RECRUIT,
              xp: 0,
              readyAt: null,
              stance: "REST" as Battalion["stance"],
              garrisonedAt: null,
              stanceLockedUntil: null,
            },
          ]
        : storedExisting;
    const totalSlots = getBattalionSlots(
      level,
      0,
      skillModifiers?.battalionSlotBonus ?? 0
    );

    // Race bonus: base 1.0, adjust per race.
    const raceBonus =
      race === "ORKS" ? 1.2 :
      race === "SPACE_MURINES" ? 1.1 :
      1.0;
    const recruitmentBonus =
      raceBonus * (skillModifiers?.recruitmentRateMultiplier ?? 1);

    const result = processRecruitmentTick({
      battalions: existing,
      recruiters,
      barracksLevel,
      raceBonus: recruitmentBonus,
      totalSlots,
      gold,
      preferredBattalionId: undefined,
      defaultBattalionMaxSize,
      maxArmySize: maxArmy,
      newBattalionName: generateBattalionName(
        (race as "DWARFS" | "ORKS" | "SPACE_MURINES" | "UNSTABLE_UNICORNS") ?? "DWARFS",
        existing.length,
      ),
    });
    if (result.goldSpent > 0) {
      goldSpentByFortress.set(fortressId, result.goldSpent);
    }

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
          mode: "RESERVE",
        });
      } else {
        const persistedSize = persistedSizeByBattalionId.get(bn.id) ?? bn.size;
        const virtualBefore =
          persistedSize + (pendingRecruitsByBattalionId.get(bn.id) ?? 0);
        const recruitDelta = Math.max(0, bn.size - virtualBefore);
        const shouldTravel = Boolean(bn.garrisonedAt) && recruitDelta > 0;

        if (shouldTravel && bn.garrisonedAt) {
          reinforcementLaunches.push({
            battalionId: bn.id,
            fortressId,
            tileId: bn.garrisonedAt,
            armyAmount: recruitDelta,
          });
        }

        battalionUpdates.push({
          id: bn.id,
          size: bn.garrisonedAt ? persistedSize : bn.size,
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

    // Max army size caps future recruitment, not existing battalion totals.
    const totalAfter = result.battalions.reduce((sum, b) => {
      const persistedSize = persistedSizeByBattalionId.get(b.id);
      if (persistedSize === undefined) return sum + b.size;
      return sum + (b.garrisonedAt ? persistedSize : b.size);
    }, 0);
    newArmyByFortress.set(fortressId, totalAfter);
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

  for (const launch of reinforcementLaunches) {
    const fortress = fortressPositionsById.get(launch.fortressId);
    const arrivesAt = fortress
      ? await getBattalionReinforcementArrival({
          db: ctx.db,
          cycleId: ctx.cycleId,
          now: ctx.now,
          fortress,
          tileId: launch.tileId,
        })
      : new Date(ctx.now.getTime() + 60_000);

    await ctx.db.attackUnit.create({
      data: {
        cycleId: ctx.cycleId,
        attackerFortressId: launch.fortressId,
        targetFortressId: launch.fortressId,
        fortifyTargetTileId: launch.tileId,
        reinforcementBattalionId: launch.battalionId,
        armyAmount: launch.armyAmount,
        launchedAt: ctx.now,
        arrivesAt,
        returnOriginMapX: fortress?.mapX,
        returnOriginMapY: fortress?.mapY,
      },
    });
  }

  return { armyByFortress: newArmyByFortress, goldSpentByFortress };
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
  fortressPositionsById: Map<string, FortressPosition>;
}): Promise<void> {
  const { ctx, guardPercentByFortress, ownedTilesByFortress } = args;

  // Load battalions.
  const allBattalions = await ctx.db.battalion.findMany({
    where: { cycleId: ctx.cycleId },
  });

  for (const [fortressId, guardPercent] of guardPercentByFortress) {
    if (guardPercent <= 0) continue;

    const fortressBattalions: Battalion[] = allBattalions
      .filter((b) => b.fortressId === fortressId && b.size > 0 && (b.mode ?? "GUARD") === "GUARD")
      .map((b) => ({
        id: b.id,
        name: b.name,
        size: b.size,
        maxSize: b.maxSize,
        tier: b.tier as Battalion["tier"],
        xp: b.xp,
        readyAt: b.readyAt?.getTime() ?? null,
        stance: "FORTIFY" as Battalion["stance"],
        garrisonedAt: b.garrisonedAt,
        stanceLockedUntil: b.stanceLockedUntil?.getTime() ?? null,
      }));

    if (fortressBattalions.length === 0) continue;

    const ownedTiles = ownedTilesByFortress.get(fortressId) ?? [];
    if (ownedTiles.length === 0) continue;

    // Check if any tile is adjacent to non-owned tile (border).
    const borderTileIds = new Set<string>();
    for (const tileId of ownedTiles) {
      const tile = HEX_TILES.find((t) => t.id === tileId);
      if (!tile) continue;
      const isEven = tile.col % 2 === 0;
      const offsets: [number, number][] = [[-1,0],[1,0],[0,-1],[0,1]];
      if (isEven) offsets.push([-1,-1],[-1,1]);
      else offsets.push([1,-1],[1,1]);
      for (const [dc, dr] of offsets) {
        const n = HEX_TILES.find((t) => t.col === tile.col + dc && t.row === tile.row + dr);
        if (n && !ownedTiles.includes(n.id)) { borderTileIds.add(tileId); break; }
      }
    }

    const guardableTiles: GuardableTile[] = ownedTiles.map((tileId) => ({
      tileId,
      priority: borderTileIds.has(tileId) ? 1 as any : 2, // HIGH if border, NORMAL otherwise
      isBorder: borderTileIds.has(tileId),
      enemyProximity: borderTileIds.has(tileId) ? 1 : 0,
      productionValue: 0,
      currentGuardStrength: 0,
    }));

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

    // GUARD battalions patrol as persistent battalions. Do not create
    // fortify attack units here; those resolve into legacy garrisons and make
    // a single battalion appear split across several map orders.
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
      (b) =>
        b.fortressId === fortressId &&
        b.size > 0 &&
        (b.mode ?? "GUARD") !== "RESERVE", // RESERVE battalions don't take combat losses
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
