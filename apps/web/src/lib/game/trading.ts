import { DiplomacyRelationStatus } from "@/lib/prisma-client";
import { getAttackTravelMinutes } from "./attacks";
import {
  calculateNukeComponentCargoValue,
  EMPTY_NUKE_COMPONENT_CARGO,
  hasNukeComponentCargo,
  normalizeNukeComponentCargo,
  type NukeComponentCargo,
} from "./nukes";
import { getAllianceTrustTerms, isAllianceTrustTier } from "./politics";
import { addHours, addMinutes } from "./time";

export const TRADE_OFFER_EXPIRY_HOURS = 24;
export const CONVOY_MINIMUM_TRAVEL_HOURS = 6;
export const TRADE_WAGON_RESOURCE_LIMITS = [
  100,
  500,
  1_000,
  2_000,
  3_500,
  5_000,
  7_500,
  10_000,
  15_000,
  20_000,
] as const;
export const TRADE_WAGON_RESOURCE_LIMIT = TRADE_WAGON_RESOURCE_LIMITS[0];
export const TRADE_BASE_DELIVERY_BONUS_PERCENT = 5;
export const DEFAULT_ACTIVE_TRADE_WAGON_LIMIT = 3;
export const MAX_ACTIVE_TRADE_WAGON_LIMIT = 50;
export const TRADE_WAGON_SLOT_BASE_COST = 5_000;
export const TRADE_WAGON_SLOT_COST_STEP = 2_500;

export type TradeCargo = {
  gold: number;
  food: number;
  army: number;
  points: number;
  nukeComponents?: NukeComponentCargo;
};

export const EMPTY_TRADE_CARGO: TradeCargo = {
  gold: 0,
  food: 0,
  army: 0,
  points: 0,
  nukeComponents: EMPTY_NUKE_COMPONENT_CARGO,
};

export function getTradeBlockedReason(status: DiplomacyRelationStatus) {
  switch (status) {
    case DiplomacyRelationStatus.NEUTRAL:
    case DiplomacyRelationStatus.ALLIED:
      return null;
    case DiplomacyRelationStatus.ALLIANCE_PENDING:
      return "Resolve the alliance proposal before trading.";
    case DiplomacyRelationStatus.PEACE_PENDING:
      return "Resolve the peace proposal before trading.";
    case DiplomacyRelationStatus.WAR_PENDING:
      return "War warning blocks new trade.";
    case DiplomacyRelationStatus.ENEMY:
    case DiplomacyRelationStatus.WAR:
      return "Hostile fortresses cannot trade.";
  }
}

export function canTradeWithRelation(status: DiplomacyRelationStatus) {
  return getTradeBlockedReason(status) === null;
}

export function normalizeTradeCargo(input: TradeCargo): TradeCargo {
  const { nukeComponents, ...resources } = input;
  const values = Object.entries(resources);

  for (const [resource, amount] of values) {
    if (!Number.isInteger(amount) || amount < 0) {
      throw new Error(
        `${resource.charAt(0).toUpperCase()}${resource.slice(1)} must be a non-negative whole number.`
      );
    }
  }

  const normalized = normalizeNukeComponentCargo(
    nukeComponents ?? EMPTY_NUKE_COMPONENT_CARGO
  );
  const base = {
    ...resources,
  };

  return nukeComponents ? { ...base, nukeComponents: normalized } : base;
}

export function getTradeNukeComponents(cargo: TradeCargo): NukeComponentCargo {
  return cargo.nukeComponents ?? EMPTY_NUKE_COMPONENT_CARGO;
}

export function hasTradeCargo(cargo: TradeCargo) {
  return (
    cargo.gold > 0 ||
    cargo.food > 0 ||
    cargo.army > 0 ||
    cargo.points > 0 ||
    hasNukeComponentCargo(getTradeNukeComponents(cargo))
  );
}

export function getTradeCargoResourceAmount(cargo: TradeCargo) {
  return cargo.gold + cargo.food;
}

export function getTradeWagonResourceLimit(
  tradeBuildingLevel: number,
  capacityBonusPercent = 0
) {
  const normalizedLevel = Number.isInteger(tradeBuildingLevel)
    ? Math.max(0, tradeBuildingLevel)
    : 0;

  const baseLimit =
    TRADE_WAGON_RESOURCE_LIMITS[
      Math.min(normalizedLevel, TRADE_WAGON_RESOURCE_LIMITS.length - 1)
    ] ?? TRADE_WAGON_RESOURCE_LIMIT;
  const multiplier = 1 + Math.max(0, capacityBonusPercent) / 100;

  return Math.floor(baseLimit * multiplier);
}

export function assertTradeCargoWithinWagonLimit(
  cargo: TradeCargo,
  tradeBuildingLevel = 0,
  capacityBonusPercent = 0
) {
  const resourceAmount = getTradeCargoResourceAmount(cargo);
  const resourceLimit = getTradeWagonResourceLimit(
    tradeBuildingLevel,
    capacityBonusPercent
  );

  if (resourceAmount > resourceLimit) {
    throw new Error(
      `Your wagon can carry ${resourceLimit.toLocaleString("en-US")} total gold and food. Upgrade Trade Wagons to move more.`
    );
  }
}

export function splitTradeCargoIntoWagonRuns(
  cargo: TradeCargo,
  tradeBuildingLevel = 0,
  capacityBonusPercent = 0
) {
  const resourceLimit = Math.max(
    1,
    getTradeWagonResourceLimit(tradeBuildingLevel, capacityBonusPercent)
  );
  const nukeComponents = getTradeNukeComponents(cargo);
  const runs: TradeCargo[] = [];
  let remainingGold = cargo.gold;
  let remainingFood = cargo.food;

  while (remainingGold > 0 || remainingFood > 0) {
    const gold = Math.min(remainingGold, resourceLimit);
    remainingGold -= gold;
    const foodCapacity = resourceLimit - gold;
    const food = Math.min(remainingFood, foodCapacity);
    remainingFood -= food;

    runs.push({
      gold,
      food,
      army: 0,
      points: 0,
      nukeComponents: EMPTY_NUKE_COMPONENT_CARGO,
    });
  }

  const nonResourceCargo = {
    army: cargo.army,
    points: cargo.points,
    nukeComponents,
  };
  const hasNonResourceCargo =
    nonResourceCargo.army > 0 ||
    nonResourceCargo.points > 0 ||
    hasNukeComponentCargo(nonResourceCargo.nukeComponents);

  if (hasNonResourceCargo) {
    if (runs.length === 0) {
      runs.push({
        gold: 0,
        food: 0,
        army: nonResourceCargo.army,
        points: nonResourceCargo.points,
        nukeComponents: nonResourceCargo.nukeComponents,
      });
    } else {
      runs[0] = {
        ...runs[0],
        army: nonResourceCargo.army,
        points: nonResourceCargo.points,
        nukeComponents: nonResourceCargo.nukeComponents,
      };
    }
  }

  return runs;
}

export function getTradeWagonRunCount(
  cargo: TradeCargo,
  tradeBuildingLevel = 0,
  capacityBonusPercent = 0
) {
  return splitTradeCargoIntoWagonRuns(
    cargo,
    tradeBuildingLevel,
    capacityBonusPercent
  ).length;
}

export function getActiveTradeWagonLimit(slotBonus = 0, purchasedSlots = 0) {
  return Math.min(
    MAX_ACTIVE_TRADE_WAGON_LIMIT,
    DEFAULT_ACTIVE_TRADE_WAGON_LIMIT +
      Math.max(0, Math.floor(slotBonus)) +
      Math.max(0, Math.floor(purchasedSlots))
  );
}

export function getTradeWagonSlotPurchaseCost(purchasedSlots = 0) {
  return (
    TRADE_WAGON_SLOT_BASE_COST +
    Math.max(0, Math.floor(purchasedSlots)) * TRADE_WAGON_SLOT_COST_STEP
  );
}

export function canPurchaseTradeWagonSlot({
  purchasedSlots = 0,
  slotBonus = 0,
}: {
  purchasedSlots?: number;
  slotBonus?: number;
}) {
  return (
    getActiveTradeWagonLimit(slotBonus, purchasedSlots) <
    MAX_ACTIVE_TRADE_WAGON_LIMIT
  );
}

export function assertActiveTradeWagonLimit({
  activeOutboundWagons,
  wagonLimit,
}: {
  activeOutboundWagons: number;
  wagonLimit: number;
}) {
  if (activeOutboundWagons >= wagonLimit) {
    throw new Error(
      `You already have ${wagonLimit.toLocaleString("en-US")} active outbound wagons. Wait for one to arrive or unlock more wagon slots.`
    );
  }
}

export function calculateTradeCargoValue(cargo: TradeCargo) {
  return (
    cargo.gold +
    cargo.food * 1.5 +
    cargo.army * 3 +
    cargo.points +
    calculateNukeComponentCargoValue(getTradeNukeComponents(cargo))
  );
}

export function splitTradeDeliveryPoints(
  cargoValue: number,
  establishedDeliveries = 0,
  tradeProfitPercent = 0,
) {
  const ESTABLISHED_ROUTE_BONUS = 5; // ≥5 deliveries = established trade route
  const basePoints = Math.floor(cargoValue / 500); // doubled points (was /1000)
  const bonusMultiplier =
    establishedDeliveries >= ESTABLISHED_ROUTE_BONUS ? 1.25 : 1.0;
  const skillMultiplier = 1 + Math.max(0, tradeProfitPercent) / 100;
  const total = Math.floor(basePoints * bonusMultiplier * skillMultiplier);
  const receiver = Math.floor(total / 2);

  return {
    total,
    sender: total - receiver,
    receiver,
  };
}

export function getTradeOfferExpiresAt(now: Date) {
  return addHours(now, TRADE_OFFER_EXPIRY_HOURS);
}

export function getConvoyArrivalAt({
  acceptedAt,
  from,
  to,
}: {
  acceptedAt: Date;
  from: { mapX: number; mapY: number };
  to: { mapX: number; mapY: number };
}) {
  return addMinutes(
    addHours(acceptedAt, CONVOY_MINIMUM_TRAVEL_HOURS),
    getAttackTravelMinutes(from, to)
  );
}

export function getAllianceDeliveryBonus({
  cargo,
  isAllied,
  trustTier,
  tradeProfitPercent = 0,
}: {
  cargo: TradeCargo;
  isAllied: boolean;
  trustTier: number;
  tradeProfitPercent?: number;
}) {
  const alliancePercent =
    isAllied && isAllianceTrustTier(trustTier)
      ? getAllianceTrustTerms(trustTier).deliveryBonusPercent
      : 0;
  const percent = Math.floor(
    TRADE_BASE_DELIVERY_BONUS_PERCENT +
      alliancePercent +
      Math.max(0, tradeProfitPercent)
  );

  return {
    percent,
    gold: Math.floor((cargo.gold * percent) / 100),
    food: Math.floor((cargo.food * percent) / 100),
    army: 0,
    points: 0,
  };
}
