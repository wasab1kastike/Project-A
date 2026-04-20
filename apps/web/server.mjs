import http from "node:http";
import next from "next";
import { PrismaClient } from "@prisma/client";
import { Server } from "socket.io";

const dev = process.argv.includes("--dev");
const isProduction = process.env.NODE_ENV === "production";
const host = process.env.HOST ?? "0.0.0.0";
const port = Number(process.env.PORT ?? 3000);
const REFRESH_EVENT = "project-a:refresh";
const SESSION_COOKIE_NAMES = [
  "__Secure-authjs.session-token",
  "authjs.session-token",
];
const LOCAL_ALLOWED_ORIGINS = [
  "http://localhost:3000",
  "http://127.0.0.1:3000",
];
const CONNECTION_WINDOW_MS = 60_000;
const MAX_CONNECTIONS_PER_WINDOW = isProduction ? 20 : 60;
const prisma = new PrismaClient(
  process.env.DATABASE_URL
    ? {
        datasources: {
          db: {
            url: process.env.DATABASE_URL,
          },
        },
      }
    : undefined
);
const connectionAttemptsByIp = new Map();

function parseOrigin(origin) {
  if (!origin) {
    return null;
  }

  try {
    return new URL(origin).origin;
  } catch {
    return null;
  }
}

function getAllowedOrigins() {
  const values = [
    process.env.AUTH_URL,
    process.env.NEXTAUTH_URL,
    process.env.RENDER_EXTERNAL_URL,
    ...(process.env.ALLOWED_ORIGINS
      ? process.env.ALLOWED_ORIGINS.split(",")
      : []),
  ];
  const origins = new Set();

  for (const value of values) {
    const origin = parseOrigin(value?.trim());

    if (origin) {
      origins.add(origin);
    }
  }

  if (!isProduction) {
    for (const origin of LOCAL_ALLOWED_ORIGINS) {
      origins.add(origin);
    }
  }

  return origins;
}

const allowedOrigins = getAllowedOrigins();

function isAllowedOrigin(originHeader) {
  if (!originHeader) {
    return !isProduction;
  }

  const normalizedOrigin = parseOrigin(originHeader);

  return normalizedOrigin !== null && allowedOrigins.has(normalizedOrigin);
}

function parseCookies(cookieHeader) {
  if (!cookieHeader) {
    return {};
  }

  return cookieHeader.split(";").reduce((cookies, cookiePart) => {
    const separatorIndex = cookiePart.indexOf("=");

    if (separatorIndex === -1) {
      return cookies;
    }

    const name = cookiePart.slice(0, separatorIndex).trim();
    const value = cookiePart.slice(separatorIndex + 1).trim();

    if (!name) {
      return cookies;
    }

    cookies[name] = decodeURIComponent(value);
    return cookies;
  }, {});
}

function getChunkedCookieValue(cookies, baseName) {
  if (cookies[baseName]) {
    return cookies[baseName];
  }

  const chunkEntries = Object.entries(cookies)
    .filter(([name]) => name.startsWith(`${baseName}.`))
    .sort(([leftName], [rightName]) => {
      const leftSuffix = Number(leftName.split(".").pop() ?? "0");
      const rightSuffix = Number(rightName.split(".").pop() ?? "0");

      return leftSuffix - rightSuffix;
    });

  if (chunkEntries.length === 0) {
    return null;
  }

  return chunkEntries.map(([, value]) => value).join("");
}

function getSessionToken(cookieHeader) {
  const cookies = parseCookies(cookieHeader);

  for (const baseName of SESSION_COOKIE_NAMES) {
    const sessionToken = getChunkedCookieValue(cookies, baseName);

    if (sessionToken) {
      return sessionToken;
    }
  }

  return null;
}

async function getSocketUser(request) {
  const sessionToken = getSessionToken(request.headers.cookie);

  if (!sessionToken) {
    return null;
  }

  const session = await prisma.session.findUnique({
    where: {
      sessionToken,
    },
    include: {
      user: {
        select: {
          id: true,
          role: true,
        },
      },
    },
  });

  if (!session || session.expires <= new Date()) {
    return null;
  }

  return session.user;
}

function getClientIp(request) {
  const forwardedFor = request.headers["x-forwarded-for"];

  if (typeof forwardedFor === "string" && forwardedFor.length > 0) {
    return forwardedFor.split(",")[0]?.trim() ?? "unknown";
  }

  return request.socket.remoteAddress ?? "unknown";
}

function recordConnectionAttempt(ipAddress, now = Date.now()) {
  const recentAttempts = (connectionAttemptsByIp.get(ipAddress) ?? []).filter(
    (timestamp) => now - timestamp < CONNECTION_WINDOW_MS
  );

  if (recentAttempts.length >= MAX_CONNECTIONS_PER_WINDOW) {
    connectionAttemptsByIp.set(ipAddress, recentAttempts);
    return false;
  }

  recentAttempts.push(now);
  connectionAttemptsByIp.set(ipAddress, recentAttempts);
  return true;
}

function emitRefresh(io, reason = "server") {
  io.emit(REFRESH_EVENT, {
    reason,
    at: new Date().toISOString(),
  });
}

async function getRealtimeSnapshot() {
  const [cycle, fortress, chatMessage] = await Promise.all([
    prisma.cycle.findFirst({
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        updatedAt: true,
        status: true,
      },
    }),
    prisma.fortress.findFirst({
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        updatedAt: true,
        points: true,
        currentAction: true,
        targetFortressId: true,
      },
    }),
    prisma.chatMessage.findFirst({
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        createdAt: true,
      },
    }),
  ]);

  return JSON.stringify({
    cycleId: cycle?.id ?? null,
    cycleUpdatedAt: cycle?.updatedAt.toISOString() ?? null,
    cycleStatus: cycle?.status ?? null,
    fortressId: fortress?.id ?? null,
    fortressUpdatedAt: fortress?.updatedAt.toISOString() ?? null,
    fortressPoints: fortress?.points ?? null,
    fortressAction: fortress?.currentAction ?? null,
    fortressTargetId: fortress?.targetFortressId ?? null,
    chatId: chatMessage?.id ?? null,
    chatCreatedAt: chatMessage?.createdAt.toISOString() ?? null,
  });
}

async function startWatcher(io) {
  let previousSnapshot = await getRealtimeSnapshot();
  let running = false;

  setInterval(async () => {
    if (io.of("/").sockets.size === 0) {
      return;
    }

    if (running) {
      return;
    }

    running = true;

    try {
      const nextSnapshot = await getRealtimeSnapshot();

      if (nextSnapshot !== previousSnapshot) {
        previousSnapshot = nextSnapshot;
        emitRefresh(io, "database");
      }
    } catch (error) {
      console.error("Project-A realtime watcher failed", error);
    } finally {
      running = false;
    }
  }, 3000);
}

async function main() {
  const app = next({ dev, hostname: host, port });
  const handle = app.getRequestHandler();

  await app.prepare();

  const server = http.createServer((request, response) => {
    handle(request, response).catch((error) => {
      console.error("Next request failed", error);
      response.statusCode = 500;
      response.end("Internal Server Error");
    });
  });

  const io = new Server(server, {
    path: "/socket.io",
    cors: {
      origin(origin, callback) {
        callback(null, isAllowedOrigin(origin));
      },
      credentials: true,
    },
    allowRequest(request, callback) {
      if (!isAllowedOrigin(request.headers.origin)) {
        callback("Origin not allowed.", false);
        return;
      }

      const ipAddress = getClientIp(request);

      if (!recordConnectionAttempt(ipAddress)) {
        callback("Too many socket connection attempts.", false);
        return;
      }

      callback(null, true);
    },
  });

  io.use(async (socket, next) => {
    try {
      const user = await getSocketUser(socket.request);

      if (!user) {
        next(new Error("Authentication required."));
        return;
      }

      socket.data.userId = user.id;
      socket.data.userRole = user.role;
      next();
    } catch (error) {
      next(error instanceof Error ? error : new Error("Socket authentication failed."));
    }
  });

  globalThis.__projectARealtime = {
    emitRefresh: (reason) => emitRefresh(io, reason),
  };

  io.on("connection", (socket) => {
    const userId = socket.data.userId;

    if (!userId) {
      socket.disconnect(true);
      return;
    }

    socket.emit(REFRESH_EVENT, {
      reason: "connected",
      at: new Date().toISOString(),
    });

    socket.on("disconnect", () => {
      socket.data.userId = undefined;
    });
  });

  await startWatcher(io);

  server.listen(port, host, () => {
    console.log(`> Project-A ready on http://${host}:${port}`);
  });

  const shutdown = async () => {
    await prisma.$disconnect();
    io.close();
    server.close(() => {
      process.exit(0);
    });
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((error) => {
  console.error("Failed to start Project-A server", error);
  process.exit(1);
});
