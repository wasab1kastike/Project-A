import { RaceAbilityKind } from "@/lib/prisma-client";
import type { HexBiome } from "./map-hex";
import { type FortressRace } from "./races";
import { addHours } from "./time";

const HELSINKI_TIME_ZONE = "Europe/Helsinki";
const DWARF_GRUDGE_BONUS = 0.25;

export const RACE_TIER_TILE_THRESHOLDS = {
  tier1: 3,
  tier2: 6,
  tier3: 9,
} as const;

export const RACE_TIER_BIOMES: Record<FortressRace, readonly HexBiome[]> = {
  DWARFS: ["mountains"],
  ORKS: ["plains", "lake"],
  SPACE_MURINES: ["water", "coast"],
  UNSTABLE_UNICORNS: ["marsh", "forest"],
};

function getRaceTierTileCount({
  race,
  ownedTileBiomes,
}: {
  race: FortressRace;
  ownedTileBiomes: readonly HexBiome[];
}) {
  const requiredBiomes = new Set(RACE_TIER_BIOMES[race]);

  return ownedTileBiomes.filter((biome) => requiredBiomes.has(biome)).length;
}

function getHelsinkiParts(value: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: HELSINKI_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(value);
  const lookup = new Map(parts.map((part) => [part.type, part.value]));

  return {
    year: Number(lookup.get("year")),
    month: Number(lookup.get("month")),
    day: Number(lookup.get("day")),
    hour: Number(lookup.get("hour")),
    minute: Number(lookup.get("minute")),
    second: Number(lookup.get("second")),
  };
}

function getTimeZoneOffsetMs(value: Date) {
  const parts = getHelsinkiParts(value);
  const asUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second
  );

  return asUtc - value.getTime();
}

function helsinkiLocalToUtc({
  year,
  month,
  day,
  hour,
}: {
  year: number;
  month: number;
  day: number;
  hour: number;
}) {
  const firstGuess = new Date(Date.UTC(year, month - 1, day, hour));
  const offset = getTimeZoneOffsetMs(firstGuess);
  const secondGuess = new Date(firstGuess.getTime() - offset);
  const correctedOffset = getTimeZoneOffsetMs(secondGuess);

  return new Date(firstGuess.getTime() - correctedOffset);
}

export function getNextHelsinkiNoonAfter(value: Date) {
  const parts = getHelsinkiParts(value);
  let noon = helsinkiLocalToUtc({
    year: parts.year,
    month: parts.month,
    day: parts.day,
    hour: 12,
  });

  if (noon <= value) {
    noon = helsinkiLocalToUtc({
      year: parts.year,
      month: parts.month,
      day: parts.day + 1,
      hour: 12,
    });
  }

  return noon;
}

export function getRaceBuffTier({
  activeStartedAt,
  now,
  isActiveSeason,
  race,
  ownedTileBiomes = [],
}: {
  activeStartedAt: Date | null;
  now: Date;
  isActiveSeason: boolean;
  race?: FortressRace | null;
  ownedTileBiomes?: readonly HexBiome[];
}) {
  if (!isActiveSeason || !activeStartedAt || now < activeStartedAt) {
    return 0;
  }

  if (!race) {
    return 0;
  }

  const matchedTileCount = getRaceTierTileCount({
    race,
    ownedTileBiomes,
  });

  if (matchedTileCount >= RACE_TIER_TILE_THRESHOLDS.tier3) {
    return 3;
  }

  if (matchedTileCount >= RACE_TIER_TILE_THRESHOLDS.tier2) {
    return 2;
  }

  if (matchedTileCount >= RACE_TIER_TILE_THRESHOLDS.tier1) {
    return 1;
  }

  return 0;
}

type UnicornAvailability = {
  canUse: boolean;
  disabledReason: string | null;
};

type UnicornAvailabilityBase = {
  race: FortressRace | null | undefined;
  activeStartedAt: Date | null;
  now: Date;
  isActiveSeason: boolean;
  ownedTileBiomes?: readonly HexBiome[];
};

function getUnicornActiveSeasonReason({
  activeStartedAt,
  now,
  isActiveSeason,
}: UnicornAvailabilityBase) {
  if (!isActiveSeason || !activeStartedAt || now < activeStartedAt) {
    return "Unicorn abilities are only available during the active season.";
  }

  return null;
}

export function getUnicornShatteredRealityAvailability({
  race,
  activeStartedAt,
  now,
  isActiveSeason,
  ownedTileBiomes,
  latestUseAt,
}: UnicornAvailabilityBase & {
  latestUseAt: Date | null;
}): UnicornAvailability {
  const seasonReason = getUnicornActiveSeasonReason({
    race,
    activeStartedAt,
    now,
    isActiveSeason,
  });

  if (seasonReason) {
    return {
      canUse: false,
      disabledReason: seasonReason,
    };
  }

  if (race !== "UNSTABLE_UNICORNS") {
    return {
      canUse: false,
      disabledReason: "Only Unstable Unicorns can activate Shattered Reality.",
    };
  }

  if (
    getRaceBuffTier({
      activeStartedAt,
      now,
      isActiveSeason,
      race,
      ownedTileBiomes,
    }) < 2
  ) {
    return {
      canUse: false,
      disabledReason: "Shattered Reality unlocks at Tier 2 race buffs.",
    };
  }

  if (
    latestUseAt &&
    getHelsinkiDayKey(latestUseAt) === getHelsinkiDayKey(now)
  ) {
    return {
      canUse: false,
      disabledReason: "Shattered Reality has already been activated today.",
    };
  }

  return {
    canUse: true,
    disabledReason: null,
  };
}

export function getUnicornTeleportClaimAvailability({
  race,
  activeStartedAt,
  now,
  isActiveSeason,
  ownedTileBiomes,
  hasActiveTeleportToken,
  hasActiveTemporaryTeleport,
  latestClaimAt,
}: UnicornAvailabilityBase & {
  hasActiveTeleportToken: boolean;
  hasActiveTemporaryTeleport: boolean;
  latestClaimAt: Date | null;
}): UnicornAvailability {
  const seasonReason = getUnicornActiveSeasonReason({
    race,
    activeStartedAt,
    now,
    isActiveSeason,
  });

  if (seasonReason) {
    return {
      canUse: false,
      disabledReason: seasonReason,
    };
  }

  if (race !== "UNSTABLE_UNICORNS") {
    return {
      canUse: false,
      disabledReason: "Only Unstable Unicorns can claim free teleport.",
    };
  }

  if (
    getRaceBuffTier({
      activeStartedAt,
      now,
      isActiveSeason,
      race,
      ownedTileBiomes,
    }) < 1
  ) {
    return {
      canUse: false,
      disabledReason: "Free hourly teleport has not unlocked yet.",
    };
  }

  if (hasActiveTeleportToken) {
    return {
      canUse: false,
      disabledReason: "You already have an unused free teleport token.",
    };
  }

  if (hasActiveTemporaryTeleport) {
    return {
      canUse: false,
      disabledReason:
        "Your previous Unicorn teleport has not returned home yet.",
    };
  }

  if (
    latestClaimAt &&
    getHelsinkiHourKey(latestClaimAt) === getHelsinkiHourKey(now)
  ) {
    return {
      canUse: false,
      disabledReason: "Free teleport has already been claimed this hour.",
    };
  }

  return {
    canUse: true,
    disabledReason: null,
  };
}

export function getHelsinkiDayKey(value: Date) {
  const parts = getHelsinkiParts(value);

  return `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(
    parts.day
  ).padStart(2, "0")}`;
}

export function getHelsinkiHourKey(value: Date) {
  const parts = getHelsinkiParts(value);

  return `${getHelsinkiDayKey(value)}T${String(parts.hour).padStart(2, "0")}`;
}

export function isRaceAbilityActive(
  activations: Array<{
    kind: RaceAbilityKind;
    activeFrom: Date;
    activeUntil: Date;
  }>,
  kind: RaceAbilityKind,
  now: Date
) {
  return activations.some((activation) => {
    return (
      activation.kind === kind &&
      activation.activeFrom <= now &&
      activation.activeUntil > now
    );
  });
}

export function getDwarfGrudgeMultiplier(
  grudges: Array<{
    targetFortressId: string;
    bonusMultiplier: number;
  }>,
  targetFortressId: string
) {
  const grudge = grudges.find((candidate) => {
    return candidate.targetFortressId === targetFortressId;
  });

  return grudge ? 1 + DWARF_GRUDGE_BONUS * grudge.bonusMultiplier : 1;
}

export function getRaceAbilityActiveUntil(now: Date) {
  return addHours(now, 1);
}
