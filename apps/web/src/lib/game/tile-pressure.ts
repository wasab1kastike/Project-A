import type { FortressRace } from "./races";

export const TILE_PRESSURE_CLAIM_THRESHOLD = 100;

const PRESSURE_WORKER_LABELS = {
  DWARFS: "Beer Culture",
  ORKS: "Scavenge Mob",
  SPACE_MURINES: "Imperial Faith",
  UNSTABLE_UNICORNS: "Magic Pressure",
} as const satisfies Record<FortressRace, string>;

const PRESSURE_WORKER_DESCRIPTIONS = {
  DWARFS:
    "Beer halls, grudges, and stubborn customs push nearby borders outward.",
  ORKS: "Scavenge crews spread noise, scrap, and territorial momentum.",
  SPACE_MURINES:
    "Imperial rites and doctrine project control across the frontier.",
  UNSTABLE_UNICORNS: "Wild magic bends nearby claims toward the herd.",
} as const satisfies Record<FortressRace, string>;

export function getPressureWorkerLabel(race: FortressRace | null | undefined) {
  return race ? PRESSURE_WORKER_LABELS[race] : "Pressure";
}

export function getPressureWorkerDescription(
  race: FortressRace | null | undefined
) {
  return race
    ? PRESSURE_WORKER_DESCRIPTIONS[race]
    : "Workers assigned to future border pressure and idle expansion.";
}

export function calculatePressureOutput({
  pressureWorkersAssigned,
}: {
  pressureWorkersAssigned: number;
  race?: FortressRace | null;
}) {
  if (!Number.isFinite(pressureWorkersAssigned)) {
    return 0;
  }

  return Math.max(0, Math.floor(pressureWorkersAssigned));
}

export function getPressureTargetBlockedReason({
  tile,
  tileId,
  ownerFortressId = null,
  fortress,
  ownedTileIds,
  isHomeOfA,
  isConnected,
}: {
  tile: { claimable: boolean } | null | undefined;
  tileId: string;
  ownerFortressId?: string | null;
  fortress: { id: string } | null | undefined;
  ownedTileIds: Iterable<string>;
  isHomeOfA: (tileId: string) => boolean;
  isConnected: (input: { tileId: string; ownedTileIds: Iterable<string> }) => boolean;
}) {
  if (!fortress) {
    return "Join the cycle to prioritize expansion.";
  }

  if (!tile || !tile.claimable) {
    return "That map tile cannot receive pressure.";
  }

  if (isHomeOfA(tileId)) {
    return "Home of A is a daily boss and cannot receive expansion pressure.";
  }

  if (ownerFortressId === fortress.id) {
    return "You already own that tile.";
  }

  if (ownerFortressId) {
    return "Enemy-owned tiles cannot receive expansion pressure yet.";
  }

  if (
    !isConnected({
      tileId,
      ownedTileIds,
    })
  ) {
    return "That tile is not connected to your castle or owned territory.";
  }

  return null;
}

export function canPressureTarget(input: Parameters<typeof getPressureTargetBlockedReason>[0]) {
  return getPressureTargetBlockedReason(input) === null;
}

export function allocatePressureAcrossTargets({
  pressure,
  targets,
}: {
  pressure: number;
  targets: Array<{ tileId: string; weight?: number }>;
}) {
  const output = Math.max(0, Math.floor(pressure));
  const weightedTargets = targets
    .map((target) => ({
      tileId: target.tileId,
      weight: Math.max(1, Math.floor(target.weight ?? 1)),
    }))
    .sort((a, b) => a.tileId.localeCompare(b.tileId));

  if (output <= 0 || weightedTargets.length === 0) {
    return [];
  }

  const totalWeight = weightedTargets.reduce(
    (total, target) => total + target.weight,
    0
  );
  const allocations = weightedTargets.map((target) => ({
    tileId: target.tileId,
    pressure: Math.floor((output * target.weight) / totalWeight),
  }));
  let allocated = allocations.reduce(
    (total, allocation) => total + allocation.pressure,
    0
  );

  for (const allocation of allocations) {
    if (allocated >= output) {
      break;
    }

    allocation.pressure += 1;
    allocated += 1;
  }

  return allocations.filter((allocation) => allocation.pressure > 0);
}

export function getNeutralPressureClaimWinner({
  states,
  threshold = TILE_PRESSURE_CLAIM_THRESHOLD,
}: {
  states: Array<{ fortressId: string; pressure: number }>;
  threshold?: number;
}) {
  const eligibleStates = states
    .filter((state) => state.pressure >= threshold)
    .sort((a, b) => b.pressure - a.pressure);

  if (eligibleStates.length === 0) {
    return null;
  }

  const leader = eligibleStates[0];
  const tied = eligibleStates.some(
    (state) =>
      state.fortressId !== leader.fortressId && state.pressure === leader.pressure
  );

  return tied ? null : leader.fortressId;
}
