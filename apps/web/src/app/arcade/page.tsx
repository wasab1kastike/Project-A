import Link from "next/link";
import Image from "next/image";
import { auth } from "@/auth";
import {
  playArcadeGameAction,
  purchaseArcadeLootBoxAction,
  openArcadeLootBoxAction,
  equipCosmeticUnlockAction,
} from "@/app/game-actions";
import {
  ArcadeCosmeticSlot,
  ArcadeGameType,
  ArcadeLootBoxType,
} from "@/lib/prisma-client";
import {
  ARCADE_LOOT_BOX_SKINS,
  getArcadeLootBoxSkin,
} from "@/lib/game/constants";
import {
  getArcadeHubState,
  type ArcadeHubState,
} from "@/lib/game/arcade";
import styles from "./page.module.css";

export const dynamic = "force-dynamic";

const dateTimeFormatter = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "short",
});

function formatDateTime(value: Date | null) {
  return value ? dateTimeFormatter.format(value) : "Unknown";
}

function getGameLabel(gameType: ArcadeGameType) {
  if (gameType === ArcadeGameType.DICE) {
    return "Dice table";
  }

  if (gameType === ArcadeGameType.WHEEL) {
    return "Wheel";
  }

  return "Slots";
}

function getLootBoxSkinLabel(slot: ArcadeCosmeticSlot, variant: string) {
  const skin = getArcadeLootBoxSkin(slot, variant);

  return skin ? `${skin.name} (${skin.rarity})` : variant;
}

function getDegradedArcadeState(): ArcadeHubState {
  return {
    cycleId: null,
    buildEndsAt: null,
    buildOpen: false,
    canPlay: false,
    canBuy: false,
    canOpen: false,
    walletBalance: 0,
    currentUser: null,
    recentTransactions: [],
    unopenedPurchases: [],
    ownedSkins: {
      unit: [],
      fortress: [],
    },
    equippedSkins: {
      unit: null,
      fortress: null,
    },
    shop: {
      unitCratePrice: 75,
      fortressCratePrice: 75,
      duplicateRefund: 30,
    },
    games: [
      {
        type: ArcadeGameType.SLOTS,
        label: "Slots",
        description: "Three reels. Match symbols to win a bigger payout.",
      },
      {
        type: ArcadeGameType.DICE,
        label: "Dice table",
        description: "Bet high or low on a two-die roll.",
      },
      {
        type: ArcadeGameType.WHEEL,
        label: "Wheel",
        description: "Bet on a color and ride the wheel.",
      },
    ],
    lockedMessage:
      "The arcade opens during the build phase between season start and the next Wednesday.",
  };
}

export default async function ArcadePage() {
  const session = await auth();
  let state: ArcadeHubState = getDegradedArcadeState();

  try {
    state = await getArcadeHubState({
      userId: session?.user?.id,
    });
  } catch (error) {
    console.error("Failed to load arcade hub", error);
  }

  const hasHubAccess = state.buildOpen && Boolean(state.currentUser);

  return (
    <main className={styles.page}>
      <header className={styles.hero}>
        <div className={styles.heroCopy}>
          <span className={styles.sectionLabel}>Arcade</span>
          <h1>Arcade hub</h1>
          <p>
            Spend arcade coins on a few risk games, open themed loot boxes, and
            equip the skins you pull during the build phase.
          </p>
        </div>
        <div className={styles.meta}>
          <div>
            <span>Build ends</span>
            <strong>{formatDateTime(state.buildEndsAt)}</strong>
          </div>
          <div>
            <span>Wallet</span>
            <strong>{state.walletBalance} coins</strong>
          </div>
          <div>
            <span>Status</span>
            <strong>{state.buildOpen ? "Open" : "Locked"}</strong>
          </div>
        </div>
      </header>

      {hasHubAccess ? (
        <section className={styles.hubGrid}>
          <article className={styles.card}>
            <div className={styles.cardHeader}>
              <div>
                <span className={styles.sectionLabel}>Games</span>
                <h2>Pick a cabinet</h2>
                <p>{state.lockedMessage ?? "Choose a game and stake coins."}</p>
              </div>
            </div>

            <div className={styles.gameGrid}>
              {state.games.map((game) => (
                <section className={styles.gameCard} key={game.type}>
                  <span className={styles.subLabel}>{game.label}</span>
                  <h3>{game.label}</h3>
                  <p>{game.description}</p>

                  <form action={playArcadeGameAction} className={styles.formStack}>
                    <input type="hidden" name="cycleId" value={state.cycleId ?? ""} />
                    <input type="hidden" name="gameType" value={game.type} />
                    <label className={styles.field}>
                      <span>Stake</span>
                      <input
                        name="stake"
                        type="number"
                        min={5}
                        max={100}
                        defaultValue={10}
                        required
                      />
                    </label>

                    {game.type === ArcadeGameType.DICE ? (
                      <label className={styles.field}>
                        <span>Bet</span>
                        <select name="choice" defaultValue="HIGH">
                          <option value="HIGH">High</option>
                          <option value="LOW">Low</option>
                        </select>
                      </label>
                    ) : null}

                    {game.type === ArcadeGameType.WHEEL ? (
                      <label className={styles.field}>
                        <span>Color</span>
                        <select name="choice" defaultValue="RED">
                          <option value="RED">Red</option>
                          <option value="BLUE">Blue</option>
                          <option value="GOLD">Gold</option>
                        </select>
                      </label>
                    ) : null}

                    <button className={styles.primaryButton} type="submit">
                      Spin
                    </button>
                  </form>
                </section>
              ))}
            </div>
          </article>

          <article className={styles.card}>
            <div className={styles.cardHeader}>
              <div>
                <span className={styles.sectionLabel}>Shop</span>
                <h2>Loot boxes and skins</h2>
                <p>
                  Buy crates with coins, open them from your inventory, and equip
                  the skins you unlock.
                </p>
              </div>
            </div>

            <div className={styles.shopGrid}>
              <section className={styles.shopCard}>
                <span className={styles.subLabel}>Unit Crate</span>
                <h3>{state.shop.unitCratePrice} coins</h3>
                <p>Unlock a random unit cosmetic skin.</p>
                <form action={purchaseArcadeLootBoxAction}>
                  <input type="hidden" name="crateType" value={ArcadeLootBoxType.UNIT} />
                  <button className={styles.secondaryButton} type="submit">
                    Buy crate
                  </button>
                </form>
              </section>

              <section className={styles.shopCard}>
                <span className={styles.subLabel}>Fortress Crate</span>
                <h3>{state.shop.fortressCratePrice} coins</h3>
                <p>Unlock a random fortress cosmetic skin.</p>
                <form action={purchaseArcadeLootBoxAction}>
                  <input
                    type="hidden"
                    name="crateType"
                    value={ArcadeLootBoxType.FORTRESS}
                  />
                  <button className={styles.secondaryButton} type="submit">
                    Buy crate
                  </button>
                </form>
              </section>
            </div>

            <section className={styles.catalogCard}>
              <div className={styles.cardHeader}>
                <div>
                  <span className={styles.sectionLabel}>Loot box catalog</span>
                  <h3>Skin catalog</h3>
                  <p>
                    Unit crates pull from the unit pool. Fortress crates now pull
                    from two fortress sheets.
                  </p>
                </div>
                <div className={styles.catalogSheets}>
                  <Image
                    alt="Loot box set 1 sheet"
                    className={styles.catalogImage}
                    height={512}
                    src="/assets/loot-box-set-1.png"
                    width={512}
                  />
                  <Image
                    alt="Loot box fortress set 2 sheet"
                    className={styles.catalogImage}
                    height={512}
                    src="/assets/loot-box-fortress-set2.png"
                    width={512}
                  />
                </div>
              </div>

              <details className={styles.catalogDetails}>
                <summary>View full skin pool</summary>
                <div className={styles.catalogColumns}>
                  <div>
                    <h4>Fortress set 1</h4>
                    <ul className={styles.catalogList}>
                      {ARCADE_LOOT_BOX_SKINS[ArcadeCosmeticSlot.FORTRESS]
                        .slice(0, 8)
                        .map((skin) => (
                          <li key={skin.variant}>
                            <strong>{skin.name}</strong>
                            <span>{skin.rarity}</span>
                            <p>{skin.description}</p>
                          </li>
                        ))}
                    </ul>
                  </div>
                  <div>
                    <h4>Fortress set 2</h4>
                    <ul className={styles.catalogList}>
                      {ARCADE_LOOT_BOX_SKINS[ArcadeCosmeticSlot.FORTRESS]
                        .slice(8)
                        .map((skin) => (
                          <li key={skin.variant}>
                            <strong>{skin.name}</strong>
                            <span>{skin.rarity}</span>
                            <p>{skin.description}</p>
                          </li>
                        ))}
                    </ul>
                  </div>
                  <div>
                    <h4>Unit crate</h4>
                    <ul className={styles.catalogList}>
                      {ARCADE_LOOT_BOX_SKINS[ArcadeCosmeticSlot.UNIT].map((skin) => (
                        <li key={skin.variant}>
                          <strong>{skin.name}</strong>
                          <span>{skin.rarity}</span>
                          <p>{skin.description}</p>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </details>
            </section>

            <div className={styles.inventoryGrid}>
              <section className={styles.inventoryCard}>
                <span className={styles.subLabel}>Open crates</span>
                {state.unopenedPurchases.length > 0 ? (
                  <div className={styles.purchaseList}>
                    {state.unopenedPurchases.map((purchase) => (
                      <form
                        action={openArcadeLootBoxAction}
                        className={styles.purchaseRow}
                        key={purchase.id}
                      >
                        <input type="hidden" name="purchaseId" value={purchase.id} />
                        <div>
                          <strong>
                            {purchase.crateType === ArcadeLootBoxType.UNIT
                              ? "Unit crate"
                              : "Fortress crate"}
                          </strong>
                          <p>
                            Purchased {formatDateTime(purchase.createdAt)} for{" "}
                            {purchase.price} coins.
                          </p>
                        </div>
                        <button className={styles.primaryButton} type="submit">
                          Open
                        </button>
                      </form>
                    ))}
                  </div>
                ) : (
                  <p className={styles.helperText}>
                    No unopened crates right now.
                  </p>
                )}
              </section>

              <section className={styles.inventoryCard}>
                <span className={styles.subLabel}>Owned skins</span>
                <div className={styles.skinColumns}>
                  <div>
                    <h4>Unit</h4>
                    {state.ownedSkins.unit.length > 0 ? (
                      <div className={styles.skinList}>
                        {state.ownedSkins.unit.map((unlock) => (
                          <div className={styles.skinRow} key={unlock.id}>
                            <span>
                              {getLootBoxSkinLabel(ArcadeCosmeticSlot.UNIT, unlock.variant)}
                              {unlock.equipped ? " (equipped)" : ""}
                            </span>
                            {!unlock.equipped ? (
                              <form action={equipCosmeticUnlockAction}>
                                <input type="hidden" name="unlockId" value={unlock.id} />
                                <input
                                  type="hidden"
                                  name="slot"
                                  value={ArcadeCosmeticSlot.UNIT}
                                />
                                <button className={styles.secondaryButton} type="submit">
                                  Equip
                                </button>
                              </form>
                            ) : null}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className={styles.helperText}>No unit skins unlocked yet.</p>
                    )}
                  </div>
                  <div>
                    <h4>Fortress</h4>
                    {state.ownedSkins.fortress.length > 0 ? (
                      <div className={styles.skinList}>
                        {state.ownedSkins.fortress.map((unlock) => (
                          <div className={styles.skinRow} key={unlock.id}>
                            <span>
                              {getLootBoxSkinLabel(
                                ArcadeCosmeticSlot.FORTRESS,
                                unlock.variant
                              )}
                              {unlock.equipped ? " (equipped)" : ""}
                            </span>
                            {!unlock.equipped ? (
                              <form action={equipCosmeticUnlockAction}>
                                <input type="hidden" name="unlockId" value={unlock.id} />
                                <input
                                  type="hidden"
                                  name="slot"
                                  value={ArcadeCosmeticSlot.FORTRESS}
                                />
                                <button className={styles.secondaryButton} type="submit">
                                  Equip
                                </button>
                              </form>
                            ) : null}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className={styles.helperText}>
                        No fortress skins unlocked yet.
                      </p>
                    )}
                  </div>
                </div>
              </section>
            </div>
          </article>

          <article className={styles.card}>
            <span className={styles.subLabel}>Ledger</span>
            <h2>Recent arcade activity</h2>
            {state.recentTransactions.length > 0 ? (
              <ul className={styles.ledgerList}>
                {state.recentTransactions.map((entry) => (
                  <li key={entry.id}>
                    <div>
                      <strong>{entry.summary}</strong>
                      <p>
                        {getGameLabel(entry.gameType ?? ArcadeGameType.SLOTS)} -{" "}
                        {entry.kind}
                      </p>
                    </div>
                    <div className={styles.ledgerMeta}>
                      <span>{entry.amount >= 0 ? "+" : ""}
                        {entry.amount}
                      </span>
                      <small>{entry.balanceAfter} coins</small>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className={styles.helperText}>No arcade activity yet.</p>
            )}
          </article>
        </section>
      ) : (
        <section className={styles.lockedCard}>
          <span className={styles.sectionLabel}>Locked</span>
          <h2>The arcade opens during the build phase.</h2>
          <p>
            {state.lockedMessage ??
              "Join the current build phase first, then come back to play and shop."}
          </p>
          <div className={styles.actions}>
            <Link className={styles.secondaryButton} href="/">
              Back to home
            </Link>
            <Link className={styles.primaryButton} href="/history">
              Open history
            </Link>
          </div>
        </section>
      )}
    </main>
  );
}
