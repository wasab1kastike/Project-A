import { prisma } from "@/lib/prisma";
import {
  ChatMessageType,
  type Prisma,
  type PrismaClient,
} from "@/lib/prisma-client";
import {
  GOD_EMPEROR_CHAT_AUTHOR_NAME,
  GOD_EMPEROR_USER_EMAIL,
} from "./constants";
import { GameError } from "./errors";
import { ensureLastReadChatColumn } from "./schema-guards";

const CHAT_MESSAGE_MAX_LENGTH = 280;
const CHAT_MESSAGES_LIMIT = 40;
const CHAT_RATE_LIMIT_WINDOW_MS = 60_000;
const CHAT_RATE_LIMIT_COUNT = 6;
const GOD_EMPEROR_RATE_LIMIT_COUNT = 6;
const CHAT_GIF_PROVIDER = "giphy";
const CHAT_GIF_TITLE_MAX_LENGTH = 160;
const CHAT_GIF_ID_MAX_LENGTH = 120;

type DatabaseClient = PrismaClient | Prisma.TransactionClient;
type ChatGifInput = {
  providerId: string;
  title: string;
  previewUrl: string;
  displayUrl: string;
  width: number;
  height: number;
  sourceUrl: string;
};

function normalizeChatBody(input: string) {
  const normalized = input.replace(/\r\n/g, "\n").replace(/\s+/g, " ").trim();

  if (!normalized) {
    throw new GameError("Chat message cannot be empty.");
  }

  if (normalized.length > CHAT_MESSAGE_MAX_LENGTH) {
    throw new GameError(
      `Chat message must be ${CHAT_MESSAGE_MAX_LENGTH} characters or fewer.`
    );
  }

  return normalized;
}

async function getCurrentCycle(db: DatabaseClient) {
  return db.cycle.findFirst({
    where: {
      resolvedAt: null,
    },
    orderBy: {
      createdAt: "desc",
    },
  });
}

async function ensureGodEmperorUser(db: DatabaseClient) {
  return db.user.upsert({
    where: {
      email: GOD_EMPEROR_USER_EMAIL,
    },
    update: {
      name: GOD_EMPEROR_CHAT_AUTHOR_NAME,
    },
    create: {
      email: GOD_EMPEROR_USER_EMAIL,
      name: GOD_EMPEROR_CHAT_AUTHOR_NAME,
    },
  });
}

export async function sendChatMessage({
  userId,
  body,
  now = new Date(),
  db = prisma,
}: {
  userId: string;
  body: string;
  now?: Date;
  db?: PrismaClient;
}) {
  const normalizedBody = normalizeChatBody(body);

  return db.$transaction(async (tx) => {
    const cycle = await getCurrentCycle(tx);

    if (!cycle) {
      throw new GameError("Chat is unavailable until a cycle exists.");
    }

    await assertWithinChatRateLimit({ tx, cycleId: cycle.id, userId, now });

    return tx.chatMessage.create({
      data: {
        cycleId: cycle.id,
        authorId: userId,
        type: ChatMessageType.TEXT,
        body: normalizedBody,
        createdAt: now,
      },
      include: {
        author: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });
  });
}

export async function sendChatGifMessage({
  userId,
  gif,
  now = new Date(),
  db = prisma,
}: {
  userId: string;
  gif: ChatGifInput;
  now?: Date;
  db?: PrismaClient;
}) {
  const normalizedGif = normalizeChatGif(gif);

  return db.$transaction(async (tx) => {
    const cycle = await getCurrentCycle(tx);

    if (!cycle) {
      throw new GameError("Chat is unavailable until a cycle exists.");
    }

    await assertWithinChatRateLimit({ tx, cycleId: cycle.id, userId, now });

    return tx.chatMessage.create({
      data: {
        cycleId: cycle.id,
        authorId: userId,
        type: ChatMessageType.GIF,
        body: normalizedGif.title,
        gifProvider: CHAT_GIF_PROVIDER,
        gifProviderId: normalizedGif.providerId,
        gifTitle: normalizedGif.title,
        gifPreviewUrl: normalizedGif.previewUrl,
        gifDisplayUrl: normalizedGif.displayUrl,
        gifWidth: normalizedGif.width,
        gifHeight: normalizedGif.height,
        gifSourceUrl: normalizedGif.sourceUrl,
        createdAt: now,
      },
      include: {
        author: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });
  });
}

export async function sendGodEmperorChatMessage({
  body,
  now = new Date(),
  db = prisma,
}: {
  body: string;
  now?: Date;
  db?: PrismaClient;
}) {
  const normalizedBody = normalizeChatBody(body);

  return db.$transaction(async (tx) => {
    const cycle = await getCurrentCycle(tx);

    if (!cycle) {
      throw new GameError("Chat is unavailable until a cycle exists.");
    }

    const godEmperor = await ensureGodEmperorUser(tx);

    await assertWithinChatRateLimit({
      tx,
      cycleId: cycle.id,
      userId: godEmperor.id,
      now,
      limit: GOD_EMPEROR_RATE_LIMIT_COUNT,
      message: "God Emperor chat is limited to 6 messages per minute.",
    });

    return tx.chatMessage.create({
      data: {
        cycleId: cycle.id,
        authorId: godEmperor.id,
        type: ChatMessageType.TEXT,
        body: normalizedBody,
        createdAt: now,
      },
      include: {
        author: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });
  });
}

export async function markChatRead({
  userId,
  now = new Date(),
  db = prisma,
}: {
  userId: string;
  now?: Date;
  db?: PrismaClient;
}) {
  await ensureLastReadChatColumn(db);

  return db.user.updateMany({
    where: {
      id: userId,
    },
    data: {
      lastReadChatAt: now,
    },
  });
}

function normalizeGifText(input: string, fallback: string, maxLength: number) {
  const normalized = input.replace(/\s+/g, " ").trim();

  return (normalized || fallback).slice(0, maxLength);
}

function parseHttpsUrl(input: string, fieldName: string) {
  let url: URL;

  try {
    url = new URL(input);
  } catch {
    throw new GameError(`${fieldName} must be a valid URL.`);
  }

  if (url.protocol !== "https:") {
    throw new GameError(`${fieldName} must use HTTPS.`);
  }

  return url;
}

function isGiphyMediaHost(hostname: string) {
  return /^media\d*\.giphy\.com$/.test(hostname) || hostname === "i.giphy.com";
}

function normalizeChatGif(input: ChatGifInput) {
  const providerId = normalizeGifText(
    input.providerId,
    "",
    CHAT_GIF_ID_MAX_LENGTH
  );

  if (!providerId) {
    throw new GameError("GIF id is required.");
  }

  const previewUrl = parseHttpsUrl(input.previewUrl, "GIF preview URL");
  const displayUrl = parseHttpsUrl(input.displayUrl, "GIF display URL");
  const sourceUrl = parseHttpsUrl(input.sourceUrl, "GIF source URL");

  if (
    !isGiphyMediaHost(previewUrl.hostname) ||
    !isGiphyMediaHost(displayUrl.hostname)
  ) {
    throw new GameError("Only GIPHY media URLs can be posted.");
  }

  if (!["giphy.com", "www.giphy.com"].includes(sourceUrl.hostname)) {
    throw new GameError("Only GIPHY source URLs can be posted.");
  }

  const width = Math.trunc(input.width);
  const height = Math.trunc(input.height);

  if (width < 1 || height < 1 || width > 2000 || height > 2000) {
    throw new GameError("GIF dimensions are invalid.");
  }

  const title = normalizeGifText(
    input.title,
    "GIPHY GIF",
    CHAT_GIF_TITLE_MAX_LENGTH
  );

  return {
    providerId,
    title,
    previewUrl: previewUrl.toString(),
    displayUrl: displayUrl.toString(),
    width,
    height,
    sourceUrl: sourceUrl.toString(),
  };
}

async function assertWithinChatRateLimit({
  tx,
  cycleId,
  userId,
  now,
  limit = CHAT_RATE_LIMIT_COUNT,
  message = "Chat is limited to 6 messages per minute.",
}: {
  tx: DatabaseClient;
  cycleId: string;
  userId: string;
  now: Date;
  limit?: number;
  message?: string;
}) {
  const rateLimitBoundary = new Date(now.getTime() - CHAT_RATE_LIMIT_WINDOW_MS);
  const recentMessageCount = await tx.chatMessage.count({
    where: {
      cycleId,
      authorId: userId,
      createdAt: {
        gte: rateLimitBoundary,
      },
    },
  });

  if (recentMessageCount >= limit) {
    throw new GameError(message);
  }
}

export function getChatLimits() {
  return {
    maxLength: CHAT_MESSAGE_MAX_LENGTH,
    limit: CHAT_MESSAGES_LIMIT,
    rateLimitCount: CHAT_RATE_LIMIT_COUNT,
  };
}
