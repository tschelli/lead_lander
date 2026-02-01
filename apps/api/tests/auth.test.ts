import { describe, expect, it } from "vitest";
import {
  authenticateUser,
  createSessionToken,
  hashPassword,
  requestPasswordReset,
  resetPasswordWithToken,
  verifyPassword,
  verifySessionToken
} from "../src/auth";
import type { AuthRepo, AuthUser, PasswordResetToken } from "../src/auth";

class MemoryAuthRepo implements AuthRepo {
  users = new Map<string, AuthUser>();
  usersByEmail = new Map<string, string>();
  resetTokens = new Map<string, { token: PasswordResetToken; tokenHash: string; expiresAt: Date; usedAt?: Date }>();

  async findUserByEmail(clientId: string, email: string): Promise<AuthUser | null> {
    const id = this.usersByEmail.get(`${clientId}:${email}`);
    return id ? this.users.get(id) ?? null : null;
  }

  async findUserById(id: string): Promise<AuthUser | null> {
    return this.users.get(id) ?? null;
  }

  async updateLastLogin(_id: string): Promise<void> {
    return;
  }

  async createPasswordResetToken(input: {
    userId: string;
    tokenHash: string;
    expiresAt: Date;
  }): Promise<void> {
    const token: PasswordResetToken = {
      id: `token-${this.resetTokens.size + 1}`,
      userId: input.userId
    };
    this.resetTokens.set(token.id, { token, tokenHash: input.tokenHash, expiresAt: input.expiresAt });
  }

  async findValidPasswordResetToken(tokenHash: string, now: Date): Promise<PasswordResetToken | null> {
    for (const entry of this.resetTokens.values()) {
      if (entry.tokenHash === tokenHash && !entry.usedAt && entry.expiresAt > now) {
        return entry.token;
      }
    }
    return null;
  }

  async markPasswordResetTokenUsed(id: string, usedAt: Date): Promise<void> {
    const entry = this.resetTokens.get(id);
    if (entry) {
      entry.usedAt = usedAt;
    }
  }

  async updateUserPassword(userId: string, passwordHash: string): Promise<void> {
    const user = this.users.get(userId);
    if (user) {
      this.users.set(userId, { ...user, passwordHash });
    }
  }
}

describe("auth core", () => {
  it("authenticates valid credentials and rejects invalid ones", async () => {
    const repo = new MemoryAuthRepo();
    const passwordHash = await hashPassword("correct-password");
    const user: AuthUser = {
      id: "user-1",
      email: "test@example.com",
      passwordHash,
      emailVerified: true,
      clientId: "client-1",
      isActive: true
    };
    repo.users.set(user.id, user);
    repo.usersByEmail.set(`${user.clientId}:${user.email}`, user.id);

    const okResult = await authenticateUser(repo, "client-1", "test@example.com", "correct-password");
    expect(okResult.ok).toBe(true);

    const badResult = await authenticateUser(repo, "client-1", "test@example.com", "wrong-password");
    expect(badResult.ok).toBe(false);
  });

  it("issues a session token that can be verified", () => {
    const token = createSessionToken("user-123");
    const session = verifySessionToken(token);
    expect(session?.userId).toBe("user-123");
  });

  it("completes the password reset flow", async () => {
    const repo = new MemoryAuthRepo();
    const passwordHash = await hashPassword("initial-password");
    const user: AuthUser = {
      id: "user-2",
      email: "reset@example.com",
      passwordHash,
      emailVerified: true,
      clientId: "client-1",
      isActive: true
    };
    repo.users.set(user.id, user);
    repo.usersByEmail.set(`${user.clientId}:${user.email}`, user.id);

    const request = await requestPasswordReset(repo, "client-1", user.email);
    expect(request.ok).toBe(true);
    expect(request.token).toBeTruthy();

    const reset = await resetPasswordWithToken(repo, request.token as string, "new-password");
    expect(reset.ok).toBe(true);

    const updatedUser = await repo.findUserByEmail("client-1", user.email);
    const matchesOld = await verifyPassword("initial-password", updatedUser!.passwordHash);
    const matchesNew = await verifyPassword("new-password", updatedUser!.passwordHash);

    expect(matchesOld).toBe(false);
    expect(matchesNew).toBe(true);
  });
});
