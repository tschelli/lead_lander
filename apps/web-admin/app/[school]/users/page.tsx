import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { hasSessionCookie } from "@/lib/authCookies";
import { UsersView } from "./UsersView";
import "../styles.css";

export const dynamic = "force-dynamic";

type ConfigResponse = {
  config: {
    schools: { id: string; name: string; slug: string; branding: { logoUrl?: string } }[];
  };
};

type SchoolsResponse = {
  schools: { id: string; name: string }[];
};

export default async function AdminUsers({ params }: { params: { school: string } }) {
  const requestHeaders = headers();
  const cookie = requestHeaders.get("cookie");
  if (!hasSessionCookie(cookie)) {
    redirect(`/${params.school}/login`);
  }

  const apiBase =
    process.env.ADMIN_API_BASE_URL ||
    process.env.NEXT_PUBLIC_API_BASE_URL ||
    "http://localhost:4000";
  const authHeaders: Record<string, string> = cookie ? { cookie } : {};

  const configResponse = await fetch(`${apiBase}/api/admin/schools/${params.school}/config`, {
    credentials: "include",
    headers: authHeaders,
    cache: "no-store"
  });

  if (configResponse.status === 401) {
    redirect(`/${params.school}/login`);
  }

  if (configResponse.status === 403 || configResponse.status === 404) {
    redirect(`/${params.school}/not-authorized`);
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

  const schoolsResponse = await fetch(`${apiBase}/api/admin/schools/${params.school}/schools`, {
    credentials: "include",
    headers: authHeaders,
    cache: "no-store"
  });

  if (schoolsResponse.status === 401 || schoolsResponse.status === 403) {
    redirect(`/${params.school}/login`);
  }

  if (!schoolsResponse.ok) {
    throw new Error("Failed to load schools");
  }

  const schoolsData = (await schoolsResponse.json()) as SchoolsResponse;
  const schools = schoolsData.schools.map((item) => ({ id: item.id, name: item.name }));

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
          <a className="admin-official__ghost" href={`/${school.slug}`}>Back to dashboard</a>
        </div>
      </header>

      <UsersView schoolSlug={school.slug} schools={schools} />
    </div>
  );
}
