"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Session } from "next-auth";
import { SessionActions } from "@/components/session-actions";
import {
  equipSeasonFiveGearAction,
  purchaseSeasonFiveSkillAction,
  returnSeasonFiveHomeAction,
} from "@/app/game-actions";
import type {
  SeasonFiveEffectBonuses,
  SeasonFiveHomeState,
  SeasonFiveStatKey,
  SeasonFiveStats,
} from "@/lib/game/season-five";
import { formatSeasonFiveFishWeight } from "@/lib/game/season-five-fishing";
import {
  BuildEffectChips,
  ClassPortrait,
  InventoryPressureMeter,
  SeasonFiveRealtimeBridge,
  StatBars,
} from "./season-five-home-client";
import styles from "./season-five.module.css";

const tabs = [
  { key: "build", label: "Build" },
  { key: "inventory", label: "Inventory" },
  { key: "gear", label: "Gear" },
  { key: "skills", label: "Skills" },
] as const;

type CharacterTab = (typeof tabs)[number]["key"];

function normalizeTab(tab: string | null): CharacterTab {
  if (tab === "overview" || tab === "stats") return "build";
  return tabs.some((candidate) => candidate.key === tab)
    ? (tab as CharacterTab)
    : "build";
}

function formatStatBonuses(
  bonuses: Partial<SeasonFiveStats>,
  labels: Record<SeasonFiveStatKey, string>
) {
  const parts = (Object.entries(labels) as Array<[SeasonFiveStatKey, string]>)
    .map(([key, label]) => {
      const value = bonuses[key] ?? 0;
      if (value === 0) return null;
      return `${value > 0 ? "+" : ""}${value} ${label}`;
    })
    .filter(Boolean);

  return parts.length > 0 ? parts.join(", ") : "No stat change";
}

type SeasonFiveEffectKey = keyof Required<SeasonFiveEffectBonuses>;
type SeasonFiveSkill = SeasonFiveHomeState["skills"][number];

const skillEffectFormatters = {
  catchBonus: (value) => `+${value} catch tempo`,
  rarityBonus: (value) => `+${value} rarity`,
  sizeBonusPercent: (value) => `+${value}% trophy weight`,
  inventoryBonus: (value) => `+${value} pack slots`,
  inventoryPressureReduction: (value) => `-${value} pack pressure`,
  travelPercent: (value) => `${value > 0 ? "+" : ""}${value}% travel time`,
  rhythmCatchBonus: (value) => `+${value}/stage rhythm tempo`,
  rhythmPressureReduction: (value) => `-${value}/stage rhythm pressure`,
} satisfies Record<SeasonFiveEffectKey, (value: number) => string>;

function formatEffectBonuses(effects?: SeasonFiveEffectBonuses) {
  return (
    Object.entries(skillEffectFormatters) as Array<
      [SeasonFiveEffectKey, (value: number) => string]
    >
  )
    .map(([key, formatter]) => {
      const value = effects?.[key] ?? 0;
      return value === 0 ? null : formatter(value);
    })
    .filter(Boolean);
}

function formatSkillBonuses(
  skill: SeasonFiveSkill,
  labels: Record<SeasonFiveStatKey, string>
) {
  const statBonuses = formatStatBonuses(skill.statBonuses ?? {}, labels);
  const parts = [
    ...(statBonuses === "No stat change" ? [] : [statBonuses]),
    ...formatEffectBonuses(skill.effectBonuses),
  ];

  return parts.length > 0 ? parts.join(", ") : "No passive math";
}

function getActionText(
  character: NonNullable<SeasonFiveHomeState["character"]>
) {
  if (character.actionKind === "TRAVELING") {
    return `Traveling to ${character.destinationLocationName}`;
  }
  if (character.actionKind === "FISHING") {
    return `Fishing at ${character.currentLocationName}`;
  }
  return `Resting at ${character.currentLocationName}`;
}

function CharacterShell({
  state,
  activeTab,
}: {
  state: SeasonFiveHomeState;
  activeTab: CharacterTab;
}) {
  const character = state.character;
  if (!character) {
    return (
      <section className={styles.noticeBand}>
        <h2>No Season 5 character yet.</h2>
        <p>Return to the map and choose a class before managing tabs.</p>
        <Link className={styles.linkButton} href="/">
          Open map
        </Link>
      </section>
    );
  }

  return (
    <div className={styles.characterPage}>
      <section className={styles.characterHero}>
        <div className={styles.characterHeroIdentity}>
          <ClassPortrait
            classKey={character.class}
            label={character.classLabel}
          />
          <div>
            <p className={styles.kicker}>Command dashboard</p>
            <h2>{character.name}</h2>
            <div className={styles.characterHeroMeta}>
              <span className={styles.badge}>{character.classLabel}</span>
              <span className={styles.badge}>Level {character.level}</span>
              <span className={styles.badge}>
                {character.skillPoints} skill pts
              </span>
            </div>
          </div>
        </div>
        <div className={styles.characterHeroStatus}>
          <div className={styles.commandStatus}>
            <strong>{getActionText(character)}</strong>
            <span>
              Pack {character.inventoryUsed}/{character.inventoryCapacity} |{" "}
              {character.inventoryPressureLabel}
            </span>
          </div>
          <div className={styles.commandActions}>
            <form action={returnSeasonFiveHomeAction}>
              <button type="submit" className={styles.secondaryButton}>
                Return / unload
              </button>
            </form>
            <Link className={styles.linkButton} href="/">
              Open map
            </Link>
          </div>
        </div>
      </section>

      <nav className={styles.tabs} aria-label="Character tabs">
        {tabs.map((tab) => (
          <Link
            key={tab.key}
            className={tab.key === activeTab ? styles.activeTab : ""}
            href={`/character?tab=${tab.key}`}
          >
            {tab.label}
          </Link>
        ))}
      </nav>

      <div className={styles.managementGrid}>
        <aside className={styles.commandCard}>
          <div className={styles.sectionHeader}>
            <div>
              <p className={styles.kicker}>Mini build sheet</p>
              <h2>{character.classLabel}</h2>
            </div>
            <span className={styles.classBadge}>
              <ClassPortrait
                classKey={character.class}
                label={character.classLabel}
                compact
              />
              {character.classLabel}
            </span>
          </div>
          <div className={styles.statGrid}>
            <div>
              <span>Level</span>
              <strong>{character.level}</strong>
            </div>
            <div>
              <span>XP</span>
              <strong>{character.experience}</strong>
            </div>
            <div>
              <span>Pack</span>
              <strong>
                {character.inventoryUsed}/{character.inventoryCapacity}
              </strong>
            </div>
            <div>
              <span>Skill pts</span>
              <strong>{character.skillPoints}</strong>
            </div>
          </div>
          <InventoryPressureMeter character={character} />
          <BuildEffectChips effects={character.effects} compact />
        </aside>

        <section className={styles.widePanel}>
          {activeTab === "build" ? <BuildTab state={state} /> : null}
          {activeTab === "inventory" ? <InventoryTab state={state} /> : null}
          {activeTab === "gear" ? <GearTab state={state} /> : null}
          {activeTab === "skills" ? <SkillsTab state={state} /> : null}
        </section>
      </div>
    </div>
  );
}

function BuildTab({ state }: { state: SeasonFiveHomeState }) {
  const character = state.character;
  if (!character) return null;

  return (
    <>
      <div className={styles.sectionHeader}>
        <div>
          <p className={styles.kicker}>Build</p>
          <h2>Current command sheet</h2>
        </div>
        <span className={styles.badge}>{getActionText(character)}</span>
      </div>

      <div className={styles.buildDashboard}>
        <section className={styles.buildBand}>
          <div className={styles.buildBandHeader}>
            <div>
              <p className={styles.kicker}>Progress</p>
              <h3>Fishing record</h3>
            </div>
          </div>
          <div className={styles.statGrid}>
            <div>
              <span>Level</span>
              <strong>{character.level}</strong>
            </div>
            <div>
              <span>XP</span>
              <strong>{character.experience}</strong>
            </div>
            <div>
              <span>Fish</span>
              <strong>{character.totalFishCaught}</strong>
            </div>
            <div>
              <span>Biggest</span>
              <strong>
                {formatSeasonFiveFishWeight(character.biggestFishGrams)}
              </strong>
            </div>
          </div>
        </section>

        <section className={styles.buildBand}>
          <div className={styles.buildBandHeader}>
            <div>
              <p className={styles.kicker}>Passives</p>
              <h3>Build effects</h3>
            </div>
            <span className={styles.badge}>{character.skillPoints} pts</span>
          </div>
          <BuildEffectChips effects={character.effects} />
        </section>

        <section className={styles.buildBand}>
          <div className={styles.buildBandHeader}>
            <div>
              <p className={styles.kicker}>Capacity</p>
              <h3>Pack pressure</h3>
            </div>
          </div>
          <InventoryPressureMeter character={character} />
        </section>

        <section className={styles.buildBand}>
          <div className={styles.buildBandHeader}>
            <div>
              <p className={styles.kicker}>Stats</p>
              <h3>Class math</h3>
            </div>
          </div>
          <StatBars stats={character.stats} labels={state.statLabels} />
          <div className={styles.statDescriptionList}>
            {(
              Object.entries(state.statLabels) as Array<
                [SeasonFiveStatKey, string]
              >
            ).map(([key, label]) => (
              <div key={key}>
                <strong>{label}</strong>
                <span>{state.statDescriptions[key]}</span>
              </div>
            ))}
          </div>
        </section>
      </div>
    </>
  );
}

function InventoryTab({ state }: { state: SeasonFiveHomeState }) {
  const character = state.character;
  if (!character) return null;

  return (
    <>
      <div className={styles.sectionHeader}>
        <div>
          <p className={styles.kicker}>Inventory</p>
          <h2>Current haul</h2>
        </div>
        {character.inventoryFull || character.inventoryCloseToFull ? (
          <span className={styles.warning}>
            {character.inventoryPressureLabel}
          </span>
        ) : null}
      </div>
      <InventoryPressureMeter character={character} />
      <div className={styles.inventoryList}>
        {character.inventory.length > 0 ? (
          character.inventory.map((item) => (
            <div key={item.id}>
              <strong>{item.speciesName}</strong>
              <span className={styles.inventoryMeta}>
                {formatSeasonFiveFishWeight(item.weightGrams)} | {item.rarity} |{" "}
                {item.slots} slot
                {item.slots === 1 ? "" : "s"}
              </span>
            </div>
          ))
        ) : (
          <p className={styles.smallText}>No fish in the pack.</p>
        )}
      </div>
    </>
  );
}

function GearTab({ state }: { state: SeasonFiveHomeState }) {
  const character = state.character;
  if (!character) return null;

  return (
    <>
      <div className={styles.sectionHeader}>
        <div>
          <p className={styles.kicker}>Gear</p>
          <h2>Tackle</h2>
        </div>
      </div>
      <div className={styles.gearList}>
        {character.gear.map((gear) => (
          <form key={gear.id} action={equipSeasonFiveGearAction}>
            <input type="hidden" name="gearId" value={gear.id} />
            <button
              type="submit"
              className={gear.equipped ? styles.equipped : ""}
            >
              <span>
                {gear.slot}: {gear.name}
              </span>
              <small>
                {gear.rarity} |{" "}
                {formatStatBonuses(gear.statBonuses, state.statLabels)}
              </small>
            </button>
          </form>
        ))}
      </div>
    </>
  );
}

function SkillsTab({ state }: { state: SeasonFiveHomeState }) {
  const character = state.character;
  if (!character) return null;
  const paths = state.skills.reduce<
    Array<{ key: string; name: string; skills: typeof state.skills }>
  >((groups, skill) => {
    const existing = groups.find((group) => group.key === skill.pathKey);
    if (existing) {
      existing.skills.push(skill);
      return groups;
    }
    groups.push({
      key: skill.pathKey,
      name: skill.pathName,
      skills: [skill],
    });
    return groups;
  }, []);

  return (
    <>
      <div className={styles.sectionHeader}>
        <div>
          <p className={styles.kicker}>Skills</p>
          <h2>{character.classLabel} tree</h2>
        </div>
        <span className={styles.badge}>{character.skillPoints} points</span>
      </div>
      <div className={styles.skillPathGrid}>
        {paths.map((path) => (
          <section key={path.key} className={styles.skillPath}>
            <h3>{path.name}</h3>
            <div className={styles.skillTree}>
              {path.skills.map((skill) => (
                <form key={skill.key} action={purchaseSeasonFiveSkillAction}>
                  <input type="hidden" name="nodeKey" value={skill.key} />
                  <button
                    type="submit"
                    disabled={!skill.available}
                    className={`${styles.skillTreeNode} ${
                      skill.purchased
                        ? styles.skillPurchased
                        : skill.available
                          ? styles.skillAvailable
                          : styles.skillLocked
                    }`}
                  >
                    <strong>{skill.name}</strong>
                    <small>
                      Tier {skill.tier} |{" "}
                      {skill.purchased
                        ? "Purchased"
                        : skill.available
                          ? `${skill.cost} point${
                              skill.cost === 1 ? "" : "s"
                            }`
                          : "Locked"}
                    </small>
                    <span>{skill.description}</span>
                    <span className={styles.skillMath}>
                      {formatSkillBonuses(skill, state.statLabels)}
                    </span>
                  </button>
                </form>
              ))}
            </div>
          </section>
        ))}
      </div>
    </>
  );
}

export function SeasonFiveCharacterClient({
  state,
  session,
  activeTab,
  authConfigured,
  realtimeEnabled,
}: {
  state: SeasonFiveHomeState;
  session: Session | null;
  activeTab: string | null;
  authConfigured: boolean;
  realtimeEnabled: boolean;
}) {
  const router = useRouter();

  return (
    <main className={styles.shell}>
      <SeasonFiveRealtimeBridge
        enabled={realtimeEnabled}
        onRefresh={() => router.refresh()}
      />
      <header className={styles.topbar}>
        <div>
          <p className={styles.kicker}>Season 5</p>
          <h1>Command Dashboard</h1>
        </div>
        <div className={styles.topbarMeta}>
          <Link className={styles.linkButton} href="/">
            Map
          </Link>
          <SessionActions
            authConfigured={authConfigured}
            isAuthenticated={Boolean(session?.user)}
            isAdmin={session?.user?.role === "ADMIN"}
            variant="compact"
          />
        </div>
      </header>
      <CharacterShell state={state} activeTab={normalizeTab(activeTab)} />
    </main>
  );
}
