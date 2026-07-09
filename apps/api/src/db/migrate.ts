import fs from "fs";
import path from "path";
import { pool } from "./pool";

const MIGRATIONS_DIR = path.resolve(__dirname, "../../../../infrastructure/database/migrations");

async function migrate() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  const files = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  for (const file of files) {
    const { rows } = await pool.query("SELECT 1 FROM schema_migrations WHERE filename = $1", [file]);
    if (rows.length > 0) {
      console.log(`skip (already applied): ${file}`);
      continue;
    }
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), "utf-8");
    console.log(`applying: ${file}`);
    await pool.query(sql);
    await pool.query("INSERT INTO schema_migrations (filename) VALUES ($1)", [file]);
  }

  console.log("migrations complete");
  await pool.end();
}

migrate().catch((err) => {
  console.error("migration failed:", err);
  process.exit(1);
});
