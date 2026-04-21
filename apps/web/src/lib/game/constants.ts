import { getStrategicSpawnPositions } from "./map-hex";

export const ACTIVE_PLAYER_CAP = 30;
export const ACTIVE_RENAME_COST = 10;
export const REGISTRATION_DURATION_HOURS = 24;
export const ACTIVE_DURATION_HOURS = 72;

export const MAP_POSITIONS = getStrategicSpawnPositions(ACTIVE_PLAYER_CAP);
