// =============================================================================
// Season 4 Ork Abilities — Scrap Economy + Boss Orders + Waaagh
// =============================================================================
// Pure functions only. No DB / Prisma imports.
// =============================================================================

import {
  AbilityActivationResult,
  computeCooldownEndsAt,
  OrkBossOrderKind,
  OrkScrapEventReason,
  OrkWaaaghInvestmentKind,
  RaceAbilityKind,
  applyResourceDeltas,
  ResourceSnapshot,
} from "./race-abilities";

// ═════════════════════════════════════════════════════════════════════════════
// 1. Scrap Economy
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Scrap is the Ork secondary resource — earned from combat and spent on
 * Boss Orders and Waaagh investments.
 */

/** Maximum scrap a fortress can hold. */
export const MAX_SCRAP = 10_000;

/** How much scrap each event type generates (before Waaagh multipliers). */
export const SCRAP_EVENT_YIELD: Record<OrkScrapEventReason, number> = {
  [OrkScrapEventReason.ATTACK_LAUNCHED]: 15,
  [OrkScrapEventReason.ATTACK_RECEIVED]: 20,
  [OrkScrapEventReason.BATTLEFIELD_PARTICIPATION]: 25,
  [OrkScrapEventReason.UNITS_KILLED]: 3, // per unit killed
  [OrkScrapEventReason.UNITS_LOST]: 1, // per unit lost (orkz love a good fight)
  [OrkScrapEventReason.TILE_CLAIMED]: 50,
};

/** Scrap decays each tick if not used — orkz get bored. */
export const SCRAP_DECAY_PER_TICK = 0.01; // 1% per tick

/**
 * Calculate scrap earned from a single event, factoring in Waaagh tier bonus.
 * @param baseYield — from SCRAP_EVENT_YIELD
 * @param count — how many times the event happened (e.g. units killed)
 * @param waaaghTier — current Waaagh tier (0-3), each tier adds 25% bonus
 */
export function calculateScrapEarned(
  reason: OrkScrapEventReason,
  count: number,
  waaaghTier: number,
): number {
  const baseYield = SCRAP_EVENT_YIELD[reason] ?? 0;
  const multiplier = 1 + waaaghTier * 0.25;
  return Math.floor(baseYield * count * multiplier);
}

/**
 * Apply scrap decay for one tick.
 */
export function applyScrapDecay(scrap: number): number {
  return Math.floor(scrap * (1 - SCRAP_DECAY_PER_TICK));
}

/**
 * Validate that the fortress can afford a scrap cost.
 */
export function canAffordScrap(scrap: number, cost: number): boolean {
  return scrap >= cost && cost > 0;
}

/**
 * Add scrap, capped at MAX_SCRAP.
 */
export function addScrap(current: number, earned: number): number {
  return Math.min(current + earned, MAX_SCRAP);
}

/**
 * Spend scrap, returning the new balance. Does NOT validate — caller checks.
 */
export function spendScrap(current: number, cost: number): number {
  return Math.max(0, current - cost);
}

// ═════════════════════════════════════════════════════════════════════════════
// 2. Boss Orders
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Boss Orders are timed buffs purchased with scrap.
 * Only ONE Boss Order can be active at a time.
 */

export type BossOrder = {
  kind: OrkBossOrderKind;
  activatedAt: number;
  expiresAt: number;
  /** The tier of Waaagh when activated — affects buff strength. */
  waaaghTier: number;
};

/** Duration of Boss Orders in ms. */
export const BOSS_ORDER_DURATION_MS = 1_800_000; // 30 minutes

/** Scrap cost for each Boss Order kind. */
export const BOSS_ORDER_SCRAP_COST: Record<OrkBossOrderKind, number> = {
  [OrkBossOrderKind.MORE_DAKKA]: 200,
  [OrkBossOrderKind.LOOT_WAGONS]: 250,
  [OrkBossOrderKind.PATCH_DA_FORT]: 150,
};

/**
 * Buff effects provided by each Boss Order, keyed by Waaagh tier (0-3).
 */
export type BossOrderBuff = {
  /** Bonus attack damage multiplier (additive: 1.0 = +100%). */
  attackMultiplier: number;
  /** Bonus loot/raid gold multiplier. */
  lootMultiplier: number;
  /** Bonus defense multiplier. */
  defenseMultiplier: number;
  /** Bonus army production per tick. */
  armyProductionBonus: number;
};

export const BOSS_ORDER_BUFFS: Record<
  OrkBossOrderKind,
  BossOrderBuff[]
> = {
  [OrkBossOrderKind.MORE_DAKKA]: [
    // Waaagh 0
    {
      attackMultiplier: 0.2,
      lootMultiplier: 0,
      defenseMultiplier: 0,
      armyProductionBonus: 0,
    },
    // Waaagh 1
    {
      attackMultiplier: 0.35,
      lootMultiplier: 0,
      defenseMultiplier: 0,
      armyProductionBonus: 0,
    },
    // Waaagh 2
    {
      attackMultiplier: 0.5,
      lootMultiplier: 0,
      defenseMultiplier: 0,
      armyProductionBonus: 0,
    },
    // Waaagh 3
    {
      attackMultiplier: 0.75,
      lootMultiplier: 0,
      defenseMultiplier: 0,
      armyProductionBonus: 0,
    },
  ],
  [OrkBossOrderKind.LOOT_WAGONS]: [
    { attackMultiplier: 0, lootMultiplier: 0.3, defenseMultiplier: 0, armyProductionBonus: 0 },
    { attackMultiplier: 0, lootMultiplier: 0.5, defenseMultiplier: 0, armyProductionBonus: 0 },
    { attackMultiplier: 0, lootMultiplier: 0.75, defenseMultiplier: 0, armyProductionBonus: 0 },
    { attackMultiplier: 0, lootMultiplier: 1.0, defenseMultiplier: 0, armyProductionBonus: 0 },
  ],
  [OrkBossOrderKind.PATCH_DA_FORT]: [
    { attackMultiplier: 0, lootMultiplier: 0, defenseMultiplier: 0.15, armyProductionBonus: 10 },
    { attackMultiplier: 0, lootMultiplier: 0, defenseMultiplier: 0.25, armyProductionBonus: 20 },
    { attackMultiplier: 0, lootMultiplier: 0, defenseMultiplier: 0.4, armyProductionBonus: 35 },
    { attackMultiplier: 0, lootMultiplier: 0, defenseMultiplier: 0.6, armyProductionBonus: 50 },
  ],
};

/**
 * Get the active buff for a Boss Order at a given Waaagh tier.
 */
export function getBossOrderBuff(
  kind: OrkBossOrderKind,
  waaaghTier: number,
): BossOrderBuff {
  const tier = Math.min(waaaghTier, 3);
  return BOSS_ORDER_BUFFS[kind][tier];
}

/**
 * Check if a Boss Order is still active.
 */
export function isBossOrderActive(
  order: BossOrder,
  now: number,
): boolean {
  return now < order.expiresAt;
}

/**
 * Activate a Boss Order. Returns success or error.
 */
export function activateBossOrder(args: {
  scrap: number;
  kind: OrkBossOrderKind;
  waaaghTier: number;
  activeBossOrder: BossOrder | undefined;
  now: number;
}): AbilityActivationResult {
  const cost = BOSS_ORDER_SCRAP_COST[args.kind];

  if (!canAffordScrap(args.scrap, cost)) {
    return {
      ok: false,
      error: `Boss Order "${args.kind}" costs ${cost} scrap (you have ${args.scrap}).`,
    };
  }

  if (args.activeBossOrder && isBossOrderActive(args.activeBossOrder, args.now)) {
    return {
      ok: false,
      error: `A Boss Order (${args.activeBossOrder.kind}) is already active.`,
    };
  }

  const order: BossOrder = {
    kind: args.kind,
    activatedAt: args.now,
    expiresAt: args.now + BOSS_ORDER_DURATION_MS,
    waaaghTier: args.waaaghTier,
  };

  return {
    ok: true,
    cooldownEndsAt: computeCooldownEndsAt(
      RaceAbilityKind.ORK_BOSS_ORDER,
      args.now,
    ),
    data: {
      scrapSpent: cost,
      bossOrder: order,
      buff: getBossOrderBuff(args.kind, args.waaaghTier),
    },
  };
}

// ═════════════════════════════════════════════════════════════════════════════
// 3. Waaagh Investment
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Waaagh represents the Ork fortress's overall momentum.
 * Investing scrap into Waaagh tiers grants permanent buffs that decay if
 * not maintained.
 */

/** Maximum Waaagh tier. */
export const MAX_WAAAGH_TIER = 3;

/** Scrap cost to invest at each Waaagh tier. */
export const WAAAGH_INVESTMENT_SCRAP_COST: Record<number, number> = {
  0: 500, // tier 0 → 1
  1: 1_500, // tier 1 → 2
  2: 4_000, // tier 2 → 3
};

/** How many ticks a Waaagh tier persists before decaying if not fed. */
export const WAAAGH_DECAY_TICKS = 120; // 2 hours

export type WaaaghState = {
  tier: number; // 0-3
  /** Epoch ms when this tier was last invested in or reinforced. */
  lastFedAt: number;
  /** Total scrap invested into Waaagh this season (for score tracking). */
  totalScrapInvested: number;
};

/**
 * Waaagh tier passive bonuses (always active for the Ork fortress).
 */
export type WaaaghPassive = {
  /** Bonus gold from attacks/raids. */
  attackGoldBonus: number;
  /** Bonus army production per tick. */
  armyProductionBonus: number;
  /** Bonus scrap earned from all sources. */
  scrapBonus: number;
};

export const WAAAGH_PASSIVES: Record<number, WaaaghPassive> = {
  0: { attackGoldBonus: 0, armyProductionBonus: 0, scrapBonus: 0 },
  1: { attackGoldBonus: 50, armyProductionBonus: 5, scrapBonus: 0.1 },
  2: { attackGoldBonus: 150, armyProductionBonus: 15, scrapBonus: 0.25 },
  3: { attackGoldBonus: 300, armyProductionBonus: 30, scrapBonus: 0.5 },
};

/**
 * Get the passive bonuses for a given Waaagh tier.
 */
export function getWaaaghPassive(tier: number): WaaaghPassive {
  return WAAAGH_PASSIVES[Math.min(tier, MAX_WAAAGH_TIER)] ?? WAAAGH_PASSIVES[0];
}

/**
 * Invest scrap into Waaagh to advance to the next tier.
 */
export function investInWaaagh(args: {
  scrap: number;
  currentWaaagh: WaaaghState;
  now: number;
}): AbilityActivationResult {
  if (args.currentWaaagh.tier >= MAX_WAAAGH_TIER) {
    return {
      ok: false,
      error: "Waaagh is already at maximum tier! WAAAAAGH!",
    };
  }

  const nextTier = args.currentWaaagh.tier + 1;
  const cost = WAAAGH_INVESTMENT_SCRAP_COST[args.currentWaaagh.tier];

  if (!canAffordScrap(args.scrap, cost)) {
    return {
      ok: false,
      error: `Advancing to Waaagh tier ${nextTier} costs ${cost} scrap (you have ${args.scrap}). Keep fightin'!`,
    };
  }

  const newWaaagh: WaaaghState = {
    tier: nextTier,
    lastFedAt: args.now,
    totalScrapInvested: args.currentWaaagh.totalScrapInvested + cost,
  };

  return {
    ok: true,
    data: {
      scrapSpent: cost,
      oldTier: args.currentWaaagh.tier,
      newTier: nextTier,
      waaagh: newWaaagh,
      passive: getWaaaghPassive(nextTier),
    },
  };
}

/**
 * Reinforce current Waaagh tier (reset decay timer). Costs a small amount
 * of scrap proportional to the current tier.
 */
export function reinforceWaaagh(args: {
  scrap: number;
  currentWaaagh: WaaaghState;
  now: number;
}): AbilityActivationResult {
  if (args.currentWaaagh.tier === 0) {
    return { ok: false, error: "No Waaagh to reinforce. Invest first!" };
  }

  const cost = 50 * args.currentWaaagh.tier;
  if (!canAffordScrap(args.scrap, cost)) {
    return {
      ok: false,
      error: `Reinforcing Waaagh tier ${args.currentWaaagh.tier} costs ${cost} scrap.`,
    };
  }

  const reinforcedWaaagh: WaaaghState = {
    ...args.currentWaaagh,
    lastFedAt: args.now,
    totalScrapInvested: args.currentWaaagh.totalScrapInvested + cost,
  };

  return {
    ok: true,
    data: {
      scrapSpent: cost,
      waaagh: reinforcedWaaagh,
      reinforcedUntil: args.now + WAAAGH_DECAY_TICKS * 60_000,
    },
  };
}

/**
 * Check if Waaagh has decayed (not fed within DECAY_TICKS).
 * Returns the new (possibly lower) tier.
 */
export function checkWaaaghDecay(
  waaagh: WaaaghState,
  now: number,
): WaaaghState {
  if (waaagh.tier === 0) return waaagh;

  const msSinceFed = now - waaagh.lastFedAt;
  const ticksSinceFed = Math.floor(msSinceFed / 60_000);

  if (ticksSinceFed < WAAAGH_DECAY_TICKS) return waaagh;

  // Decay: lose one tier per full decay window elapsed.
  const tiersLost = Math.min(
    waaagh.tier,
    Math.floor(ticksSinceFed / WAAAGH_DECAY_TICKS),
  );

  if (tiersLost === 0) return waaagh;

  return {
    ...waaagh,
    tier: waaagh.tier - tiersLost,
    lastFedAt: now, // reset timer at new tier
  };
}

// ═════════════════════════════════════════════════════════════════════════════
// 4. Ork Resource Integration
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Apply Waaagh passive bonuses to a resource snapshot for one tick.
 * Returns deltas only — caller adds them.
 */
export function applyWaaaghTickBonus(waaaghTier: number): {
  goldBonus: number;
  armyBonus: number;
} {
  const passive = getWaaaghPassive(waaaghTier);
  return {
    goldBonus: passive.attackGoldBonus,
    armyBonus: passive.armyProductionBonus,
  };
}

/**
 * Apply an active Boss Order buff to an attack's damage calculation.
 */
export function applyBossOrderAttackBuff(
  baseDamage: number,
  bossOrder: BossOrder | undefined,
  now: number,
): number {
  if (!bossOrder || !isBossOrderActive(bossOrder, now)) return baseDamage;

  const buff = getBossOrderBuff(bossOrder.kind, bossOrder.waaaghTier);
  return Math.floor(baseDamage * (1 + buff.attackMultiplier));
}

/**
 * Apply an active Boss Order buff to loot/raid gold.
 */
export function applyBossOrderLootBuff(
  baseLoot: number,
  bossOrder: BossOrder | undefined,
  now: number,
): number {
  if (!bossOrder || !isBossOrderActive(bossOrder, now)) return baseLoot;

  const buff = getBossOrderBuff(bossOrder.kind, bossOrder.waaaghTier);
  return Math.floor(baseLoot * (1 + buff.lootMultiplier));
}
