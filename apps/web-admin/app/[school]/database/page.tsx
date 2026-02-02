import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { DatabaseView } from "../DatabaseView";
import "../styles.css";
import { hasSessionCookie } from "@/lib/authCookies";

export const dynamic = "force-dynamic";

type ConfigResponse = {
  config: {
    schools: { id: string; name: string; slug: string; branding: { logoUrl?: string } }[];
    campuses: { id: string; name: string; schoolId: string }[];
    programs: { id: string; name: string; schoolId: string }[];
  };
};

export default async function AdminDatabase({ params }: { params: { school: string } }) {
  const apiBase =
    process.env.ADMIN_API_BASE_URL ||
    process.env.NEXT_PUBLIC_API_BASE_URL ||
    "http://localhost:4000";
  const requestHeaders = headers();
  const cookie = requestHeaders.get("cookie");
  if (!hasSessionCookie(cookie)) {
    redirect(`/${params.school}/login`);
  }
  const authHeaders: Record<string, string> = cookie ? { cookie } : {};

  const configResponse = await fetch(`${apiBase}/api/admin/schools/${params.school}/config`, {
    credentials: "include",
    headers: authHeaders,
    cache: "no-store"
  });

  if (configResponse.status === 401) {
    redirect(`/${params.school}/login`);
  }

  if (configResponse.status === 403 || configResponse.status === 404) {
    redirect(`/${params.school}/not-authorized`);
  }

  if (!configResponse.ok) {
    throw new Error("Failed to load config");
  }

  const configData = (await configResponse.json()) as ConfigResponse;
  const school = configData.config.schools.find((item) => item.slug === params.school);

  if (!school) {
    return (
      <div className="admin-shell">
        <div className="admin-card">
          <h2>Account not found</h2>
          <p className="admin-muted">Check the URL or configuration.</p>
        </div>
      </div>
    );
  }

  const campuses = configData.config.campuses.filter((campus) => campus.schoolId === school.id);
  const programs = configData.config.programs.filter((program) => program.schoolId === school.id);
  return (
    <div className="admin-shell admin-official">
      <header className="admin-official__header">
        <div>
          <div className="admin-official__org">
            {school.branding.logoUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={school.branding.logoUrl} alt={`${school.name} logo`} />
            )}
            <div>
              <h1>{school.name} · Database</h1>
              <p className="admin-muted">Read-only view of submissions.</p>
            </div>
          </div>
        </div>
        <div className="admin-official__actions">
          <a className="admin-btn" href={`/${school.slug}`}>Back to dashboard</a>
        </div>
      </header>

      <section className="admin-card">
        <h3>Submissions</h3>
        <DatabaseView
          schoolSlug={school.slug}
          apiBase={apiBase}
          programs={programs.map((program) => ({ id: program.id, name: program.name }))}
          campuses={campuses.map((campus) => ({ id: campus.id, name: campus.name }))}
        />
      </section>
    </div>
  );
}
