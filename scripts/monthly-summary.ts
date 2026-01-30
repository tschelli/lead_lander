import { Pool } from "pg";
import path from "path";
import { loadConfig } from "@lead_lander/config-schema";

const databaseUrl = process.env.DATABASE_URL || "postgres://lead_lander:lead_lander@localhost:5432/lead_lander";
const configDir = process.env.CONFIG_DIR
  ? path.resolve(process.env.CONFIG_DIR)
  : path.resolve(process.cwd(), "configs");

function parseMonth() {
  const arg = process.argv.find((item) => item.startsWith("--month="));
  const month = arg ? arg.split("=")[1] : null;
  if (!month || !/\d{4}-\d{2}/.test(month)) {
    throw new Error("Provide --month=YYYY-MM");
  }
  const [year, monthIndex] = month.split("-").map(Number);
  const start = new Date(Date.UTC(year, monthIndex - 1, 1));
  const end = new Date(Date.UTC(year, monthIndex, 1));
  return { start, end, month };
}

function parseClientId() {
  const arg = process.argv.find((item) => item.startsWith("--client-id="));
  return arg ? arg.split("=")[1] : null;
}

async function run() {
  const { start, end, month } = parseMonth();
  const clientId = parseClientId();
  const pool = new Pool({ connectionString: databaseUrl });
  const config = loadConfig(configDir);

  const result = await pool.query(
    `
      SELECT campus_id, program_id,
        COUNT(*) AS received,
        SUM(CASE WHEN status = 'delivered' THEN 1 ELSE 0 END) AS delivered,
        SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failed
      FROM submissions
      WHERE created_at >= $1 AND created_at < $2
        AND ($3::text IS NULL OR client_id = $3)
      GROUP BY campus_id, program_id
      ORDER BY campus_id, program_id
    `,
    [start, end, clientId]
  );

  console.log(`Monthly summary for ${month}`);
  for (const row of result.rows) {
    const campus = row.campus_id
      ? config.campuses.find((item) => item.id === row.campus_id)
      : null;
    const program = config.programs.find((item) => item.id === row.program_id);
    console.log(
      `${campus?.name || row.campus_id || "Unspecified campus"} / ${program?.name || row.program_id}: received ${row.received}, delivered ${row.delivered}, failed ${row.failed}`
    );
  }

  await pool.end();
}

run().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
