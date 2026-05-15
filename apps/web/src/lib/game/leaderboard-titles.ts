import { CycleStatus, FortressKind } from "@/lib/prisma-client";

export type LeaderboardCategory =
  | "points"
  | "unitsKilled"
  | "tilesOwned"
  | "goblinsKilled";

export type LeaderboardTitleKey =
  | "CROWN_ACCOUNTANT"
  | "BUTCHER"
  | "LANDLORD"
  | "GOBLIN_BONKER";

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
  joinedAt: Date;
  isNpc: boolean;
  fortressKind: FortressKind;
};

export type LeaderboardTitleHolders = Partial<
  Record<LeaderboardCategory, string>
>;

export const LEADERBOARD_TITLE_CONFIGS = [
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
] as const satisfies readonly LeaderboardTitleConfig[];

export const LEADERBOARD_TITLE_CONFIG_BY_CATEGORY = Object.fromEntries(
  LEADERBOARD_TITLE_CONFIGS.map((config) => [config.category, config])
) as Record<LeaderboardCategory, LeaderboardTitleConfig>;

export const LEADERBOARD_TITLE_ATTACK_MULTIPLIER = 1.1;
export const LEADERBOARD_TITLE_TILE_INCOME_MULTIPLIER = 1.1;
export const LEADERBOARD_TITLE_POINT_INCOME_MULTIPLIER = 1.1;
export const LEADERBOARD_TITLE_LOOT_CAMP_REWARD_MULTIPLIER = 1.25;

export function getLeaderboardMetric(
  category: LeaderboardCategory,
  fortress: Pick<
    LeaderboardFortress,
    "id" | "points" | "unitsKilled" | "goblinsKilled"
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
}: {
  fortresses: LeaderboardFortress[];
  tileCountsByFortressId: Map<string, number>;
  cycleStatus: CycleStatus | null;
}): LeaderboardTitleHolders {
  if (cycleStatus !== CycleStatus.ACTIVE) {
    return {};
  }

  const eligibleFortresses = fortresses.filter(isLeaderboardEligibleFortress);
  const holders: LeaderboardTitleHolders = {};

  for (const config of LEADERBOARD_TITLE_CONFIGS) {
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
  fortressId: string
) {
  return hasLeaderboardTitle(holders, fortressId, "unitsKilled")
    ? LEADERBOARD_TITLE_ATTACK_MULTIPLIER
    : 1;
}

export function getLeaderboardTitleLootCampRewardMultiplier(
  holders: LeaderboardTitleHolders,
  fortressId: string
) {
  return hasLeaderboardTitle(holders, fortressId, "goblinsKilled")
    ? LEADERBOARD_TITLE_LOOT_CAMP_REWARD_MULTIPLIER
    : 1;
}

export function getLeaderboardTitleTileIncomeMultipliers(
  holders: LeaderboardTitleHolders,
  fortressId: string
) {
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
