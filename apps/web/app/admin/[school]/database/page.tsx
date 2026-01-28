import { loadConfig } from "@lead_lander/config-schema";
import { DatabaseView } from "../DatabaseView";
import "../styles.css";
import { resolveAdminKey } from "../../../../lib/adminKeys";
import { resolveConfigDir } from "../../../../lib/configDir";

export const dynamic = "force-dynamic";

export default async function AdminDatabase({ params }: { params: { school: string } }) {
  const config = loadConfig(resolveConfigDir());
  const school = config.schools.find((item) => item.slug === params.school);

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

  const campuses = config.campuses.filter((campus) => campus.schoolId === school.id);
  const programs = config.programs.filter((program) => program.schoolId === school.id);

  const apiBase =
    process.env.ADMIN_API_BASE_URL ||
    process.env.NEXT_PUBLIC_API_BASE_URL ||
    "http://localhost:4000";
  const adminKey = resolveAdminKey(school.slug);

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
          <a className="admin-btn" href={`/admin/${school.slug}`}>Back to dashboard</a>
        </div>
      </header>

      <section className="admin-card">
        <h3>Submissions</h3>
        <DatabaseView
          schoolSlug={school.slug}
          apiBase={apiBase}
          adminKey={adminKey}
          programs={programs.map((program) => ({ id: program.id, name: program.name }))}
          campuses={campuses.map((campus) => ({ id: campus.id, name: campus.name }))}
        />
      </section>
    </div>
  );
}
