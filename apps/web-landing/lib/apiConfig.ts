/**
 * API Configuration
 * No per-school scoping needed - multi-tenant by design
 */
export const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:4000";
