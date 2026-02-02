import { Client } from "pg";

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error("DATABASE_URL is required");
    process.exit(1);
  }

  const client = new Client({ connectionString });
  await client.connect();

  const result = await client.query(
    `
      SELECT slug, COUNT(*)::int AS count
      FROM schools
      GROUP BY slug
      HAVING COUNT(*) > 1
      ORDER BY count DESC, slug ASC
    `
  );

  if (result.rows.length > 0) {
    console.error("Duplicate school slugs found:");
    for (const row of result.rows) {
      console.error(`- ${row.slug} (${row.count})`);
    }
    await client.end();
    process.exit(1);
  }

  console.log("No duplicate school slugs found.");
  await client.end();
}

main().catch((error) => {
  console.error("Slug check failed:", error);
  process.exit(1);
});
