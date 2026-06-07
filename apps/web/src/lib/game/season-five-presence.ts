import {
  SeasonFiveActionKind,
  type SeasonFiveCharacterClass,
} from "@/lib/prisma-client";
import { getSeasonFiveInventoryPressure } from "./season-five-fishing";

export const SEASON_FIVE_MAP_MARKER_LIMIT = 18;

export type SeasonFivePresenceLocation = {
  id: string;
  key: string;
};

export type SeasonFivePresenceCharacter = {
  id: string;
  name: string;
  class: SeasonFiveCharacterClass;
  classLabel: string;
  avatar?: {
    body: string;
    outfit: string;
    hat: string | null;
    rod: string;
  };
  actionKind: SeasonFiveActionKind;
  currentLocationId: string | null;
  destinationLocationId: string | null;
  inventoryUsed: number;
  inventoryCapacity: number;
};

export function buildSeasonFiveLocationActivity({
  locations,
  characters,
  markerLimit = SEASON_FIVE_MAP_MARKER_LIMIT,
}: {
  locations: SeasonFivePresenceLocation[];
  characters: SeasonFivePresenceCharacter[];
  markerLimit?: number;
}) {
  const boundedMarkerLimit = Math.max(0, markerLimit);

  return locations.map((location) => {
    const presentCharacters = characters.filter((entry) =>
      entry.actionKind === SeasonFiveActionKind.TRAVELING
        ? entry.destinationLocationId === location.id
        : entry.currentLocationId === location.id
    );

    return {
      locationKey: location.key,
      totalCount: presentCharacters.length,
      overflowCount: Math.max(0, presentCharacters.length - boundedMarkerLimit),
      characters: presentCharacters
        .slice(0, boundedMarkerLimit)
        .map((entry) => {
          const inventoryPressure = getSeasonFiveInventoryPressure({
            inventoryUsed: entry.inventoryUsed,
            inventoryCapacity: entry.inventoryCapacity,
          });

          return {
            id: entry.id,
            name: entry.name,
            class: entry.class,
            classLabel: entry.classLabel,
            avatar: entry.avatar ?? null,
            actionKind: entry.actionKind,
            inventoryFull: inventoryPressure.full,
            inventoryCloseToFull: inventoryPressure.closeToFull,
          };
        }),
    };
  });
}
