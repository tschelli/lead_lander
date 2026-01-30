import { describe, expect, it } from "vitest";
import { computeIdempotencyKey } from "../src/idempotency";

describe("computeIdempotencyKey", () => {
  it("returns stable hash for same input", () => {
    const key1 = computeIdempotencyKey({
      clientId: "client-1",
      email: "Test@Example.com",
      phone: "(555) 123-4567",
      schoolId: "school",
      campusId: "campus",
      programId: "program"
    });

    const key2 = computeIdempotencyKey({
      clientId: "client-1",
      email: "test@example.com",
      phone: "5551234567",
      schoolId: "school",
      campusId: "campus",
      programId: "program"
    });

    expect(key1).toEqual(key2);
  });

  it("changes when program changes", () => {
    const key1 = computeIdempotencyKey({
      clientId: "client-1",
      email: "test@example.com",
      phone: "5551234567",
      schoolId: "school",
      campusId: "campus",
      programId: "program"
    });

    const key2 = computeIdempotencyKey({
      clientId: "client-2",
      email: "test@example.com",
      phone: "5551234567",
      schoolId: "school",
      campusId: "campus",
      programId: "program-2"
    });

    expect(key1).not.toEqual(key2);
  });
});
