"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import type { Session } from "next-auth";
import { io } from "socket.io-client";
import { SessionActions } from "@/components/session-actions";
import { NoticeToast } from "@/components/notice-toast";
import { PROJECT_A_REFRESH_EVENT } from "@/lib/realtime";
import type { SeasonFiveHomeState } from "@/lib/game/season-five";
import {
  createSeasonFiveCharacterAction,
  equipSeasonFiveGearAction,
  purchaseSeasonFiveSkillAction,
  returnSeasonFiveHomeAction,
  startSeasonFiveFishingTripAction,
} from "@/app/game-actions";
import styles from "./season-five.module.css";

const dateTimeFormatter = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "short",
});

function formatClassKey(key: string) {
  return key
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function SeasonFiveRealtimeBridge({ enabled }: { enabled: boolean }) {
  const router = useRouter();

  useEffect(() => {
    if (!enabled) return;

    const socket = io({
      path: "/socket.io",
      withCredentials: true,
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
    });

    socket.on(PROJECT_A_REFRESH_EVENT, (payload?: { reason?: string }) => {
      if (payload?.reason !== "connected") {
        router.refresh();
      }
    });

    return () => {
      socket.disconnect();
    };
  }, [enabled, router]);

  return null;
}

export function SeasonFiveHomeClient({
  state,
  session,
  actionError,
  notice,
  authConfigured,
  realtimeEnabled,
}: {
  state: SeasonFiveHomeState;
  session: Session | null;
  actionError: string | null;
  notice: string | null;
  authConfigured: boolean;
  realtimeEnabled: boolean;
}) {
  const character = state.character;
  const activeUntil = state.cycle.activeEndsAt
    ? dateTimeFormatter.format(new Date(state.cycle.activeEndsAt))
    : "TBD";

  return (
    <main className={styles.shell}>
      <SeasonFiveRealtimeBridge enabled={realtimeEnabled} />
      {notice ? <NoticeToast message={notice} /> : null}
      {actionError ? <NoticeToast message={actionError} /> : null}

      <header className={styles.topbar}>
        <div>
          <p className={styles.kicker}>Project-A Season 5 Preview</p>
          <h1>Roguelite Fishing League</h1>
        </div>
        <div className={styles.topbarMeta}>
          <span>Season ends {activeUntil}</span>
          <SessionActions
            authConfigured={authConfigured}
            isAuthenticated={Boolean(session?.user)}
            isAdmin={session?.user?.role === "ADMIN"}
            variant="compact"
          />
        </div>
      </header>

      {!session ? (
        <section className={styles.noticeBand}>
          <h2>Sign in to join the open test.</h2>
          <p>
            Everyone can watch the lake, but only signed-in players can fish.
          </p>
        </section>
      ) : null}

      {!character && session ? (
        <section className={styles.setup}>
          <h2>Choose your washed-up hero</h2>
          <div className={styles.classGrid}>
            {state.classes.map((characterClass) => (
              <form
                key={characterClass.key}
                action={createSeasonFiveCharacterAction}
                className={styles.classChoice}
              >
                <input
                  type="hidden"
                  name="characterClass"
                  value={characterClass.key}
                />
                <h3>{formatClassKey(characterClass.key)}</h3>
                <p>{characterClass.summary}</p>
                <dl>
                  <div>
                    <dt>Catch</dt>
                    <dd>+{characterClass.catchBonus}</dd>
                  </div>
                  <div>
                    <dt>Size</dt>
                    <dd>{characterClass.sizeBonusPercent}%</dd>
                  </div>
                  <div>
                    <dt>Travel</dt>
                    <dd>{characterClass.travelPercent}%</dd>
                  </div>
                  <div>
                    <dt>Pack</dt>
                    <dd>+{characterClass.inventoryBonus}</dd>
                  </div>
                </dl>
                <button type="submit">Start</button>
              </form>
            ))}
          </div>
        </section>
      ) : null}

      {character ? (
        <div className={styles.grid}>
          <section className={styles.panel}>
            <div className={styles.sectionHeader}>
              <div>
                <p className={styles.kicker}>Character</p>
                <h2>{character.name}</h2>
              </div>
              <span className={styles.badge}>{character.classLabel}</span>
            </div>
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
                <span>Inventory</span>
                <strong>
                  {character.inventoryUsed}/{character.inventoryCapacity}
                </strong>
              </div>
              <div>
                <span>Skill pts</span>
                <strong>{character.skillPoints}</strong>
              </div>
            </div>
            <p className={styles.statusLine}>
              {character.actionKind === "TRAVELING"
                ? `Travelling to ${character.destinationLocationName}.`
                : character.actionKind === "FISHING"
                  ? `Fishing at ${character.currentLocationName}.`
                  : `Resting at ${character.currentLocationName}.`}
            </p>
            {character.actionCompletesAt ? (
              <p className={styles.smallText}>
                Arrival:{" "}
                {dateTimeFormatter.format(
                  new Date(character.actionCompletesAt)
                )}
              </p>
            ) : null}
            <form action={returnSeasonFiveHomeAction}>
              <button type="submit" className={styles.secondaryButton}>
                Return / unload
              </button>
            </form>
          </section>

          <section className={`${styles.panel} ${styles.mapPanel}`}>
            <div className={styles.sectionHeader}>
              <div>
                <p className={styles.kicker}>Map</p>
                <h2>Home Base & Waters</h2>
              </div>
            </div>
            <div className={styles.fishingMap}>
              {state.locations.map((location) => (
                <form
                  key={location.key}
                  action={startSeasonFiveFishingTripAction}
                  className={`${styles.locationPin} ${
                    location.kind === "HOME" ? styles.homePin : ""
                  }`}
                  style={{
                    left: `${location.xPercent}%`,
                    top: `${location.yPercent}%`,
                  }}
                >
                  <input
                    type="hidden"
                    name="locationKey"
                    value={location.key}
                  />
                  <button
                    type="submit"
                    disabled={
                      location.kind === "HOME" ||
                      character.actionKind === "TRAVELING"
                    }
                    title={location.name}
                  >
                    <span>{location.name}</span>
                    {location.kind !== "HOME" ? (
                      <small>
                        {location.travelMinutes}m | {location.minFishCm}-
                        {location.maxFishCm} cm
                      </small>
                    ) : (
                      <small>Unload</small>
                    )}
                  </button>
                </form>
              ))}
            </div>
          </section>

          <section className={styles.panel}>
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
                      {gear.rarity} | power {gear.power}
                    </small>
                  </button>
                </form>
              ))}
            </div>
          </section>

          <section className={styles.panel}>
            <div className={styles.sectionHeader}>
              <div>
                <p className={styles.kicker}>Build</p>
                <h2>Skill Tree</h2>
              </div>
            </div>
            <div className={styles.skillGrid}>
              {state.skills.map((skill) => {
                const purchased = character.skillPurchases.includes(skill.key);
                return (
                  <form key={skill.key} action={purchaseSeasonFiveSkillAction}>
                    <input type="hidden" name="nodeKey" value={skill.key} />
                    <button type="submit" disabled={purchased}>
                      <strong>{skill.name}</strong>
                      <span>{skill.description}</span>
                    </button>
                  </form>
                );
              })}
            </div>
          </section>

          <section className={styles.panel}>
            <div className={styles.sectionHeader}>
              <div>
                <p className={styles.kicker}>Inventory</p>
                <h2>Current Haul</h2>
              </div>
              {character.inventoryFull ? (
                <span className={styles.warning}>Full</span>
              ) : null}
            </div>
            <div className={styles.inventoryList}>
              {character.inventory.length > 0 ? (
                character.inventory.map((item) => (
                  <div key={item.id}>
                    <strong>{item.speciesName}</strong>
                    <span>
                      {item.sizeCm} cm | {item.rarity} | {item.slots} slot
                    </span>
                  </div>
                ))
              ) : (
                <p className={styles.smallText}>No fish in the pack.</p>
              )}
            </div>
          </section>

          <section className={styles.panel}>
            <div className={styles.sectionHeader}>
              <div>
                <p className={styles.kicker}>League</p>
                <h2>Rankings</h2>
              </div>
            </div>
            <div className={styles.leaderboardColumns}>
              <Leaderboard
                title="Most Fish"
                rows={state.leaderboards.mostFish}
                value={(row) => `${row.totalFishCaught} fish`}
              />
              <Leaderboard
                title="Biggest Fish"
                rows={state.leaderboards.biggestFish}
                value={(row) => `${row.biggestFishCm} cm`}
              />
            </div>
          </section>
        </div>
      ) : null}
    </main>
  );
}

function Leaderboard({
  title,
  rows,
  value,
}: {
  title: string;
  rows: SeasonFiveHomeState["leaderboards"]["mostFish"];
  value: (
    row: SeasonFiveHomeState["leaderboards"]["mostFish"][number]
  ) => string;
}) {
  return (
    <div className={styles.leaderboard}>
      <h3>{title}</h3>
      {rows.length > 0 ? (
        <ol>
          {rows.map((row) => (
            <li key={row.id}>
              <span>
                {row.name}
                <small>{row.classLabel}</small>
              </span>
              <strong>{value(row)}</strong>
            </li>
          ))}
        </ol>
      ) : (
        <p className={styles.smallText}>No ranked catches yet.</p>
      )}
    </div>
  );
}
