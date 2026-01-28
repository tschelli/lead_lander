import { describe, expect, it } from "vitest";
import { authorizeAdminAccess, Roles, type UserRole } from "../src/authz";

describe("authorizeAdminAccess", () => {
  it("allows super_admin for any school", () => {
    const roles: UserRole[] = [{ role: Roles.superAdmin, schoolId: null }];
    expect(authorizeAdminAccess(roles, "school-1")).toBe(true);
  });

  it("allows client_admin for any school", () => {
    const roles: UserRole[] = [{ role: Roles.clientAdmin, schoolId: null }];
    expect(authorizeAdminAccess(roles, "school-1")).toBe(true);
  });

  it("allows school_admin only for matching school", () => {
    const roles: UserRole[] = [{ role: Roles.schoolAdmin, schoolId: "school-1" }];
    expect(authorizeAdminAccess(roles, "school-1")).toBe(true);
    expect(authorizeAdminAccess(roles, "school-2")).toBe(false);
  });

  it("allows staff only for matching school", () => {
    const roles: UserRole[] = [{ role: Roles.staff, schoolId: "school-1" }];
    expect(authorizeAdminAccess(roles, "school-1")).toBe(true);
    expect(authorizeAdminAccess(roles, "school-2")).toBe(false);
  });

  it("denies access when no school is provided and no global role", () => {
    const roles: UserRole[] = [{ role: Roles.staff, schoolId: "school-1" }];
    expect(authorizeAdminAccess(roles, null)).toBe(false);
  });
});
