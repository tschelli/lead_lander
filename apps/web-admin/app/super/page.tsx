import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { hasSessionCookie } from "@/lib/authCookies";
import { SuperAdminView } from "./SuperAdminView";
import "../admin.css";

export const dynamic = "force-dynamic";

type SchoolsResponse = {
  schools: { id: string; slug: string; name: string }[];
};

export default async function SuperAdminPage() {
  const requestHeaders = headers();
  const cookie = requestHeaders.get("cookie");

  const apiBase =
    process.env.ADMIN_API_BASE_URL ||
    process.env.NEXT_PUBLIC_API_BASE_URL ||
    "http://localhost:4000";

  const schoolsResponse = await fetch(`${apiBase}/api/public/schools`, { cache: "no-store" });
  const schoolsData = schoolsResponse.ok ? ((await schoolsResponse.json()) as SchoolsResponse) : { schools: [] };
  const fallbackSchool = schoolsData.schools[0];

  if (!hasSessionCookie(cookie)) {
    if (fallbackSchool) {
      redirect(`/admin/${fallbackSchool.slug}/login?next=/admin/super`);
    }
    redirect("/admin");
  }

  const schools = schoolsData.schools.map((school) => ({
    id: school.id,
    slug: school.slug,
    name: school.name
  }));

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
