// =============================================================================
// Battalion Types & Constants — Season 4 Army System
// =============================================================================
// Pure types and lookup tables. No DB / Prisma imports.
// =============================================================================

// ── Tier ─────────────────────────────────────────────────────────────────────

export const BattalionTier = {
  RECRUIT: 0,
  REGULAR: 1,
  VETERAN: 2,
  ELITE: 3,
} as const;

export type BattalionTier = (typeof BattalionTier)[keyof typeof BattalionTier];

export const BATTALION_TIER_NAMES: Record<BattalionTier, string> = {
  [BattalionTier.RECRUIT]: "Recruit",
  [BattalionTier.REGULAR]: "Regular",
  [BattalionTier.VETERAN]: "Veteran",
  [BattalionTier.ELITE]: "Elite",
};

// ── Tier Multipliers ─────────────────────────────────────────────────────────

/** Combat multipliers per tier. Baseline is Recruit = 1.0. */
export type TierMultipliers = {
  damage: number;
  defense: number;
  speed: number;
  /** XP required to reach this tier from previous. */
  xpToReach: number;
};

export const TIER_MULTIPLIERS: Record<BattalionTier, TierMultipliers> = {
  [BattalionTier.RECRUIT]: {
    damage: 1.0,
    defense: 1.0,
    speed: 1.0,
    xpToReach: 0,
  },
  [BattalionTier.REGULAR]: {
    damage: 1.15,
    defense: 1.1,
    speed: 1.0,
    xpToReach: 100,
  },
  [BattalionTier.VETERAN]: {
    damage: 1.35,
    defense: 1.25,
    speed: 1.05,
    xpToReach: 300,
  },
  [BattalionTier.ELITE]: {
    damage: 1.6,
    defense: 1.45,
    speed: 1.1,
    xpToReach: 750,
  },
};

// ── Stance ───────────────────────────────────────────────────────────────────

export const BattalionStance = {
  FORTIFY: "FORTIFY",
  PATROL: "PATROL",
  TRAINING: "TRAINING",
  AMBUSH: "AMBUSH",
  REST: "REST",
  /** Battalion is moving / on an order (not garrisoned). */
  MOBILE: "MOBILE",
} as const;

export type BattalionStance =
  (typeof BattalionStance)[keyof typeof BattalionStance];

export const BattalionMode = {
  GUARD: "GUARD",
  ATTACK: "ATTACK",
  RESERVE: "RESERVE",
  ALLIANCE: "ALLIANCE",
} as const;

export type BattalionMode =
  (typeof BattalionMode)[keyof typeof BattalionMode];

export const BATTALION_MODE_LABELS: Record<BattalionMode, string> = {
  [BattalionMode.RESERVE]: "Reserve",
  [BattalionMode.GUARD]: "Guard",
  [BattalionMode.ATTACK]: "Attack",
  [BattalionMode.ALLIANCE]: "Alliance",
};

export function normalizeBattalionMode(
  mode: string | null | undefined,
): BattalionMode {
  if (
    mode === BattalionMode.ATTACK ||
    mode === BattalionMode.GUARD ||
    mode === BattalionMode.RESERVE ||
    mode === BattalionMode.ALLIANCE
  ) {
    return mode;
  }
  return BattalionMode.GUARD;
}

export function getHiddenStanceForMode(mode: BattalionMode): BattalionStance {
  if (mode === BattalionMode.RESERVE) return BattalionStance.REST;
  if (mode === BattalionMode.GUARD) return BattalionStance.FORTIFY;
  return BattalionStance.MOBILE;
}

export function getBattalionModeUpdate(mode: string): {
  mode: BattalionMode;
  stance: BattalionStance;
  garrisonedAt?: null;
  stanceLockedUntil: null;
} {
  const normalizedMode = normalizeBattalionMode(mode);
  return {
    mode: normalizedMode,
    stance: getHiddenStanceForMode(normalizedMode),
    ...(normalizedMode === BattalionMode.GUARD ? {} : { garrisonedAt: null }),
    stanceLockedUntil: null,
  };
}

export type StanceEffects = {
  defenseMultiplier: number;
  damageDealtMultiplier: number;
  damageTakenMultiplier: number;
  xpPerTick: number;
  moralePerTick: number;
  healPerTick: number; // % of max size recovered per tick
  description: string;
};

export const STANCE_EFFECTS: Record<string, StanceEffects> = {
  [BattalionStance.FORTIFY]: {
    defenseMultiplier: 1.3,
    damageDealtMultiplier: 1.0,
    damageTakenMultiplier: 0.5,
    xpPerTick: 0,
    moralePerTick: 0,
    healPerTick: 0,
    description: "+30% defense, -50% casualties taken. 1 hour lock-in.",
  },
  [BattalionStance.PATROL]: {
    defenseMultiplier: 1.0,
    damageDealtMultiplier: 1.0,
    damageTakenMultiplier: 1.1,
    xpPerTick: 0,
    moralePerTick: 0,
    healPerTick: 0,
    description:
      "25% chance to detect raids early. +10% speed when responding. +10% casualties if attacked.",
  },
  [BattalionStance.TRAINING]: {
    defenseMultiplier: 1.0,
    damageDealtMultiplier: 1.0,
    damageTakenMultiplier: 1.25,
    xpPerTick: 1,
    moralePerTick: 0,
    healPerTick: 0,
    description: "+1 XP/tick for lowest-tier battalion. No combat bonus.",
  },
  [BattalionStance.AMBUSH]: {
    defenseMultiplier: 1.0,
    damageDealtMultiplier: 1.4,
    damageTakenMultiplier: 1.0,
    xpPerTick: 0,
    moralePerTick: 0,
    healPerTick: 0,
    description:
      "+40% damage on first round. Enemies can't retreat. Lost if detected.",
  },
  [BattalionStance.REST]: {
    defenseMultiplier: 0,
    damageDealtMultiplier: 0,
    damageTakenMultiplier: 1.0,
    xpPerTick: 0,
    moralePerTick: 5,
    healPerTick: 2,
    description:
      "+5 morale/tick, +2% heal/tick. Cannot fight — auto-retreats if attacked.",
  },
  [BattalionStance.MOBILE]: {
    defenseMultiplier: 1.0,
    damageDealtMultiplier: 1.0,
    damageTakenMultiplier: 1.0,
    xpPerTick: 0,
    moralePerTick: 0,
    healPerTick: 0,
    description: "Moving or on an order. No bonuses or penalties.",
  },
};

// ── Battalion ────────────────────────────────────────────────────────────────

/**
 * A battalion is a named, persistent group of units with identity.
 * Battalions level up, get tired, hold stances, and can be assigned to tiles.
 */
export type Battalion = {
  /** Stable unique id (cuid). */
  id: string;
  /** Player-assigned or auto-generated name. */
  name: string;
  /** Current unit count (can be zero — empty battalion). */
  size: number;
  /** Maximum unit capacity. Starts at 100, upgradeable. */
  maxSize: number;
  /** Current veterancy tier. */
  tier: BattalionTier;
  /** XP accumulated toward the next tier. Resets on promotion. */
  xp: number;
  /** When this battalion recovers from fatigue (epoch ms). Null = ready. */
  readyAt: number | null;
  /** Current stance. */
  stance: BattalionStance;
  /** Current mode: GUARD, ATTACK, RESERVE, ALLIANCE. Defaults to GUARD. */
  mode?: BattalionMode;
  /** Tile ID where this battalion is garrisoned. Null = at fortress. */
  garrisonedAt: string | null;
  /** When the garrison/fortify lock-in expires (epoch ms). Null = not locked. */
  stanceLockedUntil: number | null;
};

// ── Battalion Slots ──────────────────────────────────────────────────────────

/**
 * Maximum battalion slots by fortress level.
 */
/**
 * Battalion slots based on barracks level (not fortress level).
 * Default: 3 slots. +1 per 2 barracks levels.
 */
export function getBaseBattalionSlots(barracksLevel: number): number {
  if (barracksLevel <= 1) return 3;
  if (barracksLevel <= 3) return 4;
  if (barracksLevel <= 5) return 5;
  if (barracksLevel <= 7) return 6;
  if (barracksLevel <= 9) return 7;
  return 7; // max base slots
}

/** Maximum natural slots. */
export const MAX_NATURAL_SLOTS = 7;

/** Extra slots purchasable with gold. */
export const EXTRA_SLOT_COSTS: number[] = [2_000, 5_000, 12_000];

/** Absolute maximum battalions (natural + purchased). */
export const ABSOLUTE_MAX_BATTALIONS = MAX_NATURAL_SLOTS + EXTRA_SLOT_COSTS.length;

/**
 * Get the total battalion slots for a fortress.
 * @param barracksLevel — current barracks level (0 = level 1, 9 = level 10)
 * @param extraSlotsPurchased — bonus slots from skills/shop
 * @param skillBonus — additional slots from skill tree
 */
export function getBattalionSlots(
  barracksLevel: number,
  extraSlotsPurchased: number,
  skillBonus = 0,
): number {
  const natural = getBaseBattalionSlots(barracksLevel);
  return Math.min(natural + extraSlotsPurchased + skillBonus, ABSOLUTE_MAX_BATTALIONS);
}

/**
 * Cost to purchase the next extra battalion slot. Returns null if max reached.
 */
export function nextExtraSlotCost(
  extraSlotsPurchased: number,
): number | null {
  if (extraSlotsPurchased >= EXTRA_SLOT_COSTS.length) return null;
  return EXTRA_SLOT_COSTS[extraSlotsPurchased];
}

// ── Battalion Limits & Costs ─────────────────────────────────────────────────

/** Default maxSize for a new battalion (tier 0). */
export const DEFAULT_BATTALION_MAX_SIZE = 500;

/** Tier-based maximum battalion sizes. */
export const TIER_MAX_SIZES: Record<BattalionTier, number> = {
  [BattalionTier.RECRUIT]: 500,
  [BattalionTier.REGULAR]: 5_000,
  [BattalionTier.VETERAN]: 15_000,
  [BattalionTier.ELITE]: 50_000,
};

/** Gold cost to commission a new battalion (on top of filling it). */
export const BATTALION_COMMISSION_COST = 2_000;

/** Gold cost to expand a battalion's maxSize by 10% of current tier max. */
export const BATTALION_EXPAND_COST_PER_50 = 400;

/** Absolute maximum battalion size (Elite tier). */
export const MAX_BATTALION_SIZE = TIER_MAX_SIZES[BattalionTier.ELITE];

// ── Morale ───────────────────────────────────────────────────────────────────

/** Fortress-level morale stat (0–100). */
export type MoraleState = {
  value: number; // 0–100
};

export const MORALE_THRESHOLDS = {
  INSPIRED: 80,
  STEADY: 50,
  SHAKEN: 25,
  // below 25 = BROKEN
} as const;

export type MoraleLevel = "INSPIRED" | "STEADY" | "SHAKEN" | "BROKEN";

export function getMoraleLevel(value: number): MoraleLevel {
  if (value >= MORALE_THRESHOLDS.INSPIRED) return "INSPIRED";
  if (value >= MORALE_THRESHOLDS.STEADY) return "STEADY";
  if (value >= MORALE_THRESHOLDS.SHAKEN) return "SHAKEN";
  return "BROKEN";
}

export const MORALE_EFFECTS: Record<
  MoraleLevel,
  { damageMultiplier: number; defenseMultiplier: number; desertionRate: number }
> = {
  INSPIRED: { damageMultiplier: 1.2, defenseMultiplier: 1.1, desertionRate: 0 },
  STEADY: { damageMultiplier: 1.0, defenseMultiplier: 1.0, desertionRate: 0 },
  SHAKEN: { damageMultiplier: 0.85, defenseMultiplier: 0.9, desertionRate: 0 },
  BROKEN: {
    damageMultiplier: 0.7,
    defenseMultiplier: 0.75,
    desertionRate: 0.02,
  },
};

// ── Morale Events ────────────────────────────────────────────────────────────

/** Morale change values for various events. */
export const MORALE_EVENTS = {
  WIN_ATTACK: +8,
  WIN_BATTLEFIELD: +15,
  LOSE_ATTACK: -10,
  LOSE_BATTLEFIELD: -20,
  STARVATION_TICK: -5,
  ELITE_UNIT_DIES: -3, // per elite unit killed
  ALLY_NEARBY: +1, // per tick, per adjacent allied tile
  REST_STANCE: +5, // per tick in REST stance
  FIELD_PROMOTION: +5,
  NEW_BATTALION: -2, // slight morale hit for untested recruits
};

// ── Fatigue ──────────────────────────────────────────────────────────────────

/** Cooldown after a skirmish (small fight, raid interception). */
export const FATIGUE_SKIRMISH_MS = 600_000; // 10 minutes

/** Cooldown after a full battle (attack/battlefield). */
export const FATIGUE_BATTLE_MS = 1_800_000; // 30 minutes

/** Effectiveness penalty when fighting while fatigued. */
export const FATIGUE_PENALTY = 0.25; // -25%

// ── Name Generator ───────────────────────────────────────────────────────────

const BATTALION_PREFIXES = [
  "1st", "2nd", "3rd", "4th", "5th", "6th", "7th", "8th", "9th", "10th",
  "11th", "12th", "13th",
];

const BATTALION_NAMES_DWARF = [
  "Ironbeard", "Stonehammer", "Deepdelver", "Shieldbearer",
  "Runeguard", "Anvilborn", "Mountainwatch", "Goldmantle",
  "Forgewarden", "Hammerfist", "Oathkeeper", "Cragshield", "Grudgebearer",
];

const BATTALION_NAMES_ORK = [
  "Skullkrak", "Da Krumpany", "Gitsmasha", "Waaaghboyz",
  "Burnas", "Lootaz", "Trukksmash", "Dakka Boyz",
  "Choppa Mob", "Boss's Own", "Scrapjakz", "Grotkikka", "Big Shootaz",
];

const BATTALION_NAMES_MURINE = [
  "Voidrunner", "Starhawk", "Convoy Guard", "Tradewind",
  "Jumpcorps", "Rapid Sword", "Supply Line", "Cargo Shield",
  "Nebula Watch", "Freightborne", "Logisticorps", "Packet Runner", "Relay",
];

const BATTALION_NAMES_UNICORN = [
  "Prism Guard", "Glimmerhoof", "Stardust", "Reality Riders",
  "Sparkle Legion", "Mirage Company", "Whimsy Wing", "Dreamchaser",
  "Twilight Vanguard", "Sugar Rush", "Mythic Host", "Echo Troop", "Fable",
];

/**
 * Generate a battalion name based on race and how many battalions already exist.
 */
export function generateBattalionName(
  race: "DWARFS" | "ORKS" | "SPACE_MURINES" | "UNSTABLE_UNICORNS",
  existingCount: number,
): string {
  const nameLists: Record<string, string[]> = {
    DWARFS: BATTALION_NAMES_DWARF,
    ORKS: BATTALION_NAMES_ORK,
    SPACE_MURINES: BATTALION_NAMES_MURINE,
    UNSTABLE_UNICORNS: BATTALION_NAMES_UNICORN,
  };

  const names = nameLists[race] ?? BATTALION_NAMES_DWARF;
  const prefix =
    BATTALION_PREFIXES[Math.min(existingCount, BATTALION_PREFIXES.length - 1)];
  const name = names[existingCount % names.length];

  return `${prefix} ${name}`;
}
