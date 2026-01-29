import { loadConfig } from "@lead_lander/config-schema";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import "./styles.css";
import { resolveConfigDir } from "../../../lib/configDir";

export const dynamic = "force-dynamic";

type MetricsResponse = {
  summary: {
    leads: number;
    delivered: number;
    failed: number;
    delivering: number;
    received: number;
    maxStep: number;
  };
  steps: { step: number; count: number }[];
  performance: { campusId: string | null; programId: string; leads: number; delivered: number; failed: number }[];
  snapshots: { id: string; email: string; status: string; crmLeadId: string | null; updatedAt: string }[];
};

export default async function AdminAccount({ params }: { params: { school: string } }) {
  const config = loadConfig(resolveConfigDir());
  const school = config.schools.find((item) => item.slug === params.school);

  if (!school) {
    return (
      <div className="admin-shell">
        <div className="admin-card">
          <h2>Account not found</h2>
          <p className="admin-muted">Check the URL or configuration.</p>
        </div>
      </div>
    );
  }

  const campuses = config.campuses.filter((campus) => campus.schoolId === school.id);
  const programs = config.programs.filter((program) => program.schoolId === school.id);

  const apiBase =
    process.env.ADMIN_API_BASE_URL ||
    process.env.NEXT_PUBLIC_API_BASE_URL ||
    "http://localhost:4000";
  const requestHeaders = headers();
  const cookie = requestHeaders.get("cookie");
  const authHeaders: Record<string, string> = cookie ? { cookie } : {};

  let metrics: MetricsResponse | null = null;
  let metricsError: string | null = null;

  try {
    const response = await fetch(`${apiBase}/api/admin/${school.slug}/metrics`, {
      credentials: "include",
      headers: authHeaders,
      cache: "no-store"
    });

    if (response.status === 401) {
      redirect(`/admin/${school.slug}/login`);
    }

    if (!response.ok) {
      const message = await response.text();
      throw new Error(message || "Failed to load metrics");
    }

    metrics = (await response.json()) as MetricsResponse;
  } catch (error) {
    metricsError = (error as Error).message;
  }

  const summary = metrics?.summary || {
    leads: 0,
    delivered: 0,
    failed: 0,
    delivering: 0,
    received: 0,
    maxStep: 3
  };

  const steps = metrics?.steps || [];
  const performance = metrics?.performance || [];
  const snapshots = metrics?.snapshots || [];

  const leads = summary.leads;
  const delivered = summary.delivered;
  const failed = summary.failed;
  const delivering = summary.delivering;
  const received = summary.received;
  const maxStep = Math.max(summary.maxStep || 0, 3);

  const stepCounts = new Map<number, number>();
  steps.forEach((row) => {
    stepCounts.set(Number(row.step || 0), Number(row.count));
  });

  const countAtOrAbove = (step: number) => {
    let total = 0;
    stepCounts.forEach((value, key) => {
      if (key >= step) total += value;
    });
    return total;
  };

  const funnelSteps = [
    { label: "Start", step: 1 },
    { label: "Step 2", step: 2 },
    { label: "Step 3", step: 3 },
    { label: "Complete", step: maxStep }
  ].map((item) => {
    const count = leads > 0 ? countAtOrAbove(item.step) : 0;
    const percent = leads > 0 ? Math.round((count / leads) * 100) : 0;
    return { ...item, count, percent };
  });

  const successRate = delivered + failed > 0 ? Math.round((delivered / (delivered + failed)) * 100) : 0;
  const backlog = delivering + received;

  const draftRows = [
    {
      label: `${school.name} · Program copy`,
      detail: "Headline updates pending owner approval."
    },
    {
      label: `${school.name} · FAQ edits`,
      detail: "Added 2 new FAQ entries."
    }
  ];

  return (
    <div className="admin-shell admin-official">
      <header className="admin-official__header">
        <div>
          <div className="admin-official__org">
            {school.branding.logoUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={school.branding.logoUrl} alt={`${school.name} logo`} />
            )}
            <div>
              <h1>{school.name}</h1>
              <p className="admin-muted">Dashboard · Owner view · Last 30 days</p>
            </div>
          </div>
          <div className="admin-official__meta">
            <span className="admin-pill">{campuses.length} campuses</span>
            <span className="admin-pill">{programs.length} programs</span>
          </div>
          {metricsError && (
            <p className="admin-muted" style={{ marginTop: "8px" }}>
              Metrics unavailable: {metricsError}
            </p>
          )}
        </div>
        <div className="admin-official__actions">
          <a className="admin-btn" href={`/admin/${school.slug}/database`}>Database</a>
          <a className="admin-official__ghost" href={`/admin/${school.slug}/config`}>Config builder</a>
        </div>
      </header>

      <section className="admin-kpi">
        <div className="kpi">
          <span className="admin-muted">Leads captured</span>
          <strong>{leads.toLocaleString()}</strong>
          <span className="admin-muted">Last 30 days</span>
        </div>
        <div className="kpi">
          <span className="admin-muted">Delivered to CRM</span>
          <strong>{delivered.toLocaleString()}</strong>
          <span className="admin-muted">{successRate}% success</span>
        </div>
        <div className="kpi">
          <span className="admin-muted">Queue backlog</span>
          <strong>{backlog.toLocaleString()}</strong>
          <span className="admin-muted">Received + delivering</span>
        </div>
        <div className="kpi">
          <span className="admin-muted">Config changes</span>
          <strong>{draftRows.length}</strong>
          <span className="admin-muted">Owner approval needed</span>
        </div>
      </section>

      <div className="admin-official__grid">
        <section className="admin-card">
          <h3>Funnel health</h3>
          <p className="admin-muted">Step conversion and drop-off across the quiz.</p>
          <div className="admin-official__funnel">
            {funnelSteps.map((step) => (
              <div key={step.label} className="admin-official__funnel-row">
                <span>{step.label}</span>
                <div className="admin-official__bar">
                  <div style={{ width: `${step.percent}%` }} />
                </div>
                <strong>{step.percent}%</strong>
              </div>
            ))}
          </div>
        </section>

        <section className="admin-card">
          <h3>CRM delivery status</h3>
          <div className="admin-official__queue">
            <div>
              <p className="admin-muted">Delivered</p>
              <strong>{delivered.toLocaleString()}</strong>
            </div>
            <div>
              <p className="admin-muted">Failed</p>
              <strong>{failed.toLocaleString()}</strong>
            </div>
            <div>
              <p className="admin-muted">Delivering</p>
              <strong>{delivering.toLocaleString()}</strong>
            </div>
          </div>
          <ul className="admin-official__list">
            <li>
              <span className="admin-tag">Retrying</span>
              {backlog.toLocaleString()} jobs in queue
            </li>
            <li>
              <span className="admin-tag">Failures</span>
              {failed.toLocaleString()} errors in last 30 days
            </li>
            <li>
              <span className="admin-tag">Delivered</span>
              {delivered.toLocaleString()} delivered
            </li>
          </ul>
        </section>
      </div>

      <div className="admin-official__grid">
        <section className="admin-card">
          <h3>Campus + program performance</h3>
          <table className="admin-table">
            <thead>
              <tr>
                <th>Campus</th>
                <th>Program</th>
                <th>Leads</th>
                <th>Delivered</th>
                <th>Failures</th>
              </tr>
            </thead>
            <tbody>
              {performance.length === 0 && (
                <tr>
                  <td colSpan={5} className="admin-muted">No data yet</td>
                </tr>
              )}
              {performance.map((row) => {
                const campusName = row.campusId
                  ? campuses.find((campus) => campus.id === row.campusId)?.name || row.campusId
                  : "Unspecified campus";
                const programName =
                  programs.find((program) => program.id === row.programId)?.name || row.programId;

                return (
                  <tr key={`${row.campusId || "none"}-${row.programId}`}>
                    <td>{campusName}</td>
                    <td>{programName}</td>
                    <td>{row.leads.toLocaleString()}</td>
                    <td>{row.delivered.toLocaleString()}</td>
                    <td>{row.failed.toLocaleString()}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>

        <section className="admin-card">
          <h3>Configuration drafts</h3>
          {draftRows.map((row) => (
            <div key={row.label} className="admin-official__draft">
              <p className="admin-muted">{row.label}</p>
              <p>{row.detail}</p>
              <a className="admin-official__ghost" href={`/admin/${school.slug}/config`}>Review</a>
            </div>
          ))}
        </section>
      </div>

      <section className="admin-card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <h3>Database snapshot</h3>
            <p className="admin-muted">Read-only preview of recent submissions.</p>
          </div>
          <a className="admin-official__ghost" href={`/admin/${school.slug}/database`}>View all</a>
        </div>
        <table className="admin-table">
          <thead>
            <tr>
              <th>Submission</th>
              <th>Email</th>
              <th>Status</th>
              <th>CRM Lead ID</th>
              <th>Updated</th>
            </tr>
          </thead>
          <tbody>
            {snapshots.length === 0 && (
              <tr>
                <td colSpan={5} className="admin-muted">No submissions found</td>
              </tr>
            )}
            {snapshots.map((row) => (
              <tr key={row.id}>
                <td>{row.id.slice(0, 8)}</td>
                <td>{row.email}</td>
                <td>{row.status}</td>
                <td>{row.crmLeadId || "—"}</td>
                <td>{new Date(row.updatedAt).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
