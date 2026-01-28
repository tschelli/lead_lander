import type { AuthUser } from "./auth";

export const Roles = {
  superAdmin: "super_admin",
  clientAdmin: "client_admin",
  schoolAdmin: "school_admin",
  staff: "staff"
} as const;

export type Role = (typeof Roles)[keyof typeof Roles];

export type UserRole = {
  role: Role;
  schoolId: string | null;
};

export type AuthContext = {
  user: AuthUser;
  roles: UserRole[];
};

export function authorizeAdminAccess(roles: UserRole[], schoolId?: string | null) {
  if (roles.some((role) => role.role === Roles.superAdmin || role.role === Roles.clientAdmin)) {
    return true;
  }

  if (!schoolId) {
    return false;
  }

  return roles.some(
    (role) =>
      (role.role === Roles.schoolAdmin || role.role === Roles.staff) && role.schoolId === schoolId
  );
}
