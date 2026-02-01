/**
 * School context from environment variables
 * Each deployment is scoped to a single school
 */
export const SCHOOL_ID = process.env.NEXT_PUBLIC_SCHOOL_ID!;
export const CLIENT_ID = process.env.NEXT_PUBLIC_CLIENT_ID!;
export const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:4000";

if (!SCHOOL_ID || !CLIENT_ID) {
  throw new Error(
    "School context not configured. Required: NEXT_PUBLIC_SCHOOL_ID and NEXT_PUBLIC_CLIENT_ID"
  );
}
