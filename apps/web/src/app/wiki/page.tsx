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
      </section>
    </main>
  );
}
