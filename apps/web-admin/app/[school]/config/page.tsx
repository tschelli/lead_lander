import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { ConfigBuilder } from "../ConfigBuilder";
import "../styles.css";
import { hasSessionCookie } from "../../../../lib/authCookies";
import { canEditConfig, type User } from "../../../../lib/permissions";

export const dynamic = "force-dynamic";

type ConfigResponse = {
  config: {
    schools: { id: string; name: string; slug: string; branding: { logoUrl?: string } }[];
    programs: { id: string; name: string; landingCopy: { headline: string; subheadline: string; body: string; ctaText: string } }[];
  };
};

type AuthMeResponse = {
  user: User;
};

export default async function AdminConfig({ params }: { params: { school: string } }) {
  const requestHeaders = headers();
  const cookie = requestHeaders.get("cookie");
  if (!hasSessionCookie(cookie)) {
    redirect(`/admin/${params.school}/login`);
  }

  const apiBase =
    process.env.ADMIN_API_BASE_URL ||
    process.env.NEXT_PUBLIC_API_BASE_URL ||
    "http://localhost:4000";

  // Check user permissions
  const authResponse = await fetch(`${apiBase}/api/auth/me`, {
    credentials: "include",
    headers: cookie ? { cookie } : {},
    cache: "no-store"
  });

  if (authResponse.status === 401) {
    redirect(`/admin/${params.school}/login`);
  }

  const authData = (await authResponse.json()) as AuthMeResponse;

  // Check if user has config access (super_admin or client_admin only)
  if (!canEditConfig(authData.user)) {
    return (
      <div className="admin-shell">
        <div className="admin-card">
          <h2>Access Denied</h2>
          <p className="admin-muted">
            Config builder access requires Super Admin or Client Admin role.
          </p>
          <a className="admin-btn" href={`/admin/${params.school}`}>
            Back to Dashboard
          </a>
        </div>
      </div>
    );
  }

  const apiBase =
    process.env.ADMIN_API_BASE_URL ||
    process.env.NEXT_PUBLIC_API_BASE_URL ||
    "http://localhost:4000";

  const response = await fetch(`${apiBase}/api/admin/${params.school}/config`, {
    credentials: "include",
    headers: cookie ? { cookie } : {},
    cache: "no-store"
  });

  if (response.status === 401 || response.status === 403) {
    redirect(`/admin/${params.school}/login`);
  }

  if (!response.ok) {
    throw new Error("Failed to load config");
  }

  const data = (await response.json()) as ConfigResponse;
  const school = data.config.schools.find((item) => item.slug === params.school);

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
              <h1>{school.name} · Config Builder</h1>
              <p className="admin-muted">Draft changes require owner approval.</p>
            </div>
          </div>
        </div>
        <div className="admin-official__actions">
          <a className="admin-btn" href={`/admin/${school.slug}`}>Back to dashboard</a>
        </div>
      </header>

      <section className="admin-card">
        <h3>Program copy</h3>
        <ConfigBuilder
          programs={data.config.programs.map((program) => ({
            id: program.id,
            name: program.name,
            landingCopy: program.landingCopy
          }))}
          schoolSlug={school.slug}
        />
      </section>
    </div>
  );
}
