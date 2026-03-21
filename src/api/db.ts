import { db } from "ponder:api";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
export const offchainDb = drizzle(pool);

export { db };
