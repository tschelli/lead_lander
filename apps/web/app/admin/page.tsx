export default function AdminIndex() {
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
        <a href="/admin/asher-college">Asher College (official)</a>
        <a href="/admin/northwood-tech">Northwood Tech (official)</a>
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
