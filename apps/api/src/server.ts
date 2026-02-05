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
import { getConfigForClient, invalidateConfigCache } from "./config";
import { createConfigStore } from "./configStore";
import { PgAuthRepo } from "./authRepo";
import {
  authenticateUser,
  createSessionToken,
  hashPassword,
  requestPasswordReset,
  resetPasswordWithToken,
  verifySessionToken
} from "./auth";
import { type AuthContext, type UserRole } from "./authz";
import { getAllowedSchools } from "./tenantScope";
import { resolveEntitiesByIds, resolveLandingPageBySlugs, type Config } from "@lead_lander/config-schema";
import { requireSchoolAccess, requireClientAccess } from "./middleware/clientScope";
import { requireConfigAccess } from "./middleware/configAccess";

export const app = express();

function parseTrustProxy(value: string) {
  const normalized = value.trim().toLowerCase();
  if (!normalized) return false;
  if (normalized === "true") return true;
  if (normalized === "false") return false;
  if (/^\d+$/.test(normalized)) return Number(normalized);
  return value;
}

if (env.trustProxy) {
  app.set("trust proxy", parseTrustProxy(env.trustProxy));
}
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
const configStore = createConfigStore(pool);

const AuthLoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  schoolSlug: z.string().min(1)
});

const AuthResetRequestSchema = z.object({
  email: z.string().email(),
  schoolSlug: z.string().min(1)
});

const AuthResetSchema = z.object({
  token: z.string().min(1),
  password: z.string().min(8)
});

const RoleSchema = z.enum(["super_admin", "client_admin", "school_admin", "staff"]);

const AdminUserCreateSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  role: RoleSchema,
  schoolId: z.string().min(1).nullable().optional()
});

const AdminUserUpdateSchema = z.object({
  isActive: z.boolean().optional(),
  role: RoleSchema.optional(),
  schoolId: z.string().min(1).nullable().optional()
});

const AdminDraftSchema = z.object({
  programId: z.string().min(1),
  landingCopy: z.object({
    headline: z.string().min(1),
    subheadline: z.string().min(1),
    body: z.string().min(1),
    ctaText: z.string().min(1)
  }),
  action: z.enum(["draft", "submit"])
});

const AdminConfigRollbackSchema = z.object({
  versionId: z.string().uuid()
});

const SuperClientCreateSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1)
});

const SuperClientUpdateSchema = z.object({
  name: z.string().min(1).optional()
});

const SuperSchoolCreateSchema = z.object({
  id: z.string().min(1),
  slug: z.string().min(1),
  name: z.string().min(1),
  crmConnectionId: z.string().min(1)
});

const SuperSchoolUpdateSchema = z.object({
  slug: z.string().min(1).optional(),
  name: z.string().min(1).optional(),
  branding: z.record(z.any()).optional(),
  compliance: z.record(z.any()).optional(),
  crmConnectionId: z.string().min(1).optional(),
  thankYou: z.record(z.any()).optional(),
  disqualificationConfig: z.record(z.any()).optional()
});

const SuperProgramCreateSchema = z.object({
  id: z.string().min(1),
  schoolId: z.string().min(1),
  slug: z.string().min(1),
  name: z.string().min(1)
});

const SuperProgramUpdateSchema = z.object({
  slug: z.string().min(1).optional(),
  name: z.string().min(1).optional(),
  templateType: z.enum(["minimal", "full"]).optional(),
  categoryId: z.string().uuid().nullable().optional()
});

const SuperAdminUserCreateSchema = z.object({
  email: z.string().email(),
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

async function getSchoolBySlug(slug: string) {
  // Legacy function - now queries accounts table for compatibility
  const result = await pool.query(
    `SELECT id, client_id, slug, name, branding, compliance, crm_connection_id, thank_you
     FROM accounts
     WHERE slug = $1 AND is_active = true
     LIMIT 1`,
    [slug]
  );
  return result.rows[0] || null;
}

async function getSchoolById(id: string) {
  // Legacy function - now queries accounts table for compatibility
  const result = await pool.query(
    `SELECT id, client_id, slug, name, branding, compliance, crm_connection_id, thank_you
     FROM accounts
     WHERE id = $1 AND is_active = true
     LIMIT 1`,
    [id]
  );
  return result.rows[0] || null;
}

// ============================================================================
// ACCOUNT HELPERS (new architecture)
// ============================================================================

async function getAccountBySlug(slug: string) {
  const result = await pool.query(
    `SELECT id, client_id, slug, name, branding, compliance, crm_connection_id, footer_content, thank_you, is_active
     FROM accounts
     WHERE slug = $1 AND is_active = true
     LIMIT 1`,
    [slug]
  );
  return result.rows[0] || null;
}

async function getAccountById(id: string) {
  const result = await pool.query(
    `SELECT id, client_id, slug, name, branding, compliance, crm_connection_id, footer_content, thank_you, is_active
     FROM accounts
     WHERE id = $1 AND is_active = true
     LIMIT 1`,
    [id]
  );
  return result.rows[0] || null;
}

async function getLocationsByAccountId(accountId: string) {
  const result = await pool.query(
    `SELECT id, client_id, account_id, slug, name, address, city, state, zip_code, latitude, longitude, routing_tags, notifications, is_active
     FROM locations
     WHERE account_id = $1 AND is_active = true
     ORDER BY name`,
    [accountId]
  );
  return result.rows;
}

async function getProgramsByAccountId(accountId: string) {
  const result = await pool.query(
    `SELECT id, client_id, account_id, slug, name, description, landing_copy, lead_form,
            hero_image, hero_background_color, hero_background_image, highlights, testimonials,
            faqs, stats, sections_config, display_order, is_active
     FROM programs
     WHERE account_id = $1 AND is_active = true
     ORDER BY display_order, name`,
    [accountId]
  );
  return result.rows;
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

function requireAdminScope(auth: AuthContext | null, config: Config, school: { id: string }) {
  if (!auth) {
    return { ok: false as const, status: 401, error: "Unauthorized" };
  }

  const allowed = getAllowedSchools(auth, config);
  if (!allowed.some((item) => item.id === school.id)) {
    return { ok: false as const, status: 403, error: "Forbidden" };
  }

  return { ok: true as const };
}

function requireClientAdmin(auth: AuthContext | null, clientId: string) {
  if (!auth) {
    return { ok: false as const, status: 401, error: "Unauthorized" };
  }

  const isSuper = auth.roles.some((role) => role.role === "super_admin");
  if (isSuper) {
    return { ok: true as const };
  }

  const isClientAdmin = auth.roles.some((role) => role.role === "client_admin");
  if (isClientAdmin && auth.user.clientId === clientId) {
    return { ok: true as const };
  }

  return { ok: false as const, status: 403, error: "Forbidden" };
}

function requireSuperAdmin(auth: AuthContext | null) {
  if (!auth) {
    return { ok: false as const, status: 401, error: "Unauthorized" };
  }
  const isSuper = auth.roles.some((role) => role.role === "super_admin");
  if (!isSuper) {
    return { ok: false as const, status: 403, error: "Forbidden" };
  }
  return { ok: true as const };
}

// Trigger webhook for a school event
async function triggerWebhook(schoolId: string, eventType: string, submissionId: string, additionalData?: any) {
  try {
    // Get active webhook configs for this school
    const webhooksResult = await pool.query(
      `SELECT id, webhook_url, events, headers
       FROM webhook_configs
       WHERE school_id = $1 AND is_active = true AND $2 = ANY(events)`,
      [schoolId, eventType]
    );

    if (webhooksResult.rows.length === 0) {
      return; // No webhooks configured for this event
    }

    // Get submission data
    const submissionResult = await pool.query(
      `SELECT s.*, qs.answers as quiz_answers, qs.category_scores as quiz_category_scores, qs.program_scores as quiz_program_scores
       FROM submissions s
       LEFT JOIN quiz_sessions qs ON qs.id = s.quiz_session_id
       WHERE s.id = $1`,
      [submissionId]
    );

    if (submissionResult.rows.length === 0) {
      console.error(`Submission ${submissionId} not found for webhook`);
      return;
    }

    const submission = submissionResult.rows[0];

    // Build webhook payload
    const payload = {
      event: eventType,
      timestamp: new Date().toISOString(),
      submissionId: submission.id,
      schoolId: submission.school_id,
      campusId: submission.campus_id,
      programId: submission.program_id,
      recommendedProgramId: submission.recommended_program_id,
      contact: {
        firstName: submission.first_name,
        lastName: submission.last_name,
        email: submission.email,
        phone: submission.phone
      },
      landingAnswers: submission.landing_answers || {},
      quizAnswers: submission.quiz_answers || {},
      quizProgress: submission.quiz_progress || {},
      categoryScores: submission.category_scores || {},
      programScores: submission.program_scores || {},
      isQualified: submission.is_qualified,
      disqualificationReasons: submission.disqualification_reasons || [],
      status: submission.status,
      source: submission.source,
      quizStartedAt: submission.quiz_started_at,
      quizCompletedAt: submission.quiz_completed_at,
      createdAt: submission.created_at,
      updatedAt: submission.updated_at,
      ...additionalData
    };

    // Trigger each webhook
    for (const webhook of webhooksResult.rows) {
      try {
        const headers: any = {
          "Content-Type": "application/json",
          "User-Agent": "LeadLander-Webhook/1.0",
          ...(webhook.headers || {})
        };

        const response = await fetch(webhook.webhook_url, {
          method: "POST",
          headers,
          body: JSON.stringify(payload)
        });

        const responseBody = await response.text();

        // Log webhook delivery
        await pool.query(
          `INSERT INTO webhook_logs
           (id, webhook_config_id, submission_id, event_type, payload, response_status, response_body, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
          [uuidv4(), webhook.id, submissionId, eventType, payload, response.status, responseBody.substring(0, 5000)]
        );

        if (!response.ok) {
          console.error(`Webhook ${webhook.id} failed: ${response.status} ${responseBody}`);
        }
      } catch (error: any) {
        console.error(`Webhook ${webhook.id} error:`, error);

        // Log webhook error
        await pool.query(
          `INSERT INTO webhook_logs
           (id, webhook_config_id, submission_id, event_type, payload, error_message, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
          [uuidv4(), webhook.id, submissionId, eventType, payload, error.message]
        );
      }
    }
  } catch (error) {
    console.error("Webhook trigger error:", error);
  }
}

app.use("/api/admin", attachAuthContext);
app.use("/api/super", attachAuthContext);

const SubmitSchema = z.object({
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  email: z.string().email(),
  phone: z.string().optional().nullable(),
  schoolId: z.string().min(1),
  campusId: z.string().min(1).nullable(),
  programId: z.string().min(1),
  answers: z.record(z.any()).default({}),
  landingAnswers: z.record(z.any()).optional(),
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

// Account-based schema (new architecture)
const StartSchemaV2 = z.object({
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  email: z.string().email(),
  phone: z.string().optional(),
  zipCode: z.string().optional(),
  accountId: z.string().min(1),
  locationId: z.string().min(1).nullable().optional(),
  programId: z.string().min(1).nullable().optional(),
  landingAnswers: z.record(z.any()).default({}),
  metadata: z
    .object({
      utm: z.record(z.string()).optional(),
      referrer: z.string().optional(),
      userAgent: z.string().optional(),
      source: z.string().optional()
    })
    .optional(),
  consented: z.literal(true),
  consentTextVersion: z.string()
});

// Legacy school-based schema (for backwards compatibility)
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

async function logAdminAudit(
  clientId: string,
  schoolId: string,
  event: string,
  payload: Record<string, unknown>
) {
  await pool.query(
    `INSERT INTO admin_audit_log (id, client_id, school_id, event, payload, created_at)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [uuidv4(), clientId, schoolId, event, payload, new Date()]
  );
}

function buildSubmissionFilters(req: express.Request, clientId: string, schoolId: string) {
  const clauses: string[] = ["client_id = $1", "school_id = $2"];
  const values: (string | number | Date)[] = [clientId, schoolId];

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

function normalizeSameSite(value: string) {
  const normalized = value.trim().toLowerCase();
  if (normalized === "none") return "none" as const;
  if (normalized === "strict") return "strict" as const;
  return "lax" as const;
}

function getAuthCookieOptions() {
  const sameSite = normalizeSameSite(env.authCookieSameSite || "lax");
  const secure = env.authCookieSecure || process.env.NODE_ENV === "production" || sameSite === "none";
  const options: {
    httpOnly: true;
    sameSite: "lax" | "strict" | "none";
    secure: boolean;
    path: "/";
    domain?: string;
  } = {
    httpOnly: true,
    sameSite,
    secure,
    path: "/"
  };

  if (env.authCookieDomain) {
    options.domain = env.authCookieDomain;
  }

  return options;
}

app.post("/api/auth/login", async (req, res) => {
  try {
    const parseResult = AuthLoginSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({ error: "Invalid payload", details: parseResult.error.format() });
    }

    const { email, password, schoolSlug } = parseResult.data;
    const school = await getSchoolBySlug(schoolSlug);

    // Security: Don't reveal if school exists or not - return generic error
    if (!school) {
      // Simulate authentication delay to prevent timing attacks
      await new Promise(resolve => setTimeout(resolve, 100));
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const authResult = await authenticateUser(authRepo, school.client_id, email, password);
    if (!authResult.ok) {
      // Don't reveal account status - return generic error
      return res.status(401).json({ error: "Invalid credentials" });
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

    // Get accessible schools for this user
    const rolesResult = await pool.query(
      "SELECT role, school_id FROM user_roles WHERE user_id = $1",
      [user.id]
    );

    const roles = rolesResult.rows.map((row) => ({
      role: row.role,
      schoolId: row.school_id ?? null
    })) as UserRole[];

    const auth: AuthContext = { user, roles };

    let accessibleSchools: Array<{ id: string; slug: string; name: string }> = [];
    if (user.clientId) {
      try {
        const config = await getConfigForClient(user.clientId);
        accessibleSchools = getAllowedSchools(auth, config);
      } catch (configError) {
        console.error("Failed to load config for client", user.clientId, configError);
        // Super admins may not have valid config, so we continue without schools
      }
    }

    return res.json({
      user: {
        id: user.id,
        email: user.email,
        emailVerified: user.emailVerified,
        roles: roles
      },
      schools: accessibleSchools.map((school) => ({
        id: school.id,
        slug: school.slug,
        name: school.name
      }))
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

    const school = await getSchoolBySlug(parseResult.data.schoolSlug);
    if (!school) {
      // Security: Avoid revealing whether a school exists.
      await new Promise((resolve) => setTimeout(resolve, 100));
      return res.json({ status: "ok" });
    }

    await requestPasswordReset(authRepo, school.client_id, parseResult.data.email);
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

// ============================================================================
// NEW ACCOUNT-BASED PUBLIC API ROUTES
// ============================================================================

// List all active accounts
app.get("/api/public/accounts", async (_req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, slug, name, branding
       FROM accounts
       WHERE is_active = true
       ORDER BY name`
    );

    return res.json({
      accounts: result.rows.map((row) => ({
        id: row.id,
        slug: row.slug,
        name: row.name,
        branding: row.branding
      }))
    });
  } catch (error) {
    console.error("Public accounts list error", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// Get account with locations and programs
app.get("/api/public/accounts/:accountSlug", async (req, res) => {
  try {
    const account = await getAccountBySlug(req.params.accountSlug);
    if (!account) {
      return res.status(404).json({ error: "Account not found" });
    }

    const locations = await getLocationsByAccountId(account.id);
    const programs = await getProgramsByAccountId(account.id);

    return res.json({
      account: {
        id: account.id,
        clientId: account.client_id,
        slug: account.slug,
        name: account.name,
        branding: account.branding,
        compliance: account.compliance,
        footerContent: account.footer_content,
        thankYou: account.thank_you,
        isActive: account.is_active
      },
      locations: locations.map((loc: any) => ({
        id: loc.id,
        clientId: loc.client_id,
        accountId: loc.account_id,
        slug: loc.slug,
        name: loc.name,
        address: loc.address,
        city: loc.city,
        state: loc.state,
        zipCode: loc.zip_code,
        latitude: loc.latitude ? parseFloat(loc.latitude) : null,
        longitude: loc.longitude ? parseFloat(loc.longitude) : null,
        routingTags: loc.routing_tags,
        notifications: loc.notifications,
        isActive: loc.is_active
      })),
      programs: programs.map((prog: any) => ({
        id: prog.id,
        clientId: prog.client_id,
        accountId: prog.account_id,
        slug: prog.slug,
        name: prog.name,
        description: prog.description,
        landingCopy: prog.landing_copy,
        leadForm: prog.lead_form,
        heroImage: prog.hero_image,
        highlights: prog.highlights,
        testimonials: prog.testimonials,
        faqs: prog.faqs,
        stats: prog.stats,
        sectionsConfig: prog.sections_config,
        displayOrder: prog.display_order,
        isActive: prog.is_active
      }))
    });
  } catch (error) {
    console.error("Public account fetch error", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// Find nearest location by ZIP code
app.get("/api/public/accounts/:accountSlug/nearest-location", async (req, res) => {
  try {
    const zipCode = req.query.zip as string;
    if (!zipCode || zipCode.length < 5) {
      return res.status(400).json({ error: "Valid ZIP code required" });
    }

    const account = await getAccountBySlug(req.params.accountSlug);
    if (!account) {
      return res.status(404).json({ error: "Account not found" });
    }

    // Import ZIP lookup utility
    const { findNearestLocation } = await import("../../../scripts/zip-lookup");
    const nearestLocation = await findNearestLocation(pool, account.id, zipCode);

    if (!nearestLocation) {
      return res.json({ location: null });
    }

    return res.json({
      location: {
        id: nearestLocation.id,
        name: nearestLocation.name,
        city: nearestLocation.city,
        state: nearestLocation.state,
        zipCode: nearestLocation.zipCode,
        distance: nearestLocation.distance
      }
    });
  } catch (error) {
    console.error("Nearest location error", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// Get quiz questions for an account
app.get("/api/public/accounts/:accountSlug/quiz", async (req, res) => {
  try {
    const account = await getAccountBySlug(req.params.accountSlug);
    if (!account) {
      return res.status(404).json({ error: "Account not found" });
    }

    // Fetch quiz questions for this account
    const questionsResult = await pool.query(
      `SELECT id, account_id, question_text, question_type, help_text, display_order, conditional_on, is_active
       FROM quiz_questions
       WHERE account_id = $1 AND is_active = true
       ORDER BY display_order`,
      [account.id]
    );

    // Fetch answer options for each question
    const questions = await Promise.all(
      questionsResult.rows.map(async (q) => {
        const optionsResult = await pool.query(
          `SELECT id, option_text, display_order
           FROM quiz_answer_options
           WHERE question_id = $1
           ORDER BY display_order`,
          [q.id]
        );

        return {
          id: q.id,
          questionText: q.question_text,
          questionType: q.question_type,
          helpText: q.help_text,
          displayOrder: q.display_order,
          conditionalOn: q.conditional_on,
          options: optionsResult.rows.map((opt) => ({
            id: opt.id,
            optionText: opt.option_text,
            displayOrder: opt.display_order
            // Note: point_assignments are NOT sent to client for security
          }))
        };
      })
    );

    return res.json({ questions });
  } catch (error) {
    console.error("Public quiz fetch error", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// Calculate program recommendation based on quiz answers
app.post("/api/public/accounts/:accountSlug/quiz/recommend", async (req, res) => {
  try {
    const account = await getAccountBySlug(req.params.accountSlug);
    if (!account) {
      return res.status(404).json({ error: "Account not found" });
    }

    const { submissionId, answers } = req.body;

    if (!answers || typeof answers !== "object") {
      return res.status(400).json({ error: "Invalid answers format" });
    }

    // Get all programs for this account
    const programs = await getProgramsByAccountId(account.id);

    // Initialize scores for each program
    const programScores: Record<string, number> = {};
    programs.forEach((p) => {
      programScores[p.id] = 0;
    });

    // Calculate scores based on answers
    for (const [questionId, answer] of Object.entries(answers)) {
      const answerArray = Array.isArray(answer) ? answer : [answer];

      for (const optionId of answerArray) {
        // Fetch the option with point assignments
        const optionResult = await pool.query(
          `SELECT point_assignments
           FROM quiz_answer_options
           WHERE id = $1`,
          [optionId]
        );

        if (optionResult.rows.length > 0) {
          const pointAssignments = optionResult.rows[0].point_assignments || {};

          // Add points to relevant programs
          for (const [programId, points] of Object.entries(pointAssignments)) {
            if (programScores[programId] !== undefined) {
              programScores[programId] += Number(points);
            }
          }
        }
      }
    }

    // Find recommended program (highest score)
    let recommendedProgram = null;
    let maxScore = 0;

    for (const [programId, score] of Object.entries(programScores)) {
      if (score > maxScore) {
        maxScore = score;
        const program = programs.find((p) => p.id === programId);
        if (program) {
          recommendedProgram = {
            id: program.id,
            name: program.name,
            slug: program.slug,
            description: program.description,
            score: maxScore
          };
        }
      }
    }

    // Update submission with quiz answers and recommended program
    if (submissionId) {
      try {
        await pool.query(
          `UPDATE submissions
           SET quiz_answers = $1, recommended_program_id = $2, updated_at = NOW()
           WHERE id = $3`,
          [JSON.stringify(answers), recommendedProgram?.id || null, submissionId]
        );
      } catch (updateError) {
        console.error("Failed to update submission with quiz results", updateError);
        // Continue even if update fails - don't break user experience
      }
    }

    return res.json({
      recommendedProgram,
      scores: programScores
    });
  } catch (error) {
    console.error("Quiz recommendation error", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// ============================================================================
// LEGACY SCHOOL-BASED PUBLIC API ROUTES
// ============================================================================

app.get("/api/public/schools/:school", async (req, res) => {
  try {
    const schoolParam = req.params.school;
    // Support both slug and ID for flexibility
    let school = await getSchoolBySlug(schoolParam);
    if (!school) {
      school = await getSchoolById(schoolParam);
    }
    if (!school) {
      return res.status(404).json({ error: "School not found" });
    }
    return res.json({
      school: {
        id: school.id,
        slug: school.slug,
        name: school.name,
        branding: school.branding,
        compliance: school.compliance,
        thankYou: school.thank_you || null
      }
    });
  } catch (error) {
    console.error("Public school error", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// Get programs for a school (public endpoint)
app.get("/api/public/schools/:schoolId/programs", async (req, res) => {
  try {
    const schoolId = req.params.schoolId;
    const school = await getSchoolById(schoolId);
    if (!school) {
      return res.status(404).json({ error: "School not found" });
    }

    const config = await getConfigForClient(school.client_id);
    const programs = config.programs
      .filter((p) => p.schoolId === schoolId)
      .map((p) => ({
        id: p.id,
        name: p.name,
        slug: p.slug
      }));

    return res.json({ programs });
  } catch (error) {
    console.error("Public programs fetch error", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

app.get("/api/public/landing/:school/:program", async (req, res) => {
  try {
    const schoolParam = req.params.school;
    const programSlug = req.params.program;
    // Support both slug and ID for flexibility
    let school = await getSchoolBySlug(schoolParam);
    if (!school) {
      school = await getSchoolById(schoolParam);
    }
    if (!school) {
      return res.status(404).json({ error: "School not found" });
    }

    const config = await getConfigForClient(school.client_id);
    const resolved = resolveLandingPageBySlugs(config, school.slug, programSlug);
    if (!resolved) {
      return res.status(404).json({ error: "Landing page not found" });
    }

    const campuses = config.campuses.filter((item) => item.schoolId === school.id);
    const programs = config.programs.filter((item) => item.schoolId === school.id);

    return res.json({ landing: resolved, campuses, programs });
  } catch (error) {
    console.error("Public landing error", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

app.get("/api/public/school/:schoolId/landing/:programSlug", async (req, res) => {
  try {
    const schoolId = req.params.schoolId;
    const programSlug = req.params.programSlug;

    console.log(`[Landing] Fetching for school=${schoolId}, program=${programSlug}`);

    const school = await getSchoolById(schoolId);
    if (!school) {
      console.log(`[Landing] School not found: ${schoolId}`);
      return res.status(404).json({ error: "School not found" });
    }

    console.log(`[Landing] Found school: ${school.name} (${school.id})`);

    const config = await getConfigForClient(school.client_id);
    console.log(`[Landing] Config loaded, programs count: ${config.programs.length}`);

    const schoolConfig = config.schools.find((s) => s.id === schoolId);
    if (!schoolConfig) {
      console.log(`[Landing] School config not found in config: ${schoolId}`);
      return res.status(404).json({ error: "School config not found" });
    }

    const program = config.programs.find(
      (p) => p.schoolId === schoolId && p.slug === programSlug
    );
    if (!program) {
      console.log(`[Landing] Program not found: ${programSlug}`);
      console.log(`[Landing] Available programs: ${config.programs.filter(p => p.schoolId === schoolId).map(p => p.slug).join(', ')}`);
      return res.status(404).json({ error: "Program not found" });
    }

    console.log(`[Landing] Found program: ${program.name} (${program.id})`);

    const campuses = config.campuses.filter((item) => item.schoolId === schoolId);
    const programs = config.programs.filter((item) => item.schoolId === schoolId);

    // Extract landingCopy from program (required by landing page)
    const landingCopy = program.landingCopy || {
      headline: program.name,
      subheadline: `Learn more about ${program.name}`,
      body: `Start your career with our ${program.name} program.`,
      ctaText: "Get Started"
    };

    console.log(`[Landing] Returning response with landingCopy:`, landingCopy);

    return res.json({
      landing: {
        school: schoolConfig,
        program,
        landingCopy,
        questionOverrides: program.questionOverrides
      },
      campuses,
      programs
    });
  } catch (error) {
    console.error("[Landing] Error:", error);
    console.error("[Landing] Stack:", (error as Error).stack);
    return res.status(500).json({
      error: "Internal server error",
      message: (error as Error).message
    });
  }
});

// Get quiz questions for a school (public endpoint)
app.get("/api/public/schools/:schoolId/quiz", async (req, res) => {
  try {
    const schoolId = req.params.schoolId;
    const school = await getSchoolById(schoolId);
    if (!school) {
      return res.status(404).json({ error: "School not found" });
    }

    const config = await getConfigForClient(school.client_id);

    // Filter questions for this school
    const questions = config.quizQuestions
      .filter((q) => q.isActive && (!q.schoolId || q.schoolId === schoolId))
      .map((q) => {
        const options = config.quizAnswerOptions
          .filter((opt) => opt.questionId === q.id)
          .map((opt) => ({
            id: opt.id,
            optionText: opt.optionText,
            displayOrder: opt.displayOrder
            // Note: pointAssignments are NOT sent to client for security
          }));

        return {
          id: q.id,
          questionText: q.questionText,
          questionType: q.questionType,
          helpText: q.helpText,
          displayOrder: q.displayOrder,
          conditionalOn: q.conditionalOn,
          options
        };
      })
      .sort((a, b) => a.displayOrder - b.displayOrder);

    // Get all programs for this school (all programs use school master quiz)
    const programs = config.programs
      .filter((p) => p.schoolId === schoolId)
      .map((p) => ({
        id: p.id,
        name: p.name,
        slug: p.slug
      }));

    return res.json({ questions, programs });
  } catch (error) {
    console.error("Public quiz fetch error", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// Calculate program recommendation based on quiz answers (public endpoint)
app.post("/api/public/schools/:schoolId/quiz/recommend", async (req, res) => {
  try {
    const schoolId = req.params.schoolId;
    const { answers } = req.body; // answers: { questionId: optionId or [optionIds] }

    if (!answers || typeof answers !== "object") {
      return res.status(400).json({ error: "Invalid answers format" });
    }

    const school = await getSchoolById(schoolId);
    if (!school) {
      return res.status(404).json({ error: "School not found" });
    }

    const config = await getConfigForClient(school.client_id);

    // Get all programs for this school (all programs use school master quiz)
    const programs = config.programs.filter(
      (p) => p.schoolId === schoolId
    );

    const programScores: Record<string, number> = {};

    // Initialize scores
    programs.forEach((p) => {
      programScores[p.id] = 0;
    });

    // Calculate scores
    for (const [questionId, answer] of Object.entries(answers)) {
      const answerArray = Array.isArray(answer) ? answer : [answer];

      for (const optionId of answerArray) {
        const option = config.quizAnswerOptions.find((opt) => opt.id === optionId);

        if (option) {
          const pointAssignments = option.pointAssignments || {};
          for (const [programId, points] of Object.entries(pointAssignments)) {
            if (programScores[programId] !== undefined) {
              programScores[programId] += Number(points);
            }
          }
        }
      }
    }

    // Find recommended program (highest score)
    let recommendedProgram = null;
    let maxScore = 0;

    for (const [programId, score] of Object.entries(programScores)) {
      if (score > maxScore) {
        maxScore = score;
        const program = programs.find((p) => p.id === programId);
        if (program) {
          recommendedProgram = {
            id: program.id,
            name: program.name,
            slug: program.slug,
            score
          };
        }
      }
    }

    return res.json({
      recommendedProgram,
      quizScore: programScores
    });
  } catch (error) {
    console.error("Public quiz recommendation error", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

app.get("/api/admin/schools", attachAuthContext, requireClientAccess, async (req, res) => {
  try {
    const auth = res.locals.auth as AuthContext | null;
    if (!auth || !auth.user.clientId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const config = await getConfigForClient(auth.user.clientId);
    const accessibleSchools = getAllowedSchools(auth, config);

    return res.json({
      schools: accessibleSchools.map((school) => ({
        id: school.id,
        slug: school.slug,
        name: school.name
      }))
    });
  } catch (error) {
    console.error("Admin schools list error", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// Get landing page questions for a school (public endpoint)
app.get("/api/public/schools/:schoolId/landing-questions", async (req, res) => {
  try {
    const { schoolId } = req.params;

    const questions = await pool.query(
      `SELECT lpq.id, lpq.question_text, lpq.question_type, lpq.help_text, lpq.display_order, lpq.is_required, lpq.crm_field_name
       FROM landing_page_questions lpq
       WHERE lpq.school_id = $1
       ORDER BY lpq.display_order, lpq.created_at`,
      [schoolId]
    );

    const questionIds = questions.rows.map((q) => q.id);
    let options: any[] = [];

    if (questionIds.length > 0) {
      const optionsResult = await pool.query(
        `SELECT id, question_id, option_text, option_value, display_order
         FROM landing_page_question_options
         WHERE question_id = ANY($1)
         ORDER BY question_id, display_order`,
        [questionIds]
      );
      options = optionsResult.rows;
    }

    return res.json({
      questions: questions.rows.map((q) => ({
        id: q.id,
        questionText: q.question_text,
        questionType: q.question_type,
        helpText: q.help_text,
        displayOrder: q.display_order,
        isRequired: q.is_required,
        crmFieldName: q.crm_field_name,
        options: options
          .filter((o) => o.question_id === q.id)
          .map((o) => ({
            id: o.id,
            optionText: o.option_text,
            optionValue: o.option_value,
            displayOrder: o.display_order
          }))
      }))
    });
  } catch (error) {
    console.error("Public landing questions fetch error", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// Create submission from landing page (public endpoint)
app.post("/api/public/schools/:schoolId/submissions", async (req, res) => {
  try {
    const { schoolId } = req.params;
    const {
      programId,
      campusId,
      firstName,
      lastName,
      email,
      phone,
      landingAnswers,
      consented,
      consentTextVersion,
      consentTimestamp
    } = req.body;

    // Validate required fields
    if (!firstName || !lastName || !email) {
      return res.status(400).json({ error: "First name, last name, and email are required" });
    }

    // Get school details
    const schoolResult = await pool.query(
      "SELECT client_id FROM schools WHERE id = $1",
      [schoolId]
    );

    if (schoolResult.rows.length === 0) {
      return res.status(404).json({ error: "School not found" });
    }

    const clientId = schoolResult.rows[0].client_id;
    const submissionId = uuidv4();
    const idempotencyKey = `landing_${schoolId}_${email}_${Date.now()}`;

    // Create submission
    await pool.query(
      `INSERT INTO submissions
       (id, client_id, school_id, campus_id, program_id, first_name, last_name, email, phone,
        landing_answers, status, source, idempotency_key, consented, consent_text_version, consent_timestamp,
        created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, NOW(), NOW())`,
      [
        submissionId,
        clientId,
        schoolId,
        campusId || null,
        programId || null,
        firstName,
        lastName,
        email,
        phone || null,
        landingAnswers || {},
        "pending",
        "landing_page",
        idempotencyKey,
        consented || false,
        consentTextVersion || null,
        consentTimestamp || null
      ]
    );

    // Trigger webhook for submission_created event
    triggerWebhook(schoolId, "submission_created", submissionId).catch((err) => {
      console.error("Webhook trigger failed:", err);
    });

    return res.status(201).json({ submissionId, success: true });
  } catch (error) {
    console.error("Landing page submission create error", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

app.get("/api/admin/schools/:schoolId/metrics", requireSchoolAccess, async (req, res) => {
  try {
    const school = res.locals.school;

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
        WHERE client_id = $1 AND school_id = $2 AND created_at >= $3 AND created_at < $4
      `,
      [school.client_id, school.id, from, to]
    );

    const stepsResult = await pool.query(
      `
        SELECT COALESCE(last_step_completed, 0) AS last_step_completed,
               COUNT(*) AS count
        FROM submissions
        WHERE client_id = $1 AND school_id = $2 AND created_at >= $3 AND created_at < $4
        GROUP BY COALESCE(last_step_completed, 0)
      `,
      [school.client_id, school.id, from, to]
    );

    const perfResult = await pool.query(
      `
        SELECT campus_id, program_id,
          COUNT(*) AS leads,
          SUM(CASE WHEN status = 'delivered' THEN 1 ELSE 0 END) AS delivered,
          SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failed
        FROM submissions
        WHERE client_id = $1 AND school_id = $2 AND created_at >= $3 AND created_at < $4
        GROUP BY campus_id, program_id
        ORDER BY leads DESC
        LIMIT 5
      `,
      [school.client_id, school.id, from, to]
    );

    const snapshotResult = await pool.query(
      `
        SELECT id, email, status, crm_lead_id, updated_at
        FROM submissions
        WHERE client_id = $1 AND school_id = $2
        ORDER BY updated_at DESC
        LIMIT 5
      `,
      [school.client_id, school.id]
    );

    const summary = summaryResult.rows[0] || {};

    return res.json({
      school: {
        id: school.id,
        name: school.name,
        slug: school.slug,
        logoUrl: school.branding?.logoUrl || null
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

app.get("/api/admin/schools/:schoolId/submissions", requireSchoolAccess, async (req, res) => {
  try {
    const school = res.locals.school;

    const limit = Math.min(Number(req.query.limit) || 25, 200);
    const offset = Math.max(Number(req.query.offset) || 0, 0);

    const { whereSql, values } = buildSubmissionFilters(req, school.client_id, school.id);

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

app.get("/api/admin/schools/:schoolId/submissions/export", requireSchoolAccess, async (req, res) => {
  try {
    const school = res.locals.school;

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

    const { whereSql, values } = buildSubmissionFilters(req, school.client_id, school.id);

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

    await logAdminAudit(school.client_id, school.id, "export_submissions", {
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

app.get("/api/admin/schools/:schoolId/users", requireSchoolAccess, async (req, res) => {
  try {
    const school = res.locals.school;
    const auth = res.locals.auth as AuthContext | null;

    const authCheck = requireClientAdmin(auth, school.client_id);
    if (!authCheck.ok) {
      return res.status(authCheck.status).json({ error: authCheck.error });
    }

    const usersResult = await pool.query(
      `
        SELECT id, email, email_verified, is_active, created_at, updated_at
        FROM users
        WHERE client_id = $1
        ORDER BY email ASC
      `,
      [school.client_id]
    );

    const rolesResult = await pool.query(
      `
        SELECT user_id, role, school_id
        FROM user_roles
        WHERE client_id = $1
      `,
      [school.client_id]
    );

    const rolesByUser = new Map<string, { role: string; schoolId: string | null }[]>();
    for (const row of rolesResult.rows) {
      const existing = rolesByUser.get(row.user_id) || [];
      existing.push({ role: row.role, schoolId: row.school_id ?? null });
      rolesByUser.set(row.user_id, existing);
    }

    return res.json({
      users: usersResult.rows.map((row) => ({
        id: row.id,
        email: row.email,
        emailVerified: row.email_verified,
        isActive: row.is_active,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        roles: rolesByUser.get(row.id) || []
      }))
    });
  } catch (error) {
    console.error("Admin users list error", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

app.post("/api/admin/schools/:schoolId/users", requireSchoolAccess, async (req, res) => {
  try {
    const school = res.locals.school;
    const auth = res.locals.auth as AuthContext | null;

    const authCheck = requireClientAdmin(auth, school.client_id);
    if (!authCheck.ok) {
      return res.status(authCheck.status).json({ error: authCheck.error });
    }

    const parseResult = AdminUserCreateSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({ error: "Invalid payload", details: parseResult.error.format() });
    }

    const { email, password, role, schoolId } = parseResult.data;
    const normalizedEmail = email.trim().toLowerCase();

    if ((role === "school_admin" || role === "staff") && !schoolId) {
      return res.status(400).json({ error: "schoolId is required for school-scoped roles" });
    }

    if (schoolId) {
      const schoolMatch = await getSchoolById(schoolId);
      if (!schoolMatch || schoolMatch.client_id !== school.client_id) {
        return res.status(400).json({ error: "Invalid school scope" });
      }
    }

    const existing = await pool.query(
      "SELECT id FROM users WHERE client_id = $1 AND LOWER(email) = $2",
      [school.client_id, normalizedEmail]
    );
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: "User already exists" });
    }

    const passwordHash = await hashPassword(password);
    const userId = uuidv4();
    const now = new Date();

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        `INSERT INTO users (id, email, password_hash, email_verified, client_id, is_active, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $7)`,
        [userId, normalizedEmail, passwordHash, false, school.client_id, true, now]
      );
      await client.query(
        `INSERT INTO user_roles (id, user_id, role, school_id, client_id, created_at)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [uuidv4(), userId, role, schoolId || null, school.client_id, now]
      );
      await client.query(
        `INSERT INTO admin_audit_log (id, client_id, school_id, event, payload, created_at)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          uuidv4(),
          school.client_id,
          school.id,
          "user_created",
          { userId, email: normalizedEmail, role, schoolId: schoolId || null },
          now
        ]
      );
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }

    return res.status(201).json({ id: userId, email: normalizedEmail });
  } catch (error) {
    console.error("Admin users create error", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

app.post("/api/admin/drafts", async (req, res) => {
  try {
    const auth = res.locals.auth as AuthContext | null;
    if (!auth) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const parseResult = AdminDraftSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({ error: "Invalid payload", details: parseResult.error.format() });
    }

    const { programId, landingCopy, action } = parseResult.data;
    if (!auth.user.clientId) {
      return res.status(400).json({ error: "Missing client context" });
    }
    const config = await getConfigForClient(auth.user.clientId);
    const program = config.programs.find((item) => item.id === programId);
    if (!program) {
      return res.status(404).json({ error: "Program not found" });
    }

    const school = config.schools.find((item) => item.id === program.schoolId);
    if (!school) {
      return res.status(404).json({ error: "School not found" });
    }

    const authCheck = requireAdminScope(auth, config, school);
    if (!authCheck.ok) {
      return res.status(authCheck.status).json({ error: authCheck.error });
    }

    await configStore.saveProgramLandingCopy({
      clientId: school.clientId,
      schoolId: school.id,
      programId,
      landingCopy,
      userId: auth.user.id,
      action
    });

    return res.json({ status: "ok" });
  } catch (error) {
    console.error("Admin draft save error", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

app.get("/api/admin/schools/:schoolId/config", requireSchoolAccess, async (req, res) => {
  try {
    const school = res.locals.school;

    const schoolConfig = await configStore.getSchoolConfig(school.client_id, school.id);
    return res.json({ config: schoolConfig });
  } catch (error) {
    console.error("Admin config fetch error", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

app.get("/api/admin/schools/:schoolId/schools", requireSchoolAccess, async (req, res) => {
  try {
    const school = res.locals.school;
    const auth = res.locals.auth as AuthContext | null;

    const config = await getConfigForClient(school.client_id);
    const accessibleSchools = getAllowedSchools(auth!, config);

    return res.json({
      schools: accessibleSchools.map((item) => ({
        id: item.id,
        slug: item.slug,
        name: item.name
      }))
    });
  } catch (error) {
    console.error("Admin schools error", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

app.post("/api/admin/schools/:schoolId/config", requireSchoolAccess, async (req, res) => {
  try {
    const school = res.locals.school;
    const auth = res.locals.auth as AuthContext | null;

    const parseResult = AdminDraftSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({ error: "Invalid payload", details: parseResult.error.format() });
    }

    const { programId, landingCopy, action } = parseResult.data;
    await configStore.saveProgramLandingCopy({
      clientId: school.client_id,
      schoolId: school.id,
      programId,
      landingCopy,
      userId: auth?.user.id,
      action
    });

    return res.json({ status: "ok" });
  } catch (error) {
    console.error("Admin config update error", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

app.post("/api/admin/schools/:schoolId/config/rollback", requireSchoolAccess, async (req, res) => {
  try {
    const school = res.locals.school;
    const auth = res.locals.auth as AuthContext | null;

    const parseResult = AdminConfigRollbackSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({ error: "Invalid payload", details: parseResult.error.format() });
    }

    const versionResult = await pool.query(
      "SELECT payload FROM config_versions WHERE id = $1 AND client_id = $2 AND school_id = $3",
      [parseResult.data.versionId, school.client_id, school.id]
    );
    if (versionResult.rows.length === 0) {
      return res.status(404).json({ error: "Version not found" });
    }

    await configStore.applySchoolConfig({
      clientId: school.client_id,
      schoolId: school.id,
      payload: versionResult.rows[0].payload,
      userId: auth?.user.id
    });

    return res.json({ status: "ok" });
  } catch (error) {
    console.error("Admin config rollback error", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

app.get("/api/admin/schools/:schoolId/audit", requireSchoolAccess, async (req, res) => {
  try {
    const school = res.locals.school;

    const limit = Math.min(Number(req.query.limit) || 100, 500);
    const result = await pool.query(
      `
        SELECT id, event, payload, created_at
        FROM admin_audit_log
        WHERE client_id = $1 AND school_id = $2
        ORDER BY created_at DESC
        LIMIT $3
      `,
      [school.client_id, school.id, limit]
    );

    return res.json({
      rows: result.rows.map((row) => ({
        id: row.id,
        event: row.event,
        payload: row.payload,
        createdAt: row.created_at
      }))
    });
  } catch (error) {
    console.error("Admin audit list error", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

app.patch("/api/admin/schools/:schoolId/users/:userId", requireSchoolAccess, async (req, res) => {
  try {
    const school = res.locals.school;
    const userId = req.params.userId;
    const auth = res.locals.auth as AuthContext | null;

    const authCheck = requireClientAdmin(auth, school.client_id);
    if (!authCheck.ok) {
      return res.status(authCheck.status).json({ error: authCheck.error });
    }

    const parseResult = AdminUserUpdateSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({ error: "Invalid payload", details: parseResult.error.format() });
    }

    const { isActive, role, schoolId } = parseResult.data;

    if ((role === "school_admin" || role === "staff") && !schoolId) {
      return res.status(400).json({ error: "schoolId is required for school-scoped roles" });
    }

    if (schoolId) {
      const schoolMatch = await getSchoolById(schoolId);
      if (!schoolMatch || schoolMatch.client_id !== school.client_id) {
        return res.status(400).json({ error: "Invalid school scope" });
      }
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      if (typeof isActive === "boolean") {
        await client.query(
          "UPDATE users SET is_active = $1, updated_at = $2 WHERE id = $3 AND client_id = $4",
          [isActive, new Date(), userId, school.client_id]
        );
      }

      if (role) {
        await client.query("DELETE FROM user_roles WHERE user_id = $1 AND client_id = $2", [
          userId,
          school.client_id
        ]);
        await client.query(
          `INSERT INTO user_roles (id, user_id, role, school_id, client_id, created_at)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [uuidv4(), userId, role, schoolId || null, school.client_id, new Date()]
        );
      }

      await client.query(
        `INSERT INTO admin_audit_log (id, client_id, school_id, event, payload, created_at)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          uuidv4(),
          school.client_id,
          school.id,
          "user_updated",
          { userId, isActive, role: role || null, schoolId: schoolId || null },
          new Date()
        ]
      );

      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }

    return res.json({ status: "ok" });
  } catch (error) {
    console.error("Admin users update error", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// ============================================================================
// Config Builder API Endpoints
// ============================================================================

// Get landing page config for a specific program
app.get(
  "/api/admin/schools/:schoolId/config/landing/:programId",
  requireSchoolAccess,
  requireConfigAccess,
  async (req, res) => {
    try {
      const { programId } = req.params;
      const school = res.locals.school;

      const result = await pool.query(
        `
        SELECT id, name, slug, landing_copy,
               lead_form_config, template_type, hero_image, hero_background_color, hero_background_image,
               duration, salary_range, placement_rate, graduation_rate,
               highlights, testimonials, faqs, stats, sections_config
        FROM programs
        WHERE id = $1 AND client_id = $2 AND school_id = $3
      `,
        [programId, school.client_id, school.id]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: "Program not found" });
      }

      return res.json({
        program: result.rows[0],
        school: {
          id: school.id,
          name: school.name,
          slug: school.slug,
          thankYou: school.thank_you || null
        }
      });
    } catch (error) {
      console.error("Config landing fetch error", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  }
);

// Create/update landing page config (immediate apply)
app.put(
  "/api/admin/schools/:schoolId/config/landing/:programId",
  requireSchoolAccess,
  requireConfigAccess,
  async (req, res) => {
    try {
      const { programId } = req.params;
      const school = res.locals.school;
      const auth = res.locals.auth as AuthContext;

      const {
        landingCopy,
        leadForm,
        templateType,
        heroImage,
        heroBackgroundColor,
        heroBackgroundImage,
        duration,
        salaryRange,
        placementRate,
        graduationRate,
        highlights,
        testimonials,
        faqs,
        stats,
        sectionsConfig,
        schoolThankYou
      } = req.body;

      // Verify program exists and belongs to this school
      const programCheck = await pool.query(
        "SELECT id FROM programs WHERE id = $1 AND client_id = $2 AND school_id = $3",
        [programId, school.client_id, school.id]
      );

      if (programCheck.rows.length === 0) {
        return res.status(404).json({ error: "Program not found" });
      }

      const now = new Date();
      const payload = {
        landingCopy,
        leadForm,
        templateType,
        heroImage,
        heroBackgroundColor,
        heroBackgroundImage,
        duration,
        salaryRange,
        placementRate,
        graduationRate,
        highlights,
        testimonials,
        faqs,
        stats,
        sectionsConfig,
        schoolThankYou
      };

      await pool.query(
        `
        UPDATE programs
        SET landing_copy = $1,
            lead_form_config = $2,
            template_type = $3,
            hero_image = $4,
            hero_background_color = $5,
            hero_background_image = $6,
            duration = $7,
            salary_range = $8,
            placement_rate = $9,
            graduation_rate = $10,
            highlights = $11,
            testimonials = $12,
            faqs = $13,
            stats = $14,
            sections_config = $15,
            updated_at = $16
        WHERE id = $17 AND client_id = $18 AND school_id = $19
      `,
        [
          landingCopy || null,
          leadForm || null,
          templateType || null,
          heroImage || null,
          heroBackgroundColor || null,
          heroBackgroundImage || null,
          duration || null,
          salaryRange || null,
          placementRate || null,
          graduationRate || null,
          highlights || [],
          testimonials || [],
          faqs || [],
          stats || {},
          sectionsConfig || null,
          now,
          programId,
          school.client_id,
          school.id
        ]
      );

      if (schoolThankYou !== undefined) {
        await pool.query(
          `
          UPDATE schools
          SET thank_you = $1,
              updated_at = $2
          WHERE id = $3 AND client_id = $4
        `,
          [schoolThankYou || null, now, school.id, school.client_id]
        );
      }

      const versionResult = await pool.query(
        "SELECT COALESCE(MAX(version), 0) AS version FROM config_versions WHERE client_id = $1 AND school_id = $2",
        [school.client_id, school.id]
      );
      const nextVersion = Number(versionResult.rows[0]?.version || 0) + 1;

      const versionId = uuidv4();
      await pool.query(
        `
        INSERT INTO config_versions
          (id, client_id, school_id, version, entity_type, entity_id, payload, created_by, status, created_at, updated_at, approved_by, approved_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $10, $8, $10)
      `,
        [
          versionId,
          school.client_id,
          school.id,
          nextVersion,
          "program_landing",
          programId,
          payload,
          auth.user.id,
          "approved",
          now
        ]
      );

      await logAdminAudit(school.client_id, school.id, "config_updated", {
        versionId,
        programId,
        entityType: "program_landing"
      });

      return res.json({ status: "updated", versionId });
    } catch (error) {
      console.error("Config landing update error", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  }
);

// Submit draft for approval
app.post(
  "/api/admin/schools/:schoolId/config/drafts/:draftId/submit",
  requireSchoolAccess,
  requireConfigAccess,
  async (req, res) => {
    try {
      const { draftId } = req.params;
      const school = res.locals.school;

      const result = await pool.query(
        `
        UPDATE config_versions
        SET status = 'pending_approval', updated_at = NOW()
        WHERE id = $1 AND client_id = $2 AND school_id = $3 AND status = 'draft'
        RETURNING id
      `,
        [draftId, school.client_id, school.id]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: "Draft not found or already submitted" });
      }

      await logAdminAudit(school.client_id, school.id, "config_draft_submitted", {
        draftId
      });

      return res.json({ status: "pending_approval" });
    } catch (error) {
      console.error("Config draft submit error", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  }
);

// Approve draft (applies changes)
app.post(
  "/api/admin/schools/:schoolId/config/drafts/:draftId/approve",
  requireSchoolAccess,
  requireConfigAccess,
  async (req, res) => {
    try {
      const { draftId } = req.params;
      const school = res.locals.school;
      const auth = res.locals.auth as AuthContext;

      // Check if user can approve (must be client_admin or super_admin)
      const canApprove = auth.roles.some(
        (r) => r.role === "super_admin" || r.role === "client_admin"
      );

      if (!canApprove) {
        return res.status(403).json({ error: "Insufficient permissions to approve drafts" });
      }

      // Get draft
      const draftResult = await pool.query(
        `
        SELECT entity_type, entity_id, payload
        FROM config_versions
        WHERE id = $1 AND client_id = $2 AND school_id = $3 AND status = 'pending_approval'
      `,
        [draftId, school.client_id, school.id]
      );

      if (draftResult.rows.length === 0) {
        return res.status(404).json({ error: "Draft not found or not pending approval" });
      }

      const draft = draftResult.rows[0];
      const payload = draft.payload;

      // Apply changes based on entity type
      if (draft.entity_type === "program_landing") {
        await pool.query(
          `
          UPDATE programs
          SET landing_copy = $1,
              template_type = $2,
              hero_image = $3,
              hero_background_color = $4,
              hero_background_image = $5,
              duration = $6,
              salary_range = $7,
              placement_rate = $8,
              graduation_rate = $9,
              highlights = $10,
              testimonials = $11,
              faqs = $12,
              stats = $13,
              sections_config = $14,
              updated_at = NOW()
          WHERE id = $15 AND client_id = $16 AND school_id = $17
        `,
          [
            payload.landingCopy,
            payload.templateType || "full",
            payload.heroImage,
            payload.heroBackgroundColor,
            payload.heroBackgroundImage,
            payload.duration,
            payload.salaryRange,
            payload.placementRate,
            payload.graduationRate,
            payload.highlights || [],
            payload.testimonials || [],
            payload.faqs || [],
            payload.stats || {},
            payload.sectionsConfig || {
              order: ["hero", "highlights", "stats", "testimonials", "form", "faqs"],
              visible: {
                hero: true,
                highlights: true,
                stats: true,
                testimonials: true,
                form: true,
                faqs: true
              }
            },
            draft.entity_id,
            school.client_id,
            school.id
          ]
        );
      }

      // Mark draft as approved
      await pool.query(
        `
        UPDATE config_versions
        SET status = 'approved', approved_by = $1, approved_at = NOW(), updated_at = NOW()
        WHERE id = $2
      `,
        [auth.user.id, draftId]
      );

      await logAdminAudit(school.client_id, school.id, "config_draft_approved", {
        draftId,
        entityType: draft.entity_type,
        entityId: draft.entity_id
      });

      // TODO: Trigger school redeployment here
      // await triggerSchoolRedeployment(school.id);

      return res.json({ status: "approved" });
    } catch (error) {
      console.error("Config draft approve error", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  }
);

// Reject draft
app.post(
  "/api/admin/schools/:schoolId/config/drafts/:draftId/reject",
  requireSchoolAccess,
  requireConfigAccess,
  async (req, res) => {
    try {
      const { draftId } = req.params;
      const school = res.locals.school;
      const auth = res.locals.auth as AuthContext;
      const { reason } = req.body;

      // Check if user can reject (must be client_admin or super_admin)
      const canReject = auth.roles.some(
        (r) => r.role === "super_admin" || r.role === "client_admin"
      );

      if (!canReject) {
        return res.status(403).json({ error: "Insufficient permissions to reject drafts" });
      }

      const result = await pool.query(
        `
        UPDATE config_versions
        SET status = 'rejected',
            rejected_by = $1,
            rejected_at = NOW(),
            rejection_reason = $2,
            updated_at = NOW()
        WHERE id = $3 AND client_id = $4 AND school_id = $5 AND status = 'pending_approval'
        RETURNING id
      `,
        [auth.user.id, reason || null, draftId, school.client_id, school.id]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: "Draft not found or not pending approval" });
      }

      await logAdminAudit(school.client_id, school.id, "config_draft_rejected", {
        draftId,
        reason
      });

      return res.json({ status: "rejected" });
    } catch (error) {
      console.error("Config draft reject error", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  }
);

// List drafts for school
app.get(
  "/api/admin/schools/:schoolId/config/drafts",
  requireSchoolAccess,
  requireConfigAccess,
  async (req, res) => {
    try {
      const school = res.locals.school;
      const limit = Math.min(Number(req.query.limit) || 50, 100);

      const result = await pool.query(
        `
        SELECT cv.id, cv.entity_type, cv.entity_id, cv.status,
               cv.created_by, cv.created_at, cv.updated_at,
               cv.approved_by, cv.approved_at,
               cv.rejected_by, cv.rejected_at, cv.rejection_reason,
               u.email as creator_email,
               p.name as program_name
        FROM config_versions cv
        LEFT JOIN users u ON u.id = cv.created_by
        LEFT JOIN programs p ON p.id = cv.entity_id AND cv.entity_type = 'program_landing'
        WHERE cv.client_id = $1 AND cv.school_id = $2
        ORDER BY cv.created_at DESC
        LIMIT $3
      `,
        [school.client_id, school.id, limit]
      );

      return res.json({
        drafts: result.rows.map((row) => ({
          id: row.id,
          entityType: row.entity_type,
          entityId: row.entity_id,
          entityName: row.program_name,
          status: row.status,
          createdBy: row.created_by,
          creatorEmail: row.creator_email,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
          approvedBy: row.approved_by,
          approvedAt: row.approved_at,
          rejectedBy: row.rejected_by,
          rejectedAt: row.rejected_at,
          rejectionReason: row.rejection_reason
        }))
      });
    } catch (error) {
      console.error("Config drafts list error", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  }
);

// ===== Quiz Builder Endpoints =====

// Get all quiz questions for a school
app.get(
  "/api/admin/schools/:schoolId/quiz/questions",
  requireSchoolAccess,
  requireConfigAccess,
  async (req, res) => {
    try {
      const school = res.locals.school;

      const questionsResult = await pool.query(
        `SELECT * FROM quiz_questions
         WHERE client_id = $1 AND (school_id = $2 OR school_id IS NULL)
         ORDER BY display_order, created_at`,
        [school.client_id, school.id]
      );

      const optionsResult = await pool.query(
        `SELECT qao.* FROM quiz_answer_options qao
         JOIN quiz_questions qq ON qao.question_id = qq.id
         WHERE qao.client_id = $1 AND (qq.school_id = $2 OR qq.school_id IS NULL)
         ORDER BY qao.display_order`,
        [school.client_id, school.id]
      );

      const questions = questionsResult.rows.map((row) => ({
        id: row.id,
        questionText: row.question_text,
        questionType: row.question_type,
        helpText: row.help_text,
        displayOrder: row.display_order,
        conditionalOn: row.conditional_on,
        isActive: row.is_active,
        options: optionsResult.rows
          .filter((opt) => opt.question_id === row.id)
          .map((opt) => ({
            id: opt.id,
            optionText: opt.option_text,
            displayOrder: opt.display_order,
            pointAssignments: opt.point_assignments
          }))
      }));

      return res.json({ questions });
    } catch (error) {
      console.error("Quiz questions list error", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  }
);

// Create a new quiz question
app.post(
  "/api/admin/schools/:schoolId/quiz/questions",
  requireSchoolAccess,
  requireConfigAccess,
  async (req, res) => {
    try {
      const school = res.locals.school;
      const auth = res.locals.auth as AuthContext | null;
      const { questionText, questionType, helpText, displayOrder, conditionalOn, isActive } = req.body;

      if (!questionText || !questionType) {
        return res.status(400).json({ error: "Missing required fields" });
      }

      const questionId = uuidv4();
      await pool.query(
        `INSERT INTO quiz_questions
         (id, client_id, school_id, question_text, question_type, help_text, display_order, conditional_on, is_active, created_at, updated_at, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $10, $11)`,
        [
          questionId,
          school.client_id,
          school.id,
          questionText,
          questionType,
          helpText || null,
          displayOrder || 0,
          conditionalOn || null,
          isActive !== false,
          new Date(),
          auth?.user.id || null
        ]
      );

      invalidateConfigCache(school.client_id);

      return res.status(201).json({ id: questionId });
    } catch (error) {
      console.error("Quiz question create error", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  }
);

// Update a quiz question
app.put(
  "/api/admin/schools/:schoolId/quiz/questions/:questionId",
  requireSchoolAccess,
  requireConfigAccess,
  async (req, res) => {
    try {
      const school = res.locals.school;
      const auth = res.locals.auth as AuthContext | null;
      const { questionId } = req.params;
      const { questionText, questionType, helpText, displayOrder, conditionalOn, isActive } = req.body;

      const updateResult = await pool.query(
        `UPDATE quiz_questions
         SET question_text = $1, question_type = $2, help_text = $3, display_order = $4,
             conditional_on = $5, is_active = $6, updated_at = $7, updated_by = $8
         WHERE id = $9 AND client_id = $10 AND (school_id = $11 OR school_id IS NULL)`,
        [
          questionText,
          questionType,
          helpText || null,
          displayOrder,
          conditionalOn || null,
          isActive,
          new Date(),
          auth?.user.id || null,
          questionId,
          school.client_id,
          school.id
        ]
      );

      if (updateResult.rowCount === 0) {
        return res.status(404).json({ error: "Question not found" });
      }

      invalidateConfigCache(school.client_id);

      return res.json({ success: true });
    } catch (error) {
      console.error("Quiz question update error", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  }
);

// Delete a quiz question
app.delete(
  "/api/admin/schools/:schoolId/quiz/questions/:questionId",
  requireSchoolAccess,
  requireConfigAccess,
  async (req, res) => {
    try {
      const school = res.locals.school;
      const { questionId } = req.params;

      // Delete options first (cascade should handle this, but being explicit)
      await pool.query(
        "DELETE FROM quiz_answer_options WHERE question_id = $1 AND client_id = $2",
        [questionId, school.client_id]
      );

      const deleteResult = await pool.query(
        "DELETE FROM quiz_questions WHERE id = $1 AND client_id = $2 AND (school_id = $3 OR school_id IS NULL)",
        [questionId, school.client_id, school.id]
      );

      if (deleteResult.rowCount === 0) {
        return res.status(404).json({ error: "Question not found" });
      }

      invalidateConfigCache(school.client_id);

      return res.json({ success: true });
    } catch (error) {
      console.error("Quiz question delete error", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  }
);

// Create an answer option for a question
app.post(
  "/api/admin/schools/:schoolId/quiz/questions/:questionId/options",
  requireSchoolAccess,
  requireConfigAccess,
  async (req, res) => {
    try {
      const school = res.locals.school;
      const { questionId } = req.params;
      const { optionText, displayOrder, pointAssignments } = req.body;

      if (!optionText) {
        return res.status(400).json({ error: "Missing required fields" });
      }

      // Verify question exists and belongs to this client/school
      const questionCheck = await pool.query(
        "SELECT 1 FROM quiz_questions WHERE id = $1 AND client_id = $2 AND (school_id = $3 OR school_id IS NULL)",
        [questionId, school.client_id, school.id]
      );

      if (questionCheck.rowCount === 0) {
        return res.status(404).json({ error: "Question not found" });
      }

      const optionId = uuidv4();
      await pool.query(
        `INSERT INTO quiz_answer_options
         (id, client_id, question_id, option_text, display_order, point_assignments, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $7)`,
        [
          optionId,
          school.client_id,
          questionId,
          optionText,
          displayOrder || 0,
          pointAssignments || {},
          new Date()
        ]
      );

      invalidateConfigCache(school.client_id);

      return res.status(201).json({ id: optionId });
    } catch (error) {
      console.error("Quiz option create error", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  }
);

// Update an answer option
app.put(
  "/api/admin/schools/:schoolId/quiz/questions/:questionId/options/:optionId",
  requireSchoolAccess,
  requireConfigAccess,
  async (req, res) => {
    try {
      const school = res.locals.school;
      const { optionId } = req.params;
      const { optionText, displayOrder, pointAssignments } = req.body;

      const updateResult = await pool.query(
        `UPDATE quiz_answer_options
         SET option_text = $1, display_order = $2, point_assignments = $3, updated_at = $4
         WHERE id = $5 AND client_id = $6`,
        [optionText, displayOrder, pointAssignments || {}, new Date(), optionId, school.client_id]
      );

      if (updateResult.rowCount === 0) {
        return res.status(404).json({ error: "Option not found" });
      }

      invalidateConfigCache(school.client_id);

      return res.json({ success: true });
    } catch (error) {
      console.error("Quiz option update error", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  }
);

// Delete an answer option
app.delete(
  "/api/admin/schools/:schoolId/quiz/questions/:questionId/options/:optionId",
  requireSchoolAccess,
  requireConfigAccess,
  async (req, res) => {
    try {
      const school = res.locals.school;
      const { optionId } = req.params;

      const deleteResult = await pool.query(
        "DELETE FROM quiz_answer_options WHERE id = $1 AND client_id = $2",
        [optionId, school.client_id]
      );

      if (deleteResult.rowCount === 0) {
        return res.status(404).json({ error: "Option not found" });
      }

      invalidateConfigCache(school.client_id);

      return res.json({ success: true });
    } catch (error) {
      console.error("Quiz option delete error", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  }
);

// Calculate program recommendation based on quiz answers
app.post(
  "/api/admin/schools/:schoolId/quiz/recommend",
  requireSchoolAccess,
  async (req, res) => {
    try {
      const school = res.locals.school;
      const { answers } = req.body; // answers: { questionId: optionId or [optionIds] }

      if (!answers || typeof answers !== "object") {
        return res.status(400).json({ error: "Invalid answers format" });
      }

      // Get all programs for this school (all programs use school master quiz)
      const programsResult = await pool.query(
        "SELECT id, name FROM programs WHERE school_id = $1 AND client_id = $2",
        [school.id, school.client_id]
      );

      const programs = programsResult.rows;
      const programScores: Record<string, number> = {};

      // Initialize scores
      programs.forEach((p) => {
        programScores[p.id] = 0;
      });

      // Calculate scores
      for (const [questionId, answer] of Object.entries(answers)) {
        const answerArray = Array.isArray(answer) ? answer : [answer];

        for (const optionId of answerArray) {
          const optionResult = await pool.query(
            "SELECT point_assignments FROM quiz_answer_options WHERE id = $1 AND client_id = $2",
            [optionId, school.client_id]
          );

          if (optionResult.rowCount && optionResult.rowCount > 0) {
            const pointAssignments = optionResult.rows[0].point_assignments || {};
            for (const [programId, points] of Object.entries(pointAssignments)) {
              if (programScores[programId] !== undefined) {
                programScores[programId] += Number(points);
              }
            }
          }
        }
      }

      // Find recommended program (highest score)
      let recommendedProgram = null;
      let maxScore = 0;

      for (const [programId, score] of Object.entries(programScores)) {
        if (score > maxScore) {
          maxScore = score;
          recommendedProgram = programs.find((p) => p.id === programId);
        }
      }

      return res.json({
        recommendedProgram: recommendedProgram
          ? {
              id: recommendedProgram.id,
              name: recommendedProgram.name,
              score: maxScore
            }
          : null,
        allScores: Object.entries(programScores).map(([programId, score]) => {
          const program = programs.find((p) => p.id === programId);
          return {
            programId,
            programName: program?.name,
            score
          };
        })
      });
    } catch (error) {
      console.error("Quiz recommendation error", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  }
);

app.get("/api/super/clients", async (req, res) => {
  try {
    const auth = res.locals.auth as AuthContext | null;
    const authCheck = requireSuperAdmin(auth);
    if (!authCheck.ok) {
      return res.status(authCheck.status).json({ error: authCheck.error });
    }

    const result = await pool.query(
      `
        SELECT c.id, c.name,
          COUNT(DISTINCT s.id) AS schools,
          COUNT(DISTINCT p.id) AS programs,
          COUNT(DISTINCT u.id) AS users
        FROM clients c
        LEFT JOIN schools s ON s.client_id = c.id
        LEFT JOIN programs p ON p.client_id = c.id
        LEFT JOIN users u ON u.client_id = c.id
        GROUP BY c.id
        ORDER BY c.name
      `
    );

    return res.json({
      clients: result.rows.map((row) => ({
        id: row.id,
        name: row.name,
        schools: Number(row.schools || 0),
        programs: Number(row.programs || 0),
        users: Number(row.users || 0)
      }))
    });
  } catch (error) {
    console.error("Super clients list error", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

app.get("/api/super/tree", async (req, res) => {
  try {
    const auth = res.locals.auth as AuthContext | null;
    const authCheck = requireSuperAdmin(auth);
    if (!authCheck.ok) {
      return res.status(authCheck.status).json({ error: authCheck.error });
    }

    const [clientsResult, schoolsResult, programsResult, categoriesResult] = await Promise.all([
      pool.query("SELECT id, name FROM clients ORDER BY name"),
      pool.query("SELECT id, client_id, slug, name FROM schools ORDER BY name"),
      pool.query("SELECT id, client_id, school_id, slug, name, category_id FROM programs ORDER BY name"),
      pool.query("SELECT id, school_id, name, slug FROM program_categories ORDER BY display_order, name")
    ]);

    const categoriesBySchool = new Map<string, Array<{ id: string; name: string; slug: string }>>();
    for (const row of categoriesResult.rows) {
      const list = categoriesBySchool.get(row.school_id) || [];
      list.push({ id: row.id, name: row.name, slug: row.slug });
      categoriesBySchool.set(row.school_id, list);
    }

    const programsBySchool = new Map<string, Array<{ id: string; slug: string; name: string; category_id: string | null }>>();
    for (const row of programsResult.rows) {
      const list = programsBySchool.get(row.school_id) || [];
      list.push({ id: row.id, slug: row.slug, name: row.name, category_id: row.category_id });
      programsBySchool.set(row.school_id, list);
    }

    const schoolsByClient = new Map<
      string,
      Array<{ id: string; slug: string; name: string; programs: Array<{ id: string; slug: string; name: string; category_id: string | null }>; categories: Array<{ id: string; name: string; slug: string }> }>
    >();
    for (const row of schoolsResult.rows) {
      const list = schoolsByClient.get(row.client_id) || [];
      list.push({
        id: row.id,
        slug: row.slug,
        name: row.name,
        programs: programsBySchool.get(row.id) || [],
        categories: categoriesBySchool.get(row.id) || []
      });
      schoolsByClient.set(row.client_id, list);
    }

    const clients = clientsResult.rows.map((row) => ({
      id: row.id,
      name: row.name,
      schools: schoolsByClient.get(row.id) || []
    }));

    return res.json({ clients });
  } catch (error) {
    console.error("Super tree error", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

app.post("/api/super/clients", async (req, res) => {
  try {
    const auth = res.locals.auth as AuthContext | null;
    const authCheck = requireSuperAdmin(auth);
    if (!authCheck.ok) {
      return res.status(authCheck.status).json({ error: authCheck.error });
    }

    const parseResult = SuperClientCreateSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({ error: "Invalid payload", details: parseResult.error.format() });
    }

    const { id, name } = parseResult.data;
    const now = new Date();
    await pool.query(
      `INSERT INTO clients (id, name, created_at)
       VALUES ($1, $2, $3)
       ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name`,
      [id, name, now]
    );

    await pool.query(
      `INSERT INTO admin_audit_log (id, client_id, school_id, event, payload, created_at)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [uuidv4(), id, null, "client_created", { id, name }, now]
    );

    return res.status(201).json({ id, name });
  } catch (error) {
    console.error("Super clients create error", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

app.get("/api/super/clients/:clientId", async (req, res) => {
  try {
    const auth = res.locals.auth as AuthContext | null;
    const authCheck = requireSuperAdmin(auth);
    if (!authCheck.ok) {
      return res.status(authCheck.status).json({ error: authCheck.error });
    }

    const clientId = req.params.clientId;
    const result = await pool.query("SELECT id, name FROM clients WHERE id = $1", [clientId]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Client not found" });
    }

    return res.json({ client: result.rows[0] });
  } catch (error) {
    console.error("Super client fetch error", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

app.patch("/api/super/clients/:clientId", async (req, res) => {
  try {
    const auth = res.locals.auth as AuthContext | null;
    const authCheck = requireSuperAdmin(auth);
    if (!authCheck.ok) {
      return res.status(authCheck.status).json({ error: authCheck.error });
    }

    const clientId = req.params.clientId;
    const parseResult = SuperClientUpdateSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({ error: "Invalid payload", details: parseResult.error.format() });
    }

    const existing = await pool.query("SELECT id, name FROM clients WHERE id = $1", [clientId]);
    if (existing.rows.length === 0) {
      return res.status(404).json({ error: "Client not found" });
    }

    const nextName = parseResult.data.name ?? existing.rows[0].name;
    await pool.query("UPDATE clients SET name = $1 WHERE id = $2", [nextName, clientId]);

    await pool.query(
      `INSERT INTO admin_audit_log (id, client_id, school_id, event, payload, created_at)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [uuidv4(), clientId, null, "client_updated", { name: nextName }, new Date()]
    );

    return res.json({ id: clientId, name: nextName });
  } catch (error) {
    console.error("Super client update error", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

app.post("/api/super/clients/:clientId/schools", async (req, res) => {
  try {
    const auth = res.locals.auth as AuthContext | null;
    const authCheck = requireSuperAdmin(auth);
    if (!authCheck.ok) {
      return res.status(authCheck.status).json({ error: authCheck.error });
    }

    const clientId = req.params.clientId;
    const parseResult = SuperSchoolCreateSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({ error: "Invalid payload", details: parseResult.error.format() });
    }

    const { id, slug, name, crmConnectionId } = parseResult.data;
    const now = new Date();
    await pool.query(
      `INSERT INTO schools (id, client_id, slug, name, branding, compliance, crm_connection_id, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $8)
       ON CONFLICT (id) DO UPDATE SET
         client_id = EXCLUDED.client_id,
         slug = EXCLUDED.slug,
         name = EXCLUDED.name,
         crm_connection_id = EXCLUDED.crm_connection_id,
         updated_at = EXCLUDED.updated_at`,
      [
        id,
        clientId,
        slug,
        name,
        JSON.stringify({ colors: { primary: "#111827", secondary: "#4b5563" } }),
        JSON.stringify({ disclaimerText: "TBD", version: "draft" }),
        crmConnectionId,
        now
      ]
    );

    await pool.query(
      `INSERT INTO admin_audit_log (id, client_id, school_id, event, payload, created_at)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [uuidv4(), clientId, id, "school_created", { id, slug, name }, now]
    );

    return res.status(201).json({ id, slug, name });
  } catch (error) {
    console.error("Super schools create error", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

app.get("/api/super/clients/:clientId/schools/:schoolId", async (req, res) => {
  try {
    const auth = res.locals.auth as AuthContext | null;
    const authCheck = requireSuperAdmin(auth);
    if (!authCheck.ok) {
      return res.status(authCheck.status).json({ error: authCheck.error });
    }

    const { clientId, schoolId } = req.params;
    const result = await pool.query(
      `SELECT id, client_id, slug, name, branding, compliance, crm_connection_id, thank_you, disqualification_config
       FROM schools WHERE id = $1 AND client_id = $2`,
      [schoolId, clientId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "School not found" });
    }
    return res.json({ school: result.rows[0] });
  } catch (error) {
    console.error("Super school fetch error", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

app.patch("/api/super/clients/:clientId/schools/:schoolId", async (req, res) => {
  try {
    const auth = res.locals.auth as AuthContext | null;
    const authCheck = requireSuperAdmin(auth);
    if (!authCheck.ok) {
      return res.status(authCheck.status).json({ error: authCheck.error });
    }

    const { clientId, schoolId } = req.params;
    const parseResult = SuperSchoolUpdateSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({ error: "Invalid payload", details: parseResult.error.format() });
    }

    const existing = await pool.query(
      `SELECT slug, name, branding, compliance, crm_connection_id, thank_you, disqualification_config
       FROM schools WHERE id = $1 AND client_id = $2`,
      [schoolId, clientId]
    );
    if (existing.rows.length === 0) {
      return res.status(404).json({ error: "School not found" });
    }

    const current = existing.rows[0];
    const next = {
      slug: parseResult.data.slug ?? current.slug,
      name: parseResult.data.name ?? current.name,
      branding: parseResult.data.branding ?? current.branding,
      compliance: parseResult.data.compliance ?? current.compliance,
      crmConnectionId: parseResult.data.crmConnectionId ?? current.crm_connection_id,
      thankYou: parseResult.data.thankYou ?? current.thank_you,
      disqualificationConfig: parseResult.data.disqualificationConfig ?? current.disqualification_config
    };

    await pool.query(
      `UPDATE schools
       SET slug = $1,
           name = $2,
           branding = $3,
           compliance = $4,
           crm_connection_id = $5,
           thank_you = $6,
           disqualification_config = $7,
           updated_at = $8
       WHERE id = $9 AND client_id = $10`,
      [
        next.slug,
        next.name,
        next.branding,
        next.compliance,
        next.crmConnectionId,
        next.thankYou,
        next.disqualificationConfig,
        new Date(),
        schoolId,
        clientId
      ]
    );

    await pool.query(
      `INSERT INTO admin_audit_log (id, client_id, school_id, event, payload, created_at)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [uuidv4(), clientId, schoolId, "school_updated", next, new Date()]
    );

    return res.json({ id: schoolId, ...next });
  } catch (error) {
    console.error("Super school update error", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

app.post("/api/super/clients/:clientId/programs", async (req, res) => {
  try {
    const auth = res.locals.auth as AuthContext | null;
    const authCheck = requireSuperAdmin(auth);
    if (!authCheck.ok) {
      return res.status(authCheck.status).json({ error: authCheck.error });
    }

    const clientId = req.params.clientId;
    const parseResult = SuperProgramCreateSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({ error: "Invalid payload", details: parseResult.error.format() });
    }

    const { id, schoolId, slug, name } = parseResult.data;
    const now = new Date();
    await pool.query(
      `INSERT INTO programs (id, client_id, school_id, slug, name, landing_copy, question_overrides, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $8)
       ON CONFLICT (id) DO UPDATE SET
         client_id = EXCLUDED.client_id,
         school_id = EXCLUDED.school_id,
         slug = EXCLUDED.slug,
         name = EXCLUDED.name,
         landing_copy = EXCLUDED.landing_copy,
         question_overrides = EXCLUDED.question_overrides,
         updated_at = EXCLUDED.updated_at`,
      [
        id,
        clientId,
        schoolId,
        slug,
        name,
        JSON.stringify({ headline: name, subheadline: "TBD", body: "TBD", ctaText: "Get Program Info" }),
        JSON.stringify(null),
        now
      ]
    );

    await pool.query(
      `INSERT INTO admin_audit_log (id, client_id, school_id, event, payload, created_at)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [uuidv4(), clientId, schoolId, "program_created", { id, slug, name }, now]
    );

    return res.status(201).json({ id, slug, name });
  } catch (error) {
    console.error("Super programs create error", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

app.get("/api/super/clients/:clientId/programs/:programId", async (req, res) => {
  try {
    const auth = res.locals.auth as AuthContext | null;
    const authCheck = requireSuperAdmin(auth);
    if (!authCheck.ok) {
      return res.status(authCheck.status).json({ error: authCheck.error });
    }

    const { clientId, programId } = req.params;
    const result = await pool.query(
      `SELECT id, client_id, school_id, slug, name, template_type, category_id
       FROM programs WHERE id = $1 AND client_id = $2`,
      [programId, clientId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Program not found" });
    }
    // Return program with available_campuses as empty array if column doesn't exist
    const program = {
      ...result.rows[0],
      available_campuses: []
    };
    return res.json({ program });
  } catch (error) {
    console.error("Super program fetch error", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

app.patch("/api/super/clients/:clientId/programs/:programId", async (req, res) => {
  try {
    const auth = res.locals.auth as AuthContext | null;
    const authCheck = requireSuperAdmin(auth);
    if (!authCheck.ok) {
      return res.status(authCheck.status).json({ error: authCheck.error });
    }

    const { clientId, programId } = req.params;
    const parseResult = SuperProgramUpdateSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({ error: "Invalid payload", details: parseResult.error.format() });
    }

    const existing = await pool.query(
      `SELECT slug, name, template_type, category_id
       FROM programs WHERE id = $1 AND client_id = $2`,
      [programId, clientId]
    );
    if (existing.rows.length === 0) {
      return res.status(404).json({ error: "Program not found" });
    }

    const current = existing.rows[0];
    const next = {
      slug: parseResult.data.slug ?? current.slug,
      name: parseResult.data.name ?? current.name,
      templateType: parseResult.data.templateType ?? current.template_type,
      categoryId: parseResult.data.categoryId !== undefined ? parseResult.data.categoryId : current.category_id
    };

    await pool.query(
      `UPDATE programs
       SET slug = $1,
           name = $2,
           template_type = $3,
           category_id = $4,
           updated_at = $5
       WHERE id = $6 AND client_id = $7`,
      [
        next.slug,
        next.name,
        next.templateType || null,
        next.categoryId || null,
        new Date(),
        programId,
        clientId
      ]
    );

    await pool.query(
      `INSERT INTO admin_audit_log (id, client_id, school_id, event, payload, created_at)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [uuidv4(), clientId, null, "program_updated", next, new Date()]
    );

    return res.json({ id: programId, ...next });
  } catch (error) {
    console.error("Super program update error", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

app.post("/api/super/clients/:clientId/admin-user", async (req, res) => {
  try {
    const auth = res.locals.auth as AuthContext | null;
    const authCheck = requireSuperAdmin(auth);
    if (!authCheck.ok) {
      return res.status(authCheck.status).json({ error: authCheck.error });
    }

    const clientId = req.params.clientId;
    const parseResult = SuperAdminUserCreateSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({ error: "Invalid payload", details: parseResult.error.format() });
    }

    const { email, password } = parseResult.data;
    const normalizedEmail = email.trim().toLowerCase();

    const existing = await pool.query(
      "SELECT id FROM users WHERE client_id = $1 AND LOWER(email) = $2",
      [clientId, normalizedEmail]
    );
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: "User already exists" });
    }

    const passwordHash = await hashPassword(password);
    const userId = uuidv4();
    const now = new Date();

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        `INSERT INTO users (id, email, password_hash, email_verified, client_id, is_active, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $7)`,
        [userId, normalizedEmail, passwordHash, false, clientId, true, now]
      );
      await client.query(
        `INSERT INTO user_roles (id, user_id, role, school_id, client_id, created_at)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [uuidv4(), userId, "client_admin", null, clientId, now]
      );
      await client.query(
        `INSERT INTO admin_audit_log (id, client_id, school_id, event, payload, created_at)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [uuidv4(), clientId, null, "client_admin_created", { userId, email: normalizedEmail }, now]
      );
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }

    return res.status(201).json({ id: userId, email: normalizedEmail });
  } catch (error) {
    console.error("Super admin user create error", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// ============================================================================
// PROGRAM CATEGORIES API (Super Admin)
// ============================================================================

// List all categories for a school
app.get("/api/super/schools/:schoolId/categories", async (req, res) => {
  try {
    const auth = res.locals.auth as AuthContext | null;
    const authCheck = requireSuperAdmin(auth);
    if (!authCheck.ok) {
      return res.status(authCheck.status).json({ error: authCheck.error });
    }

    const { schoolId } = req.params;

    const result = await pool.query(
      `SELECT pc.*, COUNT(p.id) AS program_count
       FROM program_categories pc
       LEFT JOIN programs p ON p.category_id = pc.id AND p.school_id = pc.school_id
       WHERE pc.school_id = $1
       GROUP BY pc.id
       ORDER BY pc.display_order, pc.name`,
      [schoolId]
    );

    return res.json({
      categories: result.rows.map((row) => ({
        id: row.id,
        schoolId: row.school_id,
        name: row.name,
        slug: row.slug,
        displayOrder: row.display_order,
        isActive: row.is_active,
        programCount: Number(row.program_count || 0),
        createdAt: row.created_at,
        updatedAt: row.updated_at
      }))
    });
  } catch (error) {
    console.error("Categories list error", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// Create a new category
app.post("/api/super/schools/:schoolId/categories", async (req, res) => {
  try {
    const auth = res.locals.auth as AuthContext | null;
    const authCheck = requireSuperAdmin(auth);
    if (!authCheck.ok) {
      return res.status(authCheck.status).json({ error: authCheck.error });
    }

    const { schoolId } = req.params;
    const { name, slug, displayOrder } = req.body;

    if (!name || !slug) {
      return res.status(400).json({ error: "Name and slug are required" });
    }

    // Get school's client_id for cache invalidation
    const schoolResult = await pool.query("SELECT client_id FROM schools WHERE id = $1", [schoolId]);
    if (schoolResult.rows.length === 0) {
      return res.status(404).json({ error: "School not found" });
    }
    const clientId = schoolResult.rows[0].client_id;

    // Check if slug already exists for this school
    const existing = await pool.query(
      "SELECT id FROM program_categories WHERE school_id = $1 AND slug = $2",
      [schoolId, slug]
    );

    if (existing.rows.length > 0) {
      return res.status(409).json({ error: "Category with this slug already exists" });
    }

    const categoryId = uuidv4();
    await pool.query(
      `INSERT INTO program_categories (id, school_id, name, slug, display_order, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, NOW(), NOW())`,
      [categoryId, schoolId, name, slug, displayOrder || 0]
    );

    invalidateConfigCache(clientId);

    return res.status(201).json({ id: categoryId });
  } catch (error) {
    console.error("Category create error", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// Get a single category
app.get("/api/super/schools/:schoolId/categories/:categoryId", async (req, res) => {
  try {
    const auth = res.locals.auth as AuthContext | null;
    const authCheck = requireSuperAdmin(auth);
    if (!authCheck.ok) {
      return res.status(authCheck.status).json({ error: authCheck.error });
    }

    const { schoolId, categoryId } = req.params;

    const result = await pool.query(
      "SELECT * FROM program_categories WHERE id = $1 AND school_id = $2",
      [categoryId, schoolId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Category not found" });
    }

    const row = result.rows[0];
    return res.json({
      category: {
        id: row.id,
        schoolId: row.school_id,
        name: row.name,
        slug: row.slug,
        displayOrder: row.display_order,
        isActive: row.is_active,
        createdAt: row.created_at,
        updatedAt: row.updated_at
      }
    });
  } catch (error) {
    console.error("Category get error", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// Update a category
app.patch("/api/super/schools/:schoolId/categories/:categoryId", async (req, res) => {
  try {
    const auth = res.locals.auth as AuthContext | null;
    const authCheck = requireSuperAdmin(auth);
    if (!authCheck.ok) {
      return res.status(authCheck.status).json({ error: authCheck.error });
    }

    const { schoolId, categoryId } = req.params;
    const { name, slug, displayOrder, isActive } = req.body;

    // Verify category exists and get client_id
    const existing = await pool.query(
      `SELECT pc.id, s.client_id
       FROM program_categories pc
       JOIN schools s ON s.id = pc.school_id
       WHERE pc.id = $1 AND pc.school_id = $2`,
      [categoryId, schoolId]
    );

    if (existing.rows.length === 0) {
      return res.status(404).json({ error: "Category not found" });
    }

    const clientId = existing.rows[0].client_id;

    // If slug is being changed, check for conflicts
    if (slug) {
      const conflict = await pool.query(
        "SELECT id FROM program_categories WHERE school_id = $1 AND slug = $2 AND id != $3",
        [schoolId, slug, categoryId]
      );

      if (conflict.rows.length > 0) {
        return res.status(409).json({ error: "Category with this slug already exists" });
      }
    }

    const updates: string[] = [];
    const values: any[] = [];
    let paramCount = 1;

    if (name !== undefined) {
      updates.push(`name = $${paramCount++}`);
      values.push(name);
    }
    if (slug !== undefined) {
      updates.push(`slug = $${paramCount++}`);
      values.push(slug);
    }
    if (displayOrder !== undefined) {
      updates.push(`display_order = $${paramCount++}`);
      values.push(displayOrder);
    }
    if (isActive !== undefined) {
      updates.push(`is_active = $${paramCount++}`);
      values.push(isActive);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: "No fields to update" });
    }

    updates.push(`updated_at = NOW()`);
    values.push(categoryId, schoolId);

    await pool.query(
      `UPDATE program_categories SET ${updates.join(", ")} WHERE id = $${paramCount++} AND school_id = $${paramCount++}`,
      values
    );

    invalidateConfigCache(clientId);

    return res.json({ success: true });
  } catch (error) {
    console.error("Category update error", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// Delete a category
app.delete("/api/super/schools/:schoolId/categories/:categoryId", async (req, res) => {
  try {
    const auth = res.locals.auth as AuthContext | null;
    const authCheck = requireSuperAdmin(auth);
    if (!authCheck.ok) {
      return res.status(authCheck.status).json({ error: authCheck.error });
    }

    const { schoolId, categoryId } = req.params;

    // Get client_id for cache invalidation
    const schoolResult = await pool.query("SELECT client_id FROM schools WHERE id = $1", [schoolId]);
    if (schoolResult.rows.length === 0) {
      return res.status(404).json({ error: "School not found" });
    }
    const clientId = schoolResult.rows[0].client_id;

    // Check if any programs are using this category
    const programCheck = await pool.query(
      "SELECT COUNT(*) as count FROM programs WHERE category_id = $1",
      [categoryId]
    );

    if (Number(programCheck.rows[0]?.count || 0) > 0) {
      return res.status(409).json({
        error: "Cannot delete category with associated programs. Remove programs first or reassign them."
      });
    }

    const result = await pool.query(
      "DELETE FROM program_categories WHERE id = $1 AND school_id = $2",
      [categoryId, schoolId]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Category not found" });
    }

    invalidateConfigCache(clientId);

    return res.json({ success: true });
  } catch (error) {
    console.error("Category delete error", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// ============================================================================
// QUIZ STAGES API (Super Admin)
// ============================================================================

// List all stages for a school
app.get("/api/super/schools/:schoolId/quiz/stages", async (req, res) => {
  try {
    const auth = res.locals.auth as AuthContext | null;
    const authCheck = requireSuperAdmin(auth);
    if (!authCheck.ok) {
      return res.status(authCheck.status).json({ error: authCheck.error });
    }

    const { schoolId } = req.params;

    const query = `
      SELECT qs.*,
             pc.name AS category_name,
             COUNT(DISTINCT qq.id) AS question_count
      FROM quiz_stages qs
      LEFT JOIN program_categories pc ON pc.id = qs.category_id
      LEFT JOIN quiz_questions qq ON qq.stage_id = qs.id
      WHERE qs.school_id = $1
      GROUP BY qs.id, pc.name
      ORDER BY qs.display_order, qs.name
    `;

    const result = await pool.query(query, [schoolId]);

    return res.json({
      stages: result.rows.map((row) => ({
        id: row.id,
        schoolId: row.school_id,
        categoryId: row.category_id,
        categoryName: row.category_name,
        name: row.name,
        slug: row.slug,
        description: row.description,
        displayOrder: row.display_order,
        isActive: row.is_active,
        questionCount: Number(row.question_count || 0),
        createdAt: row.created_at,
        updatedAt: row.updated_at
      }))
    });
  } catch (error) {
    console.error("Quiz stages list error", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// Create a new stage
app.post("/api/super/schools/:schoolId/quiz/stages", async (req, res) => {
  try {
    const auth = res.locals.auth as AuthContext | null;
    const authCheck = requireSuperAdmin(auth);
    if (!authCheck.ok) {
      return res.status(authCheck.status).json({ error: authCheck.error });
    }

    const { schoolId } = req.params;
    const { categoryId, name, slug, description, displayOrder } = req.body;

    if (!name || !slug) {
      return res.status(400).json({ error: "Name and slug are required" });
    }

    // Get client_id for cache invalidation
    const schoolResult = await pool.query("SELECT client_id FROM schools WHERE id = $1", [schoolId]);
    if (schoolResult.rows.length === 0) {
      return res.status(404).json({ error: "School not found" });
    }
    const clientId = schoolResult.rows[0].client_id;

    const stageId = uuidv4();
    await pool.query(
      `INSERT INTO quiz_stages
       (id, school_id, category_id, name, slug, description, display_order, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())`,
      [stageId, schoolId, categoryId || null, name, slug, description || null, displayOrder || 0]
    );

    invalidateConfigCache(clientId);

    return res.status(201).json({ id: stageId });
  } catch (error) {
    console.error("Quiz stage create error", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// Get a single stage
app.get("/api/super/schools/:schoolId/quiz/stages/:stageId", async (req, res) => {
  try {
    const auth = res.locals.auth as AuthContext | null;
    const authCheck = requireSuperAdmin(auth);
    if (!authCheck.ok) {
      return res.status(authCheck.status).json({ error: authCheck.error });
    }

    const { schoolId, stageId } = req.params;

    const result = await pool.query(
      `SELECT qs.*, pc.name AS category_name
       FROM quiz_stages qs
       LEFT JOIN program_categories pc ON pc.id = qs.category_id
       WHERE qs.id = $1 AND qs.school_id = $2`,
      [stageId, schoolId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Stage not found" });
    }

    const row = result.rows[0];
    return res.json({
      stage: {
        id: row.id,
        schoolId: row.school_id,
        categoryId: row.category_id,
        categoryName: row.category_name,
        name: row.name,
        slug: row.slug,
        description: row.description,
        displayOrder: row.display_order,
        isActive: row.is_active,
        createdAt: row.created_at,
        updatedAt: row.updated_at
      }
    });
  } catch (error) {
    console.error("Quiz stage get error", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// Update a stage
app.patch("/api/super/schools/:schoolId/quiz/stages/:stageId", async (req, res) => {
  try {
    const auth = res.locals.auth as AuthContext | null;
    const authCheck = requireSuperAdmin(auth);
    if (!authCheck.ok) {
      return res.status(authCheck.status).json({ error: authCheck.error });
    }

    const { schoolId, stageId } = req.params;
    const { categoryId, name, slug, description, displayOrder, isActive } = req.body;

    // Verify stage exists and get client_id
    const existing = await pool.query(
      `SELECT qs.id, s.client_id
       FROM quiz_stages qs
       JOIN schools s ON s.id = qs.school_id
       WHERE qs.id = $1 AND qs.school_id = $2`,
      [stageId, schoolId]
    );

    if (existing.rows.length === 0) {
      return res.status(404).json({ error: "Stage not found" });
    }

    const clientId = existing.rows[0].client_id;

    const updates: string[] = [];
    const values: any[] = [];
    let paramCount = 1;

    if (categoryId !== undefined) {
      updates.push(`category_id = $${paramCount++}`);
      values.push(categoryId || null);
    }
    if (name !== undefined) {
      updates.push(`name = $${paramCount++}`);
      values.push(name);
    }
    if (slug !== undefined) {
      updates.push(`slug = $${paramCount++}`);
      values.push(slug);
    }
    if (description !== undefined) {
      updates.push(`description = $${paramCount++}`);
      values.push(description);
    }
    if (displayOrder !== undefined) {
      updates.push(`display_order = $${paramCount++}`);
      values.push(displayOrder);
    }
    if (isActive !== undefined) {
      updates.push(`is_active = $${paramCount++}`);
      values.push(isActive);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: "No fields to update" });
    }

    updates.push(`updated_at = NOW()`);
    values.push(stageId, schoolId);

    await pool.query(
      `UPDATE quiz_stages SET ${updates.join(", ")} WHERE id = $${paramCount++} AND school_id = $${paramCount++}`,
      values
    );

    invalidateConfigCache(clientId);

    return res.json({ success: true });
  } catch (error) {
    console.error("Quiz stage update error", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// Delete a stage
app.delete("/api/super/schools/:schoolId/quiz/stages/:stageId", async (req, res) => {
  try {
    const auth = res.locals.auth as AuthContext | null;
    const authCheck = requireSuperAdmin(auth);
    if (!authCheck.ok) {
      return res.status(authCheck.status).json({ error: authCheck.error });
    }

    const { schoolId, stageId } = req.params;

    // Get client_id for cache invalidation
    const schoolResult = await pool.query("SELECT client_id FROM schools WHERE id = $1", [schoolId]);
    if (schoolResult.rows.length === 0) {
      return res.status(404).json({ error: "School not found" });
    }
    const clientId = schoolResult.rows[0].client_id;

    // Check if any questions are using this stage
    const questionCheck = await pool.query(
      "SELECT COUNT(*) as count FROM quiz_questions WHERE stage_id = $1",
      [stageId]
    );

    if (Number(questionCheck.rows[0]?.count || 0) > 0) {
      return res.status(409).json({
        error: "Cannot delete stage with questions. Delete questions first."
      });
    }

    const result = await pool.query(
      "DELETE FROM quiz_stages WHERE id = $1 AND school_id = $2",
      [stageId, schoolId]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Stage not found" });
    }

    invalidateConfigCache(clientId);

    return res.json({ success: true });
  } catch (error) {
    console.error("Quiz stage delete error", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// ============================================================================
// QUIZ QUESTIONS API (Super Admin)
// ============================================================================

// Get all questions for a stage
app.get("/api/super/quiz/stages/:stageId/questions", async (req, res) => {
  try {
    const auth = res.locals.auth as AuthContext | null;
    const authCheck = requireSuperAdmin(auth);
    if (!authCheck.ok) {
      return res.status(authCheck.status).json({ error: authCheck.error });
    }

    const { stageId } = req.params;

    // Get questions with their options
    const questions = await pool.query(
      `SELECT qq.*, s.client_id
       FROM quiz_questions qq
       JOIN quiz_stages qs ON qs.id = qq.stage_id
       JOIN schools s ON s.id = qs.school_id
       WHERE qq.stage_id = $1
       ORDER BY qq.display_order, qq.created_at`,
      [stageId]
    );

    const questionIds = questions.rows.map((q) => q.id);
    let options: any[] = [];

    if (questionIds.length > 0) {
      const optionsResult = await pool.query(
        `SELECT * FROM quiz_answer_options
         WHERE question_id = ANY($1)
         ORDER BY question_id, display_order`,
        [questionIds]
      );
      options = optionsResult.rows;
    }

    return res.json({
      questions: questions.rows.map((q) => ({
        id: q.id,
        stageId: q.stage_id,
        questionText: q.question_text,
        questionType: q.question_type,
        helpText: q.help_text,
        displayOrder: q.display_order,
        isContactField: q.is_contact_field,
        contactFieldType: q.contact_field_type,
        disqualifiesLead: q.disqualifies_lead,
        disqualificationReason: q.disqualification_reason,
        conditionalOn: q.conditional_on,
        isActive: q.is_active,
        options: options
          .filter((o) => o.question_id === q.id)
          .map((o) => ({
            id: o.id,
            optionText: o.option_text,
            displayOrder: o.display_order,
            pointAssignments: o.point_assignments || {},
            categoryPoints: o.category_points || {},
            disqualifiesLead: o.disqualifies_lead,
            disqualificationReason: o.disqualification_reason,
            routesToProgramId: o.routes_to_program_id
          }))
      }))
    });
  } catch (error) {
    console.error("Quiz questions list error", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// Create a new question
app.post("/api/super/quiz/stages/:stageId/questions", async (req, res) => {
  try {
    const auth = res.locals.auth as AuthContext | null;
    const authCheck = requireSuperAdmin(auth);
    if (!authCheck.ok) {
      return res.status(authCheck.status).json({ error: authCheck.error });
    }

    const { stageId } = req.params;
    const {
      questionText,
      questionType,
      helpText,
      displayOrder,
      isContactField,
      contactFieldType,
      disqualifiesLead,
      disqualificationReason
    } = req.body;

    if (!questionText || !questionType) {
      return res.status(400).json({ error: "Question text and type are required" });
    }

    // Get client_id from stage via school
    const stageResult = await pool.query(
      `SELECT s.client_id
       FROM quiz_stages qs
       JOIN schools s ON s.id = qs.school_id
       WHERE qs.id = $1`,
      [stageId]
    );

    if (stageResult.rows.length === 0) {
      return res.status(404).json({ error: "Stage not found" });
    }

    const clientId = stageResult.rows[0].client_id;
    const questionId = uuidv4();

    await pool.query(
      `INSERT INTO quiz_questions
       (id, client_id, stage_id, question_text, question_type, help_text, display_order,
        is_contact_field, contact_field_type, disqualifies_lead, disqualification_reason, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW(), NOW())`,
      [
        questionId,
        clientId,
        stageId,
        questionText,
        questionType,
        helpText || null,
        displayOrder || 0,
        isContactField || false,
        contactFieldType || null,
        disqualifiesLead || false,
        disqualificationReason || null
      ]
    );

    invalidateConfigCache(clientId);

    return res.status(201).json({ id: questionId });
  } catch (error) {
    console.error("Quiz question create error", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// Update a question
app.patch("/api/super/quiz/questions/:questionId", async (req, res) => {
  try {
    const auth = res.locals.auth as AuthContext | null;
    const authCheck = requireSuperAdmin(auth);
    if (!authCheck.ok) {
      return res.status(authCheck.status).json({ error: authCheck.error });
    }

    const { questionId } = req.params;
    const {
      questionText,
      questionType,
      helpText,
      displayOrder,
      isContactField,
      contactFieldType,
      disqualifiesLead,
      disqualificationReason,
      isActive
    } = req.body;

    // Get client_id for cache invalidation
    const existing = await pool.query(
      "SELECT client_id FROM quiz_questions WHERE id = $1",
      [questionId]
    );

    if (existing.rows.length === 0) {
      return res.status(404).json({ error: "Question not found" });
    }

    const clientId = existing.rows[0].client_id;

    const updates: string[] = [];
    const values: any[] = [];
    let paramCount = 1;

    if (questionText !== undefined) {
      updates.push(`question_text = $${paramCount++}`);
      values.push(questionText);
    }
    if (questionType !== undefined) {
      updates.push(`question_type = $${paramCount++}`);
      values.push(questionType);
    }
    if (helpText !== undefined) {
      updates.push(`help_text = $${paramCount++}`);
      values.push(helpText);
    }
    if (displayOrder !== undefined) {
      updates.push(`display_order = $${paramCount++}`);
      values.push(displayOrder);
    }
    if (isContactField !== undefined) {
      updates.push(`is_contact_field = $${paramCount++}`);
      values.push(isContactField);
    }
    if (contactFieldType !== undefined) {
      updates.push(`contact_field_type = $${paramCount++}`);
      values.push(contactFieldType);
    }
    if (disqualifiesLead !== undefined) {
      updates.push(`disqualifies_lead = $${paramCount++}`);
      values.push(disqualifiesLead);
    }
    if (disqualificationReason !== undefined) {
      updates.push(`disqualification_reason = $${paramCount++}`);
      values.push(disqualificationReason);
    }
    if (isActive !== undefined) {
      updates.push(`is_active = $${paramCount++}`);
      values.push(isActive);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: "No fields to update" });
    }

    updates.push(`updated_at = NOW()`);
    values.push(questionId);

    await pool.query(
      `UPDATE quiz_questions SET ${updates.join(", ")} WHERE id = $${paramCount++}`,
      values
    );

    invalidateConfigCache(clientId);

    return res.json({ success: true });
  } catch (error) {
    console.error("Quiz question update error", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// Delete a question
app.delete("/api/super/quiz/questions/:questionId", async (req, res) => {
  try {
    const auth = res.locals.auth as AuthContext | null;
    const authCheck = requireSuperAdmin(auth);
    if (!authCheck.ok) {
      return res.status(authCheck.status).json({ error: authCheck.error });
    }

    const { questionId } = req.params;

    // Get client_id before deletion
    const existing = await pool.query(
      "SELECT client_id FROM quiz_questions WHERE id = $1",
      [questionId]
    );

    if (existing.rows.length === 0) {
      return res.status(404).json({ error: "Question not found" });
    }

    const clientId = existing.rows[0].client_id;

    // Options will be cascade deleted
    const result = await pool.query(
      "DELETE FROM quiz_questions WHERE id = $1",
      [questionId]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Question not found" });
    }

    invalidateConfigCache(clientId);

    return res.json({ success: true });
  } catch (error) {
    console.error("Quiz question delete error", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// ============================================================================
// QUIZ ANSWER OPTIONS API (Super Admin)
// ============================================================================

// Create a new option
app.post("/api/super/quiz/questions/:questionId/options", async (req, res) => {
  try {
    const auth = res.locals.auth as AuthContext | null;
    const authCheck = requireSuperAdmin(auth);
    if (!authCheck.ok) {
      return res.status(authCheck.status).json({ error: authCheck.error });
    }

    const { questionId } = req.params;
    const {
      optionText,
      displayOrder,
      pointAssignments,
      categoryPoints,
      disqualifiesLead,
      disqualificationReason,
      routesToProgramId
    } = req.body;

    if (!optionText) {
      return res.status(400).json({ error: "Option text is required" });
    }

    // Get client_id from question
    const questionResult = await pool.query(
      "SELECT client_id FROM quiz_questions WHERE id = $1",
      [questionId]
    );

    if (questionResult.rows.length === 0) {
      return res.status(404).json({ error: "Question not found" });
    }

    const clientId = questionResult.rows[0].client_id;
    const optionId = uuidv4();

    await pool.query(
      `INSERT INTO quiz_answer_options
       (id, client_id, question_id, option_text, display_order, point_assignments, category_points,
        disqualifies_lead, disqualification_reason, routes_to_program_id, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), NOW())`,
      [
        optionId,
        clientId,
        questionId,
        optionText,
        displayOrder || 0,
        JSON.stringify(pointAssignments || {}),
        JSON.stringify(categoryPoints || {}),
        disqualifiesLead || false,
        disqualificationReason || null,
        routesToProgramId || null
      ]
    );

    invalidateConfigCache(clientId);

    return res.status(201).json({ id: optionId });
  } catch (error) {
    console.error("Quiz option create error", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// Update an option
app.patch("/api/super/quiz/options/:optionId", async (req, res) => {
  try {
    const auth = res.locals.auth as AuthContext | null;
    const authCheck = requireSuperAdmin(auth);
    if (!authCheck.ok) {
      return res.status(authCheck.status).json({ error: authCheck.error });
    }

    const { optionId } = req.params;
    const {
      optionText,
      displayOrder,
      pointAssignments,
      categoryPoints,
      disqualifiesLead,
      disqualificationReason,
      routesToProgramId
    } = req.body;

    // Get client_id for cache invalidation
    const existing = await pool.query(
      "SELECT client_id FROM quiz_answer_options WHERE id = $1",
      [optionId]
    );

    if (existing.rows.length === 0) {
      return res.status(404).json({ error: "Option not found" });
    }

    const clientId = existing.rows[0].client_id;

    const updates: string[] = [];
    const values: any[] = [];
    let paramCount = 1;

    if (optionText !== undefined) {
      updates.push(`option_text = $${paramCount++}`);
      values.push(optionText);
    }
    if (displayOrder !== undefined) {
      updates.push(`display_order = $${paramCount++}`);
      values.push(displayOrder);
    }
    if (pointAssignments !== undefined) {
      updates.push(`point_assignments = $${paramCount++}`);
      values.push(JSON.stringify(pointAssignments));
    }
    if (categoryPoints !== undefined) {
      updates.push(`category_points = $${paramCount++}`);
      values.push(JSON.stringify(categoryPoints));
    }
    if (disqualifiesLead !== undefined) {
      updates.push(`disqualifies_lead = $${paramCount++}`);
      values.push(disqualifiesLead);
    }
    if (disqualificationReason !== undefined) {
      updates.push(`disqualification_reason = $${paramCount++}`);
      values.push(disqualificationReason);
    }
    if (routesToProgramId !== undefined) {
      updates.push(`routes_to_program_id = $${paramCount++}`);
      values.push(routesToProgramId);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: "No fields to update" });
    }

    updates.push(`updated_at = NOW()`);
    values.push(optionId);

    await pool.query(
      `UPDATE quiz_answer_options SET ${updates.join(", ")} WHERE id = $${paramCount++}`,
      values
    );

    invalidateConfigCache(clientId);

    return res.json({ success: true });
  } catch (error) {
    console.error("Quiz option update error", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// Delete an option
app.delete("/api/super/quiz/options/:optionId", async (req, res) => {
  try {
    const auth = res.locals.auth as AuthContext | null;
    const authCheck = requireSuperAdmin(auth);
    if (!authCheck.ok) {
      return res.status(authCheck.status).json({ error: authCheck.error });
    }

    const { optionId } = req.params;

    // Get client_id before deletion
    const existing = await pool.query(
      "SELECT client_id FROM quiz_answer_options WHERE id = $1",
      [optionId]
    );

    if (existing.rows.length === 0) {
      return res.status(404).json({ error: "Option not found" });
    }

    const clientId = existing.rows[0].client_id;

    const result = await pool.query(
      "DELETE FROM quiz_answer_options WHERE id = $1",
      [optionId]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Option not found" });
    }

    invalidateConfigCache(clientId);

    return res.json({ success: true });
  } catch (error) {
    console.error("Quiz option delete error", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// ============================================================================
// LANDING PAGE QUESTIONS API (Super Admin)
// ============================================================================

// Get all landing page questions for a school
app.get("/api/super/schools/:schoolId/landing-questions", async (req, res) => {
  try {
    const auth = res.locals.auth as AuthContext | null;
    const authCheck = requireSuperAdmin(auth);
    if (!authCheck.ok) {
      return res.status(authCheck.status).json({ error: authCheck.error });
    }

    const { schoolId } = req.params;

    // Get questions with their options
    const questions = await pool.query(
      `SELECT lpq.*
       FROM landing_page_questions lpq
       WHERE lpq.school_id = $1
       ORDER BY lpq.display_order, lpq.created_at`,
      [schoolId]
    );

    const questionIds = questions.rows.map((q) => q.id);
    let options: any[] = [];

    if (questionIds.length > 0) {
      const optionsResult = await pool.query(
        `SELECT * FROM landing_page_question_options
         WHERE question_id = ANY($1)
         ORDER BY question_id, display_order`,
        [questionIds]
      );
      options = optionsResult.rows;
    }

    return res.json({
      questions: questions.rows.map((q) => ({
        id: q.id,
        schoolId: q.school_id,
        questionText: q.question_text,
        questionType: q.question_type,
        helpText: q.help_text,
        displayOrder: q.display_order,
        isRequired: q.is_required,
        crmFieldName: q.crm_field_name,
        createdAt: q.created_at,
        updatedAt: q.updated_at,
        options: options
          .filter((o) => o.question_id === q.id)
          .map((o) => ({
            id: o.id,
            optionText: o.option_text,
            optionValue: o.option_value,
            displayOrder: o.display_order
          }))
      }))
    });
  } catch (error) {
    console.error("Landing questions list error", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// Create a new landing page question
app.post("/api/super/schools/:schoolId/landing-questions", async (req, res) => {
  try {
    const auth = res.locals.auth as AuthContext | null;
    const authCheck = requireSuperAdmin(auth);
    if (!authCheck.ok) {
      return res.status(authCheck.status).json({ error: authCheck.error });
    }

    const { schoolId } = req.params;
    const {
      questionText,
      questionType,
      helpText,
      displayOrder,
      isRequired,
      crmFieldName
    } = req.body;

    const questionId = uuidv4();

    await pool.query(
      `INSERT INTO landing_page_questions
       (id, school_id, question_text, question_type, help_text, display_order, is_required, crm_field_name, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())`,
      [questionId, schoolId, questionText, questionType, helpText || null, displayOrder || 0, isRequired || false, crmFieldName || null]
    );

    return res.status(201).json({ questionId, success: true });
  } catch (error) {
    console.error("Landing question create error", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// Update a landing page question
app.patch("/api/super/landing-questions/:questionId", async (req, res) => {
  try {
    const auth = res.locals.auth as AuthContext | null;
    const authCheck = requireSuperAdmin(auth);
    if (!authCheck.ok) {
      return res.status(authCheck.status).json({ error: authCheck.error });
    }

    const { questionId } = req.params;
    const {
      questionText,
      questionType,
      helpText,
      displayOrder,
      isRequired,
      crmFieldName
    } = req.body;

    const result = await pool.query(
      `UPDATE landing_page_questions
       SET question_text = COALESCE($1, question_text),
           question_type = COALESCE($2, question_type),
           help_text = COALESCE($3, help_text),
           display_order = COALESCE($4, display_order),
           is_required = COALESCE($5, is_required),
           crm_field_name = COALESCE($6, crm_field_name),
           updated_at = NOW()
       WHERE id = $7`,
      [questionText, questionType, helpText, displayOrder, isRequired, crmFieldName, questionId]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Question not found" });
    }

    return res.json({ success: true });
  } catch (error) {
    console.error("Landing question update error", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// Delete a landing page question
app.delete("/api/super/landing-questions/:questionId", async (req, res) => {
  try {
    const auth = res.locals.auth as AuthContext | null;
    const authCheck = requireSuperAdmin(auth);
    if (!authCheck.ok) {
      return res.status(authCheck.status).json({ error: authCheck.error });
    }

    const { questionId } = req.params;

    // Options will be cascade deleted
    const result = await pool.query(
      "DELETE FROM landing_page_questions WHERE id = $1",
      [questionId]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Question not found" });
    }

    return res.json({ success: true });
  } catch (error) {
    console.error("Landing question delete error", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// Create a new landing page question option
app.post("/api/super/landing-questions/:questionId/options", async (req, res) => {
  try {
    const auth = res.locals.auth as AuthContext | null;
    const authCheck = requireSuperAdmin(auth);
    if (!authCheck.ok) {
      return res.status(authCheck.status).json({ error: authCheck.error });
    }

    const { questionId } = req.params;
    const { optionText, optionValue, displayOrder } = req.body;

    const optionId = uuidv4();

    await pool.query(
      `INSERT INTO landing_page_question_options
       (id, question_id, option_text, option_value, display_order, created_at)
       VALUES ($1, $2, $3, $4, $5, NOW())`,
      [optionId, questionId, optionText, optionValue || optionText, displayOrder || 0]
    );

    return res.status(201).json({ optionId, success: true });
  } catch (error) {
    console.error("Landing question option create error", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// Update a landing page question option
app.patch("/api/super/landing-question-options/:optionId", async (req, res) => {
  try {
    const auth = res.locals.auth as AuthContext | null;
    const authCheck = requireSuperAdmin(auth);
    if (!authCheck.ok) {
      return res.status(authCheck.status).json({ error: authCheck.error });
    }

    const { optionId } = req.params;
    const { optionText, optionValue, displayOrder } = req.body;

    const result = await pool.query(
      `UPDATE landing_page_question_options
       SET option_text = COALESCE($1, option_text),
           option_value = COALESCE($2, option_value),
           display_order = COALESCE($3, display_order)
       WHERE id = $4`,
      [optionText, optionValue, displayOrder, optionId]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Option not found" });
    }

    return res.json({ success: true });
  } catch (error) {
    console.error("Landing question option update error", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// Delete a landing page question option
app.delete("/api/super/landing-question-options/:optionId", async (req, res) => {
  try {
    const auth = res.locals.auth as AuthContext | null;
    const authCheck = requireSuperAdmin(auth);
    if (!authCheck.ok) {
      return res.status(authCheck.status).json({ error: authCheck.error });
    }

    const { optionId } = req.params;

    const result = await pool.query(
      "DELETE FROM landing_page_question_options WHERE id = $1",
      [optionId]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Option not found" });
    }

    return res.json({ success: true });
  } catch (error) {
    console.error("Landing question option delete error", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// ============================================================================
// WEBHOOK CONFIGURATION API (Super Admin)
// ============================================================================

// Get webhook configs for a school
app.get("/api/super/schools/:schoolId/webhooks", async (req, res) => {
  try {
    const auth = res.locals.auth as AuthContext | null;
    const authCheck = requireSuperAdmin(auth);
    if (!authCheck.ok) {
      return res.status(authCheck.status).json({ error: authCheck.error });
    }

    const { schoolId } = req.params;

    const result = await pool.query(
      `SELECT id, school_id, webhook_url, events, headers, is_active, created_at, updated_at
       FROM webhook_configs
       WHERE school_id = $1
       ORDER BY created_at DESC`,
      [schoolId]
    );

    return res.json({ webhooks: result.rows });
  } catch (error) {
    console.error("Webhook configs list error", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// Create a webhook config
app.post("/api/super/schools/:schoolId/webhooks", async (req, res) => {
  try {
    const auth = res.locals.auth as AuthContext | null;
    const authCheck = requireSuperAdmin(auth);
    if (!authCheck.ok) {
      return res.status(authCheck.status).json({ error: authCheck.error });
    }

    const { schoolId } = req.params;
    const { webhookUrl, events, headers, isActive } = req.body;

    const webhookId = uuidv4();

    await pool.query(
      `INSERT INTO webhook_configs
       (id, school_id, webhook_url, events, headers, is_active, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())`,
      [
        webhookId,
        schoolId,
        webhookUrl,
        events || ["submission_created", "quiz_started", "stage_completed", "submission_updated", "quiz_completed"],
        headers || {},
        isActive !== false
      ]
    );

    return res.status(201).json({ webhookId, success: true });
  } catch (error) {
    console.error("Webhook config create error", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// Update a webhook config
app.patch("/api/super/webhooks/:webhookId", async (req, res) => {
  try {
    const auth = res.locals.auth as AuthContext | null;
    const authCheck = requireSuperAdmin(auth);
    if (!authCheck.ok) {
      return res.status(authCheck.status).json({ error: authCheck.error });
    }

    const { webhookId } = req.params;
    const { webhookUrl, events, headers, isActive } = req.body;

    const result = await pool.query(
      `UPDATE webhook_configs
       SET webhook_url = COALESCE($1, webhook_url),
           events = COALESCE($2, events),
           headers = COALESCE($3, headers),
           is_active = COALESCE($4, is_active),
           updated_at = NOW()
       WHERE id = $5`,
      [webhookUrl, events, headers, isActive, webhookId]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Webhook config not found" });
    }

    return res.json({ success: true });
  } catch (error) {
    console.error("Webhook config update error", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// Delete a webhook config
app.delete("/api/super/webhooks/:webhookId", async (req, res) => {
  try {
    const auth = res.locals.auth as AuthContext | null;
    const authCheck = requireSuperAdmin(auth);
    if (!authCheck.ok) {
      return res.status(authCheck.status).json({ error: authCheck.error });
    }

    const { webhookId } = req.params;

    const result = await pool.query(
      "DELETE FROM webhook_configs WHERE id = $1",
      [webhookId]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Webhook config not found" });
    }

    return res.json({ success: true });
  } catch (error) {
    console.error("Webhook config delete error", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// ============================================================================
// PUBLIC QUIZ SESSION API
// ============================================================================

// Start a new quiz session
app.post("/api/public/quiz/sessions", async (req, res) => {
  try {
    const { schoolId, submissionId } = req.body;

    if (!schoolId) {
      return res.status(400).json({ error: "School ID is required" });
    }

    // Get school details
    const schoolResult = await pool.query(
      "SELECT client_id FROM schools WHERE id = $1",
      [schoolId]
    );

    if (schoolResult.rows.length === 0) {
      return res.status(404).json({ error: "School not found" });
    }

    const clientId = schoolResult.rows[0].client_id;

    // If submissionId provided, validate it exists
    if (submissionId) {
      const submissionResult = await pool.query(
        "SELECT id FROM submissions WHERE id = $1 AND school_id = $2",
        [submissionId, schoolId]
      );

      if (submissionResult.rows.length === 0) {
        return res.status(404).json({ error: "Submission not found" });
      }
    }

    // Get first stage
    const stagesResult = await pool.query(
      `SELECT id, display_order FROM quiz_stages
       WHERE school_id = $1 AND is_active = true
       ORDER BY display_order
       LIMIT 1`,
      [schoolId]
    );

    const currentStageId = stagesResult.rows.length > 0 ? stagesResult.rows[0].id : null;
    const currentStageOrder = stagesResult.rows.length > 0 ? stagesResult.rows[0].display_order : 0;

    const sessionId = uuidv4();
    await pool.query(
      `INSERT INTO quiz_sessions
       (id, client_id, school_id, current_stage_id, current_stage_order, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, NOW(), NOW())`,
      [sessionId, clientId, schoolId, currentStageId, currentStageOrder]
    );

    // Link quiz session to submission if provided
    if (submissionId) {
      await pool.query(
        `UPDATE submissions
         SET quiz_session_id = $1, quiz_started_at = NOW(), updated_at = NOW()
         WHERE id = $2`,
        [sessionId, submissionId]
      );

      // Trigger quiz_started webhook
      triggerWebhook(schoolId, "quiz_started", submissionId).catch((err) => {
        console.error("Webhook trigger failed:", err);
      });
    }

    return res.status(201).json({ sessionId });
  } catch (error) {
    console.error("Quiz session start error", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// Get next question for session
app.get("/api/public/quiz/sessions/:sessionId/next", async (req, res) => {
  try {
    const { sessionId } = req.params;

    // Get session
    const sessionResult = await pool.query(
      "SELECT * FROM quiz_sessions WHERE id = $1",
      [sessionId]
    );

    if (sessionResult.rows.length === 0) {
      return res.status(404).json({ error: "Session not found" });
    }

    const session = sessionResult.rows[0];

    if (session.completed_at) {
      return res.json({ completed: true, session });
    }

    if (!session.current_stage_id) {
      return res.json({ completed: true, message: "No stages configured" });
    }

    // Get answered question IDs for current stage
    const answers = session.answers || {};
    const answeredQuestionIds = Object.keys(answers);

    // Get next unanswered question in current stage
    let nextQuestionQuery = `
      SELECT qq.*, qs.slug AS stage_slug
      FROM quiz_questions qq
      JOIN quiz_stages qs ON qs.id = qq.stage_id
      WHERE qq.stage_id = $1 AND qq.is_active = true
    `;
    const params: any[] = [session.current_stage_id];

    if (answeredQuestionIds.length > 0) {
      nextQuestionQuery += ` AND qq.id NOT IN (${answeredQuestionIds.map((_, i) => `$${i + 2}`).join(", ")})`;
      params.push(...answeredQuestionIds);
    }

    nextQuestionQuery += ` ORDER BY qq.display_order LIMIT 1`;

    const questionResult = await pool.query(nextQuestionQuery, params);

    if (questionResult.rows.length === 0) {
      // No more questions in current stage, check if there's a next stage
      const nextStageResult = await pool.query(
        `SELECT id, display_order FROM quiz_stages
         WHERE client_id = $1
         AND (school_id IS NULL OR school_id = $2)
         AND is_active = true
         AND display_order > $3
         ORDER BY display_order
         LIMIT 1`,
        [session.client_id, session.school_id, session.current_stage_order]
      );

      if (nextStageResult.rows.length === 0) {
        // Quiz complete
        return res.json({
          completed: true,
          recommendedProgramId: session.recommended_program_id,
          isDisqualified: session.is_disqualified,
          disqualificationReasons: session.disqualification_reasons
        });
      }

      // Move to next stage
      const nextStage = nextStageResult.rows[0];
      await pool.query(
        `UPDATE quiz_sessions
         SET current_stage_id = $1, current_stage_order = $2, updated_at = NOW()
         WHERE id = $3`,
        [nextStage.id, nextStage.display_order, sessionId]
      );

      // Get first question of next stage
      const firstQuestionResult = await pool.query(
        `SELECT qq.*, qs.slug AS stage_slug
         FROM quiz_questions qq
         JOIN quiz_stages qs ON qs.id = qq.stage_id
         WHERE qq.stage_id = $1 AND qq.is_active = true
         ORDER BY qq.display_order
         LIMIT 1`,
        [nextStage.id]
      );

      if (firstQuestionResult.rows.length === 0) {
        return res.json({ completed: true, message: "No questions in next stage" });
      }

      const question = firstQuestionResult.rows[0];

      // Get options
      const optionsResult = await pool.query(
        `SELECT * FROM quiz_answer_options
         WHERE question_id = $1
         ORDER BY display_order`,
        [question.id]
      );

      return res.json({
        question: {
          id: question.id,
          stageSlug: question.stage_slug,
          questionText: question.question_text,
          questionType: question.question_type,
          helpText: question.help_text,
          isContactField: question.is_contact_field,
          contactFieldType: question.contact_field_type,
          options: optionsResult.rows.map((o) => ({
            id: o.id,
            optionText: o.option_text
          }))
        }
      });
    }

    const question = questionResult.rows[0];

    // Get options (hide scoring info from public)
    const optionsResult = await pool.query(
      `SELECT id, option_text, display_order
       FROM quiz_answer_options
       WHERE question_id = $1
       ORDER BY display_order`,
      [question.id]
    );

    return res.json({
      question: {
        id: question.id,
        stageSlug: question.stage_slug,
        questionText: question.question_text,
        questionType: question.question_type,
        helpText: question.help_text,
        isContactField: question.is_contact_field,
        contactFieldType: question.contact_field_type,
        options: optionsResult.rows.map((o) => ({
          id: o.id,
          optionText: o.option_text
        }))
      }
    });
  } catch (error) {
    console.error("Quiz next question error", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// Submit an answer
app.post("/api/public/quiz/sessions/:sessionId/answer", async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { questionId, optionId, textAnswer } = req.body;

    if (!questionId) {
      return res.status(400).json({ error: "Question ID is required" });
    }

    // Get session
    const sessionResult = await pool.query(
      "SELECT * FROM quiz_sessions WHERE id = $1",
      [sessionId]
    );

    if (sessionResult.rows.length === 0) {
      return res.status(404).json({ error: "Session not found" });
    }

    const session = sessionResult.rows[0];
    const answers = session.answers || {};
    const categoryScores = session.category_scores || {};
    const programScores = session.program_scores || {};
    const contactInfo = session.contact_info || {};
    let disqualificationReasons = session.disqualification_reasons || [];
    let isDisqualified = session.is_disqualified;

    // Get question details
    const questionResult = await pool.query(
      "SELECT * FROM quiz_questions WHERE id = $1",
      [questionId]
    );

    if (questionResult.rows.length === 0) {
      return res.status(404).json({ error: "Question not found" });
    }

    const question = questionResult.rows[0];

    // Store answer
    if (question.is_contact_field && question.contact_field_type) {
      contactInfo[question.contact_field_type] = textAnswer || optionId;
    }

    answers[questionId] = optionId || textAnswer;

    // If option provided, process scoring and routing
    if (optionId) {
      const optionResult = await pool.query(
        "SELECT * FROM quiz_answer_options WHERE id = $1",
        [optionId]
      );

      if (optionResult.rows.length > 0) {
        const option = optionResult.rows[0];

        // Check disqualification
        if (option.disqualifies_lead) {
          isDisqualified = true;
          if (option.disqualification_reason) {
            disqualificationReasons.push(option.disqualification_reason);
          }
        }

        // Add category points
        const categoryPoints = option.category_points || {};
        for (const [categoryId, points] of Object.entries(categoryPoints)) {
          categoryScores[categoryId] = (categoryScores[categoryId] || 0) + (points as number);
        }

        // Add program points
        const programPoints = option.point_assignments || {};
        for (const [programId, points] of Object.entries(programPoints)) {
          programScores[programId] = (programScores[programId] || 0) + (points as number);
        }

        // Check for direct program routing
        if (option.routes_to_program_id) {
          await pool.query(
            `UPDATE quiz_sessions
             SET answers = $1, contact_info = $2, category_scores = $3, program_scores = $4,
                 is_disqualified = $5, disqualification_reasons = $6,
                 recommended_program_id = $7, updated_at = NOW()
             WHERE id = $8`,
            [
              JSON.stringify(answers),
              JSON.stringify(contactInfo),
              JSON.stringify(categoryScores),
              JSON.stringify(programScores),
              isDisqualified,
              JSON.stringify(disqualificationReasons),
              option.routes_to_program_id,
              sessionId
            ]
          );

          return res.json({ success: true, directRoute: option.routes_to_program_id });
        }
      }
    }

    // Determine recommended program based on scores
    let recommendedProgramId = null;
    if (Object.keys(programScores).length > 0) {
      const sortedPrograms = Object.entries(programScores)
        .sort(([, a], [, b]) => (b as number) - (a as number));
      recommendedProgramId = sortedPrograms[0][0];
    }

    // Update session
    await pool.query(
      `UPDATE quiz_sessions
       SET answers = $1, contact_info = $2, category_scores = $3, program_scores = $4,
           is_disqualified = $5, disqualification_reasons = $6,
           recommended_program_id = $7, updated_at = NOW()
       WHERE id = $8`,
      [
        JSON.stringify(answers),
        JSON.stringify(contactInfo),
        JSON.stringify(categoryScores),
        JSON.stringify(programScores),
        isDisqualified,
        JSON.stringify(disqualificationReasons),
        recommendedProgramId,
        sessionId
      ]
    );

    return res.json({ success: true });
  } catch (error) {
    console.error("Quiz answer submit error", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// Submit final quiz (create lead)
app.post("/api/public/quiz/sessions/:sessionId/submit", async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { selectedProgramId, financialAidInterested } = req.body;

    // Get session
    const sessionResult = await pool.query(
      "SELECT * FROM quiz_sessions WHERE id = $1",
      [sessionId]
    );

    if (sessionResult.rows.length === 0) {
      return res.status(404).json({ error: "Session not found" });
    }

    const session = sessionResult.rows[0];
    const contactInfo = session.contact_info || {};

    const finalProgramId = selectedProgramId || session.recommended_program_id;

    if (!finalProgramId) {
      return res.status(400).json({ error: "No program selected" });
    }

    // Get campus ID (use first available or default)
    const campusId = contactInfo.campus || "default";

    // Check if submission already exists (linked from landing page)
    const existingSubmissionResult = await pool.query(
      "SELECT id FROM submissions WHERE quiz_session_id = $1",
      [sessionId]
    );

    let submissionId;
    let isNewSubmission = false;

    if (existingSubmissionResult.rows.length > 0) {
      // Update existing submission
      submissionId = existingSubmissionResult.rows[0].id;

      await pool.query(
        `UPDATE submissions
         SET program_id = $1,
             recommended_program_id = $2,
             answers = $3,
             category_scores = $4,
             program_scores = $5,
             is_qualified = $6,
             disqualification_reasons = $7,
             quiz_completed_at = NOW(),
             status = 'pending',
             updated_at = NOW()
         WHERE id = $8`,
        [
          finalProgramId,
          session.recommended_program_id,
          session.answers,
          session.category_scores || {},
          session.program_scores || {},
          !session.is_disqualified,
          session.disqualification_reasons || [],
          submissionId
        ]
      );
    } else {
      // Create new submission (quiz without landing page)
      submissionId = uuidv4();
      isNewSubmission = true;
      const idempotencyKey = `quiz_${sessionId}_${Date.now()}`;

      // Validate required contact info only for new submissions
      if (!contactInfo.first_name || !contactInfo.last_name || !contactInfo.email) {
        return res.status(400).json({ error: "Missing required contact information" });
      }

      await pool.query(
        `INSERT INTO submissions
         (id, client_id, school_id, campus_id, program_id, first_name, last_name, email, phone,
          answers, status, source, idempotency_key, consented, consent_text_version, consent_timestamp,
          quiz_session_id, is_qualified, disqualification_reasons, category_scores, program_scores,
          recommended_program_id, quiz_started_at, quiz_completed_at, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, NOW(), NOW(), NOW(), NOW())`,
        [
          submissionId,
          session.client_id,
          session.school_id,
          campusId,
          finalProgramId,
          contactInfo.first_name,
          contactInfo.last_name,
          contactInfo.email,
          contactInfo.phone || null,
          session.answers,
          "pending",
          "direct_quiz",
          idempotencyKey,
          true, // consented
          "quiz_v1",
          new Date(),
          sessionId,
          !session.is_disqualified,
          session.disqualification_reasons || [],
          session.category_scores || {},
          session.program_scores || {},
          session.recommended_program_id
        ]
      );
    }

    // Mark session as completed
    await pool.query(
      `UPDATE quiz_sessions
       SET completed_at = NOW(), selected_program_id = $1, financial_aid_interested = $2, updated_at = NOW()
       WHERE id = $3`,
      [finalProgramId, financialAidInterested || false, sessionId]
    );

    // Trigger webhooks
    if (isNewSubmission) {
      triggerWebhook(session.school_id, "submission_created", submissionId).catch((err) => {
        console.error("Webhook trigger failed:", err);
      });
    }

    triggerWebhook(session.school_id, "quiz_completed", submissionId).catch((err) => {
      console.error("Webhook trigger failed:", err);
    });

    return res.status(201).json({ submissionId, success: true });
  } catch (error) {
    console.error("Quiz submit error", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

app.post("/api/lead/start", async (req, res) => {
  try {
    // Try new account-based schema first
    const v2Result = StartSchemaV2.safeParse(req.body);
    if (v2Result.success) {
      // Handle account-based submission (new architecture)
      const payload = v2Result.data;

      const accountRecord = await getAccountById(payload.accountId);
      if (!accountRecord) {
        return res.status(404).json({ error: "Unknown account" });
      }

      const submissionId = uuidv4();
      const idempotencyKey = computeIdempotencyKey({
        clientId: accountRecord.client_id,
        email: payload.email,
        phone: payload.phone || "",
        schoolId: payload.accountId, // Use accountId for backwards compat
        campusId: payload.locationId || null,
        programId: payload.programId || null
      });

      const now = new Date();
      const metadata = buildMetadata(req, payload.metadata);

      const insertResult = await pool.query(
        `INSERT INTO submissions
          (id, client_id, account_id, location_id, program_id, first_name, last_name, email, phone, zip_code,
           landing_answers, metadata, status, idempotency_key, consented, consent_text_version, consent_timestamp,
           source, created_at, updated_at)
        VALUES
          ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, NOW(), NOW())
        ON CONFLICT (idempotency_key) DO NOTHING
        RETURNING id, status`,
        [
          submissionId,
          accountRecord.client_id,
          payload.accountId,
          payload.locationId || null,
          payload.programId || null,
          payload.firstName,
          payload.lastName,
          payload.email.toLowerCase(),
          payload.phone || null,
          payload.zipCode || null,
          payload.landingAnswers,
          metadata,
          "pending",
          idempotencyKey,
          payload.consented,
          payload.consentTextVersion,
          now,
          payload.metadata?.source || "landing_page"
        ]
      );

      let finalSubmissionId = submissionId;
      let wasInserted = true;

      if (insertResult.rowCount === 0) {
        wasInserted = false;
        const existing = await pool.query(
          "SELECT id, status FROM submissions WHERE idempotency_key = $1 AND client_id = $2",
          [idempotencyKey, accountRecord.client_id]
        );
        if (existing.rows.length === 0) {
          return res.status(500).json({ error: "Failed to persist submission" });
        }
        finalSubmissionId = existing.rows[0].id;
        console.log(`[${finalSubmissionId}] Duplicate submission accepted`);
      } else {
        console.log(`[${submissionId}] Account-based submission received`);
      }

      if (wasInserted) {
        await deliveryQueue.add(
          "create_lead",
          {
            submissionId,
            clientId: accountRecord.client_id,
            accountId: payload.accountId
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
    }

    // Fall back to legacy school-based schema
    const parseResult = StartSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({ error: "Invalid payload", details: parseResult.error.format() });
    }

    const payload = parseResult.data;
    const honeypotValue = payload.honeypot || req.body?.[env.honeypotField];
    if (honeypotValue) {
      return res.status(400).json({ error: "Invalid submission" });
    }

    const schoolRecord = await getSchoolById(payload.schoolId);
    if (!schoolRecord) {
      return res.status(404).json({ error: "Unknown school" });
    }
    const config = await getConfigForClient(schoolRecord.client_id);
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
      clientId: entities.school.clientId,
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
          (id, client_id, created_at, updated_at, school_id, campus_id, program_id, first_name, last_name, email, phone, answers, metadata, status, idempotency_key, consented, consent_text_version, consent_timestamp, last_step_completed, created_from_step)
        VALUES
          ($1, $2, $3, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $18)
        ON CONFLICT (idempotency_key) DO NOTHING
        RETURNING id, status
      `,
      [
        submissionId,
        entities.school.clientId,
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
        "SELECT id, status FROM submissions WHERE idempotency_key = $1 AND client_id = $2",
        [idempotencyKey, entities.school.clientId]
      );
      if (existing.rows.length === 0) {
        return res.status(500).json({ error: "Failed to persist submission" });
      }
      finalSubmissionId = existing.rows[0].id;
      console.log(`[${finalSubmissionId}] Duplicate submission accepted`);
    } else {
      await pool.query(
        `INSERT INTO audit_log (id, client_id, submission_id, event, payload, created_at)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [uuidv4(), entities.school.clientId, submissionId, "received", { metadata, stepIndex: 1 }, now]
      );
      console.log(`[${submissionId}] Submission received`);
    }

    if (wasInserted) {
      await deliveryQueue.add(
        "create_lead",
        {
          submissionId,
          stepIndex: 1,
          clientId: entities.school.clientId,
          schoolId: payload.schoolId
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
        RETURNING id, status, client_id, school_id
      `,
      [payload.answers, now, payload.stepIndex, payload.submissionId]
    );

    if (updateResult.rowCount === 0) {
      return res.status(404).json({ error: "Submission not found" });
    }

    const submissionClientId = updateResult.rows[0]?.client_id as string | undefined;
    const submissionSchoolId = updateResult.rows[0]?.school_id as string | undefined;
    if (!submissionClientId) {
      return res.status(500).json({ error: "Missing client context" });
    }
    if (!submissionSchoolId) {
      return res.status(500).json({ error: "Missing school context" });
    }

    await pool.query(
      `INSERT INTO audit_log (id, client_id, submission_id, event, payload, created_at)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [uuidv4(), submissionClientId, payload.submissionId, "step_update", { stepIndex: payload.stepIndex }, now]
    );

    await deliveryQueue.add(
      "update_lead",
      {
        submissionId: payload.submissionId,
        stepIndex: payload.stepIndex,
        clientId: submissionClientId,
        schoolId: submissionSchoolId
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

    const schoolRecord = await getSchoolById(payload.schoolId);
    if (!schoolRecord) {
      return res.status(404).json({ error: "Unknown school" });
    }
    const config = await getConfigForClient(schoolRecord.client_id);
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
      clientId: entities.school.clientId,
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
          (id, client_id, created_at, updated_at, school_id, campus_id, program_id, first_name, last_name, email, phone, answers, landing_answers, metadata, status, source, idempotency_key, consented, consent_text_version, consent_timestamp)
        VALUES
          ($1, $2, $3, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
        ON CONFLICT (idempotency_key) DO NOTHING
        RETURNING id, status
      `,
      [
        submissionId,
        entities.school.clientId,
        now,
        payload.schoolId,
        payload.campusId,
        payload.programId,
        payload.firstName,
        payload.lastName,
        payload.email.toLowerCase(),
        payload.phone || null,
        payload.answers,
        payload.landingAnswers || {},
        metadata,
        "received",
        "landing_page",
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
        "SELECT id, status FROM submissions WHERE idempotency_key = $1 AND client_id = $2",
        [idempotencyKey, entities.school.clientId]
      );
      if (existing.rows.length === 0) {
        return res.status(500).json({ error: "Failed to persist submission" });
      }
      finalSubmissionId = existing.rows[0].id;
      console.log(`[${finalSubmissionId}] Duplicate submission accepted`);
    } else {
      await pool.query(
        `INSERT INTO audit_log (id, client_id, submission_id, event, payload, created_at)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [uuidv4(), entities.school.clientId, submissionId, "received", { metadata }, now]
      );
      console.log(`[${submissionId}] Submission received`);
    }

    if (wasInserted) {
      // Trigger submission_created webhook
      triggerWebhook(payload.schoolId, "submission_created", submissionId).catch((err) => {
        console.error("Webhook trigger failed:", err);
      });
    }

    if (wasInserted) {
      await deliveryQueue.add(
        "create_lead",
        {
          submissionId,
          stepIndex: 1,
          clientId: entities.school.clientId,
          schoolId: payload.schoolId
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

if (process.env.NODE_ENV !== "test") {
  app.listen(env.port, () => {
    console.log(`API listening on port ${env.port}`);
  });
}
