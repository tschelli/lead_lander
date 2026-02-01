import type { Request, Response, NextFunction } from "express";
import type { AuthContext } from "../authz";

/**
 * Middleware to restrict config builder access to super_admin and client_admin only.
 * This ensures only authorized personnel can modify landing page configurations.
 *
 * Usage:
 *   app.get("/api/admin/schools/:schoolId/config/...", requireConfigAccess, handler);
 */
export function requireConfigAccess(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const auth = res.locals.auth as AuthContext | null;

  if (!auth) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  // Check if user has super_admin or client_admin role
  const canEditConfig = auth.roles.some(
    (role) => role.role === "super_admin" || role.role === "client_admin"
  );

  if (!canEditConfig) {
    res.status(403).json({
      error: "Forbidden: Config builder access requires super_admin or client_admin role"
    });
    return;
  }

  next();
}
