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

export function authorizeAdminAccess(input: {
  roles: UserRole[];
  schoolId?: string | null;
  schoolClientId?: string | null;
  userClientId?: string | null;
}) {
  const { roles, schoolId, schoolClientId, userClientId } = input;
  if (roles.some((role) => role.role === Roles.superAdmin || role.role === Roles.clientAdmin)) {
    if (roles.some((role) => role.role === Roles.superAdmin)) {
      return true;
    }

    return Boolean(userClientId && schoolClientId && userClientId === schoolClientId);
  }

  if (!schoolId) {
    return false;
  }

  const hasSchoolRole = roles.some(
    (role) =>
      (role.role === Roles.schoolAdmin || role.role === Roles.staff) && role.schoolId === schoolId
  );

  if (!hasSchoolRole) return false;

  if (userClientId && schoolClientId && userClientId !== schoolClientId) {
    return false;
  }

  return true;
}
