import type { Request, Response, NextFunction } from "express";
import type { AuthContext } from "../authz";
import { pool } from "../db";

/**
 * Middleware to validate that the authenticated user has access to the requested school.
 * This ensures multi-tenant data isolation by verifying:
 * 1. User is authenticated
 * 2. School exists
 * 3. School belongs to user's client
 * 4. User has permission to access this school (via role scoping)
 *
 * Usage:
 *   app.get("/api/admin/schools/:schoolId/...", requireSchoolAccess, handler);
 */
export async function requireSchoolAccess(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const auth = res.locals.auth as AuthContext | null;

  if (!auth) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const schoolId = req.params.schoolId;
  if (!schoolId) {
    res.status(400).json({ error: "Missing schoolId parameter" });
    return;
  }

  try {
    // Fetch school and verify it belongs to user's client
    const result = await pool.query(
      `SELECT id, client_id, slug, name
       FROM schools
       WHERE id = $1
       LIMIT 1`,
      [schoolId]
    );

    const school = result.rows[0];

    if (!school) {
      res.status(404).json({ error: "School not found" });
      return;
    }

    // Verify school belongs to user's client
    if (school.client_id !== auth.user.clientId) {
      res.status(403).json({ error: "Forbidden: Access to this school is not allowed" });
      return;
    }

    // Check if user has school-specific access (for school_admin and staff roles)
    const schoolScopedRole = auth.roles.find(
      role => (role.role === "school_admin" || role.role === "staff") && role.schoolId
    );

    if (schoolScopedRole && schoolScopedRole.schoolId !== schoolId) {
      // User is restricted to a specific school and this isn't it
      res.status(403).json({ error: "Forbidden: Access to this school is not allowed" });
      return;
    }

    // Attach school to request locals for use in handler
    res.locals.school = school;
    next();
  } catch (error) {
    console.error("Error in requireSchoolAccess middleware:", error);
    res.status(500).json({ error: "Internal server error" });
  }
}

/**
 * Middleware to validate that authenticated user has client-level access.
 * Use this for endpoints that operate at client level (e.g., list all schools for a client).
 *
 * Usage:
 *   app.get("/api/admin/schools", requireClientAccess, handler);
 */
export function requireClientAccess(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const auth = res.locals.auth as AuthContext | null;

  if (!auth) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  if (!auth.user.clientId) {
    res.status(403).json({ error: "Forbidden: No client access" });
    return;
  }

  next();
}
