import pool from "../config/db.js";

// ─── Get a config value ───────────────────────────────────────────────────────

export const getConfig = async (key: string): Promise<string | null> => {
  const { rows: [row] } = await pool.query<{ value: string }>(
    `SELECT value FROM platform_config WHERE key = $1`,
    [key]
  );
  return row?.value ?? null;
};

// ─── Set a config value ───────────────────────────────────────────────────────

export const setConfig = async (key: string, value: string): Promise<void> => {
  await pool.query(
    `INSERT INTO platform_config (key, value, updated_at)
     VALUES ($1, $2, NOW())
     ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW()`,
    [key, value]
  );
};

// ─── Get platform fee as a decimal ───────────────────────────────────────────
// Returns 0.07 by default if config row is missing

export const getPlatformFee = async (): Promise<number> => {
  const value = await getConfig("platform_fee");
  const fee = parseFloat(value ?? "0.07");

  if (isNaN(fee) || fee < 0 || fee >= 1) {
    console.warn(`Invalid platform_fee config value: "${value}" — falling back to 0.07`);
    return 0.07;
  }

  return fee;
};

// ─── Get all config (admin view) ─────────────────────────────────────────────

export const getAllConfig = async (): Promise<{ key: string; value: string; updated_at: Date }[]> => {
  const { rows } = await pool.query<{ key: string; value: string; updated_at: Date }>(
    `SELECT * FROM platform_config ORDER BY key ASC`
  );
  return rows;
};