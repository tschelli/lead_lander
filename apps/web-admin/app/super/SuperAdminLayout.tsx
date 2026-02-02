"use client";

import { useEffect, useRef, useState } from "react";
import { ConfigBuilderPage } from "../[school]/config/ConfigBuilderPage";
import { QuizBuilderPage } from "../[school]/quiz/QuizBuilderPage";
import "./super-admin.css";

type Client = {
  id: string;
  name: string;
  schools: School[];
};

type School = {
  id: string;
  slug: string;
  name: string;
  programs: Program[];
};

type Program = {
  id: string;
  slug: string;
  name: string;
};

type SuperAdminLayoutProps = {
  initialClients: Client[];
  userEmail?: string;
};

export function SuperAdminLayout({ initialClients, userEmail }: SuperAdminLayoutProps) {
  const [clients, setClients] = useState<Client[]>(initialClients);
  const [expandedClients, setExpandedClients] = useState<Set<string>>(new Set());
  const [expandedSchools, setExpandedSchools] = useState<Set<string>>(new Set());
  const [selectedEntity, setSelectedEntity] = useState<{
    type: "client" | "school" | "program";
    id: string;
    parentIds?: { clientId?: string; schoolId?: string };
  } | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [activeTab, setActiveTab] = useState<"overview" | "create">("overview");
  const [detailTab, setDetailTab] = useState<"overview" | "config" | "quiz" | "audit">("overview");
  const mainRef = useRef<HTMLDivElement | null>(null);

  const toggleClient = (clientId: string) => {
    const newExpanded = new Set(expandedClients);
    if (newExpanded.has(clientId)) {
      newExpanded.delete(clientId);
    } else {
      newExpanded.add(clientId);
    }
    setExpandedClients(newExpanded);
  };

  const toggleSchool = (schoolId: string) => {
    const newExpanded = new Set(expandedSchools);
    if (newExpanded.has(schoolId)) {
      newExpanded.delete(schoolId);
    } else {
      newExpanded.add(schoolId);
    }
    setExpandedSchools(newExpanded);
  };

  const selectEntity = (
    type: "client" | "school" | "program",
    id: string,
    parentIds?: { clientId?: string; schoolId?: string }
  ) => {
    setSelectedEntity({ type, id, parentIds });
    setActiveTab("overview");
    setDetailTab("overview");
  };

  // Filter clients based on search
  const filteredClients = clients.filter((client) => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      client.name.toLowerCase().includes(query) ||
      client.schools.some(
        (school) =>
          school.name.toLowerCase().includes(query) ||
          school.programs.some((program) => program.name.toLowerCase().includes(query))
      )
    );
  });

  useEffect(() => {
    if (mainRef.current) {
      mainRef.current.scrollTo({ top: 0, behavior: "smooth" });
    }
  }, [selectedEntity?.id, selectedEntity?.type]);

  return (
    <div className="super-admin">
      {/* Top Bar */}
      <header className="super-admin__topbar">
        <div className="super-admin__topbar-left">
          <div className="super-admin__logo">
            <span className="super-admin__logo-icon">🏢</span>
            <span className="super-admin__logo-text">Super Admin</span>
          </div>
          <div className="super-admin__search">
            <span className="super-admin__search-icon">🔍</span>
            <input
              type="text"
              placeholder="Search clients, schools, programs..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="super-admin__search-input"
            />
          </div>
        </div>
        <div className="super-admin__topbar-right">
          <button
            className="super-admin__quick-create"
            onClick={() => {
              setActiveTab("create");
              setSelectedEntity(null);
            }}
          >
            <span>+</span> Quick Create
          </button>
          <div className="super-admin__user">
            <button
              className="super-admin__user-button"
              onClick={() => setShowUserMenu(!showUserMenu)}
            >
              <span className="super-admin__user-avatar">👤</span>
              <span className="super-admin__user-email">{userEmail || "Admin"}</span>
              <span className="super-admin__user-caret">▼</span>
            </button>
            {showUserMenu && (
              <div className="super-admin__user-menu">
                <a href="/super/profile" className="super-admin__user-menu-item">
                  Profile
                </a>
                <a href="/super/settings" className="super-admin__user-menu-item">
                  Settings
                </a>
                <hr className="super-admin__user-menu-divider" />
                <a href="/api/auth/logout" className="super-admin__user-menu-item">
                  Logout
                </a>
              </div>
            )}
          </div>
        </div>
      </header>

      <div className="super-admin__body">
        {/* Sidebar */}
        <aside className="super-admin__sidebar">
          <div className="super-admin__sidebar-header">
            <h3>All Clients</h3>
            <span className="super-admin__sidebar-count">{clients.length}</span>
          </div>

          <div className="super-admin__tree">
            {filteredClients.length === 0 && (
              <div className="super-admin__empty">
                {searchQuery ? "No results found" : "No clients yet"}
              </div>
            )}

            {filteredClients.map((client) => {
              const isExpanded = expandedClients.has(client.id);
              const isSelected =
                selectedEntity?.type === "client" && selectedEntity.id === client.id;

              return (
                <div key={client.id} className="super-admin__tree-client">
                  <div
                    className={`super-admin__tree-item ${isSelected ? "is-selected" : ""}`}
                    onClick={() => selectEntity("client", client.id)}
                  >
                    <button
                      className="super-admin__tree-toggle"
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleClient(client.id);
                      }}
                    >
                      {isExpanded ? "▼" : "▶"}
                    </button>
                    <span className="super-admin__tree-icon">🏢</span>
                    <span className="super-admin__tree-label">{client.name}</span>
                    <span className="super-admin__tree-badge">{client.schools.length}</span>
                  </div>

                  {isExpanded && (
                    <div className="super-admin__tree-children">
                      {client.schools.map((school) => {
                        const isSchoolExpanded = expandedSchools.has(school.id);
                        const isSchoolSelected =
                          selectedEntity?.type === "school" && selectedEntity.id === school.id;

                        return (
                          <div key={school.id} className="super-admin__tree-school">
                            <div
                              className={`super-admin__tree-item ${isSchoolSelected ? "is-selected" : ""}`}
                              onClick={() =>
                                selectEntity("school", school.id, { clientId: client.id })
                              }
                            >
                              <button
                                className="super-admin__tree-toggle"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  toggleSchool(school.id);
                                }}
                              >
                                {isSchoolExpanded ? "▼" : "▶"}
                              </button>
                              <span className="super-admin__tree-icon">🏫</span>
                              <span className="super-admin__tree-label">{school.name}</span>
                              <span className="super-admin__tree-badge">{school.programs.length}</span>
                            </div>

                            {isSchoolExpanded && (
                              <div className="super-admin__tree-children">
                                {school.programs.map((program) => {
                                  const isProgramSelected =
                                    selectedEntity?.type === "program" &&
                                    selectedEntity.id === program.id;

                                  return (
                                    <div
                                      key={program.id}
                                      className={`super-admin__tree-item super-admin__tree-item--leaf ${isProgramSelected ? "is-selected" : ""}`}
                                      onClick={() =>
                                        selectEntity("program", program.id, {
                                          clientId: client.id,
                                          schoolId: school.id
                                        })
                                      }
                                    >
                                      <span className="super-admin__tree-spacer"></span>
                                      <span className="super-admin__tree-icon">📚</span>
                                      <span className="super-admin__tree-label">{program.name}</span>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </aside>

        {/* Main Content */}
        <main className="super-admin__main" ref={mainRef}>
          {activeTab === "create" && <CreateEntityPanel clients={clients} />}
          {activeTab === "overview" && selectedEntity && (
            <EntityDetailPanel
              entity={selectedEntity}
              clients={clients}
              detailTab={detailTab}
              setDetailTab={setDetailTab}
            />
          )}
          {activeTab === "overview" && !selectedEntity && <WelcomePanel />}
        </main>
      </div>
    </div>
  );
}

// Welcome Panel
function WelcomePanel() {
  return (
    <div className="super-admin__welcome">
      <h1>Welcome to Super Admin</h1>
      <p>Select a client, school, or program from the sidebar to view details.</p>
      <p>Or click "Quick Create" to add new entities.</p>
    </div>
  );
}

// Create Entity Panel
function CreateEntityPanel({ clients }: { clients: Client[] }) {
  return (
    <div className="super-admin__panel">
      <div className="super-admin__panel-header">
        <h2>Quick Create</h2>
      </div>
      <div className="super-admin__panel-content">
        <div className="super-admin__create-grid">
          <CreateClientForm />
          <CreateSchoolForm clients={clients} />
          <CreateProgramForm clients={clients} />
          <CreateAdminForm clients={clients} />
        </div>
      </div>
    </div>
  );
}

// Entity Detail Panel
function EntityDetailPanel({
  entity,
  clients,
  detailTab,
  setDetailTab
}: {
  entity: any;
  clients: Client[];
  detailTab: "overview" | "config" | "quiz" | "audit";
  setDetailTab: (value: "overview" | "config" | "quiz" | "audit") => void;
}) {
  // Find the entity details
  let entityDetails: any = null;
  if (entity.type === "client") {
    entityDetails = clients.find((c) => c.id === entity.id);
  } else if (entity.type === "school") {
    for (const client of clients) {
      const school = client.schools.find((s) => s.id === entity.id);
      if (school) {
        entityDetails = { ...school, clientName: client.name };
        break;
      }
    }
  } else if (entity.type === "program") {
    for (const client of clients) {
      for (const school of client.schools) {
        const program = school.programs.find((p) => p.id === entity.id);
        if (program) {
          entityDetails = { ...program, schoolName: school.name, clientName: client.name };
          break;
        }
      }
    }
  }

  const schoolContext =
    entity.type === "school"
      ? {
          school: entityDetails as School,
          programs: (entityDetails as School).programs
        }
      : entity.type === "program"
        ? (() => {
            const program = entityDetails as Program;
            const school =
              clients
                .flatMap((client) => client.schools)
                .find((s) => s.programs.some((p) => p.id === program.id)) || null;
            if (!school) return null;
            return { school, programs: [program] };
          })()
        : null;

  return (
    <div className="super-admin__panel">
      <div className="super-admin__panel-header">
        <h2>
          {entity.type === "client" && "Client Details"}
          {entity.type === "school" && "School Details"}
          {entity.type === "program" && "Program Details"}
        </h2>
      </div>
      <div className="super-admin__panel-tabs">
        {(["overview", "config", "quiz", "audit"] as const).map((tab) => (
          <button
            key={tab}
            className={`super-admin__tab ${detailTab === tab ? "is-active" : ""}`}
            onClick={() => setDetailTab(tab)}
          >
            {tab === "config" ? "Config" : tab === "quiz" ? "Quiz" : tab === "audit" ? "Audit" : "Overview"}
          </button>
        ))}
      </div>
      <div className="super-admin__panel-content">
        {detailTab === "overview" && entityDetails && (
          <div className="super-admin__details">
            <div className="super-admin__detail-row">
              <strong>ID:</strong> {entity.id}
            </div>
            <div className="super-admin__detail-row">
              <strong>Name:</strong> {entityDetails.name}
            </div>
            {entityDetails.slug && (
              <div className="super-admin__detail-row">
                <strong>Slug:</strong> {entityDetails.slug}
              </div>
            )}
            {entity.type === "client" && (
              <>
                <div className="super-admin__detail-row">
                  <strong>Schools:</strong> {entityDetails.schools.length}
                </div>
                <div className="super-admin__detail-row">
                  <strong>Total Programs:</strong>{" "}
                  {entityDetails.schools.reduce((sum: number, s: School) => sum + s.programs.length, 0)}
                </div>
              </>
            )}
            {entity.type === "school" && (
              <>
                <div className="super-admin__detail-row">
                  <strong>Client:</strong> {entityDetails.clientName}
                </div>
                <div className="super-admin__detail-row">
                  <strong>Programs:</strong> {entityDetails.programs.length}
                </div>
              </>
            )}
            {entity.type === "program" && (
              <>
                <div className="super-admin__detail-row">
                  <strong>School:</strong> {entityDetails.schoolName}
                </div>
                <div className="super-admin__detail-row">
                  <strong>Client:</strong> {entityDetails.clientName}
                </div>
              </>
            )}
          </div>
        )}

        {detailTab === "config" && schoolContext && (
          <ConfigBuilderPage schoolSlug={schoolContext.school.slug} programs={schoolContext.programs} />
        )}

        {detailTab === "quiz" && schoolContext && (
          <QuizBuilderPage schoolSlug={schoolContext.school.slug} programs={schoolContext.programs} />
        )}

        {detailTab === "audit" && (
          <div className="super-admin__details">
            <p className="admin-muted">Audit log will appear here.</p>
          </div>
        )}
      </div>
    </div>
  );
}

// Create Client Form
function CreateClientForm() {
  const [clientId, setClientId] = useState("");
  const [clientName, setClientName] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMessage(null);

    try {
      const response = await fetch("/api/super/clients", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: clientId, name: clientName })
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || "Failed to create client");
      }

      setMessage({ type: "success", text: "Client created successfully!" });
      setClientId("");
      setClientName("");

      // Reload page to refresh client list
      setTimeout(() => window.location.reload(), 1000);
    } catch (error) {
      setMessage({ type: "error", text: (error as Error).message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="super-admin__form-card">
      <h3>Create Client</h3>
      {message && (
        <div className={`super-admin__message super-admin__message--${message.type}`}>
          {message.text}
        </div>
      )}
      <form className="super-admin__form" onSubmit={handleSubmit}>
        <label>
          Client ID
          <input
            type="text"
            placeholder="abc-university"
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
            required
          />
        </label>
        <label>
          Client Name
          <input
            type="text"
            placeholder="ABC University"
            value={clientName}
            onChange={(e) => setClientName(e.target.value)}
            required
          />
        </label>
        <button type="submit" className="admin-btn" disabled={saving}>
          {saving ? "Creating..." : "Create Client"}
        </button>
      </form>
    </div>
  );
}

// Create School Form
function CreateSchoolForm({ clients }: { clients: Client[] }) {
  const [clientId, setClientId] = useState("");
  const [schoolId, setSchoolId] = useState("");
  const [schoolSlug, setSchoolSlug] = useState("");
  const [schoolName, setSchoolName] = useState("");
  const [crmConnectionId, setCrmConnectionId] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMessage(null);

    try {
      const response = await fetch(`/api/super/clients/${clientId}/schools`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: schoolId, slug: schoolSlug, name: schoolName, crmConnectionId })
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || "Failed to create school");
      }

      setMessage({ type: "success", text: "School created successfully!" });
      setSchoolId("");
      setSchoolSlug("");
      setSchoolName("");
      setCrmConnectionId("");

      setTimeout(() => window.location.reload(), 1000);
    } catch (error) {
      setMessage({ type: "error", text: (error as Error).message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="super-admin__form-card">
      <h3>Add School</h3>
      {message && (
        <div className={`super-admin__message super-admin__message--${message.type}`}>
          {message.text}
        </div>
      )}
      <form className="super-admin__form" onSubmit={handleSubmit}>
        <label>
          Client
          <select value={clientId} onChange={(e) => setClientId(e.target.value)} required>
            <option value="">Select client...</option>
            {clients.map((client) => (
              <option key={client.id} value={client.id}>
                {client.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          School ID
          <input
            type="text"
            placeholder="main-campus"
            value={schoolId}
            onChange={(e) => setSchoolId(e.target.value)}
            required
          />
        </label>
        <label>
          School Slug
          <input
            type="text"
            placeholder="main-campus"
            value={schoolSlug}
            onChange={(e) => setSchoolSlug(e.target.value)}
            required
          />
        </label>
        <label>
          School Name
          <input
            type="text"
            placeholder="Main Campus"
            value={schoolName}
            onChange={(e) => setSchoolName(e.target.value)}
            required
          />
        </label>
        <label>
          CRM Connection ID
          <input
            type="text"
            placeholder="crm-connection-id"
            value={crmConnectionId}
            onChange={(e) => setCrmConnectionId(e.target.value)}
            required
          />
        </label>
        <button type="submit" className="admin-btn" disabled={saving}>
          {saving ? "Adding..." : "Add School"}
        </button>
      </form>
    </div>
  );
}

// Create Program Form
function CreateProgramForm({ clients }: { clients: Client[] }) {
  const [clientId, setClientId] = useState("");
  const [schoolId, setSchoolId] = useState("");
  const [programId, setProgramId] = useState("");
  const [programSlug, setProgramSlug] = useState("");
  const [programName, setProgramName] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const selectedClient = clients.find((c) => c.id === clientId);
  const schools = selectedClient?.schools || [];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMessage(null);

    try {
      const response = await fetch(`/api/super/clients/${clientId}/programs`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: programId, slug: programSlug, name: programName, schoolId })
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || "Failed to create program");
      }

      setMessage({ type: "success", text: "Program created successfully!" });
      setProgramId("");
      setProgramSlug("");
      setProgramName("");

      setTimeout(() => window.location.reload(), 1000);
    } catch (error) {
      setMessage({ type: "error", text: (error as Error).message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="super-admin__form-card">
      <h3>Add Program</h3>
      {message && (
        <div className={`super-admin__message super-admin__message--${message.type}`}>
          {message.text}
        </div>
      )}
      <form className="super-admin__form" onSubmit={handleSubmit}>
        <label>
          Client
          <select
            value={clientId}
            onChange={(e) => {
              setClientId(e.target.value);
              setSchoolId("");
            }}
            required
          >
            <option value="">Select client...</option>
            {clients.map((client) => (
              <option key={client.id} value={client.id}>
                {client.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          School
          <select value={schoolId} onChange={(e) => setSchoolId(e.target.value)} required>
            <option value="">Select school...</option>
            {schools.map((school) => (
              <option key={school.id} value={school.id}>
                {school.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Program ID
          <input
            type="text"
            placeholder="nursing"
            value={programId}
            onChange={(e) => setProgramId(e.target.value)}
            required
          />
        </label>
        <label>
          Program Slug
          <input
            type="text"
            placeholder="nursing"
            value={programSlug}
            onChange={(e) => setProgramSlug(e.target.value)}
            required
          />
        </label>
        <label>
          Program Name
          <input
            type="text"
            placeholder="Nursing"
            value={programName}
            onChange={(e) => setProgramName(e.target.value)}
            required
          />
        </label>
        <button type="submit" className="admin-btn" disabled={saving}>
          {saving ? "Adding..." : "Add Program"}
        </button>
      </form>
    </div>
  );
}

// Create Admin Form
function CreateAdminForm({ clients }: { clients: Client[] }) {
  const [clientId, setClientId] = useState("");
  const [adminEmail, setAdminEmail] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMessage(null);

    try {
      const response = await fetch(`/api/super/clients/${clientId}/admin-user`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: adminEmail, password: adminPassword })
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || "Failed to create admin");
      }

      setMessage({ type: "success", text: "Admin user created successfully!" });
      setAdminEmail("");
      setAdminPassword("");
    } catch (error) {
      setMessage({ type: "error", text: (error as Error).message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="super-admin__form-card">
      <h3>Create Admin User</h3>
      {message && (
        <div className={`super-admin__message super-admin__message--${message.type}`}>
          {message.text}
        </div>
      )}
      <form className="super-admin__form" onSubmit={handleSubmit}>
        <label>
          Client
          <select value={clientId} onChange={(e) => setClientId(e.target.value)} required>
            <option value="">Select client...</option>
            {clients.map((client) => (
              <option key={client.id} value={client.id}>
                {client.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Email
          <input
            type="email"
            placeholder="admin@example.com"
            value={adminEmail}
            onChange={(e) => setAdminEmail(e.target.value)}
            required
          />
        </label>
        <label>
          Temporary Password
          <input
            type="password"
            placeholder="••••••••"
            value={adminPassword}
            onChange={(e) => setAdminPassword(e.target.value)}
            required
          />
        </label>
        <button type="submit" className="admin-btn" disabled={saving}>
          {saving ? "Creating..." : "Create Admin"}
        </button>
      </form>
    </div>
  );
}
