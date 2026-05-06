import { Client } from "pg";

export const query = async (sql: string): Promise<unknown> => {
  const db = new Client({ connectionString: process.env.DATABASE_URL });
  await db.connect();
  const result = await db.query(sql);
  await db.end();
  return result.rows;
};
