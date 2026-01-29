import { loadConfig } from "@lead_lander/config-schema";
import { resolveConfigDir } from "../../../lib/configDir";
import { LoginForm } from "./LoginForm";

export const dynamic = "force-dynamic";

export default function AdminLogin() {
  const config = loadConfig(resolveConfigDir());
  const schools = config.schools.map((school) => ({
    slug: school.slug,
    name: school.name
  }));

  return <LoginForm schools={schools} />;
}
