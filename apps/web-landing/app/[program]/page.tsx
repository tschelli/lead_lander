import { FormEngine } from "../../components/FormEngine";
import { HighlightsSection } from "../../components/HighlightsSection";
import { StatsSection } from "../../components/StatsSection";
import { TestimonialsSection } from "../../components/TestimonialsSection";
import { FAQSection } from "../../components/FAQSection";
import type { Config } from "@lead_lander/config-schema";
import { SCHOOL_ID, API_BASE_URL } from "../../lib/schoolContext";

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
      thankYou?: {
        title?: string;
        message?: string;
        body?: string;
        ctaText?: string;
        ctaUrl?: string;
      };
    };
    program: {
      id: string;
      name: string;
      availableCampuses?: string[];
      templateType?: "minimal" | "full";
      leadForm?: Config["programs"][number]["leadForm"];
      heroImage?: string;
      highlights?: Array<{ icon?: string; text: string }>;
      testimonials?: Array<{ quote: string; author: string; role?: string; photo?: string }>;
      faqs?: Array<{ question: string; answer: string }>;
      stats?: {
        placementRate?: string;
        avgSalary?: string;
        duration?: string;
        graduationRate?: string;
      };
      useQuizRouting?: boolean;
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
  params: { program: string };
}) {
  // Use school ID from environment (one deployment per school)
  // Program slug from URL determines which program to show
  const response = await fetch(
    `${API_BASE_URL}/api/public/school/${SCHOOL_ID}/landing/${params.program}`,
    { cache: "no-store" }
  );

  if (!response.ok) {
    return (
      <main>
        <div className="form-card">
          <h2>Landing page not found</h2>
          <p>Check the URL or configuration.</p>
          <p style={{ fontSize: "12px", color: "#666", marginTop: "16px" }}>
            School ID: {SCHOOL_ID} | Program: {params.program}
          </p>
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

  const templateType = program.templateType || "full";
  const showFullContent = templateType === "full";

  const style = {
    "--color-primary": school.branding.colors.primary,
    "--color-secondary": school.branding.colors.secondary,
    "--color-accent": school.branding.colors.accent || "#f3d34a",
    "--color-bg": school.branding.colors.background || "#f7f4ef",
    "--color-text": school.branding.colors.text || "#1b1b1b"
  } as React.CSSProperties;

  const heroStyle = program.heroImage
    ? {
        ...style,
        backgroundImage: `linear-gradient(rgba(0, 0, 0, 0.5), rgba(0, 0, 0, 0.5)), url(${program.heroImage})`,
        backgroundSize: "cover",
        backgroundPosition: "center"
      }
    : style;

  const campusOptionsWithFallback = campusOptions.concat({
    label: "Not sure yet",
    value: "not_sure"
  });

  return (
    <main style={style}>
      <div className="container">
        {/* Hero Section */}
        <section className="brand-card" style={heroStyle}>
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

        {/* Contact Form - FIRST per user requirement */}
        <FormEngine
          schoolId={school.id}
          programId={program.id}
          consentText={school.compliance.disclaimerText}
          consentVersion={school.compliance.version}
          questionOverrides={questionOverrides}
          leadFormFields={program.leadForm?.fields}
          consentLabel={program.leadForm?.consentLabel}
          thankYou={school.thankYou}
          programOptions={programOptions}
          campusOptions={campusOptionsWithFallback}
          initialAnswers={{ program_interest: program.id }}
          ctaText={landingCopy.ctaText}
          enableQuiz={program.useQuizRouting || false}
        />

        {/* Additional Content Sections - Only shown for "full" template */}
        {showFullContent && (
          <>
            {program.highlights && program.highlights.length > 0 && (
              <HighlightsSection highlights={program.highlights} />
            )}

            {program.stats && (
              <StatsSection stats={program.stats} />
            )}

            {program.testimonials && program.testimonials.length > 0 && (
              <TestimonialsSection testimonials={program.testimonials} />
            )}

            {program.faqs && program.faqs.length > 0 && (
              <FAQSection faqs={program.faqs} />
            )}
          </>
        )}
      </div>
    </main>
  );
}
