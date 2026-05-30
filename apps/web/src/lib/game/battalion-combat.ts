// =============================================================================
// Battalion Combat System — Season 4
// =============================================================================
// Round-based combat between battalions. Tier advantage, morale, fatigue,
// stance, and retreat logic all matter.
// Pure functions only. No DB / Prisma imports.
// =============================================================================

import {
  Battalion,
  BattalionStance,
  BattalionTier,
  BATTALION_TIER_NAMES,
  FATIGUE_BATTLE_MS,
  FATIGUE_PENALTY,
  FATIGUE_SKIRMISH_MS,
  getMoraleLevel,
  MORALE_EFFECTS,
  MORALE_EVENTS,
  MoraleLevel,
  STANCE_EFFECTS,
  TIER_MULTIPLIERS,
} from "./battalion-types";
import { calculateCombatXp } from "./army-xp";

// ── Combat Participants ──────────────────────────────────────────────────────

export type CombatSide = "ATTACKER" | "DEFENDER";

export type CombatBattalion = {
  battalion: Battalion;
  side: CombatSide;
  /** Number of units in this battalion committed to this fight. */
  committed: number;
  /** Current alive count within this fight. */
  alive: number;
  /** Damage dealt this round. */
  damageDealt: number;
  /** Damage taken this round. */
  damageTaken: number;
};

export type CombatState = {
  round: number;
  attackerBattalions: CombatBattalion[];
  defenderBattalions: CombatBattalion[];
  attackerTotalAlive: number;
  defenderTotalAlive: number;
  /** Whether this is a battlefield (multi-participant) or a skirmish. */
  isBattlefield: boolean;
  /** Attacker's fortress morale level. */
  attackerMorale: MoraleLevel;
  /** Defender's fortress morale level. */
  defenderMorale: MoraleLevel;
  /** Whether the attacker has equipment decay. */
  attackerEquipmentDecay: boolean;
  /** Whether the defender has equipment decay. */
  defenderEquipmentDecay: boolean;
  finished: boolean;
  winner: CombatSide | null;
  /** Reason the combat ended. */
  endReason: string | null;
};

// ── Initialize Combat ────────────────────────────────────────────────────────

/**
 * Set up a combat engagement between attacker and defender battalions.
 */
export function initCombat(args: {
  attackerBattalions: { battalion: Battalion; committed: number }[];
  defenderBattalions: { battalion: Battalion; committed: number }[];
  isBattlefield: boolean;
  attackerMorale: number; // 0–100
  defenderMorale: number; // 0–100
  attackerEquipmentDecay: boolean;
  defenderEquipmentDecay: boolean;
}): CombatState {
  const attackerBattalions: CombatBattalion[] =
    args.attackerBattalions
      .filter((a) => a.committed > 0)
      .map((a) => ({
        battalion: a.battalion,
        side: "ATTACKER" as CombatSide,
        committed: a.committed,
        alive: a.committed,
        damageDealt: 0,
        damageTaken: 0,
      }));

  const defenderBattalions: CombatBattalion[] =
    args.defenderBattalions
      .filter((d) => d.committed > 0)
      .map((d) => ({
        battalion: d.battalion,
        side: "DEFENDER" as CombatSide,
        committed: d.committed,
        alive: d.committed,
        damageDealt: 0,
        damageTaken: 0,
      }));

  return {
    round: 0,
    attackerBattalions,
    defenderBattalions,
    attackerTotalAlive: attackerBattalions.reduce((s, b) => s + b.alive, 0),
    defenderTotalAlive: defenderBattalions.reduce((s, b) => s + b.alive, 0),
    isBattlefield: args.isBattlefield,
    attackerMorale: getMoraleLevel(args.attackerMorale),
    defenderMorale: getMoraleLevel(args.defenderMorale),
    attackerEquipmentDecay: args.attackerEquipmentDecay,
    defenderEquipmentDecay: args.defenderEquipmentDecay,
    finished: false,
    winner: null,
    endReason: null,
  };
}

// ── Damage Calculation ───────────────────────────────────────────────────────

/**
 * Calculate the effective damage multiplier for a single combat battalion.
 *
 *   multi = tierDamage
 *         × moraleMultiplier
 *         × stanceMultiplier
 *         × fatiguePenalty (if fatigued)
 *         × equipmentDecay (if unpaid gold)
 *         × ambushBonus (first round only)
 */
export function getDamageMultiplier(
  cb: CombatBattalion,
  state: CombatState,
): number {
  let mult = TIER_MULTIPLIERS[cb.battalion.tier].damage;

  // Morale.
  const morale = cb.side === "ATTACKER" ? state.attackerMorale : state.defenderMorale;
  mult *= MORALE_EFFECTS[morale].damageMultiplier;

  // Stance.
  const stanceEffects = STANCE_EFFECTS[cb.battalion.stance];
  if (stanceEffects) {
    mult *= stanceEffects.damageDealtMultiplier;
  }

  // Fatigue.
  if (cb.battalion.readyAt !== null && cb.battalion.readyAt > Date.now()) {
    mult *= 1 - FATIGUE_PENALTY;
  }

  // Equipment decay.
  const equipmentDecay =
    cb.side === "ATTACKER"
      ? state.attackerEquipmentDecay
      : state.defenderEquipmentDecay;
  if (equipmentDecay) {
    mult *= 1 - FATIGUE_PENALTY; // same penalty as fatigue
  }

  // Ambush: +40% damage on first round.
  if (
    state.round === 1 &&
    cb.battalion.stance === BattalionStance.AMBUSH
    // In practice, ambush is lost if detected — caller handles that.
  ) {
    mult *= 1.4;
  }

  return mult;
}

/**
 * Calculate effective defense multiplier (reduces damage taken).
 */
export function getDefenseMultiplier(
  cb: CombatBattalion,
  state: CombatState,
): number {
  let mult = TIER_MULTIPLIERS[cb.battalion.tier].defense;

  const morale = cb.side === "ATTACKER" ? state.attackerMorale : state.defenderMorale;
  mult *= MORALE_EFFECTS[morale].defenseMultiplier;

  const stanceEffects = STANCE_EFFECTS[cb.battalion.stance];
  if (stanceEffects) {
    mult *= stanceEffects.defenseMultiplier;
  }

  return mult;
}

// ── Combat Round ─────────────────────────────────────────────────────────────

export type CombatRoundResult = {
  state: CombatState;
  /** Per-side casualties this round. */
  attackerCasualties: number;
  defenderCasualties: number;
  /** Battalions that were wiped this round. */
  wipedBattalions: string[];
};

/** Base damage rate — fraction of alive units that deal damage each round. */
const BASE_DAMAGE_RATE = 0.45;

/** Maximum rounds before stalemate. */
const MAX_COMBAT_ROUNDS = 20;

/**
 * Resolve one round of combat.
 * Each side's battalions deal damage proportional to their alive count × damage multiplier.
 * Casualties are distributed across opposing battalions by proportion of alive units.
 */
export function resolveCombatRound(state: CombatState): CombatRoundResult {
  if (state.finished) {
    return {
      state,
      attackerCasualties: 0,
      defenderCasualties: 0,
      wipedBattalions: [],
    };
  }

  const newState = { ...state };
  newState.round++;

  // ── Calculate total damage output per side ───────────────────────────

  let attackerTotalDamage = 0;
  for (const cb of newState.attackerBattalions) {
    if (cb.alive <= 0) continue;
    const mult = getDamageMultiplier(cb, newState);
    const damage = Math.floor(cb.alive * mult * BASE_DAMAGE_RATE);
    cb.damageDealt = damage;
    attackerTotalDamage += damage;
  }

  let defenderTotalDamage = 0;
  for (const cb of newState.defenderBattalions) {
    if (cb.alive <= 0) continue;
    const mult = getDamageMultiplier(cb, newState);
    const damage = Math.floor(cb.alive * mult * BASE_DAMAGE_RATE);
    cb.damageDealt = damage;
    defenderTotalDamage += damage;
  }

  // ── Apply damage to opposing side ────────────────────────────────────

  let attackerCasualties = 0;
  let defenderCasualties = 0;
  const wipedBattalions: string[] = [];

  // Defenders take damage from attackers.
  if (attackerTotalDamage > 0 && newState.defenderTotalAlive > 0) {
    const result = applyDamageToSide(
      newState.defenderBattalions,
      attackerTotalDamage,
      newState,
    );
    // Merge back.
    for (let i = 0; i < newState.defenderBattalions.length; i++) {
      const updated = result.battalions[i];
      newState.defenderBattalions[i].alive = updated.alive;
      newState.defenderBattalions[i].damageTaken = updated.damageTaken;
    }
    defenderCasualties = result.totalCasualties;
    wipedBattalions.push(...result.wipedIds);
  }

  // Attackers take damage from defenders.
  if (defenderTotalDamage > 0 && newState.attackerTotalAlive > 0) {
    const result = applyDamageToSide(
      newState.attackerBattalions,
      defenderTotalDamage,
      newState,
    );
    for (let i = 0; i < newState.attackerBattalions.length; i++) {
      const updated = result.battalions[i];
      newState.attackerBattalions[i].alive = updated.alive;
      newState.attackerBattalions[i].damageTaken = updated.damageTaken;
    }
    attackerCasualties = result.totalCasualties;
    wipedBattalions.push(...result.wipedIds);
  }

  // Update totals.
  newState.attackerTotalAlive = newState.attackerBattalions.reduce(
    (s, b) => s + b.alive,
    0,
  );
  newState.defenderTotalAlive = newState.defenderBattalions.reduce(
    (s, b) => s + b.alive,
    0,
  );

  // ── Check end conditions ─────────────────────────────────────────────

  // One side wiped.
  if (newState.attackerTotalAlive <= 0) {
    newState.finished = true;
    newState.winner = "DEFENDER";
    newState.endReason = "All attacker battalions destroyed.";
  } else if (newState.defenderTotalAlive <= 0) {
    newState.finished = true;
    newState.winner = "ATTACKER";
    newState.endReason = "All defender battalions destroyed.";
  }

  // Max rounds reached — stalemate, defender wins by default.
  if (newState.round >= MAX_COMBAT_ROUNDS && !newState.finished) {
    newState.finished = true;
    newState.winner = "DEFENDER";
    newState.endReason = "Combat timed out after 20 rounds. Defender holds.";
  }

  // Broken morale → auto-retreat.
  // After round 3, morale drops each round.
  if (!newState.finished && newState.round > 3) {
    // Morale degrades for both sides.
    if (newState.attackerMorale === "BROKEN") {
      newState.finished = true;
      newState.winner = "DEFENDER";
      newState.endReason = "Attacker morale broken — retreat.";
    } else if (newState.defenderMorale === "BROKEN") {
      newState.finished = true;
      newState.winner = "ATTACKER";
      newState.endReason = "Defender morale broken — flee.";
    }
  }

  return {
    state: newState,
    attackerCasualties,
    defenderCasualties,
    wipedBattalions,
  };
}

/**
 * Apply damage to one side's battalions.
 * Damage is distributed proportionally to alive count.
 * Higher-tier battalions take proportionally less damage (defense multiplier).
 */
function applyDamageToSide(
  battalions: CombatBattalion[],
  totalDamage: number,
  state: CombatState,
): {
  battalions: CombatBattalion[];
  totalCasualties: number;
  wipedIds: string[];
} {
  // Calculate effective "defense-weighted alive" for distribution.
  const weighted = battalions.map((cb) => {
    if (cb.alive <= 0) return { cb, weight: 0 };
    const defMult = getDefenseMultiplier(cb, state);
    // Higher defense = lower weight for damage distribution.
    // Weight is alive / defense → high-defense battalions take less damage.
    return { cb, weight: cb.alive / Math.max(defMult, 0.1) };
  });

  const totalWeight = weighted.reduce((s, w) => s + w.weight, 0);
  if (totalWeight <= 0) return { battalions, totalCasualties: 0, wipedIds: [] };

  let remainingDamage = totalDamage;
  let totalCasualties = 0;
  const wipedIds: string[] = [];

  const updated = battalions.map((cb) => ({ ...cb }));

  for (let i = 0; i < weighted.length; i++) {
    if (remainingDamage <= 0) break;
    const { cb, weight } = weighted[i];
    if (weight <= 0 || cb.alive <= 0) continue;

    const share = Math.floor((weight / totalWeight) * totalDamage);
    const taken = Math.min(share, cb.alive);
    const idx = updated.findIndex((u) => u.battalion.id === cb.battalion.id);
    if (idx >= 0) {
      updated[idx].alive -= taken;
      updated[idx].damageTaken = taken;
    }

    remainingDamage -= share;
    totalCasualties += taken;

    if (updated[idx]?.alive <= 0) {
      wipedIds.push(cb.battalion.id);
    }
  }

  // If there's leftover damage (rounding), apply to largest remaining battalion.
  if (remainingDamage > 0) {
    const alive = updated.filter((u) => u.alive > 0).sort((a, b) => b.alive - a.alive);
    if (alive.length > 0) {
      const taken = Math.min(remainingDamage, alive[0].alive);
      alive[0].alive -= taken;
      alive[0].damageTaken += taken;
      totalCasualties += taken;
      if (alive[0].alive <= 0) {
        wipedIds.push(alive[0].battalion.id);
      }
    }
  }

  return { battalions: updated, totalCasualties, wipedIds };
}

// ── Resolve Full Combat ──────────────────────────────────────────────────────

export type CombatResult = {
  winner: CombatSide | null;
  endReason: string;
  rounds: number;
  attackerTotalCasualties: number;
  defenderTotalCasualties: number;
  /** Updated battalions from both sides (with casualties applied). */
  attackerBattalions: CombatBattalion[];
  defenderBattalions: CombatBattalion[];
  /** XP awarded to surviving battalions. */
  xpAwarded: {
    battalionId: string;
    battalionName: string;
    xpGained: number;
    survivors: number;
  }[];
  /** Battalions wiped out. */
  wipedBattalionIds: string[];
};

/**
 * Run the full combat to completion.
 */
export function resolveCombat(initialState: CombatState): CombatResult {
  let state = { ...initialState };
  let totalAttackerCasualties = 0;
  let totalDefenderCasualties = 0;
  const allWiped: Set<string> = new Set();

  while (!state.finished) {
    const roundResult = resolveCombatRound(state);
    state = roundResult.state;
    totalAttackerCasualties += roundResult.attackerCasualties;
    totalDefenderCasualties += roundResult.defenderCasualties;
    roundResult.wipedBattalions.forEach((id) => allWiped.add(id));
  }

  // Calculate XP for survivors.
  const xpAwarded: CombatResult["xpAwarded"] = [];
  const won = state.winner;

  for (const cb of [...state.attackerBattalions, ...state.defenderBattalions]) {
    const survivors = cb.alive;
    if (survivors <= 0) continue;

    // Find the highest enemy tier fought for XP calculation.
    const enemySide =
      cb.side === "ATTACKER"
        ? state.defenderBattalions
        : state.attackerBattalions;

    let enemyTier: BattalionTier = BattalionTier.RECRUIT;
    for (const enemy of enemySide) {
      if (enemy.committed > 0 && enemy.battalion.tier > enemyTier) {
        enemyTier = enemy.battalion.tier;
      }
    }

    const sideWon =
      (cb.side === "ATTACKER" && won === "ATTACKER") ||
      (cb.side === "DEFENDER" && won === "DEFENDER");

    const xpGained = calculateCombatXp({
      survivors,
      enemyTier,
      won: sideWon,
      isBattlefield: state.isBattlefield,
    });

    if (xpGained > 0) {
      xpAwarded.push({
        battalionId: cb.battalion.id,
        battalionName: cb.battalion.name,
        xpGained,
        survivors,
      });
    }
  }

  return {
    winner: state.winner,
    endReason: state.endReason ?? "Unknown.",
    rounds: state.round,
    attackerTotalCasualties: totalAttackerCasualties,
    defenderTotalCasualties: totalDefenderCasualties,
    attackerBattalions: state.attackerBattalions,
    defenderBattalions: state.defenderBattalions,
    xpAwarded,
    wipedBattalionIds: [...allWiped],
  };
}

// ── Apply Combat Results to Real Battalions ──────────────────────────────────

/**
 * After combat resolves, apply casualties, XP, and fatigue to the actual
 * battalion objects.
 */
export function applyCombatResultsToBattalions(args: {
  battalions: Battalion[];
  combatResult: CombatResult;
  now: number;
  isBattlefield: boolean;
}): { battalions: Battalion[]; moraleDeltaAttacker: number; moraleDeltaDefender: number } {
  const updated = args.battalions.map((b) => ({ ...b }));

  const allCombatBattalions = [
    ...args.combatResult.attackerBattalions,
    ...args.combatResult.defenderBattalions,
  ];

  for (const cb of allCombatBattalions) {
    const idx = updated.findIndex((b) => b.id === cb.battalion.id);
    if (idx < 0) continue;

    // Apply casualties.
    const casualties = cb.committed - cb.alive;
    updated[idx].size = Math.max(0, updated[idx].size - casualties);

    // Apply fatigue.
    const fatigueMs = args.isBattlefield ? FATIGUE_BATTLE_MS : FATIGUE_SKIRMISH_MS;
    updated[idx].readyAt = args.now + fatigueMs;

    // Apply XP.
    const xpEntry = args.combatResult.xpAwarded.find(
      (x) => x.battalionId === cb.battalion.id,
    );
    if (xpEntry) {
      updated[idx].xp += xpEntry.xpGained;
    }

    // Reset stance for wiped battalions.
    if (updated[idx].size <= 0) {
      updated[idx].stance = BattalionStance.REST;
      updated[idx].garrisonedAt = null;
    }
  }

  // Morale changes.
  const attackerWon = args.combatResult.winner === "ATTACKER";
  const defenderWon = args.combatResult.winner === "DEFENDER";

  const moraleDeltaAttacker = attackerWon
    ? MORALE_EVENTS.WIN_ATTACK
    : defenderWon
      ? MORALE_EVENTS.LOSE_ATTACK
      : 0;

  const moraleDeltaDefender = defenderWon
    ? MORALE_EVENTS.WIN_ATTACK
    : attackerWon
      ? MORALE_EVENTS.LOSE_ATTACK
      : 0;

  return {
    battalions: updated,
    moraleDeltaAttacker,
    moraleDeltaDefender,
  };
}

// ── Retreat ──────────────────────────────────────────────────────────────────

/**
 * Order a retreat. Attacking battalions withdraw, taking extra casualties
 * during the withdrawal. Returns updated battalions.
 */
export function orderRetreat(args: {
  attackerBattalions: CombatBattalion[];
  battalions: Battalion[];
  now: number;
}): Battalion[] {
  const retreatCasualtyRate = 0.15; // 15% extra casualties during retreat
  const updated = args.battalions.map((b) => ({ ...b }));

  for (const cb of args.attackerBattalions) {
    const idx = updated.findIndex((b) => b.id === cb.battalion.id);
    if (idx < 0) continue;

    const retreatLosses = Math.ceil(cb.alive * retreatCasualtyRate);
    updated[idx].size = Math.max(0, updated[idx].size - (cb.committed - cb.alive + retreatLosses));
    updated[idx].readyAt = args.now + FATIGUE_SKIRMISH_MS;
    updated[idx].stance = BattalionStance.REST;
  }

  return updated;
}

// ── Combat Summary ───────────────────────────────────────────────────────────

/**
 * Generate a human-readable combat summary.
 */
export function combatSummary(result: CombatResult): string {
  const winnerName = result.winner === "ATTACKER" ? "Attackers" : "Defenders";
  return [
    `${winnerName} won after ${result.rounds} rounds.`,
    `Attackers lost ${result.attackerTotalCasualties} units.`,
    `Defenders lost ${result.defenderTotalCasualties} units.`,
    result.wipedBattalionIds.length > 0
      ? `${result.wipedBattalionIds.length} battalion(s) wiped.`
      : "No battalions wiped.",
    `${result.xpAwarded.length} battalion(s) gained XP.`,
    result.endReason,
  ].join(" ");
}
