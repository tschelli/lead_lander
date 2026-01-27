import fs from "fs";
import path from "path";
import { Pool } from "pg";

const databaseUrl = process.env.DATABASE_URL || "postgres://lead_lander:lead_lander@localhost:5432/lead_lander";
const migrationsDir = path.resolve(process.cwd(), "migrations");

async function run() {
  const pool = new Pool({ connectionString: databaseUrl });
  await pool.query(
    "CREATE TABLE IF NOT EXISTS schema_migrations (id TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW())"
  );

  const appliedResult = await pool.query("SELECT id FROM schema_migrations");
  const applied = new Set(appliedResult.rows.map((row) => row.id));

  const files = fs
    .readdirSync(migrationsDir)
    .filter((file) => file.endsWith(".sql"))
    .sort();

  for (const file of files) {
    if (applied.has(file)) {
      continue;
    }

    const sql = fs.readFileSync(path.join(migrationsDir, file), "utf8");
    console.log(`Applying ${file}`);

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(sql);
      await client.query("INSERT INTO schema_migrations (id) VALUES ($1)", [file]);
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  await pool.end();
  console.log("Migrations complete.");
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
