import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";

export const sqlEnabled = Boolean(process.env.DATABASE_URL);

let db: any = null;

if (process.env.DATABASE_URL) {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    connectionTimeoutMillis: 10000,
    idleTimeoutMillis: 30000,
    keepAlive: true,
    keepAliveInitialDelayMillis: 10000,
  });
  pool.on("error", (err) => {
    console.error("[sql] Unexpected idle client error:", err?.message || err);
  });
  db = drizzle(pool);
  console.log("SQL client initialized. db.select:", typeof (db as any).select);
} else {
  console.log("DATABASE_URL not set — running in MongoDB-only mode (SQL disabled).");

  class FakeQuery {
    constructor(private result: any[] = []) {}
    from() { return this; }
    where() { return this; }
    orderBy() { return this; }
    limit() { return Promise.resolve(this.result); }
    // allow awaiting directly on the query
    then(onfulfilled: any) {
      return Promise.resolve(this.result).then(onfulfilled);
    }
  }

  db = {
    select: (_?: any) => new FakeQuery([]),
    insert: (_table?: any) => ({
      values: (v: any) => ({
        returning: async () => (Array.isArray(v) ? v : [v])
      })
    }),
    update: (_table?: any) => ({
      set: (_: any) => ({
        where: (_cond?: any) => ({ returning: async () => [] })
      })
    }),
    delete: (_table?: any) => ({ where: async () => [] }),
    run: async () => ({}),
    prepare: () => ({ all: async () => [] }),
  } as any;
}

// Retry wrapper for DB operations (works for SQL operations too)
export async function withRetry<T>(
  operation: () => Promise<T>,
  maxRetries: number = 3,
  delayMs: number = 500,
): Promise<T> {
  let lastError: any;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error: any) {
      lastError = error;
      if (attempt < maxRetries) {
        await new Promise((resolve) => setTimeout(resolve, delayMs * attempt));
      }
    }
  }
  throw lastError;
}

export { db };
export default db;
