import Link from "next/link";
import styles from "./page.module.css";
import {
  ACTIVE_LOCATION_SHUFFLE_COST,
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
  MAX_SIMULTANEOUS_ATTACKS_BASE,
  MEGA_FORTRESS_DESTROY_BONUS,
  MEGA_FORTRESS_HEALTH,
  MEGA_FORTRESS_NAME,
  MEGA_FORTRESS_SIZE_TILES,
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
  LOOT_CAMP_LIFETIME_MINUTES,
  LOOT_CAMP_MAX_SPAWNS_PER_HOUR,
  LOOT_CAMP_MAX_STRENGTH,
  LOOT_CAMP_MIN_SPAWNS_PER_HOUR,
  LOOT_CAMP_MIN_STRENGTH,
} from "@/lib/game/loot-camps";
import { RACE_DEFINITIONS } from "@/lib/game/races";

const RACE_ABILITY_NOTES: Record<string, readonly string[]> = {
  DWARFS: [
    "Tier 2+: Grudge Book unlocks. Pick one enemy fortress and get +25% attack power against that target.",
    "Tier 3: Add a second grudge target or double your first target (x2 grudge multiplier).",
    "Deep Mining: once per Helsinki hour during active season. Roll table: 25% Rich Vein (+30 minutes of point production, minimum 300), 20% Ore Surge (+50% point/food/army production for 1 hour), 15% Battle Runes (+25% attack and defense for 1 hour), 5% Faction Seal, 5% Buried Warband (+20% idle army, min 25, max 250), 12% Cave-in (-25% idle army, min 25), 10% Unstable Tunnels (new outgoing and returning attacks are 50% slower for 1 hour), 8% Shaft Collapse (point/food/army production halted for 1 hour).",
    "Faction Seal creates an attackable Dwarf Rune tile between the Dwarf fortress and the chosen target for 1 hour. The committed army defends it only if this roll hits. While the rune has defenders, the target's faction bonuses and active race abilities are disabled. Any player except the Dwarf owner can destroy it for a fixed 500 point bounty; destruction ends suppression immediately.",
  ],
  UNSTABLE_UNICORNS: [
    "Tier 1: Enemies cannot see your army size while your units are in transit.",
    "Tier 1+: Faster attack travel from Unicorn speed tech.",
    "Tier 2+: Claim one free teleport token per hour.",
    "Using a free teleport leaves attackable decoy castles behind. Decoys collapse when hit and can destroy part of the attacking army.",
  ],
  SPACE_MURINES: [
    "Tier 2+: STIM unlocks (1 hour). During STIM, your attacks keep all sent troops and defenders take no losses.",
    "First recall each hour returns instantly, losing 5% of sent troops, minimum 1.",
    `Attack slots scale as ${MAX_SIMULTANEOUS_ATTACKS_BASE} + 2 x castle level.`,
  ],
  ORKS: [
    "Tier 1+: Stronger Together — 15% of killed defenders join your idle army after each successful raid.",
    "Tier 3+: WAAAGH unlocks (once per day, lasts 1 hour) — x4 attack and defense power, 2x movement speed.",
    "Ork raids carry extra loot per surviving unit from passive carry bonus.",
  ],
};

const CASTLE_SPECIALIZATIONS = [
  "Points: +10% point production per pick.",
  "Food: +10% food production per pick.",
  "Military: +10% army production per pick.",
  "Defense: +10% PvP defending power per pick.",
] as const;

const ATTACK_MULTIPLIERS = [
  "Base PvP/PvE battle power: sent army x 1.",
  "ORKS WAAAGH (T3): x4 attack and defense power, 2x movement speed while active.",
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
  `${MEGA_FORTRESS_NAME} has no normal defending army check; attacks directly damage its health with castle-level-scaled fortress attack damage.`,
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
  "Watch the map for temporary loot camps. They expire fast but can pay food, points, or army.",
  "Scout your first target before sending a huge army. Ties go to defender.",
  "Do not spend all points on one thing. Keep a reserve for rename/yeet/upgrades.",
  "When Home of A is low, decide early: race for slayer bonus or farm safer value elsewhere.",
] as const;

const LATEST_UPDATES = [
  "Loot camps now stay on the battlefield for 30 minutes, show clearer reward/strength/defender info, and fight back with variant-scaled defending armies.",
  "Loot camps now spawn around the battlefield during gameplay. Classic camps pay food, Rich camps pay points, and Chaos camps pay army plus a race cooldown reset.",
  "Unstable Unicorn teleport now leaves attackable decoy castles again. Hitting a decoy clears it and applies its backlash before any normal loot happens.",
  "Castle Yeet now has clearer warnings and stronger location safeguards, including better handling when a rendered map move would not actually change your tile.",
  "Attack recall and return reports are more explicit, so recalled armies and post-raid returning units are easier to track.",
  "Raid loot caps are now 70% of target points and 70% of target food per raid.",
] as const;

const LOOT_CAMP_VARIANTS = [
  "Classic Loot Camp: pays food equal to its strength when destroyed.",
  "Rich Loot Camp: pays points equal to its strength when destroyed.",
  "Chaos Loot Camp: pays army equal to its strength and resets the destroyer's current race ability cooldown.",
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
            Points come from your economy, raids, loot camps, and{" "}
            {MEGA_FORTRESS_NAME} destroy rewards.
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
                  Destroying {MEGA_FORTRESS_NAME} is not required to win, but it
                  unlocks upgrades and can swing the score race.
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
            Castle upgrades unlock after the first {MEGA_FORTRESS_NAME} kill in
            a cycle. First slayer gets one free level immediately (if not at
            cap).
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
                    Level {index + 2}: {cost} points
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
              <li>Rename costs {ACTIVE_RENAME_COST} points.</li>
              <li>
                Castle Yeet is free the first time, then costs{" "}
                {ACTIVE_LOCATION_SHUFFLE_COST} points unless a valid free
                Unicorn teleport token is used.
              </li>
              <li>
                Castle Yeet cancels your own outgoing armies and moves you to a
                valid open map tile when one is available.
              </li>
            </ul>
          </section>
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
          <h2>Boss fortress objective</h2>
          <p>{homeOfALore}</p>
          <ul className={styles.noteList}>
            <li>
              Starts at {MEGA_FORTRESS_HEALTH} HP and occupies{" "}
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
                  of target points and {Math.round(MAX_FOOD_LOOT_PERCENT * 100)}
                  % of target food per raid.
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
