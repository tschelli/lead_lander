import type { Config, School } from "@lead_lander/config-schema";
import type { AuthContext } from "./authz";
import { Roles } from "./authz";

export function getAllowedSchools(auth: AuthContext, config: Config): School[] {
  if (auth.roles.some((role) => role.role === Roles.superAdmin)) {
    return config.schools;
  }

  if (auth.roles.some((role) => role.role === Roles.clientAdmin)) {
    if (!auth.user.clientId) return [];
    return config.schools.filter((school) => school.clientId === auth.user.clientId);
  }

  const allowedSchoolIds = new Set(
    auth.roles
      .filter((role) => role.role === Roles.schoolAdmin || role.role === Roles.staff)
      .map((role) => role.schoolId)
      .filter(Boolean)
  );

  return config.schools.filter((school) => {
    if (!allowedSchoolIds.has(school.id)) return false;
    if (auth.user.clientId && school.clientId && auth.user.clientId !== school.clientId) {
      return false;
    }
    return true;
  });
}
