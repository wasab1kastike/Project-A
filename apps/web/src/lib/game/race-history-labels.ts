function formatTime(value: Date) {
  return value.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatSignedValue(value: number) {
  return `${value >= 0 ? "+" : ""}${value}`;
}

export function formatDeepMiningImpact({
  outcome,
  committedGold,
  goldDelta,
  armyDelta,
  recruitmentQueueDelta,
  activeUntil,
  resolvedAt,
}: {
  outcome: string;
  committedGold: number;
  goldDelta: number;
  armyDelta: number;
  recruitmentQueueDelta: number;
  activeUntil: Date | null;
  resolvedAt: Date | null;
}) {
  if (outcome === "ORE_SURGE") {
    if (!resolvedAt) {
      return "then +50% economy for 1 hour";
    }

    return activeUntil
      ? `+50% economy until ${formatTime(activeUntil)}`
      : "+50% economy for one hour";
  }

  if (outcome === "BATTLE_RUNES") {
    if (!resolvedAt) {
      return "then +25% combat for 1 hour";
    }

    return activeUntil
      ? `+25% combat until ${formatTime(activeUntil)}`
      : "+25% combat for one hour";
  }

  if (outcome === "SHAFT_COLLAPSE") {
    if (!resolvedAt) {
      return "then economy halted for 1 hour";
    }

    return activeUntil
      ? `economy halted until ${formatTime(activeUntil)}`
      : "economy halted for one hour";
  }

  const fallbackQueueDelta =
    outcome === "FACTION_SEAL" && recruitmentQueueDelta === 0
      ? Math.min(250, Math.max(25, Math.floor(committedGold / 2)))
      : recruitmentQueueDelta;

  return `${formatSignedValue(goldDelta)} gold, ${formatSignedValue(armyDelta)} army, ${formatSignedValue(fallbackQueueDelta)} queue`;
}

export function getDeepMiningStatus({
  latest,
  canActivate,
}: {
  latest: { resolvedAt: Date | null } | null;
  canActivate: boolean;
}) {
  if (latest && !latest.resolvedAt) {
    return "Pending";
  }

  return canActivate ? "Available" : "Cooling down";
}

export function formatUnicornShatteredRealityImpact({
  outcome,
  armyDelta,
  garrisonArmyDelta,
  activeUntil,
}: {
  outcome: string;
  armyDelta: number;
  garrisonArmyDelta: number;
  activeUntil: Date | null;
}) {
  if (outcome === "MIRROR_HOST") {
    return `${formatSignedValue(armyDelta)} army, ${formatSignedValue(garrisonArmyDelta)} garrison army`;
  }

  if (outcome === "PRISMATIC_SURGE") {
    return activeUntil
      ? `+25% combat until ${formatTime(activeUntil)}`
      : "+25% combat for 1 hour";
  }

  if (outcome === "LUCKY_GALLOP") {
    return activeUntil
      ? `+50% economy until ${formatTime(activeUntil)}`
      : "+50% economy for 1 hour";
  }

  return "reality stabilized";
}
