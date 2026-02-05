/**
 * API Configuration
 * No per-school scoping needed - multi-tenant by design
 */

// Server-side API URL (inside Docker: http://api:4000, outside: http://localhost:4000)
export const API_BASE_URL = process.env.API_BASE_URL || process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:4000";

// Client-side API URL (always accessible from browser)
export const CLIENT_API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:4000";
