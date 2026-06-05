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
  SeasonFiveHomeState,
  SeasonFiveStatKey,
  SeasonFiveStats,
} from "@/lib/game/season-five";
import {
  ClassPortrait,
  InventoryPressureMeter,
  SeasonFiveRealtimeBridge,
  StatBars,
} from "./season-five-home-client";
import styles from "./season-five.module.css";

const tabs = [
  { key: "overview", label: "Overview" },
  { key: "inventory", label: "Inventory" },
  { key: "gear", label: "Gear" },
  { key: "skills", label: "Skills" },
  { key: "stats", label: "Stats" },
] as const;

type CharacterTab = (typeof tabs)[number]["key"];

function normalizeTab(tab: string | null): CharacterTab {
  return tabs.some((candidate) => candidate.key === tab)
    ? (tab as CharacterTab)
    : "overview";
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
              <p className={styles.kicker}>Character</p>
              <h2>{character.name}</h2>
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
          <p className={styles.smallText}>{getActionText(character)}</p>
          <div className={styles.statGrid}>
            <div>
              <span>Fish</span>
              <strong>{character.totalFishCaught}</strong>
            </div>
            <div>
              <span>Biggest</span>
              <strong>{character.biggestFishCm} cm</strong>
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
          <StatBars stats={character.stats} labels={state.statLabels} />
          <form action={returnSeasonFiveHomeAction}>
            <button type="submit" className={styles.secondaryButton}>
              Return / unload
            </button>
          </form>
        </aside>

        <section className={styles.widePanel}>
          {activeTab === "overview" ? <OverviewTab state={state} /> : null}
          {activeTab === "inventory" ? <InventoryTab state={state} /> : null}
          {activeTab === "gear" ? <GearTab state={state} /> : null}
          {activeTab === "skills" ? <SkillsTab state={state} /> : null}
          {activeTab === "stats" ? <StatsTab state={state} /> : null}
        </section>
      </div>
    </div>
  );
}

function OverviewTab({ state }: { state: SeasonFiveHomeState }) {
  const character = state.character;
  if (!character) return null;

  return (
    <>
      <div className={styles.sectionHeader}>
        <div>
          <p className={styles.kicker}>Overview</p>
          <h2>{character.classLabel}</h2>
        </div>
      </div>
      <p className={styles.smallText}>
        {getActionText(character)}. Your current build gives +
        {character.effects.catchBonus} catch tempo, +
        {character.effects.rarityBonus} rarity pressure, and{" "}
        {character.effects.travelPercent}% travel time.
      </p>
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
          <span>Size</span>
          <strong>+{character.effects.sizeBonusPercent}%</strong>
        </div>
        <div>
          <span>Pack bonus</span>
          <strong>+{character.effects.inventoryBonus}</strong>
        </div>
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
                {item.sizeCm} cm | {item.rarity} | {item.slots} slot
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

  return (
    <>
      <div className={styles.sectionHeader}>
        <div>
          <p className={styles.kicker}>Skills</p>
          <h2>{character.classLabel} tree</h2>
        </div>
        <span className={styles.badge}>{character.skillPoints} points</span>
      </div>
      <div className={styles.skillTree}>
        {state.skills.map((skill) => (
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
                {skill.purchased
                  ? "Purchased"
                  : skill.available
                    ? `${skill.cost} point${skill.cost === 1 ? "" : "s"}`
                    : "Locked"}
              </small>
              <span>{skill.description}</span>
            </button>
          </form>
        ))}
      </div>
    </>
  );
}

function StatsTab({ state }: { state: SeasonFiveHomeState }) {
  const character = state.character;
  if (!character) return null;

  return (
    <>
      <div className={styles.sectionHeader}>
        <div>
          <p className={styles.kicker}>Stats</p>
          <h2>Build math</h2>
        </div>
      </div>
      <StatBars stats={character.stats} labels={state.statLabels} />
      <div className={styles.inventoryList}>
        {(
          Object.entries(state.statLabels) as Array<[SeasonFiveStatKey, string]>
        ).map(([key, label]) => (
          <div key={key}>
            <strong>{label}</strong>
            <span>{state.statDescriptions[key]}</span>
          </div>
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
          <h1>Character Management</h1>
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
