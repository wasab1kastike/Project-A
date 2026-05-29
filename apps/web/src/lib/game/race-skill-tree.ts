import type { FortressRace } from "./races";

export const MAX_SKILL_POINTS = 12;

export type RaceSkillPath = {
  key: string;
  name: string;
  description: string;
  tiers: RaceSkillTier[];
};

export type RaceSkillTier = {
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

export const RACE_SKILL_TREES: Record<FortressRace, RaceSkillTree> = {
  DWARFS: {
    race: "DWARFS",
    paths: [
      {
        key: "bastion",
        name: "Bastion",
        description: "Stone walls and stubborn defense.",
        tiers: [
          {
            level: 1,
            name: "Fortified Foundations",
            description: "+1 population",
            rewards: [
              { label: "+1 pop", effect: "population", value: 1, isMajor: false },
            ],
          },
          {
            level: 2,
            name: "Stoneward Training",
            description: "+10% tile defense bonus",
            rewards: [
              { label: "+10% tile def", effect: "tileDefense", value: 10, isMajor: true },
            ],
          },
          {
            level: 3,
            name: "Deep Reinforcements",
            description: "+2 population",
            rewards: [
              { label: "+2 pop", effect: "population", value: 2, isMajor: false },
            ],
          },
          {
            level: 4,
            name: "Granite Bulwark",
            description: "+20% tile defense (replaces previous)",
            rewards: [
              { label: "+20% tile def", effect: "tileDefense", value: 20, isMajor: true },
            ],
          },
          {
            level: 5,
            name: "Runic Wards",
            description: "Guards deal 5% attrition to attackers",
            rewards: [
              { label: "5% guard attrition", effect: "guardAttrition", value: 5, isMajor: true },
            ],
          },
        ],
      },
      {
        key: "seismic",
        name: "Seismic",
        description: "Bend the earth to expand borders.",
        tiers: [
          {
            level: 1,
            name: "Tremor Sense",
            description: "+5% pressure",
            rewards: [
              { label: "+5% pressure", effect: "pressure", value: 5, isMajor: false },
            ],
          },
          {
            level: 2,
            name: "Mountain's Pull",
            description: "Mountain tiles claim 15% faster",
            rewards: [
              { label: "15% faster mountain", effect: "mountainPressure", value: 15, isMajor: true },
            ],
          },
          {
            level: 3,
            name: "Quake Aura",
            description: "+10% pressure (replaces previous)",
            rewards: [
              { label: "+10% pressure", effect: "pressure", value: 10, isMajor: false },
            ],
          },
          {
            level: 4,
            name: "Tectonic Rift",
            description: "Claiming a tile disrupts adjacent enemy pressure",
            rewards: [
              { label: "disrupt adjacent", effect: "pressureDisrupt", isMajor: true },
            ],
          },
          {
            level: 5,
            name: "Deep Claim",
            description: "Neutral claim threshold -20% (480)",
            rewards: [
              { label: "480 threshold", effect: "claimThreshold", value: 480, isMajor: true },
            ],
          },
        ],
      },
      {
        key: "grudge",
        name: "Grudgebearer",
        description: "A Book of Grudges that pays interest.",
        tiers: [
          {
            level: 1,
            name: "Record Keeping",
            description: "+2 food per 10 farmers",
            rewards: [
              { label: "+2 food/10 farmers", effect: "foodPerTenFarmers", value: 2, isMajor: false },
            ],
          },
          {
            level: 2,
            name: "Grudge Economy",
            description: "Gain 10 gold when a tile is attacked",
            rewards: [
              { label: "10g on tile attack", effect: "grudgeGold", value: 10, isMajor: true },
            ],
          },
          {
            level: 3,
            name: "Stone Ledger",
            description: "+3 food per 10 farmers (replaces previous)",
            rewards: [
              { label: "+3 food/10 farmers", effect: "foodPerTenFarmers", value: 3, isMajor: false },
            ],
          },
          {
            level: 4,
            name: "Vengeful Harvest",
            description: "Losing a tile grants +50 food next tick",
            rewards: [
              { label: "50 food on tile loss", effect: "vengefulFood", value: 50, isMajor: true },
            ],
          },
          {
            level: 5,
            name: "The Grudge Pays",
            description: "Killing an attacker grants 50% gold refund on lost army",
            rewards: [
              { label: "50% army refund on kill", effect: "grudgeRefund", isMajor: true },
            ],
          },
        ],
      },
    ],
  },
  ORKS: {
    race: "ORKS",
    paths: [
      {
        key: "marauder",
        name: "Marauder",
        description: "Raid convoys and take what's yours.",
        tiers: [
          { level: 1, name: "Sneaky Git", description: "+5% raid power", rewards: [{ label: "+5% raid", effect: "raidPower", value: 5, isMajor: false }] },
          { level: 2, name: "Loot Pile", description: "+15% stolen cargo", rewards: [{ label: "+15% stolen cargo", effect: "stolenCargo", value: 15, isMajor: true }] },
          { level: 3, name: "Bigger Choppa", description: "+10% raid power (replaces)", rewards: [{ label: "+10% raid", effect: "raidPower", value: 10, isMajor: false }] },
          { level: 4, name: "Extra Pocket", description: "15% chance to steal double", rewards: [{ label: "15% double steal", effect: "doubleSteal", value: 15, isMajor: true }] },
          { level: 5, name: "Da Biggest Loot", description: "+25% stolen cargo (replaces)", rewards: [{ label: "+25% stolen cargo", effect: "stolenCargo", value: 25, isMajor: true }] },
        ],
      },
      {
        key: "siegebreaker",
        name: "Siegebreaker",
        description: "Crush walls and claim borders.",
        tiers: [
          { level: 1, name: "Bigger Rock", description: "+5% campaign speed", rewards: [{ label: "+5% camp speed", effect: "campaignSpeed", value: 5, isMajor: false }] },
          { level: 2, name: "Wreckin' Ball", description: "+15% campaign army capacity", rewards: [{ label: "+15% camp army", effect: "campaignArmy", value: 15, isMajor: true }] },
          { level: 3, name: "Dakka Dakka", description: "+10% campaign speed (replaces)", rewards: [{ label: "+10% camp speed", effect: "campaignSpeed", value: 10, isMajor: false }] },
          { level: 4, name: "Krumper", description: "Campaigns start at 20% progress", rewards: [{ label: "start at 20%", effect: "campaignStart", value: 20, isMajor: true }] },
          { level: 5, name: "Da Big Push", description: "Siege warning reduced to 8h", rewards: [{ label: "8h siege warning", effect: "siegeWarning", value: 8, isMajor: true }] },
        ],
      },
      {
        key: "waaagh",
        name: "WAAAGH Engine",
        description: "Build momentum through battle.",
        tiers: [
          { level: 1, name: "Louda Boyz", description: "+1 army per 10 recruiters", rewards: [{ label: "+1 army/10 rec", effect: "armyPerTenRecruiters", value: 1, isMajor: false }] },
          { level: 2, name: "Scrap Collecta", description: "+1 scrap from all kills", rewards: [{ label: "+1 scrap/kill", effect: "scrapPerKill", value: 1, isMajor: true }] },
          { level: 3, name: "Momentum", description: "+2 army per 10 recruiters (replaces)", rewards: [{ label: "+2 army/10 rec", effect: "armyPerTenRecruiters", value: 2, isMajor: false }] },
          { level: 4, name: "Blood Frenzy", description: "Kills boost recruitment +20% for 1h", rewards: [{ label: "+20% recruit/kill", effect: "bloodFrenzy", value: 20, isMajor: true }] },
          { level: 5, name: "Endless WAAAGH", description: "+1 population per owned tile", rewards: [{ label: "+1 pop/tile", effect: "popPerTile", value: 1, isMajor: true }] },
        ],
      },
    ],
  },
  SPACE_MURINES: {
    race: "SPACE_MURINES",
    paths: [
      {
        key: "convoy",
        name: "Convoy Command",
        description: "Disciplined logistics and supply routes.",
        tiers: [
          { level: 1, name: "Supply Drill", description: "+5% escort power", rewards: [{ label: "+5% escort", effect: "escortPower", value: 5, isMajor: false }] },
          { level: 2, name: "Armored Transports", description: "+1h convoy speed", rewards: [{ label: "convoys 1h faster", effect: "convoySpeed", value: 1, isMajor: true }] },
          { level: 3, name: "Fleet Protocol", description: "+10% escort power (replaces)", rewards: [{ label: "+10% escort", effect: "escortPower", value: 10, isMajor: false }] },
          { level: 4, name: "Secured Cargo", description: "Deliveries +15% gold bonus", rewards: [{ label: "+15% delivery gold", effect: "deliveryGold", value: 15, isMajor: true }] },
          { level: 5, name: "Orbital Drop", description: "Deed convoys arrive in 2h", rewards: [{ label: "deeds in 2h", effect: "deedSpeed", isMajor: true }] },
        ],
      },
      {
        key: "rapid",
        name: "Rapid Response",
        description: "Fast deployment and defense.",
        tiers: [
          { level: 1, name: "Quick March", description: "+5% guard defense", rewards: [{ label: "+5% guard def", effect: "guardDefense", value: 5, isMajor: false }] },
          { level: 2, name: "Drop Pods", description: "+1 simultaneous attack slot", rewards: [{ label: "+1 attack slot", effect: "attackSlot", value: 1, isMajor: true }] },
          { level: 3, name: "Entrenched", description: "+10% guard defense (replaces)", rewards: [{ label: "+10% guard def", effect: "guardDefense", value: 10, isMajor: false }] },
          { level: 4, name: "Orbital Insertion", description: "Instant reinforce once per 24h", rewards: [{ label: "instant reinforce", effect: "instantReinforce", isMajor: true }] },
          { level: 5, name: "Imperium's Shield", description: "+2 pop, +15% campaign defense", rewards: [{ label: "+2 pop +15% camp def", effect: "imperiumsShield", isMajor: true }] },
        ],
      },
      {
        key: "orbital",
        name: "Orbital Doctrine",
        description: "Precision from above.",
        tiers: [
          { level: 1, name: "Surveyor Satellites", description: "+5% pressure", rewards: [{ label: "+5% pressure", effect: "pressure", value: 5, isMajor: false }] },
          { level: 2, name: "Kinetic Planner", description: "+10% campaign build speed", rewards: [{ label: "+10% camp speed", effect: "campaignSpeed", value: 10, isMajor: true }] },
          { level: 3, name: "Targeting Array", description: "+10% pressure (replaces)", rewards: [{ label: "+10% pressure", effect: "pressure", value: 10, isMajor: false }] },
          { level: 4, name: "Precision Strike", description: "10% chance to bypass siege warning", rewards: [{ label: "10% bypass siege", effect: "precisionStrike", value: 10, isMajor: true }] },
          { level: 5, name: "Orbital Citadel", description: "+3 pop; all owned tiles +5% defense", rewards: [{ label: "+3 pop, +5% all def", effect: "orbitalCitadel", isMajor: true }] },
        ],
      },
    ],
  },
  UNSTABLE_UNICORNS: {
    race: "UNSTABLE_UNICORNS",
    paths: [
      {
        key: "glitter",
        name: "Glitter Frontier",
        description: "Spread prismatic influence across the map.",
        tiers: [
          { level: 1, name: "Sparkle Dust", description: "+5% neutral pressure", rewards: [{ label: "+5% pressure", effect: "pressure", value: 5, isMajor: false }] },
          { level: 2, name: "Prismatic Pull", description: "Claim threshold -10% (540)", rewards: [{ label: "540 threshold", effect: "claimThreshold", value: 540, isMajor: true }] },
          { level: 3, name: "Glitterstorm", description: "+10% neutral pressure (replaces)", rewards: [{ label: "+10% pressure", effect: "pressure", value: 10, isMajor: false }] },
          { level: 4, name: "Unstable Expansion", description: "10% chance to claim at 50% threshold", rewards: [{ label: "10% prismatic claim", effect: "prismaticClaim", value: 10, isMajor: true }] },
          { level: 5, name: "Cascade", description: "Claiming triggers pressure on adjacent neutrals", rewards: [{ label: "adjacent pressure", effect: "cascade", isMajor: true }] },
        ],
      },
      {
        key: "veiled",
        name: "Veiled Network",
        description: "Hide your moves, expose theirs.",
        tiers: [
          { level: 1, name: "Shimmer Mask", description: "+10% raid evasion", rewards: [{ label: "+10% evasion", effect: "raidEvasion", value: 10, isMajor: false }] },
          { level: 2, name: "Decoy Convoys", description: "25% chance raid hits empty decoy", rewards: [{ label: "25% decoy", effect: "decoyRaid", value: 25, isMajor: true }] },
          { level: 3, name: "Mirror Sheen", description: "+20% raid evasion (replaces)", rewards: [{ label: "+20% evasion", effect: "raidEvasion", value: 20, isMajor: false }] },
          { level: 4, name: "Phantom Force", description: "Enemy sees '?' instead of army count", rewards: [{ label: "hidden army size", effect: "hiddenArmy", isMajor: true }] },
          { level: 5, name: "Mirror Host", description: "Successful raid triggers counter-raid on attacker", rewards: [{ label: "counter-raid", effect: "mirrorHost", isMajor: true }] },
        ],
      },
      {
        key: "shattered",
        name: "Shattered Reality",
        description: "Bend luck in your favor.",
        tiers: [
          { level: 1, name: "Lucky Streak", description: "+1 food per 10 farmers", rewards: [{ label: "+1 food/10 farmers", effect: "foodPerTenFarmers", value: 1, isMajor: false }] },
          { level: 2, name: "Reality Bend", description: "15% chance of bonus gold tick", rewards: [{ label: "15% bonus gold", effect: "bonusGold", value: 15, isMajor: true }] },
          { level: 3, name: "Fortune's Gait", description: "+2 food per 10 farmers (replaces)", rewards: [{ label: "+2 food/10 farmers", effect: "foodPerTenFarmers", value: 2, isMajor: false }] },
          { level: 4, name: "Lucky Gallop", description: "10% chance of free army unit per tick", rewards: [{ label: "10% free army/tick", effect: "freeArmy", value: 10, isMajor: true }] },
          { level: 5, name: "Shattered Mirror", description: "1 free reroll per day on any RNG outcome", rewards: [{ label: "1 reroll/day", effect: "reroll", isMajor: true }] },
        ],
      },
    ],
  },
};

export function getRaceSkillTree(race: FortressRace): RaceSkillTree {
  return RACE_SKILL_TREES[race];
}

export function getSkillTier(race: FortressRace, pathKey: string, level: number): RaceSkillTier | undefined {
  const tree = RACE_SKILL_TREES[race];
  if (!tree) return undefined;
  const path = tree.paths.find((p) => p.key === pathKey);
  return path?.tiers.find((t) => t.level === level);
}
