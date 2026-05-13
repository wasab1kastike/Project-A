import Link from "next/link";
import styles from "./page.module.css";
import {
  ACTIVE_RENAME_COST,
  ARCADE_SEASON_BASE_COINS,
  ARCADE_SEASON_POINTS_BONUS_CAP,
  ARCADE_SEASON_POINTS_BONUS_DIVISOR,
  ATTACK_UNIT_SPEED_PER_MINUTE,
  BASE_FORTRESS_ATTACK_DAMAGE,
  BASE_FORTRESS_GROWTH,
  FORTRESS_ATTACK_DAMAGE_PER_LEVEL,
  FORTRESS_GROWTH_PER_LEVEL,
  FORTRESS_LEVEL_UP_COSTS,
  HOME_OF_A_ARMY_DRAIN_BASE,
  HOME_OF_A_ARMY_DRAIN_INCREASE_PER_TICK,
  HOME_OF_A_NEUTRAL_DEFENSE,
  HOME_OF_A_POINT_INCOME,
  HOME_OF_A_TILE_ID,
  MAX_SIMULTANEOUS_ATTACKS_BASE,
  MEGA_FORTRESS_NAME,
  getArcadeSeasonRankBonus,
} from "@/lib/game/constants";
import {
  CARRY_CAPACITY_PER_SURVIVOR,
  DEFENSE_BONUS_PER_DISPLAYED_LEVEL,
  DEFENDER_LOSS_RATE_ON_ATTACKER_WIN,
  FAILED_ATTACK_DEFENDER_CASUALTY_FACTOR,
  MAX_FOOD_LOOT_PERCENT,
  MAX_POINT_LOOT_PERCENT,
  WINNING_ATTACKER_BASE_SURVIVAL_FACTOR,
  WINNING_ATTACKER_MARGIN_SURVIVAL_FACTOR,
} from "@/lib/game/balance";
import {
  ARMY_UPKEEP_PER_UNIT,
  RECRUITMENT_COST_PER_UNIT,
  RECRUITMENT_RATE_PER_RECRUITER,
  STARVATION_ATTRITION_RATE,
} from "@/lib/game/army-recruitment";
import {
  LOOT_CAMP_LIFETIME_MINUTES,
  LOOT_CAMP_MAX_SPAWNS_PER_HOUR,
  LOOT_CAMP_MAX_STRENGTH,
  LOOT_CAMP_MIN_SPAWNS_PER_HOUR,
  LOOT_CAMP_MIN_STRENGTH,
} from "@/lib/game/loot-camps";
import { RACE_DEFINITIONS } from "@/lib/game/races";
import {
  TEMPORARY_MAP_OBJECTIVE_INTERVAL_HOURS,
  TILE_CLAIM_DURATION_MINUTES,
  TILE_CLAIM_SEA_DURATION_MINUTES,
  TILE_CLAIM_MOUNTAINS_DURATION_MINUTES,
  TILE_CLAIM_OWNED_TILE_COST_STEP,
} from "@/lib/game/territory";

const RACE_ABILITY_NOTES: Record<string, readonly string[]> = {
  DWARFS: [
    "Tier 1 (3 mountains): Grudge Book unlocks. Pick or replace one enemy fortress and gain +25% attack and defense against that target in direct combat and tile battles.",
    "Tier 2 (6 mountains): Add a second grudge target or double your first target for a total x1.5 grudge multiplier against that one enemy.",
    "Deep Mining: once per Helsinki hour during active season. Commit 150-600 gold, then wait 10/20/30 minutes based on commitment size. Roll table favors gold, food, recruitment bursts, combat surge, army gains/losses, production halts, and partial gold loss. Rune suppression no longer comes from Deep Mining.",
    "Rune of Grudges: Tier 2 active ability (6 mountains). Pay 250 gold upfront and 25 gold per tick upkeep for up to 6 hours to raise an attackable Dwarf rune that suppresses a single enemy fortress until the rune dies or upkeep fails.",
  ],
  UNSTABLE_UNICORNS: [
    "Tier 1: Enemies cannot see your army size while your units are in transit.",
    "Tier 1+ (3 marsh/forest): Faster attack travel from Unicorn speed tech.",
    "Tier 1+ (3 marsh/forest): Claim one free teleport token per hour.",
    "Tier 2 (6 marsh/forest): Shattered Reality unlocks once per Helsinki day and rolls a random omen that can surge, scatter, or backfire armies.",
    "Using a free teleport leaves attackable decoy castles behind. For other players, decoys look like normal player fortresses. Decoys collapse when hit and can destroy part of the attacking army.",
  ],
  SPACE_MURINES: [
    "Tier 1+ (3 sea/coast): STIM unlocks (1 hour, once per Helsinki day). During STIM, your outgoing attacks keep all sent troops and attacks against you cause no defender losses.",
    "Tier 2+ (6 sea/coast): First Instant Recall each Helsinki hour returns immediately, losing 5% of sent troops, minimum 1.",
    `Attack slots scale as ${MAX_SIMULTANEOUS_ATTACKS_BASE} + 2 x castle level.`,
  ],
  ORKS: [
    "Scrap: ORKS earn Scrap from successful raids, tile battle wins, Home of A captures, and loot camp destruction.",
    "Boss Orders: spend Scrap and gold on one active short-term order at a time: More Dakka, Loot Wagons, or Patch Da Fort.",
    "Scrap-Fueled WAAAGH: while WAAAGH is active, spend Scrap once per investment to extend it, boost attack power, or improve Stronger Together.",
    "Tier 1: Stronger Together — 15% of killed defenders join your idle army after each successful raid.",
    "Tier 2+ (6 plains/lake): WAAAGH unlocks (once per day, lasts 1 hour) — x4 attack and defense power, 2x movement speed.",
    "Passive economy/combat identity: +6 carry capacity per surviving attacker, +1 army per 10 recruiters.",
  ],
};

const RACE_TIER_PATH = [
  "Tier 0: before active season starts or before controlling enough race tiles.",
  "Tier 1: control 3 race-biome tiles.",
  "Tier 2: control 6 race-biome tiles.",
  "Tier 3: control 9 race-biome tiles.",
  "Race biomes: Dwarfs mountains, ORKS plains/lake, Space Murines sea/coast, Unicorns marsh/forest.",
] as const;

const CASTLE_SPECIALIZATIONS = [
  "Mine: +10% gold production per pick.",
  "Food: +10% food production per pick.",
  "Military: +10% army production per pick.",
  "Defense: +10% PvP defending power per pick.",
] as const;

const ATTACK_MULTIPLIERS = [
  "Base PvP/PvE battle power: sent army x 1.",
  "ORKS WAAAGH (T2): x4 attack and defense power, 2x movement speed while active. Scrap can extend or intensify a current WAAAGH.",
  "Dwarf Grudge Book: x1.25 attack power against the chosen target.",
  "Dwarf tier 2 doubled grudge: x1.5 attack power against that target.",
] as const;

const PVP_FORMULAS = [
  "Attack power = sent army x active attack multiplier.",
  `Defense power = defending army x (1 + displayed castle level x ${Math.round(
    DEFENSE_BONUS_PER_DISPLAYED_LEVEL * 100
  )}% + race defense + Defense specialization picks x 10%) x active defense multiplier.`,
  "Attacker wins only when attack power is greater than defense power. Equal power is a defender win.",
  `Failed attacks lose all sent army. Defender losses on a failed attack are ceil((attack power / defense multiplier) x ${FAILED_ATTACK_DEFENDER_CASUALTY_FACTOR}).`,
] as const;

const PVE_FORMULAS = [
  `Fortress health damage per surviving hit = sent army x (${BASE_FORTRESS_ATTACK_DAMAGE} + attacker castle level x ${FORTRESS_ATTACK_DAMAGE_PER_LEVEL}).`,
  "Attacker castle level affects PvE health damage, not the initial army-vs-army battle power check.",
  "Loot camps first compare attack power against the camp defending army. If the attacker wins, the camp loses health.",
  `${MEGA_FORTRESS_NAME} is conquered through the center map tile as a timed control battle that starts against ${HOME_OF_A_NEUTRAL_DEFENSE} neutral defense.`,
] as const;

const homeOfALore =
  "Home of A is the center-map control point. Banners fight over it through timed tile battles, and the controlling alliance earns points every tick while each holder also bleeds army to keep the banner planted.";

const SEASON_FLOW = [
  {
    phase: "Registration (24h)",
    description:
      "Join the cycle, pick your identity, and claim your fortress before the season machine wakes up.",
  },
  {
    phase: "Testing (24h)",
    description:
      "Sandbox mode: test workers, race picks, and attacks. Progress resets before real combat.",
  },
  {
    phase: "Active season (2 weeks)",
    description:
      "Real economy, real raids, real grudges. If it explodes here, it counts.",
  },
  {
    phase: "Resolution",
    description:
      "Winner is locked, wishes move forward, and the next cycle is prepared.",
  },
] as const;

const QUICKSTART_STEPS = [
  "Pick a race that matches your style: stable economy, burst combat, or chaos utility.",
  "Open Castle > Economy and assign workers immediately. Idle population is wasted tempo.",
  `Recruit army from the Castle page when you are ready to spend gold. Each unit costs ${RECRUITMENT_COST_PER_UNIT} gold up front and waits in your queue.`,
  "Keep recruiters assigned if you want queued army to finish quickly. Recruiters process the queue; they do not mint free army by themselves.",
  "Watch the map for temporary loot camps. They expire fast but can pay food, gold, or army.",
  "Scout your first target before sending a huge army. Ties go to defender.",
  "Do not spend all gold on one thing. Keep a reserve for rename and upgrades.",
  "Watch the center tile. Home of A income can swing a close season.",
] as const;

const SEASON_START_STEPS = [
  "Pick your race early. Race is locked for the whole season, so your first choice defines your economy and combat style.",
  "Claim connected neutral land as soon as you can. Tile claims take 10 minutes and must connect to your castle or owned territory.",
  "Spend enough gold to get army rolling, then keep recruiters assigned so queued units finish on time.",
  "Use battlefields for contested land and Home of A. Those targets are fought, not claimed, and reinforcements also count toward your outbound cap.",
  "Expect defender wins on equal power. If a fight looks even, the defender keeps the tile or fortress.",
] as const;

const WHAT_IS_NEW_THIS_SEASON = [
  "Race choice is now a real season-start decision: pick once, then build around it.",
  "Neutral land claims are timed projects, so expansion is a short planning step rather than an instant click.",
  "Direct attacks and battlefield reinforcements share the same outbound attack limit.",
  "Battlefield sends now feel like real unit launches instead of abstract joins.",
  "Home of A is still the center control objective, but it is conquered through battle rather than a normal claim.",
] as const;

const RACE_TOKENS = [
  {
    key: "DWARFS",
    tokenSrc: "/assets/token-dwarf.png",
    role: "Fortified economy",
    opening:
      "Slow, stubborn, and excellent at turning nearby land into a defended income base.",
  },
  {
    key: "UNSTABLE_UNICORNS",
    tokenSrc: "/assets/token-unstable-unicorns.png",
    role: "Hidden movement",
    opening:
      "Fast pressure, fakeouts, and teleport tricks. Great if you like making the map feel unsafe.",
  },
  {
    key: "SPACE_MURINES",
    tokenSrc: "/assets/token-space-murines.png",
    role: "Disciplined strikes",
    opening:
      "Reliable combat windows, stronger attack capacity, and clean extraction tools.",
  },
  {
    key: "ORKS",
    tokenSrc: "/assets/token-orks.png",
    role: "Scrap tempo",
    opening:
      "Win fights, bank Scrap, and convert momentum into Boss Orders and WAAAGH pressure.",
  },
] as const;

const MAP_LEGEND = [
  {
    label: "Claimable",
    tone: "claimable",
    description: "Neutral connected land you can start claiming.",
  },
  {
    label: "Owned",
    tone: "owned",
    description: "Your territory, paying its tile bonus each tick.",
  },
  {
    label: "Contested",
    tone: "contested",
    description: "A tile or fortress currently being fought over.",
  },
  {
    label: "Battlefield",
    tone: "battlefield",
    description: "A fight players can reinforce from either side.",
  },
  {
    label: "Home of A",
    tone: "home",
    description: "Center objective. Always fought for, never claimed.",
  },
] as const;

const LOOT_CAMP_VARIANTS = [
  "Classic Loot Camp: pays mostly food, some gold, and only a token point reward.",
  "Rich Loot Camp: pays mostly gold with some food and very few points.",
  "Chaos Loot Camp: pays army, supplies, and resets the destroyer's current race ability cooldown.",
] as const;

const RECRUITMENT_RULES = [
  `Recruitment orders cost ${RECRUITMENT_COST_PER_UNIT} gold per army unit and are paid up front.`,
  "Ordered units enter your recruitment queue. They are not active army yet and cannot attack or defend until completed.",
  `Each assigned recruiter processes ${RECRUITMENT_RATE_PER_RECRUITER} queued unit per tick before race and specialization bonuses.`,
  `Active army upkeep is ${ARMY_UPKEEP_PER_UNIT} food per unit per tick, rounded down to whole food when the tick saves.`,
  `If food cannot cover that upkeep, food falls to zero and active army loses ${Math.round(STARVATION_ATTRITION_RATE * 100)}% that tick.`,
  "Queued army has no upkeep. Food pressure begins only after units finish and join your active army.",
  "If you assign zero recruiters, the queue waits. If the queue is empty, recruiters add no army.",
] as const;

const BATTLEFIELD_RULES = [
  `Direct attacks and battlefield reinforcements share the same outbound cap: base ${MAX_SIMULTANEOUS_ATTACKS_BASE}, modified by castle level and race.`,
  "Joining a battlefield sends a visible unit toward that battle and reserves the army while it travels.",
  "Fortifying an owned tile sends idle army there as a visible movement; once it arrives, that garrison defends the tile until recalled or killed.",
  "A player cannot join both sides of the same unresolved battlefield.",
  "Equal attack and defense power still counts as a defender win.",
  "Resolved tile battlefields can transfer tile ownership to the winning side.",
  "Owned-tile and Home of A defenders get the tile's native bonus, and Dwarf defenders get an extra x1.25 defensive multiplier on those fights.",
  "Battle results are applied after economy persistence, so loot, casualties, and rewards should not be lost to the same tick's production update.",
  "The battle log badge shows reports you have not seen yet, not the total report archive.",
] as const;

const TILE_CONTROL_RULES = [
  `Neutral tiles are acquired through a claim project: ${TILE_CLAIM_DURATION_MINUTES} min for most biomes, ${TILE_CLAIM_MOUNTAINS_DURATION_MINUTES} min for mountains, and ${TILE_CLAIM_SEA_DURATION_MINUTES} min for sea tiles.`,
  "Each fortress can run only one active neutral tile acquisition project at a time.",
  "A neutral tile must be connected to your castle tile or your existing owned territory before you can claim it.",
  `Claim cost starts at 25 gold, scales with distance, adds biome premiums, and increases by ${TILE_CLAIM_OWNED_TILE_COST_STEP} gold per owned or pending tile.`,
  `Temporary map objectives rotate every ${TEMPORARY_MAP_OBJECTIVE_INTERVAL_HOURS} hours and add bonus point income to selected normal tiles while active.`,
  "Home of A cannot be claimed. It must be attacked through the center tile and held through battlefield control.",
] as const;

const FAQ_ENTRIES = [
  {
    question: "Why did my attack fail even with a big army?",
    answer:
      "Defender power includes castle defense multipliers. Equal power is still a defender win, so close calls usually punish the attacker.",
  },
  {
    question: "Why can I not change race now?",
    answer:
      "Race is a once-per-season lock. The game remembers your choice even if your memory does not.",
  },
  {
    question: "Why did my location suddenly change?",
    answer:
      "Unicorn teleport temporarily moves the fortress for 1 hour, then returns it home. Home of A stays fixed at the center.",
  },
  {
    question: "What is the safest beginner mistake to avoid?",
    answer:
      "Sending everything in one heroic raid without checking defender strength. Heroic speeches are free, armies are not.",
  },
] as const;

const GLOSSARY = [
  "Tick: the minute-based game update that applies growth, combat, and state transitions.",
  "Buff tier: race power stage (T2/T3) unlocked by active-season timing.",
  "Claim project: the timed neutral-tile acquisition job that reserves gold until the tile finishes transferring.",
  "Returned: surviving attackers that come home after a winning raid.",
  "Decoy: temporary attackable Unicorn teleport remnant left at the home tile.",
  "Loot camp: temporary NPC target with strength-based HP and variant rewards.",
] as const;

export default function WikiPage() {
  return (
    <main className={styles.page}>
      <section className={styles.hero}>
        <div className={styles.heroCopy}>
          <p className={styles.eyebrow}>Project A wiki</p>
          <h1>Races, castles, Home of A, and combat basics.</h1>
          <p>
            This page is a player-facing guide to what matters most during a
            season: race identity, upgrade choices, the boss objective, and how
            raid outcomes are resolved.
          </p>
        </div>

        <div className={styles.navRow}>
          <Link className={styles.linkButton} href="/">
            Back to battlefield
          </Link>
          <Link className={styles.linkButton} href="/history">
            Open cycle archive
          </Link>
        </div>
      </section>

      <section className={styles.stack}>
        <article className={styles.card}>
          <span className={styles.sectionLabel}>Season start</span>
          <h2>What to do in the first few minutes</h2>
          <p>
            The opening of a season is about locking in your identity, getting
            your economy online, and expanding into nearby land before the map
            gets crowded.
          </p>
          <div className={styles.twoCol}>
            <section>
              <h3>Season-start checklist</h3>
              <ul className={styles.noteList}>
                {SEASON_START_STEPS.map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ul>
            </section>
            <section>
              <h3>What&apos;s new this season</h3>
              <ul className={styles.noteList}>
                {WHAT_IS_NEW_THIS_SEASON.map((entry) => (
                  <li key={entry}>{entry}</li>
                ))}
              </ul>
            </section>
          </div>
        </article>

        <article className={styles.card}>
          <span className={styles.sectionLabel}>Race tokens</span>
          <h2>Pick the fantasy you want to play</h2>
          <p>
            Each race is a season-long commitment. Use these tokens as the fast
            read, then scroll down for exact bonuses and active abilities.
          </p>
          <div className={styles.tokenGrid}>
            {RACE_TOKENS.map((token) => {
              const race = RACE_DEFINITIONS.find(
                (definition) => definition.key === token.key
              );

              if (!race) {
                return null;
              }

              return (
                <section className={styles.tokenCard} key={token.key}>
                  <div className={styles.tokenFrame}>
                    <img src={token.tokenSrc} alt="" />
                  </div>
                  <div>
                    <span className={styles.tokenRole}>{token.role}</span>
                    <h3>{race.displayName}</h3>
                    <p>{token.opening}</p>
                  </div>
                </section>
              );
            })}
          </div>
        </article>

        <article className={styles.card}>
          <span className={styles.sectionLabel}>Map legend</span>
          <h2>Claim, hold, contest</h2>
          <p>
            The map has two different verbs: claim neutral connected land, or
            fight over owned land and special objectives.
          </p>
          <div className={styles.legendGrid}>
            {MAP_LEGEND.map((entry) => (
              <section className={styles.legendItem} key={entry.label}>
                <span
                  aria-hidden="true"
                  className={`${styles.legendMark} ${
                    styles[`legendMark${entry.tone}`]
                  }`}
                />
                <div>
                  <h3>{entry.label}</h3>
                  <p>{entry.description}</p>
                </div>
              </section>
            ))}
          </div>
        </article>

        <article className={styles.card}>
          <span className={styles.sectionLabel}>Patch notes</span>
          <h2>Recent changes live there now</h2>
          <p>
            This wiki is the stable rulebook. Patch notes carry the longer
            change history when you want to see what moved between deploys.
          </p>
          <div className={styles.navRow}>
            <Link className={styles.linkButton} href="/patch-notes">
              Open patch notes
            </Link>
          </div>
        </article>

        <article className={styles.card}>
          <span className={styles.sectionLabel}>Season loop</span>
          <h2>How a full cycle flows</h2>
          <p>
            If you only remember one thing: prepare in registration/testing,
            execute in active season, and review in resolution.
          </p>
          <ol className={styles.noteList}>
            {SEASON_FLOW.map((step) => (
              <li key={step.phase}>
                <strong>{step.phase}</strong>: {step.description}
              </li>
            ))}
          </ol>
        </article>

        <article className={styles.card}>
          <span className={styles.sectionLabel}>Goal and victory</span>
          <h2>How to win the season</h2>
          <p>
            The main goal is to end the active season with the most points.
            Points come from map objectives: owned tiles and{" "}
            {MEGA_FORTRESS_NAME} center control. Gold is the castle currency for
            upgrades, rename, claims, and utility costs.
          </p>
          <div className={styles.twoCol}>
            <section>
              <h3>Victory rules</h3>
              <ul className={styles.noteList}>
                <li>
                  The winner is the fortress with the highest point total when
                  the active season resolves.
                </li>
                <li>
                  If players tie on points, the winner is the tied fortress that
                  reached that final score first.
                </li>
                <li>
                  Capturing {MEGA_FORTRESS_NAME} is not required to win, but its
                  center income can swing the score race.
                </li>
              </ul>
            </section>
            <section>
              <h3>Rewards</h3>
              <ul className={styles.noteList}>
                <li>
                  The recorded winner can submit one bounded winner request
                  after the cycle resolves.
                </li>
                <li>
                  The community can also propose and vote on a community wish
                  after the season.
                </li>
                <li>
                  Season arcade coins: {ARCADE_SEASON_BASE_COINS} base, plus 1
                  per {ARCADE_SEASON_POINTS_BONUS_DIVISOR} points up to{" "}
                  {ARCADE_SEASON_POINTS_BONUS_CAP}, plus rank bonuses for the
                  top finishers ({getArcadeSeasonRankBonus(1)}/
                  {getArcadeSeasonRankBonus(2)}/{getArcadeSeasonRankBonus(3)}).
                </li>
              </ul>
            </section>
          </div>
        </article>

        <article className={styles.card}>
          <span className={styles.sectionLabel}>Quickstart</span>
          <h2>First 15 minutes checklist</h2>
          <p>
            Use this when the season starts and your brain is still loading in.
          </p>
          <ol className={styles.noteList}>
            {QUICKSTART_STEPS.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        </article>

        <article className={styles.card}>
          <span className={styles.sectionLabel}>Races</span>
          <h2>Identity, lore, and buffs</h2>
          <p>
            Pick one race per season. The choice is locked for the cycle and
            defines your passive economy/combat profile plus tier-based race
            actions.
          </p>
          <ul className={styles.noteList}>
            {RACE_TIER_PATH.map((entry) => (
              <li key={entry}>{entry}</li>
            ))}
          </ul>
          <div className={styles.raceGrid}>
            {RACE_DEFINITIONS.map((race) => (
              <section className={styles.raceCard} key={race.key}>
                <div className={styles.raceHeader}>
                  <strong>{race.displayName}</strong>
                  <span>{race.iconPlaceholder}</span>
                </div>
                <p className={styles.quote}>{race.flavorQuote}</p>
                <p>{race.flavorText}</p>
                <ul className={styles.noteList}>
                  {race.passiveSummary.map((entry) => (
                    <li key={entry}>{entry}</li>
                  ))}
                  {(RACE_ABILITY_NOTES[race.key] ?? []).map((entry) => (
                    <li key={entry}>{entry}</li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        </article>

        <article className={styles.card}>
          <span className={styles.sectionLabel}>Castle</span>
          <h2>Leveling and specialization</h2>
          <p>
            Castle upgrades are available during gameplay. Each upgrade can be
            mapped to a building role on the castle page.
          </p>
          <div className={styles.twoCol}>
            <section>
              <h3>Level effects</h3>
              <ul className={styles.noteList}>
                <li>
                  Base growth per tick: {BASE_FORTRESS_GROWTH}, plus{" "}
                  {FORTRESS_GROWTH_PER_LEVEL} per castle level.
                </li>
                <li>
                  Base attack damage to fortress HP:{" "}
                  {BASE_FORTRESS_ATTACK_DAMAGE}, plus{" "}
                  {FORTRESS_ATTACK_DAMAGE_PER_LEVEL} per castle level.
                </li>
                <li>
                  Castle level increases PvE fortress HP damage, but does not
                  increase PvP attack power.
                </li>
                <li>
                  Standard simultaneous attack slots start at{" "}
                  {MAX_SIMULTANEOUS_ATTACKS_BASE}.
                </li>
              </ul>
            </section>
            <section>
              <h3>Upgrade costs</h3>
              <ol className={styles.noteList}>
                {FORTRESS_LEVEL_UP_COSTS.map((cost, index) => (
                  <li key={cost}>
                    Level {index + 2}: {cost} gold
                  </li>
                ))}
              </ol>
            </section>
          </div>
          <section className={styles.subCard}>
            <h3>Specializations</h3>
            <ul className={styles.noteList}>
              {CASTLE_SPECIALIZATIONS.map((entry) => (
                <li key={entry}>{entry}</li>
              ))}
            </ul>
          </section>
          <section className={styles.subCard}>
            <h3>Active-season utility costs</h3>
            <ul className={styles.noteList}>
              <li>Rename costs {ACTIVE_RENAME_COST} gold.</li>
              <li>
                Manual Castle Yeet now starts from the Battlefield map and costs
                gold to relocate your castle to a chosen spawnable tile.
              </li>
              <li>
                Unicorn teleport remains available through race abilities and
                returns home after 1 hour.
              </li>
            </ul>
          </section>
        </article>

        <article className={styles.card}>
          <span className={styles.sectionLabel}>Recruitment</span>
          <h2>Buying and training army</h2>
          <p>
            Recruiters are now queue workers, not passive army printers. Spend
            gold when you want more troops, then use recruiter assignments to
            decide how quickly those orders become active army.
          </p>
          <div className={styles.twoCol}>
            <section>
              <h3>Queue rules</h3>
              <ul className={styles.noteList}>
                {RECRUITMENT_RULES.map((entry) => (
                  <li key={entry}>{entry}</li>
                ))}
              </ul>
            </section>
            <section>
              <h3>Practical advice</h3>
              <ul className={styles.noteList}>
                <li>
                  Buy in batches you can afford without emptying all upgrade and
                  tile-claim gold.
                </li>
                <li>
                  Raise recruiter assignments before large orders if you need a
                  predictable completion time.
                </li>
                <li>
                  Watch food before a large queue completes. Upkeep starts when
                  troops become active.
                </li>
                <li>
                  Military specialization and race bonuses improve recruitment
                  throughput, which is strongest when you keep a queue stocked.
                </li>
              </ul>
            </section>
          </div>
        </article>

        <article className={styles.card}>
          <span className={styles.sectionLabel}>Loot camps</span>
          <h2>Temporary map targets</h2>
          <p>
            Loot camps are neutral NPC camps that appear during testing and
            active gameplay. They are side objectives for players who can spare
            an attack slot, but they now defend themselves.
          </p>
          <div className={styles.twoCol}>
            <section>
              <h3>Spawn rules</h3>
              <ul className={styles.noteList}>
                <li>
                  {LOOT_CAMP_MIN_SPAWNS_PER_HOUR}-
                  {LOOT_CAMP_MAX_SPAWNS_PER_HOUR} camps are scheduled each hour
                  and spread across that hour.
                </li>
                <li>
                  Each camp stays for up to {LOOT_CAMP_LIFETIME_MINUTES}{" "}
                  minutes.
                </li>
                <li>
                  Strength is random from {LOOT_CAMP_MIN_STRENGTH} to{" "}
                  {LOOT_CAMP_MAX_STRENGTH}; strength is both HP and reward
                  amount.
                </li>
                <li>
                  Defending army scales by variant: Classic is light, Rich is
                  medium, and Chaos is the toughest.
                </li>
              </ul>
            </section>
            <section>
              <h3>Rewards</h3>
              <ul className={styles.noteList}>
                {LOOT_CAMP_VARIANTS.map((entry) => (
                  <li key={entry}>{entry}</li>
                ))}
                <li>
                  Only the attack that drops the camp to 0 HP receives the
                  reward.
                </li>
              </ul>
            </section>
          </div>
        </article>

        <article className={styles.card}>
          <span className={styles.sectionLabel}>Tiles</span>
          <h2>Claims, objectives, and territory pressure</h2>
          <p>
            Territory grows through timed claim projects, rotating point
            objectives, and control battles over valuable hexes.
          </p>
          <div className={styles.twoCol}>
            <section>
              <h3>Claim rules</h3>
              <ul className={styles.noteList}>
                {TILE_CONTROL_RULES.map((entry) => (
                  <li key={entry}>{entry}</li>
                ))}
              </ul>
            </section>
            <section>
              <h3>What owned tiles do</h3>
              <ul className={styles.noteList}>
                <li>
                  Tile bonuses come from biome and can include gold, food, army,
                  defense, or temporary objective points.
                </li>
                <li>
                  Forest and hills are better defensive holds, while marsh tiles
                  are the main army-income biome.
                </li>
                <li>
                  Owned tiles can be fortified, attacked, reinforced, and
                  transferred when their battlefield resolves.
                </li>
                <li>
                  Fortified garrisons stay on the tile without maintenance drain
                  and can be partially recalled, with surviving troops marching
                  home.
                </li>
                <li>
                  The selected tile panel shows current owner, bonus, claim
                  status, contest state, and action limits.
                </li>
              </ul>
            </section>
          </div>
        </article>

        <article className={styles.card}>
          <span className={styles.sectionLabel}>Home of A</span>
          <h2>Center control objective</h2>
          <p>{homeOfALore}</p>
          <ul className={styles.noteList}>
            <li>Always sits on center tile {HOME_OF_A_TILE_ID}.</li>
            <li>
              First capture fights neutral defense strength{" "}
              {HOME_OF_A_NEUTRAL_DEFENSE}.
            </li>
            <li>
              The controlling banner alliance earns {HOME_OF_A_POINT_INCOME}{" "}
              points per tick.
            </li>
            <li>
              Banner owner gets half the income; the rest is split by capture
              army contribution.
            </li>
            <li>
              Every active Home of A holder starts at -
              {HOME_OF_A_ARMY_DRAIN_BASE} army per tick, then loses{" "}
              {HOME_OF_A_ARMY_DRAIN_INCREASE_PER_TICK} more army per tick for
              each tick held.
            </li>
            <li>
              Recalling Home of A holding army reduces that fortress&apos;s
              holder contribution; once no holding army remains, it leaves the
              holder list and stops paying holder drain.
            </li>
          </ul>
        </article>

        <article className={styles.card}>
          <span className={styles.sectionLabel}>Combat</span>
          <h2>How raids resolve</h2>
          <p>
            Combat is split between direct attacks, battlefield joins, and tile
            control fights. The important part is that the send is visible, tied
            fights favor the defender, and battlefields can move the map as well
            as the army count.
          </p>
          <div className={styles.twoCol}>
            <section>
              <h3>PvP power check</h3>
              <ul className={styles.noteList}>
                <li>
                  Units travel using map distance and speed (
                  {ATTACK_UNIT_SPEED_PER_MINUTE} tiles/min baseline).
                </li>
                {PVP_FORMULAS.map((entry) => (
                  <li key={entry}>{entry}</li>
                ))}
              </ul>
            </section>
            <section>
              <h3>Attack multipliers</h3>
              <ul className={styles.noteList}>
                {ATTACK_MULTIPLIERS.map((entry) => (
                  <li key={entry}>{entry}</li>
                ))}
                <li>
                  Space Murine STIM changes casualties and defender losses, but
                  does not increase attack power.
                </li>
                <li>
                  Unstable Unicorn speed changes travel time and visibility, not
                  attack power.
                </li>
              </ul>
            </section>
          </div>
          <div className={styles.twoCol}>
            <section>
              <h3>PvE health damage</h3>
              <ul className={styles.noteList}>
                {PVE_FORMULAS.map((entry) => (
                  <li key={entry}>{entry}</li>
                ))}
              </ul>
            </section>
            <section>
              <h3>Battlefields and logs</h3>
              <ul className={styles.noteList}>
                {BATTLEFIELD_RULES.map((entry) => (
                  <li key={entry}>{entry}</li>
                ))}
                <li>
                  Battlefields are where players defend or contest a target
                  instead of trying to claim it as neutral land.
                </li>
              </ul>
            </section>
          </div>
          <div className={styles.twoCol}>
            <section>
              <h3>Survivors and loot</h3>
              <ul className={styles.noteList}>
                <li>
                  On attacker win, defender loses about{" "}
                  {Math.round(DEFENDER_LOSS_RATE_ON_ATTACKER_WIN * 100)}% of
                  defending army.
                </li>
                <li>
                  Winner survivor model uses base + margin factors (
                  {WINNING_ATTACKER_BASE_SURVIVAL_FACTOR} and{" "}
                  {WINNING_ATTACKER_MARGIN_SURVIVAL_FACTOR}).
                </li>
                <li>Surviving attackers return home after a win.</li>
                <li>
                  Survivors carry {CARRY_CAPACITY_PER_SURVIVOR} loot each before
                  race bonuses.
                </li>
                <li>
                  Loot caps: up to {Math.round(MAX_POINT_LOOT_PERCENT * 100)}%
                  of target gold and {Math.round(MAX_FOOD_LOOT_PERCENT * 100)}%
                  of target food per raid.
                </li>
                <li>
                  Armies can be recalled before impact. Recalled units travel
                  back home and create a separate return report when they
                  arrive.
                </li>
              </ul>
            </section>
          </div>
        </article>

        <article className={styles.card}>
          <span className={styles.sectionLabel}>FAQ</span>
          <h2>Common battlefield confusion</h2>
          <div className={styles.raceGrid}>
            {FAQ_ENTRIES.map((entry) => (
              <section className={styles.raceCard} key={entry.question}>
                <h3>{entry.question}</h3>
                <p>{entry.answer}</p>
              </section>
            ))}
          </div>
          <section className={styles.subCard}>
            <h3>Mini glossary</h3>
            <ul className={styles.noteList}>
              {GLOSSARY.map((entry) => (
                <li key={entry}>{entry}</li>
              ))}
            </ul>
          </section>
        </article>
      </section>
    </main>
  );
}
