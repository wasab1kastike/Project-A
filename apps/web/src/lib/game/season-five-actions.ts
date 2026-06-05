import {
  SeasonFiveActionKind,
  SeasonFiveLocationKind,
} from "@/lib/prisma-client";
import { addMinutes } from "./time";

export type SeasonFiveActionLocation = {
  id: string;
  key: string;
  name: string;
  kind: SeasonFiveLocationKind;
  travelMinutes: number;
};

export function calculateSeasonFiveTravelMinutes(input: {
  baseMinutes: number;
  travelPercent: number;
}) {
  if (input.baseMinutes <= 0) return 0;
  return Math.max(
    1,
    Math.ceil(input.baseMinutes * (1 + input.travelPercent / 100))
  );
}

export function createSeasonFiveTravelState(input: {
  destination: SeasonFiveActionLocation;
  now: Date;
  travelPercent: number;
  baseMinutes?: number;
}) {
  const travelMinutes = calculateSeasonFiveTravelMinutes({
    baseMinutes: input.baseMinutes ?? input.destination.travelMinutes,
    travelPercent: input.travelPercent,
  });

  return {
    actionKind: SeasonFiveActionKind.TRAVELING,
    destinationLocationId: input.destination.id,
    actionStartedAt: input.now,
    actionCompletesAt: addMinutes(input.now, travelMinutes),
    lastResolvedAt: input.now,
  };
}

export function resolveSeasonFiveCompletedTravel(input: {
  destination: SeasonFiveActionLocation;
  resolvedAt: Date;
}) {
  if (input.destination.kind === SeasonFiveLocationKind.HOME) {
    return {
      actionKind: SeasonFiveActionKind.AT_HOME,
      currentLocationId: input.destination.id,
      destinationLocationId: null,
      actionStartedAt: null,
      actionCompletesAt: null,
      lastResolvedAt: input.resolvedAt,
    };
  }

  return {
    actionKind: SeasonFiveActionKind.FISHING,
    currentLocationId: input.destination.id,
    destinationLocationId: null,
    actionStartedAt: input.resolvedAt,
    actionCompletesAt: null,
    lastResolvedAt: input.resolvedAt,
  };
}

export function createSeasonFiveHomeState(input: {
  homeId: string;
  now: Date;
}) {
  return {
    actionKind: SeasonFiveActionKind.AT_HOME,
    currentLocationId: input.homeId,
    destinationLocationId: null,
    actionStartedAt: null,
    actionCompletesAt: null,
    lastResolvedAt: input.now,
  };
}

export function getSeasonFiveActionSummary(input: {
  actionKind: SeasonFiveActionKind;
  currentLocation?: SeasonFiveActionLocation | null;
  destinationLocation?: SeasonFiveActionLocation | null;
  actionStartedAt?: Date | null;
  actionCompletesAt?: Date | null;
  now: Date;
}) {
  const etaAt = input.actionCompletesAt ?? null;
  const remainingSeconds = etaAt
    ? Math.max(0, Math.ceil((etaAt.getTime() - input.now.getTime()) / 1000))
    : 0;

  return {
    kind: input.actionKind,
    startedAt: input.actionStartedAt ?? null,
    etaAt,
    remainingSeconds,
    currentLocation: input.currentLocation
      ? {
          id: input.currentLocation.id,
          key: input.currentLocation.key,
          name: input.currentLocation.name,
          kind: input.currentLocation.kind,
        }
      : null,
    destination: input.destinationLocation
      ? {
          id: input.destinationLocation.id,
          key: input.destinationLocation.key,
          name: input.destinationLocation.name,
          kind: input.destinationLocation.kind,
        }
      : null,
  };
}
