import path from "path";
import { loadConfig, resolveLandingPageBySlugs } from "@lead_lander/config-schema";
import { FormEngine } from "../../../../components/FormEngine";
import type { CSSProperties } from "react";

export const dynamic = "force-dynamic";

export default function LandingPage({
  params
}: {
  params: { school: string; campus: string; program: string };
}) {
  const configDir = path.resolve(process.cwd(), "../../configs");
  const config = loadConfig(configDir);
  const resolved = resolveLandingPageBySlugs(config, params.school, params.campus, params.program);

  if (!resolved) {
    return (
      <main>
        <div className="form-card">
          <h2>Landing page not found</h2>
          <p>Check the URL or configuration.</p>
        </div>
      </main>
    );
  }

  const { school, campus, program, landingCopy, questionOverrides } = resolved;

  const style: CSSProperties = {
    "--color-primary": school.branding.colors.primary,
    "--color-secondary": school.branding.colors.secondary,
    "--color-accent": school.branding.colors.accent || "#f3d34a",
    "--color-bg": school.branding.colors.background || "#f7f4ef",
    "--color-text": school.branding.colors.text || "#1b1b1b"
  };

  return (
    <main style={style}>
      <div className="container">
        <section className="brand-card">
          <span className="badge">{campus.name}</span>
          <h1>{landingCopy.headline}</h1>
          <h2>{landingCopy.subheadline}</h2>
          <p>{landingCopy.body}</p>
          <p>
            <strong>Program:</strong> {program.name}
          </p>
          <p>
            <strong>Campus:</strong> {campus.name}
          </p>
          {school.branding.logoUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={school.branding.logoUrl} alt={`${school.name} logo`} style={{ maxWidth: "180px" }} />
          )}
        </section>
        <FormEngine
          schoolId={school.id}
          campusId={campus.id}
          programId={program.id}
          consentText={school.compliance.disclaimerText}
          consentVersion={school.compliance.version}
          questionOverrides={questionOverrides}
          ctaText={landingCopy.ctaText}
        />
      </div>
    </main>
  );
}
