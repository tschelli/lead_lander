import { createHash } from "crypto";

type IdempotencyInput = {
  email: string;
  phone: string | null;
  schoolId: string;
  campusId: string | null;
  programId: string;
};

export function computeIdempotencyKey(input: IdempotencyInput) {
  const normalized = [
    input.email.trim().toLowerCase(),
    input.phone?.replace(/\D/g, "") || "",
    input.schoolId,
    input.campusId || "",
    input.programId
  ].join("|");

  return createHash("sha256").update(normalized).digest("hex");
}
