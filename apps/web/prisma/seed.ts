import { PrismaClient } from "@prisma/client";

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
  const adminEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase();

  if (!adminEmail) {
    console.warn("Skipping admin bootstrap because ADMIN_EMAIL is not set.");
    return;
  }

  const admin = await prisma.user.upsert({
    where: { email: adminEmail },
    update: { role: "ADMIN" },
    create: {
      email: adminEmail,
      name: "Project-A Admin",
      role: "ADMIN",
    },
  });

  console.log(`Admin bootstrap complete for ${admin.email}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
