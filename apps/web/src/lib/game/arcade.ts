import { randomInt } from "node:crypto";
import { prisma } from "@/lib/prisma";
import {
  ArcadeCosmeticSlot,
  ArcadeGameType,
  ArcadeLootBoxType,
  ArcadeTransactionKind,
  CycleStatus,
  Prisma,
  type PrismaClient,
} from "@/lib/prisma-client";
import { GameError } from "./errors";
import {
  ARCADE_FORTRESS_LOOT_BOX_PRICE,
  ARCADE_LOOT_BOX_DUPLICATE_REFUND,
  ARCADE_MAX_STAKE,
  ARCADE_MIN_STAKE,
  ARCADE_SEASON_BASE_COINS,
  ARCADE_SEASON_POINTS_BONUS_CAP,
  ARCADE_SEASON_POINTS_BONUS_DIVISOR,
  getArcadeSeasonRankBonus,
  ARCADE_UNIT_LOOT_BOX_PRICE,
  ARCADE_LOOT_BOX_SKINS,
  type ArcadeLootBoxSkin,
} from "./constants";

type DatabaseClient = PrismaClient | Prisma.TransactionClient;

const ARCadeSkinPool: Record<ArcadeCosmeticSlot, readonly ArcadeLootBoxSkin[]> =
  ARCADE_LOOT_BOX_SKINS;

export type ArcadeHubState = Awaited<ReturnType<typeof getArcadeHubState>>;

function normalizeStake(stake: number) {
  if (!Number.isFinite(stake)) {
    return 0;
  }

  return Math.max(0, Math.trunc(stake));
}

function getSeasonBonus(points: number) {
  return Math.min(
    ARCADE_SEASON_POINTS_BONUS_CAP,
    Math.max(0, Math.trunc(points / ARCADE_SEASON_POINTS_BONUS_DIVISOR))
  );
}

function pickRandom<T>(items: readonly T[]) {
  return items[randomInt(items.length)];
}

function formatMoney(amount: number) {
  return `${amount >= 0 ? "+" : ""}${amount} coins`;
}

async function ensureArcadeWallet(db: DatabaseClient, userId: string) {
  return db.arcadeWallet.upsert({
    where: {
      userId,
    },
    create: {
      userId,
      balance: 0,
    },
    update: {},
    select: {
      id: true,
      balance: true,
    },
  });
}

async function getCurrentBuildCycle(db: DatabaseClient, now: Date) {
  return db.cycle.findFirst({
    where: {
      resolvedAt: null,
      status: CycleStatus.REGISTRATION,
      registrationEndsAt: {
        gt: now,
      },
    },
    orderBy: {
      createdAt: "desc",
    },
    select: {
      id: true,
      registrationEndsAt: true,
      status: true,
    },
  });
}

async function getCurrentShopCycle(db: DatabaseClient) {
  return db.cycle.findFirst({
    where: {
      resolvedAt: null,
    },
    orderBy: {
      createdAt: "desc",
    },
    select: {
      id: true,
      registrationEndsAt: true,
      status: true,
    },
  });
}

async function getPlayerFortress(
  db: DatabaseClient,
  cycleId: string,
  userId: string
) {
  return db.fortress.findFirst({
    where: {
      cycleId,
      ownerId: userId,
      isNpc: false,
    },
    select: {
      id: true,
      ownerId: true,
      commanderName: true,
      name: true,
    },
  });
}

function getGameOutcome(
  gameType: ArcadeGameType,
  stake: number,
  choice: string | null
) {
  if (gameType === ArcadeGameType.SLOTS) {
    const symbols = [
      "coin",
      "coin",
      "gem",
      "gem",
      "crown",
      "bar",
      "skull",
    ] as const;
    const reels = [
      pickRandom(symbols),
      pickRandom(symbols),
      pickRandom(symbols),
    ];
    const counts = reels.reduce<Record<string, number>>((acc, symbol) => {
      acc[symbol] = (acc[symbol] ?? 0) + 1;
      return acc;
    }, {});
    const triple = counts[reels[0]] === 3;
    const pair = Object.values(counts).some((count) => count === 2);
    const payout =
      triple && reels[0] === "crown"
        ? stake * 8
        : triple
          ? stake * 5
          : pair
            ? stake * 2
            : 0;

    return {
      summary:
        payout > 0
          ? `Slots hit ${reels.join(" / ")} and paid ${formatMoney(payout)}.`
          : `Slots landed ${reels.join(" / ")} and lost the stake.`,
      payout,
      details: {
        reels,
        pair,
        triple,
      },
    };
  }

  if (gameType === ArcadeGameType.DICE) {
    const left = randomInt(1, 7);
    const right = randomInt(1, 7);
    const total = left + right;
    const pickedHigh = choice === "HIGH";
    const pickedLow = choice === "LOW";
    const luckySeven = total === 7;
    const won =
      luckySeven || (pickedHigh && total >= 8) || (pickedLow && total <= 6);
    const payout = luckySeven ? stake * 3 : won ? stake * 2 : 0;

    return {
      summary: won
        ? `Dice rolled ${total} (${left} + ${right}) and paid ${formatMoney(payout)}.`
        : `Dice rolled ${total} (${left} + ${right}) and the table kept the stake.`,
      payout,
      details: {
        left,
        right,
        total,
        choice,
      },
    };
  }

  const wheel = [
    { label: "red", multiplier: 2 },
    { label: "red", multiplier: 2 },
    { label: "blue", multiplier: 2 },
    { label: "blue", multiplier: 2 },
    { label: "green", multiplier: 0 },
    { label: "green", multiplier: 0 },
    { label: "gold", multiplier: 5 },
    { label: "gold", multiplier: 5 },
  ] as const;
  const landed = pickRandom(wheel);
  const chosen = choice?.toLowerCase() ?? "";
  const won = landed.label === chosen;
  const payout = won ? stake * landed.multiplier : 0;

  return {
    summary: won
      ? `Wheel landed on ${landed.label} and paid ${formatMoney(payout)}.`
      : `Wheel landed on ${landed.label} and the bet missed.`,
    payout,
    details: {
      landed: landed.label,
      multiplier: landed.multiplier,
      choice,
    },
  };
}

async function createLedgerEntry({
  db,
  userId,
  cycleId,
  kind,
  gameType,
  amount,
  balanceAfter,
  summary,
  details,
  dedupeKey,
}: {
  db: DatabaseClient;
  userId: string;
  cycleId?: string | null;
  kind: ArcadeTransactionKind;
  gameType?: ArcadeGameType | null;
  amount: number;
  balanceAfter: number;
  summary: string;
  details?: Record<string, unknown>;
  dedupeKey?: string;
}) {
  return db.arcadeTransaction.create({
    data: {
      userId,
      cycleId: cycleId ?? null,
      kind,
      gameType: gameType ?? null,
      amount,
      balanceAfter,
      summary,
      details: details ? JSON.stringify(details) : null,
      dedupeKey,
    },
  });
}

async function withArcadeTransaction<T>(
  db: DatabaseClient,
  run: (tx: DatabaseClient) => Promise<T>,
  isolationLevel?: Prisma.TransactionIsolationLevel
) {
  if ("$transaction" in db) {
    if (isolationLevel) {
      return db.$transaction((tx) => run(tx), {
        isolationLevel,
      });
    }

    return db.$transaction((tx) => run(tx));
  }

  return run(db);
}

export async function mintSeasonArcadeCoins({
  cycleId,
  now = new Date(),
  db = prisma,
  rankedFortresses = [],
}: {
  cycleId: string;
  now?: Date;
  db?: DatabaseClient;
  rankedFortresses?: Array<{
    ownerId: string;
  }>;
}) {
  const cycle = await db.cycle.findUnique({
    where: {
      id: cycleId,
    },
    select: {
      id: true,
      status: true,
      fortresses: {
        where: {
          isNpc: false,
        },
        select: {
          ownerId: true,
          commanderName: true,
          points: true,
        },
      },
    },
  });

  if (!cycle) {
    throw new GameError("Season arcade payout could not be minted.");
  }

  return withArcadeTransaction(db, async (tx) => {
    let mintedPlayers = 0;
    let mintedCoins = 0;
    const fortressesByOwnerId = new Map(
      cycle.fortresses.map((fortress) => [fortress.ownerId, fortress])
    );
    const fallbackRankedFortresses = [...cycle.fortresses]
      .sort(
        (left, right) =>
          right.points - left.points ||
          left.commanderName.localeCompare(right.commanderName)
      )
      .map((fortress) => ({
        ownerId: fortress.ownerId,
      }));
    const orderedFortresses = (
      rankedFortresses.length > 0 ? rankedFortresses : fallbackRankedFortresses
    )
      .map((entry, index) => {
        const fortress = fortressesByOwnerId.get(entry.ownerId);

        return fortress ? { fortress, rank: index + 1 } : null;
      })
      .filter(
        (
          entry
        ): entry is {
          fortress: (typeof cycle.fortresses)[number];
          rank: number;
        } => entry !== null
      );

    for (const { fortress, rank } of orderedFortresses) {
      const dedupeKey = `season-payout:${cycle.id}:${fortress.ownerId}`;
      const existing = await tx.arcadeTransaction.findUnique({
        where: {
          dedupeKey,
        },
        select: {
          id: true,
        },
      });

      if (existing) {
        continue;
      }

      const bonus = getSeasonBonus(fortress.points);
      const rankBonus = getArcadeSeasonRankBonus(rank);
      const payout = ARCADE_SEASON_BASE_COINS + bonus + rankBonus;
      const wallet = await ensureArcadeWallet(tx, fortress.ownerId);
      const balanceAfter = wallet.balance + payout;

      await tx.arcadeWallet.update({
        where: {
          userId: fortress.ownerId,
        },
        data: {
          balance: balanceAfter,
        },
      });

      await createLedgerEntry({
        db: tx,
        userId: fortress.ownerId,
        cycleId: cycle.id,
        kind: ArcadeTransactionKind.SEASON_PAYOUT,
        amount: payout,
        balanceAfter,
        summary: `Season payout minted for ${fortress.commanderName}.`,
        details: {
          points: fortress.points,
          baseCoins: ARCADE_SEASON_BASE_COINS,
          bonusCoins: bonus,
          rank,
          rankBonusCoins: rankBonus,
          mintedAt: now.toISOString(),
        },
        dedupeKey,
      });

      mintedPlayers += 1;
      mintedCoins += payout;
    }

    return {
      mintedPlayers,
      mintedCoins,
    };
  });
}

export async function getArcadeHubState({
  userId,
  now = new Date(),
  db = prisma,
}: {
  userId?: string;
  now?: Date;
  db?: DatabaseClient;
}) {
  const cycle = await getCurrentShopCycle(db);
  const user = userId
    ? await db.user.findUnique({
        where: {
          id: userId,
        },
        select: {
          unitCosmeticVariant: true,
          fortressCosmeticVariant: true,
        },
      })
    : null;
  const wallet = userId
    ? await db.arcadeWallet.findUnique({
        where: {
          userId,
        },
        select: {
          balance: true,
        },
      })
    : null;
  const recentTransactions = userId
    ? await db.arcadeTransaction.findMany({
        where: {
          userId,
        },
        orderBy: {
          createdAt: "desc",
        },
        take: 8,
        select: {
          id: true,
          kind: true,
          gameType: true,
          amount: true,
          balanceAfter: true,
          summary: true,
          createdAt: true,
        },
      })
    : [];
  const unopenedPurchases = userId
    ? await db.arcadeLootBoxPurchase.findMany({
        where: {
          userId,
          openedAt: null,
        },
        orderBy: {
          createdAt: "desc",
        },
        take: 8,
        select: {
          id: true,
          crateType: true,
          price: true,
          createdAt: true,
        },
      })
    : [];
  const unlockedSkins = userId
    ? await db.arcadeCosmeticUnlock.findMany({
        where: {
          userId,
        },
        orderBy: {
          createdAt: "desc",
        },
        select: {
          id: true,
          slot: true,
          variant: true,
          sourcePurchaseId: true,
          createdAt: true,
        },
      })
    : [];

  if (!cycle) {
    return {
      cycleId: null,
      buildEndsAt: null,
      buildOpen: false,
      canPlay: false,
      canBuy: false,
      canOpen: false,
      walletBalance: wallet?.balance ?? 0,
      currentUser: null,
      recentTransactions,
      unopenedPurchases,
      ownedSkins: {
        unit: unlockedSkins
          .filter((unlock) => unlock.slot === ArcadeCosmeticSlot.UNIT)
          .map((unlock) => ({
            id: unlock.id,
            variant: unlock.variant,
            sourcePurchaseId: unlock.sourcePurchaseId,
            createdAt: unlock.createdAt,
            equipped: user?.unitCosmeticVariant === unlock.variant,
          })),
        fortress: unlockedSkins
          .filter((unlock) => unlock.slot === ArcadeCosmeticSlot.FORTRESS)
          .map((unlock) => ({
            id: unlock.id,
            variant: unlock.variant,
            sourcePurchaseId: unlock.sourcePurchaseId,
            createdAt: unlock.createdAt,
            equipped: user?.fortressCosmeticVariant === unlock.variant,
          })),
      },
      equippedSkins: {
        unit: user?.unitCosmeticVariant ?? null,
        fortress: user?.fortressCosmeticVariant ?? null,
      },
      shop: {
        unitCratePrice: ARCADE_UNIT_LOOT_BOX_PRICE,
        fortressCratePrice: ARCADE_FORTRESS_LOOT_BOX_PRICE,
        duplicateRefund: ARCADE_LOOT_BOX_DUPLICATE_REFUND,
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
      lockedMessage: "The shop opens when a season cycle is running.",
    };
  }

  const buildOpen =
    cycle.status === CycleStatus.REGISTRATION && cycle.registrationEndsAt > now;
  const playerFortress = userId
    ? await getPlayerFortress(db, cycle.id, userId)
    : null;
  const hasCurrentCycleFortress = Boolean(userId && playerFortress);

  return {
    cycleId: cycle.id,
    buildEndsAt: cycle.registrationEndsAt,
    buildOpen,
    canPlay: Boolean(userId && playerFortress && buildOpen),
    canBuy: hasCurrentCycleFortress,
    canOpen: hasCurrentCycleFortress,
    walletBalance: wallet?.balance ?? 0,
    currentUser: playerFortress,
    recentTransactions,
    unopenedPurchases,
    ownedSkins: {
      unit: unlockedSkins
        .filter((unlock) => unlock.slot === ArcadeCosmeticSlot.UNIT)
        .map((unlock) => ({
          id: unlock.id,
          variant: unlock.variant,
          sourcePurchaseId: unlock.sourcePurchaseId,
          createdAt: unlock.createdAt,
          equipped: user?.unitCosmeticVariant === unlock.variant,
        })),
      fortress: unlockedSkins
        .filter((unlock) => unlock.slot === ArcadeCosmeticSlot.FORTRESS)
        .map((unlock) => ({
          id: unlock.id,
          variant: unlock.variant,
          sourcePurchaseId: unlock.sourcePurchaseId,
          createdAt: unlock.createdAt,
          equipped: user?.fortressCosmeticVariant === unlock.variant,
        })),
    },
    equippedSkins: {
      unit: user?.unitCosmeticVariant ?? null,
      fortress: user?.fortressCosmeticVariant ?? null,
    },
    shop: {
      unitCratePrice: ARCADE_UNIT_LOOT_BOX_PRICE,
      fortressCratePrice: ARCADE_FORTRESS_LOOT_BOX_PRICE,
      duplicateRefund: ARCADE_LOOT_BOX_DUPLICATE_REFUND,
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
    lockedMessage: buildOpen
      ? null
      : "Arcade games are locked outside the build phase, but the shop stays open for the current cycle.",
  };
}

export async function playArcadeGame({
  cycleId,
  userId,
  gameType,
  stake,
  choice,
  now = new Date(),
  db = prisma,
}: {
  cycleId: string;
  userId: string;
  gameType: ArcadeGameType;
  stake: number;
  choice: string | null;
  now?: Date;
  db?: DatabaseClient;
}) {
  const normalizedStake = normalizeStake(stake);

  if (
    normalizedStake < ARCADE_MIN_STAKE ||
    normalizedStake > ARCADE_MAX_STAKE
  ) {
    throw new GameError(
      `Stake must be between ${ARCADE_MIN_STAKE} and ${ARCADE_MAX_STAKE} coins.`
    );
  }

  return withArcadeTransaction(
    db,
    async (tx) => {
      const cycle = await tx.cycle.findUnique({
        where: {
          id: cycleId,
        },
        select: {
          id: true,
          status: true,
          registrationEndsAt: true,
        },
      });

      if (
        !cycle ||
        cycle.status !== CycleStatus.REGISTRATION ||
        cycle.registrationEndsAt <= now
      ) {
        throw new GameError("The arcade is only open during the build phase.");
      }

      const playerFortress = await getPlayerFortress(tx, cycleId, userId);

      if (!playerFortress) {
        throw new GameError("Only build phase players can use the arcade.");
      }

      const wallet = await ensureArcadeWallet(tx, userId);

      if (wallet.balance < normalizedStake) {
        throw new GameError("You do not have enough arcade coins.");
      }

      const outcome = getGameOutcome(gameType, normalizedStake, choice);
      const amount = outcome.payout - normalizedStake;
      const balanceAfter = wallet.balance + amount;

      await tx.arcadeWallet.update({
        where: {
          userId,
        },
        data: {
          balance: balanceAfter,
        },
      });

      await createLedgerEntry({
        db: tx,
        userId,
        cycleId,
        kind: ArcadeTransactionKind.GAME_RESULT,
        gameType,
        amount,
        balanceAfter,
        summary: outcome.summary,
        details: {
          stake: normalizedStake,
          payout: outcome.payout,
          choice,
          gameType,
          ...outcome.details,
        },
      });

      return {
        amount,
        balanceAfter,
        summary: outcome.summary,
      };
    },
    Prisma.TransactionIsolationLevel.Serializable
  );
}

export async function purchaseArcadeLootBox({
  userId,
  crateType,
  now = new Date(),
  db = prisma,
}: {
  userId: string;
  crateType: ArcadeLootBoxType;
  now?: Date;
  db?: DatabaseClient;
}) {
  const price =
    crateType === ArcadeLootBoxType.UNIT
      ? ARCADE_UNIT_LOOT_BOX_PRICE
      : ARCADE_FORTRESS_LOOT_BOX_PRICE;

  return withArcadeTransaction(
    db,
    async (tx) => {
      const cycle = await getCurrentShopCycle(tx);

      if (!cycle) {
        throw new GameError(
          "The arcade shop opens while a season cycle is running."
        );
      }

      const playerFortress = await getPlayerFortress(tx, cycle.id, userId);

      if (!playerFortress) {
        throw new GameError("Only current cycle players can buy loot boxes.");
      }

      const wallet = await ensureArcadeWallet(tx, userId);

      if (wallet.balance < price) {
        throw new GameError("You do not have enough arcade coins.");
      }

      const balanceAfter = wallet.balance - price;

      await tx.arcadeWallet.update({
        where: {
          userId,
        },
        data: {
          balance: balanceAfter,
        },
      });

      const purchase = await tx.arcadeLootBoxPurchase.create({
        data: {
          userId,
          crateType,
          price,
        },
        select: {
          id: true,
          crateType: true,
          price: true,
          createdAt: true,
        },
      });

      await createLedgerEntry({
        db: tx,
        userId,
        cycleId: cycle.id,
        kind: ArcadeTransactionKind.LOOT_BOX_PURCHASE,
        amount: -price,
        balanceAfter,
        summary: `${crateType === ArcadeLootBoxType.UNIT ? "Unit" : "Fortress"} crate purchased.`,
        details: {
          price,
          crateType,
          purchaseId: purchase.id,
        },
      });

      return {
        purchase,
        balanceAfter,
      };
    },
    Prisma.TransactionIsolationLevel.Serializable
  );
}

export async function openArcadeLootBox({
  purchaseId,
  userId,
  now = new Date(),
  db = prisma,
}: {
  purchaseId: string;
  userId: string;
  now?: Date;
  db?: DatabaseClient;
}) {
  return withArcadeTransaction(
    db,
    async (tx) => {
      const purchase = await tx.arcadeLootBoxPurchase.findUnique({
        where: {
          id: purchaseId,
        },
        select: {
          id: true,
          userId: true,
          crateType: true,
          openedAt: true,
          rewardSlot: true,
          rewardVariant: true,
          duplicatePayout: true,
        },
      });

      if (!purchase || purchase.userId !== userId) {
        throw new GameError("That loot box does not belong to you.");
      }

      if (purchase.openedAt) {
        throw new GameError("That loot box has already been opened.");
      }

      const cycle = await getCurrentShopCycle(tx);

      if (!cycle) {
        throw new GameError(
          "The arcade shop opens while a season cycle is running."
        );
      }

      const playerFortress = await getPlayerFortress(tx, cycle.id, userId);

      if (!playerFortress) {
        throw new GameError("Only current cycle players can open loot boxes.");
      }

      const slot =
        purchase.crateType === ArcadeLootBoxType.UNIT
          ? ArcadeCosmeticSlot.UNIT
          : ArcadeCosmeticSlot.FORTRESS;
      const reward = pickRandom(ARCadeSkinPool[slot]);
      const variant = reward.variant;
      const existingUnlock = await tx.arcadeCosmeticUnlock.findUnique({
        where: {
          userId_slot_variant: {
            userId,
            slot,
            variant,
          },
        },
        select: {
          id: true,
        },
      });

      let duplicatePayout = 0;
      let unlockId: string | null = null;
      let finalBalance = 0;

      if (existingUnlock) {
        duplicatePayout = ARCADE_LOOT_BOX_DUPLICATE_REFUND;
        const wallet = await ensureArcadeWallet(tx, userId);
        finalBalance = wallet.balance + duplicatePayout;

        await tx.arcadeWallet.update({
          where: {
            userId,
          },
          data: {
            balance: finalBalance,
          },
        });

        await createLedgerEntry({
          db: tx,
          userId,
          cycleId: cycle.id,
          kind: ArcadeTransactionKind.LOOT_BOX_DUPLICATE_REFUND,
          amount: duplicatePayout,
          balanceAfter: finalBalance,
          summary: `Duplicate ${slot.toLowerCase()} skin refunded ${duplicatePayout} coins.`,
          details: {
            slot,
            variant,
            rewardName: reward.name,
            rewardRarity: reward.rarity,
            purchaseId: purchase.id,
          },
        });
      } else {
        const unlock = await tx.arcadeCosmeticUnlock.create({
          data: {
            userId,
            slot,
            variant,
            sourcePurchaseId: purchase.id,
          },
          select: {
            id: true,
          },
        });
        unlockId = unlock.id;
        finalBalance = (await ensureArcadeWallet(tx, userId)).balance;
      }

      await tx.arcadeLootBoxPurchase.update({
        where: {
          id: purchase.id,
        },
        data: {
          openedAt: now,
          rewardSlot: slot,
          rewardVariant: variant,
          duplicatePayout,
        },
      });

      await createLedgerEntry({
        db: tx,
        userId,
        cycleId: cycle.id,
        kind: ArcadeTransactionKind.LOOT_BOX_OPEN,
        gameType: null,
        amount: 0,
        balanceAfter: finalBalance,
        summary:
          duplicatePayout > 0
            ? `Opened a ${slot.toLowerCase()} crate and found a duplicate ${variant} skin.`
            : `Opened a ${slot.toLowerCase()} crate and unlocked the ${variant} skin.`,
        details: {
          slot,
          variant,
          purchaseId: purchase.id,
          unlockId,
          duplicatePayout,
        },
      });

      return {
        slot,
        variant,
        reward,
        duplicatePayout,
        unlockId,
      };
    },
    Prisma.TransactionIsolationLevel.Serializable
  );
}

export async function equipCosmeticUnlock({
  unlockId,
  userId,
  slot,
  db = prisma,
}: {
  unlockId: string;
  userId: string;
  slot: ArcadeCosmeticSlot;
  db?: DatabaseClient;
}) {
  const unlock = await db.arcadeCosmeticUnlock.findUnique({
    where: {
      id: unlockId,
    },
    select: {
      id: true,
      userId: true,
      slot: true,
      variant: true,
    },
  });

  if (!unlock || unlock.userId !== userId || unlock.slot !== slot) {
    throw new GameError("That cosmetic unlock is not available to equip.");
  }

  await db.user.update({
    where: {
      id: userId,
    },
    data:
      slot === ArcadeCosmeticSlot.UNIT
        ? {
            unitCosmeticVariant: unlock.variant,
            cosmeticUnlockedAt: new Date(),
          }
        : {
            fortressCosmeticVariant: unlock.variant,
            cosmeticUnlockedAt: new Date(),
          },
  });

  return {
    slot,
    variant: unlock.variant,
  };
}
