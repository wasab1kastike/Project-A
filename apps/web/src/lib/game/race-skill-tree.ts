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

const pressure = (value: number) =>
  reward(`+${value}% pressure`, "pressure", value, value >= 15);
const food = (value: number) =>
  reward(`+${value} food/10 farmers`, "foodPerTenFarmers", value, value >= 4);
const gold = (value: number) =>
  reward(`+${value} gold/10 miners`, "goldPerTenMiners", value, value >= 4);
const tileDefense = (value: number) =>
  reward(`+${value}% tile defense`, "tileDefense", value, value >= 20);
const claimThreshold = (value: number) =>
  reward(`${value} claim threshold`, "claimThreshold", value, true);

// ── New Season 4 effects ────────────────────────────────────────────────────
const battalionSize = (value: number) =>
  reward(`+${value}% battalion max size`, "battalionMaxSize", value, value >= 20);
const battalionXp = (value: number) =>
  reward(`+${value}% battalion XP`, "battalionXpRate", value, value >= 15);
const upkeepDisc = (value: number) =>
  reward(`-${value}% army upkeep`, "upkeepDiscount", value, value >= 10);
const promoDisc = (value: number) =>
  reward(`-${value}% promotion cost`, "promotionDiscount", value, value >= 15);
const prioritySlots = (value: number) =>
  reward(`+${value} expansion slot${value === 1 ? "" : "s"}`, "pressurePrioritySlots", value, true);
const recruitRate = (value: number) =>
  reward(`+${value}% recruitment rate`, "recruitmentRate", value, value >= 40);
const battalionSlots = (value: number) =>
  reward(`+${value} battalion slot${value === 1 ? "" : "s"}`, "battalionSlots", value, true);

export const RACE_SKILL_TREES: Record<FortressRace, RaceSkillTree> = {
  DWARFS: {
    race: "DWARFS",
    paths: [
      path("economy", "Grudge Economy", "Every insult becomes food, gold, or cheaper upkeep.", [
        { level: 1, name: "Red Ink Rations", description: "+3 food per 10 farmers", rewards: [food(3)] },
        { level: 2, name: "Debt Mine", description: "+3 gold per 10 miners", rewards: [gold(3)] },
        { level: 3, name: "Stone Pantry", description: "-10% army upkeep", rewards: [upkeepDisc(10)] },
        { level: 4, name: "Claim Ledgers", description: "+1 expansion priority slot", rewards: [prioritySlots(1)] },
        { level: 5, name: "Vengeful Harvest", description: "+5 food per 10 farmers", rewards: [food(5)] },
        { level: 6, name: "Audited Veins", description: "+5 gold per 10 miners", rewards: [gold(5)] },
        { level: 7, name: "Oathbound Stores", description: "-20% army upkeep", rewards: [upkeepDisc(20)] },
        { level: 8, name: "The Grudge Pays", description: "+2 expansion slots, -30% upkeep", rewards: [prioritySlots(2), upkeepDisc(30)] },
      ]),
      path("territory", "Seismic Claim", "Make borders move before armies do.", [
        { level: 1, name: "Stone Listening", description: "+10% pressure", rewards: [pressure(10)] },
        { level: 2, name: "Shieldwall Stakes", description: "+10% tile defense", rewards: [tileDefense(10)] },
        { level: 3, name: "Faultline Teams", description: "+12% pressure", rewards: [pressure(12)] },
        { level: 4, name: "Mountain Pull", description: "Neutral claims at 540 pressure", rewards: [claimThreshold(540)] },
        { level: 5, name: "Tectonic Writ", description: "+20% pressure", rewards: [pressure(20)] },
        { level: 6, name: "Runic Borders", description: "+20% tile defense", rewards: [tileDefense(20)] },
        { level: 7, name: "Deep Claim", description: "Neutral claims at 500 pressure", rewards: [claimThreshold(500)] },
        { level: 8, name: "World-Anvil Decree", description: "+35% pressure, +1 expansion slot", rewards: [pressure(35), prioritySlots(1)] },
      ]),
      path("military", "Runebound Host", "Compact companies, stubborn veterans, heavy muster.", [
        { level: 1, name: "Drilled Muster", description: "+20% recruitment rate", rewards: [recruitRate(20)] },
        { level: 2, name: "Clan Veterans", description: "+15% battalion XP", rewards: [battalionXp(15)] },
        { level: 3, name: "Deep Barracks", description: "+20% battalion max size", rewards: [battalionSize(20)] },
        { level: 4, name: "Ancestor Companies", description: "+1 battalion slot", rewards: [battalionSlots(1)] },
        { level: 5, name: "Rune Drill", description: "+40% recruitment rate", rewards: [recruitRate(40)] },
        { level: 6, name: "Field Smiths", description: "-25% promotion cost", rewards: [promoDisc(25)] },
        { level: 7, name: "Oath Host", description: "+25% battalion max size", rewards: [battalionSize(25)] },
        { level: 8, name: "The Hold Marches", description: "+2 battalion slots, +60% recruitment", rewards: [battalionSlots(2), recruitRate(60)] },
      ]),
    ],
  },
  ORKS: {
    race: "ORKS",
    paths: [
      path("economy", "Loot Economy", "Scrap, snacks, and enough ledgers to be dangerous.", [
        { level: 1, name: "Snack Finderz", description: "+3 food per 10 farmers", rewards: [food(3)] },
        { level: 2, name: "Shiny Mine", description: "+3 gold per 10 miners", rewards: [gold(3)] },
        { level: 3, name: "Cheap Grub", description: "-10% army upkeep", rewards: [upkeepDisc(10)] },
        { level: 4, name: "More Places Ta Grab", description: "+1 expansion priority slot", rewards: [prioritySlots(1)] },
        { level: 5, name: "Bigger Snack Pile", description: "+5 food per 10 farmers", rewards: [food(5)] },
        { level: 6, name: "Da Tax Is Punchin'", description: "+5 gold per 10 miners", rewards: [gold(5)] },
        { level: 7, name: "Feed Da Ladz", description: "-20% army upkeep", rewards: [upkeepDisc(20)] },
        { level: 8, name: "Da Biggest Pile", description: "+2 expansion slots, -30% upkeep", rewards: [prioritySlots(2), upkeepDisc(30)] },
      ]),
      path("territory", "Green Tide Claim", "Push borders by being louder than walls.", [
        { level: 1, name: "Rock Lobbas", description: "+10% pressure", rewards: [pressure(10)] },
        { level: 2, name: "Scrap Stakes", description: "+10% tile defense", rewards: [tileDefense(10)] },
        { level: 3, name: "Wall Shouters", description: "+12% pressure", rewards: [pressure(12)] },
        { level: 4, name: "Krumper Crews", description: "Neutral claims at 540 pressure", rewards: [claimThreshold(540)] },
        { level: 5, name: "Bootprints Everywhere", description: "+20% pressure", rewards: [pressure(20)] },
        { level: 6, name: "Spiky Borders", description: "+20% tile defense", rewards: [tileDefense(20)] },
        { level: 7, name: "Da Big Push", description: "Neutral claims at 500 pressure", rewards: [claimThreshold(500)] },
        { level: 8, name: "World Krumper", description: "+35% pressure, +1 expansion slot", rewards: [pressure(35), prioritySlots(1)] },
      ]),
      path("military", "WAAAGH Host", "Recruitment momentum that refuses to stop.", [
        { level: 1, name: "Louda Drums", description: "+20% recruitment rate", rewards: [recruitRate(20)] },
        { level: 2, name: "Fight Learnin'", description: "+15% battalion XP", rewards: [battalionXp(15)] },
        { level: 3, name: "Bigger Mobs", description: "+20% battalion max size", rewards: [battalionSize(20)] },
        { level: 4, name: "More Mobs", description: "+1 battalion slot", rewards: [battalionSlots(1)] },
        { level: 5, name: "Redline Muster", description: "+40% recruitment rate", rewards: [recruitRate(40)] },
        { level: 6, name: "Boss Promotions", description: "-25% promotion cost", rewards: [promoDisc(25)] },
        { level: 7, name: "Endless Barracks", description: "+25% battalion max size", rewards: [battalionSize(25)] },
        { level: 8, name: "Endless WAAAGH", description: "+2 battalion slots, +60% recruitment", rewards: [battalionSlots(2), recruitRate(60)] },
      ]),
    ],
  },
  SPACE_MURINES: {
    race: "SPACE_MURINES",
    paths: [
      path("economy", "Convoy Economy", "Disciplined logistics and supply routes.", [
        { level: 1, name: "Ration Ledgers", description: "+3 food per 10 farmers", rewards: [food(3)] },
        { level: 2, name: "Supply Drill", description: "+3 gold per 10 miners", rewards: [gold(3)] },
        { level: 3, name: "Lean Convoys", description: "-10% army upkeep", rewards: [upkeepDisc(10)] },
        { level: 4, name: "Expansion Dispatch", description: "+1 expansion priority slot", rewards: [prioritySlots(1)] },
        { level: 5, name: "Secured Depots", description: "+5 food per 10 farmers", rewards: [food(5)] },
        { level: 6, name: "Fleet Protocol", description: "+5 gold per 10 miners", rewards: [gold(5)] },
        { level: 7, name: "Imperial Supply Lines", description: "-20% army upkeep", rewards: [upkeepDisc(20)] },
        { level: 8, name: "Imperial Supply Web", description: "+2 expansion slots, -30% upkeep", rewards: [prioritySlots(2), upkeepDisc(30)] },
      ]),
      path("territory", "Orbital Claim", "Precision claims from above.", [
        { level: 1, name: "Surveyor Satellites", description: "+10% pressure", rewards: [pressure(10)] },
        { level: 2, name: "Bastion Telemetry", description: "+10% tile defense", rewards: [tileDefense(10)] },
        { level: 3, name: "Kinetic Planner", description: "+12% pressure", rewards: [pressure(12)] },
        { level: 4, name: "Relay Chapels", description: "Neutral claims at 540 pressure", rewards: [claimThreshold(540)] },
        { level: 5, name: "Precision Strike", description: "+20% pressure", rewards: [pressure(20)] },
        { level: 6, name: "Orbital Citadel", description: "+20% tile defense", rewards: [tileDefense(20)] },
        { level: 7, name: "Sky-Law Survey", description: "Neutral claims at 500 pressure", rewards: [claimThreshold(500)] },
        { level: 8, name: "Sky-Law Mandate", description: "+35% pressure, +1 expansion slot", rewards: [pressure(35), prioritySlots(1)] },
      ]),
      path("military", "Rapid Response Host", "Fast deployment and fortress readiness.", [
        { level: 1, name: "Quick March", description: "+20% recruitment rate", rewards: [recruitRate(20)] },
        { level: 2, name: "Combat Recorders", description: "+15% battalion XP", rewards: [battalionXp(15)] },
        { level: 3, name: "Drop Pod Berths", description: "+20% battalion max size", rewards: [battalionSize(20)] },
        { level: 4, name: "Ready Companies", description: "+1 battalion slot", rewards: [battalionSlots(1)] },
        { level: 5, name: "Orbital Insertion", description: "+40% recruitment rate", rewards: [recruitRate(40)] },
        { level: 6, name: "Field Commissions", description: "-25% promotion cost", rewards: [promoDisc(25)] },
        { level: 7, name: "Shield Companies", description: "+25% battalion max size", rewards: [battalionSize(25)] },
        { level: 8, name: "Imperium's Shield", description: "+2 battalion slots, +60% recruitment", rewards: [battalionSlots(2), recruitRate(60)] },
      ]),
    ],
  },
  UNSTABLE_UNICORNS: {
    race: "UNSTABLE_UNICORNS",
    paths: [
      path("economy", "Glitter Economy", "Bend luck until the storehouses agree.", [
        { level: 1, name: "Phantom Kitchens", description: "+3 food per 10 farmers", rewards: [food(3)] },
        { level: 2, name: "Reality Pennies", description: "+3 gold per 10 miners", rewards: [gold(3)] },
        { level: 3, name: "Sugar Discipline", description: "-10% army upkeep", rewards: [upkeepDisc(10)] },
        { level: 4, name: "Extra Horizons", description: "+1 expansion priority slot", rewards: [prioritySlots(1)] },
        { level: 5, name: "Lucky Gallop", description: "+5 food per 10 farmers", rewards: [food(5)] },
        { level: 6, name: "Prismatic Surge", description: "+5 gold per 10 miners", rewards: [gold(5)] },
        { level: 7, name: "Stable Reality", description: "-20% army upkeep", rewards: [upkeepDisc(20)] },
        { level: 8, name: "Shattered Ledger", description: "+2 expansion slots, -30% upkeep", rewards: [prioritySlots(2), upkeepDisc(30)] },
      ]),
      path("territory", "Prismatic Claim", "Expansion with unreliable borders and very reliable glitter.", [
        { level: 1, name: "Sparkle Dust", description: "+10% pressure", rewards: [pressure(10)] },
        { level: 2, name: "Rainbow Stakes", description: "+10% tile defense", rewards: [tileDefense(10)] },
        { level: 3, name: "Glitterstorm", description: "+12% pressure", rewards: [pressure(12)] },
        { level: 4, name: "Prismatic Pull", description: "Neutral claims at 540 pressure", rewards: [claimThreshold(540)] },
        { level: 5, name: "Cascade Dust", description: "+20% pressure", rewards: [pressure(20)] },
        { level: 6, name: "Impossible Stakes", description: "+20% tile defense", rewards: [tileDefense(20)] },
        { level: 7, name: "Unstable Frontier", description: "Neutral claims at 500 pressure", rewards: [claimThreshold(500)] },
        { level: 8, name: "Color Out Of Map", description: "+35% pressure, +1 expansion slot", rewards: [pressure(35), prioritySlots(1)] },
      ]),
      path("military", "Mirror Host", "Decoy companies, impossible veterans, sudden reinforcements.", [
        { level: 1, name: "Lucky Muster", description: "+20% recruitment rate", rewards: [recruitRate(20)] },
        { level: 2, name: "Shimmer Masks", description: "+15% battalion XP", rewards: [battalionXp(15)] },
        { level: 3, name: "Hidden Quarters", description: "+20% battalion max size", rewards: [battalionSize(20)] },
        { level: 4, name: "Mirror Companies", description: "+1 battalion slot", rewards: [battalionSlots(1)] },
        { level: 5, name: "Helpful Paradox", description: "+40% recruitment rate", rewards: [recruitRate(40)] },
        { level: 6, name: "False Commissions", description: "-25% promotion cost", rewards: [promoDisc(25)] },
        { level: 7, name: "Invisible Herd", description: "+25% battalion max size", rewards: [battalionSize(25)] },
        { level: 8, name: "Shattered Mirror Host", description: "+2 battalion slots, +60% recruitment", rewards: [battalionSlots(2), recruitRate(60)] },
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
