import { CycleRuleset, CycleStatus, FortressKind } from "@/lib/prisma-client";

export type LeaderboardCategory =
  | "points"
  | "unitsKilled"
  | "tilesOwned"
  | "goblinsKilled"
  | "resourcesStolen"
  | "deliveredCargoValue"
  | "interceptedCargoValue";

export type LeaderboardTitleKey =
  | "CROWN_ACCOUNTANT"
  | "BUTCHER"
  | "LANDLORD"
  | "GOBLIN_BONKER"
  | "LOOT_LORD"
  | "COURIER"
  | "PRIVATEER";

export type LeaderboardTitleConfig = {
  category: LeaderboardCategory;
  titleKey: LeaderboardTitleKey;
  label: string;
  title: string;
  metricLabel: string;
  buffLabel: string;
};

export type RankedLeaderboardEntry = {
  id: string;
  commanderName: string;
  name: string;
  rawName: string;
  points: number;
  unitsKilled: number;
  tilesOwned: number;
  goblinsKilled: number;
  resourcesStolen: number;
  deliveredCargoValue: number;
  interceptedCargoValue: number;
  metric: number;
  rank: number;
  title: string | null;
  buffLabel: string | null;
  isTitleHolder: boolean;
  isSlayerOfA: boolean;
  isCurrentUser: boolean;
};

export type LeaderboardFortress = {
  id: string;
  name: string;
  points: number;
  unitsKilled: number;
  goblinsKilled: number;
  resourcesStolen: number;
  deliveredCargoValue: number;
  interceptedCargoValue: number;
  joinedAt: Date;
  isNpc: boolean;
  fortressKind: FortressKind;
};

export type LeaderboardTitleHolders = Partial<
  Record<LeaderboardCategory, string>
>;

export const LEGACY_LEADERBOARD_TITLE_CONFIGS = [
  {
    category: "points",
    titleKey: "CROWN_ACCOUNTANT",
    label: "Points",
    title: "Crown Accountant",
    metricLabel: "pts",
    buffLabel: "+10% points from tile income",
  },
  {
    category: "unitsKilled",
    titleKey: "BUTCHER",
    label: "Units killed",
    title: "Butcher",
    metricLabel: "kills",
    buffLabel: "+10% attack power",
  },
  {
    category: "tilesOwned",
    titleKey: "LANDLORD",
    label: "Tiles owned",
    title: "Landlord",
    metricLabel: "tiles",
    buffLabel: "+10% tile resource income",
  },
  {
    category: "goblinsKilled",
    titleKey: "GOBLIN_BONKER",
    label: "Goblins killed",
    title: "Goblin Bonker",
    metricLabel: "goblins",
    buffLabel: "+25% loot camp rewards",
  },
  {
    category: "resourcesStolen",
    titleKey: "LOOT_LORD",
    label: "Resources stolen",
    title: "Loot Lord",
    metricLabel: "stolen",
    buffLabel: "+10% castle loot",
  },
] as const satisfies readonly LeaderboardTitleConfig[];

export const SEASON_FOUR_LEADERBOARD_TITLE_CONFIGS = [
  {
    category: "points",
    titleKey: "CROWN_ACCOUNTANT",
    label: "Points",
    title: "Crown Accountant",
    metricLabel: "pts",
    buffLabel: "Prestige only",
  },
  {
    category: "tilesOwned",
    titleKey: "LANDLORD",
    label: "Territory",
    title: "Landlord",
    metricLabel: "tiles",
    buffLabel: "Prestige only",
  },
  {
    category: "unitsKilled",
    titleKey: "BUTCHER",
    label: "PvP Kills",
    title: "Butcher",
    metricLabel: "kills",
    buffLabel: "Prestige only",
  },
  {
    category: "deliveredCargoValue",
    titleKey: "COURIER",
    label: "Courier",
    title: "Courier",
    metricLabel: "cargo",
    buffLabel: "Prestige only",
  },
  {
    category: "interceptedCargoValue",
    titleKey: "PRIVATEER",
    label: "Privateer",
    title: "Privateer",
    metricLabel: "cargo",
    buffLabel: "Prestige only",
  },
] as const satisfies readonly LeaderboardTitleConfig[];

export function getLeaderboardTitleConfigs(ruleset: CycleRuleset | null | undefined) {
  return ruleset === CycleRuleset.SEASON_4
    ? SEASON_FOUR_LEADERBOARD_TITLE_CONFIGS
    : LEGACY_LEADERBOARD_TITLE_CONFIGS;
}

export const LEADERBOARD_TITLE_ATTACK_MULTIPLIER = 1.1;
export const LEADERBOARD_TITLE_TILE_INCOME_MULTIPLIER = 1.1;
export const LEADERBOARD_TITLE_POINT_INCOME_MULTIPLIER = 1.1;
export const LEADERBOARD_TITLE_LOOT_CAMP_REWARD_MULTIPLIER = 1.25;
export const LEADERBOARD_TITLE_CASTLE_LOOT_MULTIPLIER = 1.1;

export function getLeaderboardMetric(
  category: LeaderboardCategory,
  fortress: Pick<
    LeaderboardFortress,
    | "id"
    | "points"
    | "unitsKilled"
    | "goblinsKilled"
    | "resourcesStolen"
    | "deliveredCargoValue"
    | "interceptedCargoValue"
  >,
  tileCountsByFortressId: Map<string, number>
) {
  if (category === "points") {
    return fortress.points;
  }

  if (category === "unitsKilled") {
    return fortress.unitsKilled;
  }

  if (category === "goblinsKilled") {
    return fortress.goblinsKilled;
  }

  if (category === "resourcesStolen") {
    return fortress.resourcesStolen;
  }

  if (category === "deliveredCargoValue") {
    return fortress.deliveredCargoValue;
  }

  if (category === "interceptedCargoValue") {
    return fortress.interceptedCargoValue;
  }

  return tileCountsByFortressId.get(fortress.id) ?? 0;
}

export function isLeaderboardEligibleFortress(
  fortress: Pick<LeaderboardFortress, "isNpc" | "fortressKind">
) {
  return !fortress.isNpc && fortress.fortressKind === FortressKind.PLAYER;
}

export function compareLeaderboardFortresses(
  category: LeaderboardCategory,
  tileCountsByFortressId: Map<string, number>
) {
  return (left: LeaderboardFortress, right: LeaderboardFortress) => {
    const leftMetric = getLeaderboardMetric(category, left, tileCountsByFortressId);
    const rightMetric = getLeaderboardMetric(
      category,
      right,
      tileCountsByFortressId
    );

    if (leftMetric !== rightMetric) {
      return rightMetric - leftMetric;
    }

    if (left.points !== right.points) {
      return right.points - left.points;
    }

    const joinedDelta = left.joinedAt.getTime() - right.joinedAt.getTime();

    if (joinedDelta !== 0) {
      return joinedDelta;
    }

    return left.name.localeCompare(right.name);
  };
}

export function getLeaderboardTitleHolders({
  fortresses,
  tileCountsByFortressId,
  cycleStatus,
  ruleset = CycleRuleset.LEGACY,
}: {
  fortresses: LeaderboardFortress[];
  tileCountsByFortressId: Map<string, number>;
  cycleStatus: CycleStatus | null;
  ruleset?: CycleRuleset | null;
}): LeaderboardTitleHolders {
  if (cycleStatus !== CycleStatus.ACTIVE) {
    return {};
  }

  const eligibleFortresses = fortresses.filter(isLeaderboardEligibleFortress);
  const holders: LeaderboardTitleHolders = {};

  for (const config of getLeaderboardTitleConfigs(ruleset)) {
    const [leader] = [...eligibleFortresses].sort(
      compareLeaderboardFortresses(config.category, tileCountsByFortressId)
    );

    if (!leader) {
      continue;
    }

    const metric = getLeaderboardMetric(
      config.category,
      leader,
      tileCountsByFortressId
    );

    if (config.category !== "points" && metric <= 0) {
      continue;
    }

    holders[config.category] = leader.id;
  }

  return holders;
}

export function hasLeaderboardTitle(
  holders: LeaderboardTitleHolders,
  fortressId: string,
  category: LeaderboardCategory
) {
  return holders[category] === fortressId;
}

export function getLeaderboardTitleAttackMultiplier(
  holders: LeaderboardTitleHolders,
  fortressId: string,
  ruleset: CycleRuleset = CycleRuleset.LEGACY
) {
  if (ruleset === CycleRuleset.SEASON_4) {
    return 1;
  }

  return hasLeaderboardTitle(holders, fortressId, "unitsKilled")
    ? LEADERBOARD_TITLE_ATTACK_MULTIPLIER
    : 1;
}

export function getLeaderboardTitleLootCampRewardMultiplier(
  holders: LeaderboardTitleHolders,
  fortressId: string,
  ruleset: CycleRuleset = CycleRuleset.LEGACY
) {
  if (ruleset === CycleRuleset.SEASON_4) {
    return 1;
  }

  return hasLeaderboardTitle(holders, fortressId, "goblinsKilled")
    ? LEADERBOARD_TITLE_LOOT_CAMP_REWARD_MULTIPLIER
    : 1;
}

export function getLeaderboardTitleCastleLootMultiplier(
  holders: LeaderboardTitleHolders,
  fortressId: string,
  ruleset: CycleRuleset = CycleRuleset.LEGACY
) {
  if (ruleset === CycleRuleset.SEASON_4) {
    return 1;
  }

  return hasLeaderboardTitle(holders, fortressId, "resourcesStolen")
    ? LEADERBOARD_TITLE_CASTLE_LOOT_MULTIPLIER
    : 1;
}

export function getLeaderboardTitleTileIncomeMultipliers(
  holders: LeaderboardTitleHolders,
  fortressId: string,
  ruleset: CycleRuleset = CycleRuleset.LEGACY
) {
  if (ruleset === CycleRuleset.SEASON_4) {
    return { resource: 1, points: 1 };
  }

  return {
    resource:
      hasLeaderboardTitle(holders, fortressId, "tilesOwned")
        ? LEADERBOARD_TITLE_TILE_INCOME_MULTIPLIER
        : 1,
    points:
      hasLeaderboardTitle(holders, fortressId, "points")
        ? LEADERBOARD_TITLE_POINT_INCOME_MULTIPLIER
        : 1,
  };
}
