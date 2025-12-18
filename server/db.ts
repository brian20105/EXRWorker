import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "@shared/schema";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  connectionTimeoutMillis: 15000,
  idleTimeoutMillis: 60000,
  max: 10,
});

// Keep database connection warm with periodic queries
async function warmDatabase() {
  try {
    await pool.query('SELECT 1');
  } catch (e) {
    console.log('[DB] Warmup query failed:', e);
  }
}

// Initial warmup
warmDatabase();

// Keep connection warm every 30 seconds
setInterval(warmDatabase, 30000);

export const db = drizzle(pool, { schema });
