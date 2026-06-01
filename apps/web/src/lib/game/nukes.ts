import { NukeComponentKind } from "@/lib/prisma-client";

export const NUKE_LAUNCH_GOLD_COST = 250_000;
export const NUKE_ARMY_DAMAGE_CAP = 100_000;
export const NUKE_BIDDING_TIMEZONE = "Europe/Helsinki";
export const NUKE_BIDDING_START_HOUR = 14;
export const NUKE_BIDDING_END_HOUR = 12;

export const NUKE_COMPONENT_KINDS = [
  NukeComponentKind.FUEL,
  NukeComponentKind.ROCKET,
  NukeComponentKind.WRATH_OF_A,
] as const;

export type NukeComponentCargo = Record<NukeComponentKind, number>;

export const EMPTY_NUKE_COMPONENT_CARGO: NukeComponentCargo = {
  [NukeComponentKind.FUEL]: 0,
  [NukeComponentKind.ROCKET]: 0,
  [NukeComponentKind.WRATH_OF_A]: 0,
};

export function normalizeNukeComponentCargo(
  input: Partial<NukeComponentCargo>
): NukeComponentCargo {
  const cargo = { ...EMPTY_NUKE_COMPONENT_CARGO, ...input };

  for (const [kind, amount] of Object.entries(cargo)) {
    if (!Number.isInteger(amount) || amount < 0) {
      throw new Error(`${getNukeComponentLabel(kind as NukeComponentKind)} must be a non-negative whole number.`);
    }
  }

  return cargo;
}

export function hasNukeComponentCargo(cargo: NukeComponentCargo) {
  return NUKE_COMPONENT_KINDS.some((kind) => cargo[kind] > 0);
}

export function calculateNukeComponentCargoValue(cargo: NukeComponentCargo) {
  return (
    cargo[NukeComponentKind.FUEL] * 50_000 +
    cargo[NukeComponentKind.ROCKET] * 50_000 +
    cargo[NukeComponentKind.WRATH_OF_A] * 50_000
  );
}

export function getNukeComponentLabel(kind: NukeComponentKind) {
  switch (kind) {
    case NukeComponentKind.FUEL:
      return "Fuel";
    case NukeComponentKind.ROCKET:
      return "Rocket";
    case NukeComponentKind.WRATH_OF_A:
      return "Wrath of A";
  }
}

export function getNukeBidResourceLabel(kind: NukeComponentKind) {
  switch (kind) {
    case NukeComponentKind.FUEL:
      return "gold";
    case NukeComponentKind.ROCKET:
      return "food";
    case NukeComponentKind.WRATH_OF_A:
      return "army";
  }
}

function getZonedParts(date: Date, timeZone = NUKE_BIDDING_TIMEZONE) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const values = new Map(parts.map((part) => [part.type, part.value]));

  return {
    year: Number(values.get("year")),
    month: Number(values.get("month")),
    day: Number(values.get("day")),
    hour: Number(values.get("hour")),
    minute: Number(values.get("minute")),
    second: Number(values.get("second")),
  };
}

function addLocalDays(
  local: ReturnType<typeof getZonedParts>,
  days: number
) {
  const utc = new Date(Date.UTC(local.year, local.month - 1, local.day + days));

  return {
    year: utc.getUTCFullYear(),
    month: utc.getUTCMonth() + 1,
    day: utc.getUTCDate(),
    hour: local.hour,
    minute: local.minute,
    second: local.second,
  };
}

function zonedLocalToUtc({
  year,
  month,
  day,
  hour,
  minute = 0,
  second = 0,
  timeZone = NUKE_BIDDING_TIMEZONE,
}: {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute?: number;
  second?: number;
  timeZone?: string;
}) {
  let guess = new Date(Date.UTC(year, month - 1, day, hour, minute, second));

  for (let i = 0; i < 4; i += 1) {
    const actual = getZonedParts(guess, timeZone);
    const actualUtcAsLocal = Date.UTC(
      actual.year,
      actual.month - 1,
      actual.day,
      actual.hour,
      actual.minute,
      actual.second
    );
    const targetUtcAsLocal = Date.UTC(year, month - 1, day, hour, minute, second);
    const diff = actualUtcAsLocal - targetUtcAsLocal;
    if (diff === 0) {
      return guess;
    }
    guess = new Date(guess.getTime() - diff);
  }

  return guess;
}

export function getNukeBiddingWindowForDate(now: Date) {
  const local = getZonedParts(now);
  const startsToday = {
    ...local,
    hour: NUKE_BIDDING_START_HOUR,
    minute: 0,
    second: 0,
  };
  const endsToday = {
    ...local,
    hour: NUKE_BIDDING_END_HOUR,
    minute: 0,
    second: 0,
  };
  const todayStartUtc = zonedLocalToUtc(startsToday);
  const todayEndUtc = zonedLocalToUtc(endsToday);

  if (now >= todayStartUtc) {
    return {
      startsAt: todayStartUtc,
      endsAt: zonedLocalToUtc({
        ...addLocalDays(startsToday, 1),
        hour: NUKE_BIDDING_END_HOUR,
        minute: 0,
        second: 0,
      }),
      isOpen: true,
    };
  }

  if (now < todayEndUtc) {
    const yesterdayStart = addLocalDays(startsToday, -1);
    return {
      startsAt: zonedLocalToUtc(yesterdayStart),
      endsAt: todayEndUtc,
      isOpen: true,
    };
  }

  return {
    startsAt: todayStartUtc,
    endsAt: zonedLocalToUtc({
      ...addLocalDays(startsToday, 1),
      hour: NUKE_BIDDING_END_HOUR,
      minute: 0,
      second: 0,
    }),
    isOpen: false,
  };
}

export function getNukeRoundState(now: Date, startsAt: Date, endsAt: Date) {
  if (now < startsAt) return "pending" as const;
  if (now >= endsAt) return "resolving" as const;
  return "open" as const;
}

export type NukeBidLike = {
  id: string;
  fortressId: string;
  amount: number;
  createdAt: Date;
};

export function chooseNukeComponentWinner(bids: NukeBidLike[]) {
  return [...bids].sort((left, right) => {
    if (left.amount !== right.amount) return right.amount - left.amount;
    const createdDelta = left.createdAt.getTime() - right.createdAt.getTime();
    if (createdDelta !== 0) return createdDelta;
    return left.id.localeCompare(right.id);
  })[0] ?? null;
}

export type ArmyPool = {
  id: string;
  kind:
    | "idle"
    | "garrison"
    | "armyOrder"
    | "attackUnit"
    | "battlefield"
    | "battalion"
    | "convoy";
  amount: number;
};

export function allocateNukeArmyLosses(pools: ArmyPool[]) {
  const eligible = pools.filter((pool) => pool.amount > 0);
  const totalArmy = eligible.reduce((sum, pool) => sum + pool.amount, 0);
  const targetLoss = Math.min(Math.floor(totalArmy / 2), NUKE_ARMY_DAMAGE_CAP);

  if (targetLoss <= 0 || totalArmy <= 0) {
    return { totalArmy, targetLoss: 0, losses: [] as Array<ArmyPool & { loss: number }> };
  }

  const rawLosses = eligible.map((pool) => {
    const raw = (pool.amount * targetLoss) / totalArmy;
    const floored = Math.min(pool.amount, Math.floor(raw));
    return {
      ...pool,
      loss: floored,
      remainder: raw - floored,
    };
  });
  let remaining = targetLoss - rawLosses.reduce((sum, pool) => sum + pool.loss, 0);

  rawLosses
    .sort((left, right) => {
      if (left.remainder !== right.remainder) return right.remainder - left.remainder;
      return left.id.localeCompare(right.id);
    })
    .forEach((pool) => {
      if (remaining <= 0 || pool.loss >= pool.amount) return;
      pool.loss += 1;
      remaining -= 1;
    });

  return {
    totalArmy,
    targetLoss,
    losses: rawLosses
      .filter((pool) => pool.loss > 0)
      .map(({ remainder, ...pool }) => pool),
  };
}
