// =============================================================================
// Season 4 Unstable Unicorn Abilities — Reality Flux + Shattered Reality
// =============================================================================
// Pure functions only. No DB / Prisma imports.
// =============================================================================

import {
  AbilityActivationResult,
  computeCooldownEndsAt,
  RaceAbilityKind,
  ResourceSnapshot,
  UnicornShatteredRealityOutcome,
  applyResourceDeltas,
} from "./race-abilities";

// ═════════════════════════════════════════════════════════════════════════════
// 1. Reality Flux — Passive Tick Table
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Reality Flux is the Unicorn's idle passive: every tick (minute), a
 * random minor event occurs. Most are tiny boons; some are small curses.
 * This makes the Unicorn experience consistently unpredictable.
 *
 * The flux system replaces the boring "nothing happens" of other races
 * with constant small narrative beats.
 */

export const FluxOutcomeKind = {
  // Boons (~70% cumulative weight)
  GLIMMER_OF_GOLD: "GLIMMER_OF_GOLD",
  SPARK_OF_LIFE: "SPARK_OF_LIFE",
  WHIMSY_WIND: "WHIMSY_WIND",
  STARFALL: "STARFALL",
  REALITY_ECHO: "REALITY_ECHO",

  // Neutral (~15%)
  NOTHING_UNUSUAL: "NOTHING_UNUSUAL",
  ODD_WHINNY: "ODD_WHINNY",

  // Curses (~15%)
  SUGAR_CRASH: "SUGAR_CRASH",
  GLITTER_SPILL: "GLITTER_SPILL",
  BRIEF_MORTALITY: "BRIEF_MORTALITY",
} as const;

export type FluxOutcomeKind =
  (typeof FluxOutcomeKind)[keyof typeof FluxOutcomeKind];

export type FluxEntry = {
  outcome: FluxOutcomeKind;
  weight: number; // relative weight in table
  /** Deltas applied to the fortress each tick this outcome fires. */
  goldDelta: number;
  foodDelta: number;
  armyDelta: number;
  pointsDelta: number;
  /** Human-readable message shown in the activity log. */
  message: string;
};

/**
 * The Reality Flux event table.
 * Total weight = 100 for percentage-like interpretation.
 * Weights are tuned so boons dominate but curses keep things interesting.
 */
export const REALITY_FLUX_TABLE: FluxEntry[] = [
  {
    outcome: FluxOutcomeKind.GLIMMER_OF_GOLD,
    weight: 25,
    goldDelta: 15,
    foodDelta: 0,
    armyDelta: 0,
    pointsDelta: 0,
    message: "A glimmer of gold coalesces from the shimmering air.",
  },
  {
    outcome: FluxOutcomeKind.SPARK_OF_LIFE,
    weight: 18,
    goldDelta: 0,
    foodDelta: 8,
    armyDelta: 2,
    pointsDelta: 0,
    message: "Sparks of life dance across the fortress — food and recruits appear!",
  },
  {
    outcome: FluxOutcomeKind.WHIMSY_WIND,
    weight: 12,
    goldDelta: 5,
    foodDelta: 5,
    armyDelta: 0,
    pointsDelta: 1,
    message: "A whimsy wind carries stray resources into your stores.",
  },
  {
    outcome: FluxOutcomeKind.STARFALL,
    weight: 8,
    goldDelta: 50,
    foodDelta: 0,
    armyDelta: 0,
    pointsDelta: 2,
    message: "A star falls nearby — raw stardust is worth good gold!",
  },
  {
    outcome: FluxOutcomeKind.REALITY_ECHO,
    weight: 7,
    goldDelta: 0,
    foodDelta: 0,
    armyDelta: 5,
    pointsDelta: 3,
    message: "A ripple in reality echoes a past victory — bonus army and points.",
  },
  {
    outcome: FluxOutcomeKind.NOTHING_UNUSUAL,
    weight: 10,
    goldDelta: 0,
    foodDelta: 0,
    armyDelta: 0,
    pointsDelta: 0,
    message: "Reality holds steady... for now.",
  },
  {
    outcome: FluxOutcomeKind.ODD_WHINNY,
    weight: 5,
    goldDelta: 1,
    foodDelta: 1,
    armyDelta: 0,
    pointsDelta: 0,
    message: "An odd whinny echoes from nowhere. Slightly unsettling, slightly profitable.",
  },
  {
    outcome: FluxOutcomeKind.SUGAR_CRASH,
    weight: 6,
    goldDelta: 0,
    foodDelta: -5,
    armyDelta: -1,
    pointsDelta: 0,
    message: "Sugar crash! Your unicorns are sluggish — food and a recruit are lost.",
  },
  {
    outcome: FluxOutcomeKind.GLITTER_SPILL,
    weight: 5,
    goldDelta: -10,
    foodDelta: 0,
    armyDelta: 0,
    pointsDelta: 0,
    message: "A glitter spill ruins a small stash of gold. Cleaning costs add up.",
  },
  {
    outcome: FluxOutcomeKind.BRIEF_MORTALITY,
    weight: 4,
    goldDelta: 0,
    foodDelta: 0,
    armyDelta: -3,
    pointsDelta: -1,
    message: "A brief brush with mortality — a few unicorns forget they're immortal.",
  },
];

/** Total weight of the flux table (for normalization). */
const FLUX_TOTAL_WEIGHT = REALITY_FLUX_TABLE.reduce(
  (s, e) => s + e.weight,
  0,
);

/**
 * Roll on the Reality Flux table. Returns the outcome and resource deltas.
 */
export function rollRealityFlux(): FluxEntry {
  let roll = Math.random() * FLUX_TOTAL_WEIGHT;
  for (const entry of REALITY_FLUX_TABLE) {
    roll -= entry.weight;
    if (roll <= 0) return entry;
  }
  return REALITY_FLUX_TABLE[0]; // fallback (shouldn't happen)
}

/**
 * Apply Reality Flux to a resource snapshot for one tick.
 * Returns the updated resources and the flux message for the activity log.
 */
export function applyRealityFluxTick(
  resources: ResourceSnapshot,
): { resources: ResourceSnapshot; flux: FluxEntry } {
  const flux = rollRealityFlux();
  const deltas: Partial<ResourceSnapshot> = {
    gold: flux.goldDelta,
    food: flux.foodDelta,
    army: flux.armyDelta,
    points: flux.pointsDelta,
  };
  return {
    resources: applyResourceDeltas(resources, deltas),
    flux,
  };
}

// ═════════════════════════════════════════════════════════════════════════════
// 2. Shattered Reality — Active Ability
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Shattered Reality is the Unicorn's active ability. Unlike other races'
 * abilities that are purely random, the Unicorn CHOOSES their outcome from
 * three possibilities — but each use escalates the cost for future uses.
 *
 * Cost formula: baseCost × (1 + activationCount × 0.5)
 *   Use 1: 1,000 gold
 *   Use 2: 1,500 gold
 *   Use 3: 2,000 gold
 *   ...
 *
 * This creates strategic depth: do you use it now for a small gain, or
 * save it for a critical moment when the higher cost is worth it?
 */

export type ShatteredRealityState = {
  /** How many times Shattered Reality has been activated this cycle. */
  activationCount: number;
  lastActivatedAt: number | undefined;
};

/** Base gold cost for Shattered Reality. */
export const SHATTERED_REALITY_BASE_GOLD_COST = 1_000;

/** Cost escalation factor per activation. */
export const SHATTERED_REALITY_COST_ESCALATION = 0.5;

/**
 * Calculate the current gold cost to activate Shattered Reality.
 */
export function calculateShatteredRealityCost(
  activationCount: number,
): number {
  return Math.floor(
    SHATTERED_REALITY_BASE_GOLD_COST *
      (1 + activationCount * SHATTERED_REALITY_COST_ESCALATION),
  );
}

/**
 * Outcome definitions for Shattered Reality.
 * Each outcome has a distinct effect — the player chooses, so no RNG weights.
 */
export type ShatteredRealityEntry = {
  outcome: UnicornShatteredRealityOutcome;
  /** Base gold delta (before scaling with activation count). */
  baseGoldDelta: number;
  baseFoodDelta: number;
  baseArmyDelta: number;
  basePointsDelta: number;
  /** Whether this outcome creates a temporary teleport tile. */
  grantsTeleport: boolean;
  summary: string;
};

export const SHATTERED_REALITY_OUTCOMES: Record<
  UnicornShatteredRealityOutcome,
  ShatteredRealityEntry
> = {
  [UnicornShatteredRealityOutcome.MIRROR_HOST]: {
    outcome: UnicornShatteredRealityOutcome.MIRROR_HOST,
    baseGoldDelta: 500,
    baseFoodDelta: 300,
    baseArmyDelta: 15,
    basePointsDelta: 5,
    grantsTeleport: false,
    summary:
      "A mirror host of unicorns appears — bonus army, gold, and food from the reflection.",
  },
  [UnicornShatteredRealityOutcome.PRISMATIC_SURGE]: {
    outcome: UnicornShatteredRealityOutcome.PRISMATIC_SURGE,
    baseGoldDelta: 1_200,
    baseFoodDelta: 0,
    baseArmyDelta: 0,
    basePointsDelta: 10,
    grantsTeleport: false,
    summary:
      "A prismatic surge floods your coffers with rare spectral gold.",
  },
  [UnicornShatteredRealityOutcome.LUCKY_GALLOP]: {
    outcome: UnicornShatteredRealityOutcome.LUCKY_GALLOP,
    baseGoldDelta: 100,
    baseFoodDelta: 100,
    baseArmyDelta: 25,
    basePointsDelta: 8,
    grantsTeleport: true,
    summary:
      "A lucky gallop across reality — army reinforcements AND a temporary teleport tile!",
  },
};

/**
 * Activate Shattered Reality with a chosen outcome.
 * The player picks from the three outcomes — this is NOT random.
 */
export function activateShatteredReality(args: {
  gold: number;
  state: ShatteredRealityState;
  cooldownEndsAt: number | undefined;
  chosenOutcome: UnicornShatteredRealityOutcome;
  now: number;
}): AbilityActivationResult {
  const cost = calculateShatteredRealityCost(args.state.activationCount);

  if (args.gold < cost) {
    return {
      ok: false,
      error: `Shattered Reality costs ${cost.toLocaleString()} gold (you have ${args.gold.toLocaleString()}). Activation #${args.state.activationCount + 1}.`,
    };
  }

  const entry = SHATTERED_REALITY_OUTCOMES[args.chosenOutcome];
  const newState: ShatteredRealityState = {
    activationCount: args.state.activationCount + 1,
    lastActivatedAt: args.now,
  };

  const nextCost = calculateShatteredRealityCost(newState.activationCount);

  return {
    ok: true,
    cooldownEndsAt: computeCooldownEndsAt(
      RaceAbilityKind.UNICORN_SHATTERED_REALITY,
      args.now,
    ),
    data: {
      goldSpent: cost,
      outcome: entry.outcome,
      deltas: {
        gold: entry.baseGoldDelta - cost, // net gold change
        food: entry.baseFoodDelta,
        army: entry.baseArmyDelta,
        points: entry.basePointsDelta,
      },
      summary: entry.summary,
      grantsTeleport: entry.grantsTeleport,
      newState,
      nextActivationCost: nextCost,
    },
  };
}

// ═════════════════════════════════════════════════════════════════════════════
// 3. Temporary Teleport
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Certain Unicorn abilities grant a Temporary Teleport — the fortress can
 * instantly relocate to any unoccupied tile on the map. The teleport lasts
 * for a limited time before the fortress snaps back to its original location.
 */

export type TemporaryTeleport = {
  /** When the teleport was granted. */
  grantedAt: number;
  /** When the teleport expires (fortress snaps back). */
  expiresAt: number;
  /** The tile the fortress teleported to (undefined until used). */
  targetTileId: string | undefined;
  /** The original tile the fortress will return to. */
  originTileId: string;
  /** Whether the teleport has been used. */
  used: boolean;
};

/** How long a temporary teleport lasts before expiring unused. */
export const TEMP_TELEPORT_DURATION_MS = 3_600_000; // 1 hour

/** How long the fortress stays at the teleport destination before snapping back. */
export const TELEPORT_STAY_DURATION_MS = 600_000; // 10 minutes

/**
 * Create a new temporary teleport grant.
 */
export function grantTemporaryTeleport(args: {
  now: number;
  originTileId: string;
}): TemporaryTeleport {
  return {
    grantedAt: args.now,
    expiresAt: args.now + TEMP_TELEPORT_DURATION_MS,
    targetTileId: undefined,
    originTileId: args.originTileId,
    used: false,
  };
}

/**
 * Use a temporary teleport to jump to a target tile.
 * Returns the updated teleport or an error.
 */
export function useTemporaryTeleport(args: {
  teleport: TemporaryTeleport;
  targetTileId: string;
  targetTileIsOccupied: boolean;
  now: number;
}): { teleport: TemporaryTeleport } | { error: string } {
  if (args.teleport.used) {
    return { error: "This teleport has already been used." };
  }
  if (args.now > args.teleport.expiresAt) {
    return { error: "This teleport has expired." };
  }
  if (args.targetTileIsOccupied) {
    return { error: "The target tile is occupied." };
  }

  return {
    teleport: {
      ...args.teleport,
      targetTileId: args.targetTileId,
      used: true,
    },
  };
}

/**
 * Check if a teleport has expired or the stay duration is over (snap-back).
 * Returns the action needed: "snap_back", "expired", or "active".
 */
export function checkTeleportStatus(
  teleport: TemporaryTeleport,
  now: number,
): "active" | "snap_back" | "expired_unused" {
  if (!teleport.used) {
    return now > teleport.expiresAt ? "expired_unused" : "active";
  }
  // Teleport was used at grantedAt (approximation — in practice we'd track use time).
  const snapBackAt = teleport.grantedAt + TELEPORT_STAY_DURATION_MS;
  return now >= snapBackAt ? "snap_back" : "active";
}

// ═════════════════════════════════════════════════════════════════════════════
// 4. Unicorn Idle Summary
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Process one tick for a Unicorn fortress:
 * 1. Roll Reality Flux → random boon/curse
 * 2. Check Shattered Reality cooldown status
 * 3. Check teleport snap-back
 *
 * Returns everything the caller needs to update the fortress state.
 */
export function processUnicornTick(args: {
  resources: ResourceSnapshot;
  shatteredReality: ShatteredRealityState;
  teleport: TemporaryTeleport | undefined;
  now: number;
}): {
  resources: ResourceSnapshot;
  flux: FluxEntry;
  teleportStatus: "active" | "snap_back" | "none";
} {
  const { resources: newResources, flux } = applyRealityFluxTick(
    args.resources,
  );

  let teleportStatus: "active" | "snap_back" | "none" = "none";
  if (args.teleport) {
    const status = checkTeleportStatus(args.teleport, args.now);
    teleportStatus = status === "active" ? "active" : "snap_back";
  }

  return {
    resources: newResources,
    flux,
    teleportStatus,
  };
}
