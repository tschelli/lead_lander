import "./styles.css";

export default function PrototypeB() {
  return (
    <div className="admin-shell proto-b">
      <header className="proto-b__header">
        <div>
          <h1>Ops Console</h1>
          <p className="admin-muted">Northwood + Asher · Week 5 · Admin</p>
        </div>
        <div className="proto-b__header-actions">
          <button className="admin-btn">Export CSV</button>
          <button className="proto-b__outline">Queue Dashboard</button>
        </div>
      </header>

      <div className="proto-b__layout">
        <aside className="proto-b__sidebar admin-card">
          <h3>Queues</h3>
          <div className="proto-b__metric">
            <span className="admin-muted">Pending</span>
            <strong>24</strong>
          </div>
          <div className="proto-b__metric">
            <span className="admin-muted">Retries</span>
            <strong>6</strong>
          </div>
          <div className="proto-b__metric">
            <span className="admin-muted">Dead letter</span>
            <strong>1</strong>
          </div>

          <h3 style={{ marginTop: "24px" }}>Database</h3>
          <p className="admin-muted">Read-only access</p>
          <div className="proto-b__db">
            <span>submissions</span>
            <span className="admin-tag">1.4M</span>
          </div>
          <div className="proto-b__db">
            <span>delivery_attempts</span>
            <span className="admin-tag">3.1M</span>
          </div>
          <div className="proto-b__db">
            <span>audit_log</span>
            <span className="admin-tag">2.2M</span>
          </div>
        </aside>

        <main className="proto-b__main">
          <section className="admin-card">
            <h3>Database metrics</h3>
            <div className="proto-b__kpi-grid">
              <div>
                <p className="admin-muted">New leads</p>
                <strong>372</strong>
              </div>
              <div>
                <p className="admin-muted">Completion rate</p>
                <strong>46%</strong>
              </div>
              <div>
                <p className="admin-muted">Avg. time to deliver</p>
                <strong>2m 12s</strong>
              </div>
              <div>
                <p className="admin-muted">Config drafts</p>
                <strong>5</strong>
              </div>
            </div>
          </section>

          <section className="admin-card">
            <h3>Latest CRM activity</h3>
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Submission</th>
                  <th>Adapter</th>
                  <th>Status</th>
                  <th>Latency</th>
                  <th>Timestamp</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>#8301</td>
                  <td>LeadSquared</td>
                  <td><span className="admin-tag">Delivered</span></td>
                  <td>2.1s</td>
                  <td>2m ago</td>
                </tr>
                <tr>
                  <td>#8300</td>
                  <td>Webhook</td>
                  <td><span className="admin-tag">Retrying</span></td>
                  <td>—</td>
                  <td>4m ago</td>
                </tr>
                <tr>
                  <td>#8296</td>
                  <td>LeadSquared</td>
                  <td><span className="admin-tag">Failed</span></td>
                  <td>6.8s</td>
                  <td>9m ago</td>
                </tr>
              </tbody>
            </table>
          </section>

          <section className="admin-card">
            <h3>Config builder (draft)</h3>
            <div className="proto-b__builder">
              <div>
                <p className="admin-muted">Program copy</p>
                <h4>Cybersecurity · Westside</h4>
                <p className="proto-b__code">headline: "Launch a career in cybersecurity"</p>
                <p className="proto-b__code">subheadline: "Evening cohorts now open"</p>
              </div>
              <div className="proto-b__builder-actions">
                <button className="admin-btn">Submit for approval</button>
                <button className="proto-b__outline">Preview</button>
              </div>
            </div>
          </section>

          <section className="admin-card">
            <h3>Database preview</h3>
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Email</th>
                  <th>Program</th>
                  <th>Campus</th>
                  <th>Status</th>
                  <th>Step</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>marco@asher.edu</td>
                  <td>PC Support Specialist</td>
                  <td>Las Vegas</td>
                  <td>delivered</td>
                  <td>5</td>
                </tr>
                <tr>
                  <td>leah@northwood.edu</td>
                  <td>Medical Assistant</td>
                  <td>Downtown</td>
                  <td>delivering</td>
                  <td>3</td>
                </tr>
              </tbody>
            </table>
          </section>
        </main>
      </div>
    </div>
  );
}
