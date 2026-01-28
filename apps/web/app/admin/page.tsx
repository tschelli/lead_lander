export default function AdminIndex() {
  return (
    <div className="admin-shell">
      <header className="admin-header">
        <div>
          <h1>Lead Lander Dashboards</h1>
          <p className="admin-muted">
            Prototype dashboard concepts for client analytics, exports, and configuration control.
          </p>
        </div>
        <span className="admin-pill">Prototypes</span>
      </header>

      <nav className="admin-nav">
        <a href="/admin/prototype-a">Prototype A · Control Center</a>
        <a href="/admin/prototype-b">Prototype B · Ops Console</a>
        <a href="/admin/prototype-c">Prototype C · Minimal Pro</a>
      </nav>

      <div className="admin-grid" style={{ marginTop: "24px" }}>
        <div className="admin-card">
          <h3>Included modules</h3>
          <p className="admin-muted">
            Each prototype includes: database metrics, CRM worker health, export tools, config
            builder previews, and database table snapshots.
          </p>
        </div>
        <div className="admin-card">
          <h3>Next step</h3>
          <p className="admin-muted">
            Choose a prototype to refine. We can wire auth, multi-account access, and approval flows
            once a direction is selected.
          </p>
        </div>
      </div>
    </div>
  );
}
