import { randomBytes, createHash } from "crypto";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { env } from "./env";

export type AuthUser = {
  id: string;
  email: string;
  passwordHash: string;
  emailVerified: boolean;
  clientId: string | null;
  isActive: boolean;
};

export type PasswordResetToken = {
  id: string;
  userId: string;
};

export type AuthRepo = {
  findUserByEmail(clientId: string, email: string): Promise<AuthUser | null>;
  findUserById(id: string): Promise<AuthUser | null>;
  updateLastLogin(id: string): Promise<void>;
  createPasswordResetToken(input: {
    userId: string;
    tokenHash: string;
    expiresAt: Date;
  }): Promise<void>;
  findValidPasswordResetToken(tokenHash: string, now: Date): Promise<PasswordResetToken | null>;
  markPasswordResetTokenUsed(id: string, usedAt: Date): Promise<void>;
  updateUserPassword(userId: string, passwordHash: string): Promise<void>;
};

export async function hashPassword(password: string) {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password: string, passwordHash: string) {
  return bcrypt.compare(password, passwordHash);
}

export function createSessionToken(userId: string) {
  return jwt.sign({ sub: userId }, env.authJwtSecret, {
    expiresIn: `${env.authSessionTtlDays}d`
  });
}

export function verifySessionToken(token: string) {
  try {
    const payload = jwt.verify(token, env.authJwtSecret) as jwt.JwtPayload;
    const userId = payload?.sub ? String(payload.sub) : null;
    return userId ? { userId } : null;
  } catch {
    return null;
  }
}

export function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function generateResetToken() {
  return randomBytes(32).toString("base64url");
}

export async function authenticateUser(
  repo: AuthRepo,
  clientId: string,
  email: string,
  password: string
) {
  const normalized = email.trim().toLowerCase();
  const user = await repo.findUserByEmail(clientId, normalized);
  if (!user) {
    return { ok: false as const, reason: "invalid" };
  }
  if (!user.isActive) {
    return { ok: false as const, reason: "disabled" };
  }

  const match = await verifyPassword(password, user.passwordHash);
  if (!match) {
    return { ok: false as const, reason: "invalid" };
  }

  return { ok: true as const, user };
}

export async function requestPasswordReset(
  repo: AuthRepo,
  clientId: string,
  email: string,
  now = new Date()
) {
  const normalized = email.trim().toLowerCase();
  const user = await repo.findUserByEmail(clientId, normalized);
  if (!user) {
    return { ok: true as const, token: null };
  }

  const token = generateResetToken();
  const tokenHash = hashToken(token);
  const expiresAt = new Date(now.getTime() + env.authResetTokenTtlMinutes * 60 * 1000);

  await repo.createPasswordResetToken({ userId: user.id, tokenHash, expiresAt });

  return { ok: true as const, token };
}

export async function resetPasswordWithToken(
  repo: AuthRepo,
  token: string,
  newPassword: string,
  now = new Date()
) {
  const tokenHash = hashToken(token);
  const resetToken = await repo.findValidPasswordResetToken(tokenHash, now);
  if (!resetToken) {
    return { ok: false as const, reason: "invalid" };
  }

  const passwordHash = await hashPassword(newPassword);
  await repo.updateUserPassword(resetToken.userId, passwordHash);
  await repo.markPasswordResetTokenUsed(resetToken.id, now);

  return { ok: true as const };
}
