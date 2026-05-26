import { FortressDoctrine } from "@/lib/prisma-client";
import type { HexBiome } from "./map-hex";
import {
  RACE_TIER_BIOMES,
  RACE_TIER_TILE_THRESHOLDS,
  getRaceTierTileCount,
} from "./race-buffs";
import type { FortressRace } from "./races";
import { addHours } from "./time";

export const DOCTRINE_CHANGE_COOLDOWN_HOURS = 12;

export type DoctrineDefinition = {
  doctrine: FortressDoctrine;
  race: FortressRace;
  label: string;
  description: string;
};

export const DOCTRINE_DEFINITIONS = [
  {
    doctrine: FortressDoctrine.DWARF_HOLDFAST,
    race: "DWARFS",
    label: "Holdfast",
    description: "Improves guard and garrison defensive power.",
  },
  {
    doctrine: FortressDoctrine.DWARF_WATCHKEEPERS,
    race: "DWARFS",
    label: "Watchkeepers",
    description: "Improves guard detection against convoy raids.",
  },
  {
    doctrine: FortressDoctrine.ORK_MARAUDERS,
    race: "ORKS",
    label: "Marauders",
    description: "Improves raid power and stolen convoy cargo.",
  },
  {
    doctrine: FortressDoctrine.ORK_SIEGEBREAKERS,
    race: "ORKS",
    label: "Siegebreakers",
    description: "Improves campaign army contribution within its global cap.",
  },
  {
    doctrine: FortressDoctrine.MURINE_CONVOY_COMMAND,
    race: "SPACE_MURINES",
    label: "Convoy Command",
    description: "Improves escort combat power.",
  },
  {
    doctrine: FortressDoctrine.MURINE_RAPID_RESPONSE,
    race: "SPACE_MURINES",
    label: "Rapid Response",
    description: "Improves guards and campaign army contribution.",
  },
  {
    doctrine: FortressDoctrine.UNICORN_GLITTER_FRONTIER,
    race: "UNSTABLE_UNICORNS",
    label: "Glitter Frontier",
    description: "Improves neutral pressure on favored terrain.",
  },
  {
    doctrine: FortressDoctrine.UNICORN_VEILED_NETWORK,
    race: "UNSTABLE_UNICORNS",
    label: "Veiled Network",
    description: "Reduces detection odds for convoy raids.",
  },
] as const satisfies readonly DoctrineDefinition[];

export function getDoctrineDefinition(doctrine: FortressDoctrine | null | undefined) {
  return (
    DOCTRINE_DEFINITIONS.find((definition) => definition.doctrine === doctrine) ??
    null
  );
}

export function getDoctrineOptionsForRace(race: FortressRace | null | undefined) {
  return race
    ? DOCTRINE_DEFINITIONS.filter((definition) => definition.race === race)
    : [];
}

export function isDoctrineForRace(
  doctrine: FortressDoctrine,
  race: FortressRace | null | undefined
) {
  return getDoctrineDefinition(doctrine)?.race === race;
}

export function getDoctrineEffectPercent(tier: number) {
  return Math.max(0, Math.min(3, Math.floor(tier))) * 10;
}

export function getDoctrineTier({
  race,
  ownedTileBiomes,
}: {
  race: FortressRace | null | undefined;
  ownedTileBiomes: readonly HexBiome[];
}) {
  const count = getRaceTierTileCount({ race, ownedTileBiomes });

  if (count >= RACE_TIER_TILE_THRESHOLDS.tier3) {
    return 3;
  }
  if (count >= RACE_TIER_TILE_THRESHOLDS.tier2) {
    return 2;
  }
  if (count >= RACE_TIER_TILE_THRESHOLDS.tier1) {
    return 1;
  }
  return 0;
}

function getDoctrineMultiplier({
  doctrine,
  tier,
  eligible,
}: {
  doctrine: FortressDoctrine | null | undefined;
  tier: number;
  eligible: readonly FortressDoctrine[];
}) {
  return doctrine && eligible.includes(doctrine)
    ? 1 + getDoctrineEffectPercent(tier) / 100
    : 1;
}

export function getGuardDefenseDoctrineMultiplier(
  doctrine: FortressDoctrine | null | undefined,
  tier: number
) {
  return getDoctrineMultiplier({
    doctrine,
    tier,
    eligible: [
      FortressDoctrine.DWARF_HOLDFAST,
      FortressDoctrine.MURINE_RAPID_RESPONSE,
    ],
  });
}

export function getGuardDetectionDoctrineMultiplier(
  doctrine: FortressDoctrine | null | undefined,
  tier: number
) {
  return getDoctrineMultiplier({
    doctrine,
    tier,
    eligible: [FortressDoctrine.DWARF_WATCHKEEPERS],
  });
}

export function getEscortDoctrineMultiplier(
  doctrine: FortressDoctrine | null | undefined,
  tier: number
) {
  return getDoctrineMultiplier({
    doctrine,
    tier,
    eligible: [FortressDoctrine.MURINE_CONVOY_COMMAND],
  });
}

export function getRaidPowerDoctrineMultiplier(
  doctrine: FortressDoctrine | null | undefined,
  tier: number
) {
  return getDoctrineMultiplier({
    doctrine,
    tier,
    eligible: [FortressDoctrine.ORK_MARAUDERS],
  });
}

export function getRaidEvasionDoctrineMultiplier(
  doctrine: FortressDoctrine | null | undefined,
  tier: number
) {
  return getDoctrineMultiplier({
    doctrine,
    tier,
    eligible: [FortressDoctrine.UNICORN_VEILED_NETWORK],
  });
}

export function getCampaignArmyDoctrineMultiplier(
  doctrine: FortressDoctrine | null | undefined,
  tier: number
) {
  return getDoctrineMultiplier({
    doctrine,
    tier,
    eligible: [
      FortressDoctrine.ORK_SIEGEBREAKERS,
      FortressDoctrine.MURINE_RAPID_RESPONSE,
    ],
  });
}

export function getStolenCargoDoctrineMultiplier(
  doctrine: FortressDoctrine | null | undefined,
  tier: number
) {
  return getRaidPowerDoctrineMultiplier(doctrine, tier);
}

export function getNeutralPressureDoctrineMultiplier({
  doctrine,
  tier,
  targetBiome,
}: {
  doctrine: FortressDoctrine | null | undefined;
  tier: number;
  targetBiome: HexBiome | null | undefined;
}) {
  return doctrine === FortressDoctrine.UNICORN_GLITTER_FRONTIER &&
    targetBiome !== null &&
    targetBiome !== undefined &&
    RACE_TIER_BIOMES.UNSTABLE_UNICORNS.includes(targetBiome)
    ? 1 + getDoctrineEffectPercent(tier) / 100
    : 1;
}

export function getDoctrineChangeAvailableAt(changedAt: Date | null | undefined) {
  return changedAt ? addHours(changedAt, DOCTRINE_CHANGE_COOLDOWN_HOURS) : null;
}

export function getDoctrineChangeBlockedReason({
  doctrine,
  race,
  changedAt,
  now,
}: {
  doctrine: FortressDoctrine;
  race: FortressRace | null | undefined;
  changedAt: Date | null | undefined;
  now: Date;
}) {
  if (!race || !isDoctrineForRace(doctrine, race)) {
    return "Choose a doctrine available to your race.";
  }

  const availableAt = getDoctrineChangeAvailableAt(changedAt);

  if (availableAt && availableAt > now) {
    return "Doctrine changes have a 12-hour cooldown.";
  }

  return null;
}
