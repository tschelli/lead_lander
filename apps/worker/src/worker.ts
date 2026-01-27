import http from "http";
import { Worker } from "bullmq";
import { v4 as uuidv4 } from "uuid";
import { env } from "./env";
import { pool } from "./db";
import { getConfig } from "./config";
import { deliveryQueueScheduler } from "./queue";
import { webhookAdapter } from "./adapters/webhookAdapter";
import { genericAdapter } from "./adapters/genericAdapter";
import type { AdapterResult, DeliveryPayload } from "./adapters/types";
import { sendNotificationEmail } from "./email";
import { resolveEntitiesByIds } from "@lead_lander/config-schema";

void deliveryQueueScheduler;

type SubmissionRow = {
  id: string;
  school_id: string;
  campus_id: string;
  program_id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string | null;
  answers: Record<string, unknown>;
  metadata: Record<string, unknown>;
  status: string;
  consented: boolean;
  consent_text_version: string;
  consent_timestamp: string;
  idempotency_key: string;
};

function truncate(value: string | undefined, max = 5000) {
  if (!value) return value;
  return value.length > max ? value.slice(0, max) : value;
}

async function logAudit(submissionId: string, event: string, payload: Record<string, unknown>) {
  await pool.query(
    `INSERT INTO audit_log (id, submission_id, event, payload, created_at)
     VALUES ($1, $2, $3, $4, $5)`,
    [uuidv4(), submissionId, event, payload, new Date()]
  );
}

async function updateSubmissionStatus(submissionId: string, status: string) {
  await pool.query(
    "UPDATE submissions SET status = $1, updated_at = $2 WHERE id = $3",
    [status, new Date(), submissionId]
  );
}

function buildEmailBody(payload: DeliveryPayload) {
  const lines = [
    `Submission ID: ${payload.submissionId}`,
    `School ID: ${payload.schoolId}`,
    `Campus ID: ${payload.campusId}`,
    `Program ID: ${payload.programId}`,
    "",
    `Name: ${payload.contact.firstName} ${payload.contact.lastName}`,
    `Email: ${payload.contact.email}`,
    `Phone: ${payload.contact.phone ?? ""}`,
    "",
    "Answers:"
  ];

  for (const [key, value] of Object.entries(payload.answers)) {
    lines.push(`- ${key}: ${JSON.stringify(value)}`);
  }

  return lines.join("\n");
}

const worker = new Worker(
  env.queueName,
  async (job) => {
    const submissionId = job.data.submissionId as string;
    const attemptNumber = job.attemptsMade + 1;
    console.log(`[${submissionId}] Delivery attempt ${attemptNumber}`);

    const submissionResult = await pool.query<SubmissionRow>(
      "SELECT * FROM submissions WHERE id = $1",
      [submissionId]
    );

    if (submissionResult.rows.length === 0) {
      throw new Error("Submission not found");
    }

    const submission = submissionResult.rows[0];

    if (submission.status === "delivered") {
      console.log(`[${submissionId}] Already delivered, skipping`);
      return { skipped: true };
    }

    await updateSubmissionStatus(submissionId, "delivering");

    const attemptId = uuidv4();
    const createdAt = new Date();

    await pool.query(
      `INSERT INTO delivery_attempts
        (id, submission_id, attempt_number, status, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $5)`,
      [attemptId, submissionId, attemptNumber, "started", createdAt]
    );

    const config = getConfig();
    const entities = resolveEntitiesByIds(
      config,
      submission.school_id,
      submission.campus_id,
      submission.program_id
    );

    if (!entities) {
      await updateSubmissionStatus(submissionId, "failed");
      await logAudit(submissionId, "failed", { reason: "Missing config entities" });
      console.error(`[${submissionId}] Missing config entities`);
      throw new Error("Missing config entities");
    }

    const crmConnection = config.crmConnections.find(
      (connection) => connection.id === entities.school.crmConnectionId
    );

    if (!crmConnection) {
      await updateSubmissionStatus(submissionId, "failed");
      await logAudit(submissionId, "failed", { reason: "Missing CRM connection" });
      console.error(`[${submissionId}] Missing CRM connection`);
      throw new Error("Missing CRM connection");
    }

    const payload: DeliveryPayload = {
      submissionId,
      idempotencyKey: submission.idempotency_key,
      schoolId: submission.school_id,
      campusId: submission.campus_id,
      programId: submission.program_id,
      contact: {
        firstName: submission.first_name,
        lastName: submission.last_name,
        email: submission.email,
        phone: submission.phone
      },
      answers: submission.answers || {},
      metadata: submission.metadata || {},
      consent: {
        consented: submission.consented,
        textVersion: submission.consent_text_version,
        timestamp: submission.consent_timestamp
      },
      routingTags: entities.campus.routingTags
    };

    let result: AdapterResult;

    if (crmConnection.type === "webhook") {
      result = await webhookAdapter(payload, crmConnection.config || {});
    } else {
      result = await genericAdapter(payload, crmConnection.config || {});
    }

    await pool.query(
      `UPDATE delivery_attempts
       SET status = $1, response_code = $2, response_body = $3, error = $4, updated_at = $5
       WHERE id = $6`,
      [
        result.success ? "delivered" : "failed",
        result.statusCode || null,
        truncate(result.responseBody),
        result.error || null,
        new Date(),
        attemptId
      ]
    );

    if (!result.success) {
      const maxReached = attemptNumber >= env.maxAttempts;
      if (maxReached) {
        await updateSubmissionStatus(submissionId, "failed");
        await logAudit(submissionId, "failed", { reason: result.error || "Delivery failed" });
        console.error(`[${submissionId}] Delivery failed after max attempts`);
      }

      throw new Error(result.error || `Delivery failed with status ${result.statusCode}`);
    }

    await pool.query(
      "UPDATE submissions SET status = $1, delivered_at = $2, updated_at = $2 WHERE id = $3",
      ["delivered", new Date(), submissionId]
    );

    await logAudit(submissionId, "delivered", { statusCode: result.statusCode });
    console.log(`[${submissionId}] Delivery succeeded`);

    const landingPage = config.landingPages.find(
      (item) =>
        item.schoolId === submission.school_id &&
        item.campusId === submission.campus_id &&
        item.programId === submission.program_id
    );

    const notifications = landingPage?.notifications || entities.campus.notifications;

    if (notifications?.enabled) {
      const subject = `New lead: ${entities.program.name} (${entities.campus.name})`;
      const body = buildEmailBody(payload);
      await sendNotificationEmail(notifications.recipients, subject, body);
    }

    return { delivered: true };
  },
  {
    connection: {
      url: env.redisUrl
    },
    concurrency: 5
  }
);

worker.on("completed", (job) => {
  console.log(`Delivered ${job.data.submissionId}`);
});

worker.on("failed", (job, error) => {
  console.error(`Delivery failed for ${job?.data?.submissionId}`, error?.message);
});

const server = http.createServer((_req, res) => {
  if (_req.url === "/worker/healthz") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "ok" }));
    return;
  }

  res.writeHead(404);
  res.end();
});

server.listen(env.workerPort, () => {
  console.log(`Worker health endpoint on port ${env.workerPort}`);
});
