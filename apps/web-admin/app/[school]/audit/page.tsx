import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { hasSessionCookie } from "../../../../lib/authCookies";
import { AuditView } from "./AuditView";
import "../styles.css";

export const dynamic = "force-dynamic";

type ConfigResponse = {
  config: {
    schools: { id: string; name: string; slug: string; branding: { logoUrl?: string } }[];
  };
};

export default async function AdminAudit({ params }: { params: { school: string } }) {
  const requestHeaders = headers();
  const cookie = requestHeaders.get("cookie");
  if (!hasSessionCookie(cookie)) {
    redirect(`/admin/${params.school}/login`);
  }

  const apiBase =
    process.env.ADMIN_API_BASE_URL ||
    process.env.NEXT_PUBLIC_API_BASE_URL ||
    "http://localhost:4000";
  const authHeaders: Record<string, string> = cookie ? { cookie } : {};

  const configResponse = await fetch(`${apiBase}/api/admin/${params.school}/config`, {
    credentials: "include",
    headers: authHeaders,
    cache: "no-store"
  });

  if (configResponse.status === 401 || configResponse.status === 403) {
    redirect(`/admin/${params.school}/login`);
  }

  if (!configResponse.ok) {
    throw new Error("Failed to load config");
  }

  const configData = (await configResponse.json()) as ConfigResponse;
  const school = configData.config.schools.find((item) => item.slug === params.school);

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
              <h1>{school.name} · Audit log</h1>
              <p className="admin-muted">Actions across admin users and data exports.</p>
            </div>
          </div>
        </div>
        <div className="admin-official__actions">
          <a className="admin-official__ghost" href={`/admin/${school.slug}`}>Back to dashboard</a>
        </div>
      </header>

      <AuditView schoolSlug={school.slug} />
    </div>
  );
}
