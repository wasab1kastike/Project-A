import { ACTIVE_DURATION_HOURS, REGISTRATION_DURATION_HOURS } from "./constants";
import {
  CycleStatus,
  type Prisma,
  PrismaClient,
  UserRole,
} from "@/lib/prisma-client";
import { addHours, floorToMinute } from "./time";

type DatabaseClient = PrismaClient | Prisma.TransactionClient;

export async function ensureAdminUser(
  db: DatabaseClient,
  adminEmail?: string | null
) {
  const normalizedEmail = adminEmail?.trim().toLowerCase();

  if (!normalizedEmail) {
    return null;
  }

  return db.user.upsert({
    where: { email: normalizedEmail },
    update: { role: UserRole.ADMIN },
    create: {
      email: normalizedEmail,
      name: "Project-A Admin",
      role: UserRole.ADMIN,
    },
  });
}

export async function ensureOpenRegistrationCycle(
  db: DatabaseClient,
  now = new Date()
) {
  const existingCycle = await db.cycle.findFirst({
    where: {
      resolvedAt: null,
    },
    orderBy: {
      createdAt: "desc",
    },
  });

  if (existingCycle) {
    return existingCycle;
  }

  const registrationStartedAt = floorToMinute(now);
  const registrationEndsAt = addHours(
    registrationStartedAt,
    REGISTRATION_DURATION_HOURS
  );

  return db.cycle.create({
    data: {
      status: CycleStatus.REGISTRATION,
      registrationStartedAt,
      registrationEndsAt,
      activeStartedAt: null,
      activeEndsAt: addHours(registrationEndsAt, ACTIVE_DURATION_HOURS),
    },
  });
}

export async function seedProjectA(
  db: DatabaseClient,
  options: {
    adminEmail?: string | null;
    now?: Date;
  } = {}
) {
  const [admin, cycle] = await Promise.all([
    ensureAdminUser(db, options.adminEmail),
    ensureOpenRegistrationCycle(db, options.now),
  ]);

  return {
    adminEmail: admin?.email ?? null,
    cycleId: cycle.id,
    registrationEndsAt: cycle.registrationEndsAt,
  };
}
