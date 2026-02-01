/**
 * Permission utilities for checking user access levels
 */

export type UserRole = {
  role: "super_admin" | "client_admin" | "school_admin" | "staff";
  schoolId: string | null;
};

export type User = {
  id: string;
  email: string;
  roles?: UserRole[];
};

/**
 * Check if user can access config builder
 * Only super_admin and client_admin can edit configs
 */
export function canEditConfig(user: User | null): boolean {
  if (!user || !user.roles) return false;

  return user.roles.some(
    (role) => role.role === "super_admin" || role.role === "client_admin"
  );
}

/**
 * Check if user is super admin
 */
export function isSuperAdmin(user: User | null): boolean {
  if (!user || !user.roles) return false;

  return user.roles.some((role) => role.role === "super_admin");
}

/**
 * Check if user is client admin
 */
export function isClientAdmin(user: User | null): boolean {
  if (!user || !user.roles) return false;

  return user.roles.some((role) => role.role === "client_admin");
}

/**
 * Check if user can manage users
 * Only super_admin and client_admin can manage users
 */
export function canManageUsers(user: User | null): boolean {
  return isSuperAdmin(user) || isClientAdmin(user);
}

/**
 * Get user's role display name
 */
export function getRoleDisplay(role: UserRole["role"]): string {
  const roleNames: Record<UserRole["role"], string> = {
    super_admin: "Super Admin",
    client_admin: "Client Admin",
    school_admin: "School Admin",
    staff: "Staff"
  };

  return roleNames[role] || role;
}
