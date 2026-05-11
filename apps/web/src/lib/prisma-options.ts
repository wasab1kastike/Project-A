import { PrismaPg } from "@prisma/adapter-pg";

export const defaultDatabaseUrl =
  "postgresql://postgres:postgres@localhost:5432/project_a?schema=public";

export function createPrismaClientOptions(
  databaseUrl = process.env.DATABASE_URL
) {
  return {
    adapter: new PrismaPg({
      connectionString: databaseUrl ?? defaultDatabaseUrl,
      max: Number(process.env.PRISMA_POOL_MAX ?? 2),
      connectionTimeoutMillis: Number(
        process.env.PRISMA_POOL_CONNECTION_TIMEOUT_MS ?? 1_000
      ),
      idleTimeoutMillis: Number(
        process.env.PRISMA_POOL_IDLE_TIMEOUT_MS ?? 5_000
      ),
    }),
  };
}
