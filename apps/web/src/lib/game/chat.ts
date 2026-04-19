import { prisma } from "@/lib/prisma";
import { type Prisma, type PrismaClient } from "@/lib/prisma-client";
import { GameError } from "./errors";

const CHAT_MESSAGE_MAX_LENGTH = 280;
const CHAT_MESSAGES_LIMIT = 40;
const CHAT_RATE_LIMIT_WINDOW_MS = 60_000;
const CHAT_RATE_LIMIT_COUNT = 6;

type DatabaseClient = PrismaClient | Prisma.TransactionClient;

function normalizeChatBody(input: string) {
  const normalized = input
    .replace(/\r\n/g, "\n")
    .replace(/\s+/g, " ")
    .trim();

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
  const rateLimitBoundary = new Date(now.getTime() - CHAT_RATE_LIMIT_WINDOW_MS);

  return db.$transaction(async (tx) => {
    const cycle = await getCurrentCycle(tx);

    if (!cycle) {
      throw new GameError("Chat is unavailable until a cycle exists.");
    }

    const recentMessageCount = await tx.chatMessage.count({
      where: {
        cycleId: cycle.id,
        authorId: userId,
        createdAt: {
          gte: rateLimitBoundary,
        },
      },
    });

    if (recentMessageCount >= CHAT_RATE_LIMIT_COUNT) {
      throw new GameError("Chat is limited to 6 messages per minute.");
    }

    return tx.chatMessage.create({
      data: {
        cycleId: cycle.id,
        authorId: userId,
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

export function getChatLimits() {
  return {
    maxLength: CHAT_MESSAGE_MAX_LENGTH,
    limit: CHAT_MESSAGES_LIMIT,
    rateLimitCount: CHAT_RATE_LIMIT_COUNT,
  };
}
