import { FormEngine } from "../../../components/FormEngine";
import type { Config } from "@lead_lander/config-schema";

export const dynamic = "force-dynamic";

type LandingResponse = {
  landing: {
    school: {
      id: string;
      name: string;
      branding: {
        logoUrl?: string;
        colors: {
          primary: string;
          secondary: string;
          accent?: string;
          background?: string;
          text?: string;
        };
      };
      compliance: {
        disclaimerText: string;
        version: string;
      };
    };
    program: {
      id: string;
      name: string;
      availableCampuses?: string[];
    };
    landingCopy: {
      headline: string;
      subheadline: string;
      body: string;
      ctaText: string;
    };
    questionOverrides?: Config["programs"][number]["questionOverrides"];
  };
  campuses?: { id: string; name: string; schoolId: string }[];
  programs?: { id: string; name: string; schoolId: string }[];
};

export default async function LandingPage({
  params
}: {
  params: { school: string; program: string };
}) {
  const apiBase =
    process.env.NEXT_PUBLIC_API_BASE_URL ||
    process.env.ADMIN_API_BASE_URL ||
    "http://localhost:4000";

  const response = await fetch(`${apiBase}/api/public/landing/${params.school}/${params.program}`, {
    cache: "no-store"
  });

  if (!response.ok) {
    return (
      <main>
        <div className="form-card">
          <h2>Landing page not found</h2>
          <p>Check the URL or configuration.</p>
        </div>
      </main>
    );
  }

  const data = (await response.json()) as LandingResponse;
  const resolved = data.landing;

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

  const { school, program, landingCopy, questionOverrides } = resolved;

  const campusOptions = (data.campuses || [])
    .filter((campus) => {
      if (campus.schoolId !== school.id) return false;
      if (!program.availableCampuses || program.availableCampuses.length === 0) {
        return true;
      }
      return program.availableCampuses.includes(campus.id);
    })
    .map((campus) => ({ label: campus.name, value: campus.id }));

  const campusLabels = campusOptions.map((option) => option.label).join(", ");

  const programOptions = (data.programs || [])
    .filter((item) => item.schoolId === school.id)
    .map((item) => ({ label: item.name, value: item.id }));

  const style = {
    "--color-primary": school.branding.colors.primary,
    "--color-secondary": school.branding.colors.secondary,
    "--color-accent": school.branding.colors.accent || "#f3d34a",
    "--color-bg": school.branding.colors.background || "#f7f4ef",
    "--color-text": school.branding.colors.text || "#1b1b1b"
  } as React.CSSProperties;

  const campusOptionsWithFallback = campusOptions.concat({
    label: "Not sure yet",
    value: "not_sure"
  });

  return (
    <main style={style}>
      <div className="container">
        <section className="brand-card">
          <span className="badge school-badge">{school.name}</span>
          {school.branding.logoUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={school.branding.logoUrl} alt={`${school.name} logo`} className="brand-logo" />
          )}
          <h1>{landingCopy.headline}</h1>
          <h2>{landingCopy.subheadline}</h2>
          <p>{landingCopy.body}</p>
          <p>
            <strong>Program:</strong> {program.name}
          </p>
          {campusLabels && (
            <p>
              <strong>Available campuses:</strong> {campusLabels}
            </p>
          )}
        </section>
        <FormEngine
          schoolId={school.id}
          programId={program.id}
          consentText={school.compliance.disclaimerText}
          consentVersion={school.compliance.version}
          questionOverrides={questionOverrides}
          programOptions={programOptions}
          campusOptions={campusOptionsWithFallback}
          initialAnswers={{ program_interest: program.id }}
          ctaText={landingCopy.ctaText}
        />
      </div>
    </main>
  );
}
