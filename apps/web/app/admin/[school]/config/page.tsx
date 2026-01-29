import { loadConfig } from "@lead_lander/config-schema";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { ConfigBuilder } from "../ConfigBuilder";
import "../styles.css";
import { resolveConfigDir } from "../../../../lib/configDir";
import { hasSessionCookie } from "../../../../lib/authCookies";

export const dynamic = "force-dynamic";

export default function AdminConfig({ params }: { params: { school: string } }) {
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

  const programs = config.programs.filter((program) => program.schoolId === school.id);
  const requestHeaders = headers();
  const cookie = requestHeaders.get("cookie");
  if (!hasSessionCookie(cookie)) {
    redirect(`/admin/${school.slug}/login`);
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
          programs={programs.map((program) => ({
            id: program.id,
            name: program.name,
            landingCopy: program.landingCopy
          }))}
        />
      </section>

      <section className="admin-card">
        <h3>Drafts awaiting approval</h3>
        <div className="admin-official__draft">
          <p className="admin-muted">{school.name} · Medical Billing</p>
          <p>CTA text updated to “Get Enrollment Details”.</p>
          <button className="admin-official__ghost">Approve</button>
        </div>
        <div className="admin-official__draft">
          <p className="admin-muted">{school.name} · Cybersecurity</p>
          <p>Added new FAQ block. Waiting for owner review.</p>
          <button className="admin-official__ghost">Review</button>
        </div>
      </section>
    </div>
  );
}
