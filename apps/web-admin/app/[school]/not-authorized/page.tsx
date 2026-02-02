export const dynamic = "force-dynamic";

export default function NotAuthorized() {
  return (
    <div className="admin-shell">
      <div className="admin-card">
        <h2>Access restricted</h2>
        <p className="admin-muted">You don’t have access to this school dashboard.</p>
      </div>
    </div>
  );
}
