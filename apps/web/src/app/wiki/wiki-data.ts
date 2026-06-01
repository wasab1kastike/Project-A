import {
  ACTIVE_DURATION_HOURS,
  ACTIVE_RENAME_COST,
  ARCADE_SEASON_BASE_COINS,
  ARCADE_SEASON_POINTS_BONUS_CAP,
  ARCADE_SEASON_POINTS_BONUS_DIVISOR,
  FORTRESS_LEVEL_UP_COSTS,
  getArcadeSeasonRankBonus,
} from "@/lib/game/constants";
import {
  ARMY_UPKEEP_PER_UNIT,
  RECRUITMENT_COST_PER_UNIT,
  RECRUITMENT_RATE_PER_RECRUITER,
  STARVATION_ATTRITION_RATE,
} from "@/lib/game/army-recruitment";
import {
  ABSOLUTE_MAX_BATTALIONS,
  BATTALION_COMMISSION_COST,
  BATTALION_EXPAND_COST_PER_50,
  DEFAULT_BATTALION_MAX_SIZE,
  EXTRA_SLOT_COSTS,
  MAX_NATURAL_SLOTS,
  MORALE_THRESHOLDS,
  TIER_MAX_SIZES,
} from "@/lib/game/battalion-types";
import {
  GUARD_DECAY_REDUCTION,
  MAX_OWNERSHIP_PRESSURE,
  OWNERSHIP_PRESSURE_DECAY_PER_TICK,
  OWNERSHIP_PRESSURE_MAINTENANCE_PER_WORKER,
  OWNERSHIP_PRESSURE_WARNING,
  TILE_PRESSURE_CLAIM_THRESHOLD,
  TILE_PRESSURE_DECAY_PERCENT_PER_HOUR,
} from "@/lib/game/tile-pressure";
import {
  ROAD_DECAY_RATE_PER_HOUR,
  ROAD_LEVEL_NAMES,
  ROAD_SPEED_BONUS,
  ROAD_THRESHOLDS,
  RoadLevel,
} from "@/lib/game/supply-lines";

export type WikiTable = {
  headers: readonly string[];
  rows: readonly (readonly string[])[];
};

export type WikiCard = {
  title: string;
  eyebrow?: string;
  image?: string;
  body?: string;
  bullets?: readonly string[];
};

export type WikiDiagramStep = {
  label: string;
  detail: string;
};

export type WikiSection = {
  id: string;
  eyebrow?: string;
  title: string;
  body?: string;
  image?: string;
  bullets?: readonly string[];
  cards?: readonly WikiCard[];
  table?: WikiTable;
  diagram?: readonly WikiDiagramStep[];
};

export type WikiPage = {
  slug: string;
  navLabel: string;
  navIcon: string;
  title: string;
  subtitle: string;
  heroImage?: string;
  highlights?: readonly string[];
  sections: readonly WikiSection[];
};

export const WIKI_BANNER_SRC = "/assets/wiki/season-4-wiki-banner.png";

const raceCards: readonly WikiCard[] = [
  {
    title: "Dwarfs",
    eyebrow: "Fortified economy",
    image: "/assets/token-dwarf.png",
    body: "Best for players who want a defended income base and steady pressure.",
    bullets: [
      "+1 gold per 10 miners.",
      "+10% defense from race modifiers.",
      "Slower army travel, stronger border holding.",
      "Skill paths: Bastion, Seismic, Grudgebearer.",
    ],
  },
  {
    title: "Orks",
    eyebrow: "Scrap tempo",
    image: "/assets/token-orks.png",
    body: "Best for players who want aggressive campaigns, raid pressure, and combat momentum.",
    bullets: [
      "+1 army per 10 recruiters.",
      "+6 carry capacity per surviving attacker.",
      "Scrap powers Ork-specific war investments.",
      "Skill paths: Marauder, Siegebreaker, WAAAGH Engine.",
    ],
  },
  {
    title: "Space Murines",
    eyebrow: "Logistics and response",
    image: "/assets/token-space-murines.png",
    body: "Best for players who want disciplined convoy play and organized war fronts.",
    bullets: [
      "+1 army per 10 recruiters.",
      "+5% defense from race modifiers.",
      "Convoy and response skills support allied planning.",
      "Skill paths: Convoy Command, Rapid Response, Orbital Doctrine.",
    ],
  },
  {
    title: "Unstable Unicorns",
    eyebrow: "Hidden movement",
    image: "/assets/token-unstable-unicorns.png",
    body: "Best for players who want misdirection, speed windows, and volatile utility.",
    bullets: [
      "+2 population.",
      "+1 food per 10 farmers.",
      "Transit army size is harder for enemies to read.",
      "Skill paths: Glitter Frontier, Veiled Network, Shattered Reality.",
    ],
  },
];

const seasonLoop: readonly WikiDiagramStep[] = [
  { label: "Register", detail: "Join the cycle, choose race, name fortress." },
  { label: "Test", detail: "Try systems before reset-sensitive active play." },
  { label: "Play", detail: `${ACTIVE_DURATION_HOURS / 24} active days decide the season.` },
  { label: "Resolve", detail: "Highest points win; tie goes to earliest final score." },
];

const pressureFlow: readonly WikiDiagramStep[] = [
  { label: "Assign", detail: "Put workers into race-flavored pressure." },
  { label: "Prioritize", detail: "Mark connected neutral border tiles." },
  { label: "Claim", detail: `${TILE_PRESSURE_CLAIM_THRESHOLD} pressure wins if there is no tie.` },
  { label: "Hold", detail: "Ownership pressure decays unless maintained." },
];

const convoyFlow: readonly WikiDiagramStep[] = [
  { label: "Offer", detail: "Gold, food, army, points, or allied tile deeds." },
  { label: "Accept", detail: "Cargo leaves sender immediately." },
  { label: "Travel", detail: "Minimum 6 hours plus route distance." },
  { label: "Arrive", detail: "Delivered value awards shared trade points." },
];

const campaignFlow: readonly WikiDiagramStep[] = [
  { label: "War", detail: "Hostile border and active war are required." },
  { label: "Campaign", detail: "Army builds pressure on a connected enemy tile." },
  { label: "Warning", detail: "A visible 12-hour siege warning opens." },
  { label: "Engage", detail: "Casualties tick until one side runs out." },
];

export const WIKI_PAGES: readonly WikiPage[] = [
  {
    slug: "getting-started",
    navLabel: "Start Here",
    navIcon: "01",
    title: "Start Here",
    subtitle:
      "The short version of Season 4: pick a race, build a queue, pressure land, then fight through plans instead of panic clicks.",
    heroImage: WIKI_BANNER_SRC,
    highlights: [
      "The season winner is the fortress with the most points when active play resolves.",
      "Home of A and loot camps are legacy-only in Season 4.",
      "Recruitment is paid up front, then recruiters process the queue.",
    ],
    sections: [
      {
        id: "first-minutes",
        eyebrow: "Opening",
        title: "First 15 minutes",
        body:
          "Your early goal is to stop wasting tempo: lock race identity, get workers assigned, start expansion pressure, and avoid spending every resource on one shiny mistake.",
        bullets: [
          "Choose race carefully; it is locked for the season.",
          "Assign miners, farmers, recruiters, and pressure workers from Castle.",
          `Order army when you can pay ${RECRUITMENT_COST_PER_UNIT} gold per unit, then keep recruiters assigned.`,
          "Prioritize connected neutral border tiles from the battlefield map.",
          "Use Politics and Trade before war so allies, convoys, and targets are clear.",
          `Keep gold for utility; rename alone costs ${ACTIVE_RENAME_COST} gold.`,
        ],
      },
      {
        id: "season-loop",
        eyebrow: "Cycle",
        title: "Season flow",
        diagram: seasonLoop,
      },
      {
        id: "ways-to-score",
        eyebrow: "Win condition",
        title: "How points are earned",
        table: {
          headers: ["Source", "What it means"],
          rows: [
            ["Tile income", "Owned biomes produce points each tick."],
            ["Road network", "Road-connected owned tiles add point income."],
            ["Neutral claims", "Claiming a neutral tile grants 5 bonus points."],
            ["Convoys", "Delivered cargo value creates shared trade points."],
            ["Interceptions", "Successful raids can score from stolen cargo."],
            ["Castle PvP", "Castle wins can transfer a small score slice when points exist."],
            ["Gold conversion", "Castle utility can convert gold into points."],
          ],
        },
      },
    ],
  },
  {
    slug: "races",
    navLabel: "Races",
    navIcon: "02",
    title: "Races",
    subtitle:
      "Each race is a season-long playstyle commitment with passive modifiers and three skill paths.",
    highlights: [
      "Skill points come from castle levels and owned normal territory.",
      "Maximum skill points: 12.",
      "A full skill branch costs 8 points, leaving 4 for other paths.",
    ],
    sections: [
      {
        id: "race-cards",
        eyebrow: "Identity",
        title: "Pick the fantasy you want to execute",
        cards: raceCards,
      },
      {
        id: "pressure-labels",
        eyebrow: "Flavor",
        title: "Pressure worker names",
        table: {
          headers: ["Race", "Pressure label", "Read"],
          rows: [
            ["Dwarfs", "Beer Culture", "Stubborn customs spread border control."],
            ["Orks", "Scavenge Mob", "Noise, scrap, and momentum claim space."],
            ["Space Murines", "Imperial Faith", "Doctrine projects frontier control."],
            ["Unstable Unicorns", "Glitter Distribution", "Wild magic bends nearby claims."],
          ],
        },
      },
      {
        id: "race-choice",
        eyebrow: "Advice",
        title: "Quick race choice",
        table: {
          headers: ["If you want to", "Start with"],
          rows: [
            ["Hold a defended economy", "Dwarfs"],
            ["Force fights and snowball tempo", "Orks"],
            ["Coordinate logistics and trade", "Space Murines"],
            ["Use speed, hidden reads, and volatility", "Unstable Unicorns"],
          ],
        },
      },
    ],
  },
  {
    slug: "economy",
    navLabel: "Economy",
    navIcon: "03",
    title: "Economy",
    subtitle:
      "Gold buys choices, food sustains active army, points win seasons, and idle workers are lost tempo.",
    highlights: [
      "Recruiters process paid queue; they do not mint free army from nothing.",
      `Active army upkeep is ${ARMY_UPKEEP_PER_UNIT} food per unit per tick.`,
      `Starvation removes ${Math.round(STARVATION_ATTRITION_RATE * 100)}% of active army per starving tick, minimum 1.`,
    ],
    sections: [
      {
        id: "worker-roles",
        eyebrow: "Workers",
        title: "Core production",
        table: {
          headers: ["Assignment", "Output", "Use"],
          rows: [
            ["Miners", "Gold income", "Recruitment, upgrades, utility, trade."],
            ["Farmers", "Food income", "Army upkeep and trade."],
            ["Recruiters", `${RECRUITMENT_RATE_PER_RECRUITER} queued unit per recruiter per tick`, "Turns paid queue into active army."],
            ["Pressure workers", "Border pressure", "Claim and maintain territory."],
          ],
        },
      },
      {
        id: "recruitment",
        eyebrow: "Army queue",
        title: "Buying and training army",
        diagram: [
          { label: "Order", detail: `${RECRUITMENT_COST_PER_UNIT} gold per unit is paid immediately.` },
          { label: "Queue", detail: "Queued units are not active and have no upkeep." },
          { label: "Train", detail: "Recruiters process the queue each tick." },
          { label: "Active", detail: "Finished units join army and begin food upkeep." },
        ],
      },
      {
        id: "upgrades",
        eyebrow: "Castle",
        title: "Upgrade costs",
        table: {
          headers: ["Target level", "Gold cost"],
          rows: FORTRESS_LEVEL_UP_COSTS.map((cost, index) => [
            `Level ${index + 2}`,
            `${cost}`,
          ]),
        },
      },
      {
        id: "arcade",
        eyebrow: "After season",
        title: "Arcade coin payout",
        body:
          `A completed season grants ${ARCADE_SEASON_BASE_COINS} base coins, plus 1 per ${ARCADE_SEASON_POINTS_BONUS_DIVISOR} points up to ${ARCADE_SEASON_POINTS_BONUS_CAP}. Top ranks add ${getArcadeSeasonRankBonus(1)}, ${getArcadeSeasonRankBonus(2)}, and ${getArcadeSeasonRankBonus(3)} coins.`,
      },
    ],
  },
  {
    slug: "expansion",
    navLabel: "Expansion",
    navIcon: "04",
    title: "Expansion",
    subtitle:
      "Season 4 territory is claimed with pressure, held with ownership pressure, and contested through war campaigns.",
    highlights: [
      `Neutral tile claim threshold: ${TILE_PRESSURE_CLAIM_THRESHOLD}.`,
      `Unsupported neutral pressure decays ${TILE_PRESSURE_DECAY_PERCENT_PER_HOUR}% per completed hour.`,
      `Ownership pressure ranges from 0 to ${MAX_OWNERSHIP_PRESSURE}.`,
    ],
    sections: [
      {
        id: "pressure-flow",
        eyebrow: "Claiming",
        title: "Pressure flow",
        image: "/assets/ui/crest-pressure.webp",
        diagram: pressureFlow,
      },
      {
        id: "ownership-pressure",
        eyebrow: "Holding",
        title: "Ownership pressure",
        bullets: [
          `Owned tiles decay by ${OWNERSHIP_PRESSURE_DECAY_PER_TICK} ownership pressure per tick.`,
          `Each maintenance worker restores ${OWNERSHIP_PRESSURE_MAINTENANCE_PER_WORKER} pressure per tick.`,
          `A guard cuts normal decay by ${Math.round(GUARD_DECAY_REDUCTION * 100)}%.`,
          `Below ${OWNERSHIP_PRESSURE_WARNING} pressure, the tile is in the warning band.`,
          "At 0 pressure, the tile becomes neutral.",
        ],
      },
      {
        id: "roads",
        eyebrow: "Movement",
        title: "Roads",
        body:
          `Marching armies, reinforcement routes, War Front launches, and delivered convoys build roads on their actual hex route. Roads reduce future movement ETA, but not the six-hour convoy minimum or one-hour PvP preparation delay. Roads decay ${Math.round(ROAD_DECAY_RATE_PER_HOUR * 100)}% per inactive hour.`,
        table: {
          headers: ["Road", "Crossings", "Speed multiplier"],
          rows: [
            [ROAD_LEVEL_NAMES[RoadLevel.DIRT], `${ROAD_THRESHOLDS[RoadLevel.DIRT]}`, `${ROAD_SPEED_BONUS[RoadLevel.DIRT]}x`],
            [ROAD_LEVEL_NAMES[RoadLevel.STONE], `${ROAD_THRESHOLDS[RoadLevel.STONE]}`, `${ROAD_SPEED_BONUS[RoadLevel.STONE]}x`],
            [ROAD_LEVEL_NAMES[RoadLevel.HIGHWAY], `${ROAD_THRESHOLDS[RoadLevel.HIGHWAY]}`, `${ROAD_SPEED_BONUS[RoadLevel.HIGHWAY]}x`],
          ],
        },
      },
    ],
  },
  {
    slug: "army",
    navLabel: "Army & War",
    navIcon: "05",
    title: "Army And War",
    subtitle:
      "Battalions give your army identity: modes decide what they try to do, stances decide how they behave when it matters.",
    highlights: [
      `New battalions start at ${DEFAULT_BATTALION_MAX_SIZE} max size.`,
      `Commission cost: ${BATTALION_COMMISSION_COST} gold.`,
      `Natural slots cap at ${MAX_NATURAL_SLOTS}; absolute cap is ${ABSOLUTE_MAX_BATTALIONS}.`,
    ],
    sections: [
      {
        id: "modes",
        eyebrow: "Automation",
        title: "Battalion modes",
        cards: [
          { title: "GUARD", image: "/assets/ui/crest-guard.webp", body: "Defends owned tiles and supports detection." },
          { title: "ATTACK", image: "/assets/ui/crest-campaign.webp", body: "Can be assigned to war fronts and auto-dispatches against reachable enemy tiles." },
          { title: "RESERVE", body: "Stays out of combat losses and recovers." },
          { title: "ALLIANCE", body: "Sends visible reinforcement marches to eligible allied defensive or attacking battlefields, using the War Room support policy." },
        ],
      },
      {
        id: "stances",
        eyebrow: "Posture",
        title: "Stances",
        table: {
          headers: ["Stance", "Effect"],
          rows: [
            ["FORTIFY", "+30% defense, -50% casualties taken, 1-hour lock."],
            ["PATROL", "Raid detection and response speed, but more casualties if attacked."],
            ["TRAINING", "+1 XP per tick for the lowest-tier battalion."],
            ["AMBUSH", "+40% first-round damage, 1-hour lock."],
            ["REST", "Morale and healing; cannot fight."],
            ["MOBILE", "Moving or on an order; no special modifier."],
          ],
        },
      },
      {
        id: "reinforcements",
        eyebrow: "Movement",
        title: "Reinforcements",
        bullets: [
          "New troops for a remote battalion march from the castle before they become usable.",
          "Pending battalion reinforcements reserve capacity so battalions do not overfill while troops travel.",
          "Battlefield reinforcements appear on the map with routes and ETA before they join the fight.",
        ],
      },
      {
        id: "tiers",
        eyebrow: "Progression",
        title: "Tier caps",
        table: {
          headers: ["Tier", "Max size"],
          rows: [
            ["Recruit", `${TIER_MAX_SIZES[0]}`],
            ["Regular", `${TIER_MAX_SIZES[1]}`],
            ["Veteran", `${TIER_MAX_SIZES[2]}`],
            ["Elite", `${TIER_MAX_SIZES[3]}`],
          ],
        },
      },
      {
        id: "morale",
        eyebrow: "Condition",
        title: "Morale and extra slots",
        bullets: [
          `Inspired morale starts at ${MORALE_THRESHOLDS.INSPIRED}.`,
          `Shaken morale starts below ${MORALE_THRESHOLDS.STEADY}; broken is below ${MORALE_THRESHOLDS.SHAKEN}.`,
          `Extra battalion slots cost ${EXTRA_SLOT_COSTS.join(", ")} gold.`,
          `Capacity expansion uses ${BATTALION_EXPAND_COST_PER_50} gold steps.`,
        ],
      },
    ],
  },
  {
    slug: "combat",
    navLabel: "Combat",
    navIcon: "06",
    title: "Combat",
    subtitle:
      "Season 4 combat is less about instant raids and more about visible commitments: war, campaigns, warnings, battlefields, and reports.",
    highlights: [
      "Equal power favors the defender.",
      "Campaign sieges warn before casualties begin.",
      "Battlefields resolve when one side runs out of committed army.",
    ],
    sections: [
      {
        id: "campaign-flow",
        eyebrow: "War front",
        title: "Campaign to siege",
        image: "/assets/ui/crest-campaign.webp",
        diagram: campaignFlow,
      },
      {
        id: "battlefield-rules",
        eyebrow: "Resolution",
        title: "How battlefields resolve",
        bullets: [
          "Campaigns target connected enemy border tiles during active war.",
          "A 12-hour siege warning gives defenders time to reinforce or react.",
          "Casualties tick over time and ramp upward during the first hour.",
          "Tile battlefields can transfer ownership to the winner.",
          "Castle wins can pay loot and a small score transfer when rewards exist.",
          "Reports and unread badges are for battle logs, not the total archive count.",
        ],
      },
      {
        id: "travel",
        eyebrow: "Movement",
        title: "Travel and visibility",
        bullets: [
          "Map distance, roads, race effects, and orders affect arrival timing.",
          "Baseline travel uses map speed from the game constants.",
          "Some race and stance effects change visibility or timing rather than raw attack power.",
        ],
      },
    ],
  },
  {
    slug: "diplomacy",
    navLabel: "Diplomacy",
    navIcon: "07",
    title: "Diplomacy",
    subtitle:
      "Alliances are backed by trust, betrayal has teeth, and peace locks create real breathing room.",
    highlights: [
      "Neutral fortresses can trade, ally, or move toward war.",
      "Trust tiers increase escrow, optional collateral raises the stakes, and allied deliveries improve.",
      "Detected covert raids create a 24-hour immediate-war window.",
    ],
    sections: [
      {
        id: "relations",
        eyebrow: "States",
        title: "Relation ladder",
        table: {
          headers: ["State", "Meaning"],
          rows: [
            ["NEUTRAL", "Default relation; trade, alliance proposals, or war setup are available."],
            ["ALLIANCE_PENDING", "A proposal, possibly with break collateral, is waiting for acceptance."],
            ["ALLIED", "Escrow is locked and allied trade can receive bonuses."],
            ["WAR_PENDING", "A war warning is active before normal hostilities."],
            ["WAR", "Campaigns and hostile orders are live."],
            ["PEACE_PENDING", "A peace offer, possibly with instant demands, is waiting for acceptance."],
            ["ENEMY", "Casus belli exists; immediate war can be invoked."],
          ],
        },
      },
      {
        id: "trust",
        eyebrow: "Alliances",
        title: "Trust and betrayal",
        bullets: [
          "Trust I escrows 2,000 gold and 2,000 food from each ally.",
          "Trust II raises each escrow to 10,000 gold and 10,000 food.",
          "Trust III raises each escrow to 30,000 gold and 30,000 food.",
          "Betrayal starts war immediately and gives escrow shares to the harmed ally.",
          "Optional alliance collateral is paid only if the alliance breaks; unpaid collateral becomes visible debt.",
          "Peace can demand gold, food, army, or a tile from either side and creates a 24-hour unbreakable period.",
        ],
      },
    ],
  },
  {
    slug: "trade",
    navLabel: "Trade",
    navIcon: "08",
    title: "Trade",
    subtitle:
      "Convoys turn diplomacy into map pressure: cargo travels, roads improve, escorts protect, and raiders hunt scored value.",
    highlights: [
      "Accepted trade creates one convoy leg per direction.",
      "Cargo is deducted from the sender immediately.",
      "Trade can move gold, food, army, score points, and allied tile deeds.",
    ],
    sections: [
      {
        id: "convoy-flow",
        eyebrow: "Logistics",
        title: "Convoy flow",
        diagram: convoyFlow,
      },
      {
        id: "convoy-rules",
        eyebrow: "Routes",
        title: "Trade rules",
        bullets: [
          "Trade offers expire after 24 hours.",
          "Convoy legs take at least 6 hours plus map travel time.",
          "Delivered base cargo value awards shared points.",
          "Allied trust bonuses add delivered gold and food, not extra trade points.",
          "If relations turn hostile before arrival, cargo can be seized without trade points.",
        ],
      },
      {
        id: "raids",
        eyebrow: "Interception",
        title: "Escorts, raids, and guards",
        bullets: [
          "Sender escorts protect outbound scored cargo.",
          "Raid orders watch non-allied routes for eligible cargo.",
          "A successful raid steals half the cargo, including traded score points.",
          "Raid patrols are managed from the Castle War Room; convoy escorts stay with outbound trade convoys.",
          "Guard patrols can detect raids and expose the raider as an enemy.",
          "Detected raids grant the victim 24 hours to invoke immediate war.",
        ],
      },
    ],
  },
  {
    slug: "abilities",
    navLabel: "Skills",
    navIcon: "09",
    title: "Skills",
    subtitle:
      "Season 4 uses race skill trees instead of legacy active-ability timing as the main race progression layer.",
    highlights: [
      "Maximum 12 skill points.",
      "Three paths per race, eight nodes per path.",
      "A full path costs 8 points.",
    ],
    sections: [
      {
        id: "skill-structure",
        eyebrow: "Progression",
        title: "How skills work",
        bullets: [
          "Earn +1 skill point per castle level starting at level 2.",
          "Earn +1 skill point per 3 owned normal tiles.",
          "Nodes usually start as small bonuses and build toward stronger capstones.",
          "Race-specific behavior should be intentional: read the path before spending.",
        ],
      },
      {
        id: "race-paths",
        eyebrow: "Paths",
        title: "Race skill paths",
        table: {
          headers: ["Race", "Path 1", "Path 2", "Path 3"],
          rows: [
            ["Dwarfs", "Bastion", "Seismic", "Grudgebearer"],
            ["Orks", "Marauder", "Siegebreaker", "WAAAGH Engine"],
            ["Space Murines", "Convoy Command", "Rapid Response", "Orbital Doctrine"],
            ["Unstable Unicorns", "Glitter Frontier", "Veiled Network", "Shattered Reality"],
          ],
        },
      },
    ],
  },
  {
    slug: "legacy",
    navLabel: "Legacy",
    navIcon: "10",
    title: "Legacy Systems",
    subtitle:
      "These systems may appear in old reports or code names, but they are not live Season 4 map targets.",
    highlights: [
      "No Home of A boss exists in live Season 4.",
      "Loot camps do not spawn in live Season 4.",
      "Historical reports remain readable; they do not enable current interactions.",
    ],
    sections: [
      {
        id: "retired-targets",
        eyebrow: "Season 4",
        title: "Retired PvE targets",
        image: "/assets/ui/crest-monument.webp",
        bullets: [
          "There is no live Home of A attack, reward, buff, respawn, holder drain, garrison defense, fortify action, or control income in Season 4.",
          "There are no live loot-camp spawns, final blows, or loot-camp rewards in Season 4.",
          "If old names appear in reports, they refer to archived season history or legacy compatibility.",
          "Current scoring should not count legacy boss damage as units killed or goblins killed.",
        ],
      },
    ],
  },
] as const;

export const WIKI_PAGE_SLUGS = WIKI_PAGES.map((page) => page.slug);

export function getWikiPage(slug: string) {
  return WIKI_PAGES.find((page) => page.slug === slug) ?? null;
}
