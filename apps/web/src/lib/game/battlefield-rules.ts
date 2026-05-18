const HOME_OF_A_BOSS_DAMAGE_PER_TICK_RATE = 0.03;
const BATTLEFIELD_START_CASUALTIES_PER_TICK = 100;
const BATTLEFIELD_MAX_CASUALTIES_PER_TICK = 1000;
const BATTLEFIELD_CASUALTY_RAMP_MINUTES = 60;

function hashBattleTick(value: string) {
  let hash = 2166136261;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}

export function getBattlefieldProgressDelta({
  battlefieldId,
  tickAt,
}: {
  battlefieldId: string;
  tickAt: Date;
}) {
  return 1 + (hashBattleTick(`${battlefieldId}:${tickAt.toISOString()}`) % 5);
}

export function getBattlefieldCasualtyBudget(battleAgeMinutes: number) {
  const clampedAgeMinutes = Math.max(
    0,
    Math.min(BATTLEFIELD_CASUALTY_RAMP_MINUTES, Math.floor(battleAgeMinutes))
  );
  const ramp =
    (clampedAgeMinutes / BATTLEFIELD_CASUALTY_RAMP_MINUTES) *
    (BATTLEFIELD_MAX_CASUALTIES_PER_TICK -
      BATTLEFIELD_START_CASUALTIES_PER_TICK);

  return BATTLEFIELD_START_CASUALTIES_PER_TICK + Math.floor(ramp);
}

export function getBattlefieldAttrition({
  battleAgeMinutes = 0,
  attackerArmy,
  defenderArmy,
  attackerPowerMultiplier = 1,
  defenderPowerMultiplier = 1,
}: {
  battleAgeMinutes?: number;
  attackerArmy: number;
  defenderArmy: number;
  attackerPowerMultiplier?: number;
  defenderPowerMultiplier?: number;
}) {
  if (attackerArmy <= 0 || defenderArmy <= 0) {
    return {
      attackerLosses: 0,
      defenderLosses: 0,
    };
  }

  const effectiveAttackerArmy = Math.max(
    1,
    Math.floor(attackerArmy * Math.max(0, attackerPowerMultiplier))
  );
  const effectiveDefenderArmy = Math.max(
    1,
    Math.floor(defenderArmy * Math.max(0, defenderPowerMultiplier))
  );
  const casualtyBudget = Math.min(
    attackerArmy + defenderArmy,
    getBattlefieldCasualtyBudget(battleAgeMinutes)
  );
  const totalPressure = effectiveAttackerArmy + effectiveDefenderArmy;

  if (casualtyBudget <= 0 || totalPressure <= 0) {
    return {
      attackerLosses: 0,
      defenderLosses: 0,
    };
  }

  const attackerLossShare = effectiveDefenderArmy / totalPressure;
  const attackerLosses = Math.min(
    attackerArmy,
    Math.floor(casualtyBudget * attackerLossShare)
  );
  const defenderLosses = Math.min(
    defenderArmy,
    casualtyBudget - Math.floor(casualtyBudget * attackerLossShare)
  );

  return {
    attackerLosses,
    defenderLosses,
  };
}

export function getHomeOfABossBattleDamage({
  attackerArmy,
  attackPowerMultiplier = 1,
  bossHealth,
}: {
  attackerArmy: number;
  attackPowerMultiplier?: number;
  bossHealth: number;
}) {
  const effectiveAttackArmy = Math.max(
    0,
    Math.floor(attackerArmy * Math.max(0, attackPowerMultiplier))
  );

  if (effectiveAttackArmy <= 0 || bossHealth <= 0) {
    return 0;
  }

  return Math.min(
    bossHealth,
    Math.max(
      1,
      Math.floor(effectiveAttackArmy * HOME_OF_A_BOSS_DAMAGE_PER_TICK_RATE)
    )
  );
}
