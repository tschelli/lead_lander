import { loadConfig } from "@lead_lander/config-schema";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { resolveConfigDir } from "../../../../lib/configDir";
import { hasSessionCookie } from "../../../../lib/authCookies";
import { UsersView } from "./UsersView";
import "../styles.css";

export const dynamic = "force-dynamic";

export default function AdminUsers({ params }: { params: { school: string } }) {
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

  const requestHeaders = headers();
  const cookie = requestHeaders.get("cookie");
  if (!hasSessionCookie(cookie)) {
    redirect(`/admin/${school.slug}/login`);
  }

  const schools = config.schools
    .filter((item) => item.clientId === school.clientId)
    .map((item) => ({ id: item.id, name: item.name }));

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
              <h1>{school.name} · Users</h1>
              <p className="admin-muted">Invite admins and assign roles.</p>
            </div>
          </div>
        </div>
        <div className="admin-official__actions">
          <a className="admin-official__ghost" href={`/admin/${school.slug}`}>Back to dashboard</a>
        </div>
      </header>

      <UsersView schoolSlug={school.slug} schools={schools} />
    </div>
  );
}
