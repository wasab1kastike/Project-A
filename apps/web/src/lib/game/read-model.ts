import { prisma } from "@/lib/prisma";
import { CycleStatus } from "@/lib/prisma-client";
import { ACTIVE_PLAYER_CAP } from "./constants";

export type HomePageState = Awaited<ReturnType<typeof getHomePageState>>;

export async function getHomePageState({
  userId,
  now = new Date(),
}: {
  userId?: string;
  now?: Date;
}) {
  const cycle = await prisma.cycle.findFirst({
    where: {
      resolvedAt: null,
    },
    orderBy: {
      createdAt: "desc",
    },
    include: {
      fortresses: {
        orderBy: [{ joinedAt: "asc" }, { id: "asc" }],
        select: {
          id: true,
          ownerId: true,
          name: true,
          points: true,
          currentAction: true,
          targetFortressId: true,
          mapX: true,
          mapY: true,
          joinedAt: true,
        },
      },
    },
  });

  if (!cycle) {
    return {
      cycle: null,
      playerFortress: null,
      availableTargets: [],
      canJoinRegistration: false,
      canEditRegistrationName: false,
      emptyStateMessage:
        "No unresolved cycle exists yet. Run the seed flow to bootstrap registration.",
    };
  }

  const joinedCount = cycle.fortresses.length;
  const remainingSlots = Math.max(0, ACTIVE_PLAYER_CAP - joinedCount);
  const playerFortress =
    cycle.fortresses.find((fortress) => fortress.ownerId === userId) ?? null;
  const registrationOpen =
    cycle.status === CycleStatus.REGISTRATION && cycle.registrationEndsAt > now;
  const activeOpen =
    cycle.status === CycleStatus.ACTIVE &&
    cycle.activeEndsAt !== null &&
    cycle.activeEndsAt > now;

  return {
    cycle: {
      id: cycle.id,
      status: cycle.status,
      registrationEndsAt: cycle.registrationEndsAt,
      activeEndsAt: cycle.activeEndsAt,
      joinedCount,
      remainingSlots,
      deadline:
        cycle.status === CycleStatus.REGISTRATION
          ? cycle.registrationEndsAt
          : cycle.activeEndsAt,
      phaseDescription:
        cycle.status === CycleStatus.REGISTRATION
          ? "Players can join the upcoming season and set their fortress name."
          : "Joined fortresses can grow, attack, and spend points on renames.",
      statusMessage:
        cycle.status === CycleStatus.REGISTRATION
          ? registrationOpen
            ? "Registration is open. Joining creates your fortress immediately and reserves one of the 30 season slots."
            : "Registration has expired. The next game tick will either restart registration or move the cycle into ACTIVE."
          : activeOpen
            ? "The active season is running. Action changes persist until you change them again."
            : "The ACTIVE deadline has passed. M1 stops scoring here until later milestone winner resolution is added.",
    },
    playerFortress: playerFortress
      ? {
          id: playerFortress.id,
          name: playerFortress.name,
          points: playerFortress.points,
          currentAction: playerFortress.currentAction,
          mapX: playerFortress.mapX,
          mapY: playerFortress.mapY,
          targetFortress:
            playerFortress.targetFortressId
              ? cycle.fortresses.find(
                  (fortress) => fortress.id === playerFortress.targetFortressId
                ) ?? null
              : null,
        }
      : null,
    availableTargets:
      activeOpen && playerFortress
        ? cycle.fortresses
            .filter((fortress) => fortress.id !== playerFortress.id)
            .map((fortress) => ({
              id: fortress.id,
              name: fortress.name,
              points: fortress.points,
            }))
        : [],
    canJoinRegistration:
      Boolean(userId) &&
      registrationOpen &&
      !playerFortress &&
      remainingSlots > 0,
    canEditRegistrationName:
      Boolean(userId) && registrationOpen && Boolean(playerFortress),
    emptyStateMessage: null,
  };
}
