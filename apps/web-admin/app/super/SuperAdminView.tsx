"use client";

import { useEffect, useMemo, useState } from "react";

type TreeProgram = {
  id: string;
  slug: string;
  name: string;
};

type TreeSchool = {
  id: string;
  slug: string;
  name: string;
  programs: TreeProgram[];
};

type TreeClient = {
  id: string;
  name: string;
  schools: TreeSchool[];
};

type ClientSummary = {
  id: string;
  name: string;
  schools: number;
  programs: number;
  users: number;
};

type SuperAdminViewProps = {
  fallbackSlug: string;
};

type Selection =
  | { kind: "client"; clientId: string }
  | { kind: "school"; clientId: string; schoolId: string }
  | { kind: "program"; clientId: string; schoolId: string; programId: string }
  | { kind: "create-client" }
  | { kind: "none" };

export function SuperAdminView({ fallbackSlug }: SuperAdminViewProps) {
  const [tree, setTree] = useState<TreeClient[]>([]);
  const [summary, setSummary] = useState<Record<string, ClientSummary>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [selection, setSelection] = useState<Selection>({ kind: "none" });
  const [expandedClients, setExpandedClients] = useState<Set<string>>(new Set());
  const [expandedSchools, setExpandedSchools] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);

  const [clientId, setClientId] = useState("");
  const [clientName, setClientName] = useState("");
  const [schoolId, setSchoolId] = useState("");
  const [schoolSlug, setSchoolSlug] = useState("");
  const [schoolName, setSchoolName] = useState("");
  const [crmConnectionId, setCrmConnectionId] = useState("");
  const [programId, setProgramId] = useState("");
  const [programSlug, setProgramSlug] = useState("");
  const [programName, setProgramName] = useState("");

  const [activeTab, setActiveTab] = useState<"overview" | "landing" | "quiz" | "crm" | "audit" | "billing">(
    "overview"
  );

  useEffect(() => {
    const loadTree = async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch("/api/super/tree", { credentials: "include", cache: "no-store" });
        if (response.status === 401 || response.status === 403) {
          window.location.href = fallbackSlug ? `/${fallbackSlug}/login?next=/super` : "/";
          return;
        }
        if (!response.ok) {
          throw new Error("Failed to load tree");
        }
        const data = await response.json();
        setTree(data.clients || []);
      } catch (err) {
        setError((err as Error).message || "Failed to load tree");
      } finally {
        setLoading(false);
      }
    };

    const loadSummary = async () => {
      try {
        const response = await fetch("/api/super/clients", { credentials: "include", cache: "no-store" });
        if (!response.ok) return;
        const data = await response.json();
        const mapped: Record<string, ClientSummary> = {};
        (data.clients || []).forEach((client: ClientSummary) => {
          mapped[client.id] = client;
        });
        setSummary(mapped);
      } catch {
        // no-op for summary errors
      }
    };

    loadTree();
    loadSummary();
  }, [fallbackSlug]);

  const filteredTree = useMemo(() => {
    if (!query.trim()) return tree;
    const q = query.toLowerCase();
    return tree
      .map((client) => {
        const matchedSchools = client.schools
          .map((school) => {
            const matchedPrograms = school.programs.filter((program) =>
              program.name.toLowerCase().includes(q)
            );
            const schoolMatch = school.name.toLowerCase().includes(q) || school.slug.toLowerCase().includes(q);
            if (schoolMatch || matchedPrograms.length > 0) {
              return {
                ...school,
                programs: schoolMatch ? school.programs : matchedPrograms
              };
            }
            return null;
          })
          .filter(Boolean) as TreeSchool[];

        const clientMatch = client.name.toLowerCase().includes(q) || client.id.toLowerCase().includes(q);
        if (clientMatch || matchedSchools.length > 0) {
          return {
            ...client,
            schools: clientMatch ? client.schools : matchedSchools
          };
        }
        return null;
      })
      .filter(Boolean) as TreeClient[];
  }, [tree, query]);

  const toggleClient = (id: string) => {
    setExpandedClients((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSchool = (id: string) => {
    setExpandedSchools((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const current = useMemo(() => {
    if (selection.kind === "client") {
      return tree.find((client) => client.id === selection.clientId) || null;
    }
    if (selection.kind === "school") {
      const client = tree.find((c) => c.id === selection.clientId);
      const school = client?.schools.find((s) => s.id === selection.schoolId) || null;
      return school ? { client, school } : null;
    }
    if (selection.kind === "program") {
      const client = tree.find((c) => c.id === selection.clientId);
      const school = client?.schools.find((s) => s.id === selection.schoolId);
      const program = school?.programs.find((p) => p.id === selection.programId) || null;
      return program ? { client, school, program } : null;
    }
    return null;
  }, [selection, tree]);

  const resetForms = () => {
    setClientId("");
    setClientName("");
    setSchoolId("");
    setSchoolSlug("");
    setSchoolName("");
    setCrmConnectionId("");
    setProgramId("");
    setProgramSlug("");
    setProgramName("");
  };

  const handleCreateClient = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      const response = await fetch("/api/super/clients", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: clientId, name: clientName })
      });
      if (!response.ok) throw new Error("Failed to create client");
      resetForms();
      setSelection({ kind: "none" });
      window.location.reload();
    } catch (err) {
      setError((err as Error).message || "Failed to create client");
    } finally {
      setSaving(false);
    }
  };

  const handleCreateSchool = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
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
      if (!response.ok) throw new Error("Failed to create school");
      resetForms();
      window.location.reload();
    } catch (err) {
      setError((err as Error).message || "Failed to create school");
    } finally {
      setSaving(false);
    }
  };

  const handleCreateProgram = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
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
      if (!response.ok) throw new Error("Failed to create program");
      resetForms();
      window.location.reload();
    } catch (err) {
      setError((err as Error).message || "Failed to create program");
    } finally {
      setSaving(false);
    }
  };

  const renderBreadcrumbs = () => {
    if (selection.kind === "none" || selection.kind === "create-client") {
      return "Super Admin";
    }
    if (selection.kind === "client") {
      return `Super Admin / ${selection.clientId}`;
    }
    if (selection.kind === "school") {
      return `Super Admin / ${selection.clientId} / ${selection.schoolId}`;
    }
    return `Super Admin / ${selection.clientId} / ${selection.schoolId} / ${selection.programId}`;
  };

  return (
    <div className="super-admin">
      <header className="super-admin__topbar">
        <div>
          <h1>Super Admin Console</h1>
          <p className="admin-muted">Manage clients, schools, programs, and configurations.</p>
        </div>
        <div className="super-admin__actions">
          <div className="super-admin__search">
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search clients, schools, programs"
            />
          </div>
          <button
            className="super-admin__btn"
            onClick={() => {
              resetForms();
              setSelection({ kind: "create-client" });
            }}
          >
            New client
          </button>
        </div>
      </header>

      <div className="super-admin__layout">
        <aside className="super-admin__sidebar">
          <div className="super-admin__tree">
            {loading && <p className="admin-muted">Loading clients…</p>}
            {error && <p className="admin-muted super-admin__error">{error}</p>}
            {!loading && filteredTree.length === 0 && <p className="admin-muted">No clients found.</p>}
            {filteredTree.map((client) => (
              <div key={client.id} className="super-admin__node">
                <button
                  className="super-admin__node-btn"
                  onClick={() => {
                    toggleClient(client.id);
                    setSelection({ kind: "client", clientId: client.id });
                    setClientId(client.id);
                  }}
                >
                  <span>{expandedClients.has(client.id) ? "▾" : "▸"}</span>
                  <span className="super-admin__node-title">{client.name}</span>
                </button>
                {expandedClients.has(client.id) && (
                  <div className="super-admin__children">
                    {client.schools.map((school) => (
                      <div key={school.id} className="super-admin__node">
                        <button
                          className="super-admin__node-btn super-admin__node-btn--school"
                          onClick={() => {
                            toggleSchool(school.id);
                            setSelection({ kind: "school", clientId: client.id, schoolId: school.id });
                            setClientId(client.id);
                            setSchoolId(school.id);
                          }}
                        >
                          <span>{expandedSchools.has(school.id) ? "▾" : "▸"}</span>
                          <span className="super-admin__node-title">{school.name}</span>
                        </button>
                        {expandedSchools.has(school.id) && (
                          <div className="super-admin__children super-admin__children--program">
                            {school.programs.map((program) => (
                              <button
                                key={program.id}
                                className="super-admin__node-btn super-admin__node-btn--program"
                                onClick={() => {
                                  setSelection({
                                    kind: "program",
                                    clientId: client.id,
                                    schoolId: school.id,
                                    programId: program.id
                                  });
                                  setClientId(client.id);
                                  setSchoolId(school.id);
                                  setProgramId(program.id);
                                }}
                              >
                                <span className="super-admin__node-title">{program.name}</span>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </aside>

        <section className="super-admin__detail">
          <div className="super-admin__breadcrumbs">{renderBreadcrumbs()}</div>

          {selection.kind === "create-client" && (
            <div className="super-admin__card">
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
                <button className="super-admin__btn" type="submit" disabled={saving}>
                  Create client
                </button>
              </form>
            </div>
          )}

          {selection.kind === "client" && current && (
            <div className="super-admin__stack">
              <div className="super-admin__card">
                <div className="super-admin__headline">
                  <h2>{(current as TreeClient).name}</h2>
                  <div className="super-admin__stats">
                    <span>Schools: {summary[(current as TreeClient).id]?.schools ?? 0}</span>
                    <span>Programs: {summary[(current as TreeClient).id]?.programs ?? 0}</span>
                    <span>Users: {summary[(current as TreeClient).id]?.users ?? 0}</span>
                  </div>
                </div>
                <div className="super-admin__tabs">
                  {["overview", "billing", "audit"].map((tab) => (
                    <button
                      key={tab}
                      className={activeTab === tab ? "active" : ""}
                      onClick={() => setActiveTab(tab as typeof activeTab)}
                    >
                      {tab.toUpperCase()}
                    </button>
                  ))}
                </div>
                <div className="super-admin__panel">
                  <p className="admin-muted">
                    {activeTab === "overview" && "Client overview and health checks will live here."}
                    {activeTab === "billing" && "Billing summary and invoices (placeholder)."}
                    {activeTab === "audit" && "Recent activity for this client."}
                  </p>
                </div>
              </div>

              <div className="super-admin__card">
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
                    <input
                      value={crmConnectionId}
                      onChange={(event) => setCrmConnectionId(event.target.value)}
                      required
                    />
                  </label>
                  <button className="super-admin__btn" type="submit" disabled={saving}>
                    Add school
                  </button>
                </form>
              </div>
            </div>
          )}

          {selection.kind === "school" && current && (
            <div className="super-admin__stack">
              <div className="super-admin__card">
                <div className="super-admin__headline">
                  <h2>{(current as { school: TreeSchool }).school.name}</h2>
                  <p className="admin-muted">{(current as { school: TreeSchool }).school.slug}</p>
                </div>
                <div className="super-admin__tabs">
                  {["overview", "landing", "quiz", "crm", "audit"].map((tab) => (
                    <button
                      key={tab}
                      className={activeTab === tab ? "active" : ""}
                      onClick={() => setActiveTab(tab as typeof activeTab)}
                    >
                      {tab.toUpperCase()}
                    </button>
                  ))}
                </div>
                <div className="super-admin__panel">
                  <p className="admin-muted">
                    {activeTab === "overview" && "School KPIs and status."}
                    {activeTab === "landing" && "Landing configuration editor placeholder."}
                    {activeTab === "quiz" && "Visual quiz flow editor placeholder."}
                    {activeTab === "crm" && "CRM settings placeholder."}
                    {activeTab === "audit" && "School audit log placeholder."}
                  </p>
                </div>
              </div>

              <div className="super-admin__card">
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
                  <button className="super-admin__btn" type="submit" disabled={saving}>
                    Add program
                  </button>
                </form>
              </div>
            </div>
          )}

          {selection.kind === "program" && current && (
            <div className="super-admin__card">
              <div className="super-admin__headline">
                <h2>{(current as { program: TreeProgram }).program.name}</h2>
                <p className="admin-muted">{(current as { program: TreeProgram }).program.slug}</p>
              </div>
              <div className="super-admin__tabs">
                {["landing", "quiz", "audit"].map((tab) => (
                  <button
                    key={tab}
                    className={activeTab === tab ? "active" : ""}
                    onClick={() => setActiveTab(tab as typeof activeTab)}
                  >
                    {tab.toUpperCase()}
                  </button>
                ))}
              </div>
              <div className="super-admin__panel">
                <p className="admin-muted">
                  {activeTab === "landing" && "Landing configuration editor placeholder."}
                  {activeTab === "quiz" && "Visual quiz flow editor placeholder."}
                  {activeTab === "audit" && "Program-level audit log placeholder."}
                </p>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
