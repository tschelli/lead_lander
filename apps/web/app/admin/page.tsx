export const dynamic = "force-dynamic";

type SchoolsResponse = {
  schools: { id: string; slug: string; name: string }[];
};

export default async function AdminIndex() {
  const apiBase =
    process.env.ADMIN_API_BASE_URL ||
    process.env.NEXT_PUBLIC_API_BASE_URL ||
    "http://localhost:4000";
  const response = await fetch(`${apiBase}/api/public/schools`, { cache: "no-store" });
  const data = response.ok ? ((await response.json()) as SchoolsResponse) : { schools: [] };

  return (
    <div className="admin-shell">
      <header className="admin-header">
        <div>
          <h1>Lead Lander Dashboards</h1>
          <p className="admin-muted">
            Choose an account dashboard or explore visual prototypes.
          </p>
        </div>
        <span className="admin-pill">Dashboards</span>
      </header>

      <nav className="admin-nav">
        {data.schools.map((school) => (
          <a key={school.id} href={`/admin/${school.slug}`}>
            {school.name}
          </a>
        ))}
      </nav>

      <div className="admin-grid" style={{ marginTop: "24px" }}>
        <div className="admin-card">
          <h3>Dashboard guidance</h3>
          <p className="admin-muted">
            These dashboards are scoped per account. Each account pulls metrics for its own campuses and
            programs only.
          </p>
        </div>
      </div>
    </div>
  );
}
