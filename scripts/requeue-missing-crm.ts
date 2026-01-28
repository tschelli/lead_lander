import { Pool } from "pg";
import { Queue } from "bullmq";
import { v4 as uuidv4 } from "uuid";

const databaseUrl =
  process.env.DATABASE_URL || "postgres://lead_lander:lead_lander@localhost:5432/lead_lander";
const redisUrl = process.env.REDIS_URL || "redis://localhost:6379";
const queueName = process.env.DELIVERY_QUEUE_NAME || "lead_delivery";
const maxAttempts = Number(process.env.DELIVERY_MAX_ATTEMPTS || 5);
const backoffMs = Number(process.env.DELIVERY_BACKOFF_MS || 10_000);

function parseNumberArg(flag: string, fallback: number) {
  const arg = process.argv.find((item) => item.startsWith(`${flag}=`));
  if (!arg) return fallback;
  const value = Number(arg.split("=")[1]);
  return Number.isFinite(value) ? value : fallback;
}

async function run() {
  const olderThanMinutes = parseNumberArg("--older-than-min", 10);
  const limit = parseNumberArg("--limit", 200);
  const dryRun = process.argv.includes("--dry-run");

  const cutoff = new Date(Date.now() - olderThanMinutes * 60 * 1000);
  const pool = new Pool({ connectionString: databaseUrl });
  const queue = new Queue(queueName, { connection: { url: redisUrl } });

  const result = await pool.query(
    `
      SELECT id
      FROM submissions
      WHERE crm_lead_id IS NULL
        AND created_at < $1
        AND status IN ('received', 'delivering')
      ORDER BY created_at ASC
      LIMIT $2
    `,
    [cutoff, limit]
  );

  if (result.rows.length === 0) {
    console.log("No submissions require backfill.");
    await pool.end();
    await queue.close();
    return;
  }

  let queued = 0;

  for (const row of result.rows) {
    const submissionId = row.id as string;
    if (dryRun) {
      console.log(`[dry-run] would requeue ${submissionId}`);
      queued += 1;
      continue;
    }

    await queue.add(
      "create_lead",
      { submissionId, stepIndex: 1 },
      {
        jobId: `create-${submissionId}`,
        attempts: maxAttempts,
        backoff: {
          type: "exponential",
          delay: backoffMs
        },
        removeOnComplete: true,
        removeOnFail: false
      }
    );

    await pool.query(
      `INSERT INTO audit_log (id, submission_id, event, payload, created_at)
       VALUES ($1, $2, $3, $4, $5)`,
      [uuidv4(), submissionId, "requeued_create", { source: "backfill" }, new Date()]
    );

    queued += 1;
  }

  console.log(`Queued ${queued} create_lead jobs.`);
  await pool.end();
  await queue.close();
}

run().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
