import http from "http";
import { Worker } from "bullmq";
import { v4 as uuidv4 } from "uuid";
import { env } from "./env";
import { pool } from "./db";
import { getConfigForClient } from "./config";
import { deliveryQueue } from "./queue";
import { webhookAdapter } from "./adapters/webhookAdapter";
import { genericAdapter } from "./adapters/genericAdapter";
import type { AdapterResult, DeliveryPayload } from "./adapters/types";
import { sendNotificationEmail } from "./email";
import { resolveEntitiesByIds } from "@lead_lander/config-schema";

void deliveryQueue;

type SubmissionRow = {
  id: string;
  client_id: string;
  school_id: string;
  campus_id: string | null;
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
  crm_lead_id: string | null;
  last_step_completed: number | null;
  created_from_step: number | null;
};

type DeliveryJobData = {
  submissionId: string;
  clientId: string;
  schoolId: string;
  stepIndex?: number;
};

function truncate(value: string | undefined, max = 5000) {
  if (!value) return value;
  return value.length > max ? value.slice(0, max) : value;
}

async function logAudit(
  clientId: string,
  submissionId: string,
  event: string,
  payload: Record<string, unknown>
) {
  await pool.query(
    `INSERT INTO audit_log (id, client_id, submission_id, event, payload, created_at)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [uuidv4(), clientId, submissionId, event, payload, new Date()]
  );
}

async function updateSubmissionStatus(clientId: string, submissionId: string, status: string) {
  await pool.query(
    "UPDATE submissions SET status = $1, updated_at = $2 WHERE id = $3 AND client_id = $4",
    [status, new Date(), submissionId, clientId]
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
    const clientId = job.data.clientId as string;
    const schoolId = job.data.schoolId as string;
    const jobType = job.name;
    const action = jobType === "create_lead" ? "create" : "update";
    const stepIndex = jobType === "create_lead"
      ? 1
      : typeof job.data.stepIndex === "number"
        ? job.data.stepIndex
        : 0;

    if (jobType !== "create_lead" && jobType !== "update_lead") {
      throw new Error(`Unsupported job type: ${jobType}`);
    }

    if (!submissionId || !clientId || !schoolId) {
      throw new Error("Missing job payload context");
    }

    const attemptNumber = job.attemptsMade + 1;
    console.log(`[${submissionId}] ${jobType} attempt ${attemptNumber}`);

    const submissionResult = await pool.query<SubmissionRow>(
      "SELECT * FROM submissions WHERE id = $1 AND client_id = $2",
      [submissionId, clientId]
    );

    if (submissionResult.rows.length === 0) {
      throw new Error("Submission not found");
    }

    const submission = submissionResult.rows[0];

    // Defense-in-depth: Explicit client_id validation
    if (submission.client_id !== clientId) {
      await logAudit(clientId, submissionId, "job_payload_client_mismatch", {
        expectedClientId: submission.client_id,
        jobClientId: clientId
      });
      throw new Error("Job client_id mismatch - potential security issue");
    }

    if (submission.school_id !== schoolId) {
      await logAudit(clientId, submissionId, "job_payload_mismatch", {
        expectedSchoolId: submission.school_id,
        jobSchoolId: schoolId
      });
      throw new Error("Job school_id mismatch");
    }

    const dedupeResult = await pool.query(
      `
        SELECT 1
        FROM delivery_attempts
        WHERE client_id = $1 AND submission_id = $2 AND job_type = $3 AND step_index = $4 AND status = 'delivered'
        LIMIT 1
      `,
      [clientId, submissionId, jobType, stepIndex]
    );

    if (dedupeResult.rows.length > 0) {
      console.log(`[${submissionId}] ${jobType} step ${stepIndex} already delivered, skipping`);
      return { skipped: true };
    }

    if (submission.status === "delivered" && jobType === "create_lead") {
      console.log(`[${submissionId}] Already delivered, skipping`);
      return { skipped: true };
    }

    await updateSubmissionStatus(clientId, submissionId, "delivering");

    const attemptId = uuidv4();
    const createdAt = new Date();

    await pool.query(
      `INSERT INTO delivery_attempts
        (id, client_id, submission_id, attempt_number, status, job_type, step_index, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $8)`,
      [attemptId, clientId, submissionId, attemptNumber, "started", jobType, stepIndex, createdAt]
    );

    try {
      const config = await getConfigForClient(clientId);
      const entities = resolveEntitiesByIds(
        config,
        submission.school_id,
        submission.campus_id,
        submission.program_id
      );

      if (!entities) {
        await updateSubmissionStatus(clientId, submissionId, "failed");
        await logAudit(clientId, submissionId, "failed", { reason: "Missing config entities" });
        console.error(`[${submissionId}] Missing config entities`);
        throw new Error("Missing config entities");
      }

      const crmConnection = config.crmConnections.find(
        (connection) => connection.id === entities.school.crmConnectionId
      );

      if (!crmConnection) {
        await updateSubmissionStatus(clientId, submissionId, "failed");
        await logAudit(clientId, submissionId, "failed", { reason: "Missing CRM connection" });
        console.error(`[${submissionId}] Missing CRM connection`);
        throw new Error("Missing CRM connection");
      }

      if (jobType === "update_lead" && !submission.crm_lead_id) {
        console.error(`[${submissionId}] Missing crm_lead_id for update`);
        throw new Error("Missing crm_lead_id");
      }

      const payload: DeliveryPayload = {
        submissionId,
        idempotencyKey: submission.idempotency_key,
        action,
        crmLeadId: submission.crm_lead_id,
        stepIndex: stepIndex || null,
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
        routingTags: entities.campus?.routingTags || []
      };

      let result: AdapterResult;

      if (crmConnection.type === "webhook") {
        result = await webhookAdapter(payload, crmConnection.config || {});
      } else {
        result = await genericAdapter(payload, crmConnection.config || {});
      }

      if (jobType === "create_lead" && result.success && !result.crmLeadId) {
        result = { success: false, error: "Missing crm_lead_id from CRM response" };
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
          await updateSubmissionStatus(clientId, submissionId, "failed");
          await logAudit(clientId, submissionId, "failed", { reason: result.error || "Delivery failed" });
          console.error(`[${submissionId}] Delivery failed after max attempts`);
        } else {
          await logAudit(clientId, submissionId, "retry_scheduled", { attemptNumber });
        }

        throw new Error(result.error || `Delivery failed with status ${result.statusCode}`);
      }

      if (jobType === "create_lead" && result.crmLeadId) {
        await pool.query("UPDATE submissions SET crm_lead_id = $1 WHERE id = $2 AND client_id = $3", [
          result.crmLeadId,
          submissionId,
          clientId
        ]);
      }

      await pool.query(
        "UPDATE submissions SET status = $1, delivered_at = $2, updated_at = $2 WHERE id = $3 AND client_id = $4",
        ["delivered", new Date(), submissionId, clientId]
      );

      await logAudit(clientId, submissionId, "delivered", { statusCode: result.statusCode });
      console.log(`[${submissionId}] Delivery succeeded`);

      const landingPage = config.landingPages.find(
        (item) => item.schoolId === submission.school_id && item.programId === submission.program_id
      );

      const notifications = landingPage?.notifications || entities.campus?.notifications;

      if (notifications?.enabled) {
        const campusName = entities.campus?.name || "Unspecified campus";
        const subject = `New lead: ${entities.program.name} (${campusName})`;
        const body = buildEmailBody(payload);
        await sendNotificationEmail(notifications.recipients, subject, body);
      }

      return { delivered: true };
    } catch (error) {
      await pool.query(
        `UPDATE delivery_attempts
         SET status = $1, error = $2, updated_at = $3
         WHERE id = $4`,
        ["failed", truncate((error as Error)?.message), new Date(), attemptId]
      );

      const maxReached = attemptNumber >= env.maxAttempts;
      if (maxReached) {
        await updateSubmissionStatus(clientId, submissionId, "failed");
        await logAudit(clientId, submissionId, "failed", {
          reason: (error as Error)?.message || "Delivery failed"
        });
      } else {
        await logAudit(clientId, submissionId, "retry_scheduled", { attemptNumber });
      }

      throw error;
    }
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

const server = http.createServer(async (_req, res) => {
  if (_req.url === "/worker/healthz") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "ok" }));
    return;
  }

  if (_req.url?.startsWith("/worker/metrics")) {
    const url = new URL(_req.url, `http://${_req.headers.host || "localhost"}`);
    try {
      const counts = await deliveryQueue.getJobCounts("waiting", "active", "failed", "delayed", "completed");
      const clientId = url.searchParams.get("clientId");
      const schoolId = url.searchParams.get("schoolId");
      const windowHours = Math.min(Math.max(Number(url.searchParams.get("windowHours") || 24), 1), 720);
      const since = new Date(Date.now() - windowHours * 60 * 60 * 1000);

      let tenantStats = null as null | Record<string, unknown>;
      let tenantQueue = null as null | Record<string, unknown>;

      if (clientId) {
        if (schoolId) {
          const attemptResult = await pool.query(
            `
              SELECT
                COUNT(*) AS total_attempts,
                SUM(CASE WHEN da.status = 'delivered' THEN 1 ELSE 0 END) AS delivered_attempts,
                SUM(CASE WHEN da.status = 'failed' THEN 1 ELSE 0 END) AS failed_attempts
              FROM delivery_attempts da
              JOIN submissions s ON s.id = da.submission_id
              WHERE da.client_id = $1 AND s.school_id = $2 AND da.created_at >= $3
            `,
            [clientId, schoolId, since]
          );

          const submissionResult = await pool.query(
            `
              SELECT status, COUNT(*) AS count
              FROM submissions
              WHERE client_id = $1 AND school_id = $2 AND created_at >= $3
              GROUP BY status
            `,
            [clientId, schoolId, since]
          );

          tenantStats = {
            clientId,
            schoolId,
            windowHours,
            attempts: {
              total: Number(attemptResult.rows[0]?.total_attempts || 0),
              delivered: Number(attemptResult.rows[0]?.delivered_attempts || 0),
              failed: Number(attemptResult.rows[0]?.failed_attempts || 0)
            },
            submissions: submissionResult.rows.reduce<Record<string, number>>((acc, row) => {
              acc[row.status] = Number(row.count || 0);
              return acc;
            }, {})
          };
        } else {
          const attemptResult = await pool.query(
            `
              SELECT
                COUNT(*) AS total_attempts,
                SUM(CASE WHEN status = 'delivered' THEN 1 ELSE 0 END) AS delivered_attempts,
                SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failed_attempts
              FROM delivery_attempts
              WHERE client_id = $1 AND created_at >= $2
            `,
            [clientId, since]
          );

          const submissionResult = await pool.query(
            `
              SELECT status, COUNT(*) AS count
              FROM submissions
              WHERE client_id = $1 AND created_at >= $2
              GROUP BY status
            `,
            [clientId, since]
          );

          tenantStats = {
            clientId,
            windowHours,
            attempts: {
              total: Number(attemptResult.rows[0]?.total_attempts || 0),
              delivered: Number(attemptResult.rows[0]?.delivered_attempts || 0),
              failed: Number(attemptResult.rows[0]?.failed_attempts || 0)
            },
            submissions: submissionResult.rows.reduce<Record<string, number>>((acc, row) => {
              acc[row.status] = Number(row.count || 0);
              return acc;
            }, {})
          };
        }

        const limit = 1000;
        const statuses = ["waiting", "active", "delayed", "failed"] as const;
        const tenantCounts: Record<string, number> = {};
        let partial = false;

        for (const status of statuses) {
          const jobs = await deliveryQueue.getJobs([status], 0, limit - 1);
          const count = jobs.filter((job) => job.data?.clientId === clientId).length;
          tenantCounts[status] = count;
          if (jobs.length >= limit) {
            partial = true;
          }
        }

        tenantQueue = { ...tenantCounts, partial, limit };
      }

      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "ok", queue: counts, tenantQueue, tenantStats }));
      return;
    } catch (error) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "error", error: (error as Error).message }));
      return;
    }
  }

  res.writeHead(404);
  res.end();
});

server.listen(env.workerPort, () => {
  console.log(`Worker health endpoint on port ${env.workerPort}`);
});
