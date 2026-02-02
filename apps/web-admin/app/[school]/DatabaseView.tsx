"use client";

import { useEffect, useMemo, useState } from "react";

const STATUS_OPTIONS = ["received", "delivering", "delivered", "failed"] as const;

const EXPORT_FIELDS = [
  { key: "id", label: "Submission ID" },
  { key: "created_at", label: "Created At" },
  { key: "updated_at", label: "Updated At" },
  { key: "delivered_at", label: "Delivered At" },
  { key: "school_id", label: "School ID" },
  { key: "campus_id", label: "Campus ID" },
  { key: "program_id", label: "Program ID" },
  { key: "first_name", label: "First Name" },
  { key: "last_name", label: "Last Name" },
  { key: "email", label: "Email" },
  { key: "phone", label: "Phone" },
  { key: "status", label: "Status" },
  { key: "crm_lead_id", label: "CRM Lead ID" },
  { key: "last_step_completed", label: "Last Step Completed" },
  { key: "created_from_step", label: "Created From Step" },
  { key: "consented", label: "Consented" },
  { key: "consent_text_version", label: "Consent Text Version" },
  { key: "consent_timestamp", label: "Consent Timestamp" },
  { key: "idempotency_key", label: "Idempotency Key" },
  { key: "answers", label: "Answers (JSON)" },
  { key: "metadata", label: "Metadata (JSON)" }
];

const DEFAULT_EXPORT_FIELDS = new Set([
  "id",
  "created_at",
  "status",
  "first_name",
  "last_name",
  "email",
  "phone",
  "program_id",
  "campus_id",
  "crm_lead_id",
  "last_step_completed",
  "consented",
  "consent_timestamp"
]);

type SubmissionRow = {
  id: string;
  createdAt: string;
  updatedAt: string;
  deliveredAt: string | null;
  schoolId: string;
  campusId: string | null;
  programId: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  answers: Record<string, unknown>;
  metadata: Record<string, unknown>;
  status: string;
  idempotencyKey: string;
  consented: boolean;
  consentTextVersion: string;
  consentTimestamp: string;
  crmLeadId: string | null;
  lastStepCompleted: number | null;
  createdFromStep: number | null;
};

type DatabaseViewProps = {
  schoolSlug: string;
  apiBase: string;
  programs: { id: string; name: string }[];
  campuses: { id: string; name: string }[];
};

type FilterState = {
  q: string;
  status: string;
  programId: string;
  campusId: string;
  from: string;
  to: string;
};

const emptyFilters: FilterState = {
  q: "",
  status: "",
  programId: "",
  campusId: "",
  from: "",
  to: ""
};

function formatDate(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString();
}

function formatValue(value: unknown) {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return JSON.stringify(value, null, 2);
}

export function DatabaseView({ schoolSlug, apiBase, programs, campuses }: DatabaseViewProps) {
  const [filters, setFilters] = useState<FilterState>(emptyFilters);
  const [appliedFilters, setAppliedFilters] = useState<FilterState>(emptyFilters);
  const [viewMode, setViewMode] = useState<"table" | "cards">("table");
  const [limit, setLimit] = useState(25);
  const [offset, setOffset] = useState(0);
  const [rows, setRows] = useState<SubmissionRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [exportScope, setExportScope] = useState<"page" | "filtered">("page");
  const [exportFields, setExportFields] = useState<Set<string>>(new Set(DEFAULT_EXPORT_FIELDS));

  const headers = useMemo(() => ({} as Record<string, string>), []);

  const queryParams = useMemo(() => {
    const params = new URLSearchParams();
    if (appliedFilters.q) params.set("q", appliedFilters.q);
    if (appliedFilters.status) params.set("status", appliedFilters.status);
    if (appliedFilters.programId) params.set("programId", appliedFilters.programId);
    if (appliedFilters.campusId) params.set("campusId", appliedFilters.campusId);
    if (appliedFilters.from) params.set("from", appliedFilters.from);
    if (appliedFilters.to) params.set("to", appliedFilters.to);
    params.set("limit", String(limit));
    params.set("offset", String(offset));
    return params;
  }, [appliedFilters, limit, offset]);

  const pageCount = Math.max(Math.ceil(total / limit), 1);
  const currentPage = Math.floor(offset / limit) + 1;

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);

    const base = "/api";
    fetch(`${base}/admin/${schoolSlug}/submissions?${queryParams.toString()}`, {
      headers,
      credentials: "include",
      cache: "no-store"
    })
      .then(async (response) => {
        if (response.status === 401) {
          throw new Error("unauthorized");
        }
        if (response.status === 403) {
          throw new Error("forbidden");
        }
        if (!response.ok) {
          const message = await response.text();
          throw new Error(message || "Failed to load submissions");
        }
        return response.json();
      })
      .then((data) => {
        if (!active) return;
        setRows(data.rows || []);
        setTotal(Number(data.total || 0));
      })
      .catch((err: Error) => {
        if (!active) return;
        if (err.message === "unauthorized") {
          window.location.href = `/admin/${schoolSlug}/login`;
          return;
        }
        if (err.message === "forbidden") {
          window.location.href = `/admin/${schoolSlug}/login`;
          return;
        }
        setError(err.message);
      })
      .finally(() => {
        if (!active) return;
        setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [apiBase, schoolSlug, queryParams, headers]);

  const applyFilters = () => {
    setAppliedFilters(filters);
    setOffset(0);
  };

  const clearFilters = () => {
    setFilters(emptyFilters);
    setAppliedFilters(emptyFilters);
    setOffset(0);
  };

  const toggleExportField = (field: string) => {
    setExportFields((prev) => {
      const next = new Set(prev);
      if (next.has(field)) {
        next.delete(field);
      } else {
        next.add(field);
      }
      return next;
    });
  };

  const handleExport = async () => {
    const params = new URLSearchParams();
    if (appliedFilters.q) params.set("q", appliedFilters.q);
    if (appliedFilters.status) params.set("status", appliedFilters.status);
    if (appliedFilters.programId) params.set("programId", appliedFilters.programId);
    if (appliedFilters.campusId) params.set("campusId", appliedFilters.campusId);
    if (appliedFilters.from) params.set("from", appliedFilters.from);
    if (appliedFilters.to) params.set("to", appliedFilters.to);

    const fieldList = Array.from(exportFields);
    if (fieldList.length > 0) {
      params.set("fields", fieldList.join(","));
    }

    if (exportScope === "page") {
      params.set("limit", String(limit));
      params.set("offset", String(offset));
    }

    const response = await fetch(
      `/api/admin/schools/${schoolSlug}/submissions/export?${params.toString()}`,
      {
        headers,
        credentials: "include",
        cache: "no-store"
      }
    );

    if (!response.ok) {
      const message = await response.text();
      throw new Error(message || "Export failed");
    }

    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${schoolSlug}-submissions-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  };

  const renderAnswers = (answers: Record<string, unknown>) => {
    const entries = Object.entries(answers || {});
    if (entries.length === 0) return <span className="admin-muted">No answers yet.</span>;

    return (
      <ul className="admin-db__list">
        {entries.map(([key, value]) => (
          <li key={key}>
            <strong>{key.replace(/_/g, " ")}</strong>
            <span>{formatValue(value)}</span>
          </li>
        ))}
      </ul>
    );
  };

  const renderMetadata = (metadata: Record<string, unknown>) => {
    const entries = Object.entries(metadata || {});
    if (entries.length === 0) return <span className="admin-muted">No metadata captured.</span>;

    return (
      <ul className="admin-db__list">
        {entries.map(([key, value]) => (
          <li key={key}>
            <strong>{key.replace(/_/g, " ")}</strong>
            <span>{formatValue(value)}</span>
          </li>
        ))}
      </ul>
    );
  };

  const renderDetails = (row: SubmissionRow) => {
    return (
      <div className="admin-db__details">
        <div>
          <h4>Contact</h4>
          <p>{row.firstName} {row.lastName}</p>
          <p>{row.email}</p>
          <p>{row.phone || "—"}</p>
        </div>
        <div>
          <h4>Routing</h4>
          <p>Program: {programs.find((program) => program.id === row.programId)?.name || row.programId}</p>
          <p>Campus: {row.campusId ? campuses.find((campus) => campus.id === row.campusId)?.name || row.campusId : "Unspecified campus"}</p>
          <p>Status: {row.status}</p>
          <p>Last step: {row.lastStepCompleted ?? "—"}</p>
          <p>CRM Lead: {row.crmLeadId || "—"}</p>
        </div>
        <div>
          <h4>Consent</h4>
          <p>Consented: {row.consented ? "Yes" : "No"}</p>
          <p>Timestamp: {formatDate(row.consentTimestamp)}</p>
          <p>Version: {row.consentTextVersion}</p>
        </div>
        <div>
          <h4>System</h4>
          <p>Submission ID: {row.id}</p>
          <p>Idempotency: {row.idempotencyKey}</p>
          <p>Created: {formatDate(row.createdAt)}</p>
          <p>Updated: {formatDate(row.updatedAt)}</p>
          <p>Delivered: {formatDate(row.deliveredAt)}</p>
        </div>
        <div className="admin-db__panel">
          <h4>Answers</h4>
          {renderAnswers(row.answers)}
        </div>
        <div className="admin-db__panel">
          <h4>Metadata</h4>
          {renderMetadata(row.metadata)}
        </div>
      </div>
    );
  };

  return (
    <div className="admin-db">
      <section className="admin-card">
        <div className="admin-db__controls">
          <div className="admin-db__filters">
            <label>
              Search
              <input
                type="search"
                value={filters.q}
                onChange={(event) => setFilters((prev) => ({ ...prev, q: event.target.value }))}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    applyFilters();
                  }
                }}
                placeholder="Name, email, phone"
              />
            </label>
            <label>
              Status
              <select
                value={filters.status}
                onChange={(event) => setFilters((prev) => ({ ...prev, status: event.target.value }))}
              >
                <option value="">All</option>
                {STATUS_OPTIONS.map((status) => (
                  <option key={status} value={status}>{status}</option>
                ))}
              </select>
            </label>
            <label>
              Program
              <select
                value={filters.programId}
                onChange={(event) => setFilters((prev) => ({ ...prev, programId: event.target.value }))}
              >
                <option value="">All</option>
                {programs.map((program) => (
                  <option key={program.id} value={program.id}>{program.name}</option>
                ))}
              </select>
            </label>
            <label>
              Campus
              <select
                value={filters.campusId}
                onChange={(event) => setFilters((prev) => ({ ...prev, campusId: event.target.value }))}
              >
                <option value="">All</option>
                <option value="__null__">Unspecified campus</option>
                {campuses.map((campus) => (
                  <option key={campus.id} value={campus.id}>{campus.name}</option>
                ))}
              </select>
            </label>
            <label>
              From
              <input
                type="date"
                value={filters.from}
                onChange={(event) => setFilters((prev) => ({ ...prev, from: event.target.value }))}
              />
            </label>
            <label>
              To
              <input
                type="date"
                value={filters.to}
                onChange={(event) => setFilters((prev) => ({ ...prev, to: event.target.value }))}
              />
            </label>
          </div>
          <div className="admin-db__actions">
            <button className="admin-btn" onClick={applyFilters}>Apply filters</button>
            <button className="admin-official__ghost" onClick={clearFilters}>Clear</button>
            <button className="admin-official__ghost" onClick={() => setExportOpen(true)}>Export CSV</button>
          </div>
        </div>

        <div className="admin-db__layout-options">
          <button
            className={`admin-db__layout-card ${viewMode === "table" ? "is-active" : ""}`}
            onClick={() => setViewMode("table")}
          >
            <div className="admin-db__layout-preview admin-db__layout-preview--table" />
            <div>
              <strong>Layout A</strong>
              <span className="admin-muted">Table + expandable details</span>
            </div>
          </button>
          <button
            className={`admin-db__layout-card ${viewMode === "cards" ? "is-active" : ""}`}
            onClick={() => setViewMode("cards")}
          >
            <div className="admin-db__layout-preview admin-db__layout-preview--cards" />
            <div>
              <strong>Layout B</strong>
              <span className="admin-muted">Detail cards</span>
            </div>
          </button>
        </div>

        <div className="admin-db__summary">
          <span className="admin-muted">Total submissions: {total}</span>
          <span className="admin-muted">Page {currentPage} of {pageCount}</span>
          <label>
            Rows
            <select
              value={limit}
              onChange={(event) => {
                setLimit(Number(event.target.value));
                setOffset(0);
              }}
            >
              {[25, 50, 100].map((option) => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>
          </label>
        </div>
      </section>

      <section className="admin-card">
        {loading && <p className="admin-muted">Loading submissions…</p>}
        {error && <p className="admin-muted">Unable to load submissions: {error}</p>}
        {!loading && !error && rows.length === 0 && (
          <p className="admin-muted">No submissions found for this filter.</p>
        )}

        {!loading && rows.length > 0 && viewMode === "table" && (
          <div className="admin-db__table-wrapper">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Phone</th>
                  <th>Program</th>
                  <th>Campus</th>
                  <th>Status</th>
                  <th>Step</th>
                  <th>Created</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const programName = programs.find((program) => program.id === row.programId)?.name || row.programId;
                  const campusName = row.campusId
                    ? campuses.find((campus) => campus.id === row.campusId)?.name || row.campusId
                    : "Unspecified campus";

                  return (
                    <tr key={row.id}>
                      <td>{row.firstName} {row.lastName}</td>
                      <td>{row.email}</td>
                      <td>{row.phone || "—"}</td>
                      <td>{programName}</td>
                      <td>{campusName}</td>
                      <td><span className={`admin-status admin-status--${row.status}`}>{row.status}</span></td>
                      <td>{row.lastStepCompleted ?? "—"}</td>
                      <td>{formatDate(row.createdAt)}</td>
                      <td>
                        <button
                          className="admin-official__ghost"
                          onClick={() => setExpandedId((prev) => (prev === row.id ? null : row.id))}
                        >
                          {expandedId === row.id ? "Hide" : "Details"}
                        </button>
                      </td>
                    </tr>
                  );
                })}
                {expandedId && rows.some((row) => row.id === expandedId) && (
                  <tr className="admin-db__detail-row">
                    <td colSpan={9}>{renderDetails(rows.find((row) => row.id === expandedId)!)}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {!loading && rows.length > 0 && viewMode === "cards" && (
          <div className="admin-db__cards">
            {rows.map((row) => (
              <article key={row.id} className="admin-db__card">
                <div className="admin-db__card-header">
                  <div>
                    <h4>{row.firstName} {row.lastName}</h4>
                    <p className="admin-muted">{row.email} · {row.phone || "—"}</p>
                  </div>
                  <span className={`admin-status admin-status--${row.status}`}>{row.status}</span>
                </div>
                <div className="admin-db__card-grid">
                  <div>
                    <p className="admin-muted">Program</p>
                    <strong>{programs.find((program) => program.id === row.programId)?.name || row.programId}</strong>
                  </div>
                  <div>
                    <p className="admin-muted">Campus</p>
                    <strong>{row.campusId ? campuses.find((campus) => campus.id === row.campusId)?.name || row.campusId : "Unspecified"}</strong>
                  </div>
                  <div>
                    <p className="admin-muted">Last step</p>
                    <strong>{row.lastStepCompleted ?? "—"}</strong>
                  </div>
                  <div>
                    <p className="admin-muted">Created</p>
                    <strong>{formatDate(row.createdAt)}</strong>
                  </div>
                </div>
                <div className="admin-db__card-detail">
                  <div>
                    <h5>Consent</h5>
                    <p>{row.consented ? "Consented" : "Not consented"}</p>
                    <p className="admin-muted">{formatDate(row.consentTimestamp)}</p>
                    <p className="admin-muted">{row.consentTextVersion}</p>
                  </div>
                  <div>
                    <h5>System</h5>
                    <p>CRM Lead: {row.crmLeadId || "—"}</p>
                    <p className="admin-muted">Updated: {formatDate(row.updatedAt)}</p>
                    <p className="admin-muted">Delivered: {formatDate(row.deliveredAt)}</p>
                  </div>
                </div>
                <details className="admin-db__card-panel">
                  <summary>Answers</summary>
                  {renderAnswers(row.answers)}
                </details>
                <details className="admin-db__card-panel">
                  <summary>Metadata</summary>
                  {renderMetadata(row.metadata)}
                </details>
              </article>
            ))}
          </div>
        )}

        <div className="admin-db__pagination">
          <button
            className="admin-official__ghost"
            onClick={() => setOffset((prev) => Math.max(prev - limit, 0))}
            disabled={offset === 0}
          >
            Previous
          </button>
          <span className="admin-muted">Page {currentPage} of {pageCount}</span>
          <button
            className="admin-official__ghost"
            onClick={() => setOffset((prev) => Math.min(prev + limit, (pageCount - 1) * limit))}
            disabled={currentPage >= pageCount}
          >
            Next
          </button>
        </div>
      </section>

      {exportOpen && (
        <div className="admin-db__modal">
          <div className="admin-db__modal-card">
            <div className="admin-db__modal-header">
              <h3>Export CSV</h3>
              <button className="admin-official__ghost" onClick={() => setExportOpen(false)}>Close</button>
            </div>
            <div className="admin-db__modal-body">
              <div className="admin-db__export-scope">
                <label>
                  <input
                    type="radio"
                    name="exportScope"
                    checked={exportScope === "page"}
                    onChange={() => setExportScope("page")}
                  />
                  Current page ({rows.length} rows)
                </label>
                <label>
                  <input
                    type="radio"
                    name="exportScope"
                    checked={exportScope === "filtered"}
                    onChange={() => setExportScope("filtered")}
                  />
                  All filtered results (up to 1000 rows)
                </label>
              </div>

              <div className="admin-db__export-fields">
                {EXPORT_FIELDS.map((field) => (
                  <label key={field.key}>
                    <input
                      type="checkbox"
                      checked={exportFields.has(field.key)}
                      onChange={() => toggleExportField(field.key)}
                    />
                    {field.label}
                  </label>
                ))}
              </div>
            </div>
            <div className="admin-db__modal-actions">
              <button
                className="admin-btn"
                onClick={() => {
                  handleExport().catch((err) => {
                    setError(err.message || "Export failed");
                  });
                }}
              >
                Download CSV
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
