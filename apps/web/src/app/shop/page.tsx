import Link from "next/link";
import { auth } from "@/auth";
import {
  equipCosmeticUnlockAction,
  openArcadeLootBoxAction,
  purchaseArcadeLootBoxAction,
} from "@/app/game-actions";
import { ArcadeCosmeticSlot, ArcadeLootBoxType } from "@/lib/prisma-client";
import { getArcadeLootBoxSkin } from "@/lib/game/constants";
import { getArcadeHubState, type ArcadeHubState } from "@/lib/game/arcade";
import { ShopLootReveal } from "./shop-loot-reveal";
import styles from "../arcade/page.module.css";

export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const dateTimeFormatter = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "short",
});

function getSearchValue(
  value: string | string[] | undefined
): string | undefined {
  if (Array.isArray(value)) {
    return value[0];
  }

  return value;
}

function formatDateTime(value: Date | null) {
  return value ? dateTimeFormatter.format(value) : "Unknown";
}

function getLootBoxSkinMeta(slot: ArcadeCosmeticSlot, variant: string) {
  const skin = getArcadeLootBoxSkin(slot, variant);

  return skin
    ? {
        name: skin.name,
        rarity: skin.rarity,
      }
    : {
        name: variant,
        rarity: "Common" as const,
      };
}

function getDegradedShopState(): ArcadeHubState {
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
    games: [],
    lockedMessage:
      "The shop opens during the build phase between season start and the next Wednesday.",
  };
}

export default async function ShopPage({
  searchParams,
}: {
  searchParams?: SearchParams;
}) {
  const params = (await searchParams) ?? {};
  const session = await auth();
  let state: ArcadeHubState = getDegradedShopState();

  try {
    state = await getArcadeHubState({
      userId: session?.user?.id,
    });
  } catch (error) {
    console.error("Failed to load shop hub", error);
  }

  const hasHubAccess = state.buildOpen && Boolean(state.currentUser);
  const revealSlot =
    getSearchValue(params.slot) === ArcadeCosmeticSlot.FORTRESS
      ? ArcadeCosmeticSlot.FORTRESS
      : getSearchValue(params.slot) === ArcadeCosmeticSlot.UNIT
        ? ArcadeCosmeticSlot.UNIT
        : null;
  const revealVariant = getSearchValue(params.variant);
  const revealSkin =
    getSearchValue(params.reveal) === "loot-box" && revealSlot && revealVariant
      ? getArcadeLootBoxSkin(revealSlot, revealVariant)
      : null;

  return (
    <main className={styles.page}>
      {revealSkin ? (
        <ShopLootReveal
          duplicate={getSearchValue(params.duplicate) === "1"}
          skin={{
            slot: revealSkin.slot,
            variant: revealSkin.variant,
            name: revealSkin.name,
            rarity: revealSkin.rarity,
            description: revealSkin.description,
          }}
        />
      ) : null}
      <header className={styles.hero}>
        <div className={styles.heroCopy}>
          <span className={styles.sectionLabel}>Shop</span>
          <h1>Shop</h1>
          <p>
            Browse featured crates, open them from your stash, and build out
            your cosmetic collection during the build phase.
          </p>
          <div className={styles.marketBanner}>
            <span className={styles.marketPill}>Featured crates</span>
            <span className={styles.marketPill}>Cosmetics only</span>
            <span className={styles.marketPill}>Build phase market</span>
          </div>
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
                <span className={styles.sectionLabel}>Featured crates</span>
                <h2>Today&apos;s market</h2>
                <p>
                  Buy crates with coins, open them from your inventory, and
                  equip the skins you unlock.
                </p>
              </div>
            </div>

            <div className={styles.shopGrid}>
              <section className={styles.shopCard}>
                <div
                  aria-hidden="true"
                  className={`${styles.lootBoxArt} ${styles.lootBoxArtUnit}`}
                />
                <div className={styles.shopCardHeader}>
                  <span className={styles.subLabel}>Unit Crate</span>
                  <span className={styles.marketPill}>Unit skins</span>
                </div>
                <div className={styles.priceLine}>
                  <h3>{state.shop.unitCratePrice}</h3>
                  <span>coins</span>
                </div>
                <p>Unlock a random unit cosmetic skin.</p>
                <form action={purchaseArcadeLootBoxAction}>
                  <input
                    type="hidden"
                    name="crateType"
                    value={ArcadeLootBoxType.UNIT}
                  />
                  <button className={styles.primaryButton} type="submit">
                    Buy crate
                  </button>
                </form>
              </section>

              <section className={styles.shopCard}>
                <div
                  aria-hidden="true"
                  className={`${styles.lootBoxArt} ${styles.lootBoxArtFortress}`}
                />
                <div className={styles.shopCardHeader}>
                  <span className={styles.subLabel}>Fortress Crate</span>
                  <span className={styles.marketPill}>Fortress skins</span>
                </div>
                <div className={styles.priceLine}>
                  <h3>{state.shop.fortressCratePrice}</h3>
                  <span>coins</span>
                </div>
                <p>Unlock a random fortress cosmetic skin.</p>
                <form action={purchaseArcadeLootBoxAction}>
                  <input
                    type="hidden"
                    name="crateType"
                    value={ArcadeLootBoxType.FORTRESS}
                  />
                  <button className={styles.primaryButton} type="submit">
                    Buy crate
                  </button>
                </form>
              </section>
            </div>

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
                        <input
                          type="hidden"
                          name="purchaseId"
                          value={purchase.id}
                        />
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
                        {state.ownedSkins.unit.map((unlock) => {
                          const skin = getLootBoxSkinMeta(
                            ArcadeCosmeticSlot.UNIT,
                            unlock.variant
                          );

                          return (
                            <div className={styles.skinRow} key={unlock.id}>
                              <div className={styles.skinInfo}>
                                <span className={styles.skinName}>
                                  {skin.name}
                                </span>
                                <div className={styles.skinBadges}>
                                  <span
                                    className={styles.rarityChip}
                                    data-rarity={skin.rarity}
                                  >
                                    {skin.rarity}
                                  </span>
                                  {unlock.equipped ? (
                                    <span className={styles.equippedChip}>
                                      Equipped
                                    </span>
                                  ) : null}
                                </div>
                              </div>
                              {!unlock.equipped ? (
                                <form action={equipCosmeticUnlockAction}>
                                  <input
                                    type="hidden"
                                    name="unlockId"
                                    value={unlock.id}
                                  />
                                  <input
                                    type="hidden"
                                    name="slot"
                                    value={ArcadeCosmeticSlot.UNIT}
                                  />
                                  <button
                                    className={styles.secondaryButton}
                                    type="submit"
                                  >
                                    Equip
                                  </button>
                                </form>
                              ) : null}
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <p className={styles.emptyState}>
                        No unit skins unlocked yet. Open a unit crate to start
                        your collection.
                      </p>
                    )}
                  </div>
                  <div>
                    <h4>Fortress</h4>
                    {state.ownedSkins.fortress.length > 0 ? (
                      <div className={styles.skinList}>
                        {state.ownedSkins.fortress.map((unlock) => {
                          const skin = getLootBoxSkinMeta(
                            ArcadeCosmeticSlot.FORTRESS,
                            unlock.variant
                          );

                          return (
                            <div className={styles.skinRow} key={unlock.id}>
                              <div className={styles.skinInfo}>
                                <span className={styles.skinName}>
                                  {skin.name}
                                </span>
                                <div className={styles.skinBadges}>
                                  <span
                                    className={styles.rarityChip}
                                    data-rarity={skin.rarity}
                                  >
                                    {skin.rarity}
                                  </span>
                                  {unlock.equipped ? (
                                    <span className={styles.equippedChip}>
                                      Equipped
                                    </span>
                                  ) : null}
                                </div>
                              </div>
                              {!unlock.equipped ? (
                                <form action={equipCosmeticUnlockAction}>
                                  <input
                                    type="hidden"
                                    name="unlockId"
                                    value={unlock.id}
                                  />
                                  <input
                                    type="hidden"
                                    name="slot"
                                    value={ArcadeCosmeticSlot.FORTRESS}
                                  />
                                  <button
                                    className={styles.secondaryButton}
                                    type="submit"
                                  >
                                    Equip
                                  </button>
                                </form>
                              ) : null}
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <p className={styles.emptyState}>
                        No fortress skins unlocked yet. Open a fortress crate to
                        start your collection.
                      </p>
                    )}
                  </div>
                </div>
              </section>
            </div>
          </article>

          <article className={styles.card}>
            <span className={styles.subLabel}>Ledger</span>
            <h2>Recent activity</h2>
            {state.recentTransactions.length > 0 ? (
              <ul className={styles.ledgerList}>
                {state.recentTransactions.map((entry) => (
                  <li key={entry.id}>
                    <div>
                      <strong>{entry.summary}</strong>
                      <p>{entry.kind}</p>
                    </div>
                    <div className={styles.ledgerMeta}>
                      <span>
                        {entry.amount >= 0 ? "+" : ""}
                        {entry.amount}
                      </span>
                      <small>{entry.balanceAfter} coins</small>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className={styles.helperText}>No shop activity yet.</p>
            )}
          </article>
        </section>
      ) : (
        <section className={styles.lockedCard}>
          <span className={styles.sectionLabel}>Locked</span>
          <h2>The shop opens during the build phase.</h2>
          <p>
            {state.lockedMessage ??
              "Join the current build phase first, then come back to buy crates and open them."}
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
