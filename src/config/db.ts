import pg from "pg";

const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 20,
  //connectionTimeoutMillis: 5000, 
  idleTimeoutMillis: 30000,
});

export default pool;