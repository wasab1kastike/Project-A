import { PrismaPg } from "@prisma/adapter-pg";

export const defaultDatabaseUrl =
  "postgresql://postgres:postgres@localhost:5432/project_a?schema=public";

export function createPrismaClientOptions(databaseUrl = process.env.DATABASE_URL) {
  return {
    adapter: new PrismaPg({
      connectionString: databaseUrl ?? defaultDatabaseUrl,
    }),
  };
}
