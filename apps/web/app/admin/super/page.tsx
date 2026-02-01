import { loadConfig } from "@lead_lander/config-schema";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { resolveConfigDir } from "../../../lib/configDir";
import { hasSessionCookie } from "../../../lib/authCookies";
import { SuperAdminView } from "./SuperAdminView";
import "../admin.css";

export const dynamic = "force-dynamic";

export default function SuperAdminPage() {
  const config = loadConfig(resolveConfigDir());
  const requestHeaders = headers();
  const cookie = requestHeaders.get("cookie");
  const fallbackSchool = config.schools[0];
  if (!hasSessionCookie(cookie)) {
    if (fallbackSchool) {
      redirect(`/admin/${fallbackSchool.slug}/login?next=/admin/super`);
    }
    redirect("/admin");
  }

  const schools = config.schools.map((school) => ({ id: school.id, name: school.name }));

  return (
    <div className="admin-shell admin-official">
      <header className="admin-official__header">
        <div>
          <h1>Super admin</h1>
          <p className="admin-muted">Manage clients, onboarding, and admin users.</p>
        </div>
      </header>
      <SuperAdminView schools={schools} />
    </div>
  );
}
