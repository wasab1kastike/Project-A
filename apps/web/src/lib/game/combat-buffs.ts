import {
  FortressKind,
  CycleRuleset,
  OrkBossOrderKind,
  OrkWaaaghInvestmentKind,
  RaceAbilityKind,
} from "@/lib/prisma-client";
import { HOME_OF_A_BOSS_BUFF_MULTIPLIER } from "./constants";
import { DWARF_DEEP_MINING_COMBAT_MULTIPLIER } from "./dwarf-deep-mining";
import {
  type LeaderboardTitleHolders,
  getLeaderboardTitleAttackMultiplier,
} from "./leaderboard-titles";
import {
  getOrkBossOrderAttackMultiplier,
  getOrkBossOrderDefenseMultiplier,
  getOrkWaaaghAttackInvestmentMultiplier,
} from "./orks";
import { getDwarfGrudgeMultiplier, isRaceAbilityActive } from "./race-buffs";
import type { FortressRace } from "./races";
import { UNICORN_SHATTERED_REALITY_COMBAT_MULTIPLIER } from "./unicorn-shattered-reality";

export type CombatBuffFortress = {
  id: string;
  race?: FortressRace | null;
  isNpc?: boolean;
  fortressKind?: FortressKind | null;
  raceAbilityActivations?: Array<{
    kind: RaceAbilityKind;
    activeFrom: Date;
    activeUntil: Date;
  }>;
  orkBossOrders?: Array<{
    kind: OrkBossOrderKind;
    activeFrom: Date;
    activeUntil: Date;
  }>;
  orkWaaaghInvestments?: Array<{
    kind: OrkWaaaghInvestmentKind;
  }>;
  dwarfGrudges?: Array<{
    targetFortressId: string;
    bonusMultiplier: number;
  }>;
};

export function isPlayerCombatTarget(
  target:
    | {
        isNpc?: boolean;
        fortressKind?: FortressKind | null;
      }
    | null
    | undefined
) {
  return Boolean(
    target && !target.isNpc && target.fortressKind === FortressKind.PLAYER
  );
}

export function hasCombatStim(fortress: CombatBuffFortress, now: Date) {
  return (
    fortress.race === "SPACE_MURINES" &&
    isRaceAbilityActive(
      fortress.raceAbilityActivations ?? [],
      RaceAbilityKind.SPACE_MURINE_STIM,
      now
    )
  );
}

export function getCombatAttackPowerMultiplier({
  fortress,
  now,
  targetFortressId,
  targetIsPlayerFortress = false,
  leaderboardTitleHolders,
  leaderboardRuleset = CycleRuleset.LEGACY,
  combatSurgedThisTick,
  enableWaaagh = true,
  enableDwarfGrudge = true,
  enableLegacyAbilities = true,
}: {
  fortress: CombatBuffFortress;
  now: Date;
  targetFortressId?: string | null;
  targetIsPlayerFortress?: boolean;
  leaderboardTitleHolders?: LeaderboardTitleHolders;
  leaderboardRuleset?: CycleRuleset;
  combatSurgedThisTick?: Set<string>;
  enableWaaagh?: boolean;
  enableDwarfGrudge?: boolean;
  enableLegacyAbilities?: boolean;
}) {
  const race = fortress.race;
  const raceAbilityActivations = fortress.raceAbilityActivations ?? [];
  const waaaghActive =
    enableLegacyAbilities &&
    enableWaaagh &&
    race === "ORKS" &&
    isRaceAbilityActive(
      raceAbilityActivations,
      RaceAbilityKind.ORK_WAAAGH,
      now
    );
  const dwarfCombatSurge =
    enableLegacyAbilities &&
    race === "DWARFS" &&
    (combatSurgedThisTick?.has(fortress.id) ||
      isRaceAbilityActive(
        raceAbilityActivations,
        RaceAbilityKind.DWARF_COMBAT_SURGE,
        now
      ));
  const grudgeMultiplier =
    enableLegacyAbilities &&
    enableDwarfGrudge &&
    race === "DWARFS" &&
    targetFortressId &&
    targetIsPlayerFortress
      ? getDwarfGrudgeMultiplier(fortress.dwarfGrudges ?? [], targetFortressId)
      : 1;
  const unicornCombatSurge =
    enableLegacyAbilities &&
    race === "UNSTABLE_UNICORNS" &&
    isRaceAbilityActive(
      raceAbilityActivations,
      RaceAbilityKind.UNICORN_COMBAT_SURGE,
      now
    );

  return (
    (waaaghActive ? 4 : 1) *
    (enableLegacyAbilities && race === "ORKS"
      ? getOrkWaaaghAttackInvestmentMultiplier({
          waaaghActive,
          investments: fortress.orkWaaaghInvestments ?? [],
        })
      : 1) *
    (enableLegacyAbilities && race === "ORKS"
      ? getOrkBossOrderAttackMultiplier(fortress.orkBossOrders ?? [], now)
      : 1) *
    grudgeMultiplier *
    (dwarfCombatSurge ? DWARF_DEEP_MINING_COMBAT_MULTIPLIER : 1) *
    (unicornCombatSurge ? UNICORN_SHATTERED_REALITY_COMBAT_MULTIPLIER : 1) *
    (enableLegacyAbilities && isRaceAbilityActive(
      raceAbilityActivations,
      RaceAbilityKind.HOME_OF_A_BOSS_BUFF,
      now
    )
      ? HOME_OF_A_BOSS_BUFF_MULTIPLIER
      : 1) *
    (leaderboardTitleHolders
      ? getLeaderboardTitleAttackMultiplier(
          leaderboardTitleHolders,
          fortress.id,
          leaderboardRuleset
        )
      : 1)
  );
}

export function getCombatDefensePowerMultiplier({
  fortress,
  now,
  opponentFortressId,
  opponentIsPlayerFortress = true,
  combatSurgedThisTick,
  enableWaaagh = true,
  enableDwarfGrudge = true,
  enableLegacyAbilities = true,
}: {
  fortress: CombatBuffFortress;
  now: Date;
  opponentFortressId?: string | null;
  opponentIsPlayerFortress?: boolean;
  combatSurgedThisTick?: Set<string>;
  enableWaaagh?: boolean;
  enableDwarfGrudge?: boolean;
  enableLegacyAbilities?: boolean;
}) {
  const race = fortress.race;
  const raceAbilityActivations = fortress.raceAbilityActivations ?? [];
  const waaaghActive =
    enableLegacyAbilities &&
    enableWaaagh &&
    race === "ORKS" &&
    isRaceAbilityActive(
      raceAbilityActivations,
      RaceAbilityKind.ORK_WAAAGH,
      now
    );
  const dwarfCombatSurge =
    enableLegacyAbilities &&
    race === "DWARFS" &&
    (combatSurgedThisTick?.has(fortress.id) ||
      isRaceAbilityActive(
        raceAbilityActivations,
        RaceAbilityKind.DWARF_COMBAT_SURGE,
        now
      ));
  const grudgeMultiplier =
    enableLegacyAbilities &&
    enableDwarfGrudge &&
    race === "DWARFS" &&
    opponentFortressId &&
    opponentIsPlayerFortress
      ? getDwarfGrudgeMultiplier(fortress.dwarfGrudges ?? [], opponentFortressId)
      : 1;
  const unicornCombatSurge =
    enableLegacyAbilities &&
    race === "UNSTABLE_UNICORNS" &&
    isRaceAbilityActive(
      raceAbilityActivations,
      RaceAbilityKind.UNICORN_COMBAT_SURGE,
      now
    );

  return (
    (waaaghActive ? 4 : 1) *
    (enableLegacyAbilities && race === "ORKS"
      ? getOrkBossOrderDefenseMultiplier(fortress.orkBossOrders ?? [], now)
      : 1) *
    grudgeMultiplier *
    (dwarfCombatSurge ? DWARF_DEEP_MINING_COMBAT_MULTIPLIER : 1) *
    (unicornCombatSurge ? UNICORN_SHATTERED_REALITY_COMBAT_MULTIPLIER : 1) *
    (enableLegacyAbilities && isRaceAbilityActive(
      raceAbilityActivations,
      RaceAbilityKind.HOME_OF_A_BOSS_BUFF,
      now
    )
      ? HOME_OF_A_BOSS_BUFF_MULTIPLIER
      : 1)
  );
}
