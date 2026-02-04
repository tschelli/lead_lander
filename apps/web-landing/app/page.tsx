import { API_BASE_URL } from "../lib/apiConfig";
import type { Account } from "@lead_lander/config-schema";

export const dynamic = "force-dynamic";

type AccountsResponse = {
  accounts: Account[];
};

export default async function Home() {
  // For development: show list of accounts
  // For production: typically redirect to a specific account or show branded home
  const response = await fetch(`${API_BASE_URL}/api/public/accounts`, {
    cache: "no-store"
  });

  if (!response.ok) {
    return (
      <main>
        <div className="form-card">
          <h2>Service Unavailable</h2>
          <p>Unable to load accounts. Please contact support.</p>
        </div>
      </main>
    );
  }

  const data = (await response.json()) as AccountsResponse;
  const accounts = data.accounts || [];

  return (
    <main>
      <div className="container">
        <div className="form-card" style={{ maxWidth: "600px", margin: "0 auto" }}>
          <h1>Lead Lander</h1>
          <p>Select an account to visit their landing page:</p>

          {accounts.length > 0 ? (
            <div style={{ marginTop: "32px", display: "flex", flexDirection: "column", gap: "12px" }}>
              {accounts.map((account) => (
                <a
                  key={account.id}
                  href={`/${account.slug}`}
                  className="program-link"
                  style={{
                    display: "block",
                    padding: "16px",
                    border: "1px solid #ddd",
                    borderRadius: "8px",
                    textDecoration: "none",
                    color: "inherit",
                    transition: "all 0.2s"
                  }}
                >
                  <strong>{account.name}</strong>
                  <p style={{ fontSize: "14px", color: "#666", margin: "4px 0 0 0" }}>
                    /{account.slug}
                  </p>
                </a>
              ))}
            </div>
          ) : (
            <p style={{ marginTop: "24px", color: "#666" }}>
              No accounts configured yet. Run <code>npm run seed</code> to create sample accounts.
            </p>
          )}

          <div
            style={{
              marginTop: "32px",
              padding: "16px",
              background: "#f0f9ff",
              borderRadius: "8px",
              fontSize: "14px"
            }}
          >
            <p style={{ margin: 0, fontWeight: "bold", color: "#0369a1" }}>
              💡 Development Mode
            </p>
            <p style={{ margin: "8px 0 0 0", color: "#075985" }}>
              This page shows all accounts for testing. In production, you would typically:
            </p>
            <ul style={{ margin: "8px 0 0 16px", color: "#075985" }}>
              <li>Direct traffic to specific account URLs</li>
              <li>Use custom domains per account</li>
              <li>Or redirect the root to a branded landing page</li>
            </ul>
          </div>
        </div>
      </div>
    </main>
  );
}
