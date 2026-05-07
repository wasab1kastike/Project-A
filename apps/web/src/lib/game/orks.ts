import {
  FortressKind,
  LootCampVariant,
  OrkBossOrderKind,
  OrkScrapEventReason,
  OrkWaaaghInvestmentKind,
  Prisma,
  PrismaClient,
  RaceAbilityKind,
} from "@/lib/prisma-client";
import { addMinutes } from "./time";

type DatabaseClient = PrismaClient | Prisma.TransactionClient;

export const ORK_STRONGER_TOGETHER_BASE_RATE = 0.15;
export const ORK_STRONGER_TOGETHER_GREEN_TIDE_RATE = 0.25;

export const ORK_DIRECT_RAID_SCRAP_CAP = 40;
export const ORK_TILE_BATTLE_SCRAP = 15;
export const ORK_HOME_OF_A_BATTLE_SCRAP = 30;

export const ORK_BOSS_ORDER_CONFIG = {
  [OrkBossOrderKind.MORE_DAKKA]: {
    label: "More Dakka",
    scrapCost: 40,
    goldCost: 75,
    durationMinutes: 30,
    description: "+25% outgoing attack power and 1.25x movement speed.",
  },
  [OrkBossOrderKind.LOOT_WAGONS]: {
    label: "Loot Wagons",
    scrapCost: 35,
    goldCost: 50,
    durationMinutes: 60,
    description: "+50% raid carry capacity.",
  },
  [OrkBossOrderKind.PATCH_DA_FORT]: {
    label: "Patch Da Fort",
    scrapCost: 25,
    goldCost: 50,
    durationMinutes: 60,
    description: "+20% defending power.",
  },
} as const;

export const ORK_WAAAGH_INVESTMENT_CONFIG = {
  [OrkWaaaghInvestmentKind.KEEP_IT_LOUD]: {
    label: "Keep It Loud",
    scrapCost: 60,
    extensionMinutes: 15,
    description: "Extend the active WAAAGH by 15 minutes.",
  },
  [OrkWaaaghInvestmentKind.BIGGER_SHOUTIN]: {
    label: "Bigger Shoutin",
    scrapCost: 50,
    extensionMinutes: 0,
    description: "+20% attack power during this WAAAGH.",
  },
  [OrkWaaaghInvestmentKind.DA_GREEN_TIDE]: {
    label: "Da Green Tide",
    scrapCost: 50,
    extensionMinutes: 0,
    description: "Stronger Together converts 25% instead of 15% during this WAAAGH.",
  },
} as const;

export function getOrkDirectRaidScrap({
  defenderLosses,
  goldLooted,
  foodLooted,
}: {
  defenderLosses: number;
  goldLooted: number;
  foodLooted: number;
}) {
  return Math.min(
    ORK_DIRECT_RAID_SCRAP_CAP,
    1 +
      Math.floor(Math.max(0, defenderLosses) / 5) +
      Math.floor((Math.max(0, goldLooted) + Math.max(0, foodLooted)) / 100)
  );
}

export function getOrkTileBattleScrap(isHomeOfA: boolean) {
  return isHomeOfA ? ORK_HOME_OF_A_BATTLE_SCRAP : ORK_TILE_BATTLE_SCRAP;
}

export function getOrkLootCampScrap(variant: LootCampVariant | null) {
  if (variant === LootCampVariant.CHAOS) {
    return 20;
  }

  if (variant === LootCampVariant.RICH) {
    return 15;
  }

  return 10;
}

export function isRealOrkPlayerFortress(fortress: {
  race: string | null;
  isNpc: boolean;
  fortressKind?: FortressKind | string | null;
}) {
  return (
    fortress.race === "ORKS" &&
    !fortress.isNpc &&
    (fortress.fortressKind === undefined ||
      fortress.fortressKind === FortressKind.PLAYER)
  );
}

export function isOrkBossOrderActive(
  order: { activeFrom: Date; activeUntil: Date },
  now: Date
) {
  return order.activeFrom <= now && order.activeUntil > now;
}

export function hasActiveOrkBossOrder(
  orders: Array<{ kind: OrkBossOrderKind; activeFrom: Date; activeUntil: Date }>,
  kind: OrkBossOrderKind,
  now: Date
) {
  return orders.some(
    (order) => order.kind === kind && isOrkBossOrderActive(order, now)
  );
}

export function hasWaaaghInvestment(
  investments: Array<{ kind: OrkWaaaghInvestmentKind }>,
  kind: OrkWaaaghInvestmentKind
) {
  return investments.some((investment) => investment.kind === kind);
}

export function getOrkBossOrderAttackMultiplier(
  orders: Array<{ kind: OrkBossOrderKind; activeFrom: Date; activeUntil: Date }>,
  now: Date
) {
  return hasActiveOrkBossOrder(orders, OrkBossOrderKind.MORE_DAKKA, now)
    ? 1.25
    : 1;
}

export function getOrkBossOrderDefenseMultiplier(
  orders: Array<{ kind: OrkBossOrderKind; activeFrom: Date; activeUntil: Date }>,
  now: Date
) {
  return hasActiveOrkBossOrder(orders, OrkBossOrderKind.PATCH_DA_FORT, now)
    ? 1.2
    : 1;
}

export function getOrkBossOrderSpeedMultiplier(
  orders: Array<{ kind: OrkBossOrderKind; activeFrom: Date; activeUntil: Date }>,
  now: Date
) {
  return hasActiveOrkBossOrder(orders, OrkBossOrderKind.MORE_DAKKA, now)
    ? 1.25
    : 1;
}

export function getOrkBossOrderCarryMultiplier(
  orders: Array<{ kind: OrkBossOrderKind; activeFrom: Date; activeUntil: Date }>,
  now: Date
) {
  return hasActiveOrkBossOrder(orders, OrkBossOrderKind.LOOT_WAGONS, now)
    ? 1.5
    : 1;
}

export function getOrkWaaaghAttackInvestmentMultiplier({
  waaaghActive,
  investments,
}: {
  waaaghActive: boolean;
  investments: Array<{ kind: OrkWaaaghInvestmentKind }>;
}) {
  return waaaghActive &&
    hasWaaaghInvestment(investments, OrkWaaaghInvestmentKind.BIGGER_SHOUTIN)
    ? 1.2
    : 1;
}

export function getOrkStrongerTogetherRate({
  waaaghActive,
  investments,
}: {
  waaaghActive: boolean;
  investments: Array<{ kind: OrkWaaaghInvestmentKind }>;
}) {
  return waaaghActive &&
    hasWaaaghInvestment(investments, OrkWaaaghInvestmentKind.DA_GREEN_TIDE)
    ? ORK_STRONGER_TOGETHER_GREEN_TIDE_RATE
    : ORK_STRONGER_TOGETHER_BASE_RATE;
}

export async function applyOrkScrapDelta({
  db,
  cycleId,
  fortressId,
  delta,
  reason,
  now,
  targetFortressId,
  tileId,
  battlefieldId,
  attackUnitId,
  bossOrderId,
  waaaghInvestmentId,
}: {
  db: DatabaseClient;
  cycleId: string;
  fortressId: string;
  delta: number;
  reason: OrkScrapEventReason;
  now: Date;
  targetFortressId?: string | null;
  tileId?: string | null;
  battlefieldId?: string | null;
  attackUnitId?: string | null;
  bossOrderId?: string | null;
  waaaghInvestmentId?: string | null;
}) {
  if (delta === 0) {
    return null;
  }

  const bank = await db.orkScrapBank.upsert({
    where: {
      cycleId_fortressId: {
        cycleId,
        fortressId,
      },
    },
    create: {
      cycleId,
      fortressId,
      scrap: delta,
    },
    update: {
      scrap: {
        increment: delta,
      },
    },
    select: {
      scrap: true,
    },
  });

  return db.orkScrapEvent.create({
    data: {
      cycleId,
      fortressId,
      reason,
      delta,
      balanceAfter: bank.scrap,
      targetFortressId,
      tileId,
      battlefieldId,
      attackUnitId,
      bossOrderId,
      waaaghInvestmentId,
      createdAt: now,
    },
  });
}

export function getBossOrderActiveUntil(kind: OrkBossOrderKind, now: Date) {
  return addMinutes(now, ORK_BOSS_ORDER_CONFIG[kind].durationMinutes);
}

export function getWaaaghInvestmentCost(kind: OrkWaaaghInvestmentKind) {
  return ORK_WAAAGH_INVESTMENT_CONFIG[kind].scrapCost;
}

export function isActiveWaaagh(activation: {
  kind: RaceAbilityKind;
  activeFrom: Date;
  activeUntil: Date;
}) {
  return activation.kind === RaceAbilityKind.ORK_WAAAGH;
}
