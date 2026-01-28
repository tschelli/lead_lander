import "./styles.css";

export default function PrototypeA() {
  return (
    <div className="admin-shell proto-a">
      <header className="proto-a__header">
        <div>
          <h1>Control Center</h1>
          <p className="admin-muted">All campuses · Last 30 days · Owner view</p>
        </div>
        <div className="proto-a__actions">
          <button className="admin-btn">Download CSV</button>
          <button className="proto-a__ghost">View Config Drafts</button>
        </div>
      </header>

      <section className="admin-kpi">
        <div className="kpi">
          <span className="admin-muted">Leads captured</span>
          <strong>1,248</strong>
          <span className="admin-muted">+12% vs last period</span>
        </div>
        <div className="kpi">
          <span className="admin-muted">Delivered to CRM</span>
          <strong>1,177</strong>
          <span className="admin-muted">94.3% success</span>
        </div>
        <div className="kpi">
          <span className="admin-muted">Queue backlog</span>
          <strong>18</strong>
          <span className="admin-muted">2 retries in progress</span>
        </div>
        <div className="kpi">
          <span className="admin-muted">Config changes</span>
          <strong>3 pending</strong>
          <span className="admin-muted">Owner approval needed</span>
        </div>
      </section>

      <div className="proto-a__grid">
        <section className="admin-card proto-a__funnel">
          <h3>Funnel health</h3>
          <p className="admin-muted">Step conversion and drop-off across the quiz.</p>
          <div className="proto-a__funnel-bars">
            {[
              { label: "Start", value: "100%", width: "100%" },
              { label: "Step 2", value: "72%", width: "72%" },
              { label: "Step 3", value: "61%", width: "61%" },
              { label: "Complete", value: "46%", width: "46%" }
            ].map((step) => (
              <div key={step.label} className="proto-a__funnel-row">
                <span>{step.label}</span>
                <div className="proto-a__bar">
                  <div style={{ width: step.width }} />
                </div>
                <strong>{step.value}</strong>
              </div>
            ))}
          </div>
        </section>

        <section className="admin-card proto-a__queue">
          <h3>CRM delivery status</h3>
          <div className="proto-a__queue-cards">
            <div>
              <p className="admin-muted">Webhook adapter</p>
              <strong>99.1%</strong>
            </div>
            <div>
              <p className="admin-muted">LeadSquared</p>
              <strong>97.8%</strong>
            </div>
            <div>
              <p className="admin-muted">Avg latency</p>
              <strong>2.4s</strong>
            </div>
          </div>
          <ul className="proto-a__list">
            <li>
              <span className="admin-tag">Retrying</span>
              Submission #8272 · timeout at 2:14 PM
            </li>
            <li>
              <span className="admin-tag">Failed</span>
              Submission #8255 · auth header missing
            </li>
            <li>
              <span className="admin-tag">Delivered</span>
              Submission #8251 · 200 OK
            </li>
          </ul>
        </section>
      </div>

      <div className="proto-a__grid">
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
              <tr>
                <td>Dallas</td>
                <td>Pharmacy Technician</td>
                <td>212</td>
                <td>206</td>
                <td>6</td>
              </tr>
              <tr>
                <td>Las Vegas</td>
                <td>Business Administration</td>
                <td>187</td>
                <td>176</td>
                <td>11</td>
              </tr>
              <tr>
                <td>Sacramento</td>
                <td>Medical Billing</td>
                <td>164</td>
                <td>160</td>
                <td>4</td>
              </tr>
            </tbody>
          </table>
        </section>

        <section className="admin-card">
          <h3>Configuration drafts</h3>
          <div className="proto-a__draft">
            <p className="admin-muted">Northwood · Medical Assistant</p>
            <p>New headline: “Start your medical assistant career in 9 months.”</p>
            <button className="admin-btn">Approve</button>
          </div>
          <div className="proto-a__draft">
            <p className="admin-muted">Asher · Program overrides</p>
            <p>Added 2 recommendation questions (awaiting owner review).</p>
            <button className="proto-a__ghost">Review</button>
          </div>
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
            <tr>
              <td>#8291</td>
              <td>samira@example.com</td>
              <td>delivered</td>
              <td>LS-109233</td>
              <td>2m ago</td>
            </tr>
            <tr>
              <td>#8288</td>
              <td>jon@example.com</td>
              <td>delivering</td>
              <td>LS-109201</td>
              <td>6m ago</td>
            </tr>
          </tbody>
        </table>
      </section>
    </div>
  );
}
