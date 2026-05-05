import pool from "../config/db.js";

export interface WaitlistEntry {
  id: string;
  name: string;
  email: string;
  created_at: Date;
}

export const joinWaitlist = async (
 
  email: string
): Promise<WaitlistEntry> => {
  const { rows: [existing] } = await pool.query<{ id: string }>(
    `SELECT id FROM waitlist WHERE email = $1`,
    [email]
  );

  if (existing) throw new Error("Email already on waitlist");

  const { rows: [entry] } = await pool.query<WaitlistEntry>(
    `INSERT INTO waitlist (email) VALUES ($1) RETURNING *`,
    [email]
  );

  if (!entry) throw new Error("Failed to join waitlist");
  return entry;
};

export const getWaitlist = async (): Promise<WaitlistEntry[]> => {
  const { rows } = await pool.query<WaitlistEntry>(
    `SELECT * FROM waitlist ORDER BY created_at DESC`
  );
  return rows;
};

export const getWaitlistCount = async (): Promise<number> => {
  const { rows: [row] } = await pool.query<{ count: string }>(
    `SELECT COUNT(*) FROM waitlist`
  );
  return parseInt(row?.count ?? "0", 10);
};