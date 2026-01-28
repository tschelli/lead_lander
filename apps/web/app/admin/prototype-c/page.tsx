import "./styles.css";

export default function PrototypeC() {
  return (
    <div className="admin-shell proto-c">
      <header className="proto-c__header">
        <div>
          <p className="proto-c__eyebrow">Client Dashboard</p>
          <h1>Minimal Pro</h1>
          <p className="admin-muted">Asher College · All campuses · 7-day pulse</p>
        </div>
        <div className="proto-c__chips">
          <span className="proto-c__chip">Weekly</span>
          <span className="proto-c__chip">Owner approval</span>
          <span className="proto-c__chip">Exports ready</span>
        </div>
      </header>

      <section className="proto-c__hero">
        <div>
          <h2>1,014 leads this week</h2>
          <p className="admin-muted">46% completion · 92% delivered to CRM · 3 alerts</p>
          <div className="proto-c__hero-actions">
            <button className="admin-btn">Download CSV</button>
            <button className="proto-c__ghost">View alerts</button>
          </div>
        </div>
        <div className="proto-c__sparkline">
          {Array.from({ length: 16 }).map((_, idx) => (
            <span key={idx} style={{ height: `${40 + (idx % 5) * 10}px` }} />
          ))}
        </div>
      </section>

      <div className="proto-c__grid">
        <section className="admin-card">
          <h3>Funnel snapshot</h3>
          <div className="proto-c__funnel">
            <div>
              <strong>100%</strong>
              <span>Start</span>
            </div>
            <div>
              <strong>72%</strong>
              <span>Step 2</span>
            </div>
            <div>
              <strong>61%</strong>
              <span>Step 3</span>
            </div>
            <div>
              <strong>46%</strong>
              <span>Complete</span>
            </div>
          </div>
        </section>

        <section className="admin-card">
          <h3>Config builder</h3>
          <div className="proto-c__config">
            <div>
              <p className="admin-muted">Draft: Pharmacy Technician</p>
              <p>CTA text updated · awaiting owner approval</p>
            </div>
            <button className="proto-c__ghost">Review draft</button>
          </div>
          <div className="proto-c__config">
            <div>
              <p className="admin-muted">Draft: Medical Billing</p>
              <p>Added campus-specific disclaimer</p>
            </div>
            <button className="proto-c__ghost">Open</button>
          </div>
        </section>

        <section className="admin-card">
          <h3>CRM + Queue</h3>
          <div className="proto-c__queue">
            <div>
              <p className="admin-muted">Queue depth</p>
              <strong>12</strong>
            </div>
            <div>
              <p className="admin-muted">Retries</p>
              <strong>3</strong>
            </div>
            <div>
              <p className="admin-muted">Failures</p>
              <strong>1</strong>
            </div>
          </div>
        </section>
      </div>

      <section className="admin-card">
        <h3>Database tables (read-only)</h3>
        <table className="admin-table">
          <thead>
            <tr>
              <th>Table</th>
              <th>Rows</th>
              <th>Last update</th>
              <th>Sample export</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>submissions</td>
              <td>1,438,210</td>
              <td>2 minutes ago</td>
              <td><a href="#">download</a></td>
            </tr>
            <tr>
              <td>delivery_attempts</td>
              <td>3,101,882</td>
              <td>5 minutes ago</td>
              <td><a href="#">download</a></td>
            </tr>
          </tbody>
        </table>
      </section>
    </div>
  );
}
