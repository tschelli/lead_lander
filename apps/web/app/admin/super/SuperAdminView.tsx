"use client";

import { useEffect, useState } from "react";

type ClientRow = {
  id: string;
  name: string;
  schools: number;
  programs: number;
  users: number;
};

type SchoolRow = {
  id: string;
  name: string;
};

type SuperAdminViewProps = {
  schools: SchoolRow[];
};

export function SuperAdminView({ schools }: SuperAdminViewProps) {
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [clientId, setClientId] = useState("");
  const [clientName, setClientName] = useState("");
  const [schoolId, setSchoolId] = useState("");
  const [schoolSlug, setSchoolSlug] = useState("");
  const [schoolName, setSchoolName] = useState("");
  const [crmConnectionId, setCrmConnectionId] = useState("");
  const [programId, setProgramId] = useState("");
  const [programSlug, setProgramSlug] = useState("");
  const [programName, setProgramName] = useState("");
  const [adminEmail, setAdminEmail] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const [saving, setSaving] = useState(false);

  const loadClients = () => {
    setLoading(true);
    setError(null);
    fetch("/api/super/clients", { credentials: "include", cache: "no-store" })
      .then(async (response) => {
        if (response.status === 401 || response.status === 403) {
          window.location.href = schools.length > 0
            ? `/admin/${schools[0].id}/login?next=/admin/super`
            : "/admin";
          return;
        }
        if (!response.ok) {
          const message = await response.text();
          throw new Error(message || "Failed to load clients");
        }
        const data = await response.json();
        setClients(data.clients || []);
      })
      .catch((err) => setError(err.message || "Failed to load clients"))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadClients();
  }, []);

  const handleCreateClient = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError(null);

    try {
      const response = await fetch("/api/super/clients", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: clientId, name: clientName })
      });
      if (!response.ok) {
        const message = await response.text();
        throw new Error(message || "Failed to create client");
      }
      setClientId("");
      setClientName("");
      loadClients();
    } catch (err) {
      setError((err as Error).message || "Failed to create client");
    } finally {
      setSaving(false);
    }
  };

  const handleCreateSchool = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError(null);

    try {
      const response = await fetch(`/api/super/clients/${clientId}/schools`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: schoolId,
          slug: schoolSlug,
          name: schoolName,
          crmConnectionId
        })
      });
      if (!response.ok) {
        const message = await response.text();
        throw new Error(message || "Failed to create school");
      }
      setSchoolId("");
      setSchoolSlug("");
      setSchoolName("");
      setCrmConnectionId("");
      loadClients();
    } catch (err) {
      setError((err as Error).message || "Failed to create school");
    } finally {
      setSaving(false);
    }
  };

  const handleCreateProgram = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError(null);

    try {
      const response = await fetch(`/api/super/clients/${clientId}/programs`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: programId,
          slug: programSlug,
          name: programName,
          schoolId
        })
      });
      if (!response.ok) {
        const message = await response.text();
        throw new Error(message || "Failed to create program");
      }
      setProgramId("");
      setProgramSlug("");
      setProgramName("");
      loadClients();
    } catch (err) {
      setError((err as Error).message || "Failed to create program");
    } finally {
      setSaving(false);
    }
  };

  const handleCreateAdmin = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError(null);

    try {
      const response = await fetch(`/api/super/clients/${clientId}/admin-user`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: adminEmail, password: adminPassword })
      });
      if (!response.ok) {
        const message = await response.text();
        throw new Error(message || "Failed to create admin" );
      }
      setAdminEmail("");
      setAdminPassword("");
      loadClients();
    } catch (err) {
      setError((err as Error).message || "Failed to create admin");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="admin-users">
      <section className="admin-card">
        <h3>Clients</h3>
        {loading && <p className="admin-muted">Loading clients…</p>}
        {error && <p className="admin-muted" style={{ color: "#d9534f" }}>{error}</p>}
        {!loading && clients.length === 0 && <p className="admin-muted">No clients yet.</p>}
        {!loading && clients.length > 0 && (
          <div className="admin-users__table">
            {clients.map((client) => (
              <div key={client.id} className="admin-users__row">
                <div>
                  <strong>{client.name}</strong>
                  <p className="admin-muted">{client.id}</p>
                </div>
                <div>
                  <p className="admin-muted">Schools</p>
                  <strong>{client.schools}</strong>
                </div>
                <div>
                  <p className="admin-muted">Programs</p>
                  <strong>{client.programs}</strong>
                </div>
                <div>
                  <p className="admin-muted">Users</p>
                  <strong>{client.users}</strong>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="admin-card">
        <h3>Create client</h3>
        <form className="admin-form" onSubmit={handleCreateClient}>
          <label>
            Client ID
            <input value={clientId} onChange={(event) => setClientId(event.target.value)} required />
          </label>
          <label>
            Client name
            <input value={clientName} onChange={(event) => setClientName(event.target.value)} required />
          </label>
          <button className="admin-btn" type="submit" disabled={saving}>Create client</button>
        </form>
      </section>

      <section className="admin-card">
        <h3>Add school</h3>
        <form className="admin-form" onSubmit={handleCreateSchool}>
          <label>
            Client ID
            <input value={clientId} onChange={(event) => setClientId(event.target.value)} required />
          </label>
          <label>
            School ID
            <input value={schoolId} onChange={(event) => setSchoolId(event.target.value)} required />
          </label>
          <label>
            School slug
            <input value={schoolSlug} onChange={(event) => setSchoolSlug(event.target.value)} required />
          </label>
          <label>
            School name
            <input value={schoolName} onChange={(event) => setSchoolName(event.target.value)} required />
          </label>
          <label>
            CRM connection ID
            <input value={crmConnectionId} onChange={(event) => setCrmConnectionId(event.target.value)} required />
          </label>
          <button className="admin-btn" type="submit" disabled={saving}>Add school</button>
        </form>
      </section>

      <section className="admin-card">
        <h3>Add program</h3>
        <form className="admin-form" onSubmit={handleCreateProgram}>
          <label>
            Client ID
            <input value={clientId} onChange={(event) => setClientId(event.target.value)} required />
          </label>
          <label>
            School ID
            <input value={schoolId} onChange={(event) => setSchoolId(event.target.value)} required />
          </label>
          <label>
            Program ID
            <input value={programId} onChange={(event) => setProgramId(event.target.value)} required />
          </label>
          <label>
            Program slug
            <input value={programSlug} onChange={(event) => setProgramSlug(event.target.value)} required />
          </label>
          <label>
            Program name
            <input value={programName} onChange={(event) => setProgramName(event.target.value)} required />
          </label>
          <button className="admin-btn" type="submit" disabled={saving}>Add program</button>
        </form>
      </section>

      <section className="admin-card">
        <h3>Create client admin</h3>
        <form className="admin-form" onSubmit={handleCreateAdmin}>
          <label>
            Client ID
            <input value={clientId} onChange={(event) => setClientId(event.target.value)} required />
          </label>
          <label>
            Admin email
            <input value={adminEmail} onChange={(event) => setAdminEmail(event.target.value)} required />
          </label>
          <label>
            Temporary password
            <input type="password" value={adminPassword} onChange={(event) => setAdminPassword(event.target.value)} required />
          </label>
          <button className="admin-btn" type="submit" disabled={saving}>Create admin</button>
        </form>
      </section>
    </div>
  );
}
