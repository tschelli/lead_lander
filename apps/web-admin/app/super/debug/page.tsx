import { headers } from "next/headers";
import { hasSessionCookie } from "@/lib/authCookies";
import { isSuperAdmin, type User } from "@/lib/permissions";

export const dynamic = "force-dynamic";

type AuthMeResponse = {
  user: User;
};

export default async function DebugPage() {
  const requestHeaders = headers();
  const cookie = requestHeaders.get("cookie");

  const apiBase =
    process.env.ADMIN_API_BASE_URL ||
    process.env.NEXT_PUBLIC_API_BASE_URL ||
    "http://localhost:4000";

  const hasCookie = hasSessionCookie(cookie);
  const authHeaders: Record<string, string> = cookie ? { cookie } : {};

  let authResponse = null;
  let authData: AuthMeResponse | null = null;
  let authError = null;

  try {
    const response = await fetch(`${apiBase}/api/auth/me`, {
      headers: authHeaders,
      cache: "no-store"
    });

    authResponse = {
      ok: response.ok,
      status: response.status,
      statusText: response.statusText
    };

    if (response.ok) {
      authData = (await response.json()) as AuthMeResponse;
    } else {
      authError = await response.text();
    }
  } catch (error) {
    authError = (error as Error).message;
  }

  return (
    <div style={{ padding: "24px", fontFamily: "monospace", fontSize: "14px" }}>
      <h1>Super Admin Debug Info</h1>

      <h2>1. Cookie Check</h2>
      <pre style={{ background: "#f5f5f5", padding: "12px", borderRadius: "4px" }}>
        Has session cookie: {hasCookie ? "✅ YES" : "❌ NO"}
        {"\n"}Cookie header: {cookie ? "Present" : "Missing"}
      </pre>

      <h2>2. API Base URL</h2>
      <pre style={{ background: "#f5f5f5", padding: "12px", borderRadius: "4px" }}>
        {apiBase}
      </pre>

      <h2>3. Auth Response</h2>
      <pre style={{ background: "#f5f5f5", padding: "12px", borderRadius: "4px" }}>
        {JSON.stringify(authResponse, null, 2)}
      </pre>

      {authError && (
        <>
          <h2>4. Auth Error</h2>
          <pre style={{ background: "#fee", padding: "12px", borderRadius: "4px", color: "#c00" }}>
            {authError}
          </pre>
        </>
      )}

      {authData && (
        <>
          <h2>4. User Data</h2>
          <pre style={{ background: "#f5f5f5", padding: "12px", borderRadius: "4px" }}>
            {JSON.stringify(authData, null, 2)}
          </pre>

          <h2>5. Permission Check</h2>
          <pre style={{ background: "#f5f5f5", padding: "12px", borderRadius: "4px" }}>
            Is Super Admin: {isSuperAdmin(authData.user) ? "✅ YES" : "❌ NO"}
            {"\n"}
            Has roles array: {authData.user.roles ? "✅ YES" : "❌ NO"}
            {"\n"}
            Roles: {authData.user.roles ? JSON.stringify(authData.user.roles, null, 2) : "undefined"}
          </pre>
        </>
      )}

      <h2>6. Actions</h2>
      <div style={{ display: "flex", gap: "12px", marginTop: "12px" }}>
        <a
          href="/super/login"
          style={{
            padding: "8px 16px",
            background: "#0e7490",
            color: "white",
            textDecoration: "none",
            borderRadius: "6px"
          }}
        >
          Go to Login
        </a>
        <a
          href="/super"
          style={{
            padding: "8px 16px",
            background: "#0e7490",
            color: "white",
            textDecoration: "none",
            borderRadius: "6px"
          }}
        >
          Try /super
        </a>
      </div>
    </div>
  );
}
