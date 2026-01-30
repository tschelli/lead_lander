import { Pool } from "pg";

const databaseUrl = process.env.DATABASE_URL || "postgres://lead_lander:lead_lander@localhost:5432/lead_lander";
const requireSeed = process.argv.includes("--require-seed");

const requiredTables = [
  "submissions",
  "delivery_attempts",
  "audit_log",
  "admin_audit_log",
  "users",
  "user_roles",
  "password_reset_tokens",
  "clients",
  "schools",
  "programs",
  "campuses",
  "landing_pages",
  "crm_connections"
];

const requiredClientIdColumns = [
  "submissions",
  "delivery_attempts",
  "audit_log",
  "admin_audit_log",
  "user_roles"
];

const requiredIndexes = [
  "schools_client_slug_idx",
  "programs_client_school_slug_idx",
  "campuses_client_school_slug_idx",
  "landing_pages_unique_default_idx",
  "landing_pages_unique_global_idx",
  "users_client_email_idx",
  "submissions_client_school_created_idx",
  "submissions_client_school_status_idx",
  "delivery_attempts_client_submission_idx",
  "audit_log_client_submission_idx",
  "admin_audit_log_client_school_idx"
];

async function main() {
  const pool = new Pool({ connectionString: databaseUrl });

  try {
    const tableResult = await pool.query(
      `SELECT table_name
       FROM information_schema.tables
       WHERE table_schema = 'public'`
    );
    const tables = new Set(tableResult.rows.map((row) => row.table_name));

    const missingTables = requiredTables.filter((name) => !tables.has(name));
    if (missingTables.length > 0) {
      throw new Error(`Missing tables: ${missingTables.join(", ")}`);
    }

    for (const table of requiredClientIdColumns) {
      const columnResult = await pool.query(
        `SELECT is_nullable
         FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = $1 AND column_name = 'client_id'`,
        [table]
      );
      if (columnResult.rows.length === 0) {
        throw new Error(`Missing client_id column on ${table}`);
      }
      if (columnResult.rows[0].is_nullable !== "NO") {
        throw new Error(`client_id is nullable on ${table}`);
      }
    }

    const indexResult = await pool.query(
      `SELECT indexname
       FROM pg_indexes
       WHERE schemaname = 'public'`
    );
    const indexes = new Set(indexResult.rows.map((row) => row.indexname));

    const missingIndexes = requiredIndexes.filter((name) => !indexes.has(name));
    if (missingIndexes.length > 0) {
      throw new Error(`Missing indexes: ${missingIndexes.join(", ")}`);
    }

    if (requireSeed) {
      const seedChecks = [
        { table: "clients", label: "clients" },
        { table: "schools", label: "schools" },
        { table: "programs", label: "programs" },
        { table: "campuses", label: "campuses" },
        { table: "landing_pages", label: "landing_pages" },
        { table: "crm_connections", label: "crm_connections" }
      ];

      for (const check of seedChecks) {
        const result = await pool.query(`SELECT COUNT(*)::int AS count FROM ${check.table}`);
        if ((result.rows[0]?.count ?? 0) === 0) {
          throw new Error(`Seed data missing for ${check.label}`);
        }
      }
    }

    console.log("Migration verification passed.");
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
