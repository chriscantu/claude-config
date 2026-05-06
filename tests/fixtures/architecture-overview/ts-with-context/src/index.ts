import express from "express";
import { Client } from "pg";

const app = express();
const db = new Client({ connectionString: process.env.DATABASE_URL });

app.post("/events", async (req, res) => {
  await db.query("INSERT INTO billing_events DEFAULT VALUES");
  res.send("ok");
});

export { app };
