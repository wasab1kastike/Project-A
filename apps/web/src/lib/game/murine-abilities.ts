// =============================================================================
// Season 4 Space Murine Abilities — Rapid Response + Convoy Network
// =============================================================================
// Pure functions only. No DB / Prisma imports.
// =============================================================================

import {
  AbilityActivationResult,
  computeCooldownEndsAt,
  RaceAbilityKind,
  ResourceSnapshot,
} from "./race-abilities";

// ═════════════════════════════════════════════════════════════════════════════
// 1. Rapid Response
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Rapid Response is the Space Murines' active ability — an emergency
 * recall/defend with a short cooldown. Each use consumes one charge.
 * Charges regenerate slowly over time (idle replenishment).
 */

/** Maximum Rapid Response charges. */
export const MAX_RAPID_RESPONSE_CHARGES = 3;

/** Cooldown between Rapid Response activations (ms). */
export const RAPID_RESPONSE_COOLDOWN_MS = 600_000; // 10 minutes

/** How many ticks (minutes) to regenerate one charge. */
export const RAPID_RESPONSE_CHARGE_TICKS = 120; // 2 hours

export type RapidResponseState = {
  /** Charges available (0–MAX). */
  charges: number;
  /** When the ability was last used (epoch ms). Used for cooldown check. */
  lastUsedAt: number | undefined;
  /** Total charges used this cycle (for score/audit). */
  totalUsed: number;
  /** Ticks elapsed since last charge was generated. Resets on regen. */
  chargeRegenProgress: number;
};

/**
 * Rapid Response can recall units from an outbound attack or reinforce
 * an active battlefield without the normal delay.
 */
export const RapidResponseAction = {
  RECALL_ATTACK: "RECALL_ATTACK",
  REINFORCE_BATTLEFIELD: "REINFORCE_BATTLEFIELD",
  RECALL_ALL: "RECALL_ALL",
} as const;

export type RapidResponseAction =
  (typeof RapidResponseAction)[keyof typeof RapidResponseAction];

/** Army cost (as a percentage of recalled units) for each action. */
export const RAPID_RESPONSE_ARMY_COST: Record<RapidResponseAction, number> = {
  [RapidResponseAction.RECALL_ATTACK]: 0.05, // 5% of recalled army lost
  [RapidResponseAction.REINFORCE_BATTLEFIELD]: 0.0, // free — already at battlefield
  [RapidResponseAction.RECALL_ALL]: 0.1, // 10% of all outbound army lost
};

/**
 * Validate whether Rapid Response can be activated.
 */
export function validateRapidResponse(args: {
  state: RapidResponseState;
  cooldownEndsAt: number | undefined;
  now: number;
}): string | null {
  if (args.state.charges <= 0) {
    return "No Rapid Response charges remaining. Charges regenerate every 2 hours.";
  }
  if (args.cooldownEndsAt != null && args.now < args.cooldownEndsAt) {
    const remainingMs = args.cooldownEndsAt - args.now;
    const seconds = Math.ceil(remainingMs / 1_000);
    return `Rapid Response on cooldown. Ready in ${seconds}s.`;
  }
  return null;
}

/**
 * Calculate the army cost of using Rapid Response.
 */
export function calculateRapidResponseCost(
  action: RapidResponseAction,
  armyAffected: number,
): number {
  const rate = RAPID_RESPONSE_ARMY_COST[action];
  return Math.ceil(armyAffected * rate);
}

/**
 * Activate Rapid Response. Consumes one charge.
 */
export function activateRapidResponse(args: {
  state: RapidResponseState;
  cooldownEndsAt: number | undefined;
  action: RapidResponseAction;
  armyAffected: number;
  armyAvailable: number;
  now: number;
}): AbilityActivationResult {
  const validationError = validateRapidResponse({
    state: args.state,
    cooldownEndsAt: args.cooldownEndsAt,
    now: args.now,
  });
  if (validationError) return { ok: false, error: validationError };

  const armyCost = calculateRapidResponseCost(
    args.action,
    args.armyAffected,
  );

  if (armyCost > args.armyAvailable) {
    return {
      ok: false,
      error: `Rapid Response costs ${armyCost} army (you have ${args.armyAvailable}).`,
    };
  }

  const newState: RapidResponseState = {
    ...args.state,
    charges: args.state.charges - 1,
    lastUsedAt: args.now,
    totalUsed: args.state.totalUsed + 1,
  };

  return {
    ok: true,
    cooldownEndsAt: computeCooldownEndsAt(
      RaceAbilityKind.MURINE_RAPID_RESPONSE,
      args.now,
    ),
    data: {
      action: args.action,
      armyCost,
      armyRecalled: args.armyAffected - armyCost,
      newState,
    },
  };
}

/**
 * Process idle charge regeneration. Call once per tick.
 * Returns updated state and whether a charge was generated.
 */
export function tickRapidResponseRegen(
  state: RapidResponseState,
): { state: RapidResponseState; chargeGenerated: boolean } {
  if (state.charges >= MAX_RAPID_RESPONSE_CHARGES) {
    return { state: { ...state, chargeRegenProgress: 0 }, chargeGenerated: false };
  }

  const newProgress = state.chargeRegenProgress + 1;

  if (newProgress >= RAPID_RESPONSE_CHARGE_TICKS) {
    return {
      state: {
        ...state,
        charges: Math.min(state.charges + 1, MAX_RAPID_RESPONSE_CHARGES),
        chargeRegenProgress: 0,
      },
      chargeGenerated: true,
    };
  }

  return {
    state: { ...state, chargeRegenProgress: newProgress },
    chargeGenerated: false,
  };
}

// ═════════════════════════════════════════════════════════════════════════════
// 2. Convoy Network
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Space Murines excel at trade logistics. Their Convoy Network provides
 * passive bonuses to all convoy legs they own or escort.
 *
 * Bonuses scale with the number of active convoy legs the Murine fortress
 * is involved in — a "network effect" that rewards building trade routes.
 */

/** Maximum convoy legs counted for network effect. */
export const MAX_CONVOY_NETWORK_LEGS = 10;

/**
 * Convoy Network bonuses, tiered by active convoy leg count.
 * Each tier applies at threshold legs and stacks additively.
 *
 * | Active Legs | Speed Bonus | Cargo Bonus | Escort Strength |
 * |------------|-------------|-------------|-----------------|
 * | 1-2        | +10%        | +5%         | 0               |
 * | 3-5        | +20%        | +12%        | +5%             |
 * | 6-8        | +30%        | +20%        | +12%            |
 * | 9-10       | +40%        | +30%        | +20%            |
 */
export type ConvoyNetworkTier = {
  minLegs: number;
  speedBonus: number; // multiplier on convoy speed (0.1 = 10% faster)
  cargoBonus: number; // multiplier on cargo value (0.05 = 5% more value)
  escortStrength: number; // bonus to escort order effectiveness (% chance to repel raiders)
};

export const CONVOY_NETWORK_TIERS: ConvoyNetworkTier[] = [
  { minLegs: 0, speedBonus: 0, cargoBonus: 0, escortStrength: 0 },
  { minLegs: 1, speedBonus: 0.1, cargoBonus: 0.05, escortStrength: 0 },
  { minLegs: 3, speedBonus: 0.2, cargoBonus: 0.12, escortStrength: 0.05 },
  { minLegs: 6, speedBonus: 0.3, cargoBonus: 0.2, escortStrength: 0.12 },
  { minLegs: 9, speedBonus: 0.4, cargoBonus: 0.3, escortStrength: 0.2 },
];

/**
 * Get the active Convoy Network tier for a given number of active convoy legs.
 */
export function getConvoyNetworkTier(
  activeLegs: number,
): ConvoyNetworkTier {
  const capped = Math.min(activeLegs, MAX_CONVOY_NETWORK_LEGS);
  let best = CONVOY_NETWORK_TIERS[0];
  for (const tier of CONVOY_NETWORK_TIERS) {
    if (capped >= tier.minLegs) best = tier;
  }
  return best;
}

/**
 * Apply Convoy Network speed bonus to a convoy leg's transit time (ms).
 * Returns the reduced duration.
 */
export function applyConvoySpeedBonus(
  baseDurationMs: number,
  activeLegs: number,
): number {
  const tier = getConvoyNetworkTier(activeLegs);
  return Math.floor(baseDurationMs * (1 - tier.speedBonus));
}

/**
 * Apply Convoy Network cargo bonus to a cargo value.
 */
export function applyConvoyCargoBonus(
  baseCargoValue: number,
  activeLegs: number,
): number {
  const tier = getConvoyNetworkTier(activeLegs);
  return Math.floor(baseCargoValue * (1 + tier.cargoBonus));
}

/**
 * Check whether a convoy escort repels raiders based on escort strength.
 * Returns true if the raid is repelled (escort wins).
 */
export function rollEscortDefense(
  escortStrength: number,
  activeLegs: number,
): boolean {
  const tier = getConvoyNetworkTier(activeLegs);
  const effectiveStrength = escortStrength + tier.escortStrength;
  // Escort strength is a probability (0-1 range in practice).
  const clamped = Math.min(effectiveStrength, 0.95);
  return Math.random() < clamped;
}

// ═════════════════════════════════════════════════════════════════════════════
// 3. Murine Logistics Bonus (Idle Passive)
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Space Murines get an idle logistics bonus: their convoy legs complete
 * faster and their trade offers have reduced expiration risk.
 */

/** Bonus to convoy speed as a flat multiplier (stacks with Network tier). */
export const MURINE_BASE_SPEED_BONUS = 0.15; // 15% faster convoys baseline

/** Extra time before Murine trade offers expire (ms). */
export const MURINE_TRADE_OFFER_EXTENSION_MS = 3_600_000; // +1 hour

/**
 * Apply the Murine base speed bonus to a convoy duration.
 */
export function applyMurineBaseSpeedBonus(durationMs: number): number {
  return Math.floor(durationMs * (1 - MURINE_BASE_SPEED_BONUS));
}

/**
 * Apply the Murine trade offer expiry extension.
 */
export function applyMurineTradeOfferExtension(
  baseExpiresAt: number,
): number {
  return baseExpiresAt + MURINE_TRADE_OFFER_EXTENSION_MS;
}
