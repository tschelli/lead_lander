import { z } from "zod";

export const ColorSchema = z.object({
  primary: z.string(),
  secondary: z.string(),
  accent: z.string().optional(),
  background: z.string().optional(),
  text: z.string().optional()
});

const LogoUrlSchema = z
  .string()
  .refine((value) => {
    if (value.startsWith("/")) return true;
    try {
      new URL(value);
      return true;
    } catch {
      return false;
    }
  }, "logoUrl must be an absolute URL or a public path starting with '/'");

export const BrandingSchema = z.object({
  logoUrl: LogoUrlSchema.optional(),
  colors: ColorSchema
});

export const ComplianceSchema = z.object({
  disclaimerText: z.string().min(1),
  version: z.string().min(1)
});

export const FooterContentSchema = z.object({
  socialLinks: z
    .object({
      facebook: z.string().optional(),
      twitter: z.string().optional(),
      linkedin: z.string().optional(),
      instagram: z.string().optional()
    })
    .optional(),
  customLinks: z
    .array(
      z.object({
        label: z.string(),
        url: z.string()
      })
    )
    .optional()
});

export const SchoolSchema = z.object({
  id: z.string().min(1),
  clientId: z.string().min(1),
  slug: z.string().min(1),
  name: z.string().min(1),
  branding: BrandingSchema,
  compliance: ComplianceSchema,
  crmConnectionId: z.string().min(1),
  footerContent: FooterContentSchema.optional()
});

export const CampusSchema = z.object({
  id: z.string().min(1),
  schoolId: z.string().min(1),
  slug: z.string().min(1),
  name: z.string().min(1),
  routingTags: z.array(z.string()).default([]),
  notifications: z
    .object({
      enabled: z.boolean().default(false),
      recipients: z.array(z.string()).default([])
    })
    .optional()
});

export const LandingCopySchema = z.object({
  headline: z.string().min(1),
  subheadline: z.string().min(1),
  body: z.string().min(1),
  ctaText: z.string().default("Get Program Info")
});

// Enhanced landing page content schemas
export const ProgramHighlightSchema = z.object({
  icon: z.string().optional(),
  text: z.string().min(1)
});

export const ProgramTestimonialSchema = z.object({
  quote: z.string().min(1),
  author: z.string().min(1),
  role: z.string().optional(),
  photo: z.string().optional()
});

export const ProgramFAQSchema = z.object({
  question: z.string().min(1),
  answer: z.string().min(1)
});

export const ProgramStatsSchema = z.object({
  placementRate: z.string().optional(),
  avgSalary: z.string().optional(),
  duration: z.string().optional(),
  graduationRate: z.string().optional()
});

export const SectionsConfigSchema = z.object({
  order: z.array(z.string()).default([
    "hero",
    "highlights",
    "stats",
    "testimonials",
    "form",
    "faqs"
  ]),
  visible: z.record(z.boolean()).default({
    hero: true,
    highlights: true,
    stats: true,
    testimonials: true,
    form: true,
    faqs: true
  })
});

export const QuestionOverrideSchema = z.object({
  id: z.string().min(1),
  hidden: z.boolean().optional(),
  label: z.string().optional(),
  options: z
    .array(
      z.object({
        label: z.string(),
        value: z.string()
      })
    )
    .optional(),
  required: z.boolean().optional(),
  showIf: z
    .object({
      questionId: z.string(),
      equals: z.union([z.string(), z.array(z.string())])
    })
    .optional()
});

export const ProgramSchema = z.object({
  id: z.string().min(1),
  schoolId: z.string().min(1),
  slug: z.string().min(1),
  name: z.string().min(1),
  availableCampuses: z.array(z.string()).optional(),
  landingCopy: LandingCopySchema,
  questionOverrides: z.array(QuestionOverrideSchema).optional(),
  // Enhanced landing page fields
  templateType: z.enum(["minimal", "full"]).default("full"),
  heroImage: z.string().optional(),
  heroBackgroundColor: z.string().optional(),
  heroBackgroundImage: z.string().optional(),
  duration: z.string().optional(),
  salaryRange: z.string().optional(),
  placementRate: z.string().optional(),
  graduationRate: z.string().optional(),
  highlights: z.array(ProgramHighlightSchema).default([]),
  testimonials: z.array(ProgramTestimonialSchema).default([]),
  faqs: z.array(ProgramFAQSchema).default([]),
  stats: ProgramStatsSchema.default({}),
  sectionsConfig: SectionsConfigSchema.default({
    order: ["hero", "highlights", "stats", "testimonials", "form", "faqs"],
    visible: {
      hero: true,
      highlights: true,
      stats: true,
      testimonials: true,
      form: true,
      faqs: true
    }
  })
});

export const LandingPageSchema = z.object({
  id: z.string().min(1),
  schoolId: z.string().min(1),
  programId: z.string().min(1),
  campusId: z.string().min(1).optional(),
  overrides: z
    .object({
      landingCopy: LandingCopySchema.optional(),
      questionOverrides: z.array(QuestionOverrideSchema).optional()
    })
    .optional(),
  notifications: z
    .object({
      enabled: z.boolean().default(false),
      recipients: z.array(z.string()).default([])
    })
    .optional()
});

export const CrmConnectionSchema = z.object({
  id: z.string().min(1),
  type: z.enum(["webhook", "generic"]),
  config: z.record(z.any()).optional()
});

export const ConfigSchema = z.object({
  schools: z.array(SchoolSchema),
  campuses: z.array(CampusSchema),
  programs: z.array(ProgramSchema),
  landingPages: z.array(LandingPageSchema),
  crmConnections: z.array(CrmConnectionSchema)
});

export type Config = z.infer<typeof ConfigSchema>;
export type School = z.infer<typeof SchoolSchema>;
export type Campus = z.infer<typeof CampusSchema>;
export type Program = z.infer<typeof ProgramSchema>;
export type LandingPage = z.infer<typeof LandingPageSchema>;
export type CrmConnection = z.infer<typeof CrmConnectionSchema>;

// Enhanced landing page types
export type ProgramHighlight = z.infer<typeof ProgramHighlightSchema>;
export type ProgramTestimonial = z.infer<typeof ProgramTestimonialSchema>;
export type ProgramFAQ = z.infer<typeof ProgramFAQSchema>;
export type ProgramStats = z.infer<typeof ProgramStatsSchema>;
export type SectionsConfig = z.infer<typeof SectionsConfigSchema>;
export type FooterContent = z.infer<typeof FooterContentSchema>;
