import path from "path";
import { loadConfig } from "@lead_lander/config-schema";
import { getPool } from "../../../lib/db";
import "./styles.css";

export const dynamic = "force-dynamic";

type SummaryRow = {
  leads: string;
  delivered: string;
  failed: string;
  delivering: string;
  received: string;
  max_step: number | null;
};

type StepRow = {
  last_step_completed: number | null;
  count: string;
};

type PerfRow = {
  campus_id: string | null;
  program_id: string;
  leads: string;
  delivered: string;
  failed: string;
};

type SnapshotRow = {
  id: string;
  email: string;
  status: string;
  crm_lead_id: string | null;
  updated_at: string;
};

export default async function AdminAccount({ params }: { params: { school: string } }) {
  const configDir = path.resolve(process.cwd(), "../../configs");
  const config = loadConfig(configDir);
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

  const now = new Date();
  const from = new Date(now);
  from.setDate(now.getDate() - 30);

  const pool = getPool();
  let summary: SummaryRow | null = null;
  let steps: StepRow[] = [];
  let performance: PerfRow[] = [];
  let snapshots: SnapshotRow[] = [];
  let dbError: string | null = null;

  if (pool) {
    try {
      const summaryResult = await pool.query<SummaryRow>(
        `
          SELECT
            COUNT(*) AS leads,
            SUM(CASE WHEN status = 'delivered' THEN 1 ELSE 0 END) AS delivered,
            SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failed,
            SUM(CASE WHEN status = 'delivering' THEN 1 ELSE 0 END) AS delivering,
            SUM(CASE WHEN status = 'received' THEN 1 ELSE 0 END) AS received,
            MAX(COALESCE(last_step_completed, 0)) AS max_step
          FROM submissions
          WHERE school_id = $1 AND created_at >= $2 AND created_at < $3
        `,
        [school.id, from, now]
      );
      summary = summaryResult.rows[0];

      const stepResult = await pool.query<StepRow>(
        `
          SELECT COALESCE(last_step_completed, 0) AS last_step_completed,
                 COUNT(*) AS count
          FROM submissions
          WHERE school_id = $1 AND created_at >= $2 AND created_at < $3
          GROUP BY COALESCE(last_step_completed, 0)
        `,
        [school.id, from, now]
      );
      steps = stepResult.rows;

      const perfResult = await pool.query<PerfRow>(
        `
          SELECT campus_id, program_id,
            COUNT(*) AS leads,
            SUM(CASE WHEN status = 'delivered' THEN 1 ELSE 0 END) AS delivered,
            SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failed
          FROM submissions
          WHERE school_id = $1 AND created_at >= $2 AND created_at < $3
          GROUP BY campus_id, program_id
          ORDER BY leads DESC
          LIMIT 5
        `,
        [school.id, from, now]
      );
      performance = perfResult.rows;

      const snapshotResult = await pool.query<SnapshotRow>(
        `
          SELECT id, email, status, crm_lead_id, updated_at
          FROM submissions
          WHERE school_id = $1
          ORDER BY updated_at DESC
          LIMIT 5
        `,
        [school.id]
      );
      snapshots = snapshotResult.rows;
    } catch (error) {
      dbError = (error as Error).message;
    }
  } else {
    dbError = "DATABASE_URL not configured";
  }

  const leads = Number(summary?.leads || 0);
  const delivered = Number(summary?.delivered || 0);
  const failed = Number(summary?.failed || 0);
  const delivering = Number(summary?.delivering || 0);
  const received = Number(summary?.received || 0);
  const maxStep = Math.max(summary?.max_step || 0, 3);

  const stepCounts = new Map<number, number>();
  steps.forEach((row) => {
    stepCounts.set(Number(row.last_step_completed || 0), Number(row.count));
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
          {dbError && (
            <p className="admin-muted" style={{ marginTop: "8px" }}>
              Metrics unavailable: {dbError}
            </p>
          )}
        </div>
        <div className="admin-official__actions">
          <button className="admin-btn">Download CSV</button>
          <button className="admin-official__ghost">Config builder</button>
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
                const campusName = row.campus_id
                  ? campuses.find((campus) => campus.id === row.campus_id)?.name || row.campus_id
                  : "Unspecified campus";
                const programName =
                  programs.find((program) => program.id === row.program_id)?.name || row.program_id;

                return (
                  <tr key={`${row.campus_id || "none"}-${row.program_id}`}>
                    <td>{campusName}</td>
                    <td>{programName}</td>
                    <td>{Number(row.leads).toLocaleString()}</td>
                    <td>{Number(row.delivered).toLocaleString()}</td>
                    <td>{Number(row.failed).toLocaleString()}</td>
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
              <button className="admin-official__ghost">Review</button>
            </div>
          ))}
        </section>
      </div>

      <section className="admin-card">
        <h3>Database snapshot</h3>
        <p className="admin-muted">Read-only preview of recent submissions.</p>
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
                <td>{row.crm_lead_id || "—"}</td>
                <td>{new Date(row.updated_at).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
