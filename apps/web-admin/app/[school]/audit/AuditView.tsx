"use client";

import { useEffect, useState } from "react";

type AuditRow = {
  id: string;
  event: string;
  payload: Record<string, unknown>;
  createdAt: string;
};

type AuditViewProps = {
  schoolSlug: string;
};

export function AuditView({ schoolSlug }: AuditViewProps) {
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);

    fetch(`/api/admin/schools/${schoolSlug}/audit?limit=100`, {
      credentials: "include",
      cache: "no-store"
    })
      .then(async (response) => {
        if (response.status === 401 || response.status === 403) {
          window.location.href = `/${schoolSlug}/login`;
          return;
        }
        if (!response.ok) {
          const message = await response.text();
          throw new Error(message || "Failed to load audit log");
        }
        const data = await response.json();
        if (!active) return;
        setRows(data.rows || []);
      })
      .catch((err: Error) => {
        if (!active) return;
        setError(err.message || "Failed to load audit log");
      })
      .finally(() => {
        if (!active) return;
        setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [schoolSlug]);

  return (
    <div className="admin-card">
      <h3>Audit log</h3>
      <p className="admin-muted">Recent admin actions for this school.</p>
      {loading && <p className="admin-muted">Loading audit events…</p>}
      {error && <p className="admin-muted" style={{ color: "#d9534f" }}>{error}</p>}
      {!loading && rows.length === 0 && <p className="admin-muted">No audit activity yet.</p>}
      {!loading && rows.length > 0 && (
        <div className="admin-users__table">
          {rows.map((row) => (
            <div key={row.id} className="admin-users__row" style={{ gridTemplateColumns: "1fr 2fr 1fr" }}>
              <div>
                <strong>{row.event.replace(/_/g, " ")}</strong>
                <p className="admin-muted">{new Date(row.createdAt).toLocaleString()}</p>
              </div>
              <pre className="admin-muted" style={{ whiteSpace: "pre-wrap" }}>
                {JSON.stringify(row.payload, null, 2)}
              </pre>
              <div />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
