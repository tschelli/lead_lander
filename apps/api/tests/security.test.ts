import { describe, expect, it, vi, beforeEach } from "vitest";
import request from "supertest";

vi.mock("../src/db", () => ({
  pool: {
    query: vi.fn()
  }
}));

import { app } from "../src/server";
import { pool } from "../src/db";

const mockQuery = pool.query as unknown as ReturnType<typeof vi.fn>;

describe("security hardening", () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  it("returns generic 401 for unknown school slug on login", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });

    const response = await request(app)
      .post("/api/auth/login")
      .send({ email: "test@example.com", password: "bad", schoolSlug: "missing-school" });

    expect(response.status).toBe(401);
    expect(response.body).toEqual({ error: "Invalid credentials" });
  });

  it("returns 404 for removed public schools list", async () => {
    const response = await request(app).get("/api/public/schools");
    expect(response.status).toBe(404);
  });
});
