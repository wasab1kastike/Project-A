// Returns the next Friday at 12:00 (Europe/Helsinki) after the given date.
export function getNextHelsinkiFridayAt12(value: Date) {
  return getNextHelsinkiWeekdayAtHour(value, 5, 12);
}

// Returns the next Tuesday at 12:00 (Europe/Helsinki) after the given date.
export function getNextHelsinkiTuesdayAt12(value: Date) {
  return getNextHelsinkiWeekdayAtHour(value, 2, 12);
}
const HELSINKI_TIME_ZONE = "Europe/Helsinki";

function getTimeZoneParts(value: Date, timeZone = HELSINKI_TIME_ZONE) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
    hour12: false,
  }).formatToParts(value);
  const getPart = (type: string) =>
    Number(parts.find((part) => part.type === type)?.value ?? 0);

  return {
    year: getPart("year"),
    month: getPart("month"),
    day: getPart("day"),
    hour: getPart("hour"),
    minute: getPart("minute"),
    second: getPart("second"),
  };
}

function getTimeZoneWeekday(value: Date, timeZone = HELSINKI_TIME_ZONE) {
  const weekday = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
  }).format(value);

  return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(weekday);
}

function getTimeZoneOffsetMilliseconds(
  value: Date,
  timeZone = HELSINKI_TIME_ZONE
) {
  const parts = getTimeZoneParts(value, timeZone);
  const localAsUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second
  );

  return localAsUtc - value.getTime();
}

function zonedTimeToUtc({
  year,
  month,
  day,
  hour,
  minute = 0,
  second = 0,
  timeZone = HELSINKI_TIME_ZONE,
}: {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute?: number;
  second?: number;
  timeZone?: string;
}) {
  const localAsUtc = Date.UTC(year, month - 1, day, hour, minute, second, 0);
  let utc = localAsUtc;

  for (let index = 0; index < 3; index += 1) {
    utc = localAsUtc - getTimeZoneOffsetMilliseconds(new Date(utc), timeZone);
  }

  return new Date(utc);
}

export function getNextHelsinkiWeekdayAtHour(
  value: Date,
  weekday: number,
  hour: number
) {
  const parts = getTimeZoneParts(value);
  const currentWeekday = getTimeZoneWeekday(value);
  const daysUntilTarget = (weekday - currentWeekday + 7) % 7;
  let target = zonedTimeToUtc({
    year: parts.year,
    month: parts.month,
    day: parts.day + daysUntilTarget,
    hour,
  });

  if (target < value) {
    target = zonedTimeToUtc({
      year: parts.year,
      month: parts.month,
      day: parts.day + daysUntilTarget + 7,
      hour,
    });
  }

  return target;
}
