import { RaceAbilityKind } from "@/lib/prisma-client";
import { addHours } from "./time";

const HELSINKI_TIME_ZONE = "Europe/Helsinki";
const DWARF_GRUDGE_BONUS = 0.25;

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
}: {
  activeStartedAt: Date | null;
  now: Date;
  isActiveSeason: boolean;
}) {
  if (!isActiveSeason || !activeStartedAt || now < activeStartedAt) {
    return 0;
  }

  return now >= getNextHelsinkiNoonAfter(activeStartedAt) ? 3 : 2;
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
