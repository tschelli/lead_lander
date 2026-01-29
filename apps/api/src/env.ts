import dotenv from "dotenv";
import fs from "fs";
import path from "path";

const rootEnv = path.resolve(process.cwd(), "../../.env");
if (fs.existsSync(rootEnv)) {
  dotenv.config({ path: rootEnv });
} else {
  dotenv.config();
}

export const env = {
  port: Number(process.env.PORT || 4000),
  databaseUrl: process.env.DATABASE_URL || "postgres://lead_lander:lead_lander@localhost:5432/lead_lander",
  redisUrl: process.env.REDIS_URL || "redis://localhost:6379",
  configDir: process.env.CONFIG_DIR || "../../configs",
  rateLimitWindowMs: Number(process.env.RATE_LIMIT_WINDOW_MS || 60_000),
  rateLimitMax: Number(process.env.RATE_LIMIT_MAX || 30),
  honeypotField: process.env.HONEYPOT_FIELD || "website",
  queueName: process.env.DELIVERY_QUEUE_NAME || "lead_delivery",
  deliveryMaxAttempts: Number(process.env.DELIVERY_MAX_ATTEMPTS || 5),
  deliveryBackoffMs: Number(process.env.DELIVERY_BACKOFF_MS || 10_000),
  authJwtSecret: process.env.AUTH_JWT_SECRET || "dev-insecure-change-me",
  authSessionTtlDays: Number(process.env.AUTH_SESSION_TTL_DAYS || 7),
  authResetTokenTtlMinutes: Number(process.env.AUTH_RESET_TTL_MINUTES || 60),
  authCookieName: process.env.AUTH_COOKIE_NAME || "session",
  authCookieSecure: process.env.AUTH_COOKIE_SECURE === "true",
  corsOrigins: (process.env.CORS_ORIGINS || "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean)
};
