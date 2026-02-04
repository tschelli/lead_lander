import { LandingPageClient } from "./LandingPageClient";
import { API_BASE_URL } from "../../lib/apiConfig";
import type { Account, Location, Program } from "@lead_lander/config-schema";

export const dynamic = "force-dynamic";

type AccountResponse = {
  account: Account;
  locations: Location[];
  programs: Program[];
};

export default async function AccountLandingPage({
  params
}: {
  params: { account: string };
}) {
  // Fetch account data by slug
  const response = await fetch(
    `${API_BASE_URL}/api/public/accounts/${params.account}`,
    { cache: "no-store" }
  );

  if (!response.ok) {
    return (
      <main>
        <div className="form-card">
          <h2>Account not found</h2>
          <p>The account <strong>{params.account}</strong> could not be found.</p>
          <p style={{ fontSize: "12px", color: "#666", marginTop: "16px" }}>
            Check the URL or contact support.
          </p>
        </div>
      </main>
    );
  }

  const data = (await response.json()) as AccountResponse;
  const { account, locations, programs } = data;

  if (!account) {
    return (
      <main>
        <div className="form-card">
          <h2>Account not found</h2>
          <p>Check the URL or configuration.</p>
        </div>
      </main>
    );
  }

  // Pass data to client component
  return (
    <LandingPageClient
      account={account}
      locations={locations}
      programs={programs}
    />
  );
}
