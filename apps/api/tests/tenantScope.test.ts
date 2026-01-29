import { describe, expect, it } from "vitest";
import type { Config } from "@lead_lander/config-schema";
import type { AuthContext } from "../src/authz";
import { Roles } from "../src/authz";
import { getAllowedSchools } from "../src/tenantScope";

const config: Config = {
  schools: [
    {
      id: "school-1",
      clientId: "client-1",
      slug: "school-1",
      name: "School One",
      branding: { colors: { primary: "#000", secondary: "#111" } },
      compliance: { disclaimerText: "ok", version: "v1" },
      crmConnectionId: "crm-1"
    },
    {
      id: "school-2",
      clientId: "client-2",
      slug: "school-2",
      name: "School Two",
      branding: { colors: { primary: "#000", secondary: "#111" } },
      compliance: { disclaimerText: "ok", version: "v1" },
      crmConnectionId: "crm-2"
    }
  ],
  campuses: [],
  programs: [],
  landingPages: [],
  crmConnections: []
};

function makeAuth(overrides: Partial<AuthContext>): AuthContext {
  return {
    user: {
      id: "user-1",
      email: "test@example.com",
      passwordHash: "hash",
      emailVerified: true,
      clientId: null
    },
    roles: [],
    ...overrides
  };
}

describe("getAllowedSchools", () => {
  it("returns all schools for super_admin", () => {
    const auth = makeAuth({ roles: [{ role: Roles.superAdmin, schoolId: null }] });
    expect(getAllowedSchools(auth, config).map((s) => s.id)).toEqual(["school-1", "school-2"]);
  });

  it("returns only client schools for client_admin", () => {
    const auth = makeAuth({
      user: { ...makeAuth({}).user, clientId: "client-1" },
      roles: [{ role: Roles.clientAdmin, schoolId: null }]
    });
    expect(getAllowedSchools(auth, config).map((s) => s.id)).toEqual(["school-1"]);
  });

  it("returns only matching school for school_admin", () => {
    const auth = makeAuth({
      user: { ...makeAuth({}).user, clientId: "client-1" },
      roles: [{ role: Roles.schoolAdmin, schoolId: "school-1" }]
    });
    expect(getAllowedSchools(auth, config).map((s) => s.id)).toEqual(["school-1"]);
  });

  it("prevents cross-client school access for school_admin", () => {
    const auth = makeAuth({
      user: { ...makeAuth({}).user, clientId: "client-1" },
      roles: [{ role: Roles.schoolAdmin, schoolId: "school-2" }]
    });
    expect(getAllowedSchools(auth, config)).toHaveLength(0);
  });
});
