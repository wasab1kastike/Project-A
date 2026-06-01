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
export const TRADE_WAGON_RESOURCE_LIMIT = 1_000;
export const TRADE_BASE_DELIVERY_BONUS_PERCENT = 5;

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

export function assertTradeCargoWithinWagonLimit(cargo: TradeCargo) {
  const resourceAmount = getTradeCargoResourceAmount(cargo);

  if (resourceAmount > TRADE_WAGON_RESOURCE_LIMIT) {
    throw new Error(
      `Each trade wagon can carry at most ${TRADE_WAGON_RESOURCE_LIMIT.toLocaleString("en-US")} total gold and food.`
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
) {
  const ESTABLISHED_ROUTE_BONUS = 5; // ≥5 deliveries = established trade route
  const basePoints = Math.floor(cargoValue / 500); // doubled points (was /1000)
  const bonusMultiplier =
    establishedDeliveries >= ESTABLISHED_ROUTE_BONUS ? 1.25 : 1.0;
  const total = Math.floor(basePoints * bonusMultiplier);
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
}: {
  cargo: TradeCargo;
  isAllied: boolean;
  trustTier: number;
}) {
  const percent =
    TRADE_BASE_DELIVERY_BONUS_PERCENT +
    (isAllied && isAllianceTrustTier(trustTier)
      ? getAllianceTrustTerms(trustTier).deliveryBonusPercent
      : 0);

  return {
    percent,
    gold: Math.floor((cargo.gold * percent) / 100),
    food: Math.floor((cargo.food * percent) / 100),
    army: 0,
    points: 0,
  };
}
