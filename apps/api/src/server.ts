import express from "express";
import rateLimit from "express-rate-limit";
import cors from "cors";
import cookieParser from "cookie-parser";
import UAParser from "ua-parser-js";
import { z } from "zod";
import { v4 as uuidv4 } from "uuid";
import { env } from "./env";
import { pool } from "./db";
import { deliveryQueue } from "./queue";
import { computeIdempotencyKey } from "./idempotency";
import { getConfig } from "./config";
import { PgAuthRepo } from "./authRepo";
import {
  authenticateUser,
  createSessionToken,
  requestPasswordReset,
  resetPasswordWithToken,
  verifySessionToken
} from "./auth";
import { type AuthContext, type UserRole } from "./authz";
import { getAllowedSchools } from "./tenantScope";
import { resolveEntitiesByIds } from "@lead_lander/config-schema";

const app = express();
app.use(express.json({ limit: "1mb" }));
const normalizeOrigin = (origin: string) => {
  try {
    const url = new URL(origin);
    return { origin: url.origin.toLowerCase(), host: url.hostname.toLowerCase() };
  } catch {
    return { origin: origin.toLowerCase(), host: "" };
  }
};

const isAllowedOrigin = (origin: string) => {
  if (env.corsOrigins.length === 0) {
    return false;
  }

  const { origin: normalizedOrigin, host } = normalizeOrigin(origin);

  return env.corsOrigins.some((allowedRaw) => {
    const allowed = allowedRaw.toLowerCase();
    if (!allowed) return false;
    if (allowed === "*") return true;
    if (allowed.startsWith("*.")) {
      return host.endsWith(allowed.slice(1));
    }
    if (allowed.startsWith(".")) {
      return host.endsWith(allowed);
    }
    if (allowed.startsWith("http://") || allowed.startsWith("https://")) {
      return normalizedOrigin === allowed;
    }
    return host === allowed;
  });
};

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) {
        return callback(null, true);
      }
      if (env.corsOrigins.length === 0) {
        return callback(new Error("CORS origin not allowed"));
      }
      if (isAllowedOrigin(origin)) {
        return callback(null, true);
      }
      return callback(new Error("CORS origin not allowed"));
    },
    credentials: true
  })
);
app.use(cookieParser());

const limiter = rateLimit({
  windowMs: env.rateLimitWindowMs,
  max: env.rateLimitMax,
  standardHeaders: true,
  legacyHeaders: false
});

app.use(limiter);

const authRepo = new PgAuthRepo(pool);

const AuthLoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1)
});

const AuthResetRequestSchema = z.object({
  email: z.string().email()
});

const AuthResetSchema = z.object({
  token: z.string().min(1),
  password: z.string().min(8)
});

async function loadAuthContext(req: express.Request): Promise<AuthContext | null> {
  const token = req.cookies?.[env.authCookieName];
  if (!token) return null;

  const session = verifySessionToken(token);
  if (!session) return null;

  const user = await authRepo.findUserById(session.userId);
  if (!user) return null;

  const rolesResult = await pool.query(
    "SELECT role, school_id FROM user_roles WHERE user_id = $1",
    [user.id]
  );

  const roles = rolesResult.rows.map((row) => ({
    role: row.role,
    schoolId: row.school_id ?? null
  })) as UserRole[];

  return { user, roles };
}

async function attachAuthContext(req: express.Request, res: express.Response, next: express.NextFunction) {
  try {
    res.locals.auth = await loadAuthContext(req);
  } catch (error) {
    console.error("Auth context error", error);
    res.locals.auth = null;
  }
  next();
}

function requireAdminScope(
  auth: AuthContext | null,
  config: ReturnType<typeof getConfig>,
  school: { id: string }
) {
  if (!auth) {
    return { ok: false as const, status: 401, error: "Unauthorized" };
  }

  const allowed = getAllowedSchools(auth, config);
  if (!allowed.some((item) => item.id === school.id)) {
    return { ok: false as const, status: 403, error: "Forbidden" };
  }

  return { ok: true as const };
}

app.use("/api/admin", attachAuthContext);

const SubmitSchema = z.object({
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  email: z.string().email(),
  phone: z.string().optional().nullable(),
  schoolId: z.string().min(1),
  campusId: z.string().min(1).nullable(),
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

const StartSchema = z.object({
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  email: z.string().email(),
  phone: z.string().min(1),
  schoolId: z.string().min(1),
  campusId: z.string().min(1).nullable(),
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
    consented: z.literal(true),
    textVersion: z.string(),
    timestamp: z.string()
  }),
  honeypot: z.string().optional()
});

const StepSchema = z.object({
  submissionId: z.string().uuid(),
  stepIndex: z.number().int().min(1),
  answers: z.record(z.any()).default({})
});

function buildMetadata(
  req: express.Request,
  metadata?: { utm?: Record<string, string>; referrer?: string; userAgent?: string }
) {
  const userAgent = metadata?.userAgent || req.get("user-agent") || undefined;
  const parsed = userAgent ? new UAParser(userAgent).getResult() : null;
  const browser = parsed?.browser?.name
    ? { name: parsed.browser.name, version: parsed.browser.version || null }
    : null;
  const device = parsed?.device?.type
    ? {
        type: parsed.device.type,
        vendor: parsed.device.vendor || null,
        model: parsed.device.model || null
      }
    : userAgent
      ? {
          type: "desktop",
          vendor: null,
          model: null
        }
      : null;

  return {
    ...metadata,
    referrer: metadata?.referrer || req.get("referer") || undefined,
    userAgent,
    browser,
    device,
    ip: req.ip
  };
}

function parseDateInput(value?: string) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

async function logAdminAudit(schoolId: string, event: string, payload: Record<string, unknown>) {
  await pool.query(
    `INSERT INTO admin_audit_log (id, school_id, event, payload, created_at)
     VALUES ($1, $2, $3, $4, $5)`,
    [uuidv4(), schoolId, event, payload, new Date()]
  );
}

function buildSubmissionFilters(req: express.Request, schoolId: string) {
  const clauses: string[] = ["school_id = $1"];
  const values: (string | number | Date)[] = [schoolId];

  const pushValue = (value: string | number | Date) => {
    values.push(value);
    return `$${values.length}`;
  };

  const status = typeof req.query.status === "string" ? req.query.status.trim() : "";
  if (status) {
    clauses.push(`status = ${pushValue(status)}`);
  }

  const programId = typeof req.query.programId === "string" ? req.query.programId.trim() : "";
  if (programId) {
    clauses.push(`program_id = ${pushValue(programId)}`);
  }

  const campusId = typeof req.query.campusId === "string" ? req.query.campusId.trim() : "";
  if (campusId) {
    if (campusId === "__null__") {
      clauses.push("campus_id IS NULL");
    } else {
      clauses.push(`campus_id = ${pushValue(campusId)}`);
    }
  }

  const search = typeof req.query.q === "string" ? req.query.q.trim() : "";
  if (search) {
    const placeholder = pushValue(`%${search}%`);
    clauses.push(
      `(email ILIKE ${placeholder} OR phone ILIKE ${placeholder} OR first_name ILIKE ${placeholder} OR last_name ILIKE ${placeholder})`
    );
  }

  const from = parseDateInput(typeof req.query.from === "string" ? req.query.from : undefined);
  if (from) {
    clauses.push(`created_at >= ${pushValue(from)}`);
  }

  const to = parseDateInput(typeof req.query.to === "string" ? req.query.to : undefined);
  if (to) {
    const end = new Date(to);
    end.setDate(end.getDate() + 1);
    clauses.push(`created_at < ${pushValue(end)}`);
  }

  const whereSql = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";

  return { whereSql, values };
}

function getAuthCookieOptions() {
  const secure = env.authCookieSecure || process.env.NODE_ENV === "production";
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure,
    path: "/"
  };
}

app.post("/api/auth/login", async (req, res) => {
  try {
    const parseResult = AuthLoginSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({ error: "Invalid payload", details: parseResult.error.format() });
    }

    const { email, password } = parseResult.data;
    const authResult = await authenticateUser(authRepo, email, password);
    if (!authResult.ok) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    await authRepo.updateLastLogin(authResult.user.id);
    const token = createSessionToken(authResult.user.id);
    res.cookie(env.authCookieName, token, getAuthCookieOptions());

    return res.json({
      user: {
        id: authResult.user.id,
        email: authResult.user.email,
        emailVerified: authResult.user.emailVerified
      }
    });
  } catch (error) {
    console.error("Auth login error", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

app.post("/api/auth/logout", (_req, res) => {
  res.clearCookie(env.authCookieName, getAuthCookieOptions());
  return res.json({ status: "ok" });
});

app.get("/api/auth/me", async (req, res) => {
  try {
    const token = req.cookies?.[env.authCookieName];
    if (!token) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const session = verifySessionToken(token);
    if (!session) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const user = await authRepo.findUserById(session.userId);
    if (!user) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    return res.json({
      user: {
        id: user.id,
        email: user.email,
        emailVerified: user.emailVerified
      }
    });
  } catch (error) {
    console.error("Auth me error", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

app.post("/api/auth/request-password-reset", async (req, res) => {
  try {
    const parseResult = AuthResetRequestSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({ error: "Invalid payload", details: parseResult.error.format() });
    }

    await requestPasswordReset(authRepo, parseResult.data.email);
    return res.json({ status: "ok" });
  } catch (error) {
    console.error("Auth reset request error", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

app.post("/api/auth/reset-password", async (req, res) => {
  try {
    const parseResult = AuthResetSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({ error: "Invalid payload", details: parseResult.error.format() });
    }

    const result = await resetPasswordWithToken(
      authRepo,
      parseResult.data.token,
      parseResult.data.password
    );

    if (!result.ok) {
      return res.status(400).json({ error: "Invalid or expired token" });
    }

    return res.json({ status: "ok" });
  } catch (error) {
    console.error("Auth reset error", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

app.get("/healthz", (_req, res) => {
  res.json({ status: "ok" });
});

app.get("/api/admin/:school/metrics", async (req, res) => {
  try {
    const schoolSlug = req.params.school;
    const auth = res.locals.auth as AuthContext | null;
    const config = getConfig();
    const school = config.schools.find((item) => item.slug === schoolSlug);

    if (!school) {
      return res.status(404).json({ error: "School not found" });
    }

    const authCheck = requireAdminScope(auth, config, school);
    if (!authCheck.ok) {
      return res.status(authCheck.status).json({ error: authCheck.error });
    }

    const now = new Date();
    const fromParam = req.query.from ? new Date(String(req.query.from)) : null;
    const toParam = req.query.to ? new Date(String(req.query.to)) : null;

    const to = toParam && !Number.isNaN(toParam.getTime()) ? toParam : now;
    const from = fromParam && !Number.isNaN(fromParam.getTime())
      ? fromParam
      : new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000);

    const summaryResult = await pool.query(
      `
        SELECT
          COUNT(*) AS leads,
          SUM(CASE WHEN status = 'delivered' THEN 1 ELSE 0 END) AS delivered,
          SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failed,
          SUM(CASE WHEN status = 'delivering' THEN 1 ELSE 0 END) AS delivering,
          SUM(CASE WHEN status = 'received' THEN 1 ELSE 0 END) AS received,
          MAX(COALESCE(last_step_completed, 0)) AS max_step
        FROM submissions
        WHERE school_id = $1 AND created_at >= $2 AND created_at < $3
      `,
      [school.id, from, to]
    );

    const stepsResult = await pool.query(
      `
        SELECT COALESCE(last_step_completed, 0) AS last_step_completed,
               COUNT(*) AS count
        FROM submissions
        WHERE school_id = $1 AND created_at >= $2 AND created_at < $3
        GROUP BY COALESCE(last_step_completed, 0)
      `,
      [school.id, from, to]
    );

    const perfResult = await pool.query(
      `
        SELECT campus_id, program_id,
          COUNT(*) AS leads,
          SUM(CASE WHEN status = 'delivered' THEN 1 ELSE 0 END) AS delivered,
          SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failed
        FROM submissions
        WHERE school_id = $1 AND created_at >= $2 AND created_at < $3
        GROUP BY campus_id, program_id
        ORDER BY leads DESC
        LIMIT 5
      `,
      [school.id, from, to]
    );

    const snapshotResult = await pool.query(
      `
        SELECT id, email, status, crm_lead_id, updated_at
        FROM submissions
        WHERE school_id = $1
        ORDER BY updated_at DESC
        LIMIT 5
      `,
      [school.id]
    );

    const summary = summaryResult.rows[0] || {};

    return res.json({
      school: {
        id: school.id,
        name: school.name,
        slug: school.slug,
        logoUrl: school.branding.logoUrl || null
      },
      period: { from: from.toISOString(), to: to.toISOString() },
      summary: {
        leads: Number(summary.leads || 0),
        delivered: Number(summary.delivered || 0),
        failed: Number(summary.failed || 0),
        delivering: Number(summary.delivering || 0),
        received: Number(summary.received || 0),
        maxStep: Number(summary.max_step || 0)
      },
      steps: stepsResult.rows.map((row) => ({
        step: Number(row.last_step_completed || 0),
        count: Number(row.count || 0)
      })),
      performance: perfResult.rows.map((row) => ({
        campusId: row.campus_id,
        programId: row.program_id,
        leads: Number(row.leads || 0),
        delivered: Number(row.delivered || 0),
        failed: Number(row.failed || 0)
      })),
      snapshots: snapshotResult.rows.map((row) => ({
        id: row.id,
        email: row.email,
        status: row.status,
        crmLeadId: row.crm_lead_id,
        updatedAt: row.updated_at
      }))
    });
  } catch (error) {
    console.error("Admin metrics error", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

app.get("/api/admin/:school/submissions", async (req, res) => {
  try {
    const schoolSlug = req.params.school;
    const auth = res.locals.auth as AuthContext | null;
    const config = getConfig();
    const school = config.schools.find((item) => item.slug === schoolSlug);

    if (!school) {
      return res.status(404).json({ error: "School not found" });
    }

    const authCheck = requireAdminScope(auth, config, school);
    if (!authCheck.ok) {
      return res.status(authCheck.status).json({ error: authCheck.error });
    }

    const limit = Math.min(Number(req.query.limit) || 25, 200);
    const offset = Math.max(Number(req.query.offset) || 0, 0);

    const { whereSql, values } = buildSubmissionFilters(req, school.id);

    const countResult = await pool.query(
      `
        SELECT COUNT(*)::int AS total
        FROM submissions
        ${whereSql}
      `,
      values
    );

    const result = await pool.query(
      `
        SELECT id, created_at, updated_at, delivered_at, school_id, campus_id, program_id,
               first_name, last_name, email, phone, answers, metadata, status,
               idempotency_key, consented, consent_text_version, consent_timestamp,
               crm_lead_id, last_step_completed, created_from_step
        FROM submissions
        ${whereSql}
        ORDER BY created_at DESC
        LIMIT $${values.length + 1} OFFSET $${values.length + 2}
      `,
      [...values, limit, offset]
    );

    return res.json({
      rows: result.rows.map((row) => ({
        id: row.id,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        deliveredAt: row.delivered_at,
        schoolId: row.school_id,
        campusId: row.campus_id,
        programId: row.program_id,
        firstName: row.first_name,
        lastName: row.last_name,
        email: row.email,
        phone: row.phone,
        answers: row.answers,
        metadata: row.metadata,
        status: row.status,
        idempotencyKey: row.idempotency_key,
        consented: row.consented,
        consentTextVersion: row.consent_text_version,
        consentTimestamp: row.consent_timestamp,
        crmLeadId: row.crm_lead_id,
        lastStepCompleted: row.last_step_completed,
        createdFromStep: row.created_from_step
      })),
      total: Number(countResult.rows[0]?.total || 0),
      limit,
      offset
    });
  } catch (error) {
    console.error("Admin submissions error", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

app.get("/api/admin/:school/submissions/export", async (req, res) => {
  try {
    const schoolSlug = req.params.school;
    const auth = res.locals.auth as AuthContext | null;
    const config = getConfig();
    const school = config.schools.find((item) => item.slug === schoolSlug);

    if (!school) {
      return res.status(404).json({ error: "School not found" });
    }

    const authCheck = requireAdminScope(auth, config, school);
    if (!authCheck.ok) {
      return res.status(authCheck.status).json({ error: authCheck.error });
    }

    const limit = Math.min(Number(req.query.limit) || 1000, 5000);
    const offset = Math.max(Number(req.query.offset) || 0, 0);
    const fieldsRaw = typeof req.query.fields === "string" ? req.query.fields : "";
    const fields = fieldsRaw
      .split(",")
      .map((field) => field.trim())
      .filter(Boolean);

    const allowedFields = new Set([
      "id",
      "created_at",
      "updated_at",
      "delivered_at",
      "school_id",
      "campus_id",
      "program_id",
      "first_name",
      "last_name",
      "email",
      "phone",
      "answers",
      "metadata",
      "status",
      "idempotency_key",
      "consented",
      "consent_text_version",
      "consent_timestamp",
      "crm_lead_id",
      "last_step_completed",
      "created_from_step"
    ]);

    const defaultFields = [
      "id",
      "created_at",
      "status",
      "first_name",
      "last_name",
      "email",
      "phone",
      "program_id",
      "campus_id",
      "crm_lead_id",
      "last_step_completed",
      "consented",
      "consent_text_version",
      "consent_timestamp"
    ];

    const selectedFields =
      fields.length > 0
        ? fields.filter((field) => allowedFields.has(field))
        : defaultFields;

    const finalFields = selectedFields.length > 0 ? selectedFields : defaultFields;

    const { whereSql, values } = buildSubmissionFilters(req, school.id);

    const escapeCsv = (value: unknown) => {
      if (value === null || value === undefined) return "";
      const text = typeof value === "string" ? value : JSON.stringify(value);
      const escaped = text.replace(/"/g, "\"\"");
      return `"${escaped}"`;
    };

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${school.slug}-submissions.csv"`
    );

    res.write(`${finalFields.join(",")}\n`);

    const chunkSize = 500;
    let remaining = limit;
    let chunkOffset = offset;
    let exportedCount = 0;

    while (remaining > 0) {
      const chunkLimit = Math.min(chunkSize, remaining);
      const result = await pool.query(
        `
          SELECT id, created_at, updated_at, delivered_at, school_id, campus_id, program_id,
                 first_name, last_name, email, phone, answers, metadata, status,
                 idempotency_key, consented, consent_text_version, consent_timestamp,
                 crm_lead_id, last_step_completed, created_from_step
          FROM submissions
          ${whereSql}
          ORDER BY created_at DESC
          LIMIT $${values.length + 1} OFFSET $${values.length + 2}
        `,
        [...values, chunkLimit, chunkOffset]
      );

      if (result.rows.length === 0) break;

      for (const row of result.rows) {
        const line = finalFields
          .map((field) => {
            const value = row[field];
            return escapeCsv(value);
          })
          .join(",");
        res.write(`${line}\n`);
      }

      exportedCount += result.rows.length;
      remaining -= result.rows.length;
      chunkOffset += result.rows.length;

      if (result.rows.length < chunkLimit) break;
    }

    await logAdminAudit(school.id, "export_submissions", {
      fields: finalFields,
      limit,
      offset,
      filters: {
        q: req.query.q || null,
        status: req.query.status || null,
        programId: req.query.programId || null,
        campusId: req.query.campusId || null,
        from: req.query.from || null,
        to: req.query.to || null
      },
      exportedCount
    });

    return res.end();
  } catch (error) {
    console.error("Admin submissions export error", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

app.post("/api/lead/start", async (req, res) => {
  try {
    const parseResult = StartSchema.safeParse(req.body);
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
      phone: payload.phone,
      schoolId: payload.schoolId,
      campusId: payload.campusId,
      programId: payload.programId
    });

    const now = new Date();
    const metadata = buildMetadata(req, payload.metadata);

    const insertResult = await pool.query(
      `
        INSERT INTO submissions
          (id, created_at, updated_at, school_id, campus_id, program_id, first_name, last_name, email, phone, answers, metadata, status, idempotency_key, consented, consent_text_version, consent_timestamp, last_step_completed, created_from_step)
        VALUES
          ($1, $2, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $17)
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
        payload.phone,
        payload.answers,
        metadata,
        "received",
        idempotencyKey,
        payload.consent.consented,
        payload.consent.textVersion,
        new Date(payload.consent.timestamp),
        1
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
        [uuidv4(), submissionId, "received", { metadata, stepIndex: 1 }, now]
      );
      console.log(`[${submissionId}] Submission received`);
    }

    if (wasInserted) {
      await deliveryQueue.add(
        "create_lead",
        {
          submissionId,
          stepIndex: 1
        },
        {
          jobId: `create-${submissionId}`,
          attempts: env.deliveryMaxAttempts,
          backoff: {
            type: "exponential",
            delay: env.deliveryBackoffMs
          },
          removeOnComplete: true,
          removeOnFail: false
        }
      );
      console.log(`[${submissionId}] Create lead job queued`);
    }

    return res.status(202).json({ submissionId: finalSubmissionId, status: "received", idempotencyKey });
  } catch (error) {
    console.error("Start lead error", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

app.post("/api/lead/step", async (req, res) => {
  try {
    const parseResult = StepSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({ error: "Invalid payload", details: parseResult.error.format() });
    }

    const payload = parseResult.data;

    if (Object.keys(payload.answers).length === 0) {
      return res.status(400).json({ error: "No answers provided" });
    }

    const now = new Date();
    const updateResult = await pool.query(
      `
        UPDATE submissions
        SET answers = COALESCE(answers, '{}'::jsonb) || $1::jsonb,
            updated_at = $2,
            last_step_completed = GREATEST(COALESCE(last_step_completed, 0), $3)
        WHERE id = $4
        RETURNING id, status
      `,
      [payload.answers, now, payload.stepIndex, payload.submissionId]
    );

    if (updateResult.rowCount === 0) {
      return res.status(404).json({ error: "Submission not found" });
    }

    await pool.query(
      `INSERT INTO audit_log (id, submission_id, event, payload, created_at)
       VALUES ($1, $2, $3, $4, $5)`,
      [uuidv4(), payload.submissionId, "step_update", { stepIndex: payload.stepIndex }, now]
    );

    await deliveryQueue.add(
      "update_lead",
      {
        submissionId: payload.submissionId,
        stepIndex: payload.stepIndex
      },
      {
        jobId: `update-${payload.submissionId}-${payload.stepIndex}`,
        attempts: env.deliveryMaxAttempts,
        backoff: {
          type: "exponential",
          delay: env.deliveryBackoffMs
        },
        removeOnComplete: true,
        removeOnFail: false
      }
    );

    return res.status(202).json({ submissionId: payload.submissionId, status: "received" });
  } catch (error) {
    console.error("Step update error", error);
    return res.status(500).json({ error: "Internal server error" });
  }
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
    const metadata = buildMetadata(req, payload.metadata);

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
        "create_lead",
        {
          submissionId,
          stepIndex: 1
        },
        {
          jobId: `create-${submissionId}`,
          attempts: env.deliveryMaxAttempts,
          backoff: {
            type: "exponential",
            delay: env.deliveryBackoffMs
          },
          removeOnComplete: true,
          removeOnFail: false
        }
      );
      console.log(`[${submissionId}] Create lead job queued`);
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
