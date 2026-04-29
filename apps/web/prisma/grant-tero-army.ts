import { PrismaClient } from "../src/lib/prisma-client";

const defaultDatabaseUrl =
  "postgresql://postgres:postgres@localhost:5432/project_a?schema=public";

process.env.DATABASE_URL ??= defaultDatabaseUrl;

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL,
    },
  },
});

const ARMY_GRANT = 1500;
const FORTRESS_NAME = "Tero";

async function main() {
  const cycle = await prisma.cycle.findFirst({
    where: { resolvedAt: null },
    orderBy: { createdAt: "desc" },
    select: { id: true, status: true },
  });

  if (!cycle) {
    throw new Error("No active cycle found.");
  }

  const fortress = await prisma.fortress.findFirst({
    where: {
      cycleId: cycle.id,
      name: FORTRESS_NAME,
    },
    select: { id: true, name: true, army: true },
  });

  if (!fortress) {
    throw new Error(
      `Fortress "${FORTRESS_NAME}" not found in cycle ${cycle.id} (status: ${cycle.status}).`
    );
  }

  const updated = await prisma.fortress.update({
    where: { id: fortress.id },
    data: { army: { increment: ARMY_GRANT } },
    select: { id: true, name: true, army: true },
  });

  console.log(
    `✓ Granted ${ARMY_GRANT} army to "${updated.name}". ` +
      `Army before: ${fortress.army}, after: ${updated.army}.`
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => {
    void prisma.$disconnect();
  });
