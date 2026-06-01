import type { FortressRace } from "./races";

const PRESSURE_WORKER_LABELS = {
  DWARFS: "Beer Culture",
  ORKS: "Scavenge Mob",
  SPACE_MURINES: "Imperial Faith",
  UNSTABLE_UNICORNS: "Glitter Distribution",
} as const satisfies Record<FortressRace, string>;

const PRESSURE_WORKER_DESCRIPTIONS = {
  DWARFS:
    "Beer halls, grudges, and stubborn customs push nearby borders outward.",
  ORKS: "Scavenge crews spread noise, scrap, and territorial momentum.",
  SPACE_MURINES:
    "Imperial rites and doctrine project control across the frontier.",
  UNSTABLE_UNICORNS: "Wild magic bends nearby claims toward the herd.",
} as const satisfies Record<FortressRace, string>;

export function getPressureWorkerLabel(
  race: FortressRace | null | undefined
) {
  return race ? PRESSURE_WORKER_LABELS[race] : "Pressure";
}

export function getPressureWorkerDescription(
  race: FortressRace | null | undefined
) {
  return race
    ? PRESSURE_WORKER_DESCRIPTIONS[race]
    : "Workers assigned to future border pressure and idle expansion.";
}
