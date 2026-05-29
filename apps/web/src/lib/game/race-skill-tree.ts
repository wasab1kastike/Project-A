import type { FortressRace } from "./races";

export const MAX_SKILL_POINTS = 12;
export const SKILL_NODES_PER_PATH = 8;

export type RaceSkillPath = {
  key: string;
  name: string;
  description: string;
  nodes: RaceSkillNode[];
};

export type RaceSkillNode = {
  key: string;
  pathKey: string;
  level: number;
  name: string;
  description: string;
  rewards: RaceSkillReward[];
};

export type RaceSkillReward = {
  label: string;
  effect: string;
  value?: number;
  isMajor: boolean;
};

export type RaceSkillTree = {
  race: FortressRace;
  paths: RaceSkillPath[];
};

type NodeDraft = Omit<RaceSkillNode, "key" | "pathKey">;

function reward(
  label: string,
  effect: string,
  value: number | undefined,
  isMajor: boolean
): RaceSkillReward {
  return { label, effect, value, isMajor };
}

function path(
  key: string,
  name: string,
  description: string,
  nodes: NodeDraft[]
): RaceSkillPath {
  return {
    key,
    name,
    description,
    nodes: nodes.map((node) => ({
      ...node,
      key: `${key}-${node.level}`,
      pathKey: key,
    })),
  };
}

const pop = (value: number, label = `+${value} pop`) =>
  reward(label, "population", value, value >= 3);
const pressure = (value: number) =>
  reward(`+${value}% pressure`, "pressure", value, value >= 15);
const food = (value: number) =>
  reward(`+${value} food/10 farmers`, "foodPerTenFarmers", value, value >= 4);
const gold = (value: number) =>
  reward(`+${value} gold/10 miners`, "goldPerTenMiners", value, value >= 4);
const army = (value: number) =>
  reward(`+${value} army/10 recruiters`, "armyPerTenRecruiters", value, value >= 3);
const tileDefense = (value: number) =>
  reward(`+${value}% tile defense`, "tileDefense", value, value >= 20);
const claimThreshold = (value: number) =>
  reward(`${value} claim threshold`, "claimThreshold", value, true);
const popPerTile = (value: number) =>
  reward(`+${value} pop/owned tile`, "populationPerOwnedTile", value, true);

export const RACE_SKILL_TREES: Record<FortressRace, RaceSkillTree> = {
  DWARFS: {
    race: "DWARFS",
    paths: [
      path("bastion", "Runebound Bastion", "Stone, spite, and impossible walls.", [
        { level: 1, name: "Gate Oaths", description: "+1 population", rewards: [pop(1)] },
        { level: 2, name: "Shieldwall Masonry", description: "+10% tile defense", rewards: [tileDefense(10)] },
        { level: 3, name: "Deep Quarters", description: "+2 population", rewards: [pop(2)] },
        { level: 4, name: "Iron-Clad Parapets", description: "+15% tile defense", rewards: [tileDefense(15)] },
        { level: 5, name: "Runic Murder Holes", description: "+20% tile defense", rewards: [tileDefense(20)] },
        { level: 6, name: "Ancestor Vaults", description: "+3 population", rewards: [pop(3)] },
        { level: 7, name: "Mountain Citadel", description: "+25% tile defense", rewards: [tileDefense(25)] },
        { level: 8, name: "The Hold Endures", description: "+5 population", rewards: [pop(5)] },
      ]),
      path("seismic", "Seismic Claim", "Make the map move before armies do.", [
        { level: 1, name: "Stone Listening", description: "+5% pressure", rewards: [pressure(5)] },
        { level: 2, name: "Faultline Stakes", description: "+8% pressure", rewards: [pressure(8)] },
        { level: 3, name: "Mountain Pull", description: "Neutral claims at 560 pressure", rewards: [claimThreshold(560)] },
        { level: 4, name: "Tremor Teams", description: "+12% pressure", rewards: [pressure(12)] },
        { level: 5, name: "Tectonic Writ", description: "Neutral claims at 520 pressure", rewards: [claimThreshold(520)] },
        { level: 6, name: "Quake Surveyors", description: "+16% pressure", rewards: [pressure(16)] },
        { level: 7, name: "Deep Claim", description: "Neutral claims at 480 pressure", rewards: [claimThreshold(480)] },
        { level: 8, name: "World-Anvil Decree", description: "+22% pressure", rewards: [pressure(22)] },
      ]),
      path("grudge", "Grudge Ledger", "Economy built from remembered insults.", [
        { level: 1, name: "Red Ink Rations", description: "+2 food per 10 farmers", rewards: [food(2)] },
        { level: 2, name: "Debt Mine", description: "+2 gold per 10 miners", rewards: [gold(2)] },
        { level: 3, name: "Stone Pantry", description: "+3 food per 10 farmers", rewards: [food(3)] },
        { level: 4, name: "Interest in Blood", description: "+4 gold per 10 miners", rewards: [gold(4)] },
        { level: 5, name: "Audited Veins", description: "+3 gold per 10 miners", rewards: [gold(3)] },
        { level: 6, name: "Vengeful Harvest", description: "+4 food per 10 farmers", rewards: [food(4)] },
        { level: 7, name: "Bookkeeper Kings", description: "+4 food per 10 farmers", rewards: [food(4)] },
        { level: 8, name: "The Grudge Pays", description: "+5 gold per 10 miners", rewards: [gold(5)] },
      ]),
    ],
  },
  ORKS: {
    race: "ORKS",
    paths: [
      path("marauder", "Marauder Mob", "Loot-fueled growth with teeth.", [
        { level: 1, name: "Shiny Finderz", description: "+1 gold per 10 miners", rewards: [gold(1)] },
        { level: 2, name: "Snack Raidz", description: "+1 food per 10 farmers", rewards: [food(1)] },
        { level: 3, name: "Bigger Loot Pile", description: "+2 gold per 10 miners", rewards: [gold(2)] },
        { level: 4, name: "Camp Followers", description: "+1 population", rewards: [pop(1)] },
        { level: 5, name: "Da Tax Is Punchin'", description: "+3 gold per 10 miners", rewards: [gold(3)] },
        { level: 6, name: "Feed Da Ladz", description: "+3 food per 10 farmers", rewards: [food(3)] },
        { level: 7, name: "Loot-Tower Banner", description: "+3 population", rewards: [pop(3)] },
        { level: 8, name: "Da Biggest Pile", description: "+5 gold per 10 miners", rewards: [gold(5)] },
      ]),
      path("siegebreaker", "Siegebreaker Tide", "Push borders by being louder than walls.", [
        { level: 1, name: "Rock Lobbas", description: "+5% pressure", rewards: [pressure(5)] },
        { level: 2, name: "Bootprints Everywhere", description: "+1 population", rewards: [pop(1)] },
        { level: 3, name: "Wall Shouters", description: "+10% pressure", rewards: [pressure(10)] },
        { level: 4, name: "More Ladz at Front", description: "+2 population", rewards: [pop(2)] },
        { level: 5, name: "Krumper Crews", description: "Neutral claims at 540 pressure", rewards: [claimThreshold(540)] },
        { level: 6, name: "Green Tide Survey", description: "+15% pressure", rewards: [pressure(15)] },
        { level: 7, name: "Da Big Push", description: "Neutral claims at 500 pressure", rewards: [claimThreshold(500)] },
        { level: 8, name: "World Krumper", description: "+24% pressure", rewards: [pressure(24)] },
      ]),
      path("waaagh", "WAAAGH Engine", "Recruitment momentum that refuses to stop.", [
        { level: 1, name: "Louda Drums", description: "+1 army per 10 recruiters", rewards: [army(1)] },
        { level: 2, name: "Scrap Bunks", description: "+1 population", rewards: [pop(1)] },
        { level: 3, name: "Momentum Pit", description: "+2 army per 10 recruiters", rewards: [army(2)] },
        { level: 4, name: "Boss Counting", description: "+1 population per owned tile", rewards: [popPerTile(1)] },
        { level: 5, name: "More Choppas", description: "+3 army per 10 recruiters", rewards: [army(3)] },
        { level: 6, name: "Endless Barracks", description: "+3 population", rewards: [pop(3)] },
        { level: 7, name: "Redline Muster", description: "+4 army per 10 recruiters", rewards: [army(4)] },
        { level: 8, name: "Endless WAAAGH", description: "+2 population per owned tile", rewards: [popPerTile(2)] },
      ]),
    ],
  },
  SPACE_MURINES: {
    race: "SPACE_MURINES",
    paths: [
      path("convoy", "Convoy Command", "Disciplined logistics and supply routes.", [
        { level: 1, name: "Supply Drill", description: "+1 gold per 10 miners", rewards: [gold(1)] },
        { level: 2, name: "Ration Ledgers", description: "+1 food per 10 farmers", rewards: [food(1)] },
        { level: 3, name: "Armored Manifests", description: "+2 gold per 10 miners", rewards: [gold(2)] },
        { level: 4, name: "Quartermaster Cells", description: "+2 food per 10 farmers", rewards: [food(2)] },
        { level: 5, name: "Fleet Protocol", description: "+3 gold per 10 miners", rewards: [gold(3)] },
        { level: 6, name: "Secured Depots", description: "+3 food per 10 farmers", rewards: [food(3)] },
        { level: 7, name: "Orbital Freight", description: "+4 gold per 10 miners", rewards: [gold(4)] },
        { level: 8, name: "Imperial Supply Web", description: "+5 food per 10 farmers", rewards: [food(5)] },
      ]),
      path("rapid", "Rapid Response", "Fast deployment and fortress readiness.", [
        { level: 1, name: "Quick March", description: "+1 army per 10 recruiters", rewards: [army(1)] },
        { level: 2, name: "Drop Pod Berths", description: "+1 population", rewards: [pop(1)] },
        { level: 3, name: "Entrenched Squads", description: "+2 army per 10 recruiters", rewards: [army(2)] },
        { level: 4, name: "Ready Rooms", description: "+2 population", rewards: [pop(2)] },
        { level: 5, name: "Orbital Insertion", description: "+3 army per 10 recruiters", rewards: [army(3)] },
        { level: 6, name: "Fortress Watch", description: "+10% tile defense", rewards: [tileDefense(10)] },
        { level: 7, name: "Shield Companies", description: "+4 army per 10 recruiters", rewards: [army(4)] },
        { level: 8, name: "Imperium's Shield", description: "+5 population", rewards: [pop(5)] },
      ]),
      path("orbital", "Orbital Doctrine", "Precision claims from above.", [
        { level: 1, name: "Surveyor Satellites", description: "+5% pressure", rewards: [pressure(5)] },
        { level: 2, name: "Targeting Choir", description: "+1 population", rewards: [pop(1)] },
        { level: 3, name: "Kinetic Planner", description: "+10% pressure", rewards: [pressure(10)] },
        { level: 4, name: "Relay Chapels", description: "Neutral claims at 560 pressure", rewards: [claimThreshold(560)] },
        { level: 5, name: "Precision Strike", description: "+15% pressure", rewards: [pressure(15)] },
        { level: 6, name: "Bastion Telemetry", description: "+15% tile defense", rewards: [tileDefense(15)] },
        { level: 7, name: "Orbital Citadel", description: "+3 population", rewards: [pop(3)] },
        { level: 8, name: "Sky-Law Mandate", description: "+25% pressure", rewards: [pressure(25)] },
      ]),
    ],
  },
  UNSTABLE_UNICORNS: {
    race: "UNSTABLE_UNICORNS",
    paths: [
      path("glitter", "Glitter Frontier", "Prismatic expansion with unreliable borders.", [
        { level: 1, name: "Sparkle Dust", description: "+5% pressure", rewards: [pressure(5)] },
        { level: 2, name: "Rainbow Survey", description: "+8% pressure", rewards: [pressure(8)] },
        { level: 3, name: "Prismatic Pull", description: "Neutral claims at 560 pressure", rewards: [claimThreshold(560)] },
        { level: 4, name: "Glitterstorm", description: "+13% pressure", rewards: [pressure(13)] },
        { level: 5, name: "Impossible Stakes", description: "Neutral claims at 520 pressure", rewards: [claimThreshold(520)] },
        { level: 6, name: "Cascade Dust", description: "+18% pressure", rewards: [pressure(18)] },
        { level: 7, name: "Unstable Frontier", description: "Neutral claims at 480 pressure", rewards: [claimThreshold(480)] },
        { level: 8, name: "Color Out Of Map", description: "+26% pressure", rewards: [pressure(26)] },
      ]),
      path("veiled", "Veiled Network", "Hidden logistics and suspicious prosperity.", [
        { level: 1, name: "Shimmer Masks", description: "+1 gold per 10 miners", rewards: [gold(1)] },
        { level: 2, name: "Mirror Stores", description: "+1 food per 10 farmers", rewards: [food(1)] },
        { level: 3, name: "False Ledgers", description: "+2 gold per 10 miners", rewards: [gold(2)] },
        { level: 4, name: "Phantom Kitchens", description: "+2 food per 10 farmers", rewards: [food(2)] },
        { level: 5, name: "Hidden Quarters", description: "+2 population", rewards: [pop(2)] },
        { level: 6, name: "Decoy Treasuries", description: "+4 gold per 10 miners", rewards: [gold(4)] },
        { level: 7, name: "Invisible Herd", description: "+4 population", rewards: [pop(4)] },
        { level: 8, name: "Mirror Host", description: "+6 gold per 10 miners", rewards: [gold(6)] },
      ]),
      path("shattered", "Shattered Reality", "Bend luck until the economy agrees.", [
        { level: 1, name: "Lucky Streak", description: "+1 food per 10 farmers", rewards: [food(1)] },
        { level: 2, name: "Reality Pennies", description: "+1 gold per 10 miners", rewards: [gold(1)] },
        { level: 3, name: "Fortune's Gait", description: "+2 food per 10 farmers", rewards: [food(2)] },
        { level: 4, name: "Helpful Paradox", description: "+1 army per 10 recruiters", rewards: [army(1)] },
        { level: 5, name: "Lucky Gallop", description: "+3 food per 10 farmers", rewards: [food(3)] },
        { level: 6, name: "Prismatic Surge", description: "+3 gold per 10 miners", rewards: [gold(3)] },
        { level: 7, name: "Reality Stable", description: "+3 population", rewards: [pop(3)] },
        { level: 8, name: "Shattered Mirror", description: "+5 food per 10 farmers", rewards: [food(5)] },
      ]),
    ],
  },
};

export function getRaceSkillTree(race: FortressRace): RaceSkillTree {
  return RACE_SKILL_TREES[race];
}

export function getSkillNode(
  race: FortressRace,
  nodeKey: string
): RaceSkillNode | undefined {
  return RACE_SKILL_TREES[race]?.paths
    .flatMap((skillPath) => skillPath.nodes)
    .find((node) => node.key === nodeKey);
}

export function getSkillPathForNode(
  race: FortressRace,
  nodeKey: string
): RaceSkillPath | undefined {
  return RACE_SKILL_TREES[race]?.paths.find((skillPath) =>
    skillPath.nodes.some((node) => node.key === nodeKey)
  );
}

export function getPurchasedNodeRewards({
  race,
  nodeKeys,
}: {
  race: FortressRace;
  nodeKeys: string[];
}): Array<RaceSkillReward & { nodeKey: string; pathKey: string; level: number }> {
  const rewards: Array<
    RaceSkillReward & { nodeKey: string; pathKey: string; level: number }
  > = [];

  for (const nodeKey of nodeKeys) {
    const node = getSkillNode(race, nodeKey);
    if (!node) continue;
    for (const nodeReward of node.rewards) {
      rewards.push({
        ...nodeReward,
        nodeKey: node.key,
        pathKey: node.pathKey,
        level: node.level,
      });
    }
  }

  return rewards;
}
