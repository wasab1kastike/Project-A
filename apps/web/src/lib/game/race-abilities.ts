// =============================================================================
// Season 4 Race Abilities — Shared Types & Helpers
// =============================================================================
// Pure functions only. No DB / Prisma imports. Takes plain data, returns results.
// =============================================================================

// ── Fortress Identity ────────────────────────────────────────────────────────

export const FortressRace = {
  DWARFS: "DWARFS",
  UNSTABLE_UNICORNS: "UNSTABLE_UNICORNS",
  SPACE_MURINES: "SPACE_MURINES",
  ORKS: "ORKS",
} as const;

export type FortressRace = (typeof FortressRace)[keyof typeof FortressRace];

// ── Race Ability Kind (all playable abilities across races) ──────────────────

export const RaceAbilityKind = {
  // Dwarf abilities
  DWARF_DEEP_MINING: "DWARF_DEEP_MINING",
  DWARF_RUNE_OF_GRUDGES: "DWARF_RUNE_OF_GRUDGES",

  // Ork abilities
  ORK_BOSS_ORDER: "ORK_BOSS_ORDER",
  ORK_WAAAGH_INVESTMENT: "ORK_WAAAGH_INVESTMENT",

  // Space Murine abilities
  MURINE_RAPID_RESPONSE: "MURINE_RAPID_RESPONSE",

  // Unstable Unicorn abilities
  UNICORN_SHATTERED_REALITY: "UNICORN_SHATTERED_REALITY",
} as const;

export type RaceAbilityKind =
  (typeof RaceAbilityKind)[keyof typeof RaceAbilityKind];

// ── Dwarf-Specific Enums ─────────────────────────────────────────────────────

export const DwarfDeepMiningOutcome = {
  RICH_VEIN: "RICH_VEIN",
  ORE_SURGE: "ORE_SURGE",
  BATTLE_RUNES: "BATTLE_RUNES",
  FACTION_SEAL: "FACTION_SEAL",
  BURIED_WARBAND: "BURIED_WARBAND",
  CAVE_IN: "CAVE_IN",
  UNSTABLE_TUNNELS: "UNSTABLE_TUNNELS",
  SHAFT_COLLAPSE: "SHAFT_COLLAPSE",
} as const;

export type DwarfDeepMiningOutcome =
  (typeof DwarfDeepMiningOutcome)[keyof typeof DwarfDeepMiningOutcome];

// ── Ork-Specific Enums ───────────────────────────────────────────────────────

export const OrkBossOrderKind = {
  MORE_DAKKA: "MORE_DAKKA",
  LOOT_WAGONS: "LOOT_WAGONS",
  PATCH_DA_FORT: "PATCH_DA_FORT",
} as const;

export type OrkBossOrderKind =
  (typeof OrkBossOrderKind)[keyof typeof OrkBossOrderKind];

export const OrkWaaaghInvestmentKind = {
  KEEP_IT_LOUD: "KEEP_IT_LOUD",
  BIGGER_SHOUTIN: "BIGGER_SHOUTIN",
  DA_GREEN_TIDE: "DA_GREEN_TIDE",
} as const;

export type OrkWaaaghInvestmentKind =
  (typeof OrkWaaaghInvestmentKind)[keyof typeof OrkWaaaghInvestmentKind];

export const OrkScrapEventReason = {
  ATTACK_LAUNCHED: "ATTACK_LAUNCHED",
  ATTACK_RECEIVED: "ATTACK_RECEIVED",
  BATTLEFIELD_PARTICIPATION: "BATTLEFIELD_PARTICIPATION",
  UNITS_KILLED: "UNITS_KILLED",
  UNITS_LOST: "UNITS_LOST",
  TILE_CLAIMED: "TILE_CLAIMED",
} as const;

export type OrkScrapEventReason =
  (typeof OrkScrapEventReason)[keyof typeof OrkScrapEventReason];

// ── Unicorn-Specific Enums ───────────────────────────────────────────────────

export const UnicornShatteredRealityOutcome = {
  MIRROR_HOST: "MIRROR_HOST",
  PRISMATIC_SURGE: "PRISMATIC_SURGE",
  LUCKY_GALLOP: "LUCKY_GALLOP",
} as const;

export type UnicornShatteredRealityOutcome =
  (typeof UnicornShatteredRealityOutcome)[keyof typeof UnicornShatteredRealityOutcome];

// ── Shared Result Types ──────────────────────────────────────────────────────

/** Every ability activation returns this shape. */
export type AbilityActivationResult = {
  /** Whether the ability was successfully activated. */
  ok: boolean;
  /** Human-readable error when ok=false. */
  error?: string;
  /** When the ability's cooldown expires (epoch ms). */
  cooldownEndsAt?: number;
  /** Ability-specific payload — deltas, outcome, buffs, etc. */
  data?: Record<string, unknown>;
};

// ── Cooldown Helpers ─────────────────────────────────────────────────────────

/**
 * Cooldown durations in milliseconds, keyed by ability kind.
 * These are Season 4 baseline values — doctrines may modify them.
 */
export const ABILITY_COOLDOWNS: Record<RaceAbilityKind, number> = {
  [RaceAbilityKind.DWARF_DEEP_MINING]: 3_600_000, // 1 hour
  [RaceAbilityKind.DWARF_RUNE_OF_GRUDGES]: 300_000, // 5 minutes
  [RaceAbilityKind.ORK_BOSS_ORDER]: 1_800_000, // 30 minutes
  [RaceAbilityKind.ORK_WAAAGH_INVESTMENT]: 0, // no cooldown — limited by scrap
  [RaceAbilityKind.MURINE_RAPID_RESPONSE]: 600_000, // 10 minutes
  [RaceAbilityKind.UNICORN_SHATTERED_REALITY]: 7_200_000, // 2 hours
};

/**
 * Returns true when the ability is off cooldown and can be activated.
 * `cooldownEndsAt` is an epoch-ms timestamp (or undefined if never activated).
 * `now` defaults to Date.now().
 */
export function isOffCooldown(
  abilityKind: RaceAbilityKind,
  cooldownEndsAt: number | undefined,
  now = Date.now(),
): boolean {
  if (cooldownEndsAt == null) return true;
  return now >= cooldownEndsAt;
}

/**
 * Compute the new cooldown-end timestamp after activating an ability.
 */
export function computeCooldownEndsAt(
  abilityKind: RaceAbilityKind,
  now = Date.now(),
): number {
  return now + (ABILITY_COOLDOWNS[abilityKind] ?? 0);
}

/**
 * Returns a human-readable remaining cooldown string, or null if ready.
 */
export function formatCooldownRemaining(
  cooldownEndsAt: number | undefined,
  now = Date.now(),
): string | null {
  if (cooldownEndsAt == null || now >= cooldownEndsAt) return null;
  const remainingMs = cooldownEndsAt - now;
  const minutes = Math.ceil(remainingMs / 60_000);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.ceil(minutes / 60);
  return `${hours}h`;
}

// ── Resource Floor Helpers ───────────────────────────────────────────────────

/** Clamp a number to a minimum floor (default 0). */
export function floor(value: number, min = 0): number {
  return Math.max(min, value);
}

/** Resources shape used across race ability inputs/outputs. */
export type ResourceSnapshot = {
  gold: number;
  food: number;
  army: number;
  points: number;
};

/** Apply a set of deltas to a resource snapshot, flooring at zero. */
export function applyResourceDeltas(
  resources: ResourceSnapshot,
  deltas: Partial<ResourceSnapshot>,
): ResourceSnapshot {
  return {
    gold: floor(resources.gold + (deltas.gold ?? 0)),
    food: floor(resources.food + (deltas.food ?? 0)),
    army: floor(resources.army + (deltas.army ?? 0)),
    points: floor(resources.points + (deltas.points ?? 0)),
  };
}
