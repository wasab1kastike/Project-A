import { seedProjectA } from "../src/lib/game/bootstrap";
import { PrismaClient } from "../src/lib/prisma-client";

const prisma = new PrismaClient({
  datasources: process.env.DATABASE_URL
    ? {
        db: {
          url: process.env.DATABASE_URL,
        },
      }
    : undefined,
});

async function main() {
  const result = await seedProjectA(prisma, {
    adminEmail: process.env.ADMIN_EMAIL,
  });

  if (result.adminEmail) {
    console.log(`Admin bootstrap complete for ${result.adminEmail}`);
  } else {
    console.warn("Skipping admin bootstrap because ADMIN_EMAIL is not set.");
  }

  console.log(
    `Open registration cycle ready: ${result.cycleId} until ${result.registrationEndsAt.toISOString()}`
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
