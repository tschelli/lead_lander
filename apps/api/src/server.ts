import express from "express";
import rateLimit from "express-rate-limit";
import cors from "cors";
import { z } from "zod";
import { v4 as uuidv4 } from "uuid";
import { env } from "./env";
import { pool } from "./db";
import { deliveryQueue } from "./queue";
import { computeIdempotencyKey } from "./idempotency";
import { getConfig } from "./config";
import { resolveEntitiesByIds } from "@lead_lander/config-schema";

const app = express();
app.use(express.json({ limit: "1mb" }));
app.use(cors());

const limiter = rateLimit({
  windowMs: env.rateLimitWindowMs,
  max: env.rateLimitMax,
  standardHeaders: true,
  legacyHeaders: false
});

app.use(limiter);

app.get("/healthz", (_req, res) => {
  res.json({ status: "ok" });
});

const SubmitSchema = z.object({
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  email: z.string().email(),
  phone: z.string().optional().nullable(),
  schoolId: z.string().min(1),
  campusId: z.string().min(1),
  programId: z.string().min(1),
  answers: z.record(z.any()).default({}),
  metadata: z
    .object({
      utm: z.record(z.string()).optional(),
      referrer: z.string().optional(),
      userAgent: z.string().optional()
    })
    .optional(),
  consent: z.object({
    consented: z.boolean(),
    textVersion: z.string(),
    timestamp: z.string()
  }),
  honeypot: z.string().optional()
});

app.post("/api/submit", async (req, res) => {
  try {
    const parseResult = SubmitSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({ error: "Invalid payload", details: parseResult.error.format() });
    }

    const payload = parseResult.data;
    const honeypotValue = payload.honeypot || req.body?.[env.honeypotField];
    if (honeypotValue) {
      return res.status(400).json({ error: "Invalid submission" });
    }

    const config = getConfig();
    const entities = resolveEntitiesByIds(
      config,
      payload.schoolId,
      payload.campusId,
      payload.programId
    );

    if (!entities) {
      return res.status(404).json({ error: "Unknown campus/program" });
    }

    const submissionId = uuidv4();
    const idempotencyKey = computeIdempotencyKey({
      email: payload.email,
      phone: payload.phone || null,
      schoolId: payload.schoolId,
      campusId: payload.campusId,
      programId: payload.programId
    });

    const now = new Date();
    const metadata = {
      ...payload.metadata,
      referrer: payload.metadata?.referrer || req.get("referer") || undefined,
      userAgent: payload.metadata?.userAgent || req.get("user-agent") || undefined,
      ip: req.ip
    };

    const insertResult = await pool.query(
      `
        INSERT INTO submissions
          (id, created_at, updated_at, school_id, campus_id, program_id, first_name, last_name, email, phone, answers, metadata, status, idempotency_key, consented, consent_text_version, consent_timestamp)
        VALUES
          ($1, $2, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
        ON CONFLICT (idempotency_key) DO NOTHING
        RETURNING id, status
      `,
      [
        submissionId,
        now,
        payload.schoolId,
        payload.campusId,
        payload.programId,
        payload.firstName,
        payload.lastName,
        payload.email.toLowerCase(),
        payload.phone || null,
        payload.answers,
        metadata,
        "received",
        idempotencyKey,
        payload.consent.consented,
        payload.consent.textVersion,
        new Date(payload.consent.timestamp)
      ]
    );

    let finalSubmissionId = submissionId;
    let wasInserted = true;

    if (insertResult.rowCount === 0) {
      wasInserted = false;
      const existing = await pool.query(
        "SELECT id, status FROM submissions WHERE idempotency_key = $1",
        [idempotencyKey]
      );
      if (existing.rows.length === 0) {
        return res.status(500).json({ error: "Failed to persist submission" });
      }
      finalSubmissionId = existing.rows[0].id;
      console.log(`[${finalSubmissionId}] Duplicate submission accepted`);
    } else {
      await pool.query(
        `INSERT INTO audit_log (id, submission_id, event, payload, created_at)
         VALUES ($1, $2, $3, $4, $5)`,
        [uuidv4(), submissionId, "received", { metadata }, now]
      );
      console.log(`[${submissionId}] Submission received`);
    }

    if (wasInserted) {
      await deliveryQueue.add(
        "deliver",
        {
          submissionId
        },
        {
          jobId: submissionId,
          attempts: env.deliveryMaxAttempts,
          backoff: {
            type: "exponential",
            delay: env.deliveryBackoffMs
          },
          removeOnComplete: true,
          removeOnFail: false
        }
      );
      console.log(`[${submissionId}] Delivery job queued`);
    }

    return res.status(202).json({ submissionId: finalSubmissionId, status: "received", idempotencyKey });
  } catch (error) {
    console.error("Submission error", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

app.listen(env.port, () => {
  console.log(`API listening on port ${env.port}`);
});
