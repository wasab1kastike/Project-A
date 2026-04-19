import "dotenv/config";
import { defineConfig } from "prisma/config";

const defaultDatabaseUrl =
  "postgresql://postgres:postgres@localhost:5432/project_a?schema=public";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    url: process.env.DATABASE_URL ?? defaultDatabaseUrl,
  },
});
