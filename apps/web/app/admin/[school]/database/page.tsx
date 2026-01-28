import path from "path";
import { loadConfig } from "@lead_lander/config-schema";

export const dynamic = "force-dynamic";

type SubmissionRow = {
  id: string;
  email: string;
  status: string;
  crmLeadId: string | null;
  programId: string;
  campusId: string | null;
  createdAt: string;
};

export default async function AdminDatabase({ params }: { params: { school: string } }) {
  const configDir = path.resolve(process.cwd(), "../../../configs");
  const config = loadConfig(configDir);
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
  const headers: Record<string, string> = {};
  if (process.env.ADMIN_API_KEY) {
    headers["x-admin-key"] = process.env.ADMIN_API_KEY;
  }

  let rows: SubmissionRow[] = [];
  let error: string | null = null;

  try {
    const response = await fetch(`${apiBase}/api/admin/${school.slug}/submissions?limit=50`, {
      headers,
      cache: "no-store"
    });

    if (!response.ok) {
      const message = await response.text();
      throw new Error(message || "Failed to load submissions");
    }

    const data = (await response.json()) as { rows: SubmissionRow[] };
    rows = data.rows;
  } catch (err) {
    error = (err as Error).message;
  }

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
        {error && <p className="admin-muted">Unable to load submissions: {error}</p>}
        <table className="admin-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Email</th>
              <th>Program</th>
              <th>Campus</th>
              <th>Status</th>
              <th>CRM Lead</th>
              <th>Created</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="admin-muted">No submissions found</td>
              </tr>
            )}
            {rows.map((row) => {
              const programName = programs.find((program) => program.id === row.programId)?.name || row.programId;
              const campusName = row.campusId
                ? campuses.find((campus) => campus.id === row.campusId)?.name || row.campusId
                : "Unspecified campus";

              return (
                <tr key={row.id}>
                  <td>{row.id.slice(0, 8)}</td>
                  <td>{row.email}</td>
                  <td>{programName}</td>
                  <td>{campusName}</td>
                  <td>{row.status}</td>
                  <td>{row.crmLeadId || "—"}</td>
                  <td>{new Date(row.createdAt).toLocaleString()}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
    </div>
  );
}
