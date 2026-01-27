import nodemailer from "nodemailer";
import { env } from "./env";

export async function sendNotificationEmail(
  recipients: string[],
  subject: string,
  body: string
) {
  if (!env.emailEnabled || recipients.length === 0) {
    return { skipped: true };
  }

  if (!env.smtpHost || !env.smtpUser || !env.smtpPass) {
    return { skipped: true, reason: "SMTP not configured" };
  }

  const transporter = nodemailer.createTransport({
    host: env.smtpHost,
    port: env.smtpPort,
    auth: {
      user: env.smtpUser,
      pass: env.smtpPass
    }
  });

  const info = await transporter.sendMail({
    from: env.smtpFrom,
    to: recipients.join(","),
    subject,
    text: body
  });

  return { skipped: false, messageId: info.messageId };
}
