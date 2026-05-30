import { DiplomacyRelationStatus } from "@/lib/prisma-client";
import { getAttackTravelMinutes } from "./attacks";
import { getAllianceTrustTerms, isAllianceTrustTier } from "./politics";
import { addHours, addMinutes } from "./time";

export const TRADE_OFFER_EXPIRY_HOURS = 24;
export const CONVOY_MINIMUM_TRAVEL_HOURS = 6;

export type TradeCargo = {
  gold: number;
  food: number;
  army: number;
};

export const EMPTY_TRADE_CARGO: TradeCargo = {
  gold: 0,
  food: 0,
  army: 0,
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
  const values = Object.entries(input);

  for (const [resource, amount] of values) {
    if (!Number.isInteger(amount) || amount < 0) {
      throw new Error(
        `${resource.charAt(0).toUpperCase()}${resource.slice(1)} must be a non-negative whole number.`
      );
    }
  }

  return { ...input };
}

export function hasTradeCargo(cargo: TradeCargo) {
  return cargo.gold > 0 || cargo.food > 0 || cargo.army > 0;
}

export function calculateTradeCargoValue(cargo: TradeCargo) {
  return cargo.gold + cargo.food * 1.5 + cargo.army * 3;
}

export function splitTradeDeliveryPoints(cargoValue: number) {
  const total = Math.floor(cargoValue / 500); // doubled points (was /1000)
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
    isAllied && isAllianceTrustTier(trustTier)
      ? getAllianceTrustTerms(trustTier).deliveryBonusPercent
      : 0;

  return {
    percent,
    gold: Math.floor((cargo.gold * percent) / 100),
    food: Math.floor((cargo.food * percent) / 100),
    army: 0,
  };
}
