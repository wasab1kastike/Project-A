import http from "node:http";
import next from "next";
import { PrismaClient } from "@prisma/client";
import { Server } from "socket.io";

const dev = process.argv.includes("--dev");
const host = process.env.HOST ?? "0.0.0.0";
const port = Number(process.env.PORT ?? 3000);
const REFRESH_EVENT = "project-a:refresh";
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
      origin: true,
      credentials: true,
    },
  });

  globalThis.__projectARealtime = {
    emitRefresh: (reason) => emitRefresh(io, reason),
  };

  io.on("connection", (socket) => {
    socket.emit(REFRESH_EVENT, {
      reason: "connected",
      at: new Date().toISOString(),
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
