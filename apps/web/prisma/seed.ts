import { seedProjectA } from "../src/lib/game/bootstrap";
import { PrismaClient } from "../src/lib/prisma-client";
import { createPrismaClientOptions } from "../src/lib/prisma-options";

const prisma = new PrismaClient(createPrismaClientOptions());
const unsafeAdminEmailPlaceholders = new Set(["admin@example.com", "replace-me"]);

function getAdminEmail() {
  const adminEmail = process.env.ADMIN_EMAIL?.trim();

  if (!adminEmail) {
    return undefined;
  }

  if (unsafeAdminEmailPlaceholders.has(adminEmail.toLowerCase())) {
    throw new Error(
      "ADMIN_EMAIL is still set to a placeholder value. Use a real admin email or unset ADMIN_EMAIL."
    );
  }

  return adminEmail;
}

async function main() {
  const result = await seedProjectA(prisma, {
    adminEmail: getAdminEmail(),
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
