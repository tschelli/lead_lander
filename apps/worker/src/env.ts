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
  databaseUrl: process.env.DATABASE_URL || "postgres://lead_lander:lead_lander@localhost:5432/lead_lander",
  redisUrl: process.env.REDIS_URL || "redis://localhost:6379",
  configDir: process.env.CONFIG_DIR || "../../configs",
  queueName: process.env.DELIVERY_QUEUE_NAME || "lead_delivery",
  maxAttempts: Number(process.env.DELIVERY_MAX_ATTEMPTS || 5),
  workerPort: Number(process.env.WORKER_PORT || 5005),
  emailEnabled: process.env.EMAIL_ENABLED === "true",
  smtpHost: process.env.SMTP_HOST,
  smtpPort: process.env.SMTP_PORT ? Number(process.env.SMTP_PORT) : 587,
  smtpUser: process.env.SMTP_USER,
  smtpPass: process.env.SMTP_PASS,
  smtpFrom: process.env.SMTP_FROM || "no-reply@lead-lender.local"
};
