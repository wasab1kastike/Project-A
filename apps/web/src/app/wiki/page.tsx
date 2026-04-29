import Link from "next/link";
import styles from "./page.module.css";
import {
  ATTACK_UNIT_SPEED_PER_MINUTE,
  BASE_FORTRESS_ATTACK_DAMAGE,
  BASE_FORTRESS_GROWTH,
  FORTRESS_ATTACK_DAMAGE_PER_LEVEL,
  FORTRESS_GROWTH_PER_LEVEL,
  FORTRESS_LEVEL_UP_COSTS,
  MAX_SIMULTANEOUS_ATTACKS_BASE,
  MEGA_FORTRESS_DESTROY_BONUS,
  MEGA_FORTRESS_HEALTH,
  MEGA_FORTRESS_NAME,
  MEGA_FORTRESS_SIZE_TILES,
} from "@/lib/game/constants";
import {
  ATTACKER_RETIREMENT_RATE,
  DEFENDER_LOSS_RATE_ON_ATTACKER_WIN,
  FAILED_ATTACK_DEFENDER_CASUALTY_FACTOR,
  MAX_FOOD_LOOT_PERCENT,
  MAX_POINT_LOOT_PERCENT,
  WINNING_ATTACKER_BASE_SURVIVAL_FACTOR,
  WINNING_ATTACKER_MARGIN_SURVIVAL_FACTOR,
} from "@/lib/game/balance";
import { RACE_DEFINITIONS } from "@/lib/game/races";

const RACE_ABILITY_NOTES: Record<string, readonly string[]> = {
  DWARFS: [
    "Tier 2+: Grudge Book unlocks. Pick one enemy fortress and get +25% attack power against that target.",
    "Tier 3: Add a second grudge target or double your first target (x2 grudge multiplier).",
  ],
  UNSTABLE_UNICORNS: [
    "Tier 1: Enemies cannot see your army size while your units are in transit.",
    "Tier 1+: Faster attack travel from Unicorn speed tech.",
    "Tier 2+: Claim one free teleport token per hour.",
    "Using free teleport leaves attackable decoy castles behind.",
  ],
  SPACE_MURINES: [
    "Tier 2+: STIM unlocks (1 hour). During STIM, your attacks keep all sent troops and defenders take no losses.",
    `Attack slots scale as ${MAX_SIMULTANEOUS_ATTACKS_BASE} + 2 x castle level.`,
  ],
  ORKS: [
    "Tier 2+: WAAAGH unlocks (1 hour). During WAAAGH, attack power is boosted by race buff logic.",
    "Ork raids carry more loot per surviving unit from passive carry bonus.",
  ],
};

const CASTLE_SPECIALIZATIONS = [
  "Points: +10% point production per pick.",
  "Food: +10% food production per pick.",
  "Military: +10% army production per pick.",
  "Defense: +10% defense per pick.",
] as const;

const homeOfALore =
  "The map has one giant neutral fortress, Home of A. It is an old machine-citadel that keeps rebooting itself every time someone cracks it.";

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
  "Scout your first target before sending a huge army. Ties go to defender.",
  "Do not spend all points on one thing. Keep a reserve for rename/yeet/upgrades.",
  "When Home of A is low, decide early: race for slayer bonus or farm safer value elsewhere.",
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
      "Castle Yeet or Home of A destruction can reshuffle positions. The map is not broken; it is dramatic.",
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
  "Decoy: temporary attackable Unicorn teleport remnant.",
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
                <p className={styles.quote}>\"{race.flavorQuote}\"</p>
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
            Castle upgrades unlock after the first {MEGA_FORTRESS_NAME} kill in
            a cycle. First slayer gets one free level immediately (if not at
            cap).
          </p>
          <div className={styles.twoCol}>
            <section>
              <h3>Level effects</h3>
              <ul className={styles.noteList}>
                <li>
                  Base growth per tick: {BASE_FORTRESS_GROWTH}, plus
                  {" "}
                  {FORTRESS_GROWTH_PER_LEVEL} per castle level.
                </li>
                <li>
                  Base attack damage to fortress HP: {BASE_FORTRESS_ATTACK_DAMAGE},
                  plus {FORTRESS_ATTACK_DAMAGE_PER_LEVEL} per castle level.
                </li>
                <li>
                  Standard simultaneous attack slots start at
                  {" "}
                  {MAX_SIMULTANEOUS_ATTACKS_BASE}.
                </li>
              </ul>
            </section>
            <section>
              <h3>Upgrade costs</h3>
              <ol className={styles.noteList}>
                {FORTRESS_LEVEL_UP_COSTS.map((cost, index) => (
                  <li key={cost}>Level {index + 2}: {cost} points</li>
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
        </article>

        <article className={styles.card}>
          <span className={styles.sectionLabel}>Home of A</span>
          <h2>Boss fortress objective</h2>
          <p>{homeOfALore}</p>
          <ul className={styles.noteList}>
            <li>
              Starts at {MEGA_FORTRESS_HEALTH} HP and occupies
              {" "}
              {MEGA_FORTRESS_SIZE_TILES} tiles.
            </li>
            <li>
              First destroy in a cycle unlocks castle upgrades for everyone.
            </li>
            <li>
              Destroy reward starts at {MEGA_FORTRESS_DESTROY_BONUS} and scales
              by +{MEGA_FORTRESS_DESTROY_BONUS} each next destroy.
            </li>
            <li>Its max HP scales upward each destroy (x2, x3, x4...).</li>
            <li>
              After each destroy, player fortress positions reshuffle, while the
              first slayer crown is preserved.
            </li>
          </ul>
        </article>

        <article className={styles.card}>
          <span className={styles.sectionLabel}>Combat</span>
          <h2>How raids resolve</h2>
          <div className={styles.twoCol}>
            <section>
              <h3>Battle flow</h3>
              <ul className={styles.noteList}>
                <li>
                  Units travel using map distance and speed
                  ({ATTACK_UNIT_SPEED_PER_MINUTE} tiles/min baseline).
                </li>
                <li>
                  At impact, attacker power is compared against defender power.
                </li>
                <li>Ties go to the defender.</li>
                <li>
                  On attacker win, defender loses about
                  {" "}
                  {Math.round(DEFENDER_LOSS_RATE_ON_ATTACKER_WIN * 100)}% of
                  defending army.
                </li>
                <li>
                  On failed attack, defender losses are reduced by a failure
                  factor ({FAILED_ATTACK_DEFENDER_CASUALTY_FACTOR}).
                </li>
              </ul>
            </section>
            <section>
              <h3>Survivors and loot</h3>
              <ul className={styles.noteList}>
                <li>
                  Winner survivor model uses base + margin factors
                  ({WINNING_ATTACKER_BASE_SURVIVAL_FACTOR} and
                  {" "}
                  {WINNING_ATTACKER_MARGIN_SURVIVAL_FACTOR}).
                </li>
                <li>
                  {Math.round(ATTACKER_RETIREMENT_RATE * 100)}% of surviving
                  attackers retire after a win; the rest return.
                </li>
                <li>
                  Loot caps: up to {Math.round(MAX_POINT_LOOT_PERCENT * 100)}%
                  of target points and {Math.round(MAX_FOOD_LOOT_PERCENT * 100)}%
                  of target food per raid.
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
