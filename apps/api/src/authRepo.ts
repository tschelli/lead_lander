import type { Pool } from "pg";
import { v4 as uuidv4 } from "uuid";
import type { AuthRepo, AuthUser, PasswordResetToken } from "./auth";

export class PgAuthRepo implements AuthRepo {
  constructor(private pool: Pool) {}

  async findUserByEmail(email: string): Promise<AuthUser | null> {
    const result = await this.pool.query(
      "SELECT id, email, password_hash, email_verified FROM users WHERE LOWER(email) = $1",
      [email]
    );
    const row = result.rows[0];
    if (!row) return null;
    return {
      id: row.id,
      email: row.email,
      passwordHash: row.password_hash,
      emailVerified: row.email_verified
    };
  }

  async findUserById(id: string): Promise<AuthUser | null> {
    const result = await this.pool.query(
      "SELECT id, email, password_hash, email_verified FROM users WHERE id = $1",
      [id]
    );
    const row = result.rows[0];
    if (!row) return null;
    return {
      id: row.id,
      email: row.email,
      passwordHash: row.password_hash,
      emailVerified: row.email_verified
    };
  }

  async updateLastLogin(id: string): Promise<void> {
    await this.pool.query("UPDATE users SET last_login_at = $1, updated_at = $1 WHERE id = $2", [
      new Date(),
      id
    ]);
  }

  async createPasswordResetToken(input: {
    userId: string;
    tokenHash: string;
    expiresAt: Date;
  }): Promise<void> {
    const id = uuidv4();
    await this.pool.query(
      `INSERT INTO password_reset_tokens (id, user_id, token_hash, expires_at, created_at)
       VALUES ($1, $2, $3, $4, $5)` ,
      [id, input.userId, input.tokenHash, input.expiresAt, new Date()]
    );
  }

  async findValidPasswordResetToken(tokenHash: string, now: Date): Promise<PasswordResetToken | null> {
    const result = await this.pool.query(
      `SELECT id, user_id
       FROM password_reset_tokens
       WHERE token_hash = $1 AND used_at IS NULL AND expires_at > $2
       ORDER BY created_at DESC
       LIMIT 1`,
      [tokenHash, now]
    );
    const row = result.rows[0];
    if (!row) return null;
    return { id: row.id, userId: row.user_id };
  }

  async markPasswordResetTokenUsed(id: string, usedAt: Date): Promise<void> {
    await this.pool.query("UPDATE password_reset_tokens SET used_at = $1 WHERE id = $2", [
      usedAt,
      id
    ]);
  }

  async updateUserPassword(userId: string, passwordHash: string): Promise<void> {
    await this.pool.query(
      "UPDATE users SET password_hash = $1, updated_at = $2 WHERE id = $3",
      [passwordHash, new Date(), userId]
    );
  }
}
