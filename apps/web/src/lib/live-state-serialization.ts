const ISO_DATE_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;

export function reviveGameStateDates<T>(value: T): T {
  if (typeof value === "string" && ISO_DATE_PATTERN.test(value)) {
    return new Date(value) as T;
  }

  if (Array.isArray(value)) {
    return value.map((item) => reviveGameStateDates(item)) as T;
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        reviveGameStateDates(item),
      ])
    ) as T;
  }

  return value;
}
