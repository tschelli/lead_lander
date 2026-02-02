import { headers } from "next/headers";

export const dynamic = "force-dynamic";

type AuthMeResponse = {
  schools: { id: string; slug: string; name: string }[];
};

export default async function AdminIndex() {
  const apiBase =
    process.env.ADMIN_API_BASE_URL ||
    process.env.NEXT_PUBLIC_API_BASE_URL ||
    "http://localhost:4000";
  const requestHeaders = headers();
  const cookie = requestHeaders.get("cookie");
  const authHeaders: Record<string, string> = cookie ? { cookie } : {};

  let schools: AuthMeResponse["schools"] = [];
  if (cookie) {
    const response = await fetch(`${apiBase}/api/auth/me`, {
      headers: authHeaders,
      cache: "no-store"
    });
    if (response.ok) {
      const data = (await response.json()) as AuthMeResponse;
      schools = data.schools || [];
    }
  }

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
        {schools.map((school) => (
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
