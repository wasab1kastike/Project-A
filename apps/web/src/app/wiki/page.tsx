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
  HOME_OF_A_POINT_INCOME,
  HOME_OF_A_TILE_ID,
  MAX_SIMULTANEOUS_ATTACKS_BASE,
  MEGA_FORTRESS_HEALTH,
  MEGA_FORTRESS_NAME,
  getArcadeSeasonRankBonus,
} from "@/lib/game/constants";
import {
  ATTACKER_RETIREMENT_RATE,
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
} from "@/lib/game/army-recruitment";
import {
  LOOT_CAMP_LIFETIME_MINUTES,
  LOOT_CAMP_MAX_SPAWNS_PER_HOUR,
  LOOT_CAMP_MAX_STRENGTH,
  LOOT_CAMP_MIN_SPAWNS_PER_HOUR,
  LOOT_CAMP_MIN_STRENGTH,
} from "@/lib/game/loot-camps";
import { RACE_DEFINITIONS } from "@/lib/game/races";

const RACE_ABILITY_NOTES: Record<string, readonly string[]> = {
  DWARFS: [
    "Tier 2+: Grudge Book unlocks. Pick or replace one enemy fortress and gain +25% attack and defense against that target in direct combat and tile battles.",
    "Tier 3: Add a second grudge target or double your first target (x2 grudge multiplier).",
    "Deep Mining: once per Helsinki hour during active season. Commit 150-600 gold, then wait 10/20/30 minutes based on commitment size. Roll table favors gold, food, recruitment bursts, combat surge, army gains/losses, production halts, and partial gold loss. Rune suppression no longer comes from Deep Mining.",
    "Rune of Grudges: Tier 3 active ability. Pay 250 gold upfront and 25 gold per tick upkeep for up to 6 hours to raise an attackable Dwarf rune that suppresses a single enemy fortress until the rune dies or upkeep fails.",
  ],
  UNSTABLE_UNICORNS: [
    "Tier 1: Enemies cannot see your army size while your units are in transit.",
    "Tier 1+: Faster attack travel from Unicorn speed tech.",
    "Tier 2+: Claim one free teleport token per hour.",
    "Using a free teleport leaves attackable decoy castles behind. For other players, decoys look like normal player fortresses. Decoys collapse when hit and can destroy part of the attacking army.",
  ],
  SPACE_MURINES: [
    "Tier 2+: STIM unlocks (1 hour, once per Helsinki day). During STIM, your outgoing attacks keep all sent troops and attacks against you cause no defender losses.",
    "Tier 3+: First Instant Recall each Helsinki hour returns immediately, losing 5% of sent troops, minimum 1.",
    `Attack slots scale as ${MAX_SIMULTANEOUS_ATTACKS_BASE} + 2 x castle level.`,
  ],
  ORKS: [
    "Scrap: ORKS earn Scrap from successful raids, tile battle wins, Home of A captures, and loot camp destruction.",
    "Boss Orders: spend Scrap and gold on one active short-term order at a time: More Dakka, Loot Wagons, or Patch Da Fort.",
    "Scrap-Fueled WAAAGH: while WAAAGH is active, spend Scrap once per investment to extend it, boost attack power, or improve Stronger Together.",
    "Tier 1: Stronger Together — 15% of killed defenders join your idle army after each successful raid.",
    "Tier 3+: WAAAGH unlocks (once per day, lasts 1 hour) — x4 attack and defense power, 2x movement speed.",
    "Passive economy/combat identity: +6 carry capacity per surviving attacker, +1 army per 10 recruiters.",
  ],
};

const CASTLE_SPECIALIZATIONS = [
  "Mine: +10% gold production per pick.",
  "Food: +10% food production per pick.",
  "Military: +10% army production per pick.",
  "Defense: +10% PvP defending power per pick.",
] as const;

const ATTACK_MULTIPLIERS = [
  "Base PvP/PvE battle power: sent army x 1.",
  "ORKS WAAAGH (T3): x4 attack and defense power, 2x movement speed while active. Scrap can extend or intensify a current WAAAGH.",
  "Dwarf Grudge Book: x1.25 attack power against the chosen target.",
  "Dwarf tier 3 doubled grudge: x1.5 attack power against that target.",
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
  `${MEGA_FORTRESS_NAME} is conquered through the center map tile as a timed control battle.`,
] as const;

const homeOfALore =
  "Home of A is the center-map control point. Banners fight over it through timed tile battles, and the controlling alliance earns points every tick.";

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
    phase: "Active season (72h)",
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

const LATEST_UPDATES = [
  "Dwarfs now play as a fortified economy race: slower movement, stronger owned-tile defense, a better grudge book, deliberate Rune of Grudges pressure, and a delayed gold-funded Deep Mining gamble.",
  "Army recruitment is now order-based: buy units with gold, wait for recruiters to process the queue, then pay food upkeep only after units become active.",
  "Recruiter worker previews now show queue throughput and active-army upkeep instead of implying passive free army production.",
  "Desktop tile selection now uses the same direct click/tap behavior as mobile, so PC players can inspect and buy tiles from the map.",
  "Battle-log badges now count unread/new reports only instead of every historical entry.",
  "Battlefield reinforcements now obey the same simultaneous outbound attack cap as direct attacks.",
  "Battlefield rewards, casualties, loot, and tile transfers now persist after economy ticks instead of being overwritten by stale production writes.",
  "Loot camps now stay on the battlefield for 30 minutes, show clearer reward/strength/defender info, and fight back with variant-scaled defending armies.",
  "Loot camps now spawn around the battlefield during gameplay. Classic camps pay food, Rich camps pay gold, and Chaos camps pay army plus a race cooldown reset.",
  "Unstable Unicorn teleport now lasts 1 hour, leaves an attackable decoy at home, then returns the castle on the first tick after the timer ends.",
  "Unicorn decoys now mimic normal player fort visuals for other players.",
  "Orks now earn Scrap from fighting, spend it on Boss Orders, and can feed an active WAAAGH for extra pressure.",
  "Space Murines keep STIM at Tier 2, while Instant Recall is a separate Tier 3 unlock.",
  "Attack recall and return reports are more explicit, so recalled armies and post-raid returning units are easier to track.",
  "Raid loot caps are now 70% of target gold and 70% of target food per raid.",
] as const;

const LOOT_CAMP_VARIANTS = [
  "Classic Loot Camp: pays food equal to its strength when destroyed.",
  "Rich Loot Camp: pays gold equal to its strength when destroyed.",
  "Chaos Loot Camp: pays army equal to its strength and resets the destroyer's current race ability cooldown.",
] as const;

const RECRUITMENT_RULES = [
  `Recruitment orders cost ${RECRUITMENT_COST_PER_UNIT} gold per army unit and are paid up front.`,
  "Ordered units enter your recruitment queue. They are not active army yet and cannot attack or defend until completed.",
  `Each assigned recruiter processes ${RECRUITMENT_RATE_PER_RECRUITER} queued unit per tick before race and specialization bonuses.`,
  `Active army upkeep is ${ARMY_UPKEEP_PER_UNIT} food per unit per tick, rounded down to whole food when the tick saves.`,
  "Queued army has no upkeep. Food pressure begins only after units finish and join your active army.",
  "If you assign zero recruiters, the queue waits. If the queue is empty, recruiters add no army.",
] as const;

const BATTLEFIELD_RULES = [
  `Direct attacks and battlefield reinforcements share the same outbound cap: base ${MAX_SIMULTANEOUS_ATTACKS_BASE}, modified by castle level and race.`,
  "Joining a battlefield sends a visible unit toward that battle and reserves the army while it travels.",
  "A player cannot join both sides of the same unresolved battlefield.",
  "Resolved tile battlefields can transfer tile ownership to the winning side.",
  "Battle results are applied after economy persistence, so loot, casualties, and rewards should not be lost to the same tick's production update.",
  "The battle log badge shows reports you have not seen yet, not the total report archive.",
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
  "Returned: surviving attackers that come home after a winning raid.",
  "Retired: surviving attackers that do not return to active army after combat.",
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
          <span className={styles.sectionLabel}>Latest changes</span>
          <h2>What changed recently</h2>
          <p>
            These are the current rules players are most likely to notice on the
            battlefield.
          </p>
          <ul className={styles.noteList}>
            {LATEST_UPDATES.map((entry) => (
              <li key={entry}>{entry}</li>
            ))}
          </ul>
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
              <li>Manual Castle Yeet is paused for now.</li>
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
          <span className={styles.sectionLabel}>Home of A</span>
          <h2>Center control objective</h2>
          <p>{homeOfALore}</p>
          <ul className={styles.noteList}>
            <li>Always sits on center tile {HOME_OF_A_TILE_ID}.</li>
            <li>
              First capture fights neutral defense strength{" "}
              {MEGA_FORTRESS_HEALTH}.
            </li>
            <li>
              The controlling banner alliance earns {HOME_OF_A_POINT_INCOME}{" "}
              points per tick.
            </li>
            <li>
              Banner owner gets half the income; the rest is split by capture
              army contribution.
            </li>
          </ul>
        </article>

        <article className={styles.card}>
          <span className={styles.sectionLabel}>Combat</span>
          <h2>How raids resolve</h2>
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
                <li>
                  {Math.round(ATTACKER_RETIREMENT_RATE * 100)}% of surviving
                  attackers retire after a win; the rest return.
                </li>
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
