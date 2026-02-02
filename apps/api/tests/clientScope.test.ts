import { describe, expect, it, vi } from "vitest";
import type { Request, Response } from "express";
import { requireSchoolAccess } from "../src/middleware/clientScope";

vi.mock("../src/db", () => ({
  pool: {
    query: vi.fn()
  }
}));

import { pool } from "../src/db";

const mockQuery = pool.query as unknown as ReturnType<typeof vi.fn>;

function makeRes(locals: Record<string, unknown> = {}) {
  const res = {
    locals,
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis()
  } as unknown as Response;
  return res;
}

describe("requireSchoolAccess", () => {
  it("returns 404 when no school found for client-scoped lookup", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });

    const req = { params: { schoolId: "school-x" } } as unknown as Request;
    const res = makeRes({
      auth: { user: { clientId: "client-1" }, roles: [] }
    });
    const next = vi.fn();

    await requireSchoolAccess(req, res, next);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(next).not.toHaveBeenCalled();
  });

  it("allows access when user has any matching school-scoped role", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: "school-2", client_id: "client-1", slug: "school-2", name: "School 2" }]
    });

    const req = { params: { schoolId: "school-2" } } as unknown as Request;
    const res = makeRes({
      auth: {
        user: { clientId: "client-1" },
        roles: [
          { role: "school_admin", schoolId: "school-1" },
          { role: "school_admin", schoolId: "school-2" }
        ]
      }
    });
    const next = vi.fn();

    await requireSchoolAccess(req, res, next);

    expect(next).toHaveBeenCalled();
  });
});
