import { SCHOOL_ID, API_BASE_URL } from "../lib/schoolContext";

export const dynamic = "force-dynamic";

type SchoolResponse = {
  school: {
    id: string;
    name: string;
    slug: string;
    branding?: {
      logoUrl?: string;
      colors?: {
        primary?: string;
        secondary?: string;
      };
    };
  };
};

type ProgramsResponse = {
  programs: Array<{
    id: string;
    name: string;
    slug: string;
  }>;
};

export default async function Home() {
  const schoolResponse = await fetch(`${API_BASE_URL}/api/public/schools/${SCHOOL_ID}`, {
    cache: "no-store"
  });

  if (!schoolResponse.ok) {
    return (
      <main>
        <div className="form-card">
          <h2>School not found</h2>
          <p>Configuration error. Please contact support.</p>
        </div>
      </main>
    );
  }

  const schoolData = (await schoolResponse.json()) as SchoolResponse;

  // Fetch programs for this school
  const programsResponse = await fetch(`${API_BASE_URL}/api/public/schools/${SCHOOL_ID}/programs`, {
    cache: "no-store"
  });

  let programs: ProgramsResponse["programs"] = [];
  if (programsResponse.ok) {
    const programsData = (await programsResponse.json()) as ProgramsResponse;
    programs = programsData.programs || [];
  }

  const style = schoolData.school.branding?.colors
    ? {
        "--color-primary": schoolData.school.branding.colors.primary || "#0e7490",
        "--color-secondary": schoolData.school.branding.colors.secondary || "#06b6d4"
      }
    : {};

  return (
    <main style={style as React.CSSProperties}>
      <div className="container">
        <div className="form-card">
          {schoolData.school.branding?.logoUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={schoolData.school.branding.logoUrl}
              alt={`${schoolData.school.name} logo`}
              className="brand-logo"
              style={{ marginBottom: "24px", maxWidth: "200px" }}
            />
          )}
          <h1>Welcome to {schoolData.school.name}</h1>
          <p>Select a program to learn more and get started:</p>

          {programs.length > 0 ? (
            <div style={{ marginTop: "24px", display: "flex", flexDirection: "column", gap: "12px" }}>
              {programs.map((program) => (
                <a
                  key={program.id}
                  href={`/${program.slug}`}
                  className="program-link"
                >
                  <strong>{program.name}</strong>
                  <p style={{ fontSize: "14px", color: "#666", margin: "4px 0 0 0" }}>
                    /{program.slug}
                  </p>
                </a>
              ))}
            </div>
          ) : (
            <p style={{ marginTop: "16px", color: "#666" }}>
              No programs configured yet.
            </p>
          )}
        </div>
      </div>
    </main>
  );
}
