import { loadConfig } from "@lead_lander/config-schema";
import { resolveConfigDir } from "../../../../lib/configDir";
import { LoginForm } from "./LoginForm";

export const dynamic = "force-dynamic";

export default function AdminSchoolLogin({ params }: { params: { school: string } }) {
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

  return <LoginForm schoolSlug={school.slug} schoolName={school.name} />;
}
