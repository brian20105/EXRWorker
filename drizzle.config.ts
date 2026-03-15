import { defineConfig } from "drizzle-kit";

if (!process.env.DATABASE_URL) {
  console.log("DATABASE_URL not set — drizzle config will be a no-op at runtime.");
}

const config = process.env.DATABASE_URL
  ? defineConfig({
      out: "./migrations",
      schema: "./shared/schema.ts",
      dialect: "postgresql",
      dbCredentials: {
        url: process.env.DATABASE_URL,
      },
    })
  : ({} as any);

export default config;
