"use client";

import { useEffect, useRef, useState } from "react";
import { ConfigBuilderPage } from "../[school]/config/ConfigBuilderPage";
import { QuizBuilderPage } from "../[school]/quiz/QuizBuilderPage";
import { SuperAdminQuizPage } from "./SuperAdminQuizPage";
import "./super-admin.css";

type Category = {
  id: string;
  name: string;
  slug: string;
};

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
  categories: Category[];
};

type Program = {
  id: string;
  slug: string;
  name: string;
  category_id?: string | null;
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
  const [treeLoading, setTreeLoading] = useState(false);

  const refreshTree = async () => {
    setTreeLoading(true);
    try {
      const res = await fetch("/api/super/tree", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to refresh tree");
      const data = await res.json();
      setClients(data.clients || []);
    } catch (error) {
      console.error(error);
    } finally {
      setTreeLoading(false);
    }
  };

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
          {treeLoading && <div className="admin-muted">Refreshing…</div>}

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
              onRefreshTree={refreshTree}
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
  setDetailTab,
  onRefreshTree
}: {
  entity: any;
  clients: Client[];
  detailTab: "overview" | "config" | "quiz" | "audit";
  setDetailTab: (value: "overview" | "config" | "quiz" | "audit") => void;
  onRefreshTree: () => Promise<void>;
}) {
  // Find the entity details
  let entityDetails: any = null;
  if (entity.type === "client") {
    entityDetails = clients.find((c) => c.id === entity.id);
  } else if (entity.type === "school") {
    for (const client of clients) {
      const school = client.schools.find((s) => s.id === entity.id);
      if (school) {
        entityDetails = { ...school, clientName: client.name, clientId: client.id };
        break;
      }
    }
  } else if (entity.type === "program") {
    for (const client of clients) {
      for (const school of client.schools) {
        const program = school.programs.find((p) => p.id === entity.id);
        if (program) {
          entityDetails = {
            ...program,
            schoolName: school.name,
            clientName: client.name,
            clientId: client.id,
            schoolId: school.id,
            categories: school.categories || []
          };
          break;
        }
      }
    }
  }

  const [detail, setDetail] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});

  const updateDetail = (updates: Record<string, any>) => {
    setDetail((prev: any) => ({ ...(prev || {}), ...updates }));
    // Clear validation errors for updated fields
    const updatedKeys = Object.keys(updates);
    setValidationErrors((prev) => {
      const next = { ...prev };
      updatedKeys.forEach((key) => delete next[key]);
      return next;
    });
  };

  const validateDetail = () => {
    const errors: Record<string, string> = {};

    if (!detail?.name?.trim()) {
      errors.name = "Name is required";
    }

    if (entity.type !== "client" && !detail?.slug?.trim()) {
      errors.slug = "Slug is required";
    }

    if (entity.type !== "client" && detail?.slug && !/^[a-z0-9-]+$/.test(detail.slug)) {
      errors.slug = "Slug must contain only lowercase letters, numbers, and hyphens";
    }

    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const saveDetail = async () => {
    if (!detail || !entityDetails) return;

    // Validate before saving
    if (!validateDetail()) {
      setMessage({ type: "error", text: "Please fix the errors before saving" });
      return;
    }

    setSaving(true);
    setMessage(null);

    try {
      let url = "";
      let payload: Record<string, any> = {};
      if (entity.type === "client") {
        url = `/api/super/clients/${entityDetails.id}`;
        payload = { name: detail.name };
      } else if (entity.type === "school") {
        url = `/api/super/clients/${entityDetails.clientId}/schools/${entityDetails.id}`;
        payload = {
          name: detail.name,
          slug: detail.slug,
          crmConnectionId: detail.crmConnectionId,
          branding: detail.branding,
          compliance: detail.compliance,
          thankYou: detail.thankYou,
          disqualificationConfig: detail.disqualificationConfig
        };
      } else if (entity.type === "program") {
        url = `/api/super/clients/${entityDetails.clientId}/programs/${entityDetails.id}`;
        payload = {
          name: detail.name,
          slug: detail.slug,
          templateType: detail.templateType || "full",
          categoryId: detail.category_id || null
        };
      }

      const res = await fetch(url, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      if (!res.ok) throw new Error("Failed to save changes");
      const data = await res.json();
      setDetail((prev: any) => ({ ...(prev || {}), ...data }));
      setMessage({ type: "success", text: "Changes saved." });
      await onRefreshTree();
    } catch (error) {
      console.error(error);
      setMessage({ type: "error", text: "Failed to save changes." });
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    // Clear detail immediately when entity changes
    setDetail(null);
    setLoading(true);
    setMessage(null);
    setValidationErrors({});

    const fetchDetail = async () => {
      if (!entityDetails) {
        setLoading(false);
        return;
      }

      try {
        let url = "";
        if (entity.type === "client") {
          url = `/api/super/clients/${entityDetails.id}`;
        } else if (entity.type === "school") {
          url = `/api/super/clients/${entityDetails.clientId}/schools/${entityDetails.id}`;
        } else if (entity.type === "program") {
          url = `/api/super/clients/${entityDetails.clientId}/programs/${entityDetails.id}`;
        }

        const res = await fetch(url, { credentials: "include" });
        if (!res.ok) throw new Error("Failed to load details");
        const data = await res.json();
        let nextDetail =
          entity.type === "client"
            ? data.client
            : entity.type === "school"
              ? data.school
              : data.program;

        if (entity.type === "school" && nextDetail) {
          nextDetail = {
            ...nextDetail,
            crmConnectionId: nextDetail.crm_connection_id,
            thankYou: nextDetail.thank_you,
            branding: nextDetail.branding || {},
            compliance: nextDetail.compliance || {},
            disqualificationConfig: nextDetail.disqualification_config || {}
          };
        }
        if (entity.type === "program" && nextDetail) {
          nextDetail = {
            ...nextDetail,
            templateType: nextDetail.template_type,
            category_id: nextDetail.category_id
          };
        }

        setDetail(nextDetail || null);
      } catch (error) {
        console.error(error);
        setMessage({ type: "error", text: "Failed to load details" });
        setDetail(null);
      } finally {
        setLoading(false);
      }
    };

    fetchDetail();
  }, [entity.type, entity.id]);

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
        {(["overview", "config", "quiz", "audit"] as const)
          .filter((tab) => {
            // Client: Overview and Audit only
            if (entity.type === "client") {
              return tab === "overview" || tab === "audit";
            }
            // School: Overview, Quiz, and Audit
            if (entity.type === "school") {
              return tab === "overview" || tab === "quiz" || tab === "audit";
            }
            // Program: Overview, Config, and Audit
            if (entity.type === "program") {
              return tab === "overview" || tab === "config" || tab === "audit";
            }
            return true;
          })
          .map((tab) => (
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
          <>
            {/* Sticky Save Bar */}
            {detail && (
              <div className={`super-admin__save-bar ${message ? "has-message" : ""}`}>
                {message && (
                  <div className={`super-admin__save-message super-admin__save-message--${message.type}`}>
                    {message.text}
                  </div>
                )}
                <div className="super-admin__save-actions">
                  <button
                    className="super-admin__btn super-admin__btn--primary"
                    onClick={saveDetail}
                    disabled={saving}
                  >
                    {saving ? "Saving..." : "Save Changes"}
                  </button>
                  <button
                    className="super-admin__btn super-admin__btn--ghost"
                    onClick={() => {
                      if (entityDetails) {
                        const fetchDetail = async () => {
                          setLoading(true);
                          setValidationErrors({});
                          try {
                            let url = "";
                            if (entity.type === "client") {
                              url = `/api/super/clients/${entityDetails.id}`;
                            } else if (entity.type === "school") {
                              url = `/api/super/clients/${entityDetails.clientId}/schools/${entityDetails.id}`;
                            } else if (entity.type === "program") {
                              url = `/api/super/clients/${entityDetails.clientId}/programs/${entityDetails.id}`;
                            }
                            const res = await fetch(url, { credentials: "include" });
                            if (!res.ok) throw new Error("Failed to reload");
                            const data = await res.json();
                            let nextDetail = entity.type === "client" ? data.client : entity.type === "school" ? data.school : data.program;
                            if (entity.type === "school" && nextDetail) {
                              nextDetail = {
                                ...nextDetail,
                                crmConnectionId: nextDetail.crm_connection_id,
                                thankYou: nextDetail.thank_you,
                                branding: nextDetail.branding || {},
                                compliance: nextDetail.compliance || {}
                              };
                            }
                            if (entity.type === "program" && nextDetail) {
                              nextDetail = {
                                ...nextDetail,
                                templateType: nextDetail.template_type
                              };
                            }
                            setDetail(nextDetail);
                            setMessage(null);
                          } catch (error) {
                            console.error(error);
                          } finally {
                            setLoading(false);
                          }
                        };
                        fetchDetail();
                      }
                    }}
                    disabled={saving}
                  >
                    Discard Changes
                  </button>
                </div>
              </div>
            )}

            <div className="super-admin__details">
              {loading && (
                <div className="super-admin__skeleton">
                  <div className="super-admin__skeleton-card"></div>
                  <div className="super-admin__skeleton-card"></div>
                  <div className="super-admin__skeleton-card"></div>
                </div>
              )}

              {!loading && detail && (
                <>
                  {/* Basic Information Section */}
                  <div className="super-admin__section">
                    <h3 className="super-admin__section-title">Basic Information</h3>
                    <div className="super-admin__section-content">
                      <div className="super-admin__field">
                        <label className="super-admin__label">
                          ID
                          <span className="super-admin__label-badge">Read-only</span>
                        </label>
                        <div className="super-admin__value">{entity.id}</div>
                      </div>

                      <div className="super-admin__field">
                        <label className="super-admin__label">
                          Name
                          <span className="super-admin__label-required">*</span>
                        </label>
                        <input
                          className={`super-admin__input ${validationErrors.name ? "is-invalid" : ""}`}
                          value={detail.name || ""}
                          onChange={(event) => updateDetail({ name: event.target.value })}
                          placeholder="Enter name"
                        />
                        {validationErrors.name && (
                          <span className="super-admin__field-error">{validationErrors.name}</span>
                        )}
                      </div>

                      {entity.type !== "client" && (
                        <div className="super-admin__field">
                          <label className="super-admin__label">
                            Slug
                            <span className="super-admin__label-required">*</span>
                          </label>
                          <input
                            className={`super-admin__input ${validationErrors.slug ? "is-invalid" : ""}`}
                            value={detail.slug || ""}
                            onChange={(event) => updateDetail({ slug: event.target.value })}
                            placeholder="url-friendly-slug"
                          />
                          <span className="super-admin__help">Used in URLs (lowercase, hyphens only)</span>
                          {validationErrors.slug && (
                            <span className="super-admin__field-error">{validationErrors.slug}</span>
                          )}
                        </div>
                      )}

                      {entity.type === "client" && (
                        <>
                          <div className="super-admin__field">
                            <label className="super-admin__label">Schools</label>
                            <div className="super-admin__value">{entityDetails.schools.length}</div>
                          </div>
                          <div className="super-admin__field">
                            <label className="super-admin__label">Total Programs</label>
                            <div className="super-admin__value">
                              {entityDetails.schools.reduce((sum: number, s: School) => sum + s.programs.length, 0)}
                            </div>
                          </div>
                        </>
                      )}

                      {entity.type === "school" && (
                        <>
                          <div className="super-admin__field">
                            <label className="super-admin__label">Client</label>
                            <div className="super-admin__value">{entityDetails.clientName}</div>
                          </div>
                          <div className="super-admin__field">
                            <label className="super-admin__label">Programs</label>
                            <div className="super-admin__value">{entityDetails.programs.length}</div>
                          </div>
                          <div className="super-admin__field">
                            <label className="super-admin__label">CRM Connection ID</label>
                            <input
                              className="super-admin__input"
                              value={detail.crmConnectionId || ""}
                              onChange={(event) => updateDetail({ crmConnectionId: event.target.value })}
                              placeholder="crm-connection-id"
                            />
                          </div>
                        </>
                      )}

                      {entity.type === "program" && (
                        <>
                          <div className="super-admin__field">
                            <label className="super-admin__label">School</label>
                            <div className="super-admin__value">{entityDetails.schoolName}</div>
                          </div>
                          <div className="super-admin__field">
                            <label className="super-admin__label">Client</label>
                            <div className="super-admin__value">{entityDetails.clientName}</div>
                          </div>
                          <div className="super-admin__field">
                            <label className="super-admin__label">Program Category</label>
                            <select
                              className="super-admin__input"
                              value={detail.category_id || ""}
                              onChange={(event) => updateDetail({ category_id: event.target.value || null })}
                            >
                              <option value="">No Category</option>
                              {(entityDetails.categories || []).map((cat: any) => (
                                <option key={cat.id} value={cat.id}>
                                  {cat.name} ({cat.slug})
                                </option>
                              ))}
                            </select>
                            <span className="super-admin__help">Assign this program to a category for quiz routing</span>
                          </div>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Branding Section - Schools Only */}
                  {entity.type === "school" && (
                    <div className="super-admin__section">
                      <h3 className="super-admin__section-title">Branding</h3>
                      <div className="super-admin__section-content">
                        <div className="super-admin__field">
                          <label className="super-admin__label">Logo URL</label>
                          <div className="super-admin__field-with-preview">
                            <input
                              className="super-admin__input"
                              value={detail.branding?.logoUrl || ""}
                              onChange={(event) =>
                                updateDetail({
                                  branding: { ...(detail.branding || {}), logoUrl: event.target.value }
                                })
                              }
                              placeholder="https://cdn.example.com/logo.png"
                            />
                            {detail.branding?.logoUrl && (
                              <div className="super-admin__logo-preview">
                                <img src={detail.branding.logoUrl} alt="Logo preview" />
                              </div>
                            )}
                          </div>
                          <span className="super-admin__help">Upload to S3 or CDN first, then paste URL here</span>
                        </div>

                        <div className="super-admin__field-group">
                          <div className="super-admin__field">
                            <label className="super-admin__label">Primary Color</label>
                            <div className="super-admin__color-input">
                              <input
                                type="color"
                                className="super-admin__color-picker"
                                value={detail.branding?.colors?.primary || "#0e7490"}
                                onChange={(event) =>
                                  updateDetail({
                                    branding: {
                                      ...(detail.branding || {}),
                                      colors: { ...(detail.branding?.colors || {}), primary: event.target.value }
                                    }
                                  })
                                }
                              />
                              <input
                                className="super-admin__input"
                                value={detail.branding?.colors?.primary || ""}
                                onChange={(event) =>
                                  updateDetail({
                                    branding: {
                                      ...(detail.branding || {}),
                                      colors: { ...(detail.branding?.colors || {}), primary: event.target.value }
                                    }
                                  })
                                }
                                placeholder="#0e7490"
                              />
                            </div>
                          </div>

                          <div className="super-admin__field">
                            <label className="super-admin__label">Secondary Color</label>
                            <div className="super-admin__color-input">
                              <input
                                type="color"
                                className="super-admin__color-picker"
                                value={detail.branding?.colors?.secondary || "#64748b"}
                                onChange={(event) =>
                                  updateDetail({
                                    branding: {
                                      ...(detail.branding || {}),
                                      colors: { ...(detail.branding?.colors || {}), secondary: event.target.value }
                                    }
                                  })
                                }
                              />
                              <input
                                className="super-admin__input"
                                value={detail.branding?.colors?.secondary || ""}
                                onChange={(event) =>
                                  updateDetail({
                                    branding: {
                                      ...(detail.branding || {}),
                                      colors: { ...(detail.branding?.colors || {}), secondary: event.target.value }
                                    }
                                  })
                                }
                                placeholder="#64748b"
                              />
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Compliance Section - Schools Only */}
                  {entity.type === "school" && (
                    <div className="super-admin__section">
                      <h3 className="super-admin__section-title">Compliance</h3>
                      <div className="super-admin__section-content">
                        <div className="super-admin__field">
                          <label className="super-admin__label">Disclaimer Text</label>
                          <textarea
                            className="super-admin__textarea"
                            rows={4}
                            value={detail.compliance?.disclaimerText || ""}
                            onChange={(event) =>
                              updateDetail({
                                compliance: {
                                  ...(detail.compliance || {}),
                                  disclaimerText: event.target.value
                                }
                              })
                            }
                            placeholder="Enter compliance disclaimer text"
                          />
                        </div>

                        <div className="super-admin__field">
                          <label className="super-admin__label">Version</label>
                          <input
                            className="super-admin__input"
                            value={detail.compliance?.version || ""}
                            onChange={(event) =>
                              updateDetail({
                                compliance: { ...(detail.compliance || {}), version: event.target.value }
                              })
                            }
                            placeholder="1.0"
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Thank You Page Section - Schools Only */}
                  {entity.type === "school" && (
                    <div className="super-admin__section">
                      <h3 className="super-admin__section-title">Thank You Page</h3>
                      <div className="super-admin__section-content">
                        <div className="super-admin__field">
                          <label className="super-admin__label">Title</label>
                          <input
                            className="super-admin__input"
                            value={detail.thankYou?.title || ""}
                            onChange={(event) =>
                              updateDetail({
                                thankYou: { ...(detail.thankYou || {}), title: event.target.value }
                              })
                            }
                            placeholder="Thank You!"
                          />
                        </div>

                        <div className="super-admin__field">
                          <label className="super-admin__label">Message</label>
                          <input
                            className="super-admin__input"
                            value={detail.thankYou?.message || ""}
                            onChange={(event) =>
                              updateDetail({
                                thankYou: { ...(detail.thankYou || {}), message: event.target.value }
                              })
                            }
                            placeholder="We've received your information"
                          />
                        </div>

                        <div className="super-admin__field">
                          <label className="super-admin__label">Body</label>
                          <textarea
                            className="super-admin__textarea"
                            rows={3}
                            value={detail.thankYou?.body || ""}
                            onChange={(event) =>
                              updateDetail({
                                thankYou: { ...(detail.thankYou || {}), body: event.target.value }
                              })
                            }
                            placeholder="An admissions counselor will contact you shortly..."
                          />
                        </div>

                        <div className="super-admin__field-group">
                          <div className="super-admin__field">
                            <label className="super-admin__label">CTA Button Text</label>
                            <input
                              className="super-admin__input"
                              value={detail.thankYou?.ctaText || ""}
                              onChange={(event) =>
                                updateDetail({
                                  thankYou: { ...(detail.thankYou || {}), ctaText: event.target.value }
                                })
                              }
                              placeholder="Back to Home"
                            />
                          </div>

                          <div className="super-admin__field">
                            <label className="super-admin__label">CTA Button URL</label>
                            <input
                              className="super-admin__input"
                              value={detail.thankYou?.ctaUrl || ""}
                              onChange={(event) =>
                                updateDetail({
                                  thankYou: { ...(detail.thankYou || {}), ctaUrl: event.target.value }
                                })
                              }
                              placeholder="https://example.com"
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Disqualification Configuration - Schools Only */}
                  {entity.type === "school" && (
                    <div className="super-admin__section">
                      <h3 className="super-admin__section-title">Disqualification Page</h3>
                      <div className="super-admin__section-content">
                        <div className="super-admin__field">
                          <label className="super-admin__label">Headline</label>
                          <input
                            className="super-admin__input"
                            value={detail.disqualificationConfig?.headline || ""}
                            onChange={(event) =>
                              updateDetail({
                                disqualificationConfig: {
                                  ...(detail.disqualificationConfig || {}),
                                  headline: event.target.value
                                }
                              })
                            }
                            placeholder="Thank you for your interest"
                          />
                        </div>

                        <div className="super-admin__field">
                          <label className="super-admin__label">Subheadline</label>
                          <input
                            className="super-admin__input"
                            value={detail.disqualificationConfig?.subheadline || ""}
                            onChange={(event) =>
                              updateDetail({
                                disqualificationConfig: {
                                  ...(detail.disqualificationConfig || {}),
                                  subheadline: event.target.value
                                }
                              })
                            }
                            placeholder="Unfortunately, we are unable to process your application at this time"
                          />
                        </div>

                        <div className="super-admin__field">
                          <label className="super-admin__label">Message</label>
                          <textarea
                            className="super-admin__textarea"
                            rows={3}
                            value={detail.disqualificationConfig?.text || ""}
                            onChange={(event) =>
                              updateDetail({
                                disqualificationConfig: {
                                  ...(detail.disqualificationConfig || {}),
                                  text: event.target.value
                                }
                              })
                            }
                            placeholder="Please contact us if you have any questions."
                          />
                        </div>

                        <div className="super-admin__field">
                          <label className="super-admin__label">Link URL (Optional)</label>
                          <input
                            className="super-admin__input"
                            value={detail.disqualificationConfig?.link || ""}
                            onChange={(event) =>
                              updateDetail({
                                disqualificationConfig: {
                                  ...(detail.disqualificationConfig || {}),
                                  link: event.target.value
                                }
                              })
                            }
                            placeholder="https://example.com/contact"
                          />
                          <span className="super-admin__help">
                            Optional link for disqualified users to contact support
                          </span>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Program Configuration - Programs Only */}
                  {entity.type === "program" && (
                    <div className="super-admin__section">
                      <h3 className="super-admin__section-title">Program Configuration</h3>
                      <div className="super-admin__section-content">
                        <div className="super-admin__field">
                          <label className="super-admin__label">Template Type</label>
                          <select
                            className="super-admin__input"
                            value={detail.templateType || "full"}
                            onChange={(event) => updateDetail({ templateType: event.target.value })}
                          >
                            <option value="full">Full - All sections visible</option>
                            <option value="minimal">Minimal - Hero and form only</option>
                          </select>
                        </div>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </>
        )}

        {detailTab === "config" && schoolContext && (
          <div className="super-admin__config-wrapper">
            <ConfigBuilderPage schoolSlug={schoolContext.school.slug} programs={schoolContext.programs} />
          </div>
        )}

        {detailTab === "quiz" && entity.type === "school" && entityDetails && (
          <SuperAdminQuizPage schoolId={entityDetails.id} />
        )}

        {detailTab === "audit" && (
          <div className="super-admin__section">
            <div className="super-admin__section-content">
              <div className="super-admin__empty-state">
                <div className="super-admin__empty-icon">📋</div>
                <h3>Audit Log</h3>
                <p>Activity history and change logs will appear here.</p>
              </div>
            </div>
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
